import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateAndFetchModels } from '../../src/main/services/providerValidationService';

describe('providerValidationService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rejects empty API keys for cloud providers', async () => {
    await expect(
      validateAndFetchModels({
        providerId: 'openrouter',
        apiKey: '   ',
      })
    ).rejects.toThrow(/não pode estar em branco/i);
  });

  it('rejects invalid OpenRouter API key when auth endpoint returns 401', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        error: { message: 'User not found.', code: 401 },
      }),
    } as any);

    await expect(
      validateAndFetchModels({
        providerId: 'openrouter',
        apiKey: 'sk-or-invalid-key-xyz',
      })
    ).rejects.toThrow(/chave openrouter inválida.*user not found/i);
  });

  it('successfully validates OpenRouter API key and fetches real models', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { label: 'My Key' } }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: 'anthropic/claude-3.7-sonnet',
              name: 'Claude 3.7 Sonnet',
              context_length: 200000,
              pricing: { prompt: '0.000003', completion: '0.000015' },
            },
            {
              id: 'deepseek/deepseek-r1',
              name: 'DeepSeek R1',
              context_length: 64000,
              pricing: { prompt: '0.00000055', completion: '0.00000219' },
            },
            {
              id: 'meta-llama/llama-3.3-70b-instruct',
              name: 'Llama 3.3 70B',
              context_length: 128000,
              pricing: { prompt: '0.0000002', completion: '0.0000002' },
            },
          ],
        }),
      } as any);

    const result = await validateAndFetchModels({
      providerId: 'openrouter',
      apiKey: 'sk-or-v1-valid-key-abcdef123456',
    });

    expect(result.isValid).toBe(true);
    expect(result.providerId).toBe('openrouter');
    expect(result.keyMasked).toContain('...3456');
    expect(result.models.length).toBe(3);

    const claude = result.models.find((m) => m.id === 'anthropic/claude-3.7-sonnet');
    expect(claude).toBeDefined();
    expect(claude?.isReasoning).toBe(true);
    expect(claude?.defaultEffort).toBe('high');
    expect(claude?.context).toBe('200k');

    const deepseek = result.models.find((m) => m.id === 'deepseek/deepseek-r1');
    expect(deepseek?.isReasoning).toBe(true);
  });

  it('rejects invalid OpenAI key with 401 error message', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        error: { message: 'Incorrect API key provided' },
      }),
    } as any);

    await expect(
      validateAndFetchModels({
        providerId: 'openai',
        apiKey: 'sk-invalid-openai-key',
      })
    ).rejects.toThrow(/chave openai inválida.*incorrect api key/i);
  });

  it('validates OpenAI and maps chat/reasoning models', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: 'gpt-4o' },
          { id: 'o3-mini' },
          { id: 'text-embedding-3-small' },
        ],
      }),
    } as any);

    const result = await validateAndFetchModels({
      providerId: 'openai',
      apiKey: 'sk-valid-openai-key-9999',
    });

    expect(result.isValid).toBe(true);
    // Should filter to chat & reasoning models
    expect(result.models.some((m) => m.id === 'gpt-4o')).toBe(true);
    const o3 = result.models.find((m) => m.id === 'o3-mini');
    expect(o3?.isReasoning).toBe(true);
    expect(o3?.defaultEffort).toBe('high');
  });

  it('validates Ollama locally via /api/tags', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        models: [
          { name: 'deepseek-r1:14b', size: 9000000000 },
          { name: 'llama3.3:latest', size: 40000000000 },
        ],
      }),
    } as any);

    const result = await validateAndFetchModels({
      providerId: 'ollama',
      apiKey: '',
      baseUrl: 'http://localhost:11434',
    });

    expect(result.isValid).toBe(true);
    expect(result.providerId).toBe('ollama');
    expect(result.models.length).toBe(2);
    expect(result.models[0].name).toContain('deepseek-r1:14b');
  });

  it('rejects Ollama when server is unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      validateAndFetchModels({
        providerId: 'ollama',
        apiKey: '',
        baseUrl: 'http://localhost:11434',
      })
    ).rejects.toThrow(/não foi possível conectar ao ollama/i);
  });
});