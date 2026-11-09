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
