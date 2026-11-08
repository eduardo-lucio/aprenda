import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { ConceptNode } from '../../shared/types';
import { NodeDetailPanel } from './NodeDetailPanel';
import { CENTER_RADIUS, PILL_H, PILL_W, collectRelations, layoutRadial, ringRx, wrapTitle } from '../graph/radialLayout';
import { STATUS_ORDER, useStatusMeta } from '../graph/statusMeta';
import { useI18n } from '../i18n';

interface KnowledgeGraphProps {
  nodes: ConceptNode[];
  /** Learning goal, drawn at the centre of the map. */
  goal?: string;
  activeNodeId?: string;
  onNodeSelect?: (id: string) => void;
  onStartSocratic?: (nodeId: string) => void;
}

interface View {
  tx: number;
  ty: number;
  k: number;
}

const MIN_K = 0.2;
const MAX_K = 2.5;
const FIT_PADDING = 48;
const DRAG_THRESHOLD = 4;
/** Space kept free for the legend (top) and the zoom controls (bottom) when fitting. */
const INSET_TOP = 76;
const INSET_BOTTOM = 56;

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ nodes, goal, activeNodeId, onNodeSelect, onStartSocratic }) => {
  const { t } = useI18n();
  const statusMeta = useStatusMeta();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [view, setView] = useState<View>({ tx: 0, ty: 0, k: 1 });
  const [isDragging, setIsDragging] = useState(false);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const userMovedRef = useRef(false);
  const pointerRef = useRef<{ id: number; x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const draggedRef = useRef(false);

  const layout = useMemo(() => layoutRadial(nodes), [nodes]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const focusId = hoverId ?? selectedId ?? activeNodeId ?? null;
  const relations = useMemo(
    () => (focusId && byId.has(focusId) ? collectRelations(nodes, focusId) : null),
    [nodes, byId, focusId]
  );

  const fit = useCallback(() => {
    const { w, h } = sizeRef.current;
    if (w <= 0 || h <= 0) return;
    const b = layout.bounds;
    const bw = b.maxX - b.minX + FIT_PADDING * 2;
    const bh = b.maxY - b.minY + FIT_PADDING * 2;
    const availH = Math.max(120, h - INSET_TOP - INSET_BOTTOM);
    const k = Math.min(1.25, Math.max(MIN_K, Math.min(w / bw, availH / bh)));
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
    pointerRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty, moved: false };
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
    }
    setView((v) => ({ ...v, tx: p.tx + dx, ty: p.ty + dy }));
  };
  const endPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointerRef.current?.id === e.pointerId) {
      pointerRef.current = null;
      setIsDragging(false);
    }
  };

  const edges = useMemo(() => {
    const list: { id: string; from: string; to: string; d: string }[] = [];
    for (const n of nodes) {
      const to = layout.positions.get(n.id);
      if (!to) continue;
      for (const pid of n.prerequisites) {
        const from = layout.positions.get(pid);
        if (!from) continue;
        // Curve bowed towards the centre so links hug the rings instead of cutting across pills
        const cx = ((from.x + to.x) / 2) * 0.62;
        const cy = ((from.y + to.y) / 2) * 0.62;
        list.push({ id: `${pid}->${n.id}`, from: pid, to: n.id, d: `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}` });
      }
    }
    return list;
  }, [nodes, layout]);

  const roots = nodes.filter((n) => !n.prerequisites.some((p) => byId.has(p)) && layout.positions.has(n.id));

  const isRelated = (id: string) =>
    !relations || id === focusId || relations.ancestors.has(id) || relations.descendants.has(id);

  const edgeStyle = (from: string, to: string) => {
    if (!relations || !focusId) return { stroke: '#a1a1aa', opacity: 0.16, width: 1.2, dash: undefined as string | undefined };
    const upChain = (id: string) => id === focusId || relations.ancestors.has(id);
    const downChain = (id: string) => id === focusId || relations.descendants.has(id);
    if (upChain(from) && upChain(to)) return { stroke: '#e4e4e7', opacity: 0.95, width: 2, dash: undefined };
    if (downChain(from) && downChain(to)) return { stroke: '#e4e4e7', opacity: 0.85, width: 2, dash: '6 4' };
    return { stroke: '#a1a1aa', opacity: 0.05, width: 1.2, dash: undefined };
  };

  const goalLines = wrapTitle(goal || t('graph.goal'), 15, 3);

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
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
            {/* Rings (levels) */}
            {layout.rings.map((r) => (
              <ellipse key={r.level} cx={0} cy={0} rx={ringRx(r.radius)} ry={r.radius} fill="none" stroke="#3a3a3a" strokeOpacity={0.35} strokeDasharray="3 7" />
            ))}

            {/* Links, behind everything else */}
            <g fill="none" strokeLinecap="round">
              {roots.map((n) => {
                const p = layout.positions.get(n.id)!;
                const dim = relations && !(n.id === focusId || relations.ancestors.has(n.id));
                return (
                  <line key={`root-${n.id}`} x1={0} y1={0} x2={p.x} y2={p.y} stroke="#a1a1aa" strokeOpacity={dim ? 0.03 : 0.1} strokeDasharray="2 6" />
                );
              })}
              {edges.map((e) => {
                const s = edgeStyle(e.from, e.to);
                return (
                  <path key={e.id} d={e.d} data-testid="graph-edge" stroke={s.stroke} strokeOpacity={s.opacity} strokeWidth={s.width} strokeDasharray={s.dash} />
                );
              })}
            </g>

            {/* Goal at the centre */}
            <g aria-label={t('graph.goalAria', { goal: goal || '' })}>
              <circle r={CENTER_RADIUS} fill="#181818" stroke="#52525b" strokeWidth={1.5} />
              <text textAnchor="middle" y={-CENTER_RADIUS + 20} fontSize={9} className="font-mono" fill="#71717a" letterSpacing="0.14em">
                {t('graph.goal').toUpperCase()}
              </text>
              <text textAnchor="middle" fontSize={12} fontWeight={600} fill="#f4f4f5" className="font-serif">
                {goalLines.map((line, i) => (
                  <tspan key={i} x={0} y={-((goalLines.length - 1) * 7) + i * 14 + 8}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>

            {/* Concept pills */}
            {nodes.map((node) => {
              const pos = layout.positions.get(node.id);
              if (!pos) return null;
              const meta = statusMeta(node.status);
              const lines = wrapTitle(node.title, 27, 2);
              const blockH = lines.length * 14 + 6 + 10;
              const top = -blockH / 2;
              const isFocus = node.id === focusId;
              const open = () => select(node.id);
              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x} ${pos.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.title} — ${meta.label}`}
                  aria-pressed={node.id === selectedId}
                  opacity={isRelated(node.id) ? 1 : 0.3}
                  className="cursor-pointer outline-none transition-opacity duration-150 [&:focus-visible>rect]:stroke-white"
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
                  <rect
                    x={-PILL_W / 2}
                    y={-PILL_H / 2}
                    width={PILL_W}
                    height={PILL_H}
                    rx={14}
                    fill={meta.fill}
                    stroke={meta.stroke}
                    strokeWidth={isFocus || node.id === selectedId ? 2.5 : 1.25}
                  />
                  {lines.length === 1 ? (
                    <text x={-PILL_W / 2 + 14} y={top + 12} fontSize={12.5} fontWeight={600} fill="#f4f4f5">
                      {lines[0]}
                    </text>
                  ) : (
                    <text x={-PILL_W / 2 + 14} fontSize={12.5} fontWeight={600} fill="#f4f4f5">
                      {lines.map((line, i) => (
                        <tspan key={i} x={-PILL_W / 2 + 14} y={top + 12 + i * 14}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  )}
                  <circle cx={-PILL_W / 2 + 18} cy={top + lines.length * 14 + 8} r={3.5} fill={meta.stroke} className={node.status === 'false_positive' ? 'animate-pulse' : undefined} />
                  <text x={-PILL_W / 2 + 28} y={top + lines.length * 14 + 11.5} fontSize={9} letterSpacing="0.08em" fill={meta.stroke} className="font-mono" style={{ textTransform: 'uppercase' }}>
                    {meta.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Legend */}
        <div className="pointer-events-none absolute left-4 top-4 flex max-w-[calc(100%-8rem)] flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-ink-700 bg-ink-900/90 px-3 py-2 backdrop-blur">
          {STATUS_ORDER.map((s) => (
            <span key={s} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-gray-400">
              <span className="h-2 w-2 rounded-full" style={{ background: statusMeta(s).stroke }} />
              {statusMeta(s).label}
            </span>
          ))}
          <span className="font-mono text-[10px] tracking-wider text-gray-500">
            {t('graph.hoverHint')}
          </span>
        </div>

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
        </div>
      </div>

      {selected && (
        <NodeDetailPanel
          node={selected}
          nodes={nodes}
          onClose={() => setSelectedId(null)}
          onSelect={select}
          onStartSocratic={onStartSocratic}
        />
      )}
    </div>
  );
};
