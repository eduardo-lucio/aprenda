import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChatTurnMessage,
  CheckQuestionData,
  CompletedLesson,
  ConceptNode,
  ProbingSession,
  QuestionData,
  ModelOption,
  ProbeAttempt,
  ProbeAnswerKind,
} from '../../shared/types';
import { AgentThinkingBlock } from '../components/AgentThinkingBlock';
import { QuestionCard } from '../components/QuestionCard';
import { AnsweredQuestionCard } from '../components/AnsweredQuestionCard';
import { SocraticCard, SocraticStep } from '../components/SocraticCard';
import { RichText } from '../components/RichText';
import { ProbeCard } from '../components/ProbeCard';
import { ErrorNotice } from '../components/ErrorNotice';
import { BusyStatus } from '../components/BusyStatus';
import { cleanError as toDisplayError, isCancelled, isSessionChanged } from '../lib/errors';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { KnowledgeGraph } from '../components/KnowledgeGraph';
import { localeOf, useI18n } from '../i18n';
import { DEFAULT_CONFIDENCE, MIN_PROBE_QUESTIONS, PersistedUi, clampProbeQuestions, isOrientationOption } from '../../shared/types';
import {
  CheckCircle2,
  Sparkles,
  BarChart3,
  BookOpen,
  CornerDownLeft,
  Mic,
  ChevronDown,
  Check,
} from 'lucide-react';

interface SessionViewProps {
  initialNodes?: ConceptNode[];
  currentSession?: ProbingSession | null;
  restoredUi?: PersistedUi | null;
  pendingMode?: 'teaching' | 'practice' | null;
  onSessionUpdate?: (session: ProbingSession) => void;
  onSessionCreated?: (session: ProbingSession) => void;
  /** Tells the parent an AI call is running, so it can lock session navigation. */
  onBusyChange?: (busy: boolean) => void;
  modelName?: string;
  thinkingLevel?: string;
  tokenCount?: number;
  questionCount?: number;
  minQuestions?: number;
  onToggleDictate?: () => void;
  onOpenSettings?: () => void;
  onChangeThinkingLevel?: (level: 'off' | 'low' | 'medium' | 'high') => void;
  onChangeModel?: (model: string) => void;
  availableModels?: Array<ModelOption | string>;
}

