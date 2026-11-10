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

/** What the probe found on one line of the map (a top concept and everything it is built on). */
export interface StrandSummary {
  /** The concept where the line ends. */
  topId: string;
  /** Highest concepts of the line the student holds. */
  floor: string[];
  /** Lowest concepts of the line the student missed: where teaching starts. */
  ceiling: string[];
  misconceptions: string[];
}

/** The plan is a hypothesis: teaching can show that a concept rests on something the map lacks. */
export interface PlanRevision {
  /** The concept whose lesson led to the change. */
  nodeId: string;
  /** Ids of the foundations added before it. */
  added: string[];
  /** What the student is told about the change. */
  note: string;
}
/** Foundations one revision may add, and how many a whole session may gain. */
export const MAX_ADDED_PER_REVISION = 2;
export const MAX_ADDED_PER_SESSION = 4;

/**
 * Practice. Teaching's product is the click; practice makes what is held come to mind in situations
 * unlike the lesson's. A session is a stream of problems over a set of targets.
 */
export type PracticeMode = 'recall' | 'discrimination' | 'composition';

/** One thing the learner holds and the session exercises: a taught concept or a proposition of the topic. */
export interface PracticeTarget {
  id: string;
  title: string;
  truth: string;
}

export interface PracticeTurn {
  role: 'student' | 'tutor';
  /**
   * `work`: thinking in progress or a request for help. `claim`: a final answer. `hint` and `verdict`
   * answer them. `question` and `answer` belong to the pause after the problem is concluded.
   */
  kind: 'work' | 'claim' | 'hint' | 'verdict' | 'question' | 'answer';
  text: string;
  /** Rung of the hint ladder (0 = redirect attention … 5 = the worked step). */
  rung?: number;
  correct?: boolean;
}

export interface PracticeProblem {
  id: string;
  statement: string;
  targetIds: string[];
  mode: PracticeMode;
  /** 1 (close to the lesson's own situation) to 5. */
  difficulty: number;
  /** Poses again, in a fresh situation, something that failed earlier in the session. */
  retestOf?: string;
  turns: PracticeTurn[];
  /** Highest rung of help used so far (-1: none). */
  maxRung: number;
  wrongClaims: number;
  outcome?: 'solved' | 'surrendered' | 'dismissed';
  /** Committed before the problem is shown; only present once it is concluded. */
  modelSolution?: string;
}

export interface PracticeState {
  /** What the session practises, in the learner's words or as the goal of the lessons it came from. */
  material: string;
  targets: PracticeTarget[];
  active?: PracticeProblem;
  history: PracticeProblem[];
  /** The learner asked to wrap up: only retests of what failed are posed from here on. */
  closing?: boolean;
  finished?: boolean;
  /** The teaching session whose concepts are being practised, if any. */
  sourceSessionId?: string;
}

export const MAX_HINT_RUNG = 5;

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
  phase: 'goal_orientation' | 'probing' | 'plan_review' | 'teaching' | 'practice';
  /** Only in practice sessions. */
  practice?: PracticeState;
  questionCount: number;
  frontierClarity: number;
  attempts: ProbeAttempt[];
  nodesState: Record<string, ConceptNode['status']>;
  currentQuestion?: QuestionData;
  goalClarificationQuestion?: string;
  goalClarificationOptions?: string[];
  goalThinking?: string;
  plan?: string;
  /** Written when the probe ends (absent in sessions saved by older versions). */
  probeSummary?: StrandSummary[];
  /** Every change made to the map during the lessons, oldest first. */
  planRevisions?: PlanRevision[];
  /** Concepts of this map the student demonstrated in an earlier session, by concept id. */
  remembered?: Record<string, RememberedConcept>;
  agentThinking?: string;
  chatHistory?: ChatTurnMessage[];
  tokensUsed?: number;
}

/**
 * Something the student demonstrated: mastering a concept in a lesson or solving a practice problem
 * without relevant help. It says what was shown and when, not that it is held forever.
 */
export interface DemonstratedConcept {
  id: string;
  title: string;
  /** The unconditional truth of the concept. */
  truth: string;
  discipline: string;
  /** The session of the latest demonstration. */
  sessionId: string;
  source: 'lesson' | 'practice';
  firstAt: number;
  lastAt: number;
  times: number;
}

