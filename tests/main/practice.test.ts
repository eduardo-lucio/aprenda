import { describe, it, expect, vi } from 'vitest';
import { SessionStateMachine } from '../../src/main/fsm/SessionStateMachine';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';
import { CurriculumGenerator } from '../../src/main/services/CurriculumGenerator';
import { PracticeEngine } from '../../src/main/practice/PracticeEngine';
import { nextDemand, pendingRetests, resultOf } from '../../src/main/practice/practiceStream';
import { buildHelpPrompt, buildPosePrompt } from '../../src/main/prompts/practicePrompts';
import type { PracticeProblem, PracticeState, PracticeTarget } from '../../src/shared/types';
import { mockJudge, mockLLM, noShuffle } from '../helpers/mockLLM';

const targets: PracticeTarget[] = [
  { id: 'a', title: 'Alvo A', truth: 'A vale.' },
  { id: 'b', title: 'Alvo B', truth: 'B vale.' },
  { id: 'c', title: 'Alvo C', truth: 'C vale.' },
];
let seq = 0;
const done = (over: Partial<PracticeProblem>): PracticeProblem => ({
  id: `p${++seq}`, statement: 's', targetIds: ['a'], mode: 'recall', difficulty: 1, turns: [], maxRung: -1, wrongClaims: 0, outcome: 'solved', ...over,
});
const state = (history: PracticeProblem[], over: Partial<PracticeState> = {}): PracticeState => ({ material: 'm', targets, history, ...over });

describe('practice stream (A1)', () => {
  it('reads a concluded problem by the help it needed', () => {
    expect(resultOf(done({}))).toBe('clean');
    expect(resultOf(done({ maxRung: 1 }))).toBe('clean');
    expect(resultOf(done({ maxRung: 2 }))).toBe('helped');
    expect(resultOf(done({ wrongClaims: 1 }))).toBe('helped');
    // From the rung that names the proposition, the retrieval was surrendered
    expect(resultOf(done({ maxRung: 3 }))).toBe('miss');
    expect(resultOf(done({ outcome: 'surrendered' }))).toBe('miss');
    expect(resultOf(done({ outcome: 'dismissed' }))).toBe('miss');
  });

  it('a free topic starts with no targets: the first problem draws them', () => {
    expect(nextDemand(state([], { targets: [] }))).toEqual({ targetIds: [], mode: 'recall', difficulty: 1 });
  });

  it('opens warm: easy recall on a different target each time', () => {
    const first = nextDemand(state([]))!;
    expect(first).toEqual({ targetIds: ['a'], mode: 'recall', difficulty: 1 });
    const second = nextDemand(state([done({ targetIds: ['a'] })]))!;
    const third = nextDemand(state([done({ targetIds: ['a'] }), done({ targetIds: [second.targetIds[0]] })]))!;
    expect(new Set(['a', second.targetIds[0], third.targetIds[0]]).size).toBe(3);
    for (const d of [second, third]) expect(d).toMatchObject({ mode: 'recall', difficulty: 1 });
  });

  it('never poses the same target twice in a row when there is another', () => {
    const history: PracticeProblem[] = [];
    for (let i = 0; i < 12; i++) {
      const d = nextDemand(state(history))!;
      if (history.length) expect(d.targetIds[0]).not.toBe(history[history.length - 1].targetIds[0]);
      history.push(done({ targetIds: d.targetIds, mode: d.mode, difficulty: d.difficulty }));
    }
  });

  it('runs the cheapest mode not yet shown unaided, in order, and composes only with a second target', () => {
    const recall = done({ targetIds: ['a'], mode: 'recall' });
    const other = done({ targetIds: ['b'] });
    const afterRecall = nextDemand(state([recall, other, done({ targetIds: ['c'] }), other]))!;
    expect(afterRecall.targetIds[0]).toBe('a');
    expect(afterRecall.mode).toBe('discrimination');

    const disc = done({ targetIds: ['a'], mode: 'discrimination', difficulty: 2 });
    const afterDisc = nextDemand(state([recall, other, done({ targetIds: ['c'] }), disc, done({ targetIds: ['c'], mode: 'discrimination' }), done({ targetIds: ['b'], mode: 'discrimination' })]))!;
    expect(afterDisc).toMatchObject({ mode: 'composition' });
    expect(afterDisc.targetIds).toHaveLength(2);
    expect(afterDisc.targetIds[0]).not.toBe(afterDisc.targetIds[1]);

    // Alone, a target has nothing to be composed with
    const solo = state([done({ targetIds: ['a'] }), done({ targetIds: ['a'], mode: 'discrimination' })], { targets: [targets[0]] });
    expect(nextDemand(solo)!.mode).toBe('discrimination');
  });

  it('difficulty follows the last outcome on the target: up after a clean one, same after help, down after a miss', () => {
    const filler = [done({ targetIds: ['b'] }), done({ targetIds: ['c'] })];
    const on = (last: Partial<PracticeProblem>) =>
      nextDemand(state([done({ targetIds: ['a'], mode: 'discrimination', difficulty: 3, ...last }), ...filler, done({ targetIds: ['b'], mode: 'discrimination' }), done({ targetIds: ['c'], mode: 'discrimination' })]))!;
    expect(on({})).toMatchObject({ targetIds: expect.arrayContaining(['a']), difficulty: 4 });
    expect(on({ maxRung: 2 })).toMatchObject({ difficulty: 3 });
    // A miss on a later layer also drops back to the earlier one
    expect(on({ outcome: 'surrendered' })).toMatchObject({ difficulty: 2, mode: 'recall' });
  });

  it('wrapping up poses again everything that failed, and ends when nothing is owed', () => {
    const miss = done({ targetIds: ['b'], mode: 'discrimination', difficulty: 3, outcome: 'surrendered' });
    const history = [done({}), miss, done({ targetIds: ['c'], maxRung: 4 })];
    expect(pendingRetests(history).map((p) => p.id)).toEqual([miss.id, history[2].id]);

    const first = nextDemand(state(history, { closing: true }))!;
    expect(first).toEqual({ targetIds: ['b'], mode: 'discrimination', difficulty: 3, retestOf: miss.id });

    // A retest that fails stands for the original; one that lands settles it
    const failedRetest = done({ targetIds: ['b'], mode: 'discrimination', difficulty: 3, retestOf: miss.id, outcome: 'dismissed' });
    expect(pendingRetests([...history, failedRetest]).map((p) => p.id)).toEqual([history[2].id, failedRetest.id]);
    const settled = [...history, done({ retestOf: miss.id }), done({ retestOf: history[2].id })];
    expect(nextDemand(state(settled, { closing: true }))).toBeNull();
  });
});

