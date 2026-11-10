import { describe, it, expect } from 'vitest';
import { assignClusters, layoutForce, layoutForceStaged, layoutLayered } from '../../src/renderer/graph/forceLayout';
import { ConceptNode } from '../../src/shared/types';

const node = (id: string, prerequisites: string[] = []): ConceptNode => ({
  id, title: id, summary: '', level: 1, prerequisites, unconditionalTruth: '', status: 'untested',
});

describe('layoutForce', () => {
  it('gives the same concepts the same map', () => {
    const nodes = [node('a'), node('b', ['a']), node('c', ['a']), node('d', ['b', 'c']), node('e')];
    const positions = () => layoutForce(nodes).nodes.map((n) => [n.x, n.y]);
    expect(positions()).toEqual(positions());
  });

  it('places every node at finite, separate positions and survives cycles and unknown prerequisites', () => {
    const { nodes } = layoutForce([node('a', ['c', 'ghost']), node('b', ['a']), node('c', ['b']), node('d', ['d'])]);
    expect(nodes).toHaveLength(4);
    expect(nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
    expect(new Set(nodes.map((n) => `${n.x},${n.y}`)).size).toBe(4);
  });

  it('handles an empty map', () => {
    expect(layoutForce([]).nodes).toHaveLength(0);
  });
});

describe('layoutLayered', () => {
  it('places each concept to the right of all its prerequisites', () => {
    const { byId } = layoutLayered([node('a'), node('b', ['a']), node('c', ['a']), node('d', ['b', 'c']), node('e', ['a', 'd'])]);
    expect(byId.get('b')!.x).toBeGreaterThan(byId.get('a')!.x);
    expect(byId.get('b')!.x).toBe(byId.get('c')!.x);
    expect(byId.get('d')!.x).toBeGreaterThan(byId.get('c')!.x);
    expect(byId.get('e')!.x).toBeGreaterThan(byId.get('d')!.x);
    expect(byId.get('b')!.y).not.toBe(byId.get('c')!.y);
  });

  it('orders rows so parallel branches do not cross', () => {
    const { byId } = layoutLayered([node('a'), node('b'), node('x', ['b']), node('y', ['a'])]);
    expect(Math.sign(byId.get('y')!.y - byId.get('x')!.y)).toBe(Math.sign(byId.get('a')!.y - byId.get('b')!.y));
  });

  it('survives cycles, unknown prerequisites and an empty map', () => {
    const { nodes } = layoutLayered([node('a', ['c', 'ghost']), node('b', ['a']), node('c', ['b']), node('d', ['d'])]);
    expect(nodes).toHaveLength(4);
    expect(nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
    expect(new Set(nodes.map((n) => `${n.x},${n.y}`)).size).toBe(4);
    expect(layoutLayered([]).nodes).toHaveLength(0);
  });
});

describe('assignClusters', () => {
  it('groups by root and splits a single root by its branches', () => {
    const many = assignClusters([node('a'), node('a1', ['a']), node('b')]);
    expect(many.get('a1')).toBe(many.get('a'));
    expect(many.get('b')).not.toBe(many.get('a'));

    const single = assignClusters([node('r'), node('x', ['r']), node('x1', ['x']), node('y', ['r'])]);
    expect(single.get('x1')).toBe(single.get('x'));
    expect(single.get('y')).not.toBe(single.get('x'));
  });
});

describe('layoutForceStaged (D4: a map that gains a concept keeps its shape)', () => {
  const base = [node('a'), node('b', ['a']), node('c', ['a']), node('d', ['b', 'c'])];
  const grown = [node('a'), node('b', ['a', 'x']), node('c', ['a']), node('d', ['b', 'c']), node('x', ['a'])];
  const at = (layout: ReturnType<typeof layoutForce>, id: string) => [layout.byId.get(id)!.x, layout.byId.get(id)!.y];

  it('without added concepts it is the plain layout', () => {
    expect(layoutForceStaged(base).nodes.map((n) => [n.x, n.y])).toEqual(layoutForce(base).nodes.map((n) => [n.x, n.y]));
  });

  it('the concepts that were on the map stay exactly where they were', () => {
    const before = layoutForce(base);
    const after = layoutForceStaged(grown, [['x']]);
    for (const id of ['a', 'b', 'c', 'd']) expect(at(after, id)).toEqual(at(before, id));
    const [x, y] = at(after, 'x');
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    // The newcomer does not land on top of a concept
    for (const id of ['a', 'b', 'c', 'd']) {
      const [ox, oy] = at(after, id);
      expect(Math.hypot(ox - x, oy - y)).toBeGreaterThan(20);
    }
    // And nothing is left pinned: the student can still drag every concept
    expect(after.nodes.every((n) => n.fx == null && n.fy == null)).toBe(true);
  });

  it('reopening the map gives the same picture, and a second change keeps the first', () => {
    const twice = [...grown, node('y', ['x'])];
    const first = layoutForceStaged(grown, [['x']]);
    const second = layoutForceStaged(twice, [['x'], ['y']]);
    expect(layoutForceStaged(grown, [['x']]).nodes.map((n) => [n.x, n.y])).toEqual(first.nodes.map((n) => [n.x, n.y]));
    for (const id of ['a', 'b', 'c', 'd', 'x']) expect(at(second, id)).toEqual(at(first, id));
  });

  it('ignores ids that are not on the map', () => {
    expect(layoutForceStaged(base, [['ghost']]).nodes).toHaveLength(4);
  });
});
