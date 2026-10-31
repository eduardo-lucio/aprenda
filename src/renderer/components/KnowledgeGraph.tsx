import React, { useState } from 'react';
import { ConceptNode } from '../../shared/types';
import { NodeDetailModal } from './NodeDetailModal';

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
  const colWidth = 225;
  const colStartX = 100;
  const rowHeight = 90;
  const rowStartY = 50;

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
          dot: 'bg-emerald-500',
          pulse: false,
        };
      case 'false_positive':
        return {
          stroke: '#facc15',
          fill: '#451a03',
          text: 'text-amber-300',
          dot: 'bg-amber-400',
          pulse: true,
        };
      case 'blind_spot':
        return {
          stroke: '#ef4444',
          fill: '#450a0a',
          text: 'text-red-400',
          dot: 'bg-red-500',
          pulse: false,
        };
      case 'frontier':
        return {
          stroke: '#3b82f6',
          fill: '#172554',
          text: 'text-blue-400',
          dot: 'bg-blue-500',
          pulse: false,
        };
      default:
        return {
          stroke: '#334155',
          fill: '#0f172a',
          text: 'text-gray-400',
          dot: 'bg-gray-600',
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

  return (
    <div className="flex h-full w-full flex-col bg-[#0a0a0a] text-gray-200">
      {/* Legend Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#1e293b] px-4 py-2.5 text-xs bg-[#111111]/80">
        <span className="font-semibold uppercase tracking-wider text-[11px] text-gray-300">
          Grafo de Dependências (DAG Camada 3 OSI)
        </span>

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

      {/* Interactive SVG Canvas */}
      <div className="relative flex-1 overflow-auto p-4">
        <svg
          className="h-[540px] w-[980px] select-none"
          viewBox="0 0 980 540"
        >
          {/* Level Column Headers */}
          <text x={colStartX} y={22} fill="#64748b" fontSize="11" fontWeight="600" textAnchor="middle">
            Nível 1: Enlace & Física
          </text>
          <text x={colStartX + colWidth} y={22} fill="#64748b" fontSize="11" fontWeight="600" textAnchor="middle">
            Nível 2: Pacotes & Redes
          </text>
          <text x={colStartX + colWidth * 2} y={22} fill="#64748b" fontSize="11" fontWeight="600" textAnchor="middle">
            Nível 3: TTL, CIDR & Tabelas
          </text>
          <text x={colStartX + colWidth * 3} y={22} fill="#64748b" fontSize="11" fontWeight="600" textAnchor="middle">
            Nível 4: Roteamento Avançado
          </text>

          {/* Dependency Edges (Bézier Curves) */}
          <g className="edges opacity-40">
            {nodes.map((node) => {
              const target = nodeCoords[node.id];
              if (!target) return null;

              return node.prerequisites.map((prereqId) => {
                const source = nodeCoords[prereqId];
                if (!source) return null;

                const c1x = source.x + 50;
                const c1y = source.y;
                const c2x = target.x - 50;
                const c2y = target.y;

                return (
                  <path
                    key={`${prereqId}->${node.id}`}
                    d={`M ${source.x + 85} ${source.y} C ${c1x + 30} ${c1y}, ${c2x - 30} ${c2y}, ${target.x - 85} ${target.y}`}
                    fill="none"
                    stroke="#475569"
                    strokeWidth="1.8"
                    strokeDasharray="4 2"
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
                className="cursor-pointer transition-transform hover:scale-105"
                transform={`translate(${coord.x}, ${coord.y})`}
                data-testid={`node-${node.id}`}
              >
                {/* Node Box */}
                <rect
                  x="-85"
                  y="-26"
                  width="170"
                  height="52"
                  rx="6"
                  fill={color.fill}
                  stroke={color.stroke}
                  strokeWidth={isActive ? '2.5' : '1.5'}
                  className={color.pulse ? 'animate-pulse' : ''}
                />

                {/* Status Dot */}
                <circle cx="-72" cy="0" r="4.5" fill={color.stroke} />

                {/* Title */}
                <text
                  x="-60"
                  y="-4"
                  fill="#f1f5f9"
                  fontSize="9.5"
                  fontWeight="600"
                  fontFamily="Inter, sans-serif"
                >
                  {node.title}
                </text>

                {/* Status Label */}
                <text
                  x="-60"
                  y="12"
                  fill={color.stroke}
                  fontSize="8.5"
                  fontWeight="500"
                  fontFamily="monospace"
                >
                  {node.status.toUpperCase()}
                </text>
              </g>
            );
          })}
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
