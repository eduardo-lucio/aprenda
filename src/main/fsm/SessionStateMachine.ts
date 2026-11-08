import {
  CheckQuestionData,
  ConceptNode,
  MIN_PROBE_QUESTIONS,
  clampProbeQuestions,
  SessionSnapshot,
  ProbeAnswerKind,
  ProbeAttempt,
  ProbingSession,
  QuestionData,
  resolveAnswerKind,
} from '../../shared/types';
import { KnowledgeStore } from '../knowledge/KnowledgeStore';
import { CognitiveJudgeService } from '../services/CognitiveJudgeService';
import { CurriculumGenerator } from '../services/CurriculumGenerator';
import { AgentOrchestrator } from '../services/AgentOrchestrator';
import { SocraticEngine } from '../socratic/SocraticEngine';
import { addGlobalTokenListener, localize } from '../services/llmClient';

export { MIN_PROBE_QUESTIONS };

/** The active session changed while an AI call was running: its result must be thrown away. */
export class SessionChangedError extends Error {
  constructor() {
    super('A sessão mudou durante a operação.');
    this.name = 'SessionChangedError';
  }
}

export class SessionStateMachine {
  private store: KnowledgeStore;
  private judge: CognitiveJudgeService;
  private generator: CurriculumGenerator;
  private orchestrator: AgentOrchestrator;
  private session?: ProbingSession;
  private strandNodes: ConceptNode[] = [];
  private minProbeQuestions: number = MIN_PROBE_QUESTIONS;
  private candidateQueue: string[] = [];
  private askedQuestions: string[] = [];
  private questionCache: Map<string, QuestionData> = new Map();
  private sessionTokensUsed = 0;
  private teachingOrder: string[] = [];
  private teachingDone = new Set<string>();
  private onPersist?: (snapshot: SessionSnapshot) => void;

  constructor(
    store?: KnowledgeStore,
    judge?: CognitiveJudgeService,
    generator?: CurriculumGenerator,
    orchestrator?: AgentOrchestrator
  ) {
    this.store = store || new KnowledgeStore();
    this.judge = judge || new CognitiveJudgeService();
    this.generator = generator || new CurriculumGenerator();
    this.orchestrator = orchestrator || new AgentOrchestrator(this.generator, this.store);

    addGlobalTokenListener((usage) => {
      if (this.session) {
        this.sessionTokensUsed += usage.totalTokens;
        this.session.tokensUsed = this.sessionTokensUsed;
      }
    });
  }

  /** Registers a listener that receives a snapshot after every state change. */
  setPersistence(listener: (snapshot: SessionSnapshot) => void): void {
    this.onPersist = listener;
  }

  getSnapshot(): SessionSnapshot {
    return {
      session: this.getState(),
      nodes: this.store.getNodes(),
      candidateQueue: [...this.candidateQueue],
      askedQuestions: [...this.askedQuestions],
      teachingOrder: [...this.teachingOrder],
      teachingDone: [...this.teachingDone],
      tokensUsed: this.sessionTokensUsed,
    };
  }

  /** Resumes a previously saved session (replaces the active one). */
  restoreSnapshot(snapshot: SessionSnapshot): void {
    this.orchestrator.clear();
    this.store.setNodes(snapshot.nodes);
    this.strandNodes = this.store.getStrand();
    this.candidateQueue = [...snapshot.candidateQueue];
    this.askedQuestions = [...snapshot.askedQuestions];
    this.teachingOrder = [...snapshot.teachingOrder];
    this.teachingDone = new Set(snapshot.teachingDone || []);
    this.sessionTokensUsed = snapshot.tokensUsed || 0;
    this.questionCache.clear();
    this.session = {
      ...snapshot.session,
      attempts: [...snapshot.session.attempts],
      nodesState: { ...snapshot.session.nodesState },
      tokensUsed: this.sessionTokensUsed,
    };
    const q = this.session.currentQuestion;
    if (q) this.questionCache.set(q.nodeId, q);
  }

  private persist(): void {
    if (this.session && this.onPersist) {
      try {
        this.onPersist(this.getSnapshot());
      } catch (err) {
        console.error('[SessionStateMachine] Falha ao persistir sessão:', err);
      }
    }
  }

  /** Minimum number of probe questions before the plan can be built (user setting, 3–20). */
  setMinProbeQuestions(n: number): void {
    this.minProbeQuestions = clampProbeQuestions(n);
  }

  getMinProbeQuestions(): number {
    return this.minProbeQuestions;
  }

  setSocraticEngine(socratic: SocraticEngine): void {
    this.orchestrator.setSocraticEngine(socratic);
  }

