import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionStateMachine } from '../../src/main/fsm/SessionStateMachine';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';
import { CurriculumGenerator, sanitizeGraph } from '../../src/main/services/CurriculumGenerator';
import { SocraticEngine } from '../../src/main/socratic/SocraticEngine';
import { registerIpcHandlers } from '../../src/main/ipc/registerIpcHandlers';
import { buildPlanRevisionPrompt } from '../../src/main/prompts/curriculumPrompts';
import type { LLMCaller } from '../../src/main/services/llmClient';
import { MAX_ADDED_PER_SESSION, type ConceptNode } from '../../src/shared/types';
import { mockJudge, mockLLM, noShuffle } from '../helpers/mockLLM';

const isRevision = (o: { systemPrompt?: string }) => (o.systemPrompt || '').includes('FUNDAÇÃO FALTANDO');
type Proposal = { add: Array<Record<string, unknown>>; note?: string };

/** The mock provider, except that the planner answers a revision request with `proposal()`. */
const llmWith = (proposal: () => Proposal | Error) => {
  const calls: any[] = [];
  const llm: LLMCaller = async (o) => {
    if (!isRevision(o)) return mockLLM(o);
    calls.push(o);
    const p = proposal();
    if (p instanceof Error) throw p;
    return JSON.stringify(p);
  };
  return { llm, calls };
};

/** A session in the teaching phase where nothing is mastered (every probe answer was a miss). */
async function teaching(llm: LLMCaller) {
  const f = new SessionStateMachine(new KnowledgeStore(), mockJudge(), new CurriculumGenerator(llm, noShuffle));
  await f.startSession('teaching', 'Redes');
  await f.submitGoalClarification('TCP e UDP');
  for (let i = 0; i < 8 && f.getState().phase === 'probing'; i++) {
    await f.submitProbeAnswer({ selectedOptionIndex: 1, confidence: 90, thinkingText: 'x' });
  }
  if (f.getState().phase === 'probing') await f.advanceToPlan();
  f.confirmPlan();
  return f;
}
const nodeOf = (f: SessionStateMachine, id: string) => f.getSnapshot().nodes.find((n) => n.id === id)!;
const foundation = (title: string, prerequisites: string[] = []) => ({
  title, summary: `${title}.`, unconditionalTruth: `${title} sempre vale.`, prerequisites,
});

