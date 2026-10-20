
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { MatchGraphData, GraphNode, GraphEdge } from '../types';
import { LoadingState } from '../components/LoadingState';
import { ErrorMessage } from '../components/ErrorMessage';

type PositionedNode = GraphNode & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};

type Transform = {
  x: number;
  y: number;
  k: number;
};

const COLORS: Record<
  string,
  { fill: string; stroke: string; tag: string }
> = {
  DONOR: {
    fill: '#eaf2fc',
    stroke: '#3977c5',
    tag: 'DONOR',
  },
  RECIPIENT: {
    fill: '#eaf2fc',
    stroke: '#173b66',
    tag: 'RECIP',
  },
  HOSPITAL: {
    fill: '#ecfdf5',
    stroke: '#10b981',
    tag: 'HOSP',
  },
  MATCH_REQUEST: {
    fill: '#fffbeb',
    stroke: '#f59e0b',
    tag: 'MATCH',
  },
  ALLOCATION: {
    fill: '#eef2ff',
    stroke: '#6366f1',
    tag: 'ALLOC',
  },
};

export const GraphView: React.FC = () => {
  const { matchId } = useParams<{ matchId: string }>();

  const [graphData, setGraphData] = useState<MatchGraphData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | ApiError | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodesRef = useRef<PositionedNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const nodeMapRef = useRef<Map<string, PositionedNode>>(new Map());

  const selectedNodeRef = useRef<GraphNode | null>(null);
  const hoveredNodeRef = useRef<PositionedNode | null>(null);

  const transformRef = useRef<Transform>({ x: 0, y: 0, k: 1 });
  const draggedNodeRef = useRef<PositionedNode | null>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);

  // Fetch graph data.
  const fetchGraph = useCallback(async () => {
    if (!matchId) {
      setError(new Error('Missing match ID in the URL.'));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setGraphData(null);
    setSelectedNode(null);

    try {
      const data = await api.get<MatchGraphData>(
        `/graph/match/${encodeURIComponent(matchId)}`
      );

      console.log('Graph API response:', data);

      if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
        throw new Error(
          'Invalid graph response: expected nodes and edges arrays.'
        );
      }

      console.log('Graph nodes:', data.nodes.length);
      console.log('Graph edges:', data.edges.length);

      setGraphData(data);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error('Failed to fetch graph data.')
      );
    } finally {
      setIsLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void fetchGraph();
  }, [fetchGraph]);

  // Prepare the canvas dimensions. The canvas is always mounted,
  // including while data is loading.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);

      if (rect.width <= 0 || rect.height <= 0) {
        setCanvasReady(false);
        return;
      }

      const pixelWidth = Math.round(rect.width * dpr);
      const pixelHeight = Math.round(rect.height * dpr);

      if (
        canvas.width !== pixelWidth ||
        canvas.height !== pixelHeight
      ) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      setCanvasReady(true);
    };

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas);

    resizeCanvas();

    return () => observer.disconnect();
  }, []);

  // Initialize node positions and the force simulation.
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!graphData || !canvasReady || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    if (width <= 0 || height <= 0) return;

    const validNodes = graphData.nodes.filter(
      (node) =>
        node &&
        node.id != null &&
        typeof node.id === 'string'
    );

    // Build the nodes before attempting to draw any edges.
    const positionedNodes: PositionedNode[] = validNodes.map(
      (node, index) => {
        const angle =
          (index / Math.max(validNodes.length, 1)) * Math.PI * 2;

        const radius = Math.min(width, height) * 0.27;

        return {
          ...node,
          x: width / 2 + radius * Math.cos(angle),
          y: height / 2 + radius * Math.sin(angle),
          vx: 0,
          vy: 0,
          radius:
            node.type === 'MATCH_REQUEST' || node.type === 'ALLOCATION'
              ? 24
              : 20,
        };
      }
    );

    nodesRef.current = positionedNodes;

    nodeMapRef.current = new Map(
      positionedNodes.map((node) => [node.id, node])
    );

    const validNodeIds = new Set(
      positionedNodes.map((node) => node.id)
    );

    // Only draw relationships whose endpoints exist.
    edgesRef.current = graphData.edges.filter(
      (edge) =>
        edge &&
        validNodeIds.has(edge.source) &&
        validNodeIds.has(edge.target)
    );

    console.log('Canvas initialized:', {
      width,
      height,
      pixelRatio: dpr,
      nodesCreated: nodesRef.current.length,
      edgesCreated: edgesRef.current.length,
    });

    transformRef.current = { x: 0, y: 0, k: 1 };
    hoveredNodeRef.current = null;
    draggedNodeRef.current = null;
    isPanningRef.current = false;

    let animationFrameId = 0;
    let disposed = false;

    const render = () => {
      if (disposed) return;

      const ctx = canvas.getContext('2d');

      if (!ctx) {
        console.error('Unable to obtain 2D canvas context.');
        return;
      }

      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const nodeMap = nodeMapRef.current;

      // Repel nearby nodes.
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          if (dist < 200) {
            const force = (200 - dist) / (dist * 30);
            const fx = dx * force;
            const fy = dy * force;

            if (draggedNodeRef.current !== a) {
              a.vx -= fx;
              a.vy -= fy;
            }

            if (draggedNodeRef.current !== b) {
              b.vx += fx;
              b.vy += fy;
            }
          }
        }
      }

      // Pull connected nodes together.
      for (const edge of edges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);

        if (!source || !target) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 150) * 0.006;

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (draggedNodeRef.current !== source) {
          source.vx += fx;
          source.vy += fy;
        }

        if (draggedNodeRef.current !== target) {
          target.vx -= fx;
          target.vy -= fy;
        }
      }

      // Keep the graph centered and damp movement.
      for (const node of nodes) {
        if (draggedNodeRef.current === node) continue;

        node.vx += (width / 2 - node.x) * 0.002;
        node.vy += (height / 2 - node.y) * 0.002;

        node.vx *= 0.86;
        node.vy *= 0.86;

        node.x += node.vx;
        node.y += node.vy;
      }

      // Draw in CSS-pixel coordinates regardless of display pixel ratio.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, width, height);

      const { x, y, k } = transformRef.current;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(k, k);

      // Background grid.
      ctx.strokeStyle = '#e8edf4';
      ctx.lineWidth = 1;

      const gridSize = 40;
      const startX = Math.floor(-x / k / gridSize) * gridSize - gridSize;
      const startY = Math.floor(-y / k / gridSize) * gridSize - gridSize;
      const endX = startX + width / k + gridSize * 3;
      const endY = startY + height / k + gridSize * 3;

      for (let gx = startX; gx < endX; gx += gridSize) {
        ctx.beginPath();
        ctx.moveTo(gx, startY);
        ctx.lineTo(gx, endY);
        ctx.stroke();
      }

      for (let gy = startY; gy < endY; gy += gridSize) {
        ctx.beginPath();
        ctx.moveTo(startX, gy);
        ctx.lineTo(endX, gy);
        ctx.stroke();
      }

      // Draw edges first so they appear behind the nodes.
      for (const edge of edges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);

        if (!source || !target) continue;

        const isHovered =
          hoveredNodeRef.current?.id === source.id ||
          hoveredNodeRef.current?.id === target.id;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = isHovered ? '#3977c5' : '#b9c7d8';
        ctx.lineWidth = isHovered ? 2.5 : 1.5;
        ctx.stroke();

        // Relationship label.
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;

        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';

        const label = edge.relationship || 'RELATED';

        const textWidth = ctx.measureText(label).width;

        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(
          midX - textWidth / 2 - 3,
          midY - 15,
          textWidth + 6,
          15
        );

        ctx.fillStyle = isHovered ? '#235187' : '#64748b';
        ctx.fillText(label, midX, midY - 4);
      }

      // Draw nodes.
      for (const node of nodes) {
        const style = COLORS[node.type] || {
          fill: '#ffffff',
          stroke: '#64748b',
          tag: 'NODE',
        };

        const isSelected =
          selectedNodeRef.current?.id === node.id;

        const isHovered =
          hoveredNodeRef.current?.id === node.id;

        // Node circle.
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#ffffff' : style.fill;
        ctx.fill();

        ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : 1.5;
        ctx.strokeStyle = isSelected ? '#173b66' : style.stroke;
        ctx.stroke();

        // Node type.
        ctx.fillStyle = style.stroke;
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(style.tag, node.x, node.y);

        // Node label.
        const label = String(node.label || node.id);
        const maxLabelWidth = Math.max(70, width * 0.3);

        ctx.font = '11px sans-serif';
        ctx.textBaseline = 'alphabetic';

        const displayLabel =
          ctx.measureText(label).width > maxLabelWidth
            ? label.slice(0, 24) + '…'
            : label;

        ctx.fillStyle = '#334155';
        ctx.fillText(
          displayLabel,
          node.x,
          node.y + node.radius + 15
        );

        // Node ID.
        ctx.font = '9px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText(
          node.id,
          node.x,
          node.y + node.radius + 27
        );
      }

      // Empty graph diagnostic.
      if (nodes.length === 0) {
        ctx.fillStyle = '#475569';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          'No valid graph nodes were returned.',
          width / 2,
          height / 2
        );
      }

      ctx.restore();

      if (!disposed) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    // Draw the first frame immediately.
    render();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrameId);
    };
  }, [graphData, canvasReady]);

  // Convert mouse coordinates into canvas coordinates.
  const getCanvasCoords = (
    e: React.MouseEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return { x: 0, y: 0, rawX: 0, rawY: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    const { x, y, k } = transformRef.current;

    return {
      x: (rawX - x) / k,
      y: (rawY - y) / k,
      rawX,
      rawY,
    };
  };

  const handleMouseDown = (
    e: React.MouseEvent<HTMLCanvasElement>
  ) => {
    if (e.button !== 0) return;

    const { x, y, rawX, rawY } = getCanvasCoords(e);

    const clicked = [...nodesRef.current]
      .reverse()
      .find((node) => {
        const dx = node.x - x;
        const dy = node.y - y;

        return Math.sqrt(dx * dx + dy * dy) <= node.radius + 5;
      });

    if (clicked) {
      draggedNodeRef.current = clicked;
      selectedNodeRef.current = clicked;
      setSelectedNode(clicked);
    } else {
      isPanningRef.current = true;

      panStartRef.current = {
        x: rawX - transformRef.current.x,
        y: rawY - transformRef.current.y,
      };
    }
  };

  const handleMouseMove = (
    e: React.MouseEvent<HTMLCanvasElement>
  ) => {
    const { x, y, rawX, rawY } = getCanvasCoords(e);

    if (draggedNodeRef.current) {
      draggedNodeRef.current.x = x;
      draggedNodeRef.current.y = y;
      draggedNodeRef.current.vx = 0;
      draggedNodeRef.current.vy = 0;
      return;
    }

    if (isPanningRef.current) {
      transformRef.current.x = rawX - panStartRef.current.x;
      transformRef.current.y = rawY - panStartRef.current.y;
      return;
    }

    hoveredNodeRef.current =
      nodesRef.current.find((node) => {
        const dx = node.x - x;
        const dy = node.y - y;

        return Math.sqrt(dx * dx + dy * dy) <= node.radius + 5;
      }) || null;
  };

  const handleMouseUp = () => {
    draggedNodeRef.current = null;
    isPanningRef.current = false;
  };

  const handleWheel = (
    e: React.WheelEvent<HTMLCanvasElement>
  ) => {
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const transform = transformRef.current;
    const oldK = transform.k;

    const newK = Math.max(
      0.4,
      Math.min(3, oldK * (e.deltaY < 0 ? 1.1 : 0.9))
    );

    // Zoom around the mouse pointer.
    transform.x = mouseX - (mouseX - transform.x) * (newK / oldK);
    transform.y = mouseY - (mouseY - transform.y) * (newK / oldK);
    transform.k = newK;
  };

  const resetView = () => {
    transformRef.current = { x: 0, y: 0, k: 1 };

    // Restore the original circular node arrangement.
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const nodes = nodesRef.current;
    const radius = Math.min(rect.width, rect.height) * 0.27;

    nodes.forEach((node, index) => {
      const angle =
        (index / Math.max(nodes.length, 1)) * Math.PI * 2;

      node.x = rect.width / 2 + radius * Math.cos(angle);
      node.y = rect.height / 2 + radius * Math.sin(angle);
      node.vx = 0;
      node.vy = 0;
    });
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-100px)] max-w-7xl flex-col space-y-4">
      {/* Header */}
      <div className="flex shrink-0 flex-col justify-between gap-4 border-b border-slate-200 pb-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-navy">
              Relational Graph Visualizer · Match {matchId}
            </h1>

            <span className="rounded-md border border-accent-border bg-accent px-2 py-0.5 text-[11px] text-brand-ink">
              Neo4j Cypher Traversal
            </span>
          </div>

          <p className="mt-0.5 text-xs text-slate-500">
            Interactive graph of donors, recipients, hospitals,
            match requests, and allocations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetView}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Reset View
          </button>

          <button
            type="button"
            onClick={() => void fetchGraph()}
            disabled={isLoading}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Refresh Graph
          </button>

          <Link
            to="/match-requests"
            className="rounded-md bg-navy px-3 py-1 text-xs text-white hover:bg-navy-dark"
          >
            Back to Queue
          </Link>
        </div>
      </div>

      {error && (
        <ErrorMessage
          error={error}
          onRetry={() => void fetchGraph()}
        />
      )}

      {/* Keep the canvas mounted while loading. */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {/* Canvas area */}
        <div className="relative min-h-0 min-w-0 flex-1">
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              handleMouseUp();
              hoveredNodeRef.current = null;
            }}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
            className="block h-full w-full cursor-grab touch-none active:cursor-grabbing"
            style={{ minWidth: 0, minHeight: 0 }}
          />

          {/* Legend */}
          <div className="pointer-events-none absolute left-3 top-3 space-y-1.5 rounded-md border border-slate-200 bg-white/95 p-3 text-[11px] shadow-sm">
            <div className="border-b border-slate-100 pb-1 font-medium text-slate-500">
              Legend
            </div>

            {[
              ['#3977c5', 'Donor Organ Node'],
              ['#173b66', 'Recipient Patient Node'],
              ['#10b981', 'Hospital Center Node'],
              ['#f59e0b', 'Match Request Proposal'],
              ['#6366f1', 'Allocation Audit Node'],
            ].map(([color, label]) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-slate-800">{label}</span>
              </div>
            ))}

            <div className="pt-1 text-slate-500">
              Drag nodes · Drag empty space to pan · Scroll to zoom
            </div>

            {graphData && (
              <div className="border-t border-slate-100 pt-1 font-medium text-slate-600">
                {nodesRef.current.length || graphData.nodes.length} nodes ·{' '}
                {edgesRef.current.length || graphData.edges.length} edges
              </div>
            )}
          </div>

          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
              <LoadingState
                message="Extracting Neo4j nodes and edges..."
                rows={3}
              />
            </div>
          )}

          {!isLoading && !error && graphData?.nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-lg border border-slate-200 bg-white p-5 text-center shadow-sm">
                <p className="font-medium text-slate-800">
                  No graph nodes found
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  The API returned an empty nodes array.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Inspector */}
        <aside className="z-20 w-64 shrink-0 space-y-4 overflow-y-auto border-l border-slate-200 bg-white p-4 sm:w-80">
          <div className="border-b border-slate-200 pb-2">
            <div className="text-[11px] font-medium text-slate-500">
              Graph Inspector
            </div>

            <div className="mt-0.5 truncate text-xs font-semibold text-slate-900">
              {selectedNode?.label || 'Select a node'}
            </div>
          </div>

          {selectedNode ? (
            <div className="space-y-3 text-xs">
              <div className="rounded-md border border-slate-100 bg-slate-50 p-2.5">
                <span className="block text-[11px] font-medium text-slate-500">
                  Node ID
                </span>
                <span className="break-all font-medium text-brand-ink">
                  {selectedNode.id}
                </span>
              </div>

              <div className="rounded-md border border-slate-100 bg-slate-50 p-2.5">
                <span className="block text-[11px] font-medium text-slate-500">
                  Node Label
                </span>
                <span className="font-semibold text-slate-900">
                  {selectedNode.label}
                </span>
              </div>

              <div className="rounded-md border border-slate-100 bg-slate-50 p-2.5">
                <span className="block text-[11px] font-medium text-slate-500">
                  Class Type
                </span>
                <span className="font-medium text-slate-800">
                  {selectedNode.type}
                </span>
              </div>

              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500">
                  Property Attributes
                </span>

                <div className="space-y-1.5 rounded-md border border-slate-100 bg-slate-50 p-2.5">
                  {Object.entries(selectedNode.properties || {}).map(
                    ([key, value]) => (
                      <div
                        key={key}
                        className="flex items-start justify-between gap-2 border-b border-slate-100 pb-1"
                      >
                        <span className="shrink-0 text-slate-500">
                          {key}:
                        </span>

                        <span className="break-all text-right font-medium text-slate-800">
                          {typeof value === 'object' && value !== null
                            ? JSON.stringify(value)
                            : String(value)}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="w-full rounded-md border border-slate-300 bg-white py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                Deselect Node
              </button>
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-slate-500">
              Click a node to inspect its properties.
            </div>
          )}

          {graphData && (
            <div className="space-y-1 border-t border-slate-200 pt-3 text-[11px] text-slate-500">
              <div>Match ID: {graphData.match_id}</div>
              <div>API nodes: {graphData.nodes.length}</div>
              <div>API edges: {graphData.edges.length}</div>
              <div>Canvas: {canvasReady ? 'Ready' : 'Waiting'}</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
