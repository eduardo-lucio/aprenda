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
  agentThinking?: string;
}

/**
 * How the student answered a question. `option` = picked an alternative; `dont_know` and `own_answer`
 * both use `selectedOptionIndex === -1` but mean opposite things (declined to guess vs. wrote the answer).
 */
export type ProbeAnswerKind = 'option' | 'own_answer' | 'dont_know';

export function resolveAnswerKind(selectedOptionIndex: number, kind?: ProbeAnswerKind): ProbeAnswerKind {
  if (selectedOptionIndex >= 0) return 'option';
  return kind === 'own_answer' ? 'own_answer' : 'dont_know';
}

export interface ProbeAttempt {
  questionId: string;
  nodeId: string;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  selectedOptionIndex: number;
  /** Only set when `selectedOptionIndex === -1` and the student wrote their own answer. */
  answerKind?: ProbeAnswerKind;
  confidence?: number;
  thinkingText: string;
  verdict: 'mastered' | 'false_positive' | 'blind_spot' | 'frontier';
  judgeReasoning: string;
  identifiedMisconception?: string;
  agentThinking?: string;
}

/** The "something else / not sure yet" focus option: the student is asking for guidance, not naming a focus. */
export function isOrientationOption(option: string): boolean {
  return /\b(outro|other|something else)\b/i.test(option) && /(n[ãa]o sei|not sure)/i.test(option);
}

export const MIN_PROBE_QUESTIONS = 8;
export const PROBE_QUESTIONS_RANGE = { min: 3, max: 20 } as const;

export function clampProbeQuestions(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return MIN_PROBE_QUESTIONS;
  return Math.min(PROBE_QUESTIONS_RANGE.max, Math.max(PROBE_QUESTIONS_RANGE.min, v));
}
export const CONFIDENCE_STOPS = [0, 30, 50, 70, 90, 100] as const;
export const DEFAULT_CONFIDENCE = 50;

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

export interface ChatTurnMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  thinking?: string;
  afterAttemptCount?: number;
  timestamp: number;
}

export interface ProbingSession {
  id: string;
  mode: 'teaching' | 'practice';
  disciplineId: string;
  /** Chosen focus once the student picks one; until then, the typed topic. */
  goal: string;
  /** The topic as the student typed it (absent in sessions saved by older versions). */
  topic?: string;
  phase: 'goal_orientation' | 'probing' | 'plan_review' | 'teaching';
  questionCount: number;
  frontierClarity: number;
  attempts: ProbeAttempt[];
  socraticSteps: SocraticStep[];
  nodesState: Record<string, ConceptNode['status']>;
  currentQuestion?: QuestionData;
  goalClarificationQuestion?: string;
  goalClarificationOptions?: string[];
  goalThinking?: string;
  plan?: string;
  agentThinking?: string;
  chatHistory?: ChatTurnMessage[];
  tokensUsed?: number;
}

export interface PersistedUi {
  chatMessages: ChatTurnMessage[];
  answeredScope?: {
    questionText: string;
    options: string[];
    selectedOption: string;
    thinkingText?: string;
  } | null;
}

/** Everything the state machine needs to resume a session after an app restart. */
export interface SessionSnapshot {
  session: ProbingSession;
  nodes: ConceptNode[];
  candidateQueue: string[];
  askedQuestions: string[];
  teachingOrder: string[];
  /** Concepts already taught (check answered, pass or fail) in the current teaching pass. */
  teachingDone?: string[];
  tokensUsed: number;
}

export interface SessionSummary {
  id: string;
  title: string;
  mode: 'teaching' | 'practice';
  updatedAt: number;
}

export interface JudgeEvaluationResult {
  verdict: 'mastered' | 'false_positive' | 'blind_spot' | 'frontier';
  isCorrectOption: boolean;
  confidenceLevel?: number;
  reasoningDiagnosis: string;
  identifiedMisconception?: string;
  agentThinking?: string;
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
  minProbeQuestions?: number;
  /** Language of the interface; the AI also writes to the student in it. */
  uiLanguage?: 'pt' | 'en';
}

export interface ElectronAPI {
  startSession: (mode: 'teaching' | 'practice', goal: string) => Promise<ProbingSession>;
  submitGoalClarification: (option: string, thinkingText?: string) => Promise<QuestionData>;
  submitProbeAnswer: (data: {
    selectedOptionIndex: number;
    answerKind?: ProbeAnswerKind;
    confidence?: number;
    thinkingText: string;
  }) => Promise<{
    attempt: ProbeAttempt;
    nextAction: 'next_question' | 'transition_plan';
    nextQuestion?: QuestionData;
    session: ProbingSession;
  }>;
  advanceToPlan: () => Promise<ProbingSession>;
  confirmPlan: () => Promise<ProbingSession>;
  /** Resolves to `null` when there is no concept left to teach in this pass (without an explicit `nodeId`). */
  startSocraticStep: (
    nodeId?: string
  ) => Promise<{ node: ConceptNode; questionText: string; promptGoal: string } | null>;
  submitPrediction: (text: string) => Promise<{ teachProse: string; checkQuestion: CheckQuestionData }>;
  submitCheckAnswer: (selectedIndex: number, confidence?: number, thinkingText?: string) => Promise<{ isPassed: boolean; repairExplanation?: string; session: ProbingSession }>;
  /** Replaces the focus options with simpler entry points (the student asked for guidance). */
  requestOrientation: (thinkingText?: string) => Promise<ProbingSession>;
  /** Stops the AI call the student is waiting on; the pending promise rejects as cancelled. */
  cancelOperation: () => Promise<void>;
  listSessions: () => Promise<SessionSummary[]>;
  loadSession: (id: string) => Promise<{ session: ProbingSession; ui: PersistedUi }>;
  deleteSession: (id: string) => Promise<void>;
  saveSessionUi: (id: string, ui: PersistedUi) => Promise<void>;
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
  onThinkingStream?: (callback: (payload: { text: string; done?: boolean }) => void) => () => void;
  onTokensUpdate?: (callback: (payload: { tokensUsed: number }) => void) => () => void;
}

/** Languages offered for voice dictation (Deepgram / Web Speech codes). */
export const VOICE_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'pt-PT', label: 'Português (Portugal)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'es', label: 'Español' },
  { code: 'es-419', label: 'Español (Latinoamérica)' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'ru', label: 'Русский' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh-CN', label: '中文 (简体)' },
  { code: 'hi', label: 'हिन्दी' },
];
