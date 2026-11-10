import {
  CheckQuestionData,
  ConceptNode,
  LessonFailure,
  LessonOutcome,
  LessonProgress,
  MAX_LESSON_STEPS,
  MAX_STEP_RETRIES,
} from '../../shared/types';
import { buildLessonStepPrompt, buildSocraticTeachPrompt } from '../prompts/surgicalGeneratorPrompt';
import { callLLM, isFatalLLMError, LLMCaller, localize, parseLLMJson } from '../services/llmClient';
import { CurriculumGenerator, parseCorrectIndex } from '../services/CurriculumGenerator';

/** Some models double-escape line breaks, leaving a literal "\\n" in the text the student reads. */
export function unescapeBreaks(text: string): string {
  return text.replace(/(?:\\r)?\\n/g, '\n').replace(/\\t/g, '  ');
}

interface WrittenStep {
  teachProse: string;
  checkQuestion: CheckQuestionData;
  /** The plan of steps, when the answer brings one (only the opening of a lesson does). */
  steps: string[];
}

export class SocraticEngine {
  private currentNode?: ConceptNode;
  private lesson?: LessonProgress;
  private generator: CurriculumGenerator;
  private predictCache = new Map<string, { questionText: string; promptGoal: string }>();

  constructor(private llm: LLMCaller = callLLM, generator?: CurriculumGenerator) {
    this.generator = generator || new CurriculumGenerator(llm);
  }

  /** Concept ids repeat across sessions, so nothing cached here may outlive the session. */
  reset(): void {
    this.currentNode = undefined;
    this.lesson = undefined;
    this.predictCache.clear();
  }

  /** Picks a lesson back up after a restart or a session switch, without calling the AI. */
  resumeNode(node: ConceptNode, progress?: LessonProgress): void {
    this.currentNode = node;
    this.lesson = progress && Array.isArray(progress.steps) && progress.steps.length > 0 ? clone(progress) : undefined;
  }

  getProgress(): LessonProgress | undefined {
    return this.lesson ? clone(this.lesson) : undefined;
  }

  /** True when a mastered verification of the current step finishes the concept. */
  isLastStep(): boolean {
    return !this.lesson || this.lesson.stepIndex >= this.lesson.steps.length - 1;
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
    options?: { signal?: AbortSignal; failures?: LessonFailure[] }
  ): Promise<{ questionText: string; promptGoal: string }> {
    this.currentNode = node;
    // A guess opens a new lesson: whatever was left of the previous one is gone
    this.lesson = undefined;
    // A new attempt needs a new question aimed at the mistake: the cached one is what failed
    if (options?.failures?.length) {
      return this.generator.generatePredict(node, goal || node.title, options);
    }
    const cached = this.predictCache.get(node.id);
    if (cached) return cached;

    const res = await this.generator.generatePredict(node, goal || node.title, options);
    this.predictCache.set(node.id, res);
    return res;
  }

  /** Opens the lesson: the AI splits the concept into steps and writes the first one. */
  async submitPrediction(
    studentPrediction: string,
    failures: LessonFailure[] = []
  ): Promise<{ teachProse: string; checkQuestion: CheckQuestionData; progress: LessonProgress }> {
    const node = this.requireNode();
    const written = await this.writeStep(node, buildSocraticTeachPrompt(node, studentPrediction, failures), true);
    this.lesson = {
      steps: written.steps.length > 0 ? written.steps : [node.unconditionalTruth || node.title],
      stepIndex: 0,
      retries: 0,
      prediction: studentPrediction,
      taught: [{ step: 0, prose: written.teachProse }],
    };
    return { teachProse: written.teachProse, checkQuestion: written.checkQuestion, progress: clone(this.lesson) };
  }

  /**
   * Moves the lesson after a verification. A demonstrated step opens the next one; a miss repeats
   * the step, and only after MAX_STEP_RETRIES repairs does the concept go back to the queue.
   */
  recordCheck(mastered: boolean, readingThoughts?: string): LessonOutcome {
    const lesson = this.lesson;
    // A lesson restored from a version without steps has a single one and no repair in place
    if (!lesson) return mastered ? 'concept_mastered' : 'concept_requeued';

    lesson.readingThoughts = readingThoughts?.trim() || undefined;
    if (mastered) {
      if (lesson.stepIndex >= lesson.steps.length - 1) {
        this.lesson = undefined;
        return 'concept_mastered';
      }
      lesson.stepIndex += 1;
      lesson.retries = 0;
      return 'next_step';
    }
    if (lesson.retries >= MAX_STEP_RETRIES) {
      this.lesson = undefined;
      return 'concept_requeued';
    }
    lesson.retries += 1;
    return 'retry_step';
  }

