import { CheckQuestionData, ConceptNode } from '../../shared/types';
import { buildSocraticTeachPrompt } from '../prompts/surgicalGeneratorPrompt';
import { callLLM, isFatalLLMError, LLMCaller, localize, parseLLMJson } from '../services/llmClient';
import { CurriculumGenerator, parseCorrectIndex } from '../services/CurriculumGenerator';

export class SocraticEngine {
  private currentNode?: ConceptNode;
  private generator: CurriculumGenerator;
  private predictCache = new Map<string, { questionText: string; promptGoal: string }>();

  constructor(private llm: LLMCaller = callLLM, generator?: CurriculumGenerator) {
    this.generator = generator || new CurriculumGenerator(llm);
  }

  /** Concept ids repeat across sessions, so nothing cached here may outlive the session. */
  reset(): void {
    this.currentNode = undefined;
    this.predictCache.clear();
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

  async submitPrediction(studentPrediction: string): Promise<{ teachProse: string; checkQuestion: CheckQuestionData }> {
    const node = this.currentNode;
    if (!node) {
      throw new Error(localize('Nenhum conceito ativo selecionado para o ciclo socrático.', 'No concept is selected for this lesson.'));
    }

    const { systemPrompt, prompt } = buildSocraticTeachPrompt(node, studentPrediction);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await this.llm({ systemPrompt, prompt, temperature: 0.3, jsonMode: true, timeoutMs: 60000 });
        const parsed = parseLLMJson<any>(raw);
        const cq = parsed.checkQuestion;
        const correct =
          cq && typeof cq.questionText === 'string' && Array.isArray(cq.options) && cq.options.length >= 2
            ? parseCorrectIndex(cq.correctOptionIndex, cq.options.length)
            : null;
        if (parsed.teachProse && correct !== null) {
          const arranged = this.generator.arrangeOptions(cq.options.map((o: unknown) => String(o)), correct);
          return {
            teachProse: String(parsed.teachProse),
            checkQuestion: {
              questionText: cq.questionText,
              options: arranged.options,
              correctOptionIndex: arranged.correctOptionIndex,
              explanation: String(cq.explanation || node.unconditionalTruth),
            },
          };
        }
      } catch (err) {
        if (isFatalLLMError(err)) throw err;
      }
    }

    throw new Error(
      localize(
        `Não foi possível preparar a explicação de "${node.title}". Seu palpite continua no campo: envie de novo.`,
        `The explanation of "${node.title}" could not be prepared. Your guess is still in the field: send it again.`
      )
    );
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
