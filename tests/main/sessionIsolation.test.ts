import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerIpcHandlers } from '../../src/main/ipc/registerIpcHandlers';
import { SessionStateMachine } from '../../src/main/fsm/SessionStateMachine';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';
import { CurriculumGenerator } from '../../src/main/services/CurriculumGenerator';
import { SocraticEngine } from '../../src/main/socratic/SocraticEngine';
import { SessionRepository } from '../../src/main/persistence/SessionRepository';
import type { CallLLMOptions, LLMCaller } from '../../src/main/services/llmClient';
import { mockJudge, mockLLM, noShuffle } from '../helpers/mockLLM';
import { CognitiveJudgeService } from '../../src/main/services/CognitiveJudgeService';
import fs from 'fs';
import os from 'os';
import path from 'path';

/** LLM that holds every call whose system prompt matches until `release()` is called. */
function gatedLLM(match: (o: CallLLMOptions) => boolean) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let entered!: () => void;
  const reached = new Promise<void>((r) => (entered = r));
  let armed = false;
  const llm: LLMCaller = async (o) => {
    if (armed && match(o)) {
      entered();
      await gate;
    }
    return mockLLM(o);
  };
  return {
    llm,
    arm: () => {
      armed = true;
    },
    reached,
    release: () => release(),
  };
}

const isGraph = (o: CallLLMOptions) => (o.systemPrompt || '').includes('Arquiteto Curricular');

function tempRepo(): SessionRepository {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aprenda-test-'));
  return new SessionRepository(path.join(dir, 'sessions.json'));
}

describe('session isolation', () => {
  let store: KnowledgeStore;

  beforeEach(() => {
    store = new KnowledgeStore();
  });

  it('F3: a graph generated for session A is dropped if another session became active', async () => {
    const gated = gatedLLM(isGraph);
    const fsm = new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(gated.llm));
    await fsm.startSession('teaching', 'Sessão A');
    gated.arm();

    const pending = fsm.submitGoalClarification('Foco de A');
    await gated.reached;
    await fsm.startSession('teaching', 'Sessão B');
    const idB = fsm.getState().id;
    gated.release();

    await expect(pending).rejects.toThrow(/SessionChanged|sessão mudou/i);
    expect(fsm.getState().id).toBe(idB);
    expect(fsm.getState().phase).toBe('goal_orientation');
    expect(store.getNodes()).toHaveLength(0);
  });

  it('F3: a verdict for session A is not applied to session B', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let entered!: () => void;
    const reached = new Promise<void>((r) => (entered = r));
    let hold = false;
    const judgeLLM: LLMCaller = async (o) => {
      if (hold) {
        entered();
        await gate;
      }
      return mockLLM(o);
    };
    const fsm = new SessionStateMachine(store, new CognitiveJudgeService(judgeLLM), new CurriculumGenerator(mockLLM, noShuffle));

    await fsm.startSession('teaching', 'Sessão A');
    await fsm.submitGoalClarification('Foco de A');
    const snapshotA = fsm.getSnapshot();
    await new Promise((r) => setTimeout(r, 0));

    await fsm.startSession('teaching', 'Sessão B');
    await fsm.submitGoalClarification('Foco de B');
    const snapshotB = fsm.getSnapshot();

    fsm.restoreSnapshot(snapshotA);
    hold = true;
    const pending = fsm.submitProbeAnswer({ selectedOptionIndex: 0, confidence: 70, thinkingText: 'x' });
    await reached;
    fsm.restoreSnapshot(snapshotB);
    release();

    await expect(pending).rejects.toThrow(/SessionChanged|sessão mudou/i);
    expect(fsm.getState().id).toBe(snapshotB.session.id);
    expect(fsm.getState().attempts).toHaveLength(0);
    expect(fsm.getSnapshot().candidateQueue).toEqual(snapshotB.candidateQueue);
    expect(fsm.getSnapshot().askedQuestions).toEqual(snapshotB.askedQuestions);
  });

  it('F12: a new session never inherits the previous graph', async () => {
    const fsm = new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    await fsm.startSession('teaching', 'Sessão A');
    await fsm.submitGoalClarification('Foco de A');
    expect(store.getNodes().length).toBeGreaterThan(0);

    await fsm.startSession('teaching', 'Sessão B');
    expect(store.getNodes()).toHaveLength(0);
    expect(fsm.getSnapshot().nodes).toHaveLength(0);
    expect(fsm.getState().nodesState).toEqual({});
  });

  it('I12: keeps the typed topic apart from the chosen focus', async () => {
    const fsm = new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    await fsm.startSession('teaching', 'Quero aprender redes');
    await fsm.submitGoalClarification('Foco em TTL');
    expect(fsm.getState().topic).toBe('Quero aprender redes');
    expect(fsm.getState().goal).toBe('Foco em TTL');
  });

  it('I12: the saved list uses the topic and falls back to the goal for older sessions', () => {
    const repo = tempRepo();
    const base = { nodes: [], candidateQueue: [], askedQuestions: [], teachingOrder: [], tokensUsed: 0 };
    const session = {
      mode: 'teaching' as const,
      disciplineId: 'd',
      phase: 'probing' as const,
      questionCount: 1,
      frontierClarity: 0,
      attempts: [],
      nodesState: {},
    };
    repo.saveSnapshot({ ...base, session: { ...session, id: 'a', goal: 'Foco', topic: 'Tema digitado' } });
    repo.saveSnapshot({ ...base, session: { ...session, id: 'b', goal: 'Só o foco' } });
    const titles = Object.fromEntries(repo.list().map((s) => [s.id, s.title]));
    expect(titles).toEqual({ a: 'Tema digitado', b: 'Só o foco' });
  });

  it('endSession drops the active session and its graph', async () => {
    const fsm = new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    await fsm.startSession('teaching', 'Sessão A');
    await fsm.submitGoalClarification('Foco de A');
    fsm.endSession();
    expect(fsm.hasSession()).toBe(false);
    expect(store.getNodes()).toHaveLength(0);
    expect(fsm.getActiveSessionId()).toBeUndefined();
  });
});

