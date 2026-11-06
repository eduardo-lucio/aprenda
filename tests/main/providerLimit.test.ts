import { describe, it, expect, vi, afterEach } from 'vitest';
import { callLLM, isProviderLimitError, ProviderLimitError } from '../../src/main/services/llmClient';
import { CognitiveJudgeService } from '../../src/main/services/CognitiveJudgeService';
import { ConceptNode } from '../../src/shared/types';

const cfg = { baseURL: 'https://openrouter.ai/api/v1', apiKey: 'k', model: 'm' };

const mockFetch = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => 'application/json' },
      json: async () => body,
    }))
  );

afterEach(() => vi.unstubAllGlobals());

describe('provider limit detection', () => {
  it('maps HTTP 429 to a rate_limit ProviderLimitError', async () => {
    mockFetch(429, { error: { message: 'Rate limit exceeded' } });
    const err: any = await callLLM({ prompt: 'x', config: cfg }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderLimitError);
    expect(err.kind).toBe('rate_limit');
    expect(err.message).toContain('HTTP 429');
  });

  it('maps HTTP 402 to a credits error', async () => {
    mockFetch(402, { error: { message: 'Insufficient credits' } });
    const err: any = await callLLM({ prompt: 'x', config: cfg }).catch((e) => e);
    expect(err.kind).toBe('credits');
  });

  it('detects an error payload returned inside a 200 response', async () => {
    mockFetch(200, { error: { code: 429, message: 'quota' } });
    const err: any = await callLLM({ prompt: 'x', config: cfg }).catch((e) => e);
    expect(isProviderLimitError(err)).toBe(true);
  });

  it('does not flag ordinary errors', () => {
    expect(isProviderLimitError(new Error('JSON inválido'))).toBe(false);
  });

  it('judge propagates provider limit errors instead of grading offline', async () => {
    const node: ConceptNode = {
      id: 'n', title: 't', summary: 's', level: 1, prerequisites: [], unconditionalTruth: 'u', status: 'untested',
    };
    const judge = new CognitiveJudgeService(async () => {
      throw new ProviderLimitError('rate_limit', 'Limite (HTTP 429)', 429);
    });
    await expect(
      judge.evaluate({
        node, questionText: 'q', options: ['a', 'b'], correctOptionIndex: 0,
        selectedOptionIndex: 0, confidence: 50, thinkingText: 'x',
      })
    ).rejects.toThrow('HTTP 429');
  });
});
