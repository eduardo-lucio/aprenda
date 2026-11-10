import { ConceptNode, QuestionData } from '../../shared/types';
import { CurriculumGenerator } from './CurriculumGenerator';
import { KnowledgeStore } from '../knowledge/KnowledgeStore';
import { SocraticEngine } from '../socratic/SocraticEngine';

export enum TaskPriority {
  HIGH = 1,    // User interactive action (e.g. submit probe answer, start session)
  NORMAL = 2,  // Socratic pre-baking, cognitive profile synthesis
  LOW = 3,     // Speculative question prefetching
}

export interface BackgroundTask {
  id: string;
  name: string;
  priority: TaskPriority;
  execute: (signal: AbortSignal) => Promise<void>;
}

export class AgentOrchestrator {
  private activeAbortController?: AbortController;
  private isProcessing = false;
  private taskQueue: BackgroundTask[] = [];
  /** Off when the student saves requests: a question is written only when it is needed. */
  private speculative = true;

  constructor(
    private generator: CurriculumGenerator,
    private store: KnowledgeStore,
    private socratic?: SocraticEngine
  ) {}

  setSocraticEngine(socratic: SocraticEngine): void {
    this.socratic = socratic;
  }

  getSocraticEngine(): SocraticEngine | undefined {
    return this.socratic;
  }

  /** Turning it off also drops the guesses already queued. */
  setSpeculative(enabled: boolean): void {
    this.speculative = enabled;
    if (!enabled) this.taskQueue = this.taskQueue.filter((t) => t.priority !== TaskPriority.LOW);
  }

  isSpeculative(): boolean {
    return this.speculative;
  }

  getQueueLength(): number {
    return this.taskQueue.length;
  }

  isBusy(): boolean {
    return this.isProcessing || Boolean(this.activeAbortController);
  }

  /**
   * Preempts and cancels all in-flight and queued background tasks.
   * Call this immediately when a high-priority user interaction starts (e.g. submitProbeAnswer)
   * so 100% of bandwidth and API quota is dedicated to the user.
   */
  preemptBackground(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = undefined;
    }
    // Remove all speculative LOW priority tasks from queue
    this.taskQueue = this.taskQueue.filter((t) => t.priority !== TaskPriority.LOW);
  }

  /**
   * Prepares, in the background, the questions the student may get next: one for each way the
   * current answer can go. Runs while the student reads and solves the current question.
   */
  speculativePrefetch(params: {
    currentNodeId: string;
    /** Concepts the next question may be about, most likely first. */
    targets: string[];
    questionCache: Map<string, QuestionData>;
    askedQuestions: string[];
    goal: string;
  }): void {
    if (!this.speculative) return;
    const { currentNodeId, targets, questionCache, askedQuestions, goal } = params;

    // Deduplicated and capped to the immediate next 2 to preserve API quota
    const combined = Array.from(new Set(targets))
      .filter((id) => id !== currentNodeId && !questionCache.has(id))
      .slice(0, 2);

    for (const nodeId of combined) {
      if (questionCache.has(nodeId)) continue;
      const node = this.store.getNodeById(nodeId);
      if (!node) continue;

      this.enqueueTask({
        id: `speculative-probe-${nodeId}`,
        name: `Speculative Probe Question: ${node.title}`,
        priority: TaskPriority.LOW,
        execute: async (signal) => {
          if (questionCache.has(nodeId) || signal.aborted) return;
          try {
            const question = await this.generator.generateQuestion(
              node,
              goal,
              askedQuestions,
              { signal }
            );
            if (!signal.aborted) {
              questionCache.set(nodeId, question);
            }
          } catch (err: any) {
            if (/HTTP (401|402|403|429)/i.test(String(err?.message || err))) {
              this.taskQueue = this.taskQueue.filter((t) => t.priority !== TaskPriority.LOW);
            }
          }
        },
      });
    }

    void this.processQueue();
  }

  /**
   * Pre-bakes Socratic teaching content (prediction scenario + guidance)
   * immediately when a misconception or boundary is identified during probing.
   */
  prebakeSocraticLesson(node: ConceptNode, goal: string): void {
    if (!this.socratic) return;
    const socraticEngine = this.socratic;

    this.enqueueTask({
      id: `prebake-socratic-${node.id}`,
      name: `Pre-bake Socratic Lesson: ${node.title}`,
      priority: TaskPriority.NORMAL,
      execute: async (signal) => {
        if (signal.aborted) return;
        try {
          await socraticEngine.prebakePredict(node, goal, { signal });
        } catch (_err) {
          // Task canceled or network error handled gracefully
        }
      },
    });

    void this.processQueue();
  }

  enqueueCustomTask(task: BackgroundTask): void {
    this.enqueueTask(task);
    void this.processQueue();
  }

  private enqueueTask(task: BackgroundTask): void {
    // Prevent duplicate tasks for the same resource
    if (this.taskQueue.some((t) => t.id === task.id)) return;

    this.taskQueue.push(task);
    // Sort tasks: HIGH (1) -> NORMAL (2) -> LOW (3)
    this.taskQueue.sort((a, b) => a.priority - b.priority);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.taskQueue.length > 0) {
        const nextTask = this.taskQueue.shift();
        if (!nextTask) break;

        this.activeAbortController = new AbortController();
        const signal = this.activeAbortController.signal;

        try {
          await nextTask.execute(signal);
        } catch (_err) {
          // Handled per task
        } finally {
          this.activeAbortController = undefined;
        }

        if (this.taskQueue.length > 0) {
          // Brief yield between background operations to prevent event loop starvation
          await new Promise((r) => setTimeout(r, 40));
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  clear(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = undefined;
    }
    this.taskQueue = [];
  }
}
