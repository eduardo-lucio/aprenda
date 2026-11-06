import { ConceptNode } from '../../shared/types';

export const PILL_W = 196;
export const PILL_H = 54;
export const CENTER_RADIUS = 62;
/** Rings are laid out as an ellipse (wider than tall) because pills are wide and screens are landscape. */
const STRETCH = 1.45;
const MARGIN = 16;

export interface NodePosition {
  x: number;
  y: number;
  angle: number;
  ring: number;
}

export interface RadialLayout {
  positions: Map<string, NodePosition>;
  rings: { radius: number; level: number }[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

const TAU = Math.PI * 2;
const normalize = (a: number) => ((a % TAU) + TAU) % TAU;

/**
 * Radial tree angles: every node picks one primary prerequisite as parent; a node's angular sector is proportional
 * to the number of leaves below it, so the whole circle is used and the main links never cross.
 */
function treeAngles(nodes: ConceptNode[]): Map<string, number> {
  const ids = new Set(nodes.map((n) => n.id));
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const parentOf = new Map<string, string>();

  for (const n of nodes) {
    const parent = n.prerequisites.find((p) => p !== n.id && ids.has(p));
    if (parent) parentOf.set(n.id, parent);
  }
  // Break any cycle by turning the node that closes it into a root
  for (const n of nodes) {
    const seen = new Set<string>([n.id]);
    let cur = parentOf.get(n.id);
    while (cur) {
      if (seen.has(cur)) {
        parentOf.delete(n.id);
        break;
      }
      seen.add(cur);
      cur = parentOf.get(cur);
    }
  }

  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const n of nodes) {
    const parent = parentOf.get(n.id);
    if (parent) {
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent)!.push(n.id);
    } else {
      roots.push(n.id);
    }
  }
  const byOrder = (a: string, b: string) => (order.get(a) ?? 0) - (order.get(b) ?? 0);
  roots.sort(byOrder);
  children.forEach((list) => list.sort(byOrder));

  const leaves = new Map<string, number>();
  const countLeaves = (id: string): number => {
    const kids = children.get(id) ?? [];
    const v = kids.length === 0 ? 1 : kids.reduce((sum, k) => sum + countLeaves(k), 0);
    leaves.set(id, v);
    return v;
  };
  roots.forEach(countLeaves);

  const angles = new Map<string, number>();
  const assign = (id: string, start: number, span: number) => {
    angles.set(id, start + span / 2);
    const kids = children.get(id) ?? [];
    const total = kids.reduce((sum, k) => sum + (leaves.get(k) ?? 1), 0) || 1;
    let at = start;
    for (const k of kids) {
      const share = (span * (leaves.get(k) ?? 1)) / total;
      assign(k, at, share);
      at += share;
    }
  };

  const totalLeaves = roots.reduce((sum, r) => sum + (leaves.get(r) ?? 1), 0) || 1;
  const firstShare = (TAU * (leaves.get(roots[0]) ?? 1)) / totalLeaves;
  let at = -Math.PI / 2 - firstShare / 2; // first root centred at the top
  for (const r of roots) {
    const share = (TAU * (leaves.get(r) ?? 1)) / totalLeaves;
    assign(r, at, share);
    at += share;
  }
  return angles;
}

type Pt = { x: number; y: number };
const toReal = (r: number, a: number): Pt => ({ x: r * Math.cos(a) * STRETCH, y: r * Math.sin(a) });

/** Do two pills (real coordinates) overlap, keeping MARGIN between them? */
const pillsCollide = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < PILL_W + MARGIN && Math.abs(a.y - b.y) < PILL_H + MARGIN;
const hitsCentre = (a: Pt) =>
  Math.abs(a.x) < CENTER_RADIUS + PILL_W / 2 + MARGIN && Math.abs(a.y) < CENTER_RADIUS + PILL_H / 2 + MARGIN;

/**
 * Tries to place one ring at `radius`: spreads the nodes' desired angles apart until no neighbour collides.
 * Returns the angles, or null when the ring is too tight (the caller then grows the radius).
 */
