import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerIpcHandlers } from '../../src/main/ipc/registerIpcHandlers';
import { SessionStateMachine } from '../../src/main/fsm/SessionStateMachine';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';
import { SocraticEngine } from '../../src/main/socratic/SocraticEngine';

describe('IPC Handlers', () => {
  let handlers: Record<string, Function>;
  let mockIpcMain: any;
  let fsm: SessionStateMachine;
  let store: KnowledgeStore;
  let socratic: SocraticEngine;

  beforeEach(() => {
    handlers = {};
    mockIpcMain = {
      handle: vi.fn((channel: string, listener: Function) => {
        handlers[channel] = listener;
      }),
      on: vi.fn((channel: string, listener: Function) => {
        handlers[channel] = listener;
      }),
    };
    store = new KnowledgeStore();
    fsm = new SessionStateMachine(store);
    socratic = new SocraticEngine();
  });

  it('registers all required IPC channels on ipcMain', () => {
    registerIpcHandlers(mockIpcMain, { fsm, store, socratic });

    expect(mockIpcMain.handle).toHaveBeenCalledWith('session:start', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('session:submit-goal', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('session:submit-probe', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('session:advance-diagnosis', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('session:socratic-start', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('session:submit-prediction', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('session:submit-check', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('graph:get', expect.any(Function));
  });

  it('handles session:start and session:submit-goal correctly', async () => {
    registerIpcHandlers(mockIpcMain, { fsm, store, socratic });

    const session = await handlers['session:start']({}, 'teaching', 'Redes Camada 3');
    expect(session.phase).toBe('goal_orientation');
    expect(session.goal).toBe('Redes Camada 3');

    const firstQuestion = await handlers['session:submit-goal']({}, 'Aprofundar em TTL');
    expect(firstQuestion).toBeDefined();
    expect(firstQuestion.options.length).toBe(4);
  });

  it('returns empty graph before goal submission and populated graph after goal submission', async () => {
    registerIpcHandlers(mockIpcMain, { fsm, store, socratic });
    await handlers['session:start']({}, 'teaching', 'Álgebra Linear');

    const emptyNodes = await handlers['graph:get']({});
    expect(emptyNodes.length).toBe(0);

    await handlers['session:submit-goal']({}, 'Autovalores e Autovetores');
    const nodes = await handlers['graph:get']({});
    expect(nodes.length).toBeGreaterThanOrEqual(8);
    expect(nodes[0].status).toBe('untested');
  });
});
