import { describe, it, expect } from 'vitest';
import { layoutRadial, collectRelations, wrapTitle, PILL_W, PILL_H, CENTER_RADIUS } from '../../src/renderer/graph/radialLayout';
import { ConceptNode } from '../../src/shared/types';

const mk = (id: string, level: number, prerequisites: string[] = []): ConceptNode => ({
  id, title: id, summary: '', level, prerequisites, unconditionalTruth: '', status: 'untested',
});

function genNodes(count: number): ConceptNode[] {
  const nodes: ConceptNode[] = [];
  for (let i = 0; i < count; i++) {
    const level = 1 + (i % 4);
    const prereqs = level > 1 ? nodes.filter((n) => n.level === level - 1).slice(0, 2).map((n) => n.id) : [];
    nodes.push(mk(`n${i}`, level, prereqs));
  }
  return nodes;
}

function overlaps(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x - b.x) < PILL_W && Math.abs(a.y - b.y) < PILL_H;
}

describe('layoutRadial', () => {
  for (const count of [1, 3, 8, 16, 30, 60]) {
    it(`never overlaps pills nor the centre with ${count} nodes`, () => {
      const nodes = genNodes(count);
      const { positions } = layoutRadial(nodes);
      expect(positions.size).toBe(count);
      const pts = [...positions.values()];
      for (let i = 0; i < pts.length; i++) {
        expect(Math.abs(pts[i].x) >= CENTER_RADIUS + PILL_W / 2 || Math.abs(pts[i].y) >= CENTER_RADIUS + PILL_H / 2).toBe(true);
        for (let j = i + 1; j < pts.length; j++) expect(overlaps(pts[i], pts[j])).toBe(false);
      }
    });
  }

  it('puts lower levels on inner rings', () => {
    const { positions } = layoutRadial(genNodes(8));
    const r = (id: string) => Math.hypot(positions.get(id)!.x / 1.45, positions.get(id)!.y);
    expect(r('n0')).toBeLessThan(r('n1'));
    expect(r('n1')).toBeLessThan(r('n2'));
    expect(r('n2')).toBeLessThan(r('n3'));
  });

  it('keeps every node, skips empty levels and tolerates levels outside 1–4', () => {
    const nodes = [mk('a', 0), mk('b', 3, ['a']), mk('c', 7, ['b'])];
    const { positions, rings } = layoutRadial(nodes);
    expect(positions.size).toBe(3);
    expect(rings).toHaveLength(3); // only the three distinct levels become rings
  });

  it('is deterministic and keeps all pills inside bounds', () => {
    const nodes = genNodes(12);
    const a = layoutRadial(nodes);
    const b = layoutRadial(nodes);
    expect([...a.positions.entries()]).toEqual([...b.positions.entries()]);
    for (const p of a.positions.values()) {
      expect(p.x - PILL_W / 2).toBeGreaterThanOrEqual(a.bounds.minX);
      expect(p.x + PILL_W / 2).toBeLessThanOrEqual(a.bounds.maxX);
      expect(p.y - PILL_H / 2).toBeGreaterThanOrEqual(a.bounds.minY);
      expect(p.y + PILL_H / 2).toBeLessThanOrEqual(a.bounds.maxY);
    }
  });

  it('handles an empty graph', () => {
    expect(layoutRadial([]).positions.size).toBe(0);
  });
});

describe('collectRelations', () => {
  it('returns transitive prerequisites and dependents and survives cycles', () => {
    const nodes = [mk('a', 1), mk('b', 2, ['a']), mk('c', 3, ['b']), mk('d', 3, ['b'])];
    const rel = collectRelations(nodes, 'b');
    expect([...rel.ancestors]).toEqual(['a']);
    expect([...rel.descendants].sort()).toEqual(['c', 'd']);
    const cyc = [mk('x', 1, ['y']), mk('y', 1, ['x'])];
    expect(collectRelations(cyc, 'x').ancestors.has('y')).toBe(true);
  });
});

describe('wrapTitle', () => {
  it('wraps into at most 2 lines and ellipsises the rest', () => {
    expect(wrapTitle('Valores e Tipos')).toEqual(['Valores e Tipos']);
    const long = wrapTitle('Closures, escopo léxico e o funcionamento do contexto de execução em JavaScript');
    expect(long).toHaveLength(2);
    expect(long[1].endsWith('…')).toBe(true);
    expect(long.every((l) => l.length <= 22)).toBe(true);
  });
});
