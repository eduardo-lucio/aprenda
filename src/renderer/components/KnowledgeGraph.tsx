import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Search, Workflow, ZoomIn, ZoomOut } from 'lucide-react';
import { ConceptNode } from '../../shared/types';
import { NodeDetailPanel } from './NodeDetailPanel';
import { LABEL_DEPTH, LABEL_HALF_WIDTH, NODE_RADIUS, REGION_COLORS, collectRelations, layoutForce, layoutLayered, wrapTitle } from '../graph/forceLayout';
import { NodeStatus, STATUS_ORDER, useStatusMeta } from '../graph/statusMeta';
import { useI18n } from '../i18n';

interface KnowledgeGraphProps {
  nodes: ConceptNode[];
  /** Learning goal, drawn at the centre of the map. */
  goal?: string;
  activeNodeId?: string;
  onNodeSelect?: (id: string) => void;
  onStartSocratic?: (nodeId: string) => void;
  onOpenNotes?: (nodeId: string) => void;
}

interface View {
  tx: number;
  ty: number;
  k: number;
}

const MIN_K = 0.2;
const MAX_K = 4;
const MAX_FIT_K = 1.5;
const FIT_PADDING = 32;
const LABEL_FADE_START = 0.32;
const LABEL_FADE_SPAN = 0.22;
const DRAG_ALPHA_TARGET = 0.3;
const UNTESTED_DOT = '#e4e4e7';
const DRAG_THRESHOLD = 4;
/** Space kept free for the legend (top) and the zoom controls (bottom) when fitting. */
const INSET_TOP = 76;
const INSET_BOTTOM = 56;
const TRAIL_RADIUS = 5.5;
const TRAIL_UNTESTED_DOT = '#71717a';
const LABEL_HALO_COLOR = '#0a0a0a';
/** How far a link that skips columns bends, so it never reads as passing through a concept. */
const TRAIL_SKIP_BOW = 30;

/** Dark outline that keeps a label readable where a link runs behind it. */
const TRAIL_LABEL_HALO = { stroke: LABEL_HALO_COLOR, strokeWidth: 3, strokeLinejoin: 'round', paintOrder: 'stroke' } as const;

type MapStyle = 'constellation' | 'trail';
const STYLE_KEY = 'aprenda_graph_style';

function loadMapStyle(): MapStyle {
  try {
    return localStorage.getItem(STYLE_KEY) === 'trail' ? 'trail' : 'constellation';
  } catch {
    return 'constellation';
  }
}

