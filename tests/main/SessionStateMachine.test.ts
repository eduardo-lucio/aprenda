import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionStateMachine } from '../../src/main/fsm/SessionStateMachine';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';
import { CurriculumGenerator } from '../../src/main/services/CurriculumGenerator';
import { CognitiveJudgeService } from '../../src/main/services/CognitiveJudgeService';
import { mockJudge, mockLLM, noShuffle } from '../helpers/mockLLM';
import { emitTokenUsage, type LLMCaller } from '../../src/main/services/llmClient';

describe('SessionStateMachine', () => {
  let store: KnowledgeStore;
  let fsm: SessionStateMachine;

  beforeEach(() => {
    store = new KnowledgeStore();
    fsm = new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
  });

  it('initializes session in goal_orientation phase', async () => {
    await fsm.startSession('teaching', 'Quero dominar Camada 3 e TTL');
    const state = fsm.getState();
    expect(state.phase).toBe('goal_orientation');
    expect(state.goalClarificationOptions).toBeDefined();
    expect(state.goalClarificationOptions!.length).toBeGreaterThan(0);
  });

  it('moves to probing upon goal clarification and loads first question', async () => {
    await fsm.startSession('teaching', 'Camada 3 e Roteamento');
    const question = await fsm.submitGoalClarification('Entender roteamento e TTL');
    const state = fsm.getState();
    expect(state.phase).toBe('probing');
    expect(question).toBeDefined();
    expect(question.options.length).toBe(4);
    expect(state.questionCount).toBe(1);
  });

  it('enforces a strict floor of 8 questions before automatic transition', async () => {
    await fsm.startSession('teaching', 'Redes Camada 3');
    await fsm.submitGoalClarification('Foco total em Camada 3');

    // Submit 7 answers
    for (let i = 1; i <= 7; i++) {
      const res = await fsm.submitProbeAnswer({
        selectedOptionIndex: 0,
        confidence: 90,
        thinkingText: 'Raciocínio consistente sobre a operação de redes.',
      });
      expect(res.nextAction).toBe('next_question');
      expect(fsm.getState().phase).toBe('probing');
      expect(fsm.getState().questionCount).toBe(i + 1);
    }
  });

  it('honours a configurable minimum of probe questions (clamped to 3–20)', async () => {
    const f = new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    f.setMinProbeQuestions(3);
    expect(f.getMinProbeQuestions()).toBe(3);
    f.setMinProbeQuestions(1);
    expect(f.getMinProbeQuestions()).toBe(3);
    f.setMinProbeQuestions(99);
    expect(f.getMinProbeQuestions()).toBe(20);

    f.setMinProbeQuestions(3);
    await f.startSession('teaching', 'Redes Camada 3');
    await f.submitGoalClarification('Foco total em Camada 3');
    await expect(f.advanceToPlan()).rejects.toThrow(/3 questões/);
    for (let i = 1; i <= 3; i++) {
      await f.submitProbeAnswer({ selectedOptionIndex: 0, confidence: 70, thinkingText: 'Raciocínio.' });
    }
    expect(f.getState().attempts).toHaveLength(3);
    await f.advanceToPlan();
    expect(f.getState().phase).toBe('plan_review');
  });

  it('allows manual advanceToPlan only after question 8, then confirmPlan starts teaching', async () => {
    const f = new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    await f.startSession('teaching', 'Redes Camada 3');
    await f.submitGoalClarification('Foco total em Camada 3');

    await expect(f.advanceToPlan()).rejects.toThrow();

    for (let i = 1; i <= 7; i++) {
      await f.submitProbeAnswer({ selectedOptionIndex: 0, confidence: 70, thinkingText: 'Raciocínio detalhado.' });
    }
    expect(f.getState().questionCount).toBe(8);
    // The question on screen does not count until it is answered
    await expect(f.advanceToPlan()).rejects.toThrow();

    await f.submitProbeAnswer({ selectedOptionIndex: 0, confidence: 70, thinkingText: 'Raciocínio detalhado.' });
    if (f.getState().phase === 'probing') await f.advanceToPlan();
    const planned = f.getState();
    expect(planned.phase).toBe('plan_review');
    expect(planned.plan).toBeTruthy();
    expect(planned.currentQuestion).toBeUndefined();

    f.confirmPlan();
    expect(f.getState().phase).toBe('teaching');
  });

  it('rejects confirmPlan outside plan_review', async () => {
    await fsm.startSession('teaching', 'Redes');
    expect(() => fsm.confirmPlan()).toThrow();
  });

  it('accepts a "Não sei" answer without confidence', async () => {
    await fsm.startSession('teaching', 'Redes');
    await fsm.submitGoalClarification('Redes e TCP');
    const res = await fsm.submitProbeAnswer({ selectedOptionIndex: -1, thinkingText: 'Não sei.' });
    expect(res.attempt.confidence).toBeUndefined();
    expect(res.attempt.verdict).toBe('frontier');
  });

  it('regresses to prerequisites (Zoom-In) when an answer is wrong', async () => {
    await fsm.startSession('teaching', 'TTL');
    await fsm.submitGoalClarification('TTL e Loops');

    // Advance until we reach a node with prerequisites (Level >= 2)
    while (store.getPrerequisites(fsm.getState().currentQuestion!.nodeId).length === 0) {
      await fsm.submitProbeAnswer({
        selectedOptionIndex: fsm.getState().currentQuestion!.correctOptionIndex,
        confidence: 95,
        thinkingText: 'Raciocínio completo e correto sobre o fundamento.',
      });
    }

    const currentQ = fsm.getState().currentQuestion!;
    expect(currentQ).toBeDefined();
    const prereqsOfCurrent = store.getPrerequisites(currentQ.nodeId).map((n) => n.id);
    for (const pid of prereqsOfCurrent) {
      (fsm as any).session.nodesState[pid] = 'untested';
    }

    // Answer wrong with low confidence: the judge returns frontier
    const res = await fsm.submitProbeAnswer({
      selectedOptionIndex: (currentQ.correctOptionIndex + 1) % 4,
      confidence: 30,
      thinkingText: 'Chutei por eliminação.',
    });

    expect(res.attempt.verdict).toBe('frontier');
    // Zoom-in: next question should target prerequisite
    expect(res.nextQuestion).toBeDefined();
    expect(prereqsOfCurrent).toContain(res.nextQuestion!.nodeId);
  });

  it('propagates mastery down to unconditional roots on solid answers', async () => {
    await fsm.startSession('teaching', 'ICMP');
    await fsm.submitGoalClarification('ICMP e Diagnóstico');

    // Assume current question is osi-l3-icmp (or similar L3 node)
    const currentQ = fsm.getState().currentQuestion!;

    // Answer with solid mastery
    const res = await fsm.submitProbeAnswer({
      selectedOptionIndex: currentQ.correctOptionIndex,
      confidence: 95,
      thinkingText: 'Explicação detalhada e correta sobre o protocolo.',
    });

    expect(res.attempt.verdict).toBe('mastered');
    const state = fsm.getState();
    expect(state.nodesState[currentQ.nodeId]).toBe('mastered');
  });

  it('tracks tokensUsed accurately across session LLM operations and resets on new session', async () => {
    await fsm.startSession('teaching', 'Tokens test');
    expect(fsm.getState().tokensUsed).toBe(0);

    emitTokenUsage({ promptTokens: 120, completionTokens: 80, totalTokens: 200 });
    expect(fsm.getState().tokensUsed).toBe(200);

    emitTokenUsage({ promptTokens: 300, completionTokens: 150, totalTokens: 450 });
    expect(fsm.getState().tokensUsed).toBe(650);

    // Starting a new session resets tokensUsed back to 0
    await fsm.startSession('practice', 'New session');
    expect(fsm.getState().tokensUsed).toBe(0);
  });
});

