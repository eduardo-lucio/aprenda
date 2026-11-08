import { describe, it, expect, vi } from 'vitest';
import { SessionStateMachine } from '../../src/main/fsm/SessionStateMachine';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';
import { CurriculumGenerator } from '../../src/main/services/CurriculumGenerator';
import { SocraticEngine } from '../../src/main/socratic/SocraticEngine';
import { LLMCancelledError, LLMNotConfiguredError, type CallLLMOptions, type LLMCaller } from '../../src/main/services/llmClient';
import { mockJudge, mockLLM, noShuffle } from '../helpers/mockLLM';
import type { ConceptNode } from '../../src/shared/types';

const node: ConceptNode = {
  id: 'n1',
  title: 'Conceito',
  summary: 'Resumo.',
  level: 1,
  prerequisites: [],
  unconditionalTruth: 'Verdade.',
  status: 'untested',
};

const isPlanCall = (o: CallLLMOptions) => /Gere o plano/.test(o.prompt);

describe('no canned text pretending to be the AI (I8, E10)', () => {
  const failing: LLMCaller = async () => {
    throw new Error('falha do provedor');
  };

  it('generatePredict reports the failure', async () => {
    await expect(new CurriculumGenerator(failing).generatePredict(node, 'Tema')).rejects.toThrow(/Conceito/);
  });

  it('generatePlan reports the failure', async () => {
    await expect(
      new CurriculumGenerator(failing).generatePlan({ goal: 'Tema', nodes: [node], attempts: [] })
    ).rejects.toThrow(/plano|plan/i);
  });

  it('submitPrediction reports the failure', async () => {
    const engine = new SocraticEngine(failing, new CurriculumGenerator(mockLLM, noShuffle));
    await engine.generatePredictStep(node, 'Tema');
    await expect(engine.submitPrediction('palpite')).rejects.toThrow(/explicação|explanation/i);
  });

  it('submitPrediction fails when the verification question is unusable', async () => {
    const noCheck: LLMCaller = async () => JSON.stringify({ teachProse: 'Texto.', checkQuestion: { questionText: 'Q', options: ['só uma'], correctOptionIndex: 0 } });
    const engine = new SocraticEngine(noCheck, new CurriculumGenerator(mockLLM, noShuffle));
    await engine.generatePredictStep(node, 'Tema');
    await expect(engine.submitPrediction('palpite')).rejects.toThrow();
  });

  it.each([
    ['LLMNotConfiguredError', () => new LLMNotConfiguredError()],
    ['LLMCancelledError', () => new LLMCancelledError()],
  ])('E10: %s is not retried', async (_name, make) => {
    const llm = vi.fn(async () => {
      throw make();
    });
    const gen = new CurriculumGenerator(llm as unknown as LLMCaller);
    await expect(gen.generateGoalOptions('Tema')).rejects.toBeInstanceOf(Error);
    expect(llm).toHaveBeenCalledTimes(1);
    llm.mockClear();
    await expect(gen.generatePredict(node, 'Tema')).rejects.toBeInstanceOf(Error);
    expect(llm).toHaveBeenCalledTimes(1);
  });
});

describe('state machine failures leave the session usable', () => {
  const setup = async (llm: LLMCaller, min = 3) => {
    const store = new KnowledgeStore();
    const fsm = new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(llm));
    fsm.setMinProbeQuestions(min);
    await fsm.startSession('teaching', 'Tema');
    return { fsm, store };
  };

  it('F11: a failed manual plan keeps the current question answerable', async () => {
    let failPlan = false;
    const llm: LLMCaller = async (o) => {
      if (failPlan && isPlanCall(o)) throw new Error('fora do ar');
      return mockLLM(o);
    };
    const { fsm } = await setup(llm);
    await fsm.submitGoalClarification('Foco');
    for (let i = 0; i < 3; i++) {
      await fsm.submitProbeAnswer({ selectedOptionIndex: 1, confidence: 50, thinkingText: 'x' });
    }
    const question = fsm.getState().currentQuestion;
    expect(question).toBeDefined();

    failPlan = true;
    await expect(fsm.advanceToPlan()).rejects.toThrow();
    expect(fsm.getState().currentQuestion).toEqual(question);
    expect(fsm.getState().phase).toBe('probing');

    failPlan = false;
    await expect(
      fsm.submitProbeAnswer({ selectedOptionIndex: 1, confidence: 50, thinkingText: 'y' })
    ).resolves.toBeDefined();
  });

  it('I11: the manual plan floor counts answered questions, not the one on screen', async () => {
    const { fsm } = await setup(mockLLM);
    await fsm.submitGoalClarification('Foco');
    await fsm.submitProbeAnswer({ selectedOptionIndex: 1, confidence: 50, thinkingText: 'x' });
    await fsm.submitProbeAnswer({ selectedOptionIndex: 1, confidence: 50, thinkingText: 'x' });
    expect(fsm.getState().questionCount).toBe(3);
    await expect(fsm.advanceToPlan()).rejects.toThrow(/3 questões/);
  });

  it('I13: with everything mastered the plan is honest and does not call the AI', async () => {
    const generator = new CurriculumGenerator(mockLLM, noShuffle);
    const store = new KnowledgeStore();
    const fsm = new SessionStateMachine(store, mockJudge(), generator);
    fsm.setMinProbeQuestions(3);
    await fsm.startSession('teaching', 'Tema');
    await fsm.submitGoalClarification('Foco');
    const plan = vi.spyOn(generator, 'generatePlan');
    for (let i = 0; i < 12 && fsm.getState().phase === 'probing'; i++) {
      await fsm.submitProbeAnswer({ selectedOptionIndex: fsm.getState().currentQuestion!.correctOptionIndex, confidence: 90, thinkingText: 'x' });
    }
    expect(fsm.getState().phase).toBe('plan_review');
    expect(plan).not.toHaveBeenCalled();
    expect(fsm.getState().plan).not.toMatch(/reforçar/i);
  });

  it('F2: when the first question cannot be generated nothing is committed', async () => {
    const generator = new CurriculumGenerator(mockLLM, noShuffle);
    vi.spyOn(generator, 'generateGraph').mockResolvedValue({
      discipline: 'D',
      nodes: [node, { ...node, id: 'n2' }, { ...node, id: 'n3' }],
    });
    vi.spyOn(generator, 'generateQuestion').mockRejectedValue(new Error('sem pergunta'));
    const store = new KnowledgeStore();
    const fsm = new SessionStateMachine(store, mockJudge(), generator);
    await fsm.startSession('teaching', 'Tema');

    await expect(fsm.submitGoalClarification('Foco')).rejects.toThrow();
    expect(fsm.getState().phase).toBe('goal_orientation');
    expect(fsm.getState().goal).toBe('Tema');
    expect(store.getNodes()).toHaveLength(0);
  });
});
