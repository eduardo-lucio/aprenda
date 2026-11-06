import { CheckQuestionData, ConceptNode } from '../../shared/types';
import { buildSocraticTeachPrompt } from '../prompts/surgicalGeneratorPrompt';
import { callLLM, isProviderLimitError, LLMCaller, parseLLMJson } from '../services/llmClient';
import { CurriculumGenerator } from '../services/CurriculumGenerator';

export class SocraticEngine {
  private currentNode?: ConceptNode;
  private generator: CurriculumGenerator;
  private predictCache = new Map<string, { questionText: string; promptGoal: string }>();

  constructor(private llm: LLMCaller = callLLM, generator?: CurriculumGenerator) {
    this.generator = generator || new CurriculumGenerator(llm);
  }

  async prebakePredict(
    node: ConceptNode,
    goal: string,
    options?: { signal?: AbortSignal }
  ): Promise<{ questionText: string; promptGoal: string }> {
    const cached = this.predictCache.get(node.id);
    if (cached) return cached;

    const res = await this.generator.generatePredict(node, goal || node.title, options);
    this.predictCache.set(node.id, res);
    return res;
  }

  async generatePredictStep(
    node: ConceptNode,
    goal = '',
    options?: { signal?: AbortSignal }
  ): Promise<{ questionText: string; promptGoal: string }> {
    this.currentNode = node;
    const cached = this.predictCache.get(node.id);
    if (cached) return cached;

    const res = await this.generator.generatePredict(node, goal || node.title, options);
    this.predictCache.set(node.id, res);
    return res;
  }

  async submitPrediction(studentPrediction: string): Promise<{ teachProse: string; checkQuestion?: CheckQuestionData }> {
    const node = this.currentNode;
    if (!node) {
      throw new Error('Nenhum conceito ativo selecionado para o ciclo socrático.');
    }

    try {
      const { systemPrompt, prompt } = buildSocraticTeachPrompt(node, studentPrediction);
      const raw = await this.llm({ systemPrompt, prompt, temperature: 0.3, jsonMode: true, timeoutMs: 60000 });
      const parsed = parseLLMJson<any>(raw);
      if (parsed.teachProse) {
        const cq = parsed.checkQuestion;
        const validCheck =
          cq &&
          typeof cq.questionText === 'string' &&
          Array.isArray(cq.options) &&
          cq.options.length >= 2 &&
          Number(cq.correctOptionIndex) >= 0 &&
          Number(cq.correctOptionIndex) < cq.options.length;
        return {
          teachProse: String(parsed.teachProse),
          checkQuestion: validCheck
            ? {
                questionText: cq.questionText,
                options: cq.options.map((o: unknown) => String(o)),
                correctOptionIndex: Number(cq.correctOptionIndex),
                explanation: String(cq.explanation || node.unconditionalTruth),
              }
            : undefined,
        };
      }
    } catch (err) {
      if (isProviderLimitError(err)) throw err;
      // Offline fallback below
    }

    const teachProse = `Princípio central: ${node.unconditionalTruth}\n\nCompare com a sua previsão ("${studentPrediction}"): onde ela concorda com esse princípio, sua intuição estava no caminho certo; onde diverge, é exatamente esse o ajuste que precisamos fazer em "${node.title}".`;
    return { teachProse };
  }

  async generateCheckQuestion(node: ConceptNode): Promise<CheckQuestionData> {
    this.currentNode = node;
    // Neutral fallback built only from the AI-generated node itself
    return {
      questionText: `Qual afirmação expressa corretamente o princípio central de "${node.title}"?`,
      options: [
        node.unconditionalTruth,
        `"${node.title}" não tem relação com seus pré-requisitos e pode ser aplicado isoladamente.`,
        `O princípio de "${node.title}" vale apenas em casos particulares, sem regra geral.`,
        'Nenhuma das anteriores.',
      ],
      correctOptionIndex: 0,
      explanation: node.unconditionalTruth,
    };
  }

  evaluateCheck(studentAnswerIndex: number, checkData: CheckQuestionData): { isPassed: boolean; repairExplanation?: string } {
    const isPassed = studentAnswerIndex === checkData.correctOptionIndex;
    if (isPassed) {
      return { isPassed: true };
    }

    const correctOptionText = checkData.options[checkData.correctOptionIndex] || 'Alternativa correta';
    const repairExplanation = `A alternativa correta é "${correctOptionText}". Motivo: ${checkData.explanation} (Seguimos para o próximo degrau — sem ciclo de remediação infinito.)`;

    return { isPassed: false, repairExplanation };
  }
}