describe('SessionStateMachine without AI fallbacks', () => {
  it('rejects instead of serving a pre-baked template when the AI fails', async () => {
    const failing = new CurriculumGenerator(async () => {
      throw new Error('boom');
    });
    const fsm = new SessionStateMachine(new KnowledgeStore(), mockJudge(), failing);
    await expect(fsm.startSession('teaching', 'Eu quero aprender sobre tcp/udp')).rejects.toThrow();
    expect(fsm.hasSession()).toBe(false);
  });
});

describe('SessionStateMachine rollback when the next question cannot be generated', () => {
  it('keeps the state untouched and explains what to do, so the student can resubmit', async () => {
    let failQuestions = false;
    // Question generation is the only call that uses maxTokens 2048
    const flaky = async (opts: any) => (failQuestions && opts.maxTokens === 2048 ? '{}' : mockLLM(opts));
    const f = new SessionStateMachine(new KnowledgeStore(), mockJudge(), new CurriculumGenerator(flaky as any));
    await f.startSession('teaching', 'Redes Camada 3');
    await f.submitGoalClarification('Foco total em Camada 3');
    const before = f.getState();

    failQuestions = true;
    const err: any = await f
      .submitProbeAnswer({ selectedOptionIndex: 0, confidence: 70, thinkingText: 'Raciocínio.' })
      .catch((e) => e);
    expect(String(err.message)).toMatch(/NÃO foi registrada/);
    expect(String(err.message)).toMatch(/Configurações → Modelo/);

    const after = f.getState();
    expect(after.attempts).toHaveLength(0);
    expect(after.questionCount).toBe(before.questionCount);
    expect(after.currentQuestion?.id).toBe(before.currentQuestion?.id);
    expect(after.nodesState).toEqual(before.nodesState);

    // Resubmitting once the provider recovers records exactly one attempt
    failQuestions = false;
    await f.submitProbeAnswer({ selectedOptionIndex: 0, confidence: 70, thinkingText: 'Raciocínio.' });
    expect(f.getState().attempts).toHaveLength(1);
  });
});

