import {
  ConceptNode,
  ProbeAttempt,
  ProbingSession,
  QuestionData,
  SocraticStep,
} from '../../shared/types';
import { KnowledgeStore } from '../knowledge/KnowledgeStore';
import { DEFAULT_QUESTION_BANK } from '../knowledge/questionBank';
import { CognitiveJudgeService } from '../services/CognitiveJudgeService';

export class SessionStateMachine {
  private store: KnowledgeStore;
  private judge: CognitiveJudgeService;
  private session!: ProbingSession;
  private strandNodes: ConceptNode[] = [];
  private candidateQueue: string[] = [];
  private questionHistory: Set<string> = new Set();

  constructor(store?: KnowledgeStore, judge?: CognitiveJudgeService) {
    this.store = store || new KnowledgeStore();
    this.judge = judge || new CognitiveJudgeService();
  }

  getState(): ProbingSession {
    return { ...this.session };
  }

  startSession(mode: 'teaching' | 'practice', goalText: string): void {
    const allNodes = this.store.getNodes();
    const initialNodesState: Record<string, ConceptNode['status']> = {};
    for (const node of allNodes) {
      initialNodesState[node.id] = 'untested';
    }

    const sessionId = `session-${Date.now()}`;
    const goalOptions = this.generateGoalClarificationOptions(goalText);

    this.session = {
      id: sessionId,
      mode,
      disciplineId: 'redes-camada-3',
      goal: goalText,
      phase: 'goal_orientation',
      questionCount: 0,
      frontierClarity: 0,
      attempts: [],
      socraticSteps: [],
      nodesState: initialNodesState,
      goalClarificationOptions: goalOptions,
    };

    this.strandNodes = this.store.getStrandForGoal(goalText);
    this.candidateQueue = [];
    this.questionHistory = new Set();
  }

  private generateGoalClarificationOptions(goalText: string): string[] {
    const lower = (goalText || '').toLowerCase();
    if (lower.includes('ttl') || lower.includes('loop')) {
      return [
        'Aprofundar em TTL, Prevenção de Loops e Mensagens ICMP',
        'Compreender o cabeçalho IPv4 e o decremento do TTL salto-a-salto',
        'Investigação geral da Camada 3 e tabela de encaminhamento',
      ];
    }
    if (lower.includes('cidr') || lower.includes('sub-rede') || lower.includes('mascara')) {
      return [
        'Cálculo e particionamento de sub-redes com notação CIDR /24 a /30',
        'Tabela de Roteamento e Casamento Mais Longo de Prefixo (LPM)',
        'Diferenças fundamentais entre Switches L2 e Roteadores L3',
      ];
    }
    return [
      'Domínio completo da Camada 3 (IPv4, TTL, Roteadores e CIDR)',
      'Foco prático em descarte de pacotes, loops e ICMP Traceroute',
      'Encapsulamento fim-a-fim: Bits, Quadros MAC e Pacotes IP',
    ];
  }

  async submitGoalClarification(selectedOption: string): Promise<QuestionData> {
    this.session.goal = selectedOption;
    this.session.phase = 'probing';
    this.session.questionCount = 1;

    // Refresh strand for clarified goal
    this.strandNodes = this.store.getStrandForGoal(selectedOption);

    // Initial queue: if goal is specific to a high-level concept, place it first to bracket
    const topLevelNodes = [...this.strandNodes].sort((a, b) => b.level - a.level);
    this.candidateQueue = topLevelNodes.map((n) => n.id);

    const firstNodeId = this.candidateQueue.shift() || this.strandNodes[0].id;
    const firstQuestion = this.getQuestionForNode(firstNodeId);
    this.session.currentQuestion = firstQuestion;
    this.questionHistory.add(firstQuestion.id);

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
    if (this.session.phase !== 'probing') {
      throw new Error(`Cannot submit probe answer in phase: ${this.session.phase}`);
    }

    const currentQ = this.session.currentQuestion;
    if (!currentQ) {
      throw new Error('No active question in session');
    }

    const currentNode = this.store.getNodeById(currentQ.nodeId)!;

    // Cognitive Judge Evaluation
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
    };

