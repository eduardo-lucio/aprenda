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

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  slug: string;
  price: string;
  context: string;
  defaultEffort: 'off' | 'minimal' | 'low' | 'medium' | 'high';
  isReasoning?: boolean;
}

export interface ProviderConfig {
  id: string;
  name: string;
  keyMasked: string;
  apiKey: string;
  baseUrl?: string;
  isActive?: boolean;
  isValidated?: boolean;
  models?: ModelOption[];
}

export interface ProviderValidationResult {
  isValid: boolean;
  providerId: string;
  providerName: string;
  keyMasked: string;
  models: ModelOption[];
  error?: string;
}

export interface SettingsUpdatePayload {
  providerId?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  effortLevel?: string;
  deepgramApiKey?: string;
  voiceLanguage?: string;
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
  startSocraticStep: (nodeId?: string) => Promise<{ node: ConceptNode; questionText: string; promptGoal: string }>;
  submitPrediction: (text: string) => Promise<{ teachProse: string; checkQuestion: CheckQuestionData }>;
  submitCheckAnswer: (selectedIndex: number) => Promise<{ isPassed: boolean; repairExplanation?: string; session: ProbingSession }>;
  getGraphState: () => Promise<ConceptNode[]>;
  getSession: () => Promise<ProbingSession | null>;
  windowAction: (action: 'minimize' | 'maximize' | 'close') => void;
  validateProvider: (params: {
    providerId: string;
    apiKey: string;
    baseUrl?: string;
  }) => Promise<ProviderValidationResult>;
  updateSettings: (settings: SettingsUpdatePayload) => Promise<{ success: boolean }>;
  validateDeepgramKey: (apiKey: string) => Promise<{ isValid: boolean; keyMasked: string }>;
  transcribeAudio: (params: { audio: ArrayBuffer; mimeType: string; language?: string }) => Promise<string>;
}