/** A concept of the current map matched to an earlier demonstration: where the probe starts, to be confirmed. */
export interface RememberedConcept {
  memoryId: string;
  lastAt: number;
}

/** One failed verification of a concept: what the next attempt at the lesson has to fix. */
export interface LessonFailure {
  questionText: string;
  chosenAnswer: string;
  correctAnswer: string;
  diagnosis: string;
  misconception?: string;
  /** What the student said he was thinking while reading the explanation that failed. */
  readingThoughts?: string;
}

/** A concept is a milestone, not a lesson: it is taught in up to this many reasoning steps. */
export const MAX_LESSON_STEPS = 4;
/** Times one step is explained again after a failed verification before the concept goes back to the queue. */
export const MAX_STEP_RETRIES = 2;

/** How far the lesson on one concept has gone. Each step has its own explanation and verification. */
export interface LessonProgress {
  /** The fact each step has to establish, in order. */
  steps: string[];
  stepIndex: number;
  /** Times the current step was explained again. */
  retries: number;
  prediction: string;
  /** Explanations already given in this lesson, oldest first. */
  taught: Array<{ step: number; prose: string }>;
  /** What the student said he was thinking while reading the latest explanation. */
  readingThoughts?: string;
  /** The guess already showed the concept: one confirmation instead of the usual steps. */
  shortcut?: boolean;
}

/** What follows a verification: the lesson stays on the concept until every step is demonstrated. */
export type LessonOutcome = 'next_step' | 'retry_step' | 'concept_mastered' | 'concept_requeued';

/** One answered step of a lesson, kept so the student can reread it. */
export interface CompletedLesson {
  nodeId: string;
  title: string;
  /** Empty on every step after the first: the guess opens the lesson, not each step. */
  predictQuestion: string;
  prediction: string;
  teachProse: string;
  checkQuestion: string;
  isPassed: boolean;
  repairExplanation?: string;
  /** Absent in lessons saved before concepts were taught in steps. */
  stepIndex?: number;
  stepCount?: number;
  /** What the student was told when this verification changed the plan. */
  planNote?: string;
}

/** What the AI writes about one concept of the map, from what the student actually did on it. */
export interface ConceptNoteContent {
  nodeId: string;
  summary: string;
  toLearn: string[];
  learned: string[];
}

export interface ConceptNote extends ConceptNoteContent {
  /** Snapshot of the student's progress the note was written from: when it changes, the note is stale. */
  evidenceKey: string;
}

export interface PersistedUi {
  chatMessages: ChatTurnMessage[];
  lessons?: CompletedLesson[];
  notes?: ConceptNote[];
  /** Lesson the student left halfway: reopening the session resumes it instead of generating it again. */
  activeLesson?: {
    node: ConceptNode;
    questionText: string;
    promptGoal?: string;
    /** `continue`: the verification was answered and the next explanation was not requested yet. */
    step: 'predict' | 'teach' | 'check' | 'continue';
    prediction: string;
    teachProse: string;
    checkQuestion: CheckQuestionData | null;
    /** Absent in lessons saved before concepts were taught in steps. */
    progress?: LessonProgress;
  } | null;
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
  /** Only in sessions saved by older versions: the next concept is now derived from the answers. */
  candidateQueue?: string[];
  askedQuestions: string[];
  teachingOrder: string[];
  /** Failed verifications per concept since it was last mastered. */
  lessonFailures?: Record<string, LessonFailure[]>;
  /** Concepts whose failure already made the plan be reconsidered: each one asks only once. */
  planRevisedFor?: string[];
  /** The model solution of the active practice problem: it stays in the main process until the problem ends. */
  practiceSolution?: { problemId: string; text: string };
  tokensUsed: number;
}

