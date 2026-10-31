import { ConceptNode, JudgeEvaluationResult } from '../../shared/types';
import { buildCognitiveJudgePrompt } from '../prompts/cognitiveJudgePrompt';
import { callLLM } from './llmClient';

export class CognitiveJudgeService {
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
      const rawResponse = await callLLM({
        systemPrompt,
        prompt,
        temperature: 0.1,
        jsonMode: true,
      });

      // Parse JSON from LLM
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.verdict && ['mastered', 'false_positive', 'blind_spot', 'frontier'].includes(parsed.verdict)) {
          return {
            verdict: parsed.verdict,
            isCorrectOption,
            confidenceLevel: attempt.confidence,
            reasoningDiagnosis: parsed.reasoningDiagnosis || 'Avaliação cognitiva gerada pelo modelo.',
            identifiedMisconception: parsed.identifiedMisconception,
          };
        }
      }
    } catch (_err) {
      // Heuristic fallback for offline / network timeout / demo resiliency
    }

    return this.evaluateHeuristic(attempt, isCorrectOption);
  }

  private evaluateHeuristic(
    attempt: {
      node: ConceptNode;
      questionText: string;
      options: string[];
      selectedOptionIndex: number;
      correctOptionIndex: number;
      confidence: number;
      thinkingText: string;
    },
    isCorrectOption: boolean
  ): JudgeEvaluationResult {
    const text = (attempt.thinkingText || '').toLowerCase().trim();
    const isGuess =
      text.includes('chute') ||
      text.includes('eliminação') ||
      text.includes('não sei') ||
      text.includes('acho que') ||
      text.length < 15;

    // Detect conceptual mismatch or flawed reasoning
    const flawedKeywords = ['camada física', 'volta pro remetente', 'lixo', 'resetado', 'devolve'];
    const hasFlawedReasoning = flawedKeywords.some((w) => text.includes(w));

    let verdict: 'mastered' | 'false_positive' | 'blind_spot' | 'frontier';
    let reasoningDiagnosis = '';

    if (isCorrectOption) {
      if (hasFlawedReasoning || isGuess || attempt.confidence < 50) {
        verdict = 'false_positive';
        reasoningDiagnosis =
          'Falso Positivo detectado: O estudante acertou a alternativa correta, mas seu raciocínio livre revelou suposição por eliminação ou fundamentação conceitual incorreta.';
      } else {
        verdict = 'mastered';
        reasoningDiagnosis =
          'Domínio comprovado: Resposta correta sustentada por raciocínio conceitual alinhado às regras do protocolo.';
      }
    } else {
      if (attempt.confidence >= 60) {
        verdict = 'blind_spot';
        reasoningDiagnosis =
          'Ponto Cego identificado: O estudante cometeu um erro na alternativa com alto índice de convicção, sugerindo um modelo mental distorcido.';
      } else {
        verdict = 'frontier';
        reasoningDiagnosis =
          'Fronteira limpa de conhecimento: O estudante expressou dúvida sincera e não dominou a questão, marcando o limite exato de sua compreensão atual.';
      }
    }

    return {
      verdict,
      isCorrectOption,
      confidenceLevel: attempt.confidence,
      reasoningDiagnosis,
      identifiedMisconception: hasFlawedReasoning
        ? 'Confusão entre descarte de pacote L3 e retorno/retransmissão'
        : undefined,
    };
  }
}
