import {
  ConceptNode,
  JudgeEvaluationResult,
  ProbeAnswerKind,
  resolveAnswerKind,
} from '../../shared/types';
import { buildCognitiveJudgePrompt } from '../prompts/cognitiveJudgePrompt';
import { callLLM, isFatalLLMError, LLMCaller, localize, parseLLMJson } from './llmClient';

const VERDICTS = ['mastered', 'false_positive', 'blind_spot', 'frontier'] as const;
type Verdict = (typeof VERDICTS)[number];

const MAX_TRIES = 2;

/**
 * The judge could not produce a trustworthy verdict (timeout, bad JSON, provider error).
 * Never graded "offline": the caller must surface it so the student can simply resubmit.
 */
export class JudgeUnavailableError extends Error {
  constructor(reason: string) {
    super(
      localize(
        `Não foi possível avaliar sua resposta (${reason}). Sua resposta NÃO foi registrada: envie de novo. ` +
          'Se continuar falhando, troque o modelo em Configurações → Modelo ou verifique sua conexão.',
        `Your answer could not be evaluated (${reason}). It was NOT recorded: send it again. ` +
          'If it keeps failing, switch the model in Settings → Model or check your connection.'
      )
    );
    this.name = 'JudgeUnavailableError';
  }
}

export class CognitiveJudgeService {
  constructor(private llm: LLMCaller = callLLM) {}

  async evaluate(attempt: {
    node: ConceptNode;
    questionText: string;
    options: string[];
    selectedOptionIndex: number;
    answerKind?: ProbeAnswerKind;
    correctOptionIndex: number;
    confidence?: number;
    thinkingText: string;
  }): Promise<JudgeEvaluationResult> {
    const kind = resolveAnswerKind(attempt.selectedOptionIndex, attempt.answerKind);
    const isCorrectOption = kind === 'option' && attempt.selectedOptionIndex === attempt.correctOptionIndex;

    let lastErr: unknown;
    let incoherent: { parsed: any } | undefined;

    for (let tryNo = 0; tryNo < MAX_TRIES; tryNo++) {
      try {
        const { systemPrompt, prompt } = buildCognitiveJudgePrompt({ ...attempt, answerKind: kind });
        const rawResponse = await this.llm({
          systemPrompt,
          prompt,
          temperature: 0.1,
          jsonMode: true,
          maxTokens: 1024,
          timeoutMs: 30000,
        });

        const parsed = parseLLMJson<any>(rawResponse);

        if (!parsed?.verdict || !(VERDICTS as readonly string[]).includes(parsed.verdict)) {
          lastErr = new Error('veredito ausente ou inválido na resposta do modelo');
          continue;
        }
        if (!this.isCoherent(parsed.verdict, kind, isCorrectOption)) {
          incoherent = { parsed };
          continue;
        }

        return {
          verdict: parsed.verdict,
          isCorrectOption,
          confidenceLevel: attempt.confidence,
          reasoningDiagnosis: parsed.reasoningDiagnosis || 'Avaliação cognitiva gerada pelo modelo.',
          identifiedMisconception: parsed.identifiedMisconception || undefined,
          agentThinking: this.pickThinking(parsed),
        };
      } catch (err) {
        // Quota/credit/key failures and missing configuration must reach the user right away
        if (isFatalLLMError(err)) throw err;
        lastErr = err;
      }
    }

    // The model kept contradicting the answer key: keep the objective bit, never inflate mastery.
    if (incoherent) return this.conservativeVerdict(attempt, kind, isCorrectOption, incoherent);

    throw new JudgeUnavailableError(this.describeFailure(lastErr));
  }

  /**
   * A verdict must agree with correctness: right answers are mastered/false_positive, wrong ones
   * blind_spot/frontier, "não sei" is always frontier. A written (own) answer has no answer key,
   * so the judge's reading of the text decides.
   */
  private isCoherent(verdict: string, kind: ProbeAnswerKind, isCorrectOption: boolean): boolean {
    if (kind === 'own_answer') return true;
    if (kind === 'dont_know') return verdict === 'frontier';
    return isCorrectOption
      ? verdict === 'mastered' || verdict === 'false_positive'
      : verdict === 'blind_spot' || verdict === 'frontier';
  }

  /** Used only when the model contradicts the answer key twice: never grants "mastered". */
  private conservativeVerdict(
    attempt: { confidence?: number },
    kind: ProbeAnswerKind,
    isCorrectOption: boolean,
    source: { parsed: any }
  ): JudgeEvaluationResult {
    const verdict: Verdict = kind === 'option' && isCorrectOption ? 'false_positive' : 'frontier';
    const note =
      verdict === 'false_positive'
        ? 'Acerto não confirmado: o modelo avaliador se contradisse com o gabarito, então tratamos o domínio como não verificado.'
        : 'Resposta não validada: o modelo avaliador se contradisse com o gabarito.';
    return {
      verdict,
      isCorrectOption,
      confidenceLevel: attempt.confidence,
      reasoningDiagnosis: [source.parsed?.reasoningDiagnosis, note].filter(Boolean).join(' '),
      identifiedMisconception: source.parsed?.identifiedMisconception || undefined,
      agentThinking: this.pickThinking(source.parsed),
    };
  }

  private pickThinking(parsed: any): string | undefined {
    return (
      (typeof parsed?.agentThinking === 'string' && parsed.agentThinking.trim()) ||
      parsed?.reasoningDiagnosis ||
      undefined
    );
  }

  private describeFailure(err: unknown): string {
    const msg = String((err as any)?.message || err || '');
    if (/Tempo limite|timed out|timeout|aborted/i.test(msg)) return localize('o modelo demorou demais para responder', 'the model took too long to answer');
    if (/fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|network/i.test(msg)) return localize('falha de conexão com o provedor de IA', 'could not reach the AI provider');
    if (/JSON|Unexpected token|parse/i.test(msg)) return localize('a IA respondeu num formato inesperado', 'the AI answered in an unexpected format');
    return msg ? msg.slice(0, 120) : localize('erro desconhecido do provedor de IA', 'unknown AI provider error');
  }
}
