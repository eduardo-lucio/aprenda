import { describe, it, expect, vi } from 'vitest';
import { registerIpcHandlers } from '../../src/main/ipc/registerIpcHandlers';
import { SessionStateMachine } from '../../src/main/fsm/SessionStateMachine';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';
import { CurriculumGenerator } from '../../src/main/services/CurriculumGenerator';
import { rewriteOptionReferences, SocraticEngine } from '../../src/main/socratic/SocraticEngine';
import { buildLessonStepPrompt, buildSocraticTeachPrompt } from '../../src/main/prompts/surgicalGeneratorPrompt';
import type { CallLLMOptions } from '../../src/main/services/llmClient';
import type { ConceptNode, ProbeAttempt } from '../../src/shared/types';
import { mockJudge, mockLLM, noShuffle } from '../helpers/mockLLM';

const node = (id: string, level: number, prerequisites: string[]): ConceptNode => ({
  id,
  title: id.toUpperCase(),
  summary: `${id}.`,
  level,
  prerequisites,
  unconditionalTruth: `${id} vale.`,
  status: 'untested',
});

describe('a lesson check names options by what they say, never by a letter', () => {
  // The order the model wrote; the student sees them shuffled and without letters
  const written = ['Ele altera o cabeçalho IP.', 'Ele consulta a tabela de roteamento.', 'Ele descarta o pacote.', 'Ele devolve o pacote.'];

  it('the letter of the right option becomes "the right option" (the case on screen)', () => {
    expect(rewriteOptionReferences('A opção B descreve corretamente que o roteador usa a tabela.', written, 1)).toBe(
      'A alternativa certa descreve corretamente que o roteador usa a tabela.'
    );
  });

  it('a wrong option is quoted, after a preposition or in parentheses too', () => {
    expect(rewriteOptionReferences('Quem marca a alternativa (C) acha que a falta de rota é rara; na opção D, o modelo é outro.', written, 1)).toBe(
      'Quem marca a alternativa "Ele descarta o pacote" acha que a falta de rota é rara; na alternativa "Ele devolve o pacote", o modelo é outro.'
    );
    expect(rewriteOptionReferences('Opção B está certa. Option C is the trap; the answer B holds.', written, 1)).toBe(
      'A alternativa certa está certa. The option "Ele descarta o pacote" is the trap; the right option holds.'
    );
  });

  it('text that only looks like a reference is left alone', () => {
    const text = 'É a opção a ser seguida, a opção E não existe e a letra minúscula b também não.';
    expect(rewriteOptionReferences(text, written, 1)).toBe(text);
  });

  it('the explanation the student reads after the shuffle has no stale letter', async () => {
    const llm = vi.fn(async () =>
      JSON.stringify({
        steps: ['Passo único'],
        teachProse: 'Texto.',
        checkQuestion: { questionText: 'Q?', options: written, correctOptionIndex: 1, explanation: 'A opção B descreve corretamente o encaminhamento.' },
      })
    );
    // With this draw the right option moves from the second place to the first, as on the screen
    const reversing = new CurriculumGenerator(llm, () => 0);
    const engine = new SocraticEngine(llm, reversing);
    engine.resumeNode(node('rota', 1, []));
    const { checkQuestion } = await engine.submitPrediction('palpite');
    expect(checkQuestion.options[checkQuestion.correctOptionIndex]).toBe(written[1]);
    expect(checkQuestion.correctOptionIndex).not.toBe(1);
    expect(checkQuestion.explanation).toBe('A alternativa certa descreve corretamente o encaminhamento.');
  });
});

