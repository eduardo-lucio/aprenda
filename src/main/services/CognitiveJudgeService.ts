import { ConceptNode, JudgeEvaluationResult } from '../../shared/types';
import { buildCognitiveJudgePrompt } from '../prompts/cognitiveJudgePrompt';
import { callLLM, LLMCaller, parseLLMJson } from './llmClient';

const VERDICTS = ['mastered', 'false_positive', 'blind_spot', 'frontier'] as const;

export class CognitiveJudgeService {
  constructor(private llm: LLMCaller = callLLM) {}

  async evaluate(attempt: {
    node: ConceptNode;
    questionText: string;
    options: string[];
    selectedOptionIndex: number;
    correctOptionIndex: number;
    confidence: number;
    thinkingText: string;
  }): Promise<JudgeEvaluationResult> {
    const isCorrectOption = attempt.selectedOptionIndex === attempt.correctOptionIndex;

    try {
      const { systemPrompt, prompt } = buildCognitiveJudgePrompt(attempt);
      const rawResponse = await this.llm({
        systemPrompt,
        prompt,
        temperature: 0.1,
        jsonMode: true,
        timeoutMs: 45000,
      });

      const parsed = parseLLMJson<any>(rawResponse);
      if (parsed.verdict && (VERDICTS as readonly string[]).includes(parsed.verdict)) {
        return {
          verdict: parsed.verdict,
          isCorrectOption,
          confidenceLevel: attempt.confidence,
          reasoningDiagnosis: parsed.reasoningDiagnosis || 'Avaliação cognitiva gerada pelo modelo.',
          identifiedMisconception: parsed.identifiedMisconception || undefined,
        };
      }
    } catch (_err) {
      // Heuristic fallback for offline / network timeout / demo resiliency
    }

    return this.evaluateHeuristic(attempt, isCorrectOption);
  }

  /** Domain-agnostic fallback based on correctness, confidence and reasoning depth. */
  private evaluateHeuristic(
    attempt: { confidence: number; thinkingText: string },
    isCorrectOption: boolean
  ): JudgeEvaluationResult {
    const text = (attempt.thinkingText || '').toLowerCase().trim();
    const isGuess =
      text.includes('chute') ||
      text.includes('eliminação') ||
      text.includes('não sei') ||
      text.includes('acho que') ||
      text.includes('talvez') ||
      text.split(/\s+/).filter(Boolean).length < 4;

    let verdict: JudgeEvaluationResult['verdict'];
    let reasoningDiagnosis: string;

    if (isCorrectOption) {
      if (isGuess || attempt.confidence < 50) {
        verdict = 'false_positive';
        reasoningDiagnosis =
          'Falso Positivo (avaliação heurística offline): alternativa correta, mas o raciocínio foi superficial, por eliminação ou com baixa confiança.';
      } else {
        verdict = 'mastered';
        reasoningDiagnosis =
          'Domínio (avaliação heurística offline): resposta correta sustentada por justificativa e confiança consistentes.';
      }
    } else if (attempt.confidence >= 60) {
      verdict = 'blind_spot';
      reasoningDiagnosis =
        'Ponto Cego (avaliação heurística offline): erro cometido com alta convicção, sugerindo um modelo mental distorcido.';
    } else {
      verdict = 'frontier';
      reasoningDiagnosis =
        'Fronteira (avaliação heurística offline): erro com dúvida declarada, marcando o limite atual da compreensão.';
    }

    return {
      verdict,
      isCorrectOption,
      confidenceLevel: attempt.confidence,
      reasoningDiagnosis,
    };
  }
}