  /** Writes the step the lesson is on: a new one, or the same one again when `failure` is given. */
  async continueLesson(
    failure?: LessonFailure
  ): Promise<{ teachProse: string; checkQuestion: CheckQuestionData; progress: LessonProgress; isRetry: boolean }> {
    const node = this.requireNode();
    const lesson = this.lesson;
    if (!lesson) {
      throw new Error(localize('Não há aula em andamento para continuar.', 'There is no lesson in progress to continue.'));
    }
    const isRetry = lesson.retries > 0;
    const written = await this.writeStep(node, buildLessonStepPrompt(node, lesson, isRetry ? failure : undefined));
    // Nothing changes before this point: a failed generation can simply be asked for again
    lesson.taught.push({ step: lesson.stepIndex, prose: written.teachProse });
    lesson.readingThoughts = undefined;
    return { teachProse: written.teachProse, checkQuestion: written.checkQuestion, progress: clone(lesson), isRetry };
  }

  evaluateCheck(studentAnswerIndex: number, checkData: CheckQuestionData): { isPassed: boolean; repairExplanation?: string } {
    const isPassed = studentAnswerIndex === checkData.correctOptionIndex;
    if (isPassed) {
      return { isPassed: true };
    }

    const correctOptionText = checkData.options[checkData.correctOptionIndex] || '';
    const repairExplanation = localize(
      `A resposta certa era "${correctOptionText}". ${checkData.explanation} Vamos retomar este conceito de outro jeito antes de avançar.`,
      `The right answer was "${correctOptionText}". ${checkData.explanation} Let's go over this concept another way before moving on.`
    );

    return { isPassed: false, repairExplanation };
  }

  private requireNode(): ConceptNode {
    if (!this.currentNode) {
      throw new Error(localize('Nenhum conceito ativo selecionado para o ciclo socrático.', 'No concept is selected for this lesson.'));
    }
    return this.currentNode;
  }

  private async writeStep(
    node: ConceptNode,
    built: { systemPrompt: string; prompt: string },
    opening = false
  ): Promise<WrittenStep> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await this.llm({ ...built, temperature: 0.3, jsonMode: true, timeoutMs: 60000 });
        const parsed = parseLLMJson<any>(raw);
        const cq = parsed.checkQuestion;
        const correct =
          cq && typeof cq.questionText === 'string' && Array.isArray(cq.options) && cq.options.length >= 2
            ? parseCorrectIndex(cq.correctOptionIndex, cq.options.length)
            : null;
        if (parsed.teachProse && correct !== null) {
          const arranged = this.generator.arrangeOptions(cq.options.map((o: unknown) => String(o)), correct);
          const steps: string[] = Array.isArray(parsed.steps)
            ? parsed.steps
                .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
                .map((s: string) => s.trim().slice(0, 240))
                .slice(0, MAX_LESSON_STEPS)
            : [];
          return {
            teachProse: unescapeBreaks(String(parsed.teachProse)).trim(),
            checkQuestion: {
              questionText: unescapeBreaks(String(cq.questionText)),
              options: arranged.options,
              correctOptionIndex: arranged.correctOptionIndex,
              explanation: String(cq.explanation || node.unconditionalTruth),
            },
            steps,
          };
        }
      } catch (err) {
        if (isFatalLLMError(err)) throw err;
      }
    }

    throw new Error(
      opening
        ? localize(
            `Não foi possível preparar a explicação de "${node.title}". Seu palpite continua no campo: envie de novo.`,
            `The explanation of "${node.title}" could not be prepared. Your guess is still in the field: send it again.`
          )
        : localize(
            `Não foi possível preparar o próximo passo de "${node.title}". Sua resposta já foi registrada: tente de novo.`,
            `The next step of "${node.title}" could not be prepared. Your answer was already recorded: try again.`
          )
    );
  }
}

function clone(progress: LessonProgress): LessonProgress {
  return { ...progress, steps: [...progress.steps], taught: progress.taught.map((t) => ({ ...t })) };
}
