import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, Simulation, SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import { ConceptNode } from '../../shared/types';

export const NODE_RADIUS = 3.5;
/** Room around a dot for its label, used both by the collision force and when fitting the map. */
export const LABEL_HALF_WIDTH = 62;
export const LABEL_DEPTH = 40;

const LINK_DISTANCE = 78;
const CHARGE = -320;
const COLLIDE_RADIUS = 46;
const ANCHOR_PULL = 0.11;
const SETTLE_TICKS = 320;

/** Soft region tints: each branch of prerequisites gets one. */
export const REGION_COLORS = ['#8a5cc0', '#4f9aa6', '#a89a3f', '#c0843f', '#649a4f', '#b3588f', '#5b78c4'];

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  x: number;
  y: number;
  cluster: number;
  /** Depth in the prerequisite chain, set only by the layered layout. */
  column?: number;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

export interface GraphLayout {
  nodes: GraphNode[];
  byId: Map<string, GraphNode>;
  /** Stopped after settling; only runs again while a node is dragged. */
  simulation: Simulation<GraphNode, GraphLink>;
  clusterCount: number;
}

/** Every concept belongs to the branch of its primary prerequisite chain; one single root splits by its children. */
export function assignClusters(nodes: ConceptNode[]): Map<string, number> {
  const ids = new Set(nodes.map((n) => n.id));
  const parentOf = new Map<string, string>();
  for (const n of nodes) {
    const parent = n.prerequisites.find((p) => p !== n.id && ids.has(p));
    if (parent) parentOf.set(n.id, parent);
  }

  const chainOf = (id: string): string[] => {
    const chain = [id];
    const seen = new Set(chain);
    for (let cur = parentOf.get(id); cur && !seen.has(cur); cur = parentOf.get(cur)) {
      chain.push(cur);
      seen.add(cur);
    }
    return chain;
  };

  const chains = new Map(nodes.map((n) => [n.id, chainOf(n.id)]));
  const rootOf = (id: string) => chains.get(id)![chains.get(id)!.length - 1];
  const singleRoot = new Set(nodes.map((n) => rootOf(n.id))).size === 1;
  const keyOf = (id: string) => {
    const chain = chains.get(id)!;
    return singleRoot && chain.length > 1 ? chain[chain.length - 2] : chain[chain.length - 1];
  };

  const indexes = new Map<string, number>();
  const clusters = new Map<string, number>();
  for (const n of nodes) {
    const key = keyOf(n.id);
    if (!indexes.has(key)) indexes.set(key, indexes.size);
    clusters.set(n.id, indexes.get(key)!);
  }
  return clusters;
}

/** Force-directed layout, one anchor per region around the centre. Same concepts always give the same map. */
export function layoutForce(nodes: ConceptNode[]): GraphLayout {
  const clusters = assignClusters(nodes);
  const clusterCount = new Set(clusters.values()).size;
  const anchorRadius = clusterCount > 1 ? 150 + 34 * Math.sqrt(nodes.length) : 0;
  const anchor = (cluster: number) => {
    const angle = -Math.PI / 2 + (cluster * Math.PI * 2) / Math.max(1, clusterCount);
    return { x: Math.cos(angle) * anchorRadius * 1.25, y: Math.sin(angle) * anchorRadius };
  };

  const simNodes: GraphNode[] = nodes.map((n, i) => {
    const cluster = clusters.get(n.id) ?? 0;
    const home = anchor(cluster);
    const spiral = 18 * Math.sqrt(i + 1);
    const turn = i * 2.39996;
    return { id: n.id, cluster, x: home.x + Math.cos(turn) * spiral, y: home.y + Math.sin(turn) * spiral };
  });
  const byId = new Map(simNodes.map((n) => [n.id, n]));
  const links: GraphLink[] = nodes.flatMap((n) =>
    n.prerequisites.filter((p) => p !== n.id && byId.has(p)).map((p) => ({ source: p, target: n.id }))
  );

  let seed = 1;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const simulation = forceSimulation<GraphNode, GraphLink>(simNodes)
    .randomSource(random)
    .force('link', forceLink<GraphNode, GraphLink>(links).id((n) => n.id).distance(LINK_DISTANCE).strength(0.55))
    .force('charge', forceManyBody<GraphNode>().strength(CHARGE))
    .force('collide', forceCollide<GraphNode>(COLLIDE_RADIUS))
    .force('x', forceX<GraphNode>((n) => anchor(n.cluster).x).strength(ANCHOR_PULL))
    .force('y', forceY<GraphNode>((n) => anchor(n.cluster).y).strength(ANCHOR_PULL))
    .stop();
  simulation.tick(SETTLE_TICKS);
  return { nodes: simNodes, byId, simulation, clusterCount };
}

const COLUMN_GAP = 138;
const ROW_GAP = 86;
const ORDERING_SWEEPS = 4;

/**
 * Left-to-right layout: each concept sits one column after its deepest prerequisite, so the map
 * reads as a path from the basics to the goal. Rows are ordered to keep links from crossing.
 */
export function layoutLayered(nodes: ConceptNode[]): GraphLayout {
  const ids = new Set(nodes.map((n) => n.id));
  const parents = new Map(nodes.map((n) => [n.id, n.prerequisites.filter((p) => p !== n.id && ids.has(p))]));
  const children = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const [id, list] of parents) for (const p of list) children.get(p)!.push(id);

  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // cycle: this link does not add depth
    visiting.add(id);
    const value = Math.max(-1, ...parents.get(id)!.map(depthOf)) + 1;
    visiting.delete(id);
    depth.set(id, value);
    return value;
  };

  const columns: string[][] = [];
  for (const n of nodes) (columns[depthOf(n.id)] ??= []).push(n.id);
  const filled = columns.filter(Boolean);

  // Barycentre ordering: each concept moves towards the average row of its neighbours
  const rowOf = new Map<string, number>();
  const remember = () => filled.forEach((col) => col.forEach((id, row) => rowOf.set(id, row - (col.length - 1) / 2)));
  const arrange = (col: string[], neighbours: Map<string, string[]>) => {
    const weight = new Map(
      col.map((id) => {
        const list = neighbours.get(id)!;
        return [id, list.length ? list.reduce((sum, n) => sum + rowOf.get(n)!, 0) / list.length : rowOf.get(id)!];
      })
    );
    col.sort((a, b) => weight.get(a)! - weight.get(b)!);
    remember();
  };
  remember();
  for (let sweep = 0; sweep < ORDERING_SWEEPS; sweep++) {
    for (const col of filled.slice(1)) arrange(col, parents);
    for (const col of [...filled].reverse().slice(1)) arrange(col, children);
  }

  const cluster = assignClusters(nodes);
  const simNodes: GraphNode[] = [];
  filled.forEach((col, column) => {
    col.forEach((id) => {
      simNodes.push({
        id,
        cluster: cluster.get(id) ?? 0,
        column,
        x: (column - (filled.length - 1) / 2) * COLUMN_GAP,
        y: rowOf.get(id)! * ROW_GAP,
      });
    });
  });

  // No forces: the simulation only moves the concept being dragged
  const simulation = forceSimulation<GraphNode, GraphLink>(simNodes).stop();
  return { nodes: simNodes, byId: new Map(simNodes.map((n) => [n.id, n])), simulation, clusterCount: new Set(cluster.values()).size };
}

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