    this.session.attempts.push(attempt);
    this.session.nodesState[currentNode.id] = evaluation.verdict;

    // Pedagogy rules:
    if (evaluation.verdict === 'mastered') {
      // Propagate mastery to untested prerequisites (unconditional roots)
      const prereqs = this.store.getPrerequisites(currentNode.id);
      for (const p of prereqs) {
        if (this.session.nodesState[p.id] === 'untested') {
          this.session.nodesState[p.id] = 'mastered';
        }
      }
    } else {
      // Zoom-In: false_positive, blind_spot, or frontier
      // Regress to untested prerequisites of this node immediately
      const prereqs = this.store.getPrerequisites(currentNode.id);
      // Prepend untested prerequisites to the front of candidate queue
      const untestedPrereqs = prereqs
        .filter((p) => this.session.nodesState[p.id] === 'untested')
        .map((p) => p.id);

      // Add to front of queue
      this.candidateQueue = [...untestedPrereqs, ...this.candidateQueue.filter((id) => !untestedPrereqs.includes(id))];
    }

    this.session.frontierClarity = this.calculateFrontierClarity();

    // Check transition: strict floor of 8 questions!
    // Automatic transition only if questionCount >= 8 AND clarity === 100%
    if (this.session.questionCount >= 8 && this.session.frontierClarity >= 100) {
      this.session.phase = 'frontier_diagnosis';
      this.session.currentQuestion = undefined;
      return {
        attempt,
        nextAction: 'transition_diagnosis',
      };
    }

    // Continue probing
    this.session.questionCount += 1;
    const nextNodeId = this.pickNextNode();
    const nextQuestion = this.getQuestionForNode(nextNodeId);
    this.session.currentQuestion = nextQuestion;
    this.questionHistory.add(nextQuestion.id);

    return {
      attempt,
      nextAction: 'next_question',
      nextQuestion,
    };
  }

  private pickNextNode(): string {
    // Check candidate queue
    while (this.candidateQueue.length > 0) {
      const candidateId = this.candidateQueue.shift()!;
      if (this.session.nodesState[candidateId] === 'untested') {
        return candidateId;
      }
    }

    // Next untested node in strand
    const untestedInStrand = this.strandNodes.find((n) => this.session.nodesState[n.id] === 'untested');
    if (untestedInStrand) {
      return untestedInStrand.id;
    }

    // If all strand nodes tested, pick any node in graph or re-test frontier/false_positive
    const retryNode = this.strandNodes.find((n) => this.session.nodesState[n.id] === 'false_positive' || this.session.nodesState[n.id] === 'frontier');
    if (retryNode) return retryNode.id;

    return this.strandNodes[0]?.id || 'osi-l3-ttl';
  }

  private getQuestionForNode(nodeId: string): QuestionData {
    const questions = DEFAULT_QUESTION_BANK[nodeId] || [];
    const unused = questions.find((q) => !this.questionHistory.has(q.id));
    if (unused) return unused;

    if (questions.length > 0) return questions[0];

    const node = this.store.getNodeById(nodeId);
    return {
      id: `q-${nodeId}-${Date.now()}`,
      nodeId,
      questionText: `Qual é o princípio fundamental de funcionamento de ${node?.title || nodeId}?`,
      options: [
        node?.unconditionalTruth || 'Definição correta do protocolo',
        'Alternativa incorreta baseada em suposição física',
        'Comportamento arbitrário da camada de aplicação',
        'Replicação em broadcast sem decremento',
      ],
      correctOptionIndex: 0,
      anchorConcept: node?.title || nodeId,
      difficulty: node?.level || 2,
    };
  }

  forceAdvanceToDiagnosis(): void {
    if (this.session.questionCount < 8) {
      throw new Error('Avanço manual para diagnóstico requer o piso mínimo de 8 questões.');
    }
    this.session.phase = 'frontier_diagnosis';
    this.session.currentQuestion = undefined;
  }

  calculateFrontierClarity(): number {
    if (this.strandNodes.length === 0) return 0;
    const tested = this.strandNodes.filter((n) => this.session.nodesState[n.id] !== 'untested');
    return Math.round((tested.length / this.strandNodes.length) * 100);
  }
}