describe('practice session (A1)', () => {
  /** Answers by task, read from the system prompt. `script` can override any of them. */
  const engineWith = (script: Partial<Record<'pose' | 'help' | 'claim' | 'pause', (o: any) => unknown>> = {}) => {
    const calls: Array<{ task: string; o: any }> = [];
    let posed = 0;
    const llm = vi.fn(async (o: any) => {
      const sys = o.systemPrompt as string;
      const task = sys.includes('TAREFA: POSAR') ? 'pose' : sys.includes('RACIOCÍNIO EM ANDAMENTO') ? 'help' : sys.includes('JULGAR UMA RESPOSTA') ? 'claim' : 'pause';
      calls.push({ task, o });
      const custom = script[task as 'pose'];
      if (custom) {
        const out = custom(o);
        if (out instanceof Error) throw out;
        return JSON.stringify(out);
      }
      if (task === 'pose') {
        posed += 1;
        return JSON.stringify({
          targets: [{ title: 'Proposição 1', truth: 'P1.' }, { title: 'Proposição 2', truth: 'P2.' }],
          modelSolution: `SOLUÇÃO SECRETA ${posed}`,
          statement: `Enunciado ${posed}`,
        });
      }
      if (task === 'help') return JSON.stringify({ rung: 5, reply: 'Releia o segundo dado.' });
      if (task === 'claim') return JSON.stringify({ correct: /certo/.test(o.prompt.split('ENTREGOU AGORA')[1]), reply: 'Veredito.' });
      return JSON.stringify({ reply: 'Resposta da pausa.' });
    });
    const fsm = new SessionStateMachine(
      new KnowledgeStore(), mockJudge(), new CurriculumGenerator(mockLLM, noShuffle), undefined, new PracticeEngine(llm as any)
    );
    return { fsm, calls, llm };
  };

  it('a free topic goes straight to a problem, and the solution stays out of what the screen receives', async () => {
    const { fsm, calls } = engineWith();
    const opened = fsm.startPractice({ material: 'Recursão' });
    expect(opened).toMatchObject({ mode: 'practice', phase: 'practice', practice: { material: 'Recursão', targets: [], history: [] } });

    const s = await fsm.practiceNext();
    expect(s.practice!.targets).toEqual([
      { id: 'p1', title: 'Proposição 1', truth: 'P1.' },
      { id: 'p2', title: 'Proposição 2', truth: 'P2.' },
    ]);
    expect(s.practice!.active).toMatchObject({ statement: 'Enunciado 1', targetIds: ['p1'], mode: 'recall', maxRung: -1 });
    expect(JSON.stringify(s)).not.toContain('SOLUÇÃO SECRETA');
    expect(calls[0].o.systemPrompt).toContain('tire dele de 3 a 6 PROPOSIÇÕES');
    // The doctrine travels with every call
    expect(calls[0].o.systemPrompt).toContain('The practice session');

    await expect(fsm.practiceNext()).rejects.toThrow(/Conclua o problema atual/);
  });

  it('help climbs one rung per request, whatever the model asks for', async () => {
    const { fsm, calls } = engineWith();
    fsm.startPractice({ material: 'Recursão' });
    await fsm.practiceNext();

    let s = await fsm.practiceSubmit('work', 'travei');
    expect(s.practice!.active!.maxRung).toBe(0);
    expect(s.practice!.active!.turns).toEqual([
      { role: 'student', kind: 'work', text: 'travei' },
      { role: 'tutor', kind: 'hint', text: 'Releia o segundo dado.', rung: 0 },
    ]);
    s = await fsm.practiceSubmit('work', '');
    expect(s.practice!.active!.maxRung).toBe(1);
    expect(calls[2].o.systemPrompt).toContain('permitido agora é R1');
    // The model knows the solution in order to hint, never to show it
    expect(calls[1].o.prompt).toContain('SOLUÇÃO SECRETA 1');
    expect(JSON.stringify(s)).not.toContain('SOLUÇÃO SECRETA');
  });

  it('repairing the statement costs no rung', async () => {
    const { fsm } = engineWith({ help: () => ({ statementRepair: true, rung: 3, reply: 'O enunciado pede a saída do programa.' }) });
    fsm.startPractice({ material: 'Recursão' });
    await fsm.practiceNext();
    const s = await fsm.practiceSubmit('work', 'não entendi o que é pedido');
    expect(s.practice!.active!.maxRung).toBe(-1);
    expect(s.practice!.active!.turns[1]).toEqual({ role: 'tutor', kind: 'hint', text: 'O enunciado pede a saída do programa.' });
  });

  it('a wrong answer keeps the problem open; a right one concludes it and reveals the committed solution', async () => {
    const { fsm } = engineWith();
    fsm.startPractice({ material: 'Recursão' });
    await fsm.practiceNext();

    let s = await fsm.practiceSubmit('claim', 'resposta errada');
    expect(s.practice!.active).toMatchObject({ wrongClaims: 1 });
    expect(s.practice!.active!.outcome).toBeUndefined();
    expect(JSON.stringify(s)).not.toContain('SOLUÇÃO SECRETA');

    s = await fsm.practiceSubmit('claim', 'agora está certo');
    expect(s.practice!.active).toBeUndefined();
    expect(s.practice!.history).toHaveLength(1);
    expect(s.practice!.history[0]).toMatchObject({ outcome: 'solved', wrongClaims: 1, modelSolution: 'SOLUÇÃO SECRETA 1' });
    expect(s.practice!.history[0].turns.at(-1)).toMatchObject({ kind: 'verdict', correct: true });
    await expect(fsm.practiceSubmit('claim', 'x')).rejects.toThrow(/problema em andamento/);
  });

  it('the pause: questions about the concluded problem, and the next one only when asked', async () => {
    const { fsm, calls } = engineWith();
    fsm.startPractice({ material: 'Recursão' });
    await fsm.practiceNext();
    await expect(fsm.practiceAsk('por quê?')).rejects.toThrow(/concluído/);

    fsm.practiceConclude('surrendered');
    const posesBefore = calls.filter((c) => c.task === 'pose').length;
    const s = await fsm.practiceAsk('por que a dica falava do segundo dado?');
    expect(s.practice!.history[0].turns.slice(-2)).toEqual([
      { role: 'student', kind: 'question', text: 'por que a dica falava do segundo dado?' },
      { role: 'tutor', kind: 'answer', text: 'Resposta da pausa.' },
    ]);
    expect(calls.filter((c) => c.task === 'pose')).toHaveLength(posesBefore);
    expect(s.practice!.active).toBeUndefined();

    const next = await fsm.practiceNext();
    expect(next.practice!.active!.statement).toBe('Enunciado 2');
    // Interleaving: the second problem is on the other target
    expect(next.practice!.active!.targetIds).toEqual(['p2']);
  });

  it('wrapping up retests what was given up in a fresh situation, then ends the session', async () => {
    const { fsm, calls } = engineWith();
    fsm.startPractice({ material: 'Recursão' });
    await fsm.practiceNext();
    const given = fsm.practiceConclude('dismissed').practice!.history[0];
    expect(given).toMatchObject({ outcome: 'dismissed', modelSolution: 'SOLUÇÃO SECRETA 1' });

    fsm.practiceClose();
    const retest = await fsm.practiceNext();
    expect(retest.practice!.active).toMatchObject({ retestOf: given.id, targetIds: ['p1'], mode: 'recall' });
    expect(calls.at(-1)!.o.systemPrompt).toContain('RETESTE');
    expect(calls.at(-1)!.o.systemPrompt).toContain('Enunciado 1');

    await fsm.practiceSubmit('claim', 'certo');
    const end = await fsm.practiceNext();
    expect(end.practice).toMatchObject({ finished: true, closing: true });
    expect(end.practice!.active).toBeUndefined();
  });

  it('practises concepts that were taught: they arrive as targets and nothing is drawn from the topic', async () => {
    const { fsm, calls } = engineWith();
    const s = fsm.startPractice({ material: 'TCP e UDP', targets, sourceSessionId: 'session-1' });
    expect(s.practice).toMatchObject({ targets, sourceSessionId: 'session-1' });
    const first = await fsm.practiceNext();
    expect(first.practice!.targets).toEqual(targets);
    expect(first.practice!.active!.targetIds).toEqual(['a']);
    expect(calls[0].o.systemPrompt).not.toContain('PROPOSIÇÕES que o aluno deve sustentar');
    expect(calls[0].o.prompt).toContain('ALVO(S) DESTE PROBLEMA: a');
  });

  it('a failed call records nothing, so the learner can send again', async () => {
    let down = true;
    const { fsm } = engineWith({ claim: () => (down ? new Error('Network timeout') : { correct: true, reply: 'Certo.' }) });
    fsm.startPractice({ material: 'Recursão' });
    await fsm.practiceNext();
    await expect(fsm.practiceSubmit('claim', 'minha resposta')).rejects.toThrow(/continua no campo/);
    expect(fsm.getState().practice!.active!.turns).toHaveLength(0);
    down = false;
    expect((await fsm.practiceSubmit('claim', 'minha resposta')).practice!.history).toHaveLength(1);
  });

  it('survives a restart in the middle of a problem, with the solution still committed', async () => {
    const { fsm } = engineWith();
    fsm.startPractice({ material: 'Recursão' });
    await fsm.practiceNext();
    await fsm.practiceSubmit('work', 'travei');
    const snapshot = JSON.parse(JSON.stringify(fsm.getSnapshot()));
    expect(snapshot.practiceSolution.text).toBe('SOLUÇÃO SECRETA 1');
    expect(JSON.stringify(snapshot.session)).not.toContain('SOLUÇÃO SECRETA');

    const restored = engineWith().fsm;
    restored.restoreSnapshot(snapshot);
    const s = await restored.practiceSubmit('claim', 'certo');
    expect(s.practice!.history[0]).toMatchObject({ outcome: 'solved', maxRung: 0, modelSolution: 'SOLUÇÃO SECRETA 1' });
  });

  it('practice calls are refused outside a practice session', async () => {
    const { fsm } = engineWith();
    await fsm.startSession('teaching', 'Redes');
    await expect(fsm.practiceNext()).rejects.toThrow(/sessão de prática/);
  });

  it('the prompts state the mode, the ceiling of the ladder and never leak the target into the statement rule', () => {
    const pose = buildPosePrompt({ material: 'm', targets, demand: { targetIds: ['a', 'b'], mode: 'composition', difficulty: 4 }, history: [] });
    expect(pose.systemPrompt).toContain('COMPOSITION');
    expect(pose.systemPrompt).toContain('Dificuldade 4 de 5');
    expect(pose.systemPrompt).toContain('O enunciado nunca anuncia o alvo');
    expect(pose.prompt).toContain('ALVO(S) DESTE PROBLEMA: a, b');
    const help = buildHelpPrompt({ problem: done({ maxRung: 4, outcome: undefined }), modelSolution: 'sol', targets, text: '' });
    expect(help.systemPrompt).toContain('permitido agora é R5');
    expect(help.prompt).toContain('(vazio: só pediu ajuda)');
  });
});
