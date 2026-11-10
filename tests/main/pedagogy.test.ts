import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SessionStateMachine } from '../../src/main/fsm/SessionStateMachine';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';
import { CurriculumGenerator, parseCorrectIndex } from '../../src/main/services/CurriculumGenerator';
import { buildCognitiveJudgePrompt } from '../../src/main/prompts/cognitiveJudgePrompt';
import {
  buildGoalOptionsPrompt,
  buildGraphPrompt,
  buildPlanPrompt,
  buildPredictPrompt,
  buildProbeQuestionPrompt,
} from '../../src/main/prompts/curriculumPrompts';
import { isOrientationOption, type ConceptNode } from '../../src/shared/types';
import { getPracticeInstructions } from '../../src/main/prompts/promptLoader';
import type { LLMCaller } from '../../src/main/services/llmClient';
import { mockJudge, mockLLM, noShuffle } from '../helpers/mockLLM';

const node: ConceptNode = { id: 'n1', title: 'Conceito', summary: 'R', level: 1, prerequisites: [], unconditionalTruth: 'V', status: 'untested' };

describe('F10: the focus choice keeps its context', () => {
  it('sends topic, focus and justification to the map generation', async () => {
    const llm = vi.fn(mockLLM);
    const fsm = new SessionStateMachine(new KnowledgeStore(), mockJudge(), new CurriculumGenerator(llm as unknown as LLMCaller, noShuffle));
    await fsm.startSession('teaching', 'Quero entender redes');
    await fsm.submitGoalClarification('TCP e UDP', 'preciso para o trabalho');
    const graphCall = llm.mock.calls.find(([o]) => (o.systemPrompt || '').includes('Arquiteto Curricular'))![0];
    expect(graphCall.prompt).toContain('Quero entender redes');
    expect(graphCall.prompt).toContain('TCP e UDP');
    expect(graphCall.prompt).toContain('preciso para o trabalho');
  });

  it('"Other" offers simpler entry points on the original topic instead of building a map', async () => {
    const llm = vi.fn(mockLLM);
    const fsm = new SessionStateMachine(new KnowledgeStore(), mockJudge(), new CurriculumGenerator(llm as unknown as LLMCaller, noShuffle));
    await fsm.startSession('teaching', 'Quero entender redes');
    llm.mockClear();
    const state = await fsm.requestOrientation('não conheço os termos');
    expect(llm).toHaveBeenCalledTimes(1);
    expect(llm.mock.calls[0][0].systemPrompt).toContain('não conheço os termos');
    expect(llm.mock.calls[0][0].systemPrompt).toContain('Quero entender redes');
    expect(state.phase).toBe('goal_orientation');
    expect(state.goal).toBe('Quero entender redes');
    expect(state.goalClarificationOptions!.length).toBeGreaterThan(0);
  });

  it.each([
    ['Outro / não sei ainda — quero orientação', true],
    ['Outro / ainda não sei — quero ajuda para escolher', true],
    ['Something else / not sure yet — help me choose', true],
    ['Outros protocolos de transporte', false],
    ['Other layers of the stack', false],
  ])('recognizes %s', (text, expected) => {
    expect(isOrientationOption(text)).toBe(expected);
  });
});

describe('I6: prompts describe the app that exists', () => {
  const root = path.join(process.cwd(), 'prompts');
  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const loaded = files(root).filter((f) => !f.includes(`${path.sep}practice${path.sep}`));

  it.each(['ask_user_question', 'plan_init', 'probe_done', 'list_sessions', '`quiz`', 'mermaid', 'Check your understanding'])(
    'no prompt mentions %s',
    (term) => {
      for (const f of loaded) expect(fs.readFileSync(f, 'utf8'), f).not.toContain(term);
    }
  );

  it('each agent receives a focused system prompt', () => {
    expect(buildGoalOptionsPrompt('Tema').systemPrompt.length).toBeLessThan(8000);
    expect(buildGraphPrompt('Tema').systemPrompt.length).toBeLessThan(22000);
    expect(buildProbeQuestionPrompt(node, 'Tema', []).systemPrompt.length).toBeLessThan(16000);
    expect(buildPredictPrompt(node, 'Tema').systemPrompt.length).toBeLessThan(10000);
    expect(buildPlanPrompt({ goal: 'Tema', nodes: [node], attempts: [] }).systemPrompt.length).toBeLessThan(18000);
  });

  it('the plan prompt no longer forces Portuguese', () => {
    expect(buildPlanPrompt({ goal: 'Tema', nodes: [node], attempts: [] }).systemPrompt).not.toContain('em português');
  });

  it('examples do not always put the right answer first', () => {
    for (const { systemPrompt } of [buildGraphPrompt('Tema'), buildProbeQuestionPrompt(node, 'Tema', [])]) {
      expect(systemPrompt).not.toMatch(/"correctOptionIndex": 0/);
    }
  });

  it('A1: the practice prompts are loaded and ship with the installer', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    expect(pkg.build.extraResources[0].filter).toEqual(['**/*.md']);
    const instructions = getPracticeInstructions();
    expect(instructions).toContain('The practice session');
    expect(instructions).toContain('How the app runs it');
  });

  it('A1: the practice base describes the app, not tools it does not have', () => {
    const base = fs.readFileSync(path.join(root, 'practice', '00-base.md'), 'utf8');
    for (const term of ['`problem`', '`conclude`', 'list_propositions', 'pdf job', 'research it']) {
      expect(base, term).not.toContain(term);
    }
  });
});

