// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SessionRepository } from '../../src/main/persistence/SessionRepository';
import { SecretStore, providerSecret, type SecretCipher } from '../../src/main/persistence/SecretStore';
import { registerIpcHandlers } from '../../src/main/ipc/registerIpcHandlers';
import { SessionStateMachine } from '../../src/main/fsm/SessionStateMachine';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';
import { CurriculumGenerator } from '../../src/main/services/CurriculumGenerator';
import { SocraticEngine } from '../../src/main/socratic/SocraticEngine';
import { defaultLLMConfig } from '../../src/main/services/llmClient';
import { mockJudge, mockLLM, noShuffle } from '../helpers/mockLLM';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aprenda-hard-'));

describe('SessionRepository (F7, E5)', () => {
  it('F7: keeps an unreadable file aside instead of overwriting it', () => {
    const dir = tmp();
    const file = path.join(dir, 'sessions.json');
    fs.writeFileSync(file, '{ não é json');

    const repo = new SessionRepository(file);
    const backup = repo.getCorruptBackup();

    expect(backup).toMatch(/sessions\.corrupt-.*\.json$/);
    expect(fs.readFileSync(backup!, 'utf8')).toBe('{ não é json');
    expect(repo.list()).toEqual([]);
  });

  it('F7: a healthy file reports nothing', () => {
    const dir = tmp();
    const file = path.join(dir, 'sessions.json');
    fs.writeFileSync(file, JSON.stringify({ sessions: [] }));
    expect(new SessionRepository(file).getCorruptBackup()).toBeUndefined();
  });

  it('E5: reports a failed write and its recovery', () => {
    const dir = tmp();
    const file = path.join(dir, 'sessions.json');
    const repo = new SessionRepository(file);
    const listener = vi.fn();
    repo.setWriteListener(listener);
    const spy = vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
      throw new Error('disco cheio');
    });
    repo.flush();
    expect(listener).toHaveBeenCalledWith(expect.stringContaining('disco cheio'));
    spy.mockRestore();
    repo.flush();
    expect(listener).toHaveBeenLastCalledWith(null);
  });
});

const fakeCipher = (available = true, backend = 'gnome_libsecret'): SecretCipher => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from(`enc:${Buffer.from(s).toString('hex')}`),
  decryptString: (b) => Buffer.from(b.toString().slice(4), 'hex').toString(),
  getSelectedStorageBackend: () => backend,
});

describe('SecretStore (S1)', () => {
  it('encrypts on disk and reads back', () => {
    const file = path.join(tmp(), 'secrets.json');
    const store = new SecretStore(file, fakeCipher());
    store.set('provider:x', 'sk-segredo-absoluto');
    expect(fs.readFileSync(file, 'utf8')).not.toContain('sk-segredo-absoluto');
    expect(Buffer.from(JSON.parse(fs.readFileSync(file, 'utf8')).data, 'base64').toString()).not.toContain('segredo');
    expect(new SecretStore(file, fakeCipher()).get('provider:x')).toBe('sk-segredo-absoluto');
  });

  it('without a real keyring it says so and restricts the file', () => {
    const file = path.join(tmp(), 'secrets.json');
    const store = new SecretStore(file, fakeCipher(true, 'basic_text'));
    expect(store.isProtected()).toBe(false);
    store.set('k', 'v');
    expect(fs.statSync(file).mode & 0o077).toBe(0);
    expect(new SecretStore(file, fakeCipher(true, 'basic_text')).get('k')).toBe('v');
  });

  it('deletes keys', () => {
    const file = path.join(tmp(), 'secrets.json');
    const store = new SecretStore(file, fakeCipher());
    store.set('k', 'v');
    store.delete('k');
    expect(new SecretStore(file, fakeCipher()).get('k')).toBeUndefined();
  });
});

describe('secrets over IPC (S1)', () => {
  let handlers: Record<string, Function>;
  let secrets: SecretStore;
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = originalFetch;
    handlers = {};
    secrets = new SecretStore(path.join(tmp(), 's.json'), fakeCipher());
    const store = new KnowledgeStore();
    registerIpcHandlers(
      { handle: (c: string, l: Function) => (handlers[c] = l), on: (c: string, l: Function) => (handlers[c] = l) } as any,
      {
        fsm: new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(mockLLM, noShuffle)),
        store,
        socratic: new SocraticEngine(mockLLM, new CurriculumGenerator(mockLLM, noShuffle)),
        secrets,
      }
    );
  });

  it('a validated key is stored and used without the renderer sending it again', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [{ id: 'm' }] }) }) as any;
    await handlers['provider:validate-and-fetch']({}, { providerId: 'custom', apiKey: 'sk-validada', baseUrl: 'http://x/v1' });
    global.fetch = originalFetch;
    expect(secrets.get(providerSecret('custom'))).toBe('sk-validada');

    await handlers['settings:update']({}, { providerId: 'custom', baseUrl: 'http://x/v1', model: 'm' });
    expect(defaultLLMConfig.apiKey).toBe('sk-validada');
  });

  it('a rejected key is not stored', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }) as any;
    await expect(handlers['provider:validate-and-fetch']({}, { providerId: 'custom', apiKey: 'ruim', baseUrl: 'http://x/v1' })).rejects.toThrow();
    expect(secrets.get(providerSecret('custom'))).toBeUndefined();
  });

  it('re-validating with a blank field reuses the stored key', async () => {
    secrets.set(providerSecret('openai'), 'sk-guardada-1234');
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [{ id: 'gpt-4o' }] }) });
    global.fetch = f as any;
    await handlers['provider:validate-and-fetch']({}, { providerId: 'openai', apiKey: '' });
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-guardada-1234');
  });

  it('migrates keys that older versions kept in the renderer', async () => {
    await handlers['secrets:migrate']({}, { providers: [{ id: 'a', apiKey: 'chave-a' }], deepgramApiKey: 'dg' });
    expect(secrets.get(providerSecret('a'))).toBe('chave-a');
    expect(secrets.get('deepgram')).toBe('dg');
  });

  it('removes a provider key', async () => {
    secrets.set(providerSecret('a'), 'x');
    await handlers['secrets:delete-provider']({}, 'a');
    expect(secrets.get(providerSecret('a'))).toBeUndefined();
  });

  it('the renderer can never read a key back', () => {
    expect(Object.keys(handlers).filter((c) => /secrets:(get|read)/.test(c))).toEqual([]);
  });
});