  getOrchestrator(): AgentOrchestrator {
    return this.orchestrator;
  }

  hasSession(): boolean {
    return Boolean(this.session);
  }

  getActiveSessionId(): string | undefined {
    return this.session?.id;
  }

  /** Drops the active session and everything derived from it (used when it is deleted). */
  endSession(): void {
    this.orchestrator.clear();
    this.store.clear();
    this.session = undefined;
    this.strandNodes = [];
    this.candidateQueue = [];
    this.askedQuestions = [];
    this.questionCache.clear();
    this.teachingOrder = [];
    this.teachingDone = new Set();
    this.sessionTokensUsed = 0;
  }

  getTokensUsed(): number {
    return this.sessionTokensUsed;
  }

  getState(): ProbingSession {
    if (!this.session) {
      throw new Error(localize('Nenhuma sessão ativa.', 'There is no active session.'));
    }
    return {
      ...this.session,
      attempts: [...this.session.attempts],
      nodesState: { ...this.session.nodesState },
      tokensUsed: this.sessionTokensUsed,
    };
  }

  startSession(mode: 'teaching' | 'practice', goalText: string): Promise<ProbingSession> {
    const goal = (goalText || '').trim() || 'Objetivo de Estudo';

    this.endSession();

    this.session = {
      id: `session-${Date.now()}`,
      mode,
      disciplineId: goal,
      goal,
      topic: goal,
      phase: 'goal_orientation',
      questionCount: 0,
      frontierClarity: 0,
      attempts: [],
      socraticSteps: [],
      nodesState: {},
      goalClarificationOptions: [],
      tokensUsed: 0,
    };

    const currentSession = this.session;
    return this.generator.generateGoalOptions(goal).then((res) => {
      this.assertActive(currentSession);
      if (res.options.length > 0) {
        currentSession.goalClarificationQuestion = res.question;
        currentSession.goalClarificationOptions = res.options;
        if (res.agentThinking) {
          currentSession.goalThinking = res.agentThinking;
          currentSession.agentThinking = res.agentThinking;
        }
      }
      this.persist();
      return this.getState();
    }).catch((err) => {
      if (this.session === currentSession) this.session = undefined;
      throw err;
    });
  }

  async submitGoalClarification(selectedOption: string, studentThinking?: string): Promise<QuestionData> {
    const session = this.requireSession();

    // 1 single combined call generates the DAG and the first probe question together
    const graph = await this.generator.generateGraph(selectedOption, {
      topic: session.topic,
      justification: studentThinking?.trim() || undefined,
    });
    this.assertActive(session);
    // Sort by level ascending (increasing difficulty: foundational Level 1 first -> Level 4)
    const byLevel = [...graph.nodes].sort((a, b) => a.level - b.level);
    let firstQuestion = graph.firstQuestion;
    if (!firstQuestion || !graph.nodes.some((n) => n.id === firstQuestion!.nodeId)) {
      firstQuestion = await this.generator.generateQuestion(byLevel[0], selectedOption, []);
      this.assertActive(session);
    }
    const firstNodeId = firstQuestion.nodeId;

    // Nothing is committed before this point: a failed generation leaves the session as it was
    this.store.setNodes(graph.nodes);
    this.strandNodes = this.store.getStrand();
    const nodesState: Record<string, ConceptNode['status']> = {};
    for (const n of this.strandNodes) {
      nodesState[n.id] = 'untested';
    }
    this.candidateQueue = byLevel.map((n) => n.id).filter((id) => id !== firstNodeId);
    this.questionCache.set(firstNodeId, firstQuestion);

    if (!firstQuestion.agentThinking && graph.agentThinking) {
      firstQuestion.agentThinking = graph.agentThinking;
    }

    this.askedQuestions.push(firstQuestion.questionText);

    session.goal = selectedOption;
    session.disciplineId = graph.discipline;
    session.nodesState = nodesState;
    session.phase = 'probing';
    session.questionCount = 1;
    session.currentQuestion = firstQuestion;
    if (graph.agentThinking) {
      session.agentThinking = graph.agentThinking;
    }

    // Speculatively prefetch upcoming branch questions in the background while user solves question 1
    this.orchestrator.speculativePrefetch({
      currentNodeId: firstNodeId,
      candidateQueue: this.candidateQueue,
      strandNodes: this.strandNodes,
      questionCache: this.questionCache,
      askedQuestions: this.askedQuestions,
      goal: session.goal,
      nodesState: session.nodesState,
    });

    this.persist();
    return firstQuestion;
  }