describe('I14: answer keys', () => {
  it.each([
    [null, 4, null],
    [1.5, 4, null],
    ['', 4, null],
    [4, 4, null],
    [-1, 4, null],
    [2, 4, 2],
    ['3', 4, 3],
  ])('parseCorrectIndex(%s, %i) = %s', (v, len, out) => {
    expect(parseCorrectIndex(v, len)).toBe(out);
  });

  const graphWith = (firstQuestion: unknown): LLMCaller => async () =>
    JSON.stringify({
      nodes: [
        { id: 'base', title: 'Base', level: 1, prerequisites: [] },
        { id: 'meio', title: 'Meio', level: 2, prerequisites: ['base'] },
        { id: 'Camada Topo', title: 'Topo', level: 3, prerequisites: ['meio'] },
      ],
      firstQuestion,
    });
  const q = { questionText: 'Q?', options: ['a', 'b', 'c', 'd'], correctOptionIndex: 1 };

  it('finds the concept by slug', async () => {
    const r = await new CurriculumGenerator(graphWith({ ...q, nodeId: 'Camada Topo' }), noShuffle).generateGraph('T');
    expect(r.firstQuestion?.nodeId).toBe('camada-topo');
  });

  it('D3: a first question about the base is not used, because the probe enters at the top', async () => {
    const r = await new CurriculumGenerator(graphWith({ ...q, nodeId: 'base' }), noShuffle).generateGraph('T');
    expect(r.firstQuestion).toBeUndefined();
  });

  it('never reassigns a question written for another concept', async () => {
    const r = await new CurriculumGenerator(graphWith({ ...q, nodeId: 'nao-existe' }), noShuffle).generateGraph('T');
    expect(r.firstQuestion).toBeUndefined();
    const r2 = await new CurriculumGenerator(graphWith({ ...q, nodeId: 'meio' }), noShuffle).generateGraph('T');
    expect(r2.firstQuestion).toBeUndefined();
  });

  it('a null answer key is not treated as option 0', async () => {
    const r = await new CurriculumGenerator(graphWith({ ...q, nodeId: 'Camada Topo', correctOptionIndex: null }), noShuffle).generateGraph('T');
    expect(r.firstQuestion).toBeUndefined();
  });

  it('shuffling keeps the answer key on the right text', () => {
    let i = 0;
    const seq = [0.1, 0.7, 0.3];
    const gen = new CurriculumGenerator(mockLLM, () => seq[i++ % seq.length]);
    const r = gen.arrangeOptions(['certa', 'x', 'y', 'z'], 0);
    expect(r.options[r.correctOptionIndex]).toBe('certa');
    expect(r.options).not.toEqual(['certa', 'x', 'y', 'z']);
  });

  it('positional options keep their place', () => {
    const gen = new CurriculumGenerator(mockLLM, () => 0);
    const opts = ['a', 'b', 'c', 'Todas as anteriores'];
    expect(gen.arrangeOptions(opts, 3)).toEqual({ options: opts, correctOptionIndex: 3 });
  });
});

describe('I10: re-probing spreads over the concepts', () => {
  it('does not stay on one concept after everything was tested', async () => {
    const fsm = new SessionStateMachine(new KnowledgeStore(), mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    fsm.setMinProbeQuestions(20);
    await fsm.startSession('teaching', 'Tema');
    await fsm.submitGoalClarification('Foco');
    const asked: string[] = [];
    for (let i = 0; i < 16 && fsm.getState().phase === 'probing'; i++) {
      asked.push(fsm.getState().currentQuestion!.nodeId);
      await fsm.submitProbeAnswer({ selectedOptionIndex: 1, confidence: 90, thinkingText: 'x' });
    }
    const tail = asked.slice(-7);
    expect(new Set(tail).size).toBeGreaterThan(2);
    for (let i = 1; i < tail.length; i++) expect(tail[i]).not.toBe(tail[i - 1]);
  });
});

describe('U10: internal text', () => {
  const params = { node, questionText: 'Q', options: ['a', 'b'], selectedOptionIndex: 0, correctOptionIndex: 0, thinkingText: '' };
  it('the judge prompt, not the student record, says the reasoning is missing', () => {
    expect(buildCognitiveJudgePrompt(params).prompt).toContain('não explicou o raciocínio');
    expect(buildCognitiveJudgePrompt({ ...params, thinkingText: 'porque sim' }).prompt).toContain('porque sim');
  });
});