describe('SessionStateMachine probing regressions', () => {
  const newFsm = (judge = mockJudge()) =>
    new SessionStateMachine(new KnowledgeStore(), judge, new CurriculumGenerator(mockLLM, noShuffle));

  it('never asks the same question twice when the floor exceeds the number of concepts', async () => {
    const f = newFsm();
    f.setMinProbeQuestions(12); // the mock graph has only 8 concepts
    await f.startSession('teaching', 'Redes');
    await f.submitGoalClarification('TCP vs UDP');

    const asked: string[] = [];
    for (let i = 0; i < 12; i++) {
      asked.push(f.getState().currentQuestion!.questionText);
      // Wrong answers keep every concept non-mastered, so concepts get re-probed
      const res = await f.submitProbeAnswer({ selectedOptionIndex: 1, confidence: 90, thinkingText: 'x' });
      if (res.nextAction === 'transition_plan') break;
    }

    expect(asked.length).toBe(12);
    expect(new Set(asked).size).toBe(asked.length);
  });

  it('grades a written answer by its content instead of treating it as "Não sei"', async () => {
    const f = newFsm();
    await f.startSession('teaching', 'Redes');
    await f.submitGoalClarification('TCP e UDP');

    const res = await f.submitProbeAnswer({
      selectedOptionIndex: -1,
      answerKind: 'own_answer',
      confidence: 90,
      thinkingText: '[Resposta própria] A camada de transporte entrega dados fim a fim entre processos.',
    });
    expect(res.attempt.verdict).toBe('mastered');
    expect(res.attempt.answerKind).toBe('own_answer');
    expect(res.attempt.confidence).toBe(90);
  });

  it('keeps "Não sei" as frontier (no answer kind stored)', async () => {
    const f = newFsm();
    await f.startSession('teaching', 'Redes');
    await f.submitGoalClarification('TCP e UDP');
    const res = await f.submitProbeAnswer({ selectedOptionIndex: -1, answerKind: 'dont_know', thinkingText: 'Não sei.' });
    expect(res.attempt.verdict).toBe('frontier');
    expect(res.attempt.answerKind).toBeUndefined();
  });

  it('rolls back and does not record a (fake mastered) attempt when the judge is unavailable', async () => {
    let judgeDown = false;
    const flakyJudge = new CognitiveJudgeService(async (o) => {
      if (judgeDown) throw new Error('Network timeout');
      return mockLLM(o);
    });
    const f = newFsm(flakyJudge);
    await f.startSession('teaching', 'Redes');
    await f.submitGoalClarification('TCP e UDP');
    const before = f.getState();

    judgeDown = true;
    const err: any = await f
      .submitProbeAnswer({ selectedOptionIndex: 0, confidence: 40, thinkingText: 'Chute por eliminação.' })
      .catch((e) => e);
    expect(String(err.message)).toMatch(/NÃO foi registrada/);

    const after = f.getState();
    expect(after.attempts).toHaveLength(0);
    expect(after.nodesState).toEqual(before.nodesState);
    expect(after.currentQuestion?.id).toBe(before.currentQuestion?.id);

    judgeDown = false;
    const ok = await f.submitProbeAnswer({ selectedOptionIndex: 0, confidence: 40, thinkingText: 'Chute por eliminação.' });
    expect(ok.attempt.verdict).toBe('mastered');
    expect(f.getState().attempts).toHaveLength(1);
  });
});