  /** The student asked for guidance instead of naming a focus: offers simpler entry points to the same topic. */
  async requestOrientation(studentThinking?: string): Promise<ProbingSession> {
    const session = this.requireSession();
    if (session.phase !== 'goal_orientation') {
      throw new Error(localize(`Não há foco a escolher na fase: ${session.phase}`, `There is no focus to choose in phase: ${session.phase}`));
    }
    const res = await this.generator.generateGoalOptions(session.topic ?? session.goal, {
      justification: studentThinking?.trim() || undefined,
    });
    this.assertActive(session);
    session.goalClarificationQuestion = res.question;
    session.goalClarificationOptions = res.options;
    if (res.agentThinking) {
      session.goalThinking = res.agentThinking;
      session.agentThinking = res.agentThinking;
    }
    this.persist();
    return this.getState();
  }

  /**
   * Transactional: if anything fails after the judge ran (e.g. the next question cannot be generated),
   * the attempt, node states and candidate queue are rolled back so the student can simply resubmit.
   */
  async submitProbeAnswer(data: {
    selectedOptionIndex: number;
    answerKind?: ProbeAnswerKind;
    confidence?: number;
    thinkingText: string;
  }): Promise<{
    attempt: ProbeAttempt;
    nextAction: 'next_question' | 'transition_plan';
    nextQuestion?: QuestionData;
  }> {
    const session = this.requireSession();
    const snapshot = {
      attempts: [...session.attempts],
      nodesState: { ...session.nodesState },
      frontierClarity: session.frontierClarity,
      questionCount: session.questionCount,
      agentThinking: session.agentThinking,
      currentQuestion: session.currentQuestion,
      phase: session.phase,
      candidateQueue: [...this.candidateQueue],
    };
    try {
      return await this.processProbeAnswer(data);
    } catch (err) {
      if (this.session === session) {
        session.attempts = snapshot.attempts;
        session.nodesState = snapshot.nodesState;
        session.frontierClarity = snapshot.frontierClarity;
        session.questionCount = snapshot.questionCount;
        session.agentThinking = snapshot.agentThinking;
        session.currentQuestion = snapshot.currentQuestion;
        session.phase = snapshot.phase;
        this.candidateQueue = snapshot.candidateQueue;
      }
      throw err;
    }
  }

  private async processProbeAnswer(data: {
    selectedOptionIndex: number;
    answerKind?: ProbeAnswerKind;
    confidence?: number;
    thinkingText: string;
  }): Promise<{
    attempt: ProbeAttempt;
    nextAction: 'next_question' | 'transition_plan';
    nextQuestion?: QuestionData;
  }> {
    const session = this.requireSession();
    if (session.phase !== 'probing') {
      throw new Error(localize(`Cannot submit probe answer in phase: ${session.phase}`, `Answers are not accepted in this phase: ${session.phase}`));
    }

    const currentQ = session.currentQuestion;
    if (!currentQ) {
      throw new Error(localize('No active question in session', 'There is no question to answer in this session.'));
    }

    const currentNode = this.store.getNodeById(currentQ.nodeId);
    if (!currentNode) {
      throw new Error(localize('Conceito da questão atual não encontrado no grafo.', 'The concept of the current question is not on the map.'));
    }

    // High-priority user action: preempt all background speculative LLM calls immediately
    // so 100% of bandwidth and quota are dedicated to the cognitive judge
    this.orchestrator.preemptBackground();

    // High-speed evaluation: judge evaluates reasoning freely with zero background interference
    const evaluation = await this.judge.evaluate({
      node: currentNode,
      questionText: currentQ.questionText,
      options: currentQ.options,
      selectedOptionIndex: data.selectedOptionIndex,
      answerKind: data.answerKind,
      correctOptionIndex: currentQ.correctOptionIndex,
      confidence: data.confidence,
      thinkingText: data.thinkingText,
    });
    this.assertActive(session);

    const answerKind = resolveAnswerKind(data.selectedOptionIndex, data.answerKind);
    const attempt: ProbeAttempt = {
      questionId: currentQ.id,
      nodeId: currentNode.id,
      questionText: currentQ.questionText,
      options: currentQ.options,
      correctOptionIndex: currentQ.correctOptionIndex,
      selectedOptionIndex: data.selectedOptionIndex,
      ...(answerKind === 'own_answer' ? { answerKind } : {}),
      confidence: data.confidence,
      thinkingText: data.thinkingText,
      verdict: evaluation.verdict,
      judgeReasoning: evaluation.reasoningDiagnosis,
      identifiedMisconception: evaluation.identifiedMisconception,
      agentThinking: currentQ.agentThinking,
    };

    session.attempts.push(attempt);
    session.nodesState[currentNode.id] = evaluation.verdict;

    const prereqs = this.store.getPrerequisites(currentNode.id);
    if (evaluation.verdict === 'mastered') {
      for (const p of prereqs) {
        if (session.nodesState[p.id] === 'untested') {
          session.nodesState[p.id] = 'mastered';
        }
      }
    } else {
      // Zoom-in: untested prerequisites take priority
      const untested = prereqs
        .filter((p) => session.nodesState[p.id] === 'untested')
        .map((p) => p.id)
        .reverse();
      this.candidateQueue = [...untested, ...this.candidateQueue.filter((id) => !untested.includes(id))];
    }

    session.frontierClarity = this.calculateFrontierClarity();

    if (session.questionCount >= this.minProbeQuestions && session.frontierClarity >= 100) {
      await this.enterPlanReview();
      if (evaluation.agentThinking) {
        session.agentThinking = evaluation.agentThinking;
      }
      this.persist();
      return { attempt, nextAction: 'transition_plan' };
    }

    // Pick next node and retrieve pre-cached question instantly (0ms)
    const nextNodeId = this.pickNextNode();
    const rawNextQuestion = await this.getOrGenerateQuestionFor(nextNodeId, session.goal);
    this.assertActive(session);
    const nextQuestion: QuestionData = {
      ...rawNextQuestion,
      agentThinking: rawNextQuestion.agentThinking || evaluation.agentThinking,
    };
    this.askedQuestions.push(nextQuestion.questionText);

    session.questionCount += 1;
    session.currentQuestion = nextQuestion;
    if (nextQuestion.agentThinking) {
      session.agentThinking = nextQuestion.agentThinking;
    }

    // Prefetch candidate branch questions in the background while user solves next question
    this.orchestrator.speculativePrefetch({
      currentNodeId: nextNodeId,
      candidateQueue: this.candidateQueue,
      strandNodes: this.strandNodes,
      questionCache: this.questionCache,
      askedQuestions: this.askedQuestions,
      goal: session.goal,
      nodesState: session.nodesState,
    });

    this.persist();
    return { attempt, nextAction: 'next_question', nextQuestion };
  }

