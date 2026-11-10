import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CurriculumGenerator } from '../../src/main/services/CurriculumGenerator';
import { SocraticEngine } from '../../src/main/socratic/SocraticEngine';
import { ConceptNode, CheckQuestionData } from '../../src/shared/types';
import { mockLLM, noShuffle } from '../helpers/mockLLM';

describe('SocraticEngine', () => {
  let engine: SocraticEngine;
  const sampleNode: ConceptNode = {
    id: 'osi-l3-ttl',
    title: 'Time To Live (TTL) e Prevenção de Loops',
    summary: 'Campo de 8 bits que decrementa e descarta ao atingir 0.',
    level: 3,
    prerequisites: ['osi-l3-ip-packets'],
    unconditionalTruth: 'Se o campo TTL atingir 0, o pacote é obrigatoriamente descartado.',
    status: 'false_positive',
  };

  beforeEach(() => {
    engine = new SocraticEngine(mockLLM, new CurriculumGenerator(mockLLM, noShuffle));
  });

  it('generates motivating prediction nudge before teaching', async () => {
    const predictStep = await engine.generatePredictStep(sampleNode);
    expect(predictStep.questionText).toBeDefined();
    expect(predictStep.questionText.length).toBeGreaterThan(15);
    expect(predictStep.promptGoal).toBeDefined();
  });

  it('resolves prediction openly in concise 1-step teaching text', async () => {
    await engine.generatePredictStep(sampleNode);
    const result = await engine.submitPrediction('Eu achava que o pacote voltava para quem mandou.');
    expect(result.teachProse).toBeDefined();
    expect(result.teachProse.length).toBeGreaterThan(10);
    expect(result.checkQuestion.options.length).toBe(4);
    expect(result.checkQuestion.correctOptionIndex).toBeGreaterThanOrEqual(0);
    expect(result.checkQuestion.explanation).toBeDefined();
  });

  it('evaluates check question: returns isPassed true on correct option', () => {
    const checkData: CheckQuestionData = {
      questionText: 'O que o roteador faz ao receber TTL=1?',
      options: ['Descarta e emite ICMP', 'Renova o TTL', 'Devolve ao remetente', 'Ignora'],
      correctOptionIndex: 0,
      explanation: 'O decremento resulta em 0, forçando o descarte.',
    };

    const evalResult = engine.evaluateCheck(0, checkData);
    expect(evalResult.isPassed).toBe(true);
    expect(evalResult.repairExplanation).toBeUndefined();
  });

  it('evaluates check question: on failure, the repair text says the concept will be retaken', () => {
    const checkData: CheckQuestionData = {
      questionText: 'O que o roteador faz ao receber TTL=1?',
      options: ['Descarta e emite ICMP', 'Renova o TTL', 'Devolve ao remetente', 'Ignora'],
      correctOptionIndex: 0,
      explanation: 'O decremento resulta em 0, forçando o descarte.',
    };

    const evalResult = engine.evaluateCheck(2, checkData);
    expect(evalResult.isPassed).toBe(false);
    expect(evalResult.repairExplanation).toBeDefined();
    expect(evalResult.repairExplanation).toContain(checkData.explanation);
    expect(evalResult.repairExplanation).not.toMatch(/próximo conceito|next concept/i);
  });

  it('a retry skips the cached guess and tells the AI what went wrong', async () => {
    const prompts: string[] = [];
    const llm = vi.fn(async (req: any) => {
      prompts.push(req.systemPrompt);
      return JSON.stringify({ questionText: `Pergunta ${prompts.length}\n\npromptGoal:`, promptGoal: 'g' });
    });
    const retryEngine = new SocraticEngine(llm as any);
    const node = { id: 'n', title: 'T', summary: 's', level: 1, prerequisites: [], unconditionalTruth: 'u', status: 'frontier' } as any;
    const failures = [{ questionText: 'Q antiga', chosenAnswer: 'B', correctAnswer: 'A', diagnosis: 'confundiu X' }];

    const first = await retryEngine.generatePredictStep(node, 'g');
    const again = await retryEngine.generatePredictStep(node, 'g', { failures });

    expect(first.questionText).toBe('Pergunta 1');
    expect(again.questionText).toBe('Pergunta 2');
    expect(prompts[1]).toContain('RETOMADA DO CONCEITO');
    expect(prompts[1]).toContain('confundiu X');
  });
});

