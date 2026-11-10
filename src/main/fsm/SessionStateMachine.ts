import {
  CheckQuestionData,
  ConceptNode,
  LessonFailure,
  MAX_ADDED_PER_REVISION,
  MAX_ADDED_PER_SESSION,
  MIN_PROBE_QUESTIONS,
  PlanRevision,
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
import { CurriculumGenerator, sanitizeGraph, slugify } from '../services/CurriculumGenerator';
import { AgentOrchestrator } from '../services/AgentOrchestrator';
import { SocraticEngine } from '../socratic/SocraticEngine';
import { addGlobalTokenListener, localize } from '../services/llmClient';
import { ProbeFrontier, ProbeTarget } from './probeFrontier';

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
  private frontier = new ProbeFrontier([]);
  private minProbeQuestions: number = MIN_PROBE_QUESTIONS;
  private askedQuestions: string[] = [];
  private questionCache: Map<string, QuestionData> = new Map();
  private sessionTokensUsed = 0;
  private teachingOrder: string[] = [];
  private lessonFailures: Record<string, LessonFailure[]> = {};
  private planRevisedFor: string[] = [];
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
      askedQuestions: [...this.askedQuestions],
      teachingOrder: [...this.teachingOrder],
      lessonFailures: { ...this.lessonFailures },
      planRevisedFor: [...this.planRevisedFor],
      tokensUsed: this.sessionTokensUsed,
    };
  }

  /** Resumes a previously saved session (replaces the active one). */
  restoreSnapshot(snapshot: SessionSnapshot): void {
    this.orchestrator.clear();
    this.store.setNodes(snapshot.nodes);
    this.strandNodes = this.store.getStrand();
    this.frontier = new ProbeFrontier(this.strandNodes);
    this.askedQuestions = [...snapshot.askedQuestions];
    // Sessions saved before the mastery gate may hold an order that does not start from the base
    this.teachingOrder = this.basicsFirst(snapshot.teachingOrder);
    this.lessonFailures = { ...(snapshot.lessonFailures || {}) };
    this.planRevisedFor = [...(snapshot.planRevisedFor || [])];
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
    this.frontier = new ProbeFrontier([]);
    this.askedQuestions = [];
    this.questionCache.clear();
    this.teachingOrder = [];
    this.lessonFailures = {};
    this.planRevisedFor = [];
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
    const nodesState: Record<string, ConceptNode['status']> = {};
    for (const n of graph.nodes) {
      nodesState[n.id] = 'untested';
    }
    // The probe enters at the top of the map: a miss walks it down, a hit spares everything below
    const frontier = new ProbeFrontier([...graph.nodes].sort((a, b) => a.level - b.level));
    let firstQuestion = graph.firstQuestion;
    if (!firstQuestion || !graph.nodes.some((n) => n.id === firstQuestion!.nodeId)) {
      const entry = graph.nodes.find((n) => n.id === frontier.pickNext(nodesState, []).nodeId)!;
      firstQuestion = await this.generator.generateQuestion(entry, selectedOption, []);
      this.assertActive(session);
    }
    const firstNodeId = firstQuestion.nodeId;

    // Nothing is committed before this point: a failed generation leaves the session as it was
    this.store.setNodes(graph.nodes);
    this.strandNodes = this.store.getStrand();
    this.frontier = frontier;
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
    this.prefetchAfter(firstNodeId);

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
    // A hit takes what the concept is built on as held; a miss leaves what depends on it unasked
    session.nodesState =
      evaluation.verdict === 'mastered'
        ? this.frontier.withMastered(session.nodesState, currentNode.id)
        : { ...session.nodesState, [currentNode.id]: evaluation.verdict };

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
    const next = this.frontier.pickNext(session.nodesState, session.attempts, currentNode.id);
    const nextNodeId = next.nodeId;
    const rawNextQuestion = await this.getOrGenerateQuestionFor(next, session.goal);
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
    this.prefetchAfter(nextNodeId);

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
    this.lessonFailures = {};
    const first = this.nextTeachingNodeId();
    const node = first ? this.store.getNodeById(first) : undefined;
    if (node) this.orchestrator.prebakeSocraticLesson(node, session.goal);
    this.persist();
  }

  /**
   * Teaching-phase check: the judge reads the answer (correctness, confidence, reasoning).
   * Anything short of "mastered" marks the concept as not held and keeps what went wrong, so the
   * next explanation can target it. A concept is taught in steps: "mastered" on a step that is not
   * the last one (`conceptDone: false`) leaves the concept's own state as it was.
   */
  async recordCheckVerdict(
    nodeId: string,
    check: CheckQuestionData,
    data: { selectedOptionIndex: number; confidence?: number; thinkingText?: string },
    opts: { conceptDone?: boolean; readingThoughts?: string } = {}
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
    if (evaluation.verdict === 'mastered') {
      if (opts.conceptDone !== false) {
        session.nodesState[nodeId] = 'mastered';
        delete this.lessonFailures[nodeId];
      }
    } else {
      session.nodesState[nodeId] = evaluation.verdict;
      this.lessonFailures[nodeId] = [
        ...(this.lessonFailures[nodeId] || []),
        {
          questionText: check.questionText,
          chosenAnswer: check.options[data.selectedOptionIndex] ?? '',
          correctAnswer: check.options[check.correctOptionIndex] ?? '',
          diagnosis: evaluation.reasoningDiagnosis,
          misconception: evaluation.identifiedMisconception,
          ...(opts.readingThoughts?.trim() ? { readingThoughts: opts.readingThoughts.trim() } : {}),
        },
      ];
      // A concept mastered in the diagnosis and failed in a review goes back to the queue
      if (!this.teachingOrder.includes(nodeId)) {
        this.teachingOrder = this.basicsFirst([...this.teachingOrder, nodeId]);
      }
    }
    session.frontierClarity = this.calculateFrontierClarity();
    this.persist();
    return evaluation.verdict;
  }

  /** Share of the map whose position relative to the student's edge is known. */
  calculateFrontierClarity(): number {
    if (!this.session) return 0;
    return this.frontier.clarity(this.session.nodesState, this.session.attempts);
  }

  /**
   * Prepares the question of each way the current answer can go: with mastery or without it.
   * Harder follow-ups are left out because they are written from the answer itself.
   */
  private prefetchAfter(currentNodeId: string): void {
    const session = this.requireSession();
    const answered = [...session.attempts, { nodeId: currentNodeId }];
    const hit = this.frontier.pickNext(this.frontier.withMastered(session.nodesState, currentNodeId), answered, currentNodeId);
    const miss = this.frontier.pickNext({ ...session.nodesState, [currentNodeId]: 'frontier' }, answered, currentNodeId);
    this.orchestrator.speculativePrefetch({
      currentNodeId,
      targets: [hit, miss].filter((t) => !t.escalate).map((t) => t.nodeId),
      questionCache: this.questionCache,
      askedQuestions: this.askedQuestions,
      goal: session.goal,
    });
  }

  private async enterPlanReview(): Promise<void> {
    const session = this.requireSession();
    const nodes = this.strandNodes.map((n) => ({ ...n, status: session.nodesState[n.id] || n.status }));
    const strands = this.frontier.summarize(session.nodesState, session.attempts);
    const { plan, order } = nodes.some((n) => n.status !== 'mastered')
      ? await this.generator.generatePlan({
          goal: session.goal,
          nodes,
          strands,
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
    this.teachingOrder = this.basicsFirst([...order, ...rest]);
    session.plan = plan;
    session.probeSummary = strands;
    session.phase = 'plan_review';
  }

  /** The most basic concept not mastered yet: nothing after it is taught until it is. */
  nextTeachingNodeId(): string | undefined {
    return this.teachingOrder.find((id) => this.session?.nodesState[id] !== 'mastered');
  }

  getLessonFailures(nodeId: string): LessonFailure[] {
    return [...(this.lessonFailures[nodeId] || [])];
  }

  /**
   * The plan's order only decides among concepts that do not depend on each other. Levels follow
   * prerequisite depth, and where the scale runs out (two concepts at the top level, one built on
   * the other) the one with less underneath comes first: a concept never precedes its base.
   */
  private basicsFirst(ids: string[]): string[] {
    const levelOf = new Map(this.store.getNodes().map((n) => [n.id, n.level]));
    const depth = (id: string) => this.frontier.ancestorsOf(id).length;
    return [...new Set(ids)]
      .filter((id) => levelOf.has(id))
      .sort((a, b) => levelOf.get(a)! - levelOf.get(b)! || depth(a) - depth(b));
  }

  /**
   * The plan is a hypothesis. When a concept resisted every repair of a step, the planner is asked
   * whether the map lacks a foundation it depends on; what it proposes is validated and placed
   * before the concept. Each concept asks only once, and a session gains a bounded number of
   * concepts, so the lessons cannot grow without end. Returns null when the map stays as it is.
   */
  async reviseAfterFailure(nodeId: string): Promise<PlanRevision | null> {
    const session = this.requireSession();
    const focus = this.store.getNodeById(nodeId);
    if (!focus || session.phase !== 'teaching' || this.planRevisedFor.includes(nodeId)) return null;
    const addedSoFar = (session.planRevisions || []).reduce((sum, r) => sum + r.added.length, 0);
    const room = Math.min(MAX_ADDED_PER_REVISION, MAX_ADDED_PER_SESSION - addedSoFar);
    if (room <= 0) return null;

    const proposal = await this.generator.revisePlan({
      goal: session.goal,
      nodes: this.strandNodes.map((n) => ({ ...n, status: session.nodesState[n.id] || n.status })),
      focus,
      failures: this.getLessonFailures(nodeId),
    });
    this.assertActive(session);
    this.planRevisedFor.push(nodeId);

    const added = this.addFoundations(focus, proposal.add.slice(0, room));
    if (added.length === 0) {
      this.persist();
      return null;
    }
    const titles = added.map((n) => `"${n.title}"`).join(localize(' e ', ' and '));
    const revision: PlanRevision = {
      nodeId,
      added: added.map((n) => n.id),
      note:
        proposal.note ||
        localize(
          `Antes de voltar a "${focus.title}", vamos ver ${titles}: é a base que faltava.`,
          `Before going back to "${focus.title}", we will look at ${titles}: it is the base that was missing.`
        ),
    };
    session.planRevisions = [...(session.planRevisions || []), revision];
    this.persist();
    return revision;
  }

  /**
   * Puts new concepts under `focus`. They may only rest on what `focus` already rests on, so no
   * cycle can appear, and the whole map goes through the same repair as a generated one.
   */
  private addFoundations(
    focus: ConceptNode,
    proposals: Array<{ title: string; summary: string; unconditionalTruth: string; prerequisites: string[] }>
  ): ConceptNode[] {
    const session = this.requireSession();
    const current = this.store.getNodes();
    const takenTitles = new Set(current.map((n) => n.title.trim().toLocaleLowerCase()));
    const takenIds = new Set(current.map((n) => n.id));
    const base = new Set(this.frontier.ancestorsOf(focus.id));

    const fresh: Array<Omit<ConceptNode, 'status'>> = [];
    for (const p of proposals) {
      const key = p.title.trim().toLocaleLowerCase();
      if (!key || takenTitles.has(key)) continue;
      takenTitles.add(key);
      const slug = slugify(p.title);
      let id = slug;
      for (let n = 2; takenIds.has(id); n++) id = `${slug}-${n}`;
      takenIds.add(id);
      fresh.push({
        id,
        title: p.title.trim(),
        summary: p.summary,
        unconditionalTruth: p.unconditionalTruth,
        level: Math.max(1, focus.level - 1),
        prerequisites: p.prerequisites.filter((x) => base.has(x)),
      });
    }
    if (fresh.length === 0) return [];

    const freshIds = fresh.map((n) => n.id);
    const rebuilt = sanitizeGraph([
      ...current.map((n) => (n.id === focus.id ? { ...n, prerequisites: [...n.prerequisites, ...freshIds] } : n)),
      ...fresh,
    ]);
    // Nothing is committed unless every concept, old and new, survived the repair with its id
    const rebuiltIds = new Set(rebuilt.map((n) => n.id));
    if (rebuilt.length !== current.length + fresh.length || [...takenIds].some((id) => !rebuiltIds.has(id))) return [];

    this.store.setNodes(rebuilt);
    this.strandNodes = this.store.getStrand();
    this.frontier = new ProbeFrontier(this.strandNodes);
    for (const id of freshIds) session.nodesState[id] = 'untested';
    // First among equals: the student was just told this is what comes before going back
    this.teachingOrder = this.basicsFirst([...freshIds, ...this.teachingOrder]);
    session.frontierClarity = this.calculateFrontierClarity();
    return rebuilt.filter((n) => freshIds.includes(n.id));
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
   * A harder follow-up is always written fresh, from the questions the student already answered.
   */
  private async getOrGenerateQuestionFor(target: ProbeTarget, goal: string): Promise<QuestionData> {
    const session = this.requireSession();
    const nodeId = target.nodeId;
    const cached = this.questionCache.get(nodeId);
    if (cached && !target.escalate) {
      if (!this.askedQuestions.includes(cached.questionText)) return cached;
      this.questionCache.delete(nodeId);
    }

    const node = this.store.getNodeById(nodeId);
    if (!node) throw new Error(localize(`Conceito "${nodeId}" não encontrado.`, `Concept "${nodeId}" not found.`));

    const harderThan = target.escalate
      ? session.attempts.filter((a) => a.nodeId === nodeId).map((a) => a.questionText)
      : undefined;
    const question = await this.generator.generateQuestion(node, goal, this.askedQuestions, { harderThan });
    this.questionCache.set(nodeId, question);
    return question;
  }
}