export const SessionView: React.FC<SessionViewProps> = ({
  initialNodes = [],
  currentSession = null,
  restoredUi = null,
  pendingMode = 'teaching',
  onSessionUpdate,
  onSessionCreated,
  onBusyChange,
  modelName = 'gemini-2.0-flash',
  thinkingLevel = 'High',
  tokenCount = 0,
  questionCount,
  minQuestions: minQuestionsProp,
  onToggleDictate,
  onOpenSettings,
  onChangeThinkingLevel,
  onChangeModel,
  availableModels = [],
}) => {
  const { t, lang } = useI18n();
  const [activeTab, setActiveTab] = useState<'session' | 'dag'>('session');
  const [nodes, setNodes] = useState<ConceptNode[]>(initialNodes);
  const [session, setSession] = useState<ProbingSession | null>(currentSession);
  const [goalInput, setGoalInput] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(
    currentSession?.currentQuestion || null
  );
  const [agentThinking, setAgentThinking] = useState<string>('');
  const [socraticNode, setSocraticNode] = useState<ConceptNode | null>(null);
  const [socraticPredictData, setSocraticPredictData] = useState<{
    questionText: string;
    promptGoal?: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingAttempt, setPendingAttempt] = useState<ProbeAttempt | null>(null);
  const [submittingLabel, setSubmittingLabel] = useState<string>('');
  const [bottomChatInput, setBottomChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatTurnMessage[]>(restoredUi?.chatMessages ?? []);
  const [lessons, setLessons] = useState<CompletedLesson[]>(restoredUi?.lessons ?? []);
  const [streamingThinking, setStreamingThinking] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  /** Set when the failed action has no answer field to resend from (lesson start, plan). */
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  const [answeredScope, setAnsweredScope] = useState<{
    questionText: string;
    options: string[];
    selectedOption: string;
    thinkingText?: string;
    // Saved by older versions while the map generation had failed: the focus was never really applied
  } | null>(currentSession?.phase === 'goal_orientation' ? null : restoredUi?.answeredScope ?? null);

  // States for Image 3 inspired Model & Thinking popovers
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showThinkingMenu, setShowThinkingMenu] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const thinkingMenuRef = useRef<HTMLDivElement | null>(null);

  const normalizedModels = useMemo<ModelOption[]>(() => {
    return availableModels.map((m) =>
      typeof m === 'string'
        ? {
            id: m,
            name: m,
            provider: 'openrouter',
            slug: `~${m}`,
            price: 'Free',
            context: '128k',
            defaultEffort: 'medium' as const,
          }
        : m
    );
  }, [availableModels]);

  const filteredModels = useMemo(() => {
    const q = modelSearchQuery.toLowerCase().trim();
    if (!q) return normalizedModels;
    return normalizedModels.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        (m.slug && m.slug.toLowerCase().includes(q))
    );
  }, [normalizedModels, modelSearchQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
      if (thinkingMenuRef.current && !thinkingMenuRef.current.contains(e.target as Node)) {
        setShowThinkingMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Shared answer state for the question docked above the chat field
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [isDontKnow, setIsDontKnow] = useState(false);
  const [confidence, setConfidence] = useState<number>(DEFAULT_CONFIDENCE);

  // Socratic cycle state (lifted out of the card: inputs live in the chat field)
  const [socraticStep, setSocraticStep] = useState<SocraticStep>('predict');
  const [teachProse, setTeachProse] = useState('');
  const [prediction, setPrediction] = useState('');
  const [checkQuestion, setCheckQuestion] = useState<CheckQuestionData | null>(null);
  const [checkResult, setCheckResult] = useState<{ isPassed: boolean; repairExplanation?: string } | null>(null);
  const [socraticLoading, setSocraticLoading] = useState(false);
  // True once the teaching pass has gone through every concept that was still pending
  const [teachingFinished, setTeachingFinished] = useState(false);

  useEffect(() => {
    onBusyChange?.(isSubmitting || socraticLoading);
  }, [isSubmitting, socraticLoading, onBusyChange]);

  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const hasSessionRef = useRef(false);
  hasSessionRef.current = Boolean(session);

  const {
    isListening,
    isTranscribing,
    toggleListening,
    error: speechError,
  } = useSpeechRecognition((voiceText) => {
    const append = (prev: string) => (prev ? `${prev} ${voiceText}` : voiceText);
    if (hasSessionRef.current) setBottomChatInput(append);
    else setGoalInput(append);
  });

  useEffect(() => {
    const handleGlobalDictate = () => toggleListening();
    window.addEventListener('toggle-dictate', handleGlobalDictate);
    return () => window.removeEventListener('toggle-dictate', handleGlobalDictate);
  }, [toggleListening]);

  const minQuestions = minQuestionsProp === undefined ? MIN_PROBE_QUESTIONS : clampProbeQuestions(minQuestionsProp);
  const feedContainerRef = useRef<HTMLDivElement | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const activeCardRef = useRef<HTMLDivElement | null>(null);

  const appendUserChatMessage = (text: string, afterAttemptCount = session?.attempts?.length || 0): string | null => {
    const clean = text.trim();
    if (!clean) return null;
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setChatMessages((prev) => [
      ...prev,
      { id, role: 'user', text: clean, afterAttemptCount, timestamp: Date.now() },
    ]);
    return id;
  };

  const removeChatMessage = (id: string | null) => {
    if (id) setChatMessages((prev) => prev.filter((m) => m.id !== id));
  };

  // Subscribe to real-time LLM thinking stream from main process
  useEffect(() => {
    if (!window.api?.onThinkingStream) return;
    const unsubscribe = window.api.onThinkingStream((payload) => {
      if (payload.text && payload.text.trim()) {
        setStreamingThinking(payload.text);
        setAgentThinking(payload.text);
      }
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Reset the docked question's answer whenever a new question appears
  useEffect(() => {
    setSelectedIdx(null);
    setIsDontKnow(false);
    setConfidence(DEFAULT_CONFIDENCE);
  }, [currentQuestion?.id, session?.id, socraticStep, checkQuestion?.questionText]);

  useEffect(() => {
    setSocraticStep('predict');
    setTeachProse('');
    setPrediction('');
    setCheckQuestion(null);
    setCheckResult(null);
  }, [socraticNode?.id]);

  const smoothOrInstant = (): ScrollBehavior =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  const scrollToBottom = (behavior: ScrollBehavior = smoothOrInstant()) => {
    const el = feedContainerRef.current;
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior });
    } else if (feedEndRef.current && typeof feedEndRef.current.scrollIntoView === 'function') {
      feedEndRef.current.scrollIntoView({ behavior, block: 'nearest' });
    }
  };

  useEffect(() => {
    // A blank new session has no graph yet: the main process still holds the previous one
    if (window.api?.getGraphState && initialNodes.length === 0 && currentSession) {
      window.api.getGraphState().then((g) => setNodes(g)).catch((err) => console.error('[SessionView] Falha ao carregar o mapa:', err));
    }
  }, [initialNodes.length]);

  useEffect(() => {
    // Navigation remounts this view (see viewEpoch in App): here only the same session moves forward
    if (currentSession) {
      setSession(currentSession);
      setCurrentQuestion(currentSession.currentQuestion || null);
    }
  }, [currentSession]);

  // These only change on student actions, and the repository already batches disk writes
  useEffect(() => {
    if (!session || !window.api?.saveSessionUi) return;
    void Promise.resolve(window.api.saveSessionUi(session.id, { chatMessages, answeredScope, lessons })).catch((err) => {
      console.error('[SessionView] Falha ao salvar a conversa:', err);
    });
  }, [session?.id, chatMessages, answeredScope, lessons]);

  // Resume teaching of a session restored from disk
  const resumedTeachingRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      session?.phase === 'teaching' &&
      !socraticNode &&
      !isSubmitting &&
      resumedTeachingRef.current !== session.id
    ) {
      resumedTeachingRef.current = session.id;
      void handleStartSocraticCycle();
    }
  }, [session?.id, session?.phase, socraticNode, isSubmitting]);

  // New turn/question/attempt: bring the active question card to its top, otherwise follow the bottom
  // (NEVER on streamingThinking chunks)
  useEffect(() => {
    const timer = setTimeout(() => {
      const card = activeCardRef.current;
      if (card && typeof card.scrollIntoView === 'function') {
        card.scrollIntoView({ behavior: smoothOrInstant(), block: 'start' });
      } else {
        scrollToBottom();
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [
    session?.phase,
    session?.attempts?.length,
    currentQuestion?.id,
    socraticNode?.id,
    socraticStep,
    chatMessages.length,
    isSubmitting,
  ]);

  const refreshGraph = async () => {
    if (window.api?.getGraphState && (session || initialNodes.length > 0)) {
      const updated = await window.api.getGraphState();
      setNodes(updated);
    }
  };

  const cleanError = (err: unknown): string => toDisplayError(err, t('session.err.unexpected'));
  const clearError = (): void => {
    setActionError(null);
    setRetryAction(null);
  };
  /** Shows a failed action's error (a cancel or a session swapped mid-call is not a failure). */
  const reportError = (err: unknown, retry?: () => void): void => {
    if (isSessionChanged(err)) return;
    if (isCancelled(err)) {
      // Without an answer field the screen would be left with nothing to act on
      if (retry) {
        setActionError(t('session.err.cancelled'));
        setRetryAction(() => retry);
      }
      return;
    }
    setActionError(cleanError(err));
    if (retry) setRetryAction(() => retry);
  };

  const handleStartGoal = async (customGoal?: string) => {
    const goalToUse = (customGoal || goalInput).trim();
    if (!goalToUse) return;

    setGoalInput('');
    setAnsweredScope(null);
    setStreamingThinking('');
    const goalMessageId = appendUserChatMessage(goalToUse, -1);
    setSubmittingLabel(t('session.status.scope'));
    setAgentThinking(t('session.thinking.scope'));
    setIsSubmitting(true);
    clearError();
    try {
      const mode = pendingMode || 'teaching';
      const sess = await window.api.startSession(mode, goalToUse);
      setSession(sess);
      if (onSessionUpdate) onSessionUpdate(sess);
      if (onSessionCreated) onSessionCreated(sess);

      if (sess.agentThinking) {
        setAgentThinking(sess.agentThinking);
      } else {
        setAgentThinking(t('session.thinking.scopeReady', { goal: goalToUse }));
      }
    } catch (err: any) {
      reportError(err);
      setGoalInput(goalToUse);
      removeChatMessage(goalMessageId);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestOrientation = async (studentThinking: string, draft: string) => {
    setStreamingThinking('');
    setSubmittingLabel(t('session.status.orientation'));
    setAgentThinking(t('session.status.orientation'));
    setIsSubmitting(true);
    clearError();
    try {
      const updated = await window.api.requestOrientation(studentThinking);
      setSession(updated);
      if (onSessionUpdate) onSessionUpdate(updated);
      setSelectedIdx(null);
    } catch (err: any) {
      reportError(err);
      setBottomChatInput(draft);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectGoalOption = async (option: string, studentThinking: string | undefined, draft: string) => {
    setStreamingThinking('');
    setAnsweredScope({
      questionText: session?.goalClarificationQuestion || '',
      options: session?.goalClarificationOptions || [],
      selectedOption: option,
      thinkingText: studentThinking?.trim(),
    });
    setSubmittingLabel(t('session.status.graph'));
    setAgentThinking(t('session.thinking.graph'));
    setIsSubmitting(true);
    clearError();
    try {
      const q = await window.api.submitGoalClarification(option, studentThinking?.trim());
      await refreshGraph();
      setCurrentQuestion(q);
      setSession((prev) =>
        prev
          ? {
              ...prev,
              goal: option,
              phase: 'probing',
              questionCount: 1,
              currentQuestion: q,
            }
          : null
      );
      if (window.api?.getSession) {
        const updated = await window.api.getSession();
        if (updated) {
          setSession(updated);
          if (onSessionUpdate) onSessionUpdate(updated);
        }
      }
      if (q.agentThinking) {
        setAgentThinking(q.agentThinking);
      } else {
        setAgentThinking(t('session.thinking.graphReady', { scope: option, concept: q.anchorConcept }));
      }
    } catch (err: any) {
      reportError(err);
      // Back to the choice: the focus only counts once the map exists
      setAnsweredScope(null);
      setBottomChatInput(draft);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProbeSubmit = async (
    data: {
      selectedOptionIndex: number;
      answerKind?: ProbeAnswerKind;
      confidence?: number;
      thinkingText: string;
    },
    draft: string
  ) => {
    setStreamingThinking('');
    // Show the answered question right away (before the AI starts thinking), without the verdict
    if (currentQuestion) {
      setPendingAttempt({
        questionId: currentQuestion.id,
        nodeId: currentQuestion.nodeId,
        questionText: currentQuestion.questionText,
        options: currentQuestion.options,
        correctOptionIndex: currentQuestion.correctOptionIndex,
        selectedOptionIndex: data.selectedOptionIndex,
        ...(data.answerKind === 'own_answer' ? { answerKind: data.answerKind } : {}),
        confidence: data.confidence,
        thinkingText: data.thinkingText,
        verdict: 'frontier',
        judgeReasoning: '',
      } as ProbeAttempt);
    } else {
      setPendingAttempt(null);
    }
    setSubmittingLabel(t('session.status.judge'));
    setAgentThinking(t('session.thinking.judge'));
    setIsSubmitting(true);
    clearError();
    try {
      const result = await window.api.submitProbeAnswer(data);
      await refreshGraph();
      setSession(result.session);
      if (onSessionUpdate) onSessionUpdate(result.session);

      if (result.nextAction === 'transition_plan') {
        setCurrentQuestion(null);
        setActiveTab('session');
        setAgentThinking(
          result.session.agentThinking ||
            t('session.thinking.probeDone', { count: result.session.questionCount })
        );
      } else if (result.nextQuestion) {
        setCurrentQuestion(result.nextQuestion);
        setAgentThinking(
          result.nextQuestion.agentThinking ||
            result.session.agentThinking ||
            result.attempt.judgeReasoning
        );
      }
    } catch (err: any) {
      reportError(err);
      setBottomChatInput(draft);
    } finally {
      setIsSubmitting(false);
      setPendingAttempt(null);
    }
  };

  const handleAdvanceToPlan = async () => {
    setSubmittingLabel(t('session.status.plan'));
    setIsSubmitting(true);
    clearError();
    try {
      const sess = await window.api.advanceToPlan();
      setSession(sess);
      if (onSessionUpdate) onSessionUpdate(sess);
      setCurrentQuestion(null);
      setActiveTab('session');
      setAgentThinking(t('session.thinking.planReady'));
    } catch (err: any) {
      reportError(err, handleAdvanceToPlan);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmPlan = async () => {
    setSubmittingLabel(t('session.status.firstConcept'));
    setIsSubmitting(true);
    clearError();
    try {
      const sess = await window.api.confirmPlan();
      setSession(sess);
      if (onSessionUpdate) onSessionUpdate(sess);
      setIsSubmitting(false);
      // teaching starts via the phase effect below
    } catch (err: any) {
      reportError(err, handleConfirmPlan);
      setIsSubmitting(false);
    }
  };

  const handleStartSocraticCycle = async (nodeId?: string) => {
    setSubmittingLabel(t('session.status.lesson'));
    setIsSubmitting(true);
    clearError();
    try {
      setSocraticStep('predict');
      setCheckResult(null);
      setCheckQuestion(null);
      setTeachProse('');
      const data = await window.api.startSocraticStep(nodeId);
      if (!data) {
        // Every pending concept already had its turn: end the pass instead of looping on a failed one
        setSocraticNode(null);
        setSocraticPredictData(null);
        setTeachingFinished(true);
        setActiveTab('session');
        return;
      }
      setTeachingFinished(false);
      setSocraticNode(data.node);
      setSocraticPredictData({
        questionText: data.questionText,
        promptGoal: data.promptGoal,
      });
      setActiveTab('session');
    } catch (err: any) {
      reportError(err, () => void handleStartSocraticCycle(nodeId));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePredictSubmit = async (text: string) => {
    setSubmittingLabel(t('session.status.teach'));
    setSocraticLoading(true);
    clearError();
    try {
      const res = await window.api.submitPrediction(text);
      setPrediction(text);
      setTeachProse(res.teachProse);
      setCheckQuestion(res.checkQuestion);
      setSocraticStep('teach');
    } catch (err: any) {
      reportError(err);
      setBottomChatInput(text);
    } finally {
      setSocraticLoading(false);
    }
  };

  const handleCheckSubmit = async (index: number, conf: number | undefined, reasoning: string) => {
    setSubmittingLabel(t('session.status.judge'));
    setSocraticLoading(true);
    clearError();
    try {
      const res = await window.api.submitCheckAnswer(index, conf, reasoning);
      await refreshGraph();
      if (res.session) setSession(res.session);
      setCheckResult({ isPassed: res.isPassed, repairExplanation: res.repairExplanation });
      if (socraticNode && socraticPredictData) {
        setLessons((prev) => [
          ...prev,
          {
            nodeId: socraticNode.id,
            title: socraticNode.title,
            predictQuestion: socraticPredictData.questionText,
            prediction,
            teachProse,
            checkQuestion: checkQuestion?.questionText || '',
            isPassed: res.isPassed,
            repairExplanation: res.repairExplanation,
          },
        ]);
      }
    } catch (err: any) {
      reportError(err);
      setBottomChatInput(reasoning);
    } finally {
      setSocraticLoading(false);
    }
  };

  const phase = session?.phase || 'goal_orientation';
  const pendingConceptCount = Object.values(session?.nodesState || {}).filter((st) => st !== 'mastered').length;
  const phaseDividerLabel = !session
    ? t('session.divider.new')
    : socraticNode || phase === 'teaching'
    ? t('phase.teaching')
    : phase === 'probing'
    ? t('phase.probing')
    : phase === 'plan_review'
    ? t('phase.plan_review')
    : t('phase.goal_orientation');

  // ---- Active question card (in-flow) + shared chat field ----
  // Hide the active question immediately while isSubmitting is true so answered questions never linger
  const scopeOptions =
    !isSubmitting && !answeredScope && session && phase === 'goal_orientation' && !currentQuestion
      ? session.goalClarificationOptions || []
      : [];
  const isScopeMode = scopeOptions.length > 0;
  const isProbeMode = Boolean(!isSubmitting && session && phase === 'probing' && currentQuestion && !socraticNode);
  const isSocraticPredict = Boolean(!isSubmitting && !socraticLoading && socraticNode && socraticStep === 'predict');
  const isSocraticCheck = Boolean(
    !isSubmitting && !socraticLoading && socraticNode && socraticStep === 'check' && checkQuestion && !checkResult
  );
  const hasDock = isScopeMode || isProbeMode || isSocraticCheck;

  const inputValue = !session ? goalInput : bottomChatInput;
  const setInputValue = !session ? setGoalInput : setBottomChatInput;
  const inputTrimmed = inputValue.trim();
  const hasChosenAnswer = selectedIdx !== null || isDontKnow;

  const canSend =
    !isSubmitting &&
    !socraticLoading &&
    (!session
      ? Boolean(inputTrimmed)
      : isScopeMode
      ? selectedIdx !== null || Boolean(inputTrimmed)
      : isProbeMode
      ? hasChosenAnswer || Boolean(inputTrimmed)
      : isSocraticPredict
      ? Boolean(inputTrimmed)
      : isSocraticCheck
      ? selectedIdx !== null
      : false);

  const inputPlaceholder = !session
    ? t('session.input.goal')
    : isScopeMode
    ? selectedIdx !== null
      ? t('session.input.scopeWhy')
      : t('session.input.scopeCustom')
    : isProbeMode
    ? hasChosenAnswer
      ? t('session.input.probeWhy')
      : t('session.input.probeOwn')
    : isSocraticPredict
    ? t('session.input.predict')
    : isSocraticCheck
    ? t('session.input.check')
    : t('session.input.message');

  const handleDockSubmit = () => {
    if (!canSend) return;

    // No session yet: the chat field defines the initial goal
    if (!session) {
      handleStartGoal(goalInput.trim());
      return;
    }

    const text = bottomChatInput.trim();

    if (isScopeMode) {
      const chosen = selectedIdx !== null ? scopeOptions[selectedIdx] : text;
      const reasoning = selectedIdx !== null ? text : '';
      setBottomChatInput('');
      if (selectedIdx !== null && isOrientationOption(chosen)) {
        handleRequestOrientation(reasoning, text);
        return;
      }
      handleSelectGoalOption(chosen, reasoning, text);
      return;
    }

    if (isProbeMode) {
      const isOwnAnswer = selectedIdx === null && !isDontKnow;
      setBottomChatInput('');
      handleProbeSubmit(
        {
        selectedOptionIndex: selectedIdx !== null ? selectedIdx : -1,
        // -1 alone is ambiguous: tell the judge the student wrote their own answer (vs. "não sei")
        ...(isOwnAnswer ? { answerKind: 'own_answer' as const } : {}),
        confidence: isDontKnow ? undefined : confidence,
        thinkingText: text,
        },
        text
      );
      return;
    }

    if (isSocraticPredict) {
      setBottomChatInput('');
      handlePredictSubmit(text);
      return;
    }

    if (isSocraticCheck && selectedIdx !== null) {
      setBottomChatInput('');
      handleCheckSubmit(selectedIdx, confidence, text);
      return;
    }

  };

  // The field only exists when its text will be used
  const hasAnswerField = !session || hasDock || isSocraticPredict;
  const toggleSelected = (idx: number) => setSelectedIdx((prev) => (prev === idx ? null : idx));

  const handleDictatePill = () => {
    if (onToggleDictate) onToggleDictate();
    else toggleListening();
  };

  const goalTurnMessages = chatMessages.filter((m) => (m.afterAttemptCount ?? -1) < 0);
  const scopeTurnMessages = chatMessages.filter((m) => (m.afterAttemptCount ?? -1) === 0);
  const hasScopeMsg = scopeTurnMessages.length > 0 || Boolean(answeredScope);

  const chatInputBox = (
    <div>
      {/* Input Box with Paperclip and Enter button */}
      <div className="relative flex items-start rounded-xl border border-ink-600 bg-ink-850 px-3.5 py-2.5 shadow-sm focus-within:border-ink-400 transition-colors">
        <textarea
          ref={chatInputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleDockSubmit();
            }
          }}
          placeholder={inputPlaceholder}
          disabled={isSubmitting || socraticLoading}
          rows={isSocraticPredict ? 2 : 1}
          className="flex-1 resize-none bg-transparent text-xs text-gray-200 outline-none placeholder:text-gray-500 font-sans"
          autoFocus
        />

        <div className="flex items-center space-x-2 ml-2 shrink-0">
          <button
            type="button"
            onClick={handleDockSubmit}
            disabled={!canSend}
            className="flex items-center justify-center rounded-lg bg-ink-600 hover:bg-ink-400 p-1.5 text-gray-300 hover:text-white transition-colors disabled:opacity-40"
            title={
              !session
                ? t('session.start')
                : t('session.send')
            }
            aria-label={
              !session
                ? t('session.start')
                : t('session.send')
            }
          >
            <CornerDownLeft className="h-4 w-4" />
            <span className="sr-only">
              {!session
                ? t('session.start')
                : t('session.send')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );

  const statusSubBar = (
    <div className="flex items-center justify-between px-1 text-xs select-none">
      {/* Left side: Tokens info & Dictate pill */}
      <div className="flex items-center space-x-3">
        <span className="font-mono text-[11px] text-gray-500">
          {tokenCount.toLocaleString(localeOf(lang))} tok
          {session
            ? ` · Q: ${session.attempts?.length || 0}/${minQuestions}+`
            : questionCount !== undefined
            ? ` · Q: ${questionCount}/${minQuestions}+`
            : ''}
        </span>

        <button
          type="button"
          onClick={handleDictatePill}
          disabled={isTranscribing || (!hasAnswerField && !isListening)}
          className={`flex items-center space-x-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-mono transition-colors ${
            isListening
              ? 'border-red-600 bg-red-950/60 text-red-400 animate-pulse'
              : 'border-ink-600 bg-ink-850 text-gray-400 hover:border-gray-500 hover:text-gray-200'
          }`}
          title={t('session.dictate.title')}
          aria-label={isListening ? t('session.dictate.listening') : isTranscribing ? t('session.dictate.transcribing') : t('session.dictate.label')}
        >
          <Mic className={`h-3 w-3 ${isListening ? 'text-red-400' : 'text-gray-400'}`} />
          <span>{isListening ? t('session.dictate.listening') : isTranscribing ? t('session.dictate.transcribing') : t('session.dictate.label')}</span>
        </button>
      </div>

      {/* Right side: Model and Thinking pills */}
      <div className="flex items-center space-x-2">
        {/* Model Selector Pill */}
        <div className="relative" ref={modelMenuRef}>
          <button
            type="button"
            onClick={() => setShowModelMenu((prev) => !prev)}
            className="flex items-center space-x-1.5 rounded-full border border-ink-600 bg-ink-850 px-3 py-0.5 text-[11px] font-mono text-gray-300 hover:border-gray-500 hover:text-white transition-colors"
            title={t('session.model.title', { model: modelName })}
          >
            <span className="truncate max-w-[160px]">{modelName}</span>
            <ChevronDown className="h-3 w-3 text-gray-500" />
          </button>

          {showModelMenu && (
            <div
              className="absolute right-0 bottom-full mb-2 w-80 rounded-xl border border-ink-500 bg-ink-850 p-2.5 shadow-2xl z-50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative mb-2">
                <input
                  type="text"
                  placeholder={t('models.search')}
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full rounded-lg border border-ink-500 bg-ink-950 px-3 py-1.5 text-xs font-sans text-white placeholder-gray-500 outline-none focus:border-gray-400"
                />
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                {filteredModels.length === 0 ? (
                  <div className="p-3 text-center text-xs text-gray-500 italic">
                    {t('models.empty')}
                  </div>
                ) : (
                  filteredModels.map((m) => {
                    const isSelected = modelName === m.id;
                    return (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => {
                          if (onChangeModel) onChangeModel(m.id);
                          setShowModelMenu(false);
                          setModelSearchQuery('');
                        }}
                        className={`focus-ring flex w-full cursor-pointer flex-col rounded p-2 text-left text-xs font-sans transition-colors ${
                          isSelected
                            ? 'bg-ink-600 text-white border-l-2 border-emerald-500 pl-2'
                            : 'hover:bg-ink-700 text-gray-300 hover:text-white'
                        }`}
                      >
                        <span className="flex w-full items-center justify-between font-medium">
                          <span className="truncate pr-2 font-semibold text-gray-200">
                            {m.name}
                          </span>
                          <span className="font-mono text-[10px] text-gray-400 shrink-0">
                            {m.price}
                          </span>
                        </span>
                        <span className="block w-full text-[10px] font-mono text-gray-500 truncate mt-0.5">
                          {m.provider} · {m.slug.startsWith('~') ? m.slug : `~${m.slug}`} · {m.context}
                          {m.isReasoning && ` · ${t('models.reasoning')}`}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {onOpenSettings && (
                <div className="border-t border-ink-600 mt-2 pt-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModelMenu(false);
                      setModelSearchQuery('');
                      onOpenSettings();
                    }}
                    className="flex items-center space-x-1.5 w-full text-left px-2 py-1.5 text-[11px] font-mono text-gray-400 hover:text-gray-100 hover:bg-ink-700 rounded-lg transition-colors"
                  >
                    <span>{t('session.model.configure')}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Thinking Level Pill */}
        <div className="relative" ref={thinkingMenuRef}>
          <button
            type="button"
            onClick={() => setShowThinkingMenu((prev) => !prev)}
            className="flex items-center space-x-1.5 rounded-full border border-ink-600 bg-ink-850 px-2.5 py-0.5 text-[11px] font-mono text-gray-300 hover:border-gray-500 hover:text-white transition-colors"
            title={t('session.effort.title', { level: thinkingLevel })}
          >
            <span>{(thinkingLevel || 'high').toLowerCase()}</span>
            <ChevronDown className="h-3 w-3 text-gray-500" />
          </button>

          {showThinkingMenu && (
            <div className="absolute right-0 bottom-full mb-1.5 w-32 rounded-xl border border-ink-600 bg-ink-850 p-1.5 shadow-2xl z-30 font-mono text-xs">
              <div className="px-2 py-1 text-[10px] uppercase font-bold text-gray-500">
                {t('session.effort.label')}
              </div>
              {(['off', 'low', 'medium', 'high'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => {
                    if (onChangeThinkingLevel) onChangeThinkingLevel(lvl);
                    setShowThinkingMenu(false);
                  }}
                  className={`flex w-full items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[11px] transition-colors ${
                    (thinkingLevel || '').toLowerCase() === lvl
                      ? 'bg-emerald-950/80 text-emerald-300 font-bold'
                      : 'text-gray-300 hover:bg-ink-700'
                  }`}
                >
                  <span>{lvl}</span>
                  {(thinkingLevel || '').toLowerCase() === lvl && (
                    <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const isBusy = isSubmitting || socraticLoading;
  const statusRegion = (isBusy || actionError || speechError) && (
    <div data-testid="status-region" className="flex flex-col gap-2">
      {actionError && (
        <ErrorNotice
          message={actionError}
          title={
            /HTTP (402|429)\b/.test(actionError)
              ? t('session.err.limit')
              : /HTTP (401|403)\b/.test(actionError)
              ? t('session.err.key')
              : undefined
          }
          onRetry={retryAction ?? undefined}
          retryLabel={t('session.retry')}
        />
      )}
      {speechError && <ErrorNotice message={speechError} />}
      {isBusy && (
        <BusyStatus
          label={submittingLabel}
          cancelLabel={t('session.cancel')}
          onCancel={() => void window.api.cancelOperation?.()}
        />
      )}
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col bg-ink-950 text-gray-200 relative">
      {/* Top Session Nav Tabs */}
      <div className="flex items-center justify-between border-b border-ink-700 px-6 py-1.5 bg-ink-950">
        <span className="label-mono">{t('session.tabs.label')}</span>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('session')}
            className={`flex items-center space-x-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'session'
                ? 'bg-ink-700 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>{t('session.tabs.chat')}</span>
          </button>

          <button
            onClick={() => {
              refreshGraph();
              setActiveTab('dag');
            }}
            className={`flex items-center space-x-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'dag'
                ? 'bg-ink-700 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>{t('session.tabs.map', { count: nodes.length })}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'dag' ? (
        <div className="flex-1 min-h-0 overflow-hidden p-4">
          <div className="flex h-full min-h-0 flex-col space-y-3">
            {statusRegion}
            <div className="flex items-center justify-between bg-ink-900 p-3 rounded-lg border border-ink-700">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300">
                  {t('session.map.title')}
                </h4>
                <p className="text-[11px] text-gray-400">
                  {phase === 'teaching' || phase === 'plan_review' ? t('session.map.hint') : t('session.map.teachLocked')}
                </p>
              </div>

              <button
                onClick={() => (phase === 'plan_review' ? handleConfirmPlan() : handleStartSocraticCycle())}
                disabled={nodes.length === 0 || isBusy || (phase !== 'teaching' && phase !== 'plan_review')}
                className="flex items-center space-x-1.5 rounded bg-gray-200 px-3.5 py-1.5 text-xs font-semibold text-ink-950 hover:bg-white shadow-sm transition-colors disabled:opacity-40"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>{t('session.map.start')}</span>
              </button>
            </div>

            <div className="flex-1 min-h-0 rounded-lg border border-ink-700 overflow-hidden">
              <KnowledgeGraph
                nodes={nodes}
                goal={session?.goal}
                onStartSocratic={phase === 'teaching' && !isBusy ? (id) => handleStartSocraticCycle(id) : undefined}
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Scrollable Chat Timeline */}
          <div
            ref={feedContainerRef}
            data-testid="chat-feed-scroll"
            className="flex-1 select-text overflow-y-auto px-6 py-5"
          >
            <div className="mx-auto max-w-3xl space-y-6 pb-8">
              {/* Top Phase Pill Divider (Coherent with active phase: PROBING / TEACHING / etc.) */}
              <div className="relative flex items-center justify-center py-1">
                <div className="absolute inset-x-0 border-t border-ink-700" />
                <span className="relative rounded-full border border-ink-600 bg-ink-950 px-3.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-gray-400">
                  {phaseDividerLabel}
                </span>
              </div>

              {/* TURN 0: Initial Empty State & Goal Orientation */}
              {!session ? (
                <div className="space-y-4">
                  {/* Show user message immediately when submitted while starting session */}
                  {goalTurnMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className="rounded-r-md border-l-2 border-ink-400 bg-ink-850/90 px-4 py-2.5 space-y-1"
                    >
                      <span className="block font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                        {t('session.you')}
                      </span>
                      <RichText text={msg.text} className="text-xs text-gray-200 leading-relaxed" />
                    </div>
                  ))}

                  {isSubmitting && (
                    <AgentThinkingBlock
                      thinkingText={streamingThinking || agentThinking}
                      defaultExpanded={true}
                      isStreaming={true}
                      statusLabel={submittingLabel}
                    />
                  )}

                  {!isSubmitting && chatMessages.length === 0 && (
                    <div className="pt-8 space-y-1.5 text-center sm:text-left">
                      <h2 className="text-base font-serif font-bold text-gray-100">
                        {t('session.empty.title')}
                      </h2>
                      <p className="text-xs text-gray-400">{t('session.empty.subtitle')}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 1. Initial goal message ("eu quero aprender sobre...") */}
                  {goalTurnMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className="rounded-r-md border-l-2 border-ink-400 bg-ink-850/90 px-4 py-2.5 space-y-1"
                    >
                      <span className="block font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                        {t('session.you')}
                      </span>
                      <RichText text={msg.text} className="text-xs text-gray-200 leading-relaxed" />
                    </div>
                  ))}

                  {/* 2. Turn 0 AI Thinking (scope orientation reasoning) — only shown during goal_orientation or when separated by a scope message */}
                  {(phase === 'goal_orientation' || hasScopeMsg || Boolean(session.goalThinking)) && (
                    <AgentThinkingBlock
                      thinkingText={
                        isSubmitting && phase === 'goal_orientation' && !hasScopeMsg && streamingThinking
                          ? streamingThinking
                          : session.goalThinking || session.agentThinking || agentThinking
                      }
                      defaultExpanded={phase === 'goal_orientation' && !hasScopeMsg}
                    />
                  )}

                  {/* 3. Answered scope card or custom scope message placed AFTER Turn 0 thinking */}
                  {answeredScope && (
                    <div className="rounded-xl border border-ink-600 bg-ink-850 p-5 shadow-lg space-y-3">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                        {t('session.scope.label')}
                      </span>
                      {answeredScope.questionText && (
                        <RichText
                          text={answeredScope.questionText}
                          className="text-sm font-semibold leading-relaxed text-gray-100"
                        />
                      )}
                      <div className="flex flex-col gap-2">
                        {answeredScope.options.map((opt, idx) => {
                          const isChosen = opt === answeredScope.selectedOption;
                          return (
                            <div
                              key={idx}
                              className={`flex items-center space-x-3 rounded-lg border px-4 py-2 text-xs ${
                                isChosen
                                  ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-100'
                                  : 'border-ink-600 bg-ink-800/60 text-gray-400'
                              }`}
                            >
                              {isChosen ? (
                                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                              ) : (
                                <span className="h-3.5 w-3.5 shrink-0" />
                              )}
                              <RichText text={opt} className="leading-snug" />
                            </div>
                          );
                        })}
                        {!answeredScope.options.includes(answeredScope.selectedOption) && (
                          <div className="flex items-center space-x-3 rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-4 py-2 text-xs text-emerald-100">
                            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                            <RichText text={answeredScope.selectedOption} className="leading-snug" />
                          </div>
                        )}
                      </div>
                      {answeredScope.thinkingText && (
                        <div className="border-l-2 border-ink-500 pl-3 pt-0.5">
                          <span className="block font-mono text-[10px] uppercase tracking-widest text-gray-400">
                            {t('session.yourReasoning')}
                          </span>
                          <RichText
                            text={answeredScope.thinkingText}
                            className="mt-1 text-xs text-gray-300 leading-relaxed"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {scopeTurnMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className="rounded-r-md border-l-2 border-ink-400 bg-ink-850/90 px-4 py-2.5 space-y-1"
                    >
                      <span className="block font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                        {t('session.you')}
                      </span>
                      <RichText text={msg.text} className="text-xs text-gray-200 leading-relaxed" />
                    </div>
                  ))}

                  {/* 4. Streaming thinking while building DAG & 1st question after scope selection */}
                  {phase === 'goal_orientation' && !currentQuestion && isSubmitting && hasScopeMsg && (
                    <div className="border-t border-ink-700 pt-5 space-y-4">
                      <AgentThinkingBlock
                        thinkingText={streamingThinking || agentThinking}
                        defaultExpanded={true}
                        isStreaming={true}
                        statusLabel={submittingLabel}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* HISTORICAL ANSWERED QUESTIONS IN THE CHAT FEED */}
              {session?.attempts &&
                session.attempts.map((attempt, idx) => {
                  const turnThinking = attempt.agentThinking;
                  const turnMessages = chatMessages.filter((m) => m.afterAttemptCount === idx + 1);

                  return (
                    <div key={`${attempt.questionId}-${idx}`} className="space-y-3 border-t border-ink-700 pt-4">
                      {turnThinking && (
                        <AgentThinkingBlock thinkingText={turnThinking} defaultExpanded={false} />
                      )}
                      <AnsweredQuestionCard attempt={attempt} index={idx} />
                      {turnMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className="rounded-r-md border-l-2 border-ink-400 bg-ink-850/90 px-4 py-2.5 space-y-1"
                        >
                          <span className="block font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                            {t('session.you')}
                          </span>
                          <RichText text={msg.text} className="text-xs text-gray-200 leading-relaxed" />
                        </div>
                      ))}
                    </div>
                  );
                })}

              {/* Any user messages sent during the current active turn */}
              {session &&
                (session.attempts?.length || 0) > 0 &&
                chatMessages
                  .filter((m) => (m.afterAttemptCount || 0) > (session.attempts?.length || 0))
                  .map((msg) => (
                    <div
                      key={msg.id}
                      className="rounded-r-md border-l-2 border-ink-400 bg-ink-850/90 px-4 py-2.5 space-y-1"
                    >
                      <span className="block font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                        {t('session.you')}
                      </span>
                      <RichText text={msg.text} className="text-xs text-gray-200 leading-relaxed" />
                    </div>
                  ))}

              {/* ACTIVE QUESTION TURN (Probing Phase) */}
              {phase === 'probing' && currentQuestion && !socraticNode && (
                <div className="space-y-4 border-t border-ink-700 pt-4">
                  {isSubmitting && pendingAttempt && (
                    <AnsweredQuestionCard attempt={pendingAttempt} index={session?.attempts?.length || 0} pending />
                  )}
                  <AgentThinkingBlock
                    thinkingText={
                      isSubmitting
                        ? streamingThinking || agentThinking
                        : currentQuestion.agentThinking ||
                          session?.agentThinking ||
                          agentThinking
                    }
                    defaultExpanded={true}
                    isStreaming={isSubmitting}
                    statusLabel={submittingLabel}
                  />

                  {session && (session.attempts?.length || 0) >= minQuestions && !isSubmitting && (
                    <div className="mx-auto max-w-2xl flex items-center justify-between rounded-lg border border-blue-900/60 bg-blue-950/20 p-3.5 text-xs text-blue-300 shadow-sm">
                      <span>
                        {t('session.floor.reached', { count: session.attempts.length })}
                      </span>
                      <button
                        onClick={handleAdvanceToPlan}
                        className="rounded bg-gray-200 px-3.5 py-1.5 text-xs font-semibold text-ink-950 hover:bg-white shadow-sm transition-colors"
                      >
                        {t('session.floor.button')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* PLAN REVIEW */}
              {phase === 'plan_review' && !socraticNode && (
                <div className="space-y-4 border-t border-ink-700 pt-4">
                  <AgentThinkingBlock thinkingText={agentThinking} defaultExpanded={false} />
                  <div className="flex flex-col gap-5 rounded-xl border border-ink-600 bg-ink-850 p-6 shadow-xl">
                    <div className="flex items-center space-x-2.5 border-b border-ink-600 pb-4">
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      <h2 className="text-base font-bold text-white font-serif">{t('session.plan.title')}</h2>
                    </div>
                    <RichText text={session?.plan || ''} className="text-sm text-gray-200 leading-relaxed" />
                    <div className="flex items-center justify-between gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          refreshGraph();
                          setActiveTab('dag');
                        }}
                        className="flex items-center space-x-2 rounded border border-ink-500 px-4 py-2.5 text-xs font-semibold text-gray-300 transition-colors hover:border-gray-400 hover:text-white"
                      >
                        <BarChart3 className="h-4 w-4" />
                        <span>{t('session.plan.viewMap')}</span>
                      </button>
                      <button
                        onClick={handleConfirmPlan}
                        className="flex items-center space-x-2 rounded bg-gray-200 px-5 py-2.5 text-xs font-semibold text-ink-950 hover:bg-white transition-colors shadow-md"
                      >
                        <Sparkles className="h-4 w-4" />
                        <span>{t('session.plan.start')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Lessons already finished, kept for rereading */}
              {lessons
                .filter((_l, i) => !(socraticNode && checkResult && i === lessons.length - 1))
                .map((lesson, i) => (
                  <details
                    key={`${lesson.nodeId}-${i}`}
                    data-testid="past-lesson"
                    className="rounded-lg border border-ink-700 bg-ink-900 px-4 py-2.5 text-xs text-gray-300"
                  >
                    <summary className="cursor-pointer font-mono text-[11px] text-gray-400 hover:text-gray-200">
                      {lesson.title} · {lesson.isPassed ? t('lesson.pastPassed') : t('lesson.pastFailed')}
                    </summary>
                    <div className="mt-3 space-y-3 leading-relaxed">
                      <RichText text={lesson.predictQuestion} className="text-gray-200" />
                      {lesson.prediction && (
                        <div className="border-l-2 border-ink-500 pl-3">
                          <span className="block font-mono text-[10px] uppercase tracking-widest text-gray-400">
                            {t('lesson.yourPrediction')}
                          </span>
                          <RichText text={lesson.prediction} className="mt-1" />
                        </div>
                      )}
                      <RichText text={lesson.teachProse} />
                      {lesson.checkQuestion && <RichText text={lesson.checkQuestion} className="font-semibold text-gray-200" />}
                      {lesson.repairExplanation && <RichText text={lesson.repairExplanation} className="text-amber-200" />}
                    </div>
                  </details>
                ))}

              {/* SOCRATIC TEACHING PHASE */}
              {socraticNode && socraticPredictData && (
                <div className="space-y-4 border-t border-ink-700 pt-4">
                  <AgentThinkingBlock
                    thinkingText={t('session.thinking.lesson', { concept: socraticNode.title })}
                    defaultExpanded={true}
                  />
                  <SocraticCard
                    key={socraticNode.id}
                    node={socraticNode}
                    step={socraticStep}
                    predictQuestion={socraticPredictData.questionText}
                    promptGoal={socraticPredictData.promptGoal}
                    teachProse={teachProse}
                    prediction={prediction}
                    checkResult={checkResult}
                    isLoading={socraticLoading}
                    onAdvanceToCheck={() => setSocraticStep('check')}
                    onFinishStep={async () => {
                      setSocraticNode(null);
                      setSocraticPredictData(null);
                      await refreshGraph();
                      // The main process picks the next pending concept (or reports that the pass is over)
                      await handleStartSocraticCycle();
                    }}
                  />
                </div>
              )}

              {/* End of the teaching pass */}
              {phase === 'teaching' && teachingFinished && !socraticNode && !isSubmitting && (
                <div
                  data-testid="teaching-finished"
                  className="space-y-3 rounded-xl border border-ink-600 bg-ink-850 p-5 shadow-lg"
                >
                  <div className="flex items-center space-x-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-sm font-bold text-white font-serif">{t('session.passDone.title')}</h3>
                  </div>
                  <p className="text-xs leading-relaxed text-gray-300">
                    {pendingConceptCount === 0
                      ? t('session.passDone.all')
                      : pendingConceptCount === 1
                      ? t('session.passDone.one')
                      : t('session.passDone.many', { count: pendingConceptCount })}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      refreshGraph();
                      setActiveTab('dag');
                    }}
                    className="flex items-center space-x-2 rounded border border-ink-500 px-4 py-2 text-xs font-semibold text-gray-300 transition-colors hover:border-gray-400 hover:text-white"
                  >
                    <BarChart3 className="h-4 w-4" />
                    <span>{t('session.passDone.openMap')}</span>
                  </button>
                </div>
              )}

              {hasDock && (
                <div ref={activeCardRef} className="scroll-mt-4">
                  <ProbeCard
                    confidence={(isProbeMode && !isDontKnow) || isSocraticCheck ? confidence : undefined}
                    onConfidenceChange={setConfidence}
                    reasoning={inputValue}
                    onReasoningChange={setInputValue}
                    placeholder={inputPlaceholder}
                    canSend={canSend}
                    disabled={isSubmitting || socraticLoading}
                    onSubmit={handleDockSubmit}
                    textareaRef={chatInputRef}
                  >
                    {isScopeMode && session && (
                      <QuestionCard
                        label={t('session.scope.label')}
                        questionText={session.goalClarificationQuestion || ''}
                        options={scopeOptions}
                        selectedIndex={selectedIdx}
                        onSelect={toggleSelected}
                        dashedOption={{
                          label: t('session.input.scopeCustom'),
                          selected: selectedIdx === null && Boolean(bottomChatInput.trim()),
                          onSelect: () => {
                            setSelectedIdx(null);
                            chatInputRef.current?.focus();
                          },
                        }}
                      />
                    )}
                    {isProbeMode && currentQuestion && (
                      <QuestionCard
                        label={t('session.probe.label', { n: session?.questionCount || 1 })}
                        anchor={currentQuestion.anchorConcept}
                        questionText={currentQuestion.questionText}
                        options={currentQuestion.options}
                        selectedIndex={selectedIdx}
                        onSelect={(idx) => {
                          toggleSelected(idx);
                          if (isDontKnow) {
                            setIsDontKnow(false);
                            setConfidence(DEFAULT_CONFIDENCE);
                          }
                        }}
                        dashedOption={{
                          label: t('session.probe.dontKnow'),
                          selected: isDontKnow,
                          tone: 'amber',
                          onSelect: () => {
                            setIsDontKnow(true);
                            setSelectedIdx(null);
                            setConfidence(0);
                          },
                        }}
                      />
                    )}
                    {isSocraticCheck && checkQuestion && (
                      <QuestionCard
                        label={t('session.check.label')}
                        questionText={checkQuestion.questionText}
                        options={checkQuestion.options}
                        selectedIndex={selectedIdx}
                        onSelect={toggleSelected}
                      />
                    )}
                  </ProbeCard>
                </div>
              )}

              <div ref={feedEndRef} aria-hidden />
            </div>
          </div>

          {/* Bottom bar: shared chat field (when no question card is open) + status footer */}
          <div className="shrink-0 bg-ink-950 px-6 pb-3 pt-2">
            <div className="mx-auto flex max-w-3xl flex-col gap-2">
              {statusRegion}
              {!hasDock && hasAnswerField && chatInputBox}
              {statusSubBar}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
