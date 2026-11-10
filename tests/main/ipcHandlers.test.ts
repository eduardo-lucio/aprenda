import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerIpcHandlers } from '../../src/main/ipc/registerIpcHandlers';
import { SessionStateMachine } from '../../src/main/fsm/SessionStateMachine';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';
import { CurriculumGenerator } from '../../src/main/services/CurriculumGenerator';
import { mockJudge, mockLLM, noShuffle } from '../helpers/mockLLM';
import { SocraticEngine } from '../../src/main/socratic/SocraticEngine';

describe('IPC Handlers', () => {
  let handlers: Record<string, Function>;
  let mockIpcMain: any;
  let fsm: SessionStateMachine;
  let store: KnowledgeStore;
  let socratic: SocraticEngine;

  beforeEach(() => {
    handlers = {};
    mockIpcMain = {
      handle: vi.fn((channel: string, listener: Function) => {
        handlers[channel] = listener;
      }),
      on: vi.fn((channel: string, listener: Function) => {
        handlers[channel] = listener;
      }),
    };
    store = new KnowledgeStore();
    fsm = new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    socratic = new SocraticEngine(mockLLM, new CurriculumGenerator(mockLLM, noShuffle));
  });

  it('registers all required IPC channels on ipcMain', () => {
    registerIpcHandlers(mockIpcMain, { fsm, store, socratic });

    expect(mockIpcMain.handle).toHaveBeenCalledWith('session:start', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('session:submit-goal', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('session:submit-probe', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('session:advance-plan', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('session:confirm-plan', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('session:socratic-start', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('session:submit-prediction', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('session:submit-check', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('graph:get', expect.any(Function));
  });

  it('handles session:start and session:submit-goal correctly', async () => {
    registerIpcHandlers(mockIpcMain, { fsm, store, socratic });

    const session = await handlers['session:start']({}, 'teaching', 'Redes Camada 3');
    expect(session.phase).toBe('goal_orientation');
    expect(session.goal).toBe('Redes Camada 3');

    const firstQuestion = await handlers['session:submit-goal']({}, 'Aprofundar em TTL');
    expect(firstQuestion).toBeDefined();
    expect(firstQuestion.options.length).toBe(4);
  });

  it('returns empty graph before goal submission and populated graph after goal submission', async () => {
    registerIpcHandlers(mockIpcMain, { fsm, store, socratic });
    await handlers['session:start']({}, 'teaching', 'Álgebra Linear');

    const emptyNodes = await handlers['graph:get']({});
    expect(emptyNodes.length).toBe(0);

    await handlers['session:submit-goal']({}, 'Autovalores e Autovetores');
    const nodes = await handlers['graph:get']({});
    expect(nodes.length).toBeGreaterThanOrEqual(3);
    expect(nodes[0].status).toBe('untested');
  });
  it('repeats a concept until it is mastered and only then moves on, ending when all are mastered', async () => {
    registerIpcHandlers(mockIpcMain, { fsm, store, socratic });
    await handlers['session:start']({}, 'teaching', 'Redes');
    await handlers['session:submit-goal']({}, 'TCP e UDP');
    for (let i = 0; i < 8; i++) {
      const res = await handlers['session:submit-probe']({}, { selectedOptionIndex: 1, confidence: 90, thinkingText: 'x' });
      if (res.nextAction === 'transition_plan') break;
    }
    if (fsm.getState().phase === 'probing') await handlers['session:advance-plan']({});
    await handlers['session:confirm-plan']({});

    const pending = Object.values(fsm.getState().nodesState).filter((st) => st !== 'mastered').length;
    const taught: string[] = [];
    const lesson = async () => {
      const step = await handlers['session:socratic-start']({});
      if (step === null) return null;
      const { checkQuestion } = await handlers['session:submit-prediction']({}, 'minha previsão');
      return { id: step.node.id as string, right: checkQuestion.correctOptionIndex as number };
    };

    for (let guard = 0; guard < 30; guard++) {
      const first = await lesson();
      if (first === null) break;
      const wrong = await handlers['session:submit-check']({}, (first.right + 1) % 4, 80, 'palpite');
      expect(wrong.mastered).toBe(false);

      const retry = await lesson();
      expect(retry!.id).toBe(first.id);
      const right = await handlers['session:submit-check']({}, retry!.right, 95, 'raciocínio');
      expect(right.mastered).toBe(true);
      taught.push(first.id);
    }

    expect(taught).toHaveLength(pending);
    expect(new Set(taught).size).toBe(taught.length);
    expect(await handlers['session:socratic-start']({})).toBeNull();
  });

  it('D2: a concept taught in steps stays open until every step is demonstrated', async () => {
    // The opening of a lesson declares two steps; every other call behaves like the plain mock
    const stepped = async (o: any) => {
      const raw = await mockLLM(o);
      return (o.systemPrompt || '').includes('Plano de passos')
        ? JSON.stringify({ ...JSON.parse(raw), steps: ['Fato 1', 'Fato 2'] })
        : raw;
    };
    socratic = new SocraticEngine(stepped as any, new CurriculumGenerator(mockLLM, noShuffle));
    registerIpcHandlers(mockIpcMain, { fsm, store, socratic });
    await handlers['session:start']({}, 'teaching', 'Redes');
    await handlers['session:submit-goal']({}, 'TCP e UDP');
    for (let i = 0; i < 8; i++) {
      const res = await handlers['session:submit-probe']({}, { selectedOptionIndex: 1, confidence: 90, thinkingText: 'x' });
      if (res.nextAction === 'transition_plan') break;
    }
    if (fsm.getState().phase === 'probing') await handlers['session:advance-plan']({});
    await handlers['session:confirm-plan']({});

    const start = await handlers['session:socratic-start']({});
    const id = start.node.id as string;
    const opening = await handlers['session:submit-prediction']({}, 'palpite');
    expect(opening.progress).toMatchObject({ steps: ['Fato 1', 'Fato 2'], stepIndex: 0 });

    // Step 1 demonstrated: the lesson goes on, the concept is not mastered yet
    const one = await handlers['session:submit-check']({}, opening.checkQuestion.correctOptionIndex, 95, 'raciocínio');
    expect(one).toMatchObject({ mastered: true, outcome: 'next_step' });
    expect(fsm.getState().nodesState[id]).not.toBe('mastered');
    // An answered verification cannot be sent again
    await expect(handlers['session:submit-check']({}, 0, 95, 'de novo')).rejects.toThrow(/verificação ativa/);

    // Step 2 missed: the same step is explained again, from what the student said while reading
    const two = await handlers['session:continue-lesson']({});
    expect(two).toMatchObject({ isRetry: false, progress: { stepIndex: 1 } });
    const miss = await handlers['session:submit-check']({}, (two.checkQuestion.correctOptionIndex + 1) % 4, 80, 'chute', 'não entendi o exemplo');
    expect(miss).toMatchObject({ mastered: false, outcome: 'retry_step', progress: { stepIndex: 1, retries: 1 } });
    expect(fsm.getLessonFailures(id).at(-1)).toMatchObject({ readingThoughts: 'não entendi o exemplo' });

    const repair = await handlers['session:continue-lesson']({});
    expect(repair.isRetry).toBe(true);
    const done = await handlers['session:submit-check']({}, repair.checkQuestion.correctOptionIndex, 95, 'agora sim');
    expect(done).toMatchObject({ mastered: true, outcome: 'concept_mastered' });
    expect(done.progress).toBeUndefined();
    expect(fsm.getState().nodesState[id]).toBe('mastered');
    await expect(handlers['session:continue-lesson']({})).rejects.toThrow(/andamento/);
  });

  it('D2: after two repairs of the same step the concept goes back to the queue', async () => {
    registerIpcHandlers(mockIpcMain, { fsm, store, socratic });
    await handlers['session:start']({}, 'teaching', 'Redes');
    await handlers['session:submit-goal']({}, 'TCP e UDP');
    for (let i = 0; i < 8; i++) {
      const res = await handlers['session:submit-probe']({}, { selectedOptionIndex: 1, confidence: 90, thinkingText: 'x' });
      if (res.nextAction === 'transition_plan') break;
    }
    if (fsm.getState().phase === 'probing') await handlers['session:advance-plan']({});
    await handlers['session:confirm-plan']({});

    const start = await handlers['session:socratic-start']({});
    let step = await handlers['session:submit-prediction']({}, 'palpite');
    const outcomes: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await handlers['session:submit-check']({}, (step.checkQuestion.correctOptionIndex + 1) % 4, 80, 'chute');
      outcomes.push(res.outcome);
      if (res.outcome === 'retry_step') step = await handlers['session:continue-lesson']({});
    }
    expect(outcomes).toEqual(['retry_step', 'retry_step', 'concept_requeued']);
    expect(fsm.getLessonFailures(start.node.id)).toHaveLength(3);
    // The concept is still the next lesson, opened again from the guess
    expect((await handlers['session:socratic-start']({})).node.id).toBe(start.node.id);
  });

  it('still lets the student re-open a specific concept explicitly', async () => {
    registerIpcHandlers(mockIpcMain, { fsm, store, socratic });
    await handlers['session:start']({}, 'teaching', 'Redes');
    await handlers['session:submit-goal']({}, 'TCP e UDP');
    const nodeId = store.getNodes()[0].id;

    // I7: lessons wait for the diagnosis and the plan
    await expect(handlers['session:socratic-start']({}, nodeId)).rejects.toThrow(/depois do diagnóstico/i);
    for (let i = 0; i < 8; i++) {
      const res = await handlers['session:submit-probe']({}, { selectedOptionIndex: 1, confidence: 90, thinkingText: 'x' });
      if (res.nextAction === 'transition_plan') break;
    }
    if (fsm.getState().phase === 'probing') await handlers['session:advance-plan']({});
    await handlers['session:confirm-plan']({});

    const step = await handlers['session:socratic-start']({}, nodeId);
    expect(step.node.id).toBe(nodeId);
    await expect(handlers['session:socratic-start']({}, 'nao-existe')).rejects.toThrow(/não encontrado/i);
  });
});