  async advanceToPlan(): Promise<void> {
    const session = this.requireSession();
    if (session.phase !== 'probing') {
      throw new Error(localize(`Não é possível gerar o plano na fase: ${session.phase}`, `The plan cannot be generated in this phase: ${session.phase}`));
    }
    if (session.attempts.length < this.minProbeQuestions) {
      throw new Error(localize(`Avanço manual para o plano requer o piso mínimo de ${this.minProbeQuestions} questões.`, `Answer at least ${this.minProbeQuestions} questions before opening the plan.`));
    }
    await this.enterPlanReview();
    this.persist();
  }

  confirmPlan(): void {
    const session = this.requireSession();
    if (session.phase !== 'plan_review') {
      throw new Error(localize(`Não há plano a confirmar na fase: ${session.phase}`, `There is no plan to confirm in this phase: ${session.phase}`));
    }
    session.phase = 'teaching';
    this.teachingDone = new Set();
    const first = this.nextTeachingNodeId();
    const node = first ? this.store.getNodeById(first) : undefined;
    if (node) this.orchestrator.prebakeSocraticLesson(node, session.goal);
    this.persist();
  }

  /** Teaching order proposed by the plan (falls back to level order over non-mastered nodes). */
  getTeachingOrder(): string[] {
    return [...this.teachingOrder];
  }

  /**
   * Teaching-phase check: the judge reads the answer (correctness, confidence, reasoning)
   * and the verdict is recorded in nodesState regardless of pass/fail.
   */
  async recordCheckVerdict(
    nodeId: string,
    check: CheckQuestionData,
    data: { selectedOptionIndex: number; confidence?: number; thinkingText?: string }
  ): Promise<ProbeAttempt['verdict']> {
    const session = this.requireSession();
    const node = this.store.getNodeById(nodeId);
    if (!node) throw new Error(localize('Conceito do check não encontrado no grafo.', 'The concept of this verification is not on the map.'));
    const evaluation = await this.judge.evaluate({
      node,
      questionText: check.questionText,
      options: check.options,
      selectedOptionIndex: data.selectedOptionIndex,
      correctOptionIndex: check.correctOptionIndex,
      confidence: data.confidence,
      thinkingText: data.thinkingText || '',
    });
    this.assertActive(session);
    session.nodesState[nodeId] = evaluation.verdict;
    // Pass or fail, the concept has had its turn: the pass moves on instead of looping on it
    this.teachingDone.add(nodeId);
    session.frontierClarity = this.calculateFrontierClarity();
    this.persist();
    return evaluation.verdict;
  }

