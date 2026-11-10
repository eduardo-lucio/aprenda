import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LearnerMemory } from '../../src/main/persistence/LearnerMemory';
import { ProbeFrontier } from '../../src/main/fsm/probeFrontier';
import { SessionStateMachine } from '../../src/main/fsm/SessionStateMachine';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';
import { CurriculumGenerator } from '../../src/main/services/CurriculumGenerator';
import { PracticeEngine } from '../../src/main/practice/PracticeEngine';
import { registerIpcHandlers } from '../../src/main/ipc/registerIpcHandlers';
import { SocraticEngine } from '../../src/main/socratic/SocraticEngine';
import type { LLMCaller } from '../../src/main/services/llmClient';
import type { ConceptNode } from '../../src/shared/types';
import { mockJudge, mockLLM, noShuffle } from '../helpers/mockLLM';

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aprenda-memory-'));
  file = path.join(dir, 'memory.json');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const shown = (title: string, over: Record<string, unknown> = {}) => ({
  title, truth: `${title} vale.`, discipline: 'Redes', sessionId: 's1', source: 'lesson' as const, ...over,
});

describe('what is kept between sessions (A2)', () => {
  it('keeps a demonstration on disk and reads it back in another run', () => {
    let clock = 1000;
    const memory = new LearnerMemory(file, () => clock);
    memory.record(shown('Handshake TCP'));
    clock = 2000;
    memory.record(shown('Portas e sockets', { source: 'practice' }));

    const again = new LearnerMemory(file).list();
    expect(again.map((e) => e.title)).toEqual(['Portas e sockets', 'Handshake TCP']);
    expect(again[1]).toEqual({
      id: 'handshake-tcp', title: 'Handshake TCP', truth: 'Handshake TCP vale.', discipline: 'Redes',
      sessionId: 's1', source: 'lesson', firstAt: 1000, lastAt: 1000, times: 1,
    });
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });

  it('the same concept shown again moves the date instead of duplicating', () => {
    let clock = 1000;
    const memory = new LearnerMemory(file, () => clock);
    memory.record(shown('Handshake TCP'));
    clock = 5000;
    memory.record(shown('  handshake  tcp ', { sessionId: 's2', source: 'practice' }));
    expect(memory.list()).toHaveLength(1);
    expect(memory.list()[0]).toMatchObject({ firstAt: 1000, lastAt: 5000, times: 2, sessionId: 's2', source: 'practice' });
    expect(memory.record(shown('   '))).toBeUndefined();
  });

  it('erases one item or everything', () => {
    const memory = new LearnerMemory(file);
    memory.record(shown('A'));
    memory.record(shown('B'));
    memory.delete(['a', 'nao-existe']);
    expect(new LearnerMemory(file).list().map((e) => e.id)).toEqual(['b']);
    memory.clear();
    expect(new LearnerMemory(file).list()).toEqual([]);
  });

  it('sets an unreadable file aside instead of writing over it', () => {
    fs.writeFileSync(file, '{ quebrado');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const memory = new LearnerMemory(file);
    warn.mockRestore();
    expect(memory.list()).toEqual([]);
    expect(fs.readFileSync(memory.getCorruptBackup()!, 'utf-8')).toBe('{ quebrado');
    memory.record(shown('A'));
    expect(new LearnerMemory(file).list()).toHaveLength(1);
  });
});

describe('the probe starts from what was shown before (A2, D5)', () => {
  const node = (id: string, level: number, prerequisites: string[]): ConceptNode => ({
    id, title: id, summary: '', level, prerequisites, unconditionalTruth: '', status: 'untested',
  });
  const line = [node('n1', 1, []), node('n2', 2, ['n1']), node('n3', 3, ['n2']), node('n4', 4, ['n3']), node('n5', 5, ['n4'])];
  const untested = Object.fromEntries(line.map((n) => [n.id, 'untested'])) as Record<string, ConceptNode['status']>;

  it('a miss walks down to the remembered concept, not below it', () => {
    const states = { ...untested, n5: 'frontier' as const };
    expect(new ProbeFrontier(line).pickNext(states, [{ nodeId: 'n5' }]).nodeId).toBe('n3');
    expect(new ProbeFrontier(line, ['n4']).pickNext(states, [{ nodeId: 'n5' }]).nodeId).toBe('n4');
  });

  it('remembered is not held: missing it opens what is under it', () => {
    const frontier = new ProbeFrontier(line, ['n4']);
    expect(frontier.isLocated(untested, [], 'n4')).toBe(false);
    const states = { ...untested, n5: 'frontier' as const, n4: 'frontier' as const };
    const next = frontier.pickNext(states, [{ nodeId: 'n5' }, { nodeId: 'n4' }]).nodeId;
    expect(['n1', 'n2', 'n3']).toContain(next);
  });
});

