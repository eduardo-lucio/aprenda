import { describe, it, expect, beforeEach } from 'vitest';
import { SessionStateMachine } from '../../src/main/fsm/SessionStateMachine';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';
import { CurriculumGenerator } from '../../src/main/services/CurriculumGenerator';
import { CognitiveJudgeService } from '../../src/main/services/CognitiveJudgeService';
import { mockJudge, mockLLM, noShuffle } from '../helpers/mockLLM';
import { emitTokenUsage } from '../../src/main/services/llmClient';

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

  it('moves on to the next concept after a failed check instead of repeating it', async () => {
    const f = await toTeaching();
    const pending = Object.entries(f.getState().nodesState).filter(([, st]) => st !== 'mastered').length;
    expect(pending).toBeGreaterThan(1);

    const visited: string[] = [];
    for (let guard = 0; guard < 50; guard++) {
      const id = f.nextTeachingNodeId();
      if (!id) break;
      visited.push(id);
      // Wrong answer: the concept stays non-mastered
      await f.recordCheckVerdict(id, check, { selectedOptionIndex: 1, confidence: 90, thinkingText: 'x' });
      expect(f.getState().nodesState[id]).not.toBe('mastered');
    }

    expect(visited).toHaveLength(pending);
    expect(new Set(visited).size).toBe(visited.length);
    expect(f.nextTeachingNodeId()).toBeUndefined();
  });

  it('skips concepts mastered during the check and keeps the pass across a restart', async () => {
    const f = await toTeaching();
    const first = f.nextTeachingNodeId()!;
    await f.recordCheckVerdict(first, check, { selectedOptionIndex: 0, confidence: 95, thinkingText: 'x' });
    expect(f.getState().nodesState[first]).toBe('mastered');

    const second = f.nextTeachingNodeId()!;
    expect(second).not.toBe(first);
    await f.recordCheckVerdict(second, check, { selectedOptionIndex: 1, confidence: 90, thinkingText: 'x' });
    const third = f.nextTeachingNodeId()!;
    expect([first, second]).not.toContain(third);

    // Resume from disk: the concepts already taught are not offered again
    const restored = new SessionStateMachine(new KnowledgeStore(), mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    restored.restoreSnapshot(JSON.parse(JSON.stringify(f.getSnapshot())));
    expect(restored.nextTeachingNodeId()).toBe(third);
  });
});