describe('session IPC lifecycle', () => {
  let handlers: Record<string, Function>;
  let store: KnowledgeStore;
  let repository: SessionRepository;
  let socratic: SocraticEngine;
  const ipc = () =>
    ({
      handle: vi.fn((c: string, l: Function) => {
        handlers[c] = l;
      }),
      on: vi.fn((c: string, l: Function) => {
        handlers[c] = l;
      }),
    }) as any;

  beforeEach(() => {
    handlers = {};
    store = new KnowledgeStore();
    repository = tempRepo();
    socratic = new SocraticEngine(mockLLM, new CurriculumGenerator(mockLLM, noShuffle));
  });

  it('F6: deleting the active session ends it, so nothing writes it back', async () => {
    const fsm = new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    registerIpcHandlers(ipc(), { fsm, store, socratic, repository });
    const s = await handlers['session:start']({}, 'teaching', 'Tema');
    expect(repository.get(s.id)).toBeDefined();

    await handlers['session:delete']({}, s.id);

    expect(fsm.hasSession()).toBe(false);
    expect(repository.get(s.id)).toBeUndefined();
    expect(await handlers['session:get']({})).toBeNull();
  });

  it('F6: deleting another session leaves the active one alone', async () => {
    const fsm = new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    registerIpcHandlers(ipc(), { fsm, store, socratic, repository });
    const a = await handlers['session:start']({}, 'teaching', 'A');
    await new Promise((r) => setTimeout(r, 2));
    const b = await handlers['session:start']({}, 'teaching', 'B');
    await handlers['session:delete']({}, a.id);
    expect(fsm.getState().id).toBe(b.id);
  });

  it('F5: loading the active session returns its saved UI without restoring over it', async () => {
    const fsm = new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    registerIpcHandlers(ipc(), { fsm, store, socratic, repository });
    const s = await handlers['session:start']({}, 'teaching', 'Tema');
    await handlers['session:save-ui']({}, s.id, { chatMessages: [{ id: 'm', role: 'user', text: 'oi', timestamp: 1 }] });
    const restore = vi.spyOn(fsm, 'restoreSnapshot');

    const loaded = await handlers['session:load']({}, s.id);

    expect(restore).not.toHaveBeenCalled();
    expect(loaded.session.id).toBe(s.id);
    expect(loaded.ui.chatMessages).toHaveLength(1);
  });

  it('F3: refuses to switch or delete sessions while a foreground call is running', async () => {
    const gated = gatedLLM(isGraph);
    const fsm = new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(gated.llm));
    registerIpcHandlers(ipc(), { fsm, store, socratic, repository });
    const s = await handlers['session:start']({}, 'teaching', 'Tema');
    gated.arm();

    const pending = handlers['session:submit-goal']({}, 'Foco');
    await gated.reached;

    await expect(handlers['session:load']({}, s.id)).rejects.toThrow(/aguarde|wait/i);
    await expect(handlers['session:delete']({}, s.id)).rejects.toThrow(/aguarde|wait/i);
    await expect(handlers['session:start']({}, 'teaching', 'Outro')).rejects.toThrow(/aguarde|wait/i);

    gated.release();
    await pending;
    await expect(handlers['session:load']({}, s.id)).resolves.toBeDefined();
  });

  it('I8: the prediction cache does not leak between sessions', async () => {
    const llm = vi.fn(mockLLM);
    const engine = new SocraticEngine(llm as LLMCaller, new CurriculumGenerator(llm as LLMCaller));
    const node = {
      id: 'mesmo-id',
      title: 'Conceito',
      summary: 'Resumo.',
      level: 1,
      prerequisites: [],
      unconditionalTruth: 'Verdade.',
      status: 'untested' as const,
    };
    await engine.generatePredictStep(node, 'Tema A');
    const calls = llm.mock.calls.length;
    await engine.generatePredictStep(node, 'Tema A');
    expect(llm.mock.calls.length).toBe(calls);

    engine.reset();
    await engine.generatePredictStep(node, 'Tema B');
    expect(llm.mock.calls.length).toBe(calls + 1);
  });
});
