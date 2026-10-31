export interface ConceptNode {
  id: string;
  title: string;
  summary: string;
  level: number;
  prerequisites: string[];
  unconditionalTruth: string;
  status: 'untested' | 'mastered' | 'false_positive' | 'blind_spot' | 'frontier';
}

export interface QuestionData {
  id: string;
  nodeId: string;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  anchorConcept: string;
  difficulty?: number;
}

export interface ProbeAttempt {
  questionId: string;
  nodeId: string;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  selectedOptionIndex: number;
  confidence: number;
  thinkingText: string;
  verdict: 'mastered' | 'false_positive' | 'blind_spot' | 'frontier';
  judgeReasoning: string;
  identifiedMisconception?: string;
}

export interface CheckQuestionData {
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
}

export interface SocraticStep {
  nodeId: string;
  predictQuestion: string;
  promptGoal?: string;
  predictStudentAnswer?: string;
  teachContent: string;
  checkQuestion: CheckQuestionData;
  checkStudentAnswer?: number;
  isCheckPassed?: boolean;
  repairExplanation?: string;
}

export interface ProbingSession {
  id: string;
  mode: 'teaching' | 'practice';
  disciplineId: string;
  goal: string;
  phase: 'goal_orientation' | 'probing' | 'frontier_diagnosis' | 'socratic_teach' | 'completed';
  questionCount: number;
  frontierClarity: number;
  attempts: ProbeAttempt[];
  socraticSteps: SocraticStep[];
  nodesState: Record<string, ConceptNode['status']>;
  currentQuestion?: QuestionData;
  goalClarificationOptions?: string[];
}

export interface JudgeEvaluationResult {
  verdict: 'mastered' | 'false_positive' | 'blind_spot' | 'frontier';
  isCorrectOption: boolean;
  confidenceLevel: number;
  reasoningDiagnosis: string;
  identifiedMisconception?: string;
}

export interface ElectronAPI {
  startSession: (mode: 'teaching' | 'practice', goal: string) => Promise<ProbingSession>;
  submitGoalClarification: (option: string) => Promise<QuestionData>;
  submitProbeAnswer: (data: { selectedOptionIndex: number; confidence: number; thinkingText: string }) => Promise<{
    attempt: ProbeAttempt;
    nextAction: 'next_question' | 'transition_diagnosis';
    nextQuestion?: QuestionData;
    session: ProbingSession;
  }>;
  advanceToDiagnosis: () => Promise<ProbingSession>;
  startSocraticStep: (nodeId?: string) => Promise<SocraticStep>;
  submitPrediction: (text: string) => Promise<{ teachProse: string; checkQuestion: CheckQuestionData }>;
  submitCheckAnswer: (selectedIndex: number) => Promise<{ isPassed: boolean; repairExplanation?: string; session: ProbingSession }>;
  getGraphState: () => Promise<ConceptNode[]>;
  getSession: () => Promise<ProbingSession | null>;
  windowAction: (action: 'minimize' | 'maximize' | 'close') => void;
}
