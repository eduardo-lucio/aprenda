import { describe, it, expect } from 'vitest';
import { ProbeFrontier, TOP_CONFIRMATIONS } from '../../src/main/fsm/probeFrontier';
import type { ConceptNode } from '../../src/shared/types';

type States = Record<string, ConceptNode['status']>;

const mk = (id: string, level: number, prerequisites: string[] = []): ConceptNode => ({
  id, title: id.toUpperCase(), summary: '', level, prerequisites, unconditionalTruth: '', status: 'untested',
});

// Two lines sharing the base:  a1 → a2 → a3 → a4   and   a1 → b2 → b3
const nodes = [mk('a1', 1), mk('a2', 2, ['a1']), mk('b2', 2, ['a1']), mk('a3', 3, ['a2']), mk('b3', 3, ['b2']), mk('a4', 4, ['a3'])];
const untested = (): States => Object.fromEntries(nodes.map((n) => [n.id, 'untested'])) as States;
const answers = (...ids: string[]) => ids.map((nodeId) => ({ nodeId }));

describe('ProbeFrontier (D3: bracket every line of the map)', () => {
  const f = new ProbeFrontier(nodes);

  it('enters at the top of the map, not at the base', () => {
    expect(f.pickNext(untested(), [])).toEqual({ nodeId: 'a4', escalate: false });
  });

  it('a miss halves the range below it instead of stepping down one level', () => {
    const s: States = { ...untested(), a4: 'frontier' };
    // Below a4 sit levels 1, 2 and 3: the middle one comes next
    expect(f.pickNext(s, answers('a4'), 'a4').nodeId).toBe('a2');

    // Held at level 2: only level 3 is left between the floor and the ceiling
    const held = f.withMastered(s, 'a2');
    expect(held.a1).toBe('mastered');
    expect(f.pickNext(held, answers('a4', 'a2'), 'a2').nodeId).toBe('a3');

    // Missed at level 2: the walk continues down
    const missed: States = { ...s, a2: 'blind_spot' };
    expect(f.pickNext(missed, answers('a4', 'a2'), 'a2').nodeId).toBe('a1');
  });

  it('what depends on a miss is located without being asked', () => {
    const s: States = { ...untested(), a2: 'frontier' };
    expect(f.isAboveCeiling(s, 'a3')).toBe(true);
    expect(f.isAboveCeiling(s, 'a4')).toBe(true);
    expect(f.isAboveCeiling(s, 'b3')).toBe(false);
    expect(f.isLocated(s, answers('a2'), 'a4')).toBe(true);
    expect(f.isLocated(s, answers('a2'), 'b3')).toBe(false);
  });

  it('a top answered with mastery gets a harder question before it counts', () => {
    const s = f.withMastered(untested(), 'a4');
    expect(TOP_CONFIRMATIONS).toBe(2);
    expect(f.isLocated(s, answers('a4'), 'a4')).toBe(false);
    expect(f.pickNext(s, answers('a4'), 'a4')).toEqual({ nodeId: 'a4', escalate: true });
    expect(f.isLocated(s, answers('a4', 'a4'), 'a4')).toBe(true);
    // The line never broke: the other line opens at its own top, above what was already shown
    expect(f.pickNext(s, answers('a4', 'a4'), 'a4')).toEqual({ nodeId: 'b3', escalate: false });
  });

  it('never opens at the basics once the student is past them', () => {
    // side is a base concept nothing else is built on; low ends at level 2
    const g = new ProbeFrontier([...nodes, mk('side', 1), mk('low1', 1), mk('low2', 2, ['low1'])]);
    const all = (): States => ({ ...untested(), side: 'untested', low1: 'untested', low2: 'untested' });

    const s = g.withMastered(all(), 'a4');
    expect(s).toMatchObject({ side: 'mastered', low1: 'mastered', low2: 'mastered' });
    // A line that ends one level below is a neighbor, not the basics: it still gets its question
    expect(s.b3).toBe('untested');
    expect(s.b2).toBe('untested');
    // Inferred tops are not pushed with a harder question
    expect(g.isLocated(s, answers('a4', 'a4'), 'side')).toBe(true);
    expect(g.pickNext(s, answers('a4', 'a4'), 'a4').nodeId).toBe('b3');

    // A hit at level 2 is too close to the base to speak for other lines
    const lowHit = g.withMastered({ ...all(), a4: 'frontier' }, 'a2');
    expect(lowHit.side).toBe('untested');
    expect(lowHit.low2).toBe('untested');
  });

  it('among the highest concepts, enters by the one built on the most', () => {
    const g = new ProbeFrontier([mk('x1', 1), mk('x2', 2, ['x1']), mk('y3', 3, ['x2']), mk('z3', 3, ['x2', 'y3'])]);
    expect(g.pickNext({ x1: 'untested', x2: 'untested', y3: 'untested', z3: 'untested' }, []).nodeId).toBe('z3');
  });

  it('clarity counts located concepts, not asked ones', () => {
    expect(f.clarity(untested(), [])).toBe(0);
    // One miss at the base locates the whole map
    const s: States = { ...untested(), a1: 'frontier' };
    expect(f.clarity(s, answers('a1'))).toBe(100);
    // An expert needs both tops confirmed
    let e = f.withMastered(untested(), 'a4');
    expect(f.clarity(e, answers('a4'))).toBe(Math.round((3 / 6) * 100));
    e = f.withMastered(e, 'b3');
    expect(f.clarity(e, answers('a4', 'a4', 'b3', 'b3'))).toBe(100);
  });

  it('once everything is located, confirms inferred floors before going around the misses', () => {
    // a4 missed, a2 held (a1 inferred), a3 missed; the b line is open until b3 is missed and b2 held
    let s: States = { ...untested(), a4: 'frontier', a3: 'frontier' };
    s = f.withMastered(s, 'a2');
    s = { ...s, b3: 'frontier' };
    s = f.withMastered(s, 'b2');
    const asked = answers('a4', 'a2', 'a3', 'b3', 'b2');
    expect(f.clarity(s, asked)).toBe(100);
    // a1 was never asked directly
    expect(f.pickNext(s, asked, 'b2').nodeId).toBe('a1');
    const after = [...asked, { nodeId: 'a1' }];
    expect(['a4', 'a3', 'b3']).toContain(f.pickNext(s, after, 'a1').nodeId);
  });

  it('a miss that turns out to be a slip reopens what was above it', () => {
    let s: States = { ...untested(), a2: 'frontier' };
    expect(f.isLocated(s, answers('a2'), 'a3')).toBe(true);
    s = f.withMastered(s, 'a2');
    expect(f.isLocated(s, answers('a2', 'a2'), 'a3')).toBe(false);
  });

  it('summarizes each line: floor, ceiling and the mistakes still standing', () => {
    let s: States = { ...untested(), a4: 'frontier', a3: 'blind_spot' };
    s = f.withMastered(s, 'a2');
    s = f.withMastered(s, 'b3');
    const summary = f.summarize(s, [
      { nodeId: 'a4' },
      { nodeId: 'a3', identifiedMisconception: 'Confunde A com B' },
      { nodeId: 'a2', identifiedMisconception: 'já superado' },
      { nodeId: 'a4', identifiedMisconception: 'Nenhuma; ausência de conhecimento prévio.' },
      { nodeId: 'b3' },
    ]);
    expect(summary).toEqual([
      { topId: 'b3', floor: ['b3'], ceiling: [], misconceptions: [] },
      { topId: 'a4', floor: ['a2'], ceiling: ['a3'], misconceptions: ['Confunde A com B'] },
    ]);
  });
});
