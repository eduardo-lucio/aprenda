import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CognitiveJudgeService, JudgeUnavailableError } from '../../src/main/services/CognitiveJudgeService';
import { LLMNotConfiguredError, ProviderLimitError } from '../../src/main/services/llmClient';
import { ConceptNode } from '../../src/shared/types';

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

  const llmReturning = (verdict: string) =>
    new CognitiveJudgeService(async () => JSON.stringify({ verdict, reasoningDiagnosis: 'ok' }));

  it('accepts the LLM verdict when coherent with correctness (confidence is only a signal)', async () => {
    const result = await llmReturning('false_positive').evaluate({
      ...sampleQuestion,
      selectedOptionIndex: 0,
      confidence: 30,
      thinkingText: 'Chute.',
    });
    expect(result.verdict).toBe('false_positive');
    expect(result.confidenceLevel).toBe(30);
  });

  it('accepts blind_spot for a wrong answer', async () => {
    const result = await llmReturning('blind_spot').evaluate({
      ...sampleQuestion,
      selectedOptionIndex: 1,
      confidence: 90,
      thinkingText: 'Tenho certeza.',
    });
    expect(result.verdict).toBe('blind_spot');
  });

  it('never grants mastery when the model keeps contradicting the answer key (conservative verdict)', async () => {
    let calls = 0;
    const counting = (verdict: string) =>
      new CognitiveJudgeService(async () => {
        calls++;
        return JSON.stringify({ verdict, reasoningDiagnosis: 'ok' });
      });

    const wrongButMastered = await counting('mastered').evaluate({
      ...sampleQuestion,
      selectedOptionIndex: 1,
      confidence: 95,
      thinkingText: 'Explicação.',
    });
    expect(wrongButMastered.verdict).toBe('frontier');
    expect(calls).toBe(2); // retried once before settling

    const rightButBlind = await counting('blind_spot').evaluate({
      ...sampleQuestion,
      selectedOptionIndex: 0,
      confidence: 95,
      thinkingText: 'Explicação.',
    });
    // A right answer the judge could not confirm is NOT promoted to mastered
    expect(rightButBlind.verdict).toBe('false_positive');
    expect(rightButBlind.reasoningDiagnosis).toMatch(/não verificado/i);
  });

  it('works without confidence ("Não sei")', async () => {
    const result = await llmReturning('frontier').evaluate({
      ...sampleQuestion,
      selectedOptionIndex: -1,
      thinkingText: 'Não sei.',
    });
    expect(result.verdict).toBe('frontier');
    expect(result.confidenceLevel).toBeUndefined();
  });

  it('"Não sei" can never be graded above frontier', async () => {
    const result = await llmReturning('mastered').evaluate({
      ...sampleQuestion,
      selectedOptionIndex: -1,
      answerKind: 'dont_know',
      thinkingText: 'Não sei.',
    });
    expect(result.verdict).toBe('frontier');
  });

  it('judges a written (own) answer by its content instead of treating it as "Não sei"', async () => {
    const prompts: string[] = [];
    const judgeWith = (verdict: string) =>
      new CognitiveJudgeService(async (o) => {
        prompts.push(o.prompt);
        return JSON.stringify({ verdict, reasoningDiagnosis: 'ok' });
      });
    const own = {
      ...sampleQuestion,
      selectedOptionIndex: -1,
      answerKind: 'own_answer' as const,
      confidence: 90,
      thinkingText: '[Resposta própria] O TTL chega a 0 e o roteador descarta o pacote.',
    };

    expect((await judgeWith('mastered').evaluate(own)).verdict).toBe('mastered');
    expect((await judgeWith('blind_spot').evaluate(own)).verdict).toBe('blind_spot');
    expect((await judgeWith('false_positive').evaluate(own)).verdict).toBe('false_positive');

    expect(prompts[0]).toMatch(/Resposta própria/);
    expect(prompts[0]).not.toMatch(/declinou explicitamente de chutar/);
    expect(prompts[0]).toMatch(/É correta: não se aplica/);
  });

  it('retries once on a transient failure and then returns the real verdict', async () => {
    let calls = 0;
    const judge = new CognitiveJudgeService(async () => {
      calls++;
      if (calls === 1) throw new Error('Tempo limite excedido aguardando resposta do modelo.');
      return JSON.stringify({ verdict: 'false_positive', reasoningDiagnosis: 'ok' });
    });
    const result = await judge.evaluate({ ...sampleQuestion, selectedOptionIndex: 0, confidence: 40, thinkingText: 'x' });
    expect(calls).toBe(2);
    expect(result.verdict).toBe('false_positive');
  });

  it('does NOT grade offline when the model keeps failing: rejects so the student can resubmit', async () => {
    let calls = 0;
    const judge = new CognitiveJudgeService(async () => {
      calls++;
      throw new Error('Network timeout');
    });
    const err: any = await judge
      .evaluate({
        ...sampleQuestion,
        selectedOptionIndex: 0,
        confidence: 40,
        thinkingText: 'Não tenho certeza, acho que é a A por eliminação.',
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(JudgeUnavailableError);
    expect(String(err.message)).toMatch(/NÃO foi registrada/);
    expect(calls).toBe(2);
  });

  it('rejects when the response has no usable verdict (invalid JSON content)', async () => {
    const judge = new CognitiveJudgeService(async () => JSON.stringify({ questionText: 'não é um veredito' }));
    await expect(
      judge.evaluate({ ...sampleQuestion, selectedOptionIndex: 0, confidence: 90, thinkingText: 'x' })
    ).rejects.toBeInstanceOf(JudgeUnavailableError);
  });

  it('does not retry fatal errors (quota/key or missing configuration)', async () => {
    let calls = 0;
    const limited = new CognitiveJudgeService(async () => {
      calls++;
      throw new ProviderLimitError('rate_limit', 'limite', 429);
    });
    await expect(
      limited.evaluate({ ...sampleQuestion, selectedOptionIndex: 0, thinkingText: 'x' })
    ).rejects.toBeInstanceOf(ProviderLimitError);
    expect(calls).toBe(1);

    calls = 0;
    const unconfigured = new CognitiveJudgeService(async () => {
      calls++;
      throw new LLMNotConfiguredError();
    });
    await expect(
      unconfigured.evaluate({ ...sampleQuestion, selectedOptionIndex: 0, thinkingText: 'x' })
    ).rejects.toBeInstanceOf(LLMNotConfiguredError);
    expect(calls).toBe(1);
  });
});
