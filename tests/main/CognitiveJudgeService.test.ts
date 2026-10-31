import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CognitiveJudgeService } from '../../src/main/services/CognitiveJudgeService';
import { ConceptNode } from '../../src/shared/types';
import * as llmClient from '../../src/main/services/llmClient';

describe('CognitiveJudgeService', () => {
  const sampleNode: ConceptNode = {
    id: 'osi-l3-ttl',
    title: 'Time To Live (TTL) e Prevenção de Loops',
    summary: 'Campo de 8 bits que decrementa e descarta ao atingir 0.',
    level: 3,
    prerequisites: ['osi-l3-ip-packets'],
    unconditionalTruth: 'Se o campo TTL atingir 0, o pacote é obrigatoriamente descartado.',
    status: 'untested',
  };

  const sampleQuestion = {
    node: sampleNode,
    questionText: 'O que acontece quando o TTL atinge 0 em um roteador?',
    options: [
      'O pacote é descartado e é enviado ICMP Time Exceeded',
      'O pacote é reenviado para a origem com TTL resetado',
      'O pacote é colocado em fila com prioridade máxima',
      'O pacote é convertido para broadcast',
    ],
    correctOptionIndex: 0,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('classifies correct option + wrong reasoning as false_positive (🟡)', async () => {
    // Student picked Option 0 (correct), but thinks TTL is about bandwidth or guessing
    const judge = new CognitiveJudgeService();
    const result = await judge.evaluate({
      ...sampleQuestion,
      selectedOptionIndex: 0,
      confidence: 85,
      thinkingText: 'Eu acho que é a letra A porque se o tempo acaba na internet o pacote vira lixo e volta pro remetente na camada física.',
    });

    expect(result.isCorrectOption).toBe(true);
    expect(result.verdict).toBe('false_positive');
    expect(result.reasoningDiagnosis).toBeDefined();
  });

  it('classifies wrong option + high confidence as blind_spot (🔴)', async () => {
    // Student picked Option 1 (wrong), with high confidence (90%)
    const judge = new CognitiveJudgeService();
    const result = await judge.evaluate({
      ...sampleQuestion,
      selectedOptionIndex: 1,
      confidence: 90,
      thinkingText: 'Tenho certeza absoluta que o roteador devolve para a origem para tentar de novo com o TTL renovado.',
    });

    expect(result.isCorrectOption).toBe(false);
    expect(result.verdict).toBe('blind_spot');
  });

  it('classifies correct option + solid reasoning as mastered (🟢)', async () => {
    const judge = new CognitiveJudgeService();
    const result = await judge.evaluate({
      ...sampleQuestion,
      selectedOptionIndex: 0,
      confidence: 95,
      thinkingText: 'Cada salto decrementa 1 no campo TTL. Ao chegar em 0 no roteador, ele é descartado para evitar loop infinito e gera ICMP type 11.',
    });

    expect(result.isCorrectOption).toBe(true);
    expect(result.verdict).toBe('mastered');
  });

  it('uses robust heuristic fallback when LLM API call fails or times out', async () => {
    vi.spyOn(llmClient, 'callLLM').mockRejectedValue(new Error('Network timeout'));
    const judge = new CognitiveJudgeService();
    const result = await judge.evaluate({
      ...sampleQuestion,
      selectedOptionIndex: 0,
      confidence: 40,
      thinkingText: 'Não tenho certeza, acho que é a A por eliminação.',
    });

    expect(result).toBeDefined();
    expect(['mastered', 'false_positive', 'blind_spot', 'frontier']).toContain(result.verdict);
  });
});