describe('the plan changes during the lessons (D4)', () => {
  it('adds the missing foundation under the concept and teaches it first', async () => {
    const { llm, calls } = llmWith(() => ({
      add: [foundation('Bits e bytes', ['n1', 'n7', 'nao-existe'])],
      note: 'Antes de voltar ao handshake, vamos ver bits e bytes.',
    }));
    const f = await teaching(llm);

    const revision = await f.reviseAfterFailure('n4');
    expect(revision).toEqual({ nodeId: 'n4', added: ['bits-e-bytes'], note: 'Antes de voltar ao handshake, vamos ver bits e bytes.' });
    expect(calls[0].prompt).toContain('n4 | Handshake TCP');

    const added = nodeOf(f, 'bits-e-bytes');
    // It may only rest on what the concept already rested on: n7 depends on n4 and would close a cycle
    expect(added.prerequisites).toEqual(['n1']);
    expect(nodeOf(f, 'n4').prerequisites).toEqual(['n1', 'n2', 'bits-e-bytes']);
    expect(f.getState().nodesState['bits-e-bytes']).toBe('untested');

    // Levels were rebuilt: every concept sits above everything it depends on, up to the top of the scale
    const levelOf = (id: string) => nodeOf(f, id).level;
    expect(levelOf('bits-e-bytes')).toBe(2);
    expect(levelOf('n4')).toBe(3);
    expect(levelOf('n5')).toBe(4);

    const order = f.getSnapshot().teachingOrder;
    const at = (id: string) => order.indexOf(id);
    expect(at('bits-e-bytes')).toBeGreaterThanOrEqual(0);
    expect(at('bits-e-bytes')).toBeLessThan(at('n4'));
    // n5 and n7 now share the top level, and n7 is built on n5
    expect(at('n4')).toBeLessThan(at('n5'));
    expect(at('n5')).toBeLessThan(at('n7'));
    expect(f.getState().planRevisions).toHaveLength(1);
  });

  it('a concept at the base moves up to make room for what it turned out to need', async () => {
    const { llm } = llmWith(() => ({ add: [foundation('O que é um protocolo')] }));
    const f = await teaching(llm);
    const revision = await f.reviseAfterFailure('n1');
    expect(revision!.note).toContain('O que é um protocolo');
    expect(nodeOf(f, 'o-que-e-um-protocolo').level).toBe(1);
    expect(nodeOf(f, 'n1').level).toBe(2);
    expect(nodeOf(f, 'n3').level).toBe(3);
    expect(f.nextTeachingNodeId()).not.toBe('n1');
  });

  it('asks once per concept, and leaves the map alone when nothing is missing', async () => {
    const { llm, calls } = llmWith(() => ({ add: [], note: '' }));
    const f = await teaching(llm);
    const before = f.getSnapshot().nodes.length;
    expect(await f.reviseAfterFailure('n4')).toBeNull();
    expect(await f.reviseAfterFailure('n4')).toBeNull();
    expect(calls).toHaveLength(1);
    expect(f.getSnapshot().nodes).toHaveLength(before);
    expect(f.getState().planRevisions).toBeUndefined();
  });

  it('refuses a concept the map already has and takes at most two per revision', async () => {
    const { llm } = llmWith(() => ({
      add: [foundation('endereçamento'), foundation('A'), foundation('B'), foundation('C')],
    }));
    const f = await teaching(llm);
    const revision = await f.reviseAfterFailure('n4');
    // "Endereçamento" is n2; of the rest only what fits in one revision enters
    expect(revision!.added).toEqual(['a']);
    expect(f.getSnapshot().nodes.some((n) => n.title === 'endereçamento')).toBe(false);
  });

  it(`a session gains at most ${MAX_ADDED_PER_SESSION} concepts`, async () => {
    let n = 0;
    const { llm, calls } = llmWith(() => ({ add: [foundation(`Base ${++n}`), foundation(`Base ${++n}`)] }));
    const f = await teaching(llm);
    expect((await f.reviseAfterFailure('n4'))!.added).toHaveLength(2);
    expect((await f.reviseAfterFailure('n5'))!.added).toHaveLength(2);
    expect(await f.reviseAfterFailure('n6')).toBeNull();
    // With no room left the planner is not even asked
    expect(calls).toHaveLength(2);
    expect(f.getSnapshot().nodes).toHaveLength(8 + MAX_ADDED_PER_SESSION);
  });

  it('survives a restart: the new concept, the note and the one-ask rule', async () => {
    const { llm, calls } = llmWith(() => ({ add: [foundation('Bits e bytes')], note: 'Nota.' }));
    const f = await teaching(llm);
    await f.reviseAfterFailure('n4');

    const restored = new SessionStateMachine(new KnowledgeStore(), mockJudge(), new CurriculumGenerator(llm, noShuffle));
    restored.restoreSnapshot(JSON.parse(JSON.stringify(f.getSnapshot())));
    expect(restored.getSnapshot().nodes.map((x) => x.id)).toContain('bits-e-bytes');
    expect(restored.getState().planRevisions).toEqual([{ nodeId: 'n4', added: ['bits-e-bytes'], note: 'Nota.' }]);
    expect(await restored.reviseAfterFailure('n4')).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('does nothing outside the lessons', async () => {
    const { llm, calls } = llmWith(() => ({ add: [foundation('X')] }));
    const f = new SessionStateMachine(new KnowledgeStore(), mockJudge(), new CurriculumGenerator(llm, noShuffle));
    await f.startSession('teaching', 'Redes');
    await f.submitGoalClarification('TCP e UDP');
    expect(await f.reviseAfterFailure('n4')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('the revision prompt carries the map, the concept and what went wrong', () => {
    const node: ConceptNode = { id: 'c', title: 'Conceito', summary: 's', level: 2, prerequisites: ['b'], unconditionalTruth: 'v', status: 'frontier' };
    const { systemPrompt, prompt } = buildPlanRevisionPrompt({
      goal: 'Tema',
      nodes: [{ ...node, id: 'b', title: 'Base', level: 1, prerequisites: [] }, node],
      focus: node,
      failures: [{ questionText: 'Q?', chosenAnswer: 'x', correctAnswer: 'y', diagnosis: 'não distingue A de B', readingThoughts: 'travei no exemplo' }],
    });
    expect(systemPrompt).toContain('FUNDAÇÃO FALTANDO');
    expect(prompt).toContain('c | Conceito | nível 2');
    expect(prompt).toContain('não distingue A de B');
    expect(prompt).toContain('travei no exemplo');
  });
});

describe('levels never put a concept at or below what it depends on', () => {
  it('ignores a hint that would do it', () => {
    const nodes = sanitizeGraph([
      { id: 'a', title: 'A', level: 3, prerequisites: [] },
      { id: 'b', title: 'B', level: 2, prerequisites: ['a'] },
      { id: 'c', title: 'C', level: 1, prerequisites: ['b'] },
    ]);
    expect(nodes.map((n) => n.level)).toEqual([3, 4, 4]);
  });
});

describe('lesson and plan together (IPC)', () => {
  let handlers: Record<string, Function>;
  const ipc = () => {
    handlers = {};
    return { handle: vi.fn((c: string, l: Function) => (handlers[c] = l)), on: vi.fn((c: string, l: Function) => (handlers[c] = l)) } as any;
  };
  const toLessons = async () => {
    await handlers['session:start']({}, 'teaching', 'Redes');
    await handlers['session:submit-goal']({}, 'TCP e UDP');
    for (let i = 0; i < 8; i++) {
      const res = await handlers['session:submit-probe']({}, { selectedOptionIndex: 1, confidence: 90, thinkingText: 'x' });
      if (res.nextAction === 'transition_plan') break;
    }
    await handlers['session:confirm-plan']({});
  };
  /** Misses every verification of the current lesson until the concept goes back to the queue. */
  const exhaust = async () => {
    let step = await handlers['session:submit-prediction']({}, 'palpite');
    for (;;) {
      const res = await handlers['session:submit-check']({}, (step.checkQuestion.correctOptionIndex + 1) % 4, 80, 'chute');
      if (res.outcome !== 'retry_step') return res;
      step = await handlers['session:continue-lesson']({});
    }
  };
  let fsm: SessionStateMachine;
  const boot = (llm: LLMCaller, lessonLlm: LLMCaller = mockLLM) => {
    const store = new KnowledgeStore();
    fsm = new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(llm, noShuffle));
    const socratic = new SocraticEngine(lessonLlm, new CurriculumGenerator(mockLLM, noShuffle));
    registerIpcHandlers(ipc(), { fsm, store, socratic });
  };
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));

  it('when the repairs of a step run out, the missing foundation becomes the next lesson', async () => {
    const { llm } = llmWith(() => ({ add: [foundation('O que é um protocolo')], note: 'Vamos ver primeiro o que é um protocolo.' }));
    boot(llm);
    await toLessons();
    const first = await handlers['session:socratic-start']({});

    const res = await exhaust();
    expect(res.outcome).toBe('concept_requeued');
    expect(res.planRevision).toMatchObject({ nodeId: first.node.id, note: 'Vamos ver primeiro o que é um protocolo.' });
    expect(res.session.planRevisions).toHaveLength(1);

    const graph = await handlers['graph:get']({});
    expect(graph.map((n: ConceptNode) => n.id)).toContain('o-que-e-um-protocolo');
    expect((await handlers['session:socratic-start']({})).node.id).toBe('o-que-e-um-protocolo');
  });

  it('a planner that fails does not turn a recorded answer into an error', async () => {
    const { llm } = llmWith(() => new Error('fora do ar'));
    boot(llm);
    await toLessons();
    const first = await handlers['session:socratic-start']({});
    const res = await exhaust();
    expect(res.outcome).toBe('concept_requeued');
    expect(res.planRevision).toBeUndefined();
    // Nothing was decided, so the question can be put to the planner again on the next failure
    expect((await handlers['session:socratic-start']({})).node.id).toBe(first.node.id);
    expect((await exhaust()).planRevision).toBeUndefined();
  });

  it('pruning: a guess that already states the concept gets one confirmation, and a miss restarts the lesson without touching the plan', async () => {
    const { llm, calls } = llmWith(() => ({ add: [foundation('X')] }));
    const held: LLMCaller = async (o) => {
      const raw = await mockLLM(o);
      return (o.systemPrompt || '').includes('Plano de passos')
        ? JSON.stringify({ ...JSON.parse(raw), alreadyHeld: true, steps: ['a', 'b', 'c'] })
        : raw;
    };
    boot(llm, held);
    await toLessons();
    const first = await handlers['session:socratic-start']({});
    const opening = await handlers['session:submit-prediction']({}, 'palpite que já diz tudo');
    expect(opening.progress).toMatchObject({ shortcut: true, stepIndex: 0 });
    expect(opening.progress.steps).toHaveLength(1);

    const miss = await handlers['session:submit-check']({}, (opening.checkQuestion.correctOptionIndex + 1) % 4, 80, 'chute');
    expect(miss.outcome).toBe('concept_requeued');
    expect(miss.planRevision).toBeUndefined();
    expect(calls).toHaveLength(0);

    // After a miss the guess is no longer enough: the lesson comes back with its steps
    await handlers['session:socratic-start']({});
    const again = await handlers['session:submit-prediction']({}, 'palpite que já diz tudo');
    expect(again.progress.shortcut).toBeUndefined();
    expect(again.progress.steps).toEqual(['a', 'b', 'c']);

    // And a confirmation that lands masters the concept at once
    boot(llm, held);
    await toLessons();
    const start = await handlers['session:socratic-start']({});
    const conf = await handlers['session:submit-prediction']({}, 'palpite');
    const hit = await handlers['session:submit-check']({}, conf.checkQuestion.correctOptionIndex, 95, 'raciocínio');
    expect(hit.outcome).toBe('concept_mastered');
    expect(fsm.getState().nodesState[start.node.id]).toBe('mastered');
    expect(first.node.id).toBe(start.node.id);
  });
});
