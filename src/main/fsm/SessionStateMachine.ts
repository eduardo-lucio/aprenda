import {
  ConceptNode,
  ProbeAttempt,
  ProbingSession,
  QuestionData,
} from '../../shared/types';
import { KnowledgeStore } from '../knowledge/KnowledgeStore';
import { CognitiveJudgeService } from '../services/CognitiveJudgeService';
import { CurriculumGenerator } from '../services/CurriculumGenerator';
import { AgentOrchestrator } from '../services/AgentOrchestrator';
import { SocraticEngine } from '../socratic/SocraticEngine';

export const MIN_PROBE_QUESTIONS = 8;

export class SessionStateMachine {
  private store: KnowledgeStore;
  private judge: CognitiveJudgeService;
  private generator: CurriculumGenerator;
  private orchestrator: AgentOrchestrator;
  private session?: ProbingSession;
  private strandNodes: ConceptNode[] = [];
  private candidateQueue: string[] = [];
  private askedQuestions: string[] = [];
  private questionCache: Map<string, QuestionData> = new Map();

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

  getState(): ProbingSession {
    if (!this.session) {
      throw new Error('Nenhuma sessão ativa.');
    }
    return {
      ...this.session,
      attempts: [...this.session.attempts],
      nodesState: { ...this.session.nodesState },
    };
  }

  startSession(mode: 'teaching' | 'practice', goalText: string): Promise<ProbingSession> {
    const goal = (goalText || '').trim() || 'Objetivo de Estudo';

    this.orchestrator.clear();
    this.strandNodes = [];
    this.candidateQueue = [];
    this.askedQuestions = [];
    this.questionCache.clear();

    const existingNodes = this.store.getNodes();
    const initialNodesState: Record<string, ConceptNode['status']> = {};
    for (const node of existingNodes) {
      initialNodesState[node.id] = 'untested';
    }

    const defaultOptions = this.generator.defaultGoalOptions(goal);

    this.session = {
      id: `session-${Date.now()}`,
      mode,
      disciplineId: goal,
      goal,
      phase: 'goal_orientation',
      questionCount: 0,
      frontierClarity: 0,
      attempts: [],
      socraticSteps: [],
      nodesState: initialNodesState,
      goalClarificationOptions: defaultOptions,
    };

    const currentSession = this.session;
    return this.generator.generateGoalOptions(goal).then((opts) => {
      if (this.session === currentSession && opts.length > 0) {
        currentSession.goalClarificationOptions = opts;
        const goalThink = this.generator.getLastGoalThinking?.();
        if (goalThink) {
          currentSession.agentThinking = goalThink;
        }
      }
      return this.getState();
    });
  }

