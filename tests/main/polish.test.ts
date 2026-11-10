// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { CurriculumGenerator, MIN_GRAPH_NODES } from '../../src/main/services/CurriculumGenerator';
import { ProviderLimitError, type LLMCaller } from '../../src/main/services/llmClient';
import { mockLLM, noShuffle } from '../helpers/mockLLM';
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