describe('SocraticEngine lessons in steps (D2)', () => {
  const node: ConceptNode = {
    id: 'n', title: 'Conceito', summary: 's', level: 2, prerequisites: [], unconditionalTruth: 'Verdade.', status: 'frontier',
  };
  const written = (extra: object = {}) =>
    JSON.stringify({
      // Also read by the guess that opens a lesson
      questionText: 'O que você acha que acontece?',
      teachProse: 'Texto do passo.',
      checkQuestion: { questionText: 'Q?', options: ['a', 'b', 'c', 'd'], correctOptionIndex: 0, explanation: 'e' },
      ...extra,
    });
  /** The opening answer brings the plan; every later call writes one step. */
  const engineWith = (steps: unknown, failAt: number[] = []) => {
    const calls: any[] = [];
    const llm = vi.fn(async (req: any) => {
      calls.push(req);
      if (failAt.includes(calls.length)) throw new Error('Network timeout');
      return written(calls.length === 1 ? { steps } : {});
    });
    const engine = new SocraticEngine(llm as any, new CurriculumGenerator(llm as any, noShuffle));
    engine.resumeNode(node);
    return { engine, calls };
  };

  it('opens with the plan of steps and stays on the concept until each one is demonstrated', async () => {
    const { engine, calls } = engineWith(['Fato 1', 'Fato 2']);
    const first = await engine.submitPrediction('meu palpite');
    expect(first.progress).toMatchObject({ steps: ['Fato 1', 'Fato 2'], stepIndex: 0, retries: 0, prediction: 'meu palpite' });
    expect(calls[0].systemPrompt).toContain('Plano de passos');
    expect(engine.isLastStep()).toBe(false);

    expect(engine.recordCheck(true)).toBe('next_step');
    const second = await engine.continueLesson();
    expect(second.isRetry).toBe(false);
    expect(second.progress).toMatchObject({ stepIndex: 1, retries: 0 });
    expect(second.progress.taught).toHaveLength(2);
    expect(calls[1].systemPrompt).toContain('AVANÇO PARA O PASSO 2');
    expect(calls[1].prompt).toContain('1. Fato 1 (demonstrado)');
    expect(calls[1].prompt).toContain('2. Fato 2 (AGORA)');
    expect(calls[1].prompt).toContain('meu palpite');

    expect(engine.isLastStep()).toBe(true);
    expect(engine.recordCheck(true)).toBe('concept_mastered');
    expect(engine.getProgress()).toBeUndefined();
  });

  it('a miss repeats the same step from the diagnosis, twice at most, before the concept goes back to the queue', async () => {
    const { engine, calls } = engineWith(['Fato 1', 'Fato 2']);
    await engine.submitPrediction('palpite');
    const failure = { questionText: 'Q?', chosenAnswer: 'b', correctAnswer: 'a', diagnosis: 'confundiu causa e efeito' };

    expect(engine.recordCheck(false, 'achei o exemplo estranho')).toBe('retry_step');
    const repair = await engine.continueLesson(failure);
    expect(repair.isRetry).toBe(true);
    expect(repair.progress).toMatchObject({ stepIndex: 0, retries: 1 });
    expect(calls[1].systemPrompt).toContain('REPARO DO PASSO 1');
    expect(calls[1].prompt).toContain('confundiu causa e efeito');
    // The reading channel is handed over as what it is, apart from the answer
    expect(calls[1].prompt).toContain('O QUE ELE PENSAVA ENQUANTO LIA');
    expect(calls[1].prompt).toContain('achei o exemplo estranho');

    expect(engine.recordCheck(false)).toBe('retry_step');
    await engine.continueLesson(failure);
    expect(engine.getProgress()).toMatchObject({ stepIndex: 0, retries: 2 });

    expect(engine.recordCheck(false)).toBe('concept_requeued');
    expect(engine.getProgress()).toBeUndefined();
    await expect(engine.continueLesson()).rejects.toThrow(/andamento/);
  });

  it('a repaired step that lands moves on with a clean count', async () => {
    const { engine } = engineWith(['Fato 1', 'Fato 2']);
    await engine.submitPrediction('palpite');
    engine.recordCheck(false);
    await engine.continueLesson({ questionText: 'Q?', chosenAnswer: 'b', correctAnswer: 'a', diagnosis: 'd' });
    expect(engine.recordCheck(true)).toBe('next_step');
    expect(engine.getProgress()).toMatchObject({ stepIndex: 1, retries: 0 });
  });

  it('keeps at most four steps, and a concept without a plan is taught in one', async () => {
    const many = engineWith(['1', '2', ' ', '3', '4', '5', 6]);
    expect((await many.engine.submitPrediction('p')).progress.steps).toEqual(['1', '2', '3', '4']);

    const none = engineWith(undefined);
    expect((await none.engine.submitPrediction('p')).progress.steps).toEqual(['Verdade.']);
    expect(none.engine.isLastStep()).toBe(true);
    expect(none.engine.recordCheck(true)).toBe('concept_mastered');
  });

  it('a step that cannot be written leaves the lesson where it was', async () => {
    // Calls 2 and 3 are the two tries of the second step
    const { engine } = engineWith(['Fato 1', 'Fato 2'], [2, 3]);
    await engine.submitPrediction('palpite');
    engine.recordCheck(true);
    await expect(engine.continueLesson()).rejects.toThrow(/Sua resposta já foi registrada/);
    expect(engine.getProgress()).toMatchObject({ stepIndex: 1, retries: 0 });
    expect(engine.getProgress()!.taught).toHaveLength(1);

    const again = await engine.continueLesson();
    expect(again.progress.taught).toHaveLength(2);
  });

  it('picks a lesson back up with its progress, and a new guess starts a new lesson', async () => {
    const { engine } = engineWith(['x']);
    const progress = { steps: ['A', 'B', 'C'], stepIndex: 1, retries: 1, prediction: 'p', taught: [{ step: 0, prose: 'um' }] };
    engine.resumeNode(node, progress);
    expect(engine.getProgress()).toEqual(progress);
    expect(engine.isLastStep()).toBe(false);

    // Saved before lessons had steps: one step, no repair in place
    engine.resumeNode(node);
    expect(engine.isLastStep()).toBe(true);
    expect(engine.recordCheck(false)).toBe('concept_requeued');

    engine.resumeNode(node, progress);
    await engine.generatePredictStep(node, 'g');
    expect(engine.getProgress()).toBeUndefined();
  });
});
