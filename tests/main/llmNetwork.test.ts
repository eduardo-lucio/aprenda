// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import net from 'net';
import {
  callLLM,
  cancelForegroundLLM,
  isFatalLLMError,
  LLMCancelledError,
  LLMNetworkError,
  NETWORK_RETRY_DELAYS_MS,
  networkErrorCode,
  setResponseLanguage,
} from '../../src/main/services/llmClient';
import { CONNECT_ATTEMPT_TIMEOUT_MS, configureNetworkDefaults } from '../../src/main/services/http';
import { CurriculumGenerator } from '../../src/main/services/CurriculumGenerator';

/** What undici throws when no address of the host accepted the connection in time (the log's error). */
function connectTimeout(): TypeError {
  const attempt = Object.assign(new Error('connect ETIMEDOUT 104.18.3.115:443'), { code: 'ETIMEDOUT' });
  const cause = Object.assign(new AggregateError([attempt, new Error('ENETUNREACH')]), { code: 'ETIMEDOUT' });
  return new TypeError('fetch failed', { cause });
}

const ok = (content: string) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => ({ choices: [{ message: { content } }] }),
});
const config = { baseURL: 'https://openrouter.ai/api/v1', apiKey: 'k', model: 'm' };

describe('a provider that cannot be reached', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
    setResponseLanguage('pt');
  });

  it('the code behind "fetch failed" is found inside the AggregateError', () => {
    expect(networkErrorCode(connectTimeout())).toBe('ETIMEDOUT');
    const refused = new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'ECONNREFUSED' }) });
    expect(networkErrorCode(refused)).toBe('ECONNREFUSED');
  });

  it('a connection that did not open is tried again after a pause, and the call goes through', async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockRejectedValueOnce(connectTimeout()).mockRejectedValueOnce(connectTimeout()).mockResolvedValueOnce(ok('oi'));
    global.fetch = f as any;
    const pending = callLLM({ prompt: 'x', config });
    await vi.advanceTimersByTimeAsync(NETWORK_RETRY_DELAYS_MS[0] - 10);
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(NETWORK_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0));
    await expect(pending).resolves.toBe('oi');
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('after the retries, the student reads the host and the reason, not "fetch failed"', async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockRejectedValue(connectTimeout());
    global.fetch = f as any;
    const pending = callLLM({ prompt: 'x', config }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const err = await pending;
    expect(err).toBeInstanceOf(LLMNetworkError);
    expect(err.message).toMatch(/openrouter\.ai/);
    expect(err.message).toMatch(/demorou demais para abrir/);
    expect(err.message).not.toMatch(/fetch failed/);
    expect(f).toHaveBeenCalledTimes(NETWORK_RETRY_DELAYS_MS.length + 1);
    // The client already tried again: the generators must not multiply the wait
    expect(isFatalLLMError(err)).toBe(true);
  });

  it('a local server that refuses points to it, in the chosen language', async () => {
    vi.useFakeTimers();
    setResponseLanguage('en');
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'ECONNREFUSED' }) })) as any;
    const pending = callLLM({ prompt: 'x', config: { ...config, baseURL: 'http://localhost:11434/v1' } }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).message).toMatch(/localhost:11434.*refused.*Ollama/);
  });

  it('a certificate the system refuses is not retried', async () => {
    const cert = new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'SELF_SIGNED_CERT_IN_CHAIN' }) });
    const f = vi.fn().mockRejectedValue(cert);
    global.fetch = f as any;
    await expect(callLLM({ prompt: 'x', config })).rejects.toThrow(/certificado/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('the student can cancel during the pause between tries', async () => {
    const f = vi.fn().mockRejectedValue(connectTimeout());
    global.fetch = f as any;
    const pending = callLLM({ prompt: 'x', config });
    await new Promise((r) => setTimeout(r, 30));
    cancelForegroundLLM();
    await expect(pending).rejects.toBeInstanceOf(LLMCancelledError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('a connection that drops mid-answer is a readable error the generators may retry', async () => {
    const body = {
      getReader: () => ({
        read: async () => {
          throw new TypeError('terminated', { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) });
        },
        cancel: async () => {},
      }),
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'text/event-stream' }, body }) as any;
    const err = await callLLM({ prompt: 'x', config }).catch((e) => e);
    expect(err).toBeInstanceOf(LLMNetworkError);
    expect(err.message).toMatch(/caiu no meio da resposta/);
    expect(isFatalLLMError(err)).toBe(false);
  });

  it('the concept map shows the connection message as it is', async () => {
    const reason = new LLMNetworkError('openrouter.ai', 'a conexão demorou demais para abrir', 'connect', 'ETIMEDOUT');
    const llm = vi.fn().mockRejectedValue(reason);
    await expect(new CurriculumGenerator(llm).generateGraph('TCP')).rejects.toBe(reason);
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it('every connection gives each address of the host time to answer', () => {
    const before = net.getDefaultAutoSelectFamilyAttemptTimeout();
    try {
      configureNetworkDefaults();
      expect(net.getDefaultAutoSelectFamilyAttemptTimeout()).toBe(CONNECT_ATTEMPT_TIMEOUT_MS);
      expect(CONNECT_ATTEMPT_TIMEOUT_MS).toBeGreaterThan(1000);
    } finally {
      net.setDefaultAutoSelectFamilyAttemptTimeout(before);
    }
  });
});

describe('the concept map after unreadable answers', () => {
  it('names the problem in plain words and says what to do', async () => {
    const llm = vi.fn().mockResolvedValue('Claro! Aqui está o mapa que você pediu.');
    const err = await new CurriculumGenerator(llm).generateGraph('TCP').catch((e) => e);
    expect(err.message).toMatch(/formato inesperado/);
    expect(err.message).toMatch(/Configurações → Modelo/);
    expect(llm).toHaveBeenCalledTimes(2);
  });

  it('an empty answer is called empty, not a provider error', async () => {
    const llm = vi.fn().mockRejectedValue(new Error('O modelo retornou uma resposta vazia.'));
    const err = await new CurriculumGenerator(llm).generateGoalOptions('TCP').catch((e) => e);
    expect(err.message).toMatch(/resposta vazia/);
    expect(err.message).not.toMatch(/erro do provedor/);
  });
});
