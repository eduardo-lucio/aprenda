// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  callLLM,
  defaultLLMConfig,
  setGlobalThinkingStreamListener,
  updateDefaultLLMConfig,
} from '../../src/main/services/llmClient';
import { validateAndFetchModels } from '../../src/main/services/providerValidationService';
import { AgentOrchestrator } from '../../src/main/services/AgentOrchestrator';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';
import { CurriculumGenerator } from '../../src/main/services/CurriculumGenerator';
import { CognitiveJudgeService } from '../../src/main/services/CognitiveJudgeService';
import { registerIpcHandlers } from '../../src/main/ipc/registerIpcHandlers';
import { SessionStateMachine } from '../../src/main/fsm/SessionStateMachine';
import { SocraticEngine } from '../../src/main/socratic/SocraticEngine';
import type { ConceptNode, QuestionData } from '../../src/shared/types';
import { mockJudge, mockLLM, noShuffle } from '../helpers/mockLLM';

const okJson = (content: string) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => ({ choices: [{ message: { content } }] }),
});
const config = (model: string, baseURL = 'https://api.openai.com/v1') => ({ baseURL, apiKey: 'k', model });
const sentBody = (fetchMock: any, call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body);

describe('request parameters per model family', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    setGlobalThinkingStreamListener(undefined);
  });

  it('F9: GPT-5 uses max_completion_tokens and no temperature', async () => {
    const f = vi.fn().mockResolvedValue(okJson('oi'));
    global.fetch = f as any;
    await callLLM({ prompt: 'x', maxTokens: 100, effortLevel: 'low', config: config('gpt-5-mini') });
    const body = sentBody(f);
    expect(body.max_completion_tokens).toBe(100);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
    expect(body.reasoning_effort).toBe('low');
  });

  it('F9: other models keep temperature and max_tokens', async () => {
    const f = vi.fn().mockResolvedValue(okJson('oi'));
    global.fetch = f as any;
    await callLLM({ prompt: 'x', maxTokens: 100, config: config('gpt-4o') });
    expect(sentBody(f).max_tokens).toBe(100);
    expect(sentBody(f).temperature).toBe(0.2);
  });

  it('F9: OpenRouter keeps its own parameter handling for GPT-5', async () => {
    const f = vi.fn().mockResolvedValue(okJson('oi'));
    global.fetch = f as any;
    await callLLM({ prompt: 'x', maxTokens: 100, config: config('openai/gpt-5', 'https://openrouter.ai/api/v1') });
    expect(sentBody(f).max_tokens).toBe(100);
  });

  it('F9: after HTTP 400 the retry drops every optional parameter', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) })
      .mockResolvedValueOnce(okJson('oi'));
    global.fetch = f as any;
    await callLLM({ prompt: 'x', maxTokens: 100, jsonMode: true, temperature: 0.7, effortLevel: 'high', config: config('gpt-4o') });
    const retry = sentBody(f, 1);
    expect(Object.keys(retry).sort()).toEqual(['messages', 'model']);
  });

  it('I2: raw model reasoning never reaches the screen, only the agentThinking field', async () => {
    const seen: string[] = [];
    setGlobalThinkingStreamListener((p) => seen.push(p.text));
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({
        choices: [{ message: { content: '{"agentThinking":"Vou testar causa e efeito."}', reasoning_content: 'A resposta certa é a B' } }],
      }),
    }) as any;
    await callLLM({ prompt: 'x', config: config('modelo') });
    expect(seen.join(' ')).toContain('causa e efeito');
    expect(seen.join(' ')).not.toContain('resposta certa');
  });

  it('I2: a <think> block inside the content is not shown either', async () => {
    const seen: string[] = [];
    setGlobalThinkingStreamListener((p) => seen.push(p.text));
    global.fetch = vi.fn().mockResolvedValue(okJson('<think>a resposta certa é B</think>{"x":1}')) as any;
    await callLLM({ prompt: 'x', config: config('modelo') });
    expect(seen).toEqual([]);
  });

  it('F16: a burst of stream chunks is throttled', async () => {
    const seen: string[] = [];
    setGlobalThinkingStreamListener((p) => seen.push(p.text));
    const enc = new TextEncoder();
    const parts = Array.from({ length: 200 }, (_v, i) =>
      enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: i === 0 ? '{"agentThinking":"a' : 'b' } }] })}\n\n`)
    );
    let i = 0;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'text/event-stream' },
      body: {
        getReader: () => ({
          read: async () => (i < parts.length ? { value: parts[i++], done: false } : { value: undefined, done: true }),
          cancel: async () => {},
        }),
      },
    }) as any;
    await callLLM({ prompt: 'x', config: config('modelo') });
    expect(seen.length).toBeLessThan(10);
    expect(seen[seen.length - 1].length).toBeGreaterThan(150);
  });
});

describe('thinking effort (I3)', () => {
  const node: ConceptNode = { id: 'n', title: 'T', summary: 's', level: 1, prerequisites: [], unconditionalTruth: 'v', status: 'untested' };

  it('map, plan and judge follow the level chosen by the student', async () => {
    const llm = vi.fn(mockLLM);
    const gen = new CurriculumGenerator(llm as any);
    await gen.generateGraph('Tema');
    await gen.generatePlan({ goal: 'Tema', nodes: [node], attempts: [] });
    for (const [o] of llm.mock.calls) expect(o.effortLevel).toBeUndefined();

    const judgeLlm = vi.fn(mockLLM);
    await new CognitiveJudgeService(judgeLlm as any).evaluate({
      node, questionText: 'q', options: ['a', 'b'], selectedOptionIndex: 0, correctOptionIndex: 0, confidence: 50, thinkingText: 't',
    });
    expect(judgeLlm.mock.calls[0][0].effortLevel).toBeUndefined();
  });

  it('background question generation stays at low effort', async () => {
    const llm = vi.fn(mockLLM);
    await new CurriculumGenerator(llm as any).generateQuestion(node, 'Tema', [], { signal: new AbortController().signal });
    expect(llm.mock.calls[0][0].effortLevel).toBe('low');
  });
});

describe('prefetch targets (F15)', () => {
  const mk = (id: string, level: number, prerequisites: string[] = []): ConceptNode => ({
    id, title: id, summary: '', level, prerequisites, unconditionalTruth: '', status: 'untested',
  });

  it('spends quota only on untested concepts, next in the queue first', async () => {
    const store = new KnowledgeStore([mk('a', 1), mk('b', 1), mk('c', 2, ['a', 'b']), mk('d', 3), mk('e', 3)]);
    const generated: string[] = [];
    const gen = new CurriculumGenerator(mockLLM, noShuffle);
    vi.spyOn(gen, 'generateQuestion').mockImplementation(async (n) => {
      generated.push(n.id);
      return { id: n.id, nodeId: n.id, questionText: n.id, options: ['1', '2'], correctOptionIndex: 0, anchorConcept: '', difficulty: 1 };
    });
    const orchestrator = new AgentOrchestrator(gen, store);
    orchestrator.speculativePrefetch({
      currentNodeId: 'c',
      candidateQueue: ['d', 'e'],
      strandNodes: store.getStrand(),
      questionCache: new Map<string, QuestionData>(),
      askedQuestions: [],
      goal: 'g',
      nodesState: { a: 'mastered', b: 'mastered', c: 'frontier', d: 'untested', e: 'untested' },
    });
    while (orchestrator.isBusy() || orchestrator.getQueueLength() > 0) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(generated).toEqual(['d', 'e']);
  });
});

describe('provider validation (F14, E6, S5)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });
  const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

  it('custom endpoints do not require a key', async () => {
    global.fetch = vi.fn().mockResolvedValue(json({ data: [{ id: 'm1' }] })) as any;
    const r = await validateAndFetchModels({ providerId: 'custom', apiKey: '', baseUrl: 'http://x/v1' });
    expect(r.models[0].id).toBe('m1');
  });

  it('an Ollama URL ending in /v1 validates at the server root', async () => {
    const f = vi.fn().mockResolvedValue(json({ models: [{ name: 'llama3' }] }));
    global.fetch = f as any;
    await validateAndFetchModels({ providerId: 'ollama', apiKey: '', baseUrl: 'http://h:11434/v1/' });
    expect(f.mock.calls[0][0]).toBe('http://h:11434/api/tags');
  });

  it('an unexpected model list is an error, not a fake model', async () => {
    global.fetch = vi.fn().mockResolvedValue(json({ whatever: true })) as any;
    await expect(validateAndFetchModels({ providerId: 'custom', apiKey: 'k', baseUrl: 'http://x/v1' })).rejects.toThrow(/modelos|models/i);
  });

  it('accepts a bare array of models and names the provider properly', async () => {
    global.fetch = vi.fn().mockResolvedValue(json([{ id: 'meta/llama' }])) as any;
    const r = await validateAndFetchModels({ providerId: 'together', apiKey: 'k', baseUrl: 'https://api.together.xyz/v1' });
    expect(r.models[0].id).toBe('meta/llama');
    expect(r.providerName).toBe('Together AI');
  });

  it('S5: the Google key goes in a header, never in the URL', async () => {
    const f = vi.fn().mockResolvedValue(json({ models: [{ name: 'models/gemini', supportedGenerationMethods: ['generateContent'] }] }));
    global.fetch = f as any;
    await validateAndFetchModels({ providerId: 'google', apiKey: 'segredo-123456' }).catch(() => {});
    expect(String(f.mock.calls[0][0])).not.toContain('segredo');
    expect(f.mock.calls[0][1].headers['x-goog-api-key']).toBe('segredo-123456');
  });

  it('E6: validation has a deadline and network errors are readable', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    global.fetch = f as any;
    await expect(validateAndFetchModels({ providerId: 'openai', apiKey: 'chave-longa-aqui' })).rejects.toThrow(/conectar|reach/i);
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe('OPENAI_* environment (I18)', () => {
  let handlers: Record<string, Function>;
  const saved = { ...defaultLLMConfig };

  beforeEach(() => {
    handlers = {};
    const store = new KnowledgeStore();
    registerIpcHandlers(
      { handle: (c: string, l: Function) => (handlers[c] = l), on: (c: string, l: Function) => (handlers[c] = l) } as any,
      { fsm: new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(mockLLM, noShuffle)), store, socratic: new SocraticEngine(mockLLM, new CurriculumGenerator(mockLLM, noShuffle)) }
    );
  });
  afterEach(() => {
    updateDefaultLLMConfig(saved);
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  const empty = { providerId: '', apiKey: '', baseUrl: 'https://openrouter.ai/api/v1', model: '', effortLevel: 'high' };

  it('empty settings at startup keep what came from the environment', async () => {
    process.env.OPENAI_BASE_URL = 'http://env/v1';
    process.env.OPENAI_API_KEY = 'env-key';
    process.env.OPENAI_MODEL = 'env-model';
    await handlers['settings:update']({}, empty);
    expect(defaultLLMConfig).toMatchObject({ baseURL: 'http://env/v1', apiKey: 'env-key', model: 'env-model' });
  });

  it('removing the last provider really disconnects it', async () => {
    await handlers['settings:update']({}, { providerId: 'custom', apiKey: 'k', baseUrl: 'http://x/v1', model: 'm' });
    expect(defaultLLMConfig.model).toBe('m');
    await handlers['settings:update']({}, empty);
    expect(defaultLLMConfig).toMatchObject({ baseURL: '', apiKey: '', model: '' });
  });
});