  async submitGoalClarification(selectedOption: string): Promise<QuestionData> {
    const session = this.requireSession();

    // 1 single combined call generates the DAG and the first probe question together
    const graph = await this.generator.generateGraph(selectedOption);
    this.store.setNodes(graph.nodes);
    this.strandNodes = this.store.getStrand();

    const nodesState: Record<string, ConceptNode['status']> = {};
    for (const n of this.strandNodes) {
      nodesState[n.id] = 'untested';
    }

    // Sort by level ascending (increasing difficulty: foundational Level 1 first -> Level 4)
    this.candidateQueue = [...this.strandNodes].sort((a, b) => a.level - b.level).map((n) => n.id);

    let firstQuestion = graph.firstQuestion;
    let firstNodeId: string;

    if (firstQuestion && this.store.getNodeById(firstQuestion.nodeId)) {
      firstNodeId = firstQuestion.nodeId;
      this.candidateQueue = this.candidateQueue.filter((id) => id !== firstNodeId);
      this.questionCache.set(firstQuestion.nodeId, firstQuestion);
    } else {
      firstNodeId = this.candidateQueue.shift()!;
      firstQuestion = await this.getOrGenerateQuestionFor(firstNodeId, selectedOption);
    }

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
    });

    return firstQuestion;
  }

  async submitProbeAnswer(data: {
    selectedOptionIndex: number;
    confidence: number;
    thinkingText: string;
  }): Promise<{
    attempt: ProbeAttempt;
    nextAction: 'next_question' | 'transition_diagnosis';
    nextQuestion?: QuestionData;
  }> {
    const session = this.requireSession();
    if (session.phase !== 'probing') {
      throw new Error(`Cannot submit probe answer in phase: ${session.phase}`);
    }

    const currentQ = session.currentQuestion;
    if (!currentQ) {
      throw new Error('No active question in session');
    }

    const currentNode = this.store.getNodeById(currentQ.nodeId);
    if (!currentNode) {
      throw new Error('Conceito da questão atual não encontrado no grafo.');
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
      correctOptionIndex: currentQ.correctOptionIndex,
      confidence: data.confidence,
      thinkingText: data.thinkingText,
    });

    const attempt: ProbeAttempt = {
      questionId: currentQ.id,
      nodeId: currentNode.id,
      questionText: currentQ.questionText,
      options: currentQ.options,
      correctOptionIndex: currentQ.correctOptionIndex,
      selectedOptionIndex: data.selectedOptionIndex,
      confidence: data.confidence,
      thinkingText: data.thinkingText,
      verdict: evaluation.verdict,
      judgeReasoning: evaluation.reasoningDiagnosis,
      identifiedMisconception: evaluation.identifiedMisconception,
      agentThinking: currentQ.agentThinking,
    };

    session.attempts.push(attempt);
    session.nodesState[currentNode.id] = evaluation.verdict;

    // If a cognitive boundary or misconception is diagnosed, pre-bake the Socratic lesson in background
    if (
      evaluation.verdict === 'false_positive' ||
      evaluation.verdict === 'blind_spot' ||
      evaluation.verdict === 'frontier'
    ) {
      this.orchestrator.prebakeSocraticLesson(currentNode, session.goal);
    }

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

    if (session.questionCount >= MIN_PROBE_QUESTIONS && session.frontierClarity >= 100) {
      session.phase = 'frontier_diagnosis';
      session.currentQuestion = undefined;
      if (evaluation.agentThinking) {
        session.agentThinking = evaluation.agentThinking;
      }
      return { attempt, nextAction: 'transition_diagnosis' };
    }

    // Pick next node and retrieve pre-cached question instantly (0ms)
    const nextNodeId = this.pickNextNode();
    const rawNextQuestion = await this.getOrGenerateQuestionFor(nextNodeId, session.goal);
    const combinedNextThinking = [evaluation.agentThinking, rawNextQuestion.agentThinking]
      .filter((t): t is string => Boolean(t && t.trim()))
      .join('\n\n');
    const nextQuestion: QuestionData = {
      ...rawNextQuestion,
      agentThinking: combinedNextThinking || rawNextQuestion.agentThinking,
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
    });

    return { attempt, nextAction: 'next_question', nextQuestion };
  }

  forceAdvanceToDiagnosis(): void {
    const session = this.requireSession();
    if (session.questionCount < MIN_PROBE_QUESTIONS) {
      throw new Error(`Avanço manual para diagnóstico requer o piso mínimo de ${MIN_PROBE_QUESTIONS} questões.`);
    }
    session.phase = 'frontier_diagnosis';
    session.currentQuestion = undefined;
  }

  markNodeStatus(nodeId: string, status: ConceptNode['status']): void {
    const session = this.requireSession();
    if (nodeId in session.nodesState) {
      session.nodesState[nodeId] = status;
    }
  }

  calculateFrontierClarity(): number {
    if (!this.session || this.strandNodes.length === 0) return 0;
    const tested = this.strandNodes.filter((n) => this.session!.nodesState[n.id] !== 'untested');
    return Math.round((tested.length / this.strandNodes.length) * 100);
  }

  private requireSession(): ProbingSession {
    if (!this.session) throw new Error('Nenhuma sessão ativa.');
    return this.session;
  }

  /**
   * Returns pre-cached question if available, otherwise generates and caches it.
   */
  private async getOrGenerateQuestionFor(nodeId: string, goal: string): Promise<QuestionData> {
    const cached = this.questionCache.get(nodeId);
    if (cached) {
      return cached;
    }

    const node = this.store.getNodeById(nodeId);
    if (!node) throw new Error(`Conceito "${nodeId}" não encontrado.`);

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

    const retry =
      this.strandNodes.find((n) => session.nodesState[n.id] === 'false_positive') ||
      this.strandNodes.find((n) => session.nodesState[n.id] === 'frontier') ||
      this.strandNodes.find((n) => session.nodesState[n.id] === 'blind_spot');
    if (retry) return retry.id;

    return this.strandNodes[this.strandNodes.length - 1].id;
  }
}
