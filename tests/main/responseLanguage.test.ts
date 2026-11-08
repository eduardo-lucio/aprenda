import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  callLLM,
  localize,
  setResponseLanguage,
  updateDefaultLLMConfig,
  defaultLLMConfig,
} from '../../src/main/services/llmClient';
import { pt } from '../../src/renderer/i18n/pt';
import { en } from '../../src/renderer/i18n/en';

describe('response language', () => {
  const original = { ...defaultLLMConfig };
  const originalFetch = global.fetch;

  afterEach(() => {
    setResponseLanguage('pt');
    updateDefaultLLMConfig(original);
    global.fetch = originalFetch;
  });

  const captureSystemPrompt = async () => {
    updateDefaultLLMConfig({ baseURL: 'http://llm.test/v1', model: 'test-model', apiKey: 'k' });
    let body: any;
    global.fetch = vi.fn(async (_url: any, init: any) => {
      body = JSON.parse(init.body);
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ choices: [{ message: { content: '{"ok":1}' } }] }) } as any;
    }) as any;
    await callLLM({ systemPrompt: 'Você é o professor.', prompt: 'oi' });
    return body.messages[0].content as string;
  };

  it('asks the model to write to the student in English when the UI is in English', async () => {
    setResponseLanguage('en');
    const system = await captureSystemPrompt();
    expect(system).toMatch(/^Você é o professor\./);
    expect(system).toMatch(/OUTPUT LANGUAGE/);
    expect(system).toMatch(/in natural English/);
  });

  it('keeps Portuguese prompts untouched by default', async () => {
    const system = await captureSystemPrompt();
    expect(system).toBe('Você é o professor.');
  });

  it('localizes main-process texts', () => {
    expect(localize('Olá', 'Hello')).toBe('Olá');
    setResponseLanguage('en');
    expect(localize('Olá', 'Hello')).toBe('Hello');
  });

  it('has the same keys in the Portuguese and English UI dictionaries, with no empty text', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const [key, value] of Object.entries(en)) expect(value.trim(), key).not.toBe('');
  });

  it('uses no "socratic" / AI-jargon wording in the interface texts', () => {
    const all = [...Object.values(pt), ...Object.values(en)].join('\n');
    expect(all).not.toMatch(/socr[aá]tic|trilha|cirúrgic|surgical|juiz cognitivo|cognitive judge|agent'?s thinking/i);
  });
});

describe('I9: main-process errors follow the interface language', () => {
  it('reports state errors in English', async () => {
    const { setResponseLanguage } = await import('../../src/main/services/llmClient');
    const { SessionStateMachine } = await import('../../src/main/fsm/SessionStateMachine');
    setResponseLanguage('en');
    try {
      expect(() => new SessionStateMachine().getState()).toThrow('There is no active session.');
    } finally {
      setResponseLanguage('pt');
    }
  });
});
