import { CheckQuestionData, ConceptNode } from '../../shared/types';
import { buildSocraticTeachPrompt } from '../prompts/surgicalGeneratorPrompt';
import { callLLM, LLMCaller, parseLLMJson } from '../services/llmClient';
import { CurriculumGenerator } from '../services/CurriculumGenerator';

export class SocraticEngine {
  private currentNode?: ConceptNode;
  private generator: CurriculumGenerator;

  constructor(private llm: LLMCaller = callLLM, generator?: CurriculumGenerator) {
    this.generator = generator || new CurriculumGenerator(llm);
  }

  async generatePredictStep(node: ConceptNode, goal = ''): Promise<{ questionText: string; promptGoal: string }> {
    this.currentNode = node;
    return this.generator.generatePredict(node, goal || node.title);
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
    } catch (_err) {
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