describe('lesson checks are held to the bar of the probe', () => {
  const reference = [{ questionText: 'Um roteador com as rotas 10.0.0.0/8 e 10.1.0.0/16 recebe 10.1.2.3. Por onde sai?', options: ['a', 'b', 'c', 'd'], correctAnswer: 'b' }];

  it('both lesson prompts carry the probe questions, the question craft and the rules against easy checks', () => {
    const opening = buildSocraticTeachPrompt(node('rota', 1, []), 'palpite', [], reference);
    const step = buildLessonStepPrompt(node('rota', 1, []), { steps: ['1', '2'], stepIndex: 1, retries: 0, prediction: 'p', taught: [] }, undefined, reference);
    for (const built of [opening, step]) {
      expect(built.prompt).toContain('PERGUNTAS DA SONDAGEM DESTA SESSÃO');
      expect(built.prompt).toContain('10.1.2.3');
      expect(built.systemPrompt).toMatch(/The option craft/);
      expect(built.systemPrompt).toMatch(/Mesma altura das perguntas da sondagem/);
      expect(built.systemPrompt).toMatch(/Nunca por letra, número ou posição/);
      expect(built.systemPrompt).not.toMatch(/Alternativa A/);
    }
    expect(buildSocraticTeachPrompt(node('rota', 1, []), 'palpite').prompt).not.toContain('PERGUNTAS DA SONDAGEM');
  });

  it('picks the concept\'s own questions first, then its line of the map, the latest first', () => {
    const store = new KnowledgeStore();
    const fsm = new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    const nodes = [node('a', 1, []), node('b', 2, ['a']), node('c', 3, ['b']), node('d', 1, [])];
    const attempt = (nodeId: string, questionText: string): ProbeAttempt => ({
      questionId: questionText,
      nodeId,
      questionText,
      options: ['x', 'y', 'z', 'w'],
      correctOptionIndex: 2,
      selectedOptionIndex: 0,
      thinkingText: '',
      verdict: 'frontier',
      judgeReasoning: '',
    });
    fsm.restoreSnapshot({
      session: {
        id: 's',
        mode: 'teaching',
        disciplineId: 'g',
        goal: 'g',
        topic: 'g',
        phase: 'teaching',
        questionCount: 5,
        frontierClarity: 1,
        attempts: [attempt('d', 'Qd'), attempt('a', 'Qa'), attempt('c', 'Qc'), attempt('b', 'Qb'), attempt('c', 'Qc')],
        nodesState: {},
        goalClarificationOptions: [],
      },
      nodes,
      askedQuestions: [],
      teachingOrder: [],
      lessonFailures: {},
      planRevisedFor: [],
    } as any);

    const picked = fsm.getProbeReference('b');
    expect(picked.map((r) => r.questionText)).toEqual(['Qb', 'Qc', 'Qa']);
    expect(picked[0]).toMatchObject({ options: ['x', 'y', 'z', 'w'], correctAnswer: 'z' });
    expect(fsm.getProbeReference('d', 2).map((r) => r.questionText)).toEqual(['Qd', 'Qc']);
  });

  it('a lesson after a real probe sends the questions the student answered', async () => {
    const prompts: string[] = [];
    const recording = async (o: CallLLMOptions) => {
      if ((o.systemPrompt || '').includes('professor do APRENDA')) prompts.push(o.prompt);
      return mockLLM(o);
    };
    const handlers: Record<string, Function> = {};
    const ipc = { handle: (c: string, l: Function) => (handlers[c] = l), on: (c: string, l: Function) => (handlers[c] = l) } as any;
    const store = new KnowledgeStore();
    const fsm = new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    registerIpcHandlers(ipc, { fsm, store, socratic: new SocraticEngine(recording, new CurriculumGenerator(mockLLM, noShuffle)) });

    await handlers['session:start']({}, 'teaching', 'Redes');
    await handlers['session:submit-goal']({}, 'TCP e UDP');
    for (let i = 0; i < 8; i++) {
      const res = await handlers['session:submit-probe']({}, { selectedOptionIndex: 1, confidence: 90, thinkingText: 'x' });
      if (res.nextAction === 'transition_plan') break;
    }
    if (fsm.getState().phase === 'probing') await handlers['session:advance-plan']({});
    await handlers['session:confirm-plan']({});
    await handlers['session:socratic-start']({});
    await handlers['session:submit-prediction']({}, 'palpite');

    const asked = fsm.getState().attempts.map((a) => a.questionText);
    const lessonPrompt = prompts.find((p) => p.includes('PREDIÇÃO SUBMETIDA'));
    expect(lessonPrompt).toContain('PERGUNTAS DA SONDAGEM DESTA SESSÃO');
    expect(asked.some((q) => lessonPrompt!.includes(q.slice(0, 60)))).toBe(true);
  });
});