export interface SessionSummary {
  id: string;
  title: string;
  mode: 'teaching' | 'practice';
  updatedAt: number;
  pinned?: boolean;
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
  /** Only present in settings saved by older versions: keys now live in the main process. */
  apiKey?: string;
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
  submitPrediction: (
    text: string
  ) => Promise<{ teachProse: string; checkQuestion: CheckQuestionData; progress: LessonProgress }>;
  /**
   * `mastered` is about the step just verified. `readingThoughts` is what the student was thinking
   * while reading the explanation: it goes to the next explanation, never to the grading.
   */
  submitCheckAnswer: (
    selectedIndex: number,
    confidence?: number,
    thinkingText?: string,
    readingThoughts?: string
  ) => Promise<{
    isPassed: boolean;
    mastered: boolean;
    outcome: LessonOutcome;
    progress?: LessonProgress;
    /** Set when this verification made the map gain a foundation. */
    planRevision?: PlanRevision;
    repairExplanation?: string;
    session: ProbingSession;
  }>;
  /** Writes the next step of the lesson, or the same step again after a failed verification. */
  continueLesson: () => Promise<{
    teachProse: string;
    checkQuestion: CheckQuestionData;
    progress: LessonProgress;
    isRetry: boolean;
  }>;
  /** Opens a practice session over a free topic or over concepts already taught. No AI call. */
  startPractice: (params: { material: string; targets?: PracticeTarget[]; sourceSessionId?: string }) => Promise<ProbingSession>;
  /** Poses the next problem of the stream (or ends the session when nothing is left to retest). */
  practiceNext: () => Promise<ProbingSession>;
  /** `work` asks for help from the thinking so far; `claim` hands in an answer. */
  practiceSubmit: (kind: 'work' | 'claim', text: string) => Promise<ProbingSession>;
  /** Ends the active problem without solving it and reveals the solution. */
  practiceConclude: (reason: 'surrendered' | 'dismissed') => Promise<ProbingSession>;
  /** A question about the problem just concluded. */
  practiceAsk: (text: string) => Promise<ProbingSession>;
  /** From here on only what failed is posed again, in a fresh situation. */
  practiceClose: () => Promise<ProbingSession>;
  /** What the student demonstrated in every session so far, latest first. */
  listMemory: () => Promise<DemonstratedConcept[]>;
  deleteMemory: (ids: string[]) => Promise<DemonstratedConcept[]>;
  clearMemory: () => Promise<DemonstratedConcept[]>;
  /** Replaces the focus options with simpler entry points (the student asked for guidance). */
  requestOrientation: (thinkingText?: string) => Promise<ProbingSession>;
  /** Stops the AI call the student is waiting on; the pending promise rejects as cancelled. */
  cancelOperation: () => Promise<void>;
  listSessions: () => Promise<SessionSummary[]>;
  loadSession: (id: string) => Promise<{ session: ProbingSession; ui: PersistedUi }>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  pinSession: (id: string, pinned: boolean) => Promise<void>;
  /** Re-arms the main process for a lesson restored from disk (no AI call). */
  resumeLesson: (nodeId: string, checkQuestion: CheckQuestionData | null, progress?: LessonProgress) => Promise<void>;
  saveSessionUi: (id: string, ui: PersistedUi) => Promise<void>;
  /** Concepts the AI left out are simply absent from the result. */
  generateConceptNotes: (sessionId: string, nodeIds: string[]) => Promise<ConceptNoteContent[]>;
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
  startSpeechStream?: (params: { language?: string }) => Promise<number>;
  sendSpeechChunk?: (chunk: ArrayBuffer) => void;
  stopSpeechStream?: () => Promise<void>;
  onSpeechStreamEvent?: (callback: (event: SpeechStreamEvent) => void) => () => void;
  getStorageStatus?: () => Promise<{ corruptBackup?: string; secretsProtected: boolean }>;
  /** Hands over keys that older versions kept in the renderer. */
  migrateSecrets?: (legacy: { providers?: Array<{ id: string; apiKey?: string }>; deepgramApiKey?: string }) => Promise<void>;
  deleteProviderKey?: (id: string) => Promise<void>;
  deleteDeepgramKey?: () => Promise<void>;
  onStorageError?: (callback: (error: string | null) => void) => () => void;
  onMaximizedChange?: (callback: (isMaximized: boolean) => void) => () => void;
  onThinkingStream?: (callback: (payload: { text: string; done?: boolean }) => void) => () => void;
  onTokensUpdate?: (callback: (payload: { tokensUsed: number }) => void) => () => void;
}

/** What the live dictation connection reports while the student speaks. */
export type SpeechStreamEvent =
  | { id: number; type: 'interim' | 'final'; text: string }
  | { id: number; type: 'error'; message: string }
  | { id: number; type: 'closed' };

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