  markNodeStatus(nodeId: string, status: ConceptNode['status']): void {
    const session = this.requireSession();
    if (nodeId in session.nodesState) {
      session.nodesState[nodeId] = status;
      this.persist();
    }
  }

  calculateFrontierClarity(): number {
    if (!this.session || this.strandNodes.length === 0) return 0;
    const tested = this.strandNodes.filter((n) => this.session!.nodesState[n.id] !== 'untested');
    return Math.round((tested.length / this.strandNodes.length) * 100);
  }

  private async enterPlanReview(): Promise<void> {
    const session = this.requireSession();
    const nodes = this.strandNodes.map((n) => ({ ...n, status: session.nodesState[n.id] || n.status }));
    const { plan, order } = nodes.some((n) => n.status !== 'mastered')
      ? await this.generator.generatePlan({
          goal: session.goal,
          nodes,
          attempts: session.attempts.map((a) => ({
            nodeId: a.nodeId,
            verdict: a.verdict,
            judgeReasoning: a.judgeReasoning,
          })),
        })
      : {
          plan: localize(
            'Você mostrou domínio de todos os conceitos do mapa, então não há aulas pendentes. Se quiser rever algum, abra o mapa e escolha o conceito.',
            'You showed mastery of every concept on the map, so no lessons are pending. To review one, open the map and pick the concept.'
          ),
          order: [] as string[],
        };
    this.assertActive(session);
    session.currentQuestion = undefined;
    const rest = nodes
      .filter((n) => !order.includes(n.id) && n.status !== 'mastered')
      .sort((a, b) => a.level - b.level)
      .map((n) => n.id);
    this.teachingOrder = [...order, ...rest];
    session.plan = plan;
    session.phase = 'plan_review';
  }

  /** Next concept of the current teaching pass: not mastered yet and not already taught in this pass. */
  nextTeachingNodeId(): string | undefined {
    return this.teachingOrder.find(
      (id) => this.session?.nodesState[id] !== 'mastered' && !this.teachingDone.has(id)
    );
  }

  /** Called after every await: a result computed for another session must never touch this one. */
  private assertActive(session: ProbingSession): void {
    if (this.session !== session) throw new SessionChangedError();
  }

  private requireSession(): ProbingSession {
    if (!this.session) throw new Error(localize('Nenhuma sessão ativa.', 'There is no active session.'));
    return this.session;
  }

  /**
   * Returns the pre-cached question if it is still unseen, otherwise generates a new one.
   * A cached question that was already asked (re-probing a node) is discarded, never repeated.
   */
  private async getOrGenerateQuestionFor(nodeId: string, goal: string): Promise<QuestionData> {
    const cached = this.questionCache.get(nodeId);
    if (cached) {
      if (!this.askedQuestions.includes(cached.questionText)) return cached;
      this.questionCache.delete(nodeId);
    }

    const node = this.store.getNodeById(nodeId);
    if (!node) throw new Error(localize(`Conceito "${nodeId}" não encontrado.`, `Concept "${nodeId}" not found.`));

    const question = await this.generator.generateQuestion(node, goal, this.askedQuestions);
    this.questionCache.set(nodeId, question);
    return question;
  }

  private pickNextNode(): string {
    const session = this.requireSession();
    while (this.candidateQueue.length > 0) {
      const candidateId = this.candidateQueue.shift()!;
      if (session.nodesState[candidateId] === 'untested') return candidateId;
    }

    const untested = this.strandNodes.find((n) => session.nodesState[n.id] === 'untested');
    if (untested) return untested.id;

    // Everything was tested once: revisit what is not mastered, spreading the questions around
    const askedFor = (id: string) => session.attempts.filter((a) => a.nodeId === id).length;
    const priority: ConceptNode['status'][] = ['false_positive', 'frontier', 'blind_spot'];
    const currentId = session.currentQuestion?.nodeId;
    const retry = this.strandNodes
      .filter((n) => priority.includes(session.nodesState[n.id]) && n.id !== currentId)
      .sort(
        (a, b) =>
          askedFor(a.id) - askedFor(b.id) ||
          priority.indexOf(session.nodesState[a.id]) - priority.indexOf(session.nodesState[b.id])
      )[0];
    if (retry) return retry.id;

    return currentId && session.nodesState[currentId] !== 'mastered'
      ? currentId
      : this.strandNodes[this.strandNodes.length - 1].id;
  }
}
