import { CheckQuestionData, ConceptNode } from '../../shared/types';
import { buildSocraticTeachPrompt } from '../prompts/surgicalGeneratorPrompt';
import { callLLM, isProviderLimitError, LLMCaller, localize, parseLLMJson } from '../services/llmClient';
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

    const teachProse = localize(
      `A ideia central é esta: ${node.unconditionalTruth}\n\nCompare com o seu palpite ("${studentPrediction}"). O que bate com essa ideia mostra que você estava no caminho; o que não bate é justamente o ponto a ajustar em "${node.title}".`,
      `The core idea is this: ${node.unconditionalTruth}\n\nCompare it with your guess ("${studentPrediction}"). Whatever matches shows you were on track; whatever doesn't is exactly what to adjust in "${node.title}".`
    );
    return { teachProse };
  }

  async generateCheckQuestion(node: ConceptNode): Promise<CheckQuestionData> {
    this.currentNode = node;
    // Neutral fallback built only from the AI-generated node itself
    return {
      questionText: localize(
        `Qual afirmação descreve corretamente a ideia central de "${node.title}"?`,
        `Which statement correctly describes the core idea of "${node.title}"?`
      ),
      options: [
        node.unconditionalTruth,
        localize(
          `"${node.title}" não depende dos conceitos anteriores e pode ser usado isoladamente.`,
          `"${node.title}" does not depend on the previous concepts and can be used on its own.`
        ),
        localize(
          `A ideia de "${node.title}" só vale em casos particulares, sem regra geral.`,
          `The idea of "${node.title}" only holds in special cases, with no general rule.`
        ),
        localize('Nenhuma das anteriores.', 'None of the above.'),
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

    const correctOptionText = checkData.options[checkData.correctOptionIndex] || '';
    const repairExplanation = localize(
      `A resposta certa era "${correctOptionText}". ${checkData.explanation} Vamos seguir para o próximo conceito; você pode voltar a este pelo mapa quando quiser.`,
      `The right answer was "${correctOptionText}". ${checkData.explanation} Let's move on to the next concept; you can come back to this one from the map anytime.`
    );

    return { isPassed: false, repairExplanation };
  }
}
