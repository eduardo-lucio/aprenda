import { describe, it, expect, beforeEach } from 'vitest';
import { SessionStateMachine } from '../../src/main/fsm/SessionStateMachine';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';
import { CurriculumGenerator } from '../../src/main/services/CurriculumGenerator';
import { mockLLM } from '../helpers/mockLLM';
import { emitTokenUsage } from '../../src/main/services/llmClient';

describe('SessionStateMachine', () => {
  let store: KnowledgeStore;
  let fsm: SessionStateMachine;

  beforeEach(() => {
    store = new KnowledgeStore();
    fsm = new SessionStateMachine(store, undefined, new CurriculumGenerator(mockLLM));
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

  it('allows manual forceAdvanceToDiagnosis only after question 8 or when enabled', async () => {
    await fsm.startSession('teaching', 'Redes Camada 3');
    await fsm.submitGoalClarification('Foco total em Camada 3');

    // At question 1, forceAdvance should throw or be ignored
    expect(() => fsm.forceAdvanceToDiagnosis()).toThrow();

    // Answer up to 8 questions
    for (let i = 1; i <= 7; i++) {
      await fsm.submitProbeAnswer({
        selectedOptionIndex: 0,
        confidence: 80,
        thinkingText: 'Raciocínio detalhado.',
      });
    }

    // Now on question 8, answer it:
    await fsm.submitProbeAnswer({
      selectedOptionIndex: 0,
      confidence: 80,
      thinkingText: 'Raciocínio detalhado.',
    });

    // Question count is >= 8, so manual advance is permitted
    fsm.forceAdvanceToDiagnosis();
    expect(fsm.getState().phase).toBe('frontier_diagnosis');
  });

  it('regresses to prerequisites (Zoom-In) when a false positive or failure occurs', async () => {
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
      fsm.markNodeStatus(pid, 'untested');
    }

    // Answer with a false positive or failure
    const res = await fsm.submitProbeAnswer({
      selectedOptionIndex: currentQ.correctOptionIndex,
      confidence: 30, // low confidence + guessing text = false_positive
      thinkingText: 'Chutei por eliminação, não sei.',
    });

    expect(res.attempt.verdict).toBe('false_positive');
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
    const fsm = new SessionStateMachine(new KnowledgeStore(), undefined, failing);
    await expect(fsm.startSession('teaching', 'Eu quero aprender sobre tcp/udp')).rejects.toThrow();
    expect(fsm.hasSession()).toBe(false);
  });
});