describe('SessionStateMachine teaching pass', () => {
  const check = {
    questionText: 'Qual afirmação está correta?',
    options: ['A', 'B', 'C', 'D'],
    correctOptionIndex: 0,
    explanation: 'Porque A.',
  };

  async function toTeaching() {
    const f = new SessionStateMachine(new KnowledgeStore(), mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    await f.startSession('teaching', 'Redes');
    await f.submitGoalClarification('TCP e UDP');
    for (let i = 0; i < 8; i++) {
      const res = await f.submitProbeAnswer({ selectedOptionIndex: 1, confidence: 90, thinkingText: 'x' });
      if (res.nextAction === 'transition_plan') break;
    }
    if (f.getState().phase === 'probing') await f.advanceToPlan();
    f.confirmPlan();
    return f;
  }

  it('does not advance past a concept until it is mastered', async () => {
    const f = await toTeaching();
    const first = f.nextTeachingNodeId()!;

    for (let tries = 0; tries < 3; tries++) {
      await f.recordCheckVerdict(first, check, { selectedOptionIndex: 1, confidence: 90, thinkingText: 'x' });
      expect(f.getState().nodesState[first]).not.toBe('mastered');
      expect(f.nextTeachingNodeId()).toBe(first);
    }
    expect(f.getLessonFailures(first)).toHaveLength(3);
    expect(f.getLessonFailures(first)[0]).toMatchObject({ questionText: check.questionText });

    await f.recordCheckVerdict(first, check, { selectedOptionIndex: 0, confidence: 95, thinkingText: 'x' });
    expect(f.getState().nodesState[first]).toBe('mastered');
    expect(f.nextTeachingNodeId()).not.toBe(first);
    expect(f.getLessonFailures(first)).toHaveLength(0);
  });

  it('D2: mastering a step that is not the last one does not master the concept', async () => {
    const f = await toTeaching();
    const first = f.nextTeachingNodeId()!;
    const before = f.getState().nodesState[first];

    const verdict = await f.recordCheckVerdict(
      first,
      check,
      { selectedOptionIndex: 0, confidence: 95, thinkingText: 'x' },
      { conceptDone: false }
    );
    expect(verdict).toBe('mastered');
    expect(f.getState().nodesState[first]).toBe(before);
    expect(f.nextTeachingNodeId()).toBe(first);

    // A miss on any step marks the concept and keeps what the student was thinking while reading
    await f.recordCheckVerdict(
      first,
      check,
      { selectedOptionIndex: 1, confidence: 90, thinkingText: 'x' },
      { conceptDone: false, readingThoughts: '  o exemplo me confundiu ' }
    );
    expect(f.getState().nodesState[first]).not.toBe('mastered');
    expect(f.getLessonFailures(first).at(-1)).toMatchObject({ readingThoughts: 'o exemplo me confundiu' });

    await f.recordCheckVerdict(first, check, { selectedOptionIndex: 0, confidence: 95, thinkingText: 'x' }, { conceptDone: true });
    expect(f.getState().nodesState[first]).toBe('mastered');
    expect(f.getLessonFailures(first)).toHaveLength(0);
  });

  it('teaches the most basic concepts first, whatever order the plan proposes', async () => {
    const f = await toTeaching();
    const levelOf = new Map(f.getSnapshot().nodes.map((n) => [n.id, n.level]));
    const order = f.getSnapshot().teachingOrder;
    const scrambled = JSON.parse(JSON.stringify(f.getSnapshot()));
    scrambled.teachingOrder = [...order].reverse();

    const restored = new SessionStateMachine(new KnowledgeStore(), mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    restored.restoreSnapshot(scrambled);
    const levels = restored.getSnapshot().teachingOrder.map((id) => levelOf.get(id)!);
    expect(levels).toEqual([...levels].sort((x, y) => x - y));
  });

  it('keeps the failed concept and its mistakes across a restart', async () => {
    const f = await toTeaching();
    const first = f.nextTeachingNodeId()!;
    await f.recordCheckVerdict(first, check, { selectedOptionIndex: 1, confidence: 90, thinkingText: 'x' });

    const restored = new SessionStateMachine(new KnowledgeStore(), mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    restored.restoreSnapshot(JSON.parse(JSON.stringify(f.getSnapshot())));
    expect(restored.nextTeachingNodeId()).toBe(first);
    expect(restored.getLessonFailures(first)).toHaveLength(1);
  });
});

describe('SessionStateMachine probe direction (D3)', () => {
  const start = async (min = 3) => {
    const llm = vi.fn(mockLLM);
    const f = new SessionStateMachine(
      new KnowledgeStore(),
      mockJudge(),
      new CurriculumGenerator(llm as unknown as LLMCaller, noShuffle)
    );
    f.setMinProbeQuestions(min);
    await f.startSession('teaching', 'Redes');
    await f.submitGoalClarification('TCP e UDP');
    return { f, llm };
  };
  const levelOf = (f: SessionStateMachine, id: string) => f.getSnapshot().nodes.find((n) => n.id === id)!.level;

  it('opens at the top of the map', async () => {
    const { f } = await start();
    expect(levelOf(f, f.getState().currentQuestion!.nodeId)).toBe(4);
  });

  it('generates its own top question when the map comes without a usable one', async () => {
    const noFirst: LLMCaller = async (o) => {
      const raw = await mockLLM(o);
      if (!(o.systemPrompt || '').includes('Arquiteto Curricular')) return raw;
      const { firstQuestion: _dropped, ...graph } = JSON.parse(raw);
      return JSON.stringify(graph);
    };
    const f = new SessionStateMachine(new KnowledgeStore(), mockJudge(), new CurriculumGenerator(noFirst, noShuffle));
    await f.startSession('teaching', 'Redes');
    await f.submitGoalClarification('TCP e UDP');
    expect(levelOf(f, f.getState().currentQuestion!.nodeId)).toBe(4);
  });

  it('a student who knows nothing is located in a few questions, without asking what sits above a miss', async () => {
    const { f, llm } = await start();
    const asked: string[] = [];
    while (f.getState().phase === 'probing') {
      asked.push(f.getState().currentQuestion!.nodeId);
      await f.submitProbeAnswer({ selectedOptionIndex: -1, thinkingText: 'Não sei.' });
    }
    // n7 → n4 (middle of what is below) → n1 and n2 (the base)
    expect(asked).toEqual(['n7', 'n4', 'n1', 'n2']);
    const state = f.getState();
    expect(state.phase).toBe('plan_review');
    expect(state.frontierClarity).toBe(100);
    for (const id of ['n3', 'n5', 'n6', 'n8']) expect(state.nodesState[id]).toBe('untested');

    const n7 = state.probeSummary!.find((s) => s.topId === 'n7')!;
    expect(n7.floor).toEqual([]);
    expect([...n7.ceiling].sort()).toEqual(['n1', 'n2']);
    const planCall = llm.mock.calls.map(([o]) => o).find((o) => (o.systemPrompt || '').includes('Planejador'))!;
    expect(planCall.prompt).toContain('teto (onde quebra)');
  });

  it('a student who holds the goal is never asked the basics, and each top gets a harder second question', async () => {
    const { f, llm } = await start();
    const asked: string[] = [];
    while (f.getState().phase === 'probing') {
      const q = f.getState().currentQuestion!;
      asked.push(q.nodeId);
      await f.submitProbeAnswer({ selectedOptionIndex: q.correctOptionIndex, confidence: 95, thinkingText: 'Raciocínio sólido.' });
    }
    expect(asked).toEqual(['n7', 'n7', 'n8', 'n8']);
    expect(Object.values(f.getState().nodesState).every((s) => s === 'mastered')).toBe(true);

    const harder = llm.mock.calls.map(([o]) => o).filter((o) => (o.systemPrompt || '').includes('ESCALADA'));
    expect(harder).toHaveLength(2);
    expect(harder[0].systemPrompt).toContain('O que o TCP faz ao detectar perda de segmentos?');
  });

  it('a hit after a miss brackets the line: floor below, ceiling above', async () => {
    const { f } = await start(8);
    await f.submitProbeAnswer({ selectedOptionIndex: -1, thinkingText: 'Não sei.' }); // n7 missed
    const q = f.getState().currentQuestion!;
    expect(q.nodeId).toBe('n4');
    await f.submitProbeAnswer({ selectedOptionIndex: q.correctOptionIndex, confidence: 95, thinkingText: 'Sólido.' });
    const state = f.getState();
    expect(state.nodesState).toMatchObject({ n7: 'frontier', n4: 'mastered', n1: 'mastered', n2: 'mastered' });
    // Only n5 is left between the floor and the ceiling
    expect(state.currentQuestion!.nodeId).toBe('n5');
  });

  it('resumes a session saved by a version that kept a candidate queue', async () => {
    const { f } = await start(8);
    await f.submitProbeAnswer({ selectedOptionIndex: -1, thinkingText: 'Não sei.' });
    const old = { ...JSON.parse(JSON.stringify(f.getSnapshot())), candidateQueue: ['n1', 'n2', 'n3'] };
    const restored = new SessionStateMachine(new KnowledgeStore(), mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    restored.restoreSnapshot(old);
    const res = await restored.submitProbeAnswer({ selectedOptionIndex: -1, thinkingText: 'Não sei.' });
    expect(res.nextQuestion!.nodeId).toBe('n1');
  });
});