describe('sessions write to and read from the memory (A2)', () => {
  const check = { questionText: 'Verificação?', options: ['Certa', 'Errada', 'E2', 'E3'], correctOptionIndex: 0, explanation: '' };

  /** The mock provider, except that the map marks concepts as remembered when `mark` says so. */
  const graphLLM = (mark: Record<string, string> = {}) => {
    const prompts: string[] = [];
    const llm: LLMCaller = async (o) => {
      const raw = await mockLLM(o);
      if (!(o.systemPrompt || '').includes('Arquiteto Curricular')) return raw;
      prompts.push(o.prompt || '');
      const parsed = JSON.parse(raw);
      for (const n of parsed.nodes) if (mark[n.id]) n.remembered = mark[n.id];
      return JSON.stringify(parsed);
    };
    return { llm, prompts };
  };
  const machine = (llm: LLMCaller, memory: LearnerMemory, practice?: PracticeEngine) => {
    const f = new SessionStateMachine(new KnowledgeStore(), mockJudge(), new CurriculumGenerator(llm, noShuffle), undefined, practice);
    f.setMemory(memory);
    return f;
  };
  async function toLessons(f: SessionStateMachine) {
    await f.startSession('teaching', 'Redes');
    await f.submitGoalClarification('TCP e UDP');
    for (let i = 0; i < 8 && f.getState().phase === 'probing'; i++) {
      await f.submitProbeAnswer({ selectedOptionIndex: 1, confidence: 90, thinkingText: 'x' });
    }
    if (f.getState().phase === 'probing') await f.advanceToPlan();
    f.confirmPlan();
  }

  it('mastering a concept in a lesson records it; a step in the middle or a miss does not', async () => {
    const memory = new LearnerMemory(file);
    const f = machine(mockLLM, memory);
    await toLessons(f);

    await f.recordCheckVerdict('n1', check, { selectedOptionIndex: 0, confidence: 95, thinkingText: 'x' }, { conceptDone: false });
    await f.recordCheckVerdict('n2', check, { selectedOptionIndex: 1, confidence: 95, thinkingText: 'x' });
    expect(memory.list()).toEqual([]);

    await f.recordCheckVerdict('n1', check, { selectedOptionIndex: 0, confidence: 95, thinkingText: 'x' });
    expect(memory.list()).toHaveLength(1);
    expect(memory.list()[0]).toMatchObject({
      title: 'Modelo de camadas', truth: 'Modelo de camadas é verdadeiro.', discipline: 'Redes', source: 'lesson', sessionId: f.getState().id,
    });
  });

  it('a session without memory gets a map prompt with no list', async () => {
    const { llm, prompts } = graphLLM();
    const f = machine(llm, new LearnerMemory(file));
    await f.startSession('teaching', 'Redes');
    await f.submitGoalClarification('TCP e UDP');
    expect(prompts[0]).not.toContain('já demonstrou');
    expect(f.getState().remembered).toBeUndefined();
  });

  it('the next session offers what was shown, and the map says which concepts it matches', async () => {
    const memory = new LearnerMemory(file, () => Date.UTC(2026, 10, 9));
    memory.record(shown('Handshake de três vias', { truth: 'Toda conexão TCP abre com três segmentos.' }));
    // m1 is the handshake; m9 was never offered and "n3" is matched to the same record again
    const { llm, prompts } = graphLLM({ n4: 'M1', n3: 'm1', n2: 'm9' });
    const f = machine(llm, memory);
    await f.startSession('teaching', 'Redes');
    await f.submitGoalClarification('TCP e UDP');

    expect(prompts[0]).toContain('- m1 · 2026-11-09 · Handshake de três vias: Toda conexão TCP abre com três segmentos.');
    expect(f.getState().remembered).toEqual({ n3: { memoryId: 'handshake-de-tres-vias', lastAt: Date.UTC(2026, 10, 9) } });
    // Remembered is a place to start: nothing is marked as held before an answer
    expect(Object.values(f.getState().nodesState).every((s) => s === 'untested')).toBe(true);

    // A session reopened from disk keeps the match
    const restored = machine(mockLLM, memory);
    restored.restoreSnapshot(f.getSnapshot());
    expect(restored.getState().remembered).toEqual(f.getState().remembered);
  });

  it('a problem solved unaided is recorded; one that needed a wrong try first is not', async () => {
    const llm = vi.fn(async (o: any) => {
      const sys = o.systemPrompt as string;
      if (sys.includes('TAREFA: POSAR')) return JSON.stringify({ targets: [], modelSolution: 'S', statement: 'E' });
      return JSON.stringify({ correct: /certo/.test(o.prompt.split('ENTREGOU AGORA')[1]), reply: 'Veredito.' });
    });
    const memory = new LearnerMemory(file);
    const f = machine(mockLLM, memory, new PracticeEngine(llm as any));
    f.startPractice({
      material: 'Recursão',
      targets: [{ id: 'a', title: 'Caso base', truth: 'Toda recursão para.' }, { id: 'b', title: 'Passo recursivo', truth: 'Cada chamada reduz.' }],
    });

    await f.practiceNext();
    const first = f.getState().practice!.active!.targetIds[0];
    await f.practiceSubmit('claim', 'certo');
    expect(memory.list().map((e) => e.id)).toEqual([first === 'a' ? 'caso-base' : 'passo-recursivo']);
    expect(memory.list()[0]).toMatchObject({ source: 'practice', discipline: 'Recursão' });

    await f.practiceNext();
    await f.practiceSubmit('claim', 'nada');
    await f.practiceSubmit('claim', 'certo');
    expect(memory.list()).toHaveLength(1);
  });

  it('the screen reads and erases through the main process', async () => {
    const handlers = new Map<string, (...args: any[]) => any>();
    const memory = new LearnerMemory(file);
    memory.record(shown('A'));
    memory.record(shown('B'));
    const store = new KnowledgeStore();
    registerIpcHandlers({ handle: (ch: string, fn: any) => handlers.set(ch, fn), on: () => {} } as any, {
      fsm: new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(mockLLM, noShuffle)),
      store,
      socratic: new SocraticEngine(mockLLM),
      memory,
    });
    expect((await handlers.get('memory:list')!({})).map((e: any) => e.id).sort()).toEqual(['a', 'b']);
    expect((await handlers.get('memory:delete')!({}, ['a'])).map((e: any) => e.id)).toEqual(['b']);
    expect(await handlers.get('memory:clear')!({})).toEqual([]);
    expect(memory.list()).toEqual([]);
  });
});
