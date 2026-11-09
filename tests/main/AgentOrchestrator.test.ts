import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator, TaskPriority } from '../../src/main/services/AgentOrchestrator';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';
import { CurriculumGenerator } from '../../src/main/services/CurriculumGenerator';
import { SocraticEngine } from '../../src/main/socratic/SocraticEngine';
import { ConceptNode, QuestionData } from '../../src/shared/types';

describe('AgentOrchestrator', () => {
  let store: KnowledgeStore;
  let generator: CurriculumGenerator;
  let socratic: SocraticEngine;
  let orchestrator: AgentOrchestrator;

  beforeEach(() => {
    store = new KnowledgeStore();
    generator = new CurriculumGenerator();
    socratic = new SocraticEngine();
    orchestrator = new AgentOrchestrator(generator, store, socratic);
  });

  it('orders tasks strictly by priority (HIGH -> NORMAL -> LOW)', async () => {
    const executedOrder: string[] = [];

    // Pause execution briefly inside tasks to test queue ordering
    let resolver: () => void;
    const gate = new Promise<void>((r) => {
      resolver = r;
    });

    orchestrator.enqueueCustomTask({
      id: 'task-low',
      name: 'Prefetch question (Low)',
      priority: TaskPriority.LOW,
      execute: async () => {
        await gate;
        executedOrder.push('low');
      },
    });

    orchestrator.enqueueCustomTask({
      id: 'task-normal',
      name: 'Pre-bake Socratic (Normal)',
      priority: TaskPriority.NORMAL,
      execute: async () => {
        executedOrder.push('normal');
      },
    });

    orchestrator.enqueueCustomTask({
      id: 'task-high',
      name: 'Interactive answer (High)',
      priority: TaskPriority.HIGH,
      execute: async () => {
        executedOrder.push('high');
      },
    });

    // Release the gate
    resolver!();

    // Wait until queue is processed
    while (orchestrator.isBusy() || orchestrator.getQueueLength() > 0) {
      await new Promise((r) => setTimeout(r, 10));
    }

    // Task-low began first because it was enqueued when queue was empty,
    // but between high and normal queued behind it, high executes before normal
    expect(executedOrder).toEqual(['low', 'high', 'normal']);
  });

  it('preempts and aborts in-flight background task and purges remaining LOW tasks', async () => {
    let abortedSignalObserved = false;

    orchestrator.enqueueCustomTask({
      id: 'in-flight-prefetch',
      name: 'Slow speculative question generation',
      priority: TaskPriority.LOW,
      execute: async (signal) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            abortedSignalObserved = true;
            resolve();
          });
        });
      },
    });

    orchestrator.enqueueCustomTask({
      id: 'queued-speculative-task-2',
      name: 'Another speculative question',
      priority: TaskPriority.LOW,
      execute: async () => {},
    });

    // Give orchestrator a tick to begin the in-flight task
    await new Promise((r) => setTimeout(r, 10));

    expect(orchestrator.getQueueLength()).toBe(1);

    // High priority user action occurs!
    orchestrator.preemptBackground();

    expect(abortedSignalObserved).toBe(true);
    // Speculative low priority tasks in queue should be purged
    expect(orchestrator.getQueueLength()).toBe(0);
  });

  it('speculatively prefetches zoom-in prerequisites and success candidates into questionCache', async () => {
    const mockNodePrereq: ConceptNode = {
      id: 'concept-prereq',
      title: 'Prerequisite Concept',
      summary: 'Summary of prereq',
      level: 1,
      prerequisites: [],
      unconditionalTruth: 'Truth prereq',
      status: 'untested',
    };
    const mockNodeTarget: ConceptNode = {
      id: 'concept-target',
      title: 'Target Concept',
      summary: 'Summary of target',
      level: 2,
      prerequisites: ['concept-prereq'],
      unconditionalTruth: 'Truth target',
      status: 'untested',
    };

    store.setNodes([mockNodePrereq, mockNodeTarget]);

    const generatedQuestion: QuestionData = {
      id: 'q-speculative',
      nodeId: 'concept-prereq',
      questionText: 'Prefetched question for prereq?',
      options: ['A', 'B', 'C', 'D'],
      correctOptionIndex: 0,
      anchorConcept: 'Prerequisite Concept',
      difficulty: 1,
    };

    vi.spyOn(generator, 'generateQuestion').mockResolvedValue(generatedQuestion);

    const questionCache = new Map<string, QuestionData>();

    orchestrator.speculativePrefetch({
      currentNodeId: 'concept-target',
      targets: ['concept-prereq'],
      questionCache,
      askedQuestions: [],
      goal: 'Domínio do Conceito Alvo',
    });

    // Wait until prefetch processes
    while (orchestrator.isBusy() || orchestrator.getQueueLength() > 0) {
      await new Promise((r) => setTimeout(r, 15));
    }

    expect(generator.generateQuestion).toHaveBeenCalledWith(
      mockNodePrereq,
      'Domínio do Conceito Alvo',
      [],
      expect.objectContaining({ signal: expect.any(Object) })
    );
    expect(questionCache.has('concept-prereq')).toBe(true);
    expect(questionCache.get('concept-prereq')).toEqual(generatedQuestion);
  });

  it('prebakes Socratic lesson when a learning boundary or misconception is diagnosed', async () => {
    const mockNode: ConceptNode = {
      id: 'concept-misconception',
      title: 'Tricky Concept',
      summary: 'Summary of tricky concept',
      level: 2,
      prerequisites: [],
      unconditionalTruth: 'Truth tricky',
      status: 'untested',
    };

    const spyPrebake = vi.spyOn(socratic, 'prebakePredict').mockResolvedValue({
      questionText: 'Preveja o comportamento de Tricky Concept',
      promptGoal: 'Hipótese prévia',
    });

    orchestrator.prebakeSocraticLesson(mockNode, 'Meta de Estudo');

    while (orchestrator.isBusy() || orchestrator.getQueueLength() > 0) {
      await new Promise((r) => setTimeout(r, 15));
    }

    expect(spyPrebake).toHaveBeenCalledWith(
      mockNode,
      'Meta de Estudo',
      expect.objectContaining({ signal: expect.any(Object) })
    );
  });

  it('clears all tasks and aborts running tasks on clear()', async () => {
    let aborted = false;

    orchestrator.enqueueCustomTask({
      id: 'running-task',
      name: 'Running Task',
      priority: TaskPriority.LOW,
      execute: async (signal) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve();
          });
        });
      },
    });

    orchestrator.enqueueCustomTask({
      id: 'queued-task',
      name: 'Queued Task',
      priority: TaskPriority.NORMAL,
      execute: async () => {},
    });

    await new Promise((r) => setTimeout(r, 10));

    orchestrator.clear();

    expect(aborted).toBe(true);
    expect(orchestrator.getQueueLength()).toBe(0);
  });
});
