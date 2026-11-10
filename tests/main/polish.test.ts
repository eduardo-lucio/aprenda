// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { CurriculumGenerator, MIN_GRAPH_NODES } from '../../src/main/services/CurriculumGenerator';
import { ProviderLimitError, type LLMCaller } from '../../src/main/services/llmClient';
import { mockJudge, mockLLM, noShuffle } from '../helpers/mockLLM';
import { SessionStateMachine } from '../../src/main/fsm/SessionStateMachine';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';
import { registerIpcHandlers } from '../../src/main/ipc/registerIpcHandlers';
import { SocraticEngine } from '../../src/main/socratic/SocraticEngine';
import { buildCognitiveJudgePrompt } from '../../src/main/prompts/cognitiveJudgePrompt';

const isMap = (o: { systemPrompt?: string }) => (o.systemPrompt || '').includes('Arquiteto Curricular');

/** The mock map cut to `sizes[i]` concepts on the i-th map request (an Error is thrown instead). */
const mapsOf = (...sizes: Array<number | Error>) => {
  const prompts: string[] = [];
  const llm: LLMCaller = async (o) => {
    if (!isMap(o)) return mockLLM(o);
    prompts.push(o.prompt || '');
    const size = sizes[prompts.length - 1];
    if (size instanceof Error) throw size;
    const parsed = JSON.parse(await mockLLM(o));
    parsed.nodes = parsed.nodes.slice(0, size);
    if (!parsed.nodes.some((n: any) => n.id === parsed.firstQuestion.nodeId)) delete parsed.firstQuestion;
    return JSON.stringify(parsed);
  };
  return { llm, prompts };
};

describe('a map too small for a real probe', () => {
  it('a full map is taken at once', async () => {
    const { llm, prompts } = mapsOf(8);
    expect((await new CurriculumGenerator(llm, noShuffle).generateGraph('TCP')).nodes).toHaveLength(8);
    expect(prompts).toHaveLength(1);
  });

  it('a short map is asked for again, saying how short it was', async () => {
    const { llm, prompts } = mapsOf(4, 7);
    expect((await new CurriculumGenerator(llm, noShuffle).generateGraph('TCP')).nodes).toHaveLength(7);
    expect(prompts[0]).not.toContain('ATENÇÃO');
    expect(prompts[1]).toContain(`só 4 conceitos. O grafo precisa de ${MIN_GRAPH_NODES} a 8`);
  });

  it('if the second one is still short, the larger of the two is used', async () => {
    const { llm } = mapsOf(5, 4);
    expect((await new CurriculumGenerator(llm, noShuffle).generateGraph('TCP')).nodes).toHaveLength(5);
  });

  it('a provider refusal on the second request keeps the short map instead of failing the session', async () => {
    const { llm } = mapsOf(4, new ProviderLimitError('rate_limit', 'HTTP 429', 429));
    const generator = new CurriculumGenerator(llm, noShuffle);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await generator.generateGraph('TCP')).nodes).toHaveLength(4);
    vi.restoreAllMocks();
  });
});

describe('a confidence the student did not state', () => {
  it('reaches the judge as not stated, with the rule that it is not low confidence', () => {
    const { systemPrompt, prompt } = buildCognitiveJudgePrompt({
      node: { id: 'n', title: 'T', summary: '', level: 1, prerequisites: [], unconditionalTruth: 'V', status: 'untested' },
      questionText: 'Q?', options: ['a', 'b', 'c', 'd'], selectedOptionIndex: 0, correctOptionIndex: 0, thinkingText: '',
    } as any);
    expect(prompt).toContain('Nível de Certeza Declarado: não informado');
    expect(systemPrompt).toContain('Não informada NÃO é confiança baixa');
  });
});

describe('saving requests', () => {
  const isQuestion = (o: { systemPrompt?: string }) => {
    const sys = o.systemPrompt || '';
    return !['Arquiteto Curricular', 'Orientador Pedagógico', 'Juiz Cognitivo'].some((k) => sys.includes(k));
  };
  /** Runs the probe for three answers and counts the question requests sent. */
  async function questionsAsked(save: boolean): Promise<number> {
    let asked = 0;
    const llm: LLMCaller = async (o) => {
      if (isQuestion(o)) asked++;
      return mockLLM(o);
    };
    const f = new SessionStateMachine(new KnowledgeStore(), mockJudge(), new CurriculumGenerator(llm, noShuffle));
    f.setMinProbeQuestions(20);
    f.setSaveRequests(save);
    await f.startSession('teaching', 'Redes');
    await f.submitGoalClarification('TCP e UDP');
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 20));
      await f.submitProbeAnswer({ selectedOptionIndex: 1, confidence: 90, thinkingText: 'x' });
    }
    await new Promise((r) => setTimeout(r, 50));
    return asked;
  }

  it('writes each question only when it is needed', async () => {
    const saving = await questionsAsked(true);
    const ahead = await questionsAsked(false);
    // One question per answer (the first comes with the map)
    expect(saving).toBe(3);
    expect(ahead).toBeGreaterThan(saving);
  });

  it('the setting reaches the main process', async () => {
    const handlers = new Map<string, (...args: any[]) => any>();
    const store = new KnowledgeStore();
    const fsm = new SessionStateMachine(store, mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    registerIpcHandlers({ handle: (ch: string, fn: any) => handlers.set(ch, fn), on: () => {} } as any, {
      fsm, store, socratic: new SocraticEngine(mockLLM),
    });
    await handlers.get('settings:update')!({}, { saveRequests: true });
    expect(fsm.getOrchestrator().isSpeculative()).toBe(false);
    await handlers.get('settings:update')!({}, { saveRequests: false });
    expect(fsm.getOrchestrator().isSpeculative()).toBe(true);
  });
});
