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

        ctx.strokeStyle = '#e2e8f0';
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
            ctx.strokeStyle = isHovered ? '#3977c5' : '#cbd5e1';
            ctx.lineWidth = isHovered ? 2.5 : 1.5;
            ctx.stroke();

            // Edge Relationship Label
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;
            ctx.font = '9px sans-serif';
            ctx.fillStyle = isHovered ? '#235187' : '#94a3b8';
            ctx.textAlign = 'center';
            ctx.fillText(edge.relationship, midX, midY - 4);
          }
        }

        // Draw Nodes
        for (const node of nodes) {
          const isSelected = selectedNode?.id === node.id;
          const isHovered = hoveredNodeRef.current?.id === node.id;

          // Node color scheme by type
          let fill = '#ffffff';
          let stroke = '#94a3b8';
          let badgeText = 'NODE';

          switch (node.type) {
            case 'DONOR':
              stroke = '#3977c5'; // Brand blue
              fill = '#eaf2fc';
              badgeText = 'DONOR';
              break;
            case 'RECIPIENT':
              stroke = '#173b66'; // Deep navy
              fill = '#eaf2fc';
              badgeText = 'RECIP';
              break;
            case 'HOSPITAL':
              stroke = '#10b981'; // Emerald
              fill = '#ecfdf5';
              badgeText = 'HOSP';
              break;
            case 'MATCH_REQUEST':
              stroke = '#f59e0b'; // Amber
              fill = '#fffbeb';
              badgeText = 'MATCH';
              break;
            case 'ALLOCATION':
              stroke = '#6366f1'; // Indigo
              fill = '#eef2ff';
              badgeText = 'ALLOC';
              break;
          }

          // Node Circle
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? '#ffffff' : fill;
          ctx.fill();

          ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : 1.5;
          ctx.strokeStyle = isSelected ? '#173b66' : stroke;
          ctx.stroke();

          // Type Tag Inside Node
          ctx.font = 'bold 8px sans-serif';
          ctx.fillStyle = stroke;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badgeText, node.x, node.y - 1);

          // Node Label Outside
          ctx.font = '11px sans-serif';
          ctx.fillStyle = '#334155';
          ctx.fillText(node.label, node.x, node.y + node.radius + 14);

          // ID subtitle
          ctx.font = '9px sans-serif';
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-3 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-navy">
              Relational Graph Visualizer · Match {matchId}
            </h1>
            <span className="text-[11px] text-brand-ink bg-accent px-2 py-0.5 border border-accent-border rounded-md">
              Neo4j Cypher Traversal
            </span>
          </div>
          <p className="text-xs text-slate-500 font-sans mt-0.5">
            Interactive topology showing donor procurement, recipient patient, hospital affiliations, match request proposal, and allocation edges.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetView}
            className="px-2.5 py-1 text-xs bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-md font-medium"
          >
            Reset View
          </button>
          <Link
            to="/match-requests"
            className="px-3 py-1 text-xs bg-navy hover:bg-navy-dark text-white rounded-md"
          >
            Back to Queue
          </Link>
        </div>
      </div>

      <ErrorMessage error={error} onRetry={() => matchId && fetchGraph(matchId)} />

      {isLoading ? (
        <LoadingState message="Extracting Neo4j nodes and edges for match subgraph..." rows={5} />
      ) : (
        <div className="flex-1 flex overflow-hidden border border-slate-200 rounded-lg bg-slate-50 relative">
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
            <div className="absolute top-3 left-3 bg-white/95 border border-slate-200 shadow-xs p-3 rounded-md text-[11px] space-y-1.5 pointer-events-none">
              <div className="text-slate-500 font-medium text-[11px] pb-1 border-b border-slate-100">
                Legend
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-brand"></span>
                <span className="text-slate-800">Donor Organ Node</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-navy"></span>
                <span className="text-slate-800">Recipient Patient Node</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="text-slate-800">Hospital Center Node</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <span className="text-slate-800">Match Request Proposal</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                <span className="text-slate-800">Allocation Audit Node</span>
              </div>
              <div className="text-[11px] text-slate-500 pt-1">
                Drag to move · Scroll to zoom
              </div>
            </div>
          </div>

          {/* Node Inspection Drawer */}
          <div className="w-80 bg-white border-l border-slate-200 p-4 overflow-y-auto space-y-4 shrink-0">
            <div className="border-b border-slate-200 pb-2">
              <div className="text-[11px] font-medium text-slate-500">
                Graph Inspector
              </div>
              <div className="text-xs font-semibold text-slate-900 mt-0.5 truncate">
                {selectedNode ? selectedNode.label : 'Select a node'}
              </div>
            </div>

            {selectedNode ? (
              <div className="space-y-3 text-xs ">
                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                  <span className="text-[11px] font-medium text-slate-500 block">Node ID</span>
                  <span className="text-brand-ink font-medium">{selectedNode.id}</span>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                  <span className="text-[11px] font-medium text-slate-500 block">Node Label</span>
                  <span className="text-slate-900 font-semibold">{selectedNode.label}</span>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                  <span className="text-[11px] font-medium text-slate-500 block">Class Type</span>
                  <span className="text-slate-800 font-medium">{selectedNode.type}</span>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-slate-500 block">Property Attributes</span>
                  <div className="bg-slate-50 p-2.5 rounded-md border border-slate-100 space-y-1.5 text-[11px]">
                    {Object.entries(selectedNode.properties || {}).map(([key, val]) => (
                      <div key={key} className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-500">{key}:</span>
                        <span className="text-slate-800 font-medium truncate max-w-[140px]">
                          {String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedNode(null)}
                  className="w-full py-1.5 text-xs bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-md"
                >
                  Deselect Node
                </button>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-500">
                Click on any node in the canvas to inspect its Neo4j properties and relationships.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
