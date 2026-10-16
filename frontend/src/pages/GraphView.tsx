import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { MatchGraphData, GraphNode, GraphEdge } from '../types';
import { LoadingState } from '../components/LoadingState';
import { ErrorMessage } from '../components/ErrorMessage';

export const GraphView: React.FC = () => {
  const { matchId } = useParams<{ matchId: string }>();
  const [graphData, setGraphData] = useState<MatchGraphData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | ApiError | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transformRef = useRef<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 });
  const nodesRef = useRef<(GraphNode & { x: number; y: number; vx: number; vy: number; radius: number })[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const draggedNodeRef = useRef<any>(null);
  const hoveredNodeRef = useRef<any>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  const fetchGraph = async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<MatchGraphData>(`/graph/match/${id}`);
      setGraphData(data);
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (matchId) {
      fetchGraph(matchId);
    }
  }, [matchId]);

  // Initialize Canvas physics when graph data is loaded
  useEffect(() => {
    if (!graphData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const width = canvas.width || 800;
    const height = canvas.height || 600;

    // Distribute nodes in a circle initially
    const count = graphData.nodes.length;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.32;

    nodesRef.current = graphData.nodes.map((n, i) => {
      const angle = (i / count) * 2 * Math.PI;
      return {
        ...n,
        x: cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 40,
        y: cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
        radius: n.type === 'MATCH_REQUEST' || n.type === 'ALLOCATION' ? 24 : 20,
      };
    });

    edgesRef.current = graphData.edges;
    transformRef.current = { x: 0, y: 0, k: 1 };

    let animationFrameId: number;

    const runPhysicsAndRender = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;

      // 1. Force simulation step
      // Repulsion between nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 260) {
            const force = (260 - dist) / (dist * 18);
            const fx = dx * force;
            const fy = dy * force;
            if (draggedNodeRef.current !== nodes[i]) {
              nodes[i].vx -= fx;
              nodes[i].vy -= fy;
            }
            if (draggedNodeRef.current !== nodes[j]) {
              nodes[j].vx += fx;
              nodes[j].vy += fy;
            }
          }
        }
      }

      // Spring attraction along edges
      for (const edge of edges) {
        const source = nodes.find((n) => n.id === edge.source);
        const target = nodes.find((n) => n.id === edge.target);
        if (source && target) {
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const targetDist = 170;
          const force = (dist - targetDist) * 0.008;
          const fx = dx * force;
          const fy = dy * force;
          if (draggedNodeRef.current !== source) {
            source.vx += fx;
            source.vy += fy;
          }
          if (draggedNodeRef.current !== target) {
            target.vx -= fx;
            target.vy -= fy;
          }
        }
      }

      // Center gravity
      for (const node of nodes) {
        if (draggedNodeRef.current !== node) {
          node.vx += (cx - node.x) * 0.003;
          node.vy += (cy - node.y) * 0.003;
          node.vx *= 0.88; // friction
          node.vy *= 0.88;
          node.x += node.vx;
          node.y += node.vy;
        }
      }

      // 2. Render Frame
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.clearRect(0, 0, width, height);

        // Apply Pan & Zoom
        const { x, y, k } = transformRef.current;
        ctx.translate(x, y);
        ctx.scale(k, k);

        // Draw subtle grid pattern
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 1;
        const gridSize = 40;
        for (let gx = -width; gx < width * 2; gx += gridSize) {
          ctx.beginPath();
          ctx.moveTo(gx, -height);
          ctx.lineTo(gx, height * 2);
          ctx.stroke();
        }
        for (let gy = -height; gy < height * 2; gy += gridSize) {
          ctx.beginPath();
          ctx.moveTo(-width, gy);
          ctx.lineTo(width * 2, gy);
          ctx.stroke();
        }

        // Draw Edges
        for (const edge of edges) {
          const source = nodes.find((n) => n.id === edge.source);
          const target = nodes.find((n) => n.id === edge.target);
          if (source && target) {
            const isHovered =
              hoveredNodeRef.current &&
              (hoveredNodeRef.current.id === source.id || hoveredNodeRef.current.id === target.id);

            ctx.beginPath();
            ctx.moveTo(source.x, source.y);
            ctx.lineTo(target.x, target.y);
            ctx.strokeStyle = isHovered ? '#38bdf8' : '#334155';
            ctx.lineWidth = isHovered ? 2.5 : 1.5;
            ctx.stroke();

            // Edge Relationship Label
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;
            ctx.font = '9px monospace';
            ctx.fillStyle = isHovered ? '#38bdf8' : '#64748b';
            ctx.textAlign = 'center';
            ctx.fillText(edge.relationship, midX, midY - 4);
          }
        }

        // Draw Nodes
        for (const node of nodes) {
          const isSelected = selectedNode?.id === node.id;
          const isHovered = hoveredNodeRef.current?.id === node.id;

          // Node color scheme by type
          let fill = '#0f172a';
          let stroke = '#64748b';
          let badgeText = 'NODE';

          switch (node.type) {
            case 'DONOR':
              stroke = '#38bdf8'; // Cyan
              fill = '#082f49';
              badgeText = 'DONOR';
              break;
            case 'RECIPIENT':
              stroke = '#f8fafc'; // Pure white
              fill = '#1e293b';
              badgeText = 'RECIP';
              break;
            case 'HOSPITAL':
              stroke = '#34d399'; // Emerald
              fill = '#064e3b';
              badgeText = 'HOSP';
              break;
            case 'MATCH_REQUEST':
              stroke = '#fbbf24'; // Amber
              fill = '#451a03';
              badgeText = 'MATCH';
              break;
            case 'ALLOCATION':
              stroke = '#818cf8'; // Indigo
              fill = '#1e1b4b';
              badgeText = 'ALLOC';
              break;
          }

          // Node Circle
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.fillStyle = fill;
          ctx.fill();

          ctx.lineWidth = isSelected || isHovered ? 3.5 : 2;
          ctx.strokeStyle = isSelected ? '#ffffff' : stroke;
          ctx.stroke();

          // Type Tag Inside Node
          ctx.font = 'bold 8px monospace';
          ctx.fillStyle = stroke;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badgeText, node.x, node.y - 1);

          // Node Label Outside
          ctx.font = '11px sans-serif';
          ctx.fillStyle = '#f1f5f9';
          ctx.fillText(node.label, node.x, node.y + node.radius + 14);

          // ID subtitle
          ctx.font = '9px monospace';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText(node.id, node.x, node.y + node.radius + 25);
        }

        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(runPhysicsAndRender);
    };

    animationFrameId = requestAnimationFrame(runPhysicsAndRender);

    return () => cancelAnimationFrame(animationFrameId);
  }, [graphData, selectedNode]);

  // Canvas Interactions: Dragging, Zooming, Panning, Clicking
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, rawX: 0, rawY: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const { x, y, k } = transformRef.current;
    return {
      x: (clientX - x) / k,
      y: (clientY - y) / k,
      rawX: clientX,
      rawY: clientY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y, rawX, rawY } = getCanvasCoords(e);
    // Check if clicked on a node
    const clicked = nodesRef.current.find((n) => {
      const dx = n.x - x;
      const dy = n.y - y;
      return Math.sqrt(dx * dx + dy * dy) <= n.radius + 4;
    });

    if (clicked) {
      draggedNodeRef.current = clicked;
      setSelectedNode(clicked);
    } else {
      isPanningRef.current = true;
      panStartRef.current = { x: rawX - transformRef.current.x, y: rawY - transformRef.current.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y, rawX, rawY } = getCanvasCoords(e);

    if (draggedNodeRef.current) {
      draggedNodeRef.current.x = x;
      draggedNodeRef.current.y = y;
      return;
    }

    if (isPanningRef.current) {
      transformRef.current.x = rawX - panStartRef.current.x;
      transformRef.current.y = rawY - panStartRef.current.y;
      return;
    }

    // Check hover
    const hovered = nodesRef.current.find((n) => {
      const dx = n.x - x;
      const dy = n.y - y;
      return Math.sqrt(dx * dx + dy * dy) <= n.radius + 4;
    });
    hoveredNodeRef.current = hovered || null;
  };

  const handleMouseUp = () => {
    draggedNodeRef.current = null;
    isPanningRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newK = Math.max(0.4, Math.min(3, transformRef.current.k * zoomFactor));
    transformRef.current.k = newK;
  };

  const resetView = () => {
    transformRef.current = { x: 0, y: 0, k: 1 };
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto h-[calc(100vh-100px)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-3 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-base font-mono font-bold text-white uppercase tracking-wider">
              Relational Graph Visualizer · Match {matchId}
            </h1>
            <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 border border-cyan-800 rounded-xs">
              Neo4j Cypher Traversal
            </span>
          </div>
          <p className="text-xs text-slate-400 font-sans mt-0.5">
            Interactive topology showing donor procurement, recipient patient, hospital affiliations, match request proposal, and allocation edges.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetView}
            className="px-2.5 py-1 text-xs font-mono bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-xs"
          >
            Reset View
          </button>
          <Link
            to="/match-requests"
            className="px-3 py-1 text-xs font-mono bg-cyan-700 hover:bg-cyan-600 text-white rounded-xs"
          >
            Back to Queue
          </Link>
        </div>
      </div>

      <ErrorMessage error={error} onRetry={() => matchId && fetchGraph(matchId)} />

      {isLoading ? (
        <LoadingState message="Extracting Neo4j nodes and edges for match subgraph..." rows={5} />
      ) : (
        <div className="flex-1 flex overflow-hidden border border-slate-800 rounded-xs bg-slate-950 relative">
          {/* Main 2D Force-Directed Canvas */}
          <div className="flex-1 h-full relative cursor-grab active:cursor-grabbing">
            <canvas
              ref={canvasRef}
              width={1000}
              height={700}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
              className="w-full h-full block"
            />

            {/* Canvas Legend */}
            <div className="absolute top-3 left-3 bg-slate-900/90 border border-slate-800 backdrop-blur-xs p-3 rounded-xs text-[11px] font-mono space-y-1.5 pointer-events-none">
              <div className="text-slate-400 uppercase font-bold text-[10px] pb-1 border-b border-slate-800">
                Network Schema
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
                <span className="text-slate-200">Donor Organ Node</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-white"></span>
                <span className="text-slate-200">Recipient Patient Node</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                <span className="text-slate-200">Hospital Center Node</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                <span className="text-slate-200">Match Request Proposal</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400"></span>
                <span className="text-slate-200">Allocation Audit Node</span>
              </div>
              <div className="text-[10px] text-slate-400 pt-1">
                Drag to move · Scroll to zoom
              </div>
            </div>
          </div>

          {/* Node Inspection Drawer */}
          <div className="w-80 bg-slate-900 border-l border-slate-800 p-4 overflow-y-auto space-y-4 shrink-0">
            <div className="border-b border-slate-800 pb-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                Graph Inspector
              </div>
              <div className="text-xs font-mono font-bold text-white uppercase mt-0.5">
                {selectedNode ? selectedNode.label : 'Select a node'}
              </div>
            </div>

            {selectedNode ? (
              <div className="space-y-3 text-xs font-mono">
                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                  <span className="text-[10px] text-slate-400 uppercase block">Node ID</span>
                  <span className="text-cyan-400 font-bold">{selectedNode.id}</span>
                </div>

                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                  <span className="text-[10px] text-slate-400 uppercase block">Node Label</span>
                  <span className="text-white font-semibold">{selectedNode.label}</span>
                </div>

                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                  <span className="text-[10px] text-slate-400 uppercase block">Class Type</span>
                  <span className="text-emerald-400 font-bold">{selectedNode.type}</span>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase block">Property Attributes</span>
                  <div className="bg-slate-950 p-2.5 rounded-xs border border-slate-800 space-y-1.5 text-[11px]">
                    {Object.entries(selectedNode.properties || {}).map(([key, val]) => (
                      <div key={key} className="flex justify-between border-b border-slate-900 pb-1">
                        <span className="text-slate-400 uppercase">{key}:</span>
                        <span className="text-slate-200 font-semibold truncate max-w-[140px]">
                          {String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedNode(null)}
                  className="w-full py-1.5 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xs"
                >
                  Deselect Node
                </button>
              </div>
            ) : (
              <div className="p-6 text-center text-xs font-mono text-slate-400">
                Click on any node in the canvas to inspect its Neo4j properties and relationships.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
