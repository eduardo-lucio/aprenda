import React, { useState, useRef } from 'react';
import { ConceptNode } from '../../shared/types';
import { NodeDetailModal } from './NodeDetailModal';
import { ZoomIn, ZoomOut, RotateCcw, Hand } from 'lucide-react';

interface KnowledgeGraphProps {
  nodes: ConceptNode[];
  activeNodeId?: string;
  onNodeSelect?: (id: string) => void;
  onStartSocratic?: (nodeId: string) => void;
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  nodes,
  activeNodeId,
  onNodeSelect,
  onStartSocratic,
}) => {
  const [selectedNode, setSelectedNode] = useState<ConceptNode | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Group nodes by levels 1 to 4
  const levels = [1, 2, 3, 4];
  const nodesByLevel: Record<number, ConceptNode[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
    };

  for (const n of nodes) {
    const lvl = n.level || 2;
    if (!nodesByLevel[lvl]) nodesByLevel[lvl] = [];
    nodesByLevel[lvl].push(n);
  }

  // Calculate coordinates for SVG layout
  // Column width 260px, card width 200px (x: -100 to +100), height 56px (y: -28 to +28)
  const colWidth = 260;
  const colStartX = 140;
  const rowHeight = 95;
  const rowStartY = 70;

  const nodeCoords: Record<string, { x: number; y: number }> = {};

  levels.forEach((lvl, colIdx) => {
    const colNodes = nodesByLevel[lvl] || [];
    colNodes.forEach((node, rowIdx) => {
      nodeCoords[node.id] = {
        x: colStartX + colIdx * colWidth,
        y: rowStartY + rowIdx * rowHeight,
      };
    });
  });

  const getNodeColor = (status: ConceptNode['status']) => {
    switch (status) {
      case 'mastered':
        return {
          stroke: '#22c55e',
          fill: '#052e16',
          text: 'text-emerald-400',
          dot: '#22c55e',
          pulse: false,
        };
      case 'false_positive':
        return {
          stroke: '#facc15',
          fill: '#451a03',
          text: 'text-amber-300',
          dot: '#facc15',
          pulse: true,
        };
      case 'blind_spot':
        return {
          stroke: '#ef4444',
          fill: '#450a0a',
          text: 'text-red-400',
          dot: '#ef4444',
          pulse: false,
        };
      case 'frontier':
        return {
          stroke: '#3b82f6',
          fill: '#172554',
          text: 'text-blue-400',
          dot: '#3b82f6',
          pulse: false,
        };
      default:
        return {
          stroke: '#334155',
          fill: '#0f172a',
          text: 'text-gray-400',
          dot: '#64748b',
          pulse: false,
        };
    }
  };

  const handleNodeClick = (node: ConceptNode) => {
    setSelectedNode(node);
    if (onNodeSelect) {
      onNodeSelect(node.id);
    }
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 0) {
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleZoomIn = () => setScale((prev) => Math.min(1.8, +(prev + 0.15).toFixed(2)));
  const handleZoomOut = () => setScale((prev) => Math.max(0.6, +(prev - 0.15).toFixed(2)));
  const handleResetZoom = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#0a0a0a] text-gray-200 select-none relative overflow-hidden">
      {/* Legend & Controls Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#1e293b] px-4 py-2 text-xs bg-[#111111]/90 z-10 backdrop-blur-sm">
        <span className="font-semibold uppercase tracking-wider text-[11px] text-gray-300">
          Grafo de Dependências (DAG Camada 3 OSI)
        </span>

        {/* Legend Badges */}
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm" />
            <span className="text-gray-300">Domínio</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse shadow-sm" />
            <span className="text-amber-300 font-medium">Falso Positivo</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-sm" />
            <span className="text-red-400">Ponto Cego</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shadow-sm" />
            <span className="text-blue-400">Fronteira</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-gray-600 shadow-sm" />
            <span className="text-gray-400">Não Testado</span>
          </span>
        </div>
      </div>

      {/* Floating Zoom & Pan Controls */}
      <div className="absolute right-4 top-14 z-20 flex items-center space-x-1 rounded-lg border border-[#1e293b] bg-[#111111]/90 p-1 shadow-lg backdrop-blur-sm">
        <button
          onClick={handleZoomIn}
          title="Aumentar Zoom"
          className="rounded p-1.5 text-gray-400 hover:bg-[#1e293b] hover:text-white transition-colors"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={handleZoomOut}
          title="Diminuir Zoom"
          className="rounded p-1.5 text-gray-400 hover:bg-[#1e293b] hover:text-white transition-colors"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="px-1.5 font-mono text-[10px] text-gray-400">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={handleResetZoom}
          title="Resetar Zoom (100%)"
          className="rounded p-1.5 text-gray-400 hover:bg-[#1e293b] hover:text-white transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Interactive SVG Canvas */}
      <div className="relative flex-1 cursor-grab active:cursor-grabbing overflow-hidden">
        <svg
          className="h-full w-full select-none"
          viewBox="0 0 1150 560"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <defs>
            {/* Background Grid Pattern */}
            <pattern id="dag-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="#334155" opacity="0.3" />
            </pattern>

            {/* Directional Arrow Marker */}
            <marker
              id="dag-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0.5, 7 3.5, 0 6.5" fill="#64748b" />
            </marker>

            {/* Active/Frontier Arrow Marker */}
            <marker
              id="dag-arrow-active"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0.5, 7 3.5, 0 6.5" fill="#3b82f6" />
            </marker>
          </defs>

          {/* Grid Background */}
          <rect width="100%" height="100%" fill="url(#dag-grid)" />

          {/* Main Zoomed & Panned Group */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
            {/* Level Column Headers */}
            <text x={colStartX} y={32} fill="#64748b" fontSize="11" fontWeight="700" textAnchor="middle" letterSpacing="0.05em">
              NÍVEL 1: FÍSICA & ENLACE
            </text>
            <text x={colStartX + colWidth} y={32} fill="#64748b" fontSize="11" fontWeight="700" textAnchor="middle" letterSpacing="0.05em">
              NÍVEL 2: PACOTES & REDES
            </text>
            <text x={colStartX + colWidth * 2} y={32} fill="#64748b" fontSize="11" fontWeight="700" textAnchor="middle" letterSpacing="0.05em">
              NÍVEL 3: TTL, CIDR & TABELAS
            </text>
            <text x={colStartX + colWidth * 3} y={32} fill="#64748b" fontSize="11" fontWeight="700" textAnchor="middle" letterSpacing="0.05em">
              NÍVEL 4: ROTEAMENTO AVANÇADO
            </text>

            {/* Dependency Edges (Intra & Inter-level routing) */}
            <g className="edges">
              {nodes.map((node) => {
                const target = nodeCoords[node.id];
                if (!target) return null;

                return node.prerequisites.map((prereqId) => {
                  const source = nodeCoords[prereqId];
                  if (!source) return null;

                  let pathData = '';
                  const cardHalfW = 100;
                  const cardHalfH = 28;

                  if (Math.abs(source.x - target.x) < 10) {
                    // Intra-level edge (same column): Vertical routing
                    if (source.y < target.y) {
                      // Downward
                      const startX = source.x;
                      const startY = source.y + cardHalfH;
                      const endX = target.x;
                      const endY = target.y - cardHalfH;
                      const dy = endY - startY;
                      pathData = `M ${startX} ${startY} C ${startX} ${startY + dy * 0.4}, ${endX} ${endY - dy * 0.4}, ${endX} ${endY}`;
                    } else {
                      // Upward
                      const startX = source.x;
                      const startY = source.y - cardHalfH;
                      const endX = target.x;
                      const endY = target.y + cardHalfH;
                      const dy = startY - endY;
                      pathData = `M ${startX} ${startY} C ${startX} ${startY - dy * 0.4}, ${endX} ${endY + dy * 0.4}, ${endX} ${endY}`;
                    }
                  } else if (source.x < target.x) {
                    // Inter-level edge: Left to right
                    const startX = source.x + cardHalfW;
                    const startY = source.y;
                    const endX = target.x - cardHalfW;
                    const endY = target.y;
                    const dx = endX - startX;
                    pathData = `M ${startX} ${startY} C ${startX + dx * 0.45} ${startY}, ${endX - dx * 0.45} ${endY}, ${endX} ${endY}`;
                  } else {
                    // Right to left (fallback)
                    const startX = source.x - cardHalfW;
                    const startY = source.y;
                    const endX = target.x + cardHalfW;
                    const endY = target.y;
                    const dx = startX - endX;
                    pathData = `M ${startX} ${startY} C ${startX - dx * 0.45} ${startY}, ${endX + dx * 0.45} ${endY}, ${endX} ${endY}`;
                  }

                  const isEdgeActive = node.status === 'frontier' || node.status === 'false_positive';

                  return (
                    <path
                      key={`${prereqId}->${node.id}`}
                      d={pathData}
                      fill="none"
                      stroke={isEdgeActive ? '#3b82f6' : '#475569'}
                      strokeWidth={isEdgeActive ? '2' : '1.5'}
                      strokeDasharray={isEdgeActive ? 'none' : '4 2'}
                      strokeOpacity={isEdgeActive ? '0.85' : '0.5'}
                      markerEnd={isEdgeActive ? 'url(#dag-arrow-active)' : 'url(#dag-arrow)'}
                    />
                  );
                });
              })}
            </g>

            {/* Nodes */}
            {nodes.map((node) => {
              const coord = nodeCoords[node.id];
              if (!coord) return null;

              const color = getNodeColor(node.status);
              const isActive = node.id === activeNodeId;

              return (
                <g
                  key={node.id}
                  onClick={() => handleNodeClick(node)}
                  className="cursor-pointer transition-transform hover:opacity-95"
                  transform={`translate(${coord.x}, ${coord.y})`}
                  data-testid={`node-${node.id}`}
                  role="button"
                  tabIndex={0}
                >
                  <title>{node.title} ({node.status})</title>

                  {/* Node Box (Width 200px, Height 56px) */}
                  <rect
                    x="-100"
                    y="-28"
                    width="200"
                    height="56"
                    rx="8"
                    fill={color.fill}
                    stroke={color.stroke}
                    strokeWidth={isActive ? '2.5' : '1.5'}
                    className={color.pulse ? 'animate-pulse' : ''}
                  />

                  {/* Status Indicator Dot */}
                  <circle cx="-88" cy="0" r="4.5" fill={color.dot} />

                  {/* Title text formatted with native SVG textLength constraint */}
                  <text
                    x="-76"
                    y="2"
                    fill="#f8fafc"
                    fontSize={node.title.length > 26 ? '8.5' : '9.5'}
                    fontWeight="600"
                    fontFamily="Inter, system-ui, sans-serif"
                    {...(node.title.length > 26
                      ? { textLength: 165, lengthAdjust: 'spacingAndGlyphs' }
                      : {})}
                  >
                    {node.title}
                  </text>

                  {/* Status Label */}
                  <text
                    x="-76"
                    y="21"
                    fill={color.stroke}
                    fontSize="8"
                    fontWeight="600"
                    fontFamily="monospace"
                  >
                    {node.status.toUpperCase()}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Node Detail Modal / Popover */}
      <NodeDetailModal
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        onStartSocratic={onStartSocratic}
      />
    </div>
  );
};
