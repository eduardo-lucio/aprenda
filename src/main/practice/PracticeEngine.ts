import { MAX_HINT_RUNG, PracticeProblem, PracticeTarget } from '../../shared/types';
import { buildClaimPrompt, buildHelpPrompt, buildPauseAnswerPrompt, buildPosePrompt } from '../prompts/practicePrompts';
import { callLLM, isFatalLLMError, LLMCaller, localize, parseLLMJson } from '../services/llmClient';
import { unescapeBreaks } from '../socratic/SocraticEngine';
import { PracticeDemand } from './practiceStream';

export interface PosedProblem {
  statement: string;
  modelSolution: string;
  /** Drawn from a free topic on the first problem; empty otherwise. */
  targets: Array<{ title: string; truth: string }>;
}

/**
 * The AI side of a practice session. It writes problems, hints, verdicts and pause answers; what
 * comes next, how far a hint may go and when a problem ends are decided by the state machine.
 */
export class PracticeEngine {
  constructor(private llm: LLMCaller = callLLM) {}

  /** Two tries: a model that answers in the wrong shape once usually gets it right the second time. */
  private async ask<T>(built: { systemPrompt: string; prompt: string }, accept: (parsed: any) => T | null, failure: string): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await this.llm({ ...built, temperature: 0.4, jsonMode: true, maxTokens: 6144, timeoutMs: 60000 });
        const value = accept(parseLLMJson<any>(raw));
        if (value !== null) return value;
      } catch (err) {
        if (isFatalLLMError(err)) throw err;
      }
    }
    throw new Error(failure);
  }

  pose(params: {
    material: string;
    targets: PracticeTarget[];
    demand: PracticeDemand;
    history: PracticeProblem[];
  }): Promise<PosedProblem> {
    const needTargets = params.targets.length === 0;
    return this.ask(
      buildPosePrompt(params),
      (parsed) => {
        const statement = typeof parsed?.statement === 'string' ? unescapeBreaks(parsed.statement).trim() : '';
        const modelSolution = typeof parsed?.modelSolution === 'string' ? unescapeBreaks(parsed.modelSolution).trim() : '';
        const targets = (Array.isArray(parsed?.targets) ? parsed.targets : [])
          .filter((t: any) => t && typeof t.title === 'string' && t.title.trim())
          .slice(0, 6)
          .map((t: any) => ({ title: String(t.title).trim().slice(0, 120), truth: String(t.truth || t.title).trim() }));
        // A problem without a committed solution cannot be judged, hinted or revealed
        if (!statement || !modelSolution || (needTargets && targets.length === 0)) return null;
        return { statement, modelSolution, targets: needTargets ? targets : [] };
      },
      localize(
        'Não foi possível preparar o problema. Nada foi perdido: tente de novo.',
        'The problem could not be prepared. Nothing was lost: try again.'
      )
    );
  }

  /** One rung of help. The ceiling is enforced here too: a model may not jump the ladder. */
  help(params: {
    problem: PracticeProblem;
    modelSolution: string;
    targets: PracticeTarget[];
    text: string;
  }): Promise<{ rung: number; reply: string; statementRepair: boolean }> {
    const ceiling = Math.min(MAX_HINT_RUNG, params.problem.maxRung + 1);
    return this.ask(
      buildHelpPrompt(params),
      (parsed) => {
        const reply = typeof parsed?.reply === 'string' ? unescapeBreaks(parsed.reply).trim() : '';
        if (!reply) return null;
        const statementRepair = parsed.statementRepair === true;
        const asked = Number.isFinite(Number(parsed.rung)) ? Math.round(Number(parsed.rung)) : ceiling;
        return { reply, statementRepair, rung: Math.min(ceiling, Math.max(0, asked)) };
      },
      localize(
        'Não foi possível preparar a dica. Seu texto continua no campo: envie de novo.',
        'The hint could not be prepared. Your text is still in the field: send it again.'
      )
    );
  }

  judgeClaim(params: {
    problem: PracticeProblem;
    modelSolution: string;
    targets: PracticeTarget[];
    text: string;
  }): Promise<{ correct: boolean; reply: string }> {
    return this.ask(
      buildClaimPrompt(params),
      (parsed) => {
        const reply = typeof parsed?.reply === 'string' ? unescapeBreaks(parsed.reply).trim() : '';
        return reply && typeof parsed.correct === 'boolean' ? { correct: parsed.correct, reply } : null;
      },
      localize(
        'Não foi possível conferir a resposta. Ela continua no campo: envie de novo.',
        'The answer could not be checked. It is still in the field: send it again.'
      )
    );
  }

  answer(params: { problem: PracticeProblem; targets: PracticeTarget[]; question: string }): Promise<string> {
    return this.ask(
      buildPauseAnswerPrompt(params),
      (parsed) => (typeof parsed?.reply === 'string' && parsed.reply.trim() ? unescapeBreaks(parsed.reply).trim() : null),
      localize(
        'Não foi possível responder agora. Sua pergunta continua no campo: envie de novo.',
        'The question could not be answered now. It is still in the field: send it again.'
      )
    );
  }
}
