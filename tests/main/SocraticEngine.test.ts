import { describe, it, expect, beforeEach } from 'vitest';
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

  it('evaluates check question: on failure, issues single corrective repair text without infinite loop', () => {
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
  });
});