function placeRing(desired: number[], radius: number, placed: Pt[]): number[] | null {
  const n = desired.length;
  const order = desired.map((a, i) => ({ a: normalize(a), i })).sort((p, q) => p.a - q.a || p.i - q.i);
  const ang = order.map((o) => o.a);
  const colliding = (k: number, j: number) => pillsCollide(toReal(radius, ang[k]), toReal(radius, ang[j]));

  if (n > 1) {
    let settled = false;
    for (let iter = 0; iter < 800 && !settled; iter++) {
      settled = true;
      for (let k = 0; k < n; k++) {
        const j = (k + 1) % n;
        if (n === 2 && k === 1) break;
        if (colliding(k, j)) {
          ang[k] -= 0.01;
          ang[j] += 0.01;
          settled = false;
        }
      }
    }
    if (!settled) return null;
  }

  const pts = ang.map((a) => toReal(radius, a));
  for (let k = 0; k < n; k++) {
    if (hitsCentre(pts[k])) return null;
    for (const q of placed) if (pillsCollide(pts[k], q)) return null;
    for (let j = k + 1; j < n; j++) if (pillsCollide(pts[k], pts[j])) return null;
  }

  const out = new Array<number>(n);
  order.forEach((o, k) => (out[o.i] = ang[k]));
  return out;
}

/**
 * Radial layout: one ring per distinct level (ascending outwards). Each node starts at the mean angle of its
 * prerequisites to keep links short; rings are only as large as needed so pills never overlap.
 */
export function layoutRadial(nodes: ConceptNode[]): RadialLayout {
  const positions = new Map<string, NodePosition>();
  if (nodes.length === 0) {
    return {
      positions,
      rings: [],
      bounds: { minX: -CENTER_RADIUS, minY: -CENTER_RADIUS, maxX: CENTER_RADIUS, maxY: CENTER_RADIUS },
    };
  }

  const levelOf = (n: ConceptNode) => (Number.isFinite(n.level) ? n.level : 1);
  const levels = [...new Set(nodes.map(levelOf))].sort((a, b) => a - b);
  const rings: RadialLayout['rings'] = [];
  const placed: Pt[] = [];
  const START = -Math.PI / 2;
  const wantedAngles = treeAngles(nodes);

  levels.forEach((level, ringIdx) => {
    const ringNodes = nodes.filter((n) => levelOf(n) === level);
    const n = ringNodes.length;

    const desired = ringNodes.map((node, k) => wantedAngles.get(node.id) ?? START + (k * TAU) / n);

    let radius = ringIdx === 0 ? 90 : rings[ringIdx - 1].radius + 56;
    let angles = placeRing(desired, radius, placed);
    for (let guard = 0; angles === null && guard < 400; guard++) {
      radius += 14;
      angles = placeRing(desired, radius, placed);
    }
    if (angles === null) angles = ringNodes.map((_, k) => START + (k * TAU) / n); // unreachable safety net

    rings.push({ radius, level });
    ringNodes.forEach((node, k) => {
      const pt = toReal(radius, angles![k]);
      placed.push(pt);
      positions.set(node.id, { x: pt.x, y: pt.y, angle: angles![k], ring: ringIdx });
    });
  });

  let minX = -CENTER_RADIUS;
  let minY = -CENTER_RADIUS;
  let maxX = CENTER_RADIUS;
  let maxY = CENTER_RADIUS;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x - PILL_W / 2);
    maxX = Math.max(maxX, p.x + PILL_W / 2);
    minY = Math.min(minY, p.y - PILL_H / 2);
    maxY = Math.max(maxY, p.y + PILL_H / 2);
  }
  return { positions, rings, bounds: { minX, minY, maxX, maxY } };
}

/** Horizontal radius of a ring on screen (rings are ellipses). */
export const ringRx = (radius: number) => radius * STRETCH;

/** Transitive prerequisites and dependents of a node (cycle-safe). */
export function collectRelations(nodes: ConceptNode[], id: string): { ancestors: Set<string>; descendants: Set<string> } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    for (const p of n.prerequisites) {
      if (!children.has(p)) children.set(p, []);
      children.get(p)!.push(n.id);
    }
  }
  const walk = (start: string, next: (nid: string) => string[]) => {
    const seen = new Set<string>();
    const stack = [...next(start)];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur) || cur === start) continue;
      seen.add(cur);
      stack.push(...next(cur));
    }
    return seen;
  };
  return {
    ancestors: walk(id, (nid) => (byId.get(nid)?.prerequisites ?? []).filter((p) => byId.has(p))),
    descendants: walk(id, (nid) => children.get(nid) ?? []),
  };
}

/** Word-wraps a title into at most `maxLines` lines of about `maxChars`; the last line gets an ellipsis if cut. */
export function wrapTitle(title: string, maxChars = 22, maxLines = 2): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars || !cur) {
      cur = next;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  const clip = (l: string) => (l.length > maxChars ? l.slice(0, maxChars - 1).trimEnd() + '…' : l);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines - 1);
    kept.push(clip(lines.slice(maxLines - 1).join(' ')));
    return kept.map(clip);
  }
  return lines.map(clip);
}