function saveMapStyle(style: MapStyle): void {
  try {
    localStorage.setItem(STYLE_KEY, style);
  } catch {
    // Not remembering the choice is harmless
  }
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ nodes, goal, activeNodeId, onNodeSelect, onStartSocratic, onOpenNotes }) => {
  const { t } = useI18n();
  const statusMeta = useStatusMeta();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [view, setView] = useState<View>({ tx: 0, ty: 0, k: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [query, setQuery] = useState('');
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<NodeStatus>>(new Set());
  const [, setSimTick] = useState(0);
  const [mapStyle, setMapStyle] = useState<MapStyle>(loadMapStyle);
  const isTrail = mapStyle === 'trail';

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const userMovedRef = useRef(false);
  const pointerRef = useRef<{ id: number; x: number; y: number; tx: number; ty: number; moved: boolean; nodeId: string | null } | null>(null);
  const draggedRef = useRef(false);

  // Progress updates change a concept's status, not the map: positions stay put
  const structureKey = nodes.map((n) => `${n.id}<${n.prerequisites.join(',')}`).join('|');
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const layout = useMemo(
    () => (isTrail ? layoutLayered(nodesRef.current) : layoutForce(nodesRef.current)),
    [structureKey, isTrail]
  );

  useEffect(() => {
    const simulation = layout.simulation;
    simulation.on('tick', () => setSimTick((v) => v + 1));
    return () => {
      simulation.on('tick', null);
      simulation.stop();
    };
  }, [layout]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const focusId = hoverId ?? selectedId ?? null;
  const relations = useMemo(
    () => (focusId && byId.has(focusId) ? collectRelations(nodes, focusId) : null),
    [nodes, byId, focusId]
  );

  const fit = useCallback(() => {
    const { w, h } = sizeRef.current;
    if (w <= 0 || h <= 0) return;
    const b = {
      minX: Math.min(...layout.nodes.map((n) => n.x - LABEL_HALF_WIDTH), 0),
      maxX: Math.max(...layout.nodes.map((n) => n.x + LABEL_HALF_WIDTH), 0),
      minY: Math.min(...layout.nodes.map((n) => n.y - NODE_RADIUS * 2), 0),
      maxY: Math.max(...layout.nodes.map((n) => n.y + LABEL_DEPTH), 0),
    };
    const bw = b.maxX - b.minX + FIT_PADDING * 2;
    const bh = b.maxY - b.minY + FIT_PADDING * 2;
    const availH = Math.max(120, h - INSET_TOP - INSET_BOTTOM);
    const k = Math.min(MAX_FIT_K, Math.max(MIN_K, Math.min(w / bw, availH / bh)));
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    setView({ k, tx: w / 2 - cx * k, ty: INSET_TOP + availH / 2 - cy * k });
  }, [layout]);

  const fitRef = useRef(fit);
  fitRef.current = fit;

  // Track the canvas size; keep the whole map in view until the user starts navigating
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => {
      sizeRef.current = { w: el.clientWidth, h: el.clientHeight };
      if (!userMovedRef.current) fitRef.current();
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A different set of concepts means a different map: fit again
  const nodesKey = nodes.map((n) => n.id).join('|');
  useEffect(() => {
    userMovedRef.current = false;
    fit();
  }, [nodesKey, fit]);

  const zoomAt = useCallback((px: number, py: number, factor: number) => {
    const v = viewRef.current;
    const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
    userMovedRef.current = true;
    setView({ k, tx: px - ((px - v.tx) * k) / v.k, ty: py - ((py - v.ty) * k) / v.k });
  }, []);

  // Wheel zoom around the cursor (native listener: React's synthetic wheel is passive)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const zoomCentre = (factor: number) => zoomAt(sizeRef.current.w / 2, sizeRef.current.h / 2, factor);

  const select = (id: string) => {
    setSelectedId(id);
    onNodeSelect?.(id);
  };

  // Pan: capture the pointer only after a real drag so plain clicks still reach the pills
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    draggedRef.current = false;
    const nodeId = (e.target as Element).closest?.('[data-node-id]')?.getAttribute('data-node-id') ?? null;
    pointerRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty, moved: false, nodeId };
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = pointerRef.current;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!p.moved) {
      p.moved = true;
      draggedRef.current = true;
      userMovedRef.current = true;
      setIsDragging(true);
      svgRef.current?.setPointerCapture?.(e.pointerId);
      if (p.nodeId) layout.simulation.alphaTarget(DRAG_ALPHA_TARGET).restart();
    }
    if (p.nodeId) {
      const rect = svgRef.current!.getBoundingClientRect();
      const v = viewRef.current;
      const dragged = layout.byId.get(p.nodeId);
      if (dragged) {
        dragged.fx = (e.clientX - rect.left - v.tx) / v.k;
        dragged.fy = (e.clientY - rect.top - v.ty) / v.k;
      }
      return;
    }
    setView((v) => ({ ...v, tx: p.tx + dx, ty: p.ty + dy }));
  };
  const endPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointerRef.current?.id === e.pointerId) {
      // A dragged concept stays where it was dropped
      if (pointerRef.current.nodeId && pointerRef.current.moved) layout.simulation.alphaTarget(0);
      pointerRef.current = null;
      setIsDragging(false);
    }
  };

  const search = query.trim().toLocaleLowerCase();
  const visible = nodes.filter(
    (n) => layout.byId.has(n.id) && !hiddenStatuses.has(n.status) && (!search || n.title.toLocaleLowerCase().includes(search))
  );
  const visibleIds = new Set(visible.map((n) => n.id));
  const edges = visible.flatMap((n) =>
    n.prerequisites.filter((p) => p !== n.id && visibleIds.has(p)).map((p) => ({ id: `${p}->${n.id}`, from: p, to: n.id }))
  );

  const toggleStatus = (status: NodeStatus) =>
    setHiddenStatuses((current) => {
      const next = new Set(current);
      if (!next.delete(status)) next.add(status);
      return next;
    });

  const isRelated = (id: string) =>
    !relations || id === focusId || relations.ancestors.has(id) || relations.descendants.has(id);

  const dotColor = (node: ConceptNode) =>
    node.status === 'untested' ? (isTrail ? TRAIL_UNTESTED_DOT : UNTESTED_DOT) : statusMeta(node.status).stroke;

  const trailEdgeStyle = (from: string, to: string) => {
    const idle = { stroke: '#52525b', opacity: 0.8, width: 1, dash: undefined as string | undefined };
    if (!relations || !focusId) return idle;
    const upChain = (id: string) => id === focusId || relations.ancestors.has(id);
    const downChain = (id: string) => id === focusId || relations.descendants.has(id);
    if (upChain(from) && upChain(to)) return { stroke: '#fafafa', opacity: 0.95, width: 1.6, dash: undefined };
    const focused = byId.get(focusId);
    if (focused && downChain(from) && downChain(to)) return { stroke: dotColor(focused), opacity: 0.9, width: 1.3, dash: '4 3' };
    return { ...idle, opacity: 0.35 };
  };

  const edgeStyle = (from: string, to: string) => {
    if (isTrail) return trailEdgeStyle(from, to);
    if (!relations || !focusId) return { stroke: '#a1a1aa', opacity: 0.5, width: 0.8, dash: undefined as string | undefined };
    const upChain = (id: string) => id === focusId || relations.ancestors.has(id);
    const downChain = (id: string) => id === focusId || relations.descendants.has(id);
    if (upChain(from) && upChain(to)) return { stroke: '#e4e4e7', opacity: 0.95, width: 1.2, dash: undefined };
    if (downChain(from) && downChain(to)) return { stroke: '#e4e4e7', opacity: 0.85, width: 1.2, dash: '4 3' };
    return { stroke: '#a1a1aa', opacity: 0.08, width: 0.8, dash: undefined };
  };

  const labelOpacity = Math.max(0, Math.min(1, (view.k - LABEL_FADE_START) / LABEL_FADE_SPAN));
  const clusterIndexes = [...new Set(visible.map((n) => layout.byId.get(n.id)!.cluster))];

  return (
    <div className="flex h-full min-h-0 w-full bg-ink-950">
      <div ref={canvasRef} className="relative min-w-0 flex-1 overflow-hidden">
        <svg
          ref={svgRef}
          role="img"
          aria-label={t('graph.aria')}
          className={`h-full w-full touch-none select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onClick={() => {
            if (!draggedRef.current) setSelectedId(null);
          }}
        >
          <defs>
            <filter id="graph-region-blur" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="38" />
            </filter>
            <marker id="graph-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" />
            </marker>
          </defs>
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
            {/* Soft colour fields behind each branch */}
            {!isTrail && clusterIndexes.map((cluster) => {
              const color = REGION_COLORS[cluster % REGION_COLORS.length];
              return (
                <g key={cluster} filter="url(#graph-region-blur)" opacity={0.3} fill={color} stroke={color} strokeLinecap="round" pointerEvents="none">
                  {visible.filter((n) => layout.byId.get(n.id)!.cluster === cluster).map((n) => {
                    const p = layout.byId.get(n.id)!;
                    return <circle key={n.id} cx={p.x} cy={p.y} r={44} strokeWidth={0} />;
                  })}
                  {edges.filter((e) => layout.byId.get(e.from)!.cluster === cluster && layout.byId.get(e.to)!.cluster === cluster).map((e) => {
                    const a = layout.byId.get(e.from)!;
                    const b = layout.byId.get(e.to)!;
                    return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={56} />;
                  })}
                </g>
              );
            })}

            {/* Links */}
            <g fill="none">
              {edges.map((e) => {
                const s = edgeStyle(e.from, e.to);
                const a = layout.byId.get(e.from)!;
                const b = layout.byId.get(e.to)!;
                if (isTrail) {
                  const skipsColumns = (b.column ?? 0) - (a.column ?? 0) > 1;
                  const bend = skipsColumns ? ` Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - TRAIL_SKIP_BOW} ` : ' L ';
                  return (
                    <path
                      key={e.id}
                      data-testid="graph-edge"
                      d={`M ${a.x} ${a.y}${bend}${b.x} ${b.y}`}
                      stroke={s.stroke}
                      strokeOpacity={s.opacity}
                      strokeWidth={s.width}
                      strokeDasharray={s.dash}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                }
                const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
                const gap = NODE_RADIUS + 1.5;
                return (
                  <line
                    key={e.id}
                    data-testid="graph-edge"
                    x1={a.x}
                    y1={a.y}
                    x2={b.x - ((b.x - a.x) / length) * gap}
                    y2={b.y - ((b.y - a.y) / length) * gap}
                    stroke={s.stroke}
                    strokeOpacity={s.opacity}
                    strokeWidth={s.width}
                    strokeDasharray={s.dash}
                    vectorEffect="non-scaling-stroke"
                    markerEnd="url(#graph-arrow)"
                  />
                );
              })}
            </g>

            {/* Concepts */}
            {visible.map((node) => {
              const pos = layout.byId.get(node.id)!;
              const meta = statusMeta(node.status);
              const dot = dotColor(node);
              const lines = wrapTitle(node.title, isTrail ? 20 : 26, 3);
              const radius = isTrail ? TRAIL_RADIUS : NODE_RADIUS;
              const isCurrent = node.id === activeNodeId || (isTrail && node.id === selectedId);
              const restingLabel = isTrail ? '#d4d4d8' : '#a1a1aa';
              const isFocus = node.id === focusId;
              const open = () => select(node.id);
              return (
                <g
                  key={node.id}
                  data-node-id={node.id}
                  transform={`translate(${pos.x} ${pos.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.title} — ${meta.label}`}
                  aria-pressed={node.id === selectedId}
                  opacity={isRelated(node.id) ? 1 : 0.25}
                  className="cursor-pointer outline-none transition-opacity duration-150"
                  onMouseEnter={() => setHoverId(node.id)}
                  onMouseLeave={() => setHoverId((h) => (h === node.id ? null : h))}
                  onFocus={() => setHoverId(node.id)}
                  onBlur={() => setHoverId((h) => (h === node.id ? null : h))}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!draggedRef.current) open();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      open();
                    }
                  }}
                >
                  <title>{`${node.title} (${meta.label})`}</title>
                  <circle r={16} fill="transparent" />
                  <circle r={radius * 3} fill={dot} opacity={isFocus ? 0.3 : 0} className="transition-opacity duration-150" />
                  {isCurrent && <circle r={radius + 3} fill="none" stroke={dot} strokeWidth={0.8} />}
                  <circle r={radius} fill={dot} className={node.status === 'false_positive' ? 'animate-pulse' : undefined} />
                  <text textAnchor="middle" fontSize={isTrail ? 9.5 : 8.5} fontWeight={isTrail && isFocus ? 700 : 500} fill={isFocus ? '#fafafa' : restingLabel} {...(isTrail ? TRAIL_LABEL_HALO : {})} opacity={isFocus ? 1 : labelOpacity} className="transition-colors duration-150">
                    {lines.map((line, i) => (
                      <tspan key={i} x={0} y={radius + 11 + i * (isTrail ? 11.5 : 10.5)}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Goal and status filters */}
        <div className="absolute left-4 top-4 max-w-[calc(100%-16rem)] space-y-1.5 rounded-lg border border-ink-700 bg-ink-900/90 px-3 py-2 backdrop-blur">
          <p className="truncate text-xs text-gray-200" aria-label={t('graph.goalAria', { goal: goal || '' })}>
            <span className="mr-2 font-mono text-[10px] tracking-wider text-gray-500">{t('graph.goal').toUpperCase()}</span>
            {goal && <span>{goal}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={!hiddenStatuses.has(s)}
                onClick={() => toggleStatus(s)}
                className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider transition-opacity hover:text-white ${hiddenStatuses.has(s) ? 'text-gray-600 line-through opacity-60' : 'text-gray-400'}`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: s === 'untested' ? (isTrail ? TRAIL_UNTESTED_DOT : UNTESTED_DOT) : statusMeta(s).stroke }} />
                {statusMeta(s).label}
              </button>
            ))}
          </div>
          <p className="font-mono text-[10px] tracking-wider text-gray-500">{t('graph.hoverHint')}</p>
        </div>

        {/* Search */}
        <label className="absolute right-4 top-4 flex w-52 items-center gap-2 rounded-lg border border-ink-700 bg-ink-900/90 px-2.5 py-1.5 backdrop-blur focus-within:border-ink-400">
          <Search className="h-3.5 w-3.5 shrink-0 text-gray-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('graph.search')}
            aria-label={t('graph.search')}
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-gray-200 outline-none placeholder:text-gray-500"
          />
        </label>

        {/* Zoom controls */}
        <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-900/90 p-1">
          <button type="button" onClick={() => zoomCentre(1.25)} aria-label={t('graph.zoomIn')} title={t('graph.zoomIn')} className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-ink-700 hover:text-white">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => zoomCentre(0.8)} aria-label={t('graph.zoomOut')} title={t('graph.zoomOut')} className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-ink-700 hover:text-white">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              userMovedRef.current = false;
              fit();
            }}
            aria-label={t('graph.fit')}
            title={t('graph.fit')}
            className="flex h-7 items-center gap-1.5 rounded px-2 font-mono text-[10px] uppercase tracking-wider text-gray-400 hover:bg-ink-700 hover:text-white"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            {t('graph.fitLabel')}
          </button>
          <button
            type="button"
            onClick={() => {
              const next: MapStyle = isTrail ? 'constellation' : 'trail';
              setMapStyle(next);
              saveMapStyle(next);
            }}
            aria-label={t('graph.styleChange')}
            title={t('graph.styleChange')}
            className="flex h-7 items-center gap-1.5 rounded px-2 font-mono text-[10px] uppercase tracking-wider text-gray-400 hover:bg-ink-700 hover:text-white"
          >
            <Workflow className="h-3.5 w-3.5" />
            {t(isTrail ? 'graph.style.trail' : 'graph.style.constellation')}
          </button>
        </div>
      </div>

      {selected && (
        <NodeDetailPanel
          node={selected}
          nodes={nodes}
          onClose={() => setSelectedId(null)}
          onSelect={select}
          onStartSocratic={onStartSocratic}
          onOpenNotes={onOpenNotes}
        />
      )}
    </div>
  );
};
