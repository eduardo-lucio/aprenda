import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChatTurnMessage,
  CheckQuestionData,
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
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { KnowledgeGraph } from '../components/KnowledgeGraph';
import { DEFAULT_CONFIDENCE, MIN_PROBE_QUESTIONS, PersistedUi, clampProbeQuestions } from '../../shared/types';
import {
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  BarChart3,
  BookOpen,
  Award,
  RefreshCw,
  AlertCircle,
  Send,
  CornerDownLeft,
  Paperclip,
  Mic,
  ChevronDown,
  Check,
  X,
} from 'lucide-react';

interface SessionViewProps {
  initialNodes?: ConceptNode[];
  currentSession?: ProbingSession | null;
  restoredUi?: PersistedUi | null;
  pendingMode?: 'teaching' | 'practice' | null;
  onSessionUpdate?: (session: ProbingSession) => void;
  onSessionCreated?: (session: ProbingSession) => void;
  modelName?: string;
  thinkingLevel?: string;
  tokenCount?: number;
  questionCount?: number;
  minQuestions?: number;
  isRecording?: boolean;
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
  modelName = 'gemini-2.0-flash',
  thinkingLevel = 'High',
  tokenCount = 0,
  questionCount,
  minQuestions: minQuestionsProp,
  isRecording = false,
  onToggleDictate,
  onOpenSettings,
  onChangeThinkingLevel,
  onChangeModel,
  availableModels = [],
}) => {
  const [activeTab, setActiveTab] = useState<'session' | 'dag'>('session');
  const [nodes, setNodes] = useState<ConceptNode[]>(initialNodes);
  const [session, setSession] = useState<ProbingSession | null>(currentSession);
  const [goalInput, setGoalInput] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(
    currentSession?.currentQuestion || null
  );
  const [agentThinking, setAgentThinking] = useState<string>(
    'Aguardando definição do seu objetivo de aprendizado para estruturar o grafo de dependências conceituais...'
  );
  const [socraticNode, setSocraticNode] = useState<ConceptNode | null>(null);
  const [socraticPredictData, setSocraticPredictData] = useState<{
    questionText: string;
    promptGoal?: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingAttempt, setPendingAttempt] = useState<ProbeAttempt | null>(null);
  const [submittingLabel, setSubmittingLabel] = useState<string>('');
  const [customScopeInput, setCustomScopeInput] = useState('');
  const [bottomChatInput, setBottomChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatTurnMessage[]>([]);
  const [streamingThinking, setStreamingThinking] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [answeredScope, setAnsweredScope] = useState<{
    questionText: string;
    options: string[];
    selectedOption: string;
    thinkingText?: string;
  } | null>(null);

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
  const [checkQuestion, setCheckQuestion] = useState<CheckQuestionData | null>(null);
  const [checkResult, setCheckResult] = useState<{ isPassed: boolean; repairExplanation?: string } | null>(null);
  const [socraticLoading, setSocraticLoading] = useState(false);
  // True once the teaching pass has gone through every concept that was still pending
  const [teachingFinished, setTeachingFinished] = useState(false);
  useEffect(() => {
    setTeachingFinished(false);
  }, [session?.id]);

  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const hasSessionRef = useRef(false);
  hasSessionRef.current = Boolean(session);

  const {
    isListening,
    isTranscribing,
    toggleListening,
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

  const appendUserChatMessage = (text: string, afterAttemptCount = session?.attempts?.length || 0) => {
    const clean = text.trim();
    if (!clean) return;
    setChatMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'user',
        text: clean,
        afterAttemptCount,
        timestamp: Date.now(),
      },
    ]);
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
    setCheckQuestion(null);
    setCheckResult(null);
  }, [socraticNode?.id]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = feedContainerRef.current;
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior });
    } else if (feedEndRef.current && typeof feedEndRef.current.scrollIntoView === 'function') {
      feedEndRef.current.scrollIntoView({ behavior, block: 'nearest' });
    }
  };

  useEffect(() => {
    if (window.api?.getGraphState && initialNodes.length === 0) {
      window.api.getGraphState().then((g) => setNodes(g));
    }
  }, [initialNodes.length]);

  useEffect(() => {
    if (currentSession !== undefined) {
      setSession(currentSession);
      if (currentSession) {
        setCurrentQuestion(currentSession.currentQuestion || null);
        if (currentSession.phase === 'goal_orientation') {
          setSocraticNode(null);
          setSocraticPredictData(null);
          setActiveTab('session');
        }
      } else {
        setCurrentQuestion(null);
        setSocraticNode(null);
        setSocraticPredictData(null);
        setGoalInput('');
        uiOwnerRef.current = null;
        setChatMessages([]);
        setAnsweredScope(null);
        setStreamingThinking('');
        setActiveTab('session');
        if (initialNodes.length === 0) {
          setNodes([]);
        }
      }
    }
  }, [currentSession, initialNodes.length]);

  // Restore chat messages of a session loaded from disk
  const uiOwnerRef = useRef<string | null>(null);
  useEffect(() => {
    if (!restoredUi || !currentSession) return;
    uiOwnerRef.current = currentSession.id;
    setChatMessages(restoredUi.chatMessages || []);
    setAnsweredScope(restoredUi.answeredScope || null);
  }, [restoredUi, currentSession?.id]);

  // Persist chat messages (debounced; the timer of a stale render is cancelled by the next one)
  useEffect(() => {
    if (!session || !window.api?.saveSessionUi) return;
    if (uiOwnerRef.current && uiOwnerRef.current !== session.id) return;
    if (chatMessages.length === 0 && !answeredScope) return;
    const id = session.id;
    const timer = setTimeout(() => {
      uiOwnerRef.current = id;
      window.api.saveSessionUi(id, { chatMessages, answeredScope });
    }, 300);
    return () => clearTimeout(timer);
  }, [session?.id, chatMessages, answeredScope]);

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
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    chatMessages.length,
    isSubmitting,
  ]);

  const refreshGraph = async () => {
    if (window.api?.getGraphState) {
      const updated = await window.api.getGraphState();
      setNodes(updated);
    }
  };

  const cleanError = (err: any): string =>
    String(err?.message || err || 'Erro inesperado').replace(
      /^Error invoking remote method '[^']+': (Error: )?/,
      ''
    );

  const handleStartGoal = async (customGoal?: string) => {
    const goalToUse = (customGoal || goalInput).trim();
    if (!goalToUse) return;

    setGoalInput('');
    setCustomScopeInput('');
    setAnsweredScope(null);
    setStreamingThinking('');
    appendUserChatMessage(goalToUse, -1);
    setSubmittingLabel('Definindo objetivo e preparando opções de escopo...');
    setAgentThinking('Analisando o tema em tempo real...');
    setIsSubmitting(true);
    setActionError(null);
    try {
      const mode = pendingMode || 'teaching';
      const sess = await window.api.startSession(mode, goalToUse);
      setSession(sess);
      if (onSessionUpdate) onSessionUpdate(sess);
      if (onSessionCreated) onSessionCreated(sess);

      if (sess.agentThinking) {
        setAgentThinking(sess.agentThinking);
      } else {
        setAgentThinking(
          `Objetivo registrado (${mode.toUpperCase()}): "${goalToUse}". Estruturei os recortes de escopo abaixo. Assim que o estudante escolher o foco, construirei o grafo de dependências conceituais e iniciarei a sondagem.`
        );
      }
    } catch (err: any) {
      setActionError(cleanError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectGoalOption = async (option: string, studentThinking?: string) => {
    setCustomScopeInput('');
    setStreamingThinking('');
    if (session?.goalClarificationOptions?.length) {
      setAnsweredScope({
        questionText: session.goalClarificationQuestion || '',
        options: session.goalClarificationOptions,
        selectedOption: option,
        thinkingText: studentThinking?.trim(),
      });
    } else {
      const userMsg = studentThinking?.trim()
        ? `${option}\n\n[Raciocínio]: ${studentThinking.trim()}`
        : option;
      appendUserChatMessage(userMsg, 0);
    }
    setSubmittingLabel('Construindo o Grafo de Dependências e preparando a 1ª questão...');
    setAgentThinking('Estruturando o grafo do nível básico ao avançado em tempo real...');
    setIsSubmitting(true);
    setActionError(null);
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
        setAgentThinking(
          `Foco afunilado para "${option}". Grafo de dependências gerado. Começando a sondagem pelo nó de base "${q.anchorConcept}" para verificar os fundamentos.`
        );
      }
    } catch (err: any) {
      setActionError(cleanError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProbeSubmit = async (data: {
    selectedOptionIndex: number;
    answerKind?: ProbeAnswerKind;
    confidence?: number;
    thinkingText: string;
  }) => {
    setStreamingThinking('');
    // Show the full answered question right away (before the AI starts thinking)
    if (currentQuestion) {
      const correct = data.selectedOptionIndex === currentQuestion.correctOptionIndex;
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
        verdict: correct ? 'mastered' : 'frontier',
        judgeReasoning: '',
      } as ProbeAttempt);
    } else {
      setPendingAttempt(null);
    }
    setSubmittingLabel('O Juiz Cognitivo está analisando seu raciocínio em tempo real...');
    setAgentThinking('Avaliando a resposta do estudante em tempo real...');
    setIsSubmitting(true);
    setActionError(null);
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
            `Sondagem concluída (${result.session.questionCount} questões avaliadas). Montei um plano de ensino a partir do que a sondagem mostrou.`
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
      setActionError(cleanError(err));
    } finally {
      setIsSubmitting(false);
      setPendingAttempt(null);
    }
  };

  const handleAdvanceToPlan = async () => {
    setSubmittingLabel('Montando o plano de ensino...');
    setIsSubmitting(true);
    setActionError(null);
    try {
      const sess = await window.api.advanceToPlan();
      setSession(sess);
      if (onSessionUpdate) onSessionUpdate(sess);
      setCurrentQuestion(null);
      setActiveTab('session');
      setAgentThinking(
        'Sondagem concluída. Plano de ensino pronto para sua revisão.'
      );
    } catch (err: any) {
      setActionError(cleanError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmPlan = async () => {
    setSubmittingLabel('Preparando o primeiro conceito...');
    setIsSubmitting(true);
    setActionError(null);
    try {
      const sess = await window.api.confirmPlan();
      setSession(sess);
      if (onSessionUpdate) onSessionUpdate(sess);
      setIsSubmitting(false);
      // teaching starts via the phase effect below
    } catch (err: any) {
      setActionError(cleanError(err));
      setIsSubmitting(false);
    }
  };

  const handleStartSocraticCycle = async (nodeId?: string) => {
    setSubmittingLabel('Preparando etapa socrática (Predição)...');
    setIsSubmitting(true);
    setActionError(null);
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
      setActionError(cleanError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePredictSubmit = async (text: string) => {
    setSocraticLoading(true);
    setActionError(null);
    try {
      const res = await window.api.submitPrediction(text);
      setTeachProse(res.teachProse);
      setCheckQuestion(res.checkQuestion);
      setSocraticStep('teach');
    } catch (err: any) {
      setActionError(cleanError(err));
    } finally {
      setSocraticLoading(false);
    }
  };

  const handleCheckSubmit = async (index: number, conf?: number, reasoning?: string) => {
    setSocraticLoading(true);
    setActionError(null);
    try {
      const res = await window.api.submitCheckAnswer(index, conf, reasoning);
      await refreshGraph();
      if (res.session) setSession(res.session);
      setCheckResult({ isPassed: res.isPassed, repairExplanation: res.repairExplanation });
    } catch (err: any) {
      setActionError(cleanError(err));
    } finally {
      setSocraticLoading(false);
    }
  };

  const phase = session?.phase || 'goal_orientation';
  const pendingConceptCount = Object.values(session?.nodesState || {}).filter((st) => st !== 'mastered').length;
  const modeLabel = (session?.mode || pendingMode || 'teaching').toUpperCase();
  const phaseDividerLabel = !session
    ? modeLabel
    : socraticNode || phase === 'teaching'
    ? 'TEACHING'
    : phase === 'probing'
    ? 'PROBING'
    : phase === 'plan_review'
    ? 'PLAN'
    : 'ORIENTATION';

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
      : Boolean(inputTrimmed));

  const inputPlaceholder = !session
    ? 'Ex: Digite o tema ou disciplina que deseja estudar...'
    : isScopeMode
    ? selectedIdx !== null
      ? 'Por que esse recorte? (opcional)'
      : 'Insira um escopo personalizado...'
    : isProbeMode
    ? hasChosenAnswer
      ? 'Explique seu raciocínio (opcional)...'
      : 'Digite seu pensamento ou sua própria resposta...'
    : isSocraticPredict
    ? 'Digite sua previsão...'
    : isSocraticCheck
    ? 'Raciocínio (opcional) — escolha uma alternativa e envie...'
    : 'Digite uma mensagem...';

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
      handleSelectGoalOption(chosen, reasoning);
      return;
    }

    if (isProbeMode) {
      const isOwnAnswer = selectedIdx === null && !isDontKnow;
      setBottomChatInput('');
      handleProbeSubmit({
        selectedOptionIndex: selectedIdx !== null ? selectedIdx : -1,
        // -1 alone is ambiguous: tell the judge the student wrote their own answer (vs. "não sei")
        ...(isOwnAnswer ? { answerKind: 'own_answer' as const } : {}),
        confidence: isDontKnow ? undefined : confidence,
        thinkingText: isOwnAnswer
          ? `[Resposta própria] ${text}`
          : text ||
            (isDontKnow
              ? 'Não sei responder esta questão / ainda não domino o conceito.'
              : '(O aluno não explicou o raciocínio.)'),
      });
      return;
    }

    if (isSocraticPredict) {
      setBottomChatInput('');
      appendUserChatMessage(text);
      handlePredictSubmit(text);
      return;
    }

    if (isSocraticCheck && selectedIdx !== null) {
      setBottomChatInput('');
      if (text) appendUserChatMessage(text);
      handleCheckSubmit(selectedIdx, confidence, text);
      return;
    }

    // Any other phase: just a message in the feed
    setBottomChatInput('');
    appendUserChatMessage(text, session.attempts?.length || 0);
  };

  const handleDictatePill = () => {
    if (onToggleDictate) onToggleDictate();
    else toggleListening();
  };

  // Stats counters for diagnosis view
  const masteredCount = nodes.filter((n) => n.status === 'mastered').length;
  const falsePositiveCount = nodes.filter((n) => n.status === 'false_positive').length;
  const blindSpotCount = nodes.filter((n) => n.status === 'blind_spot').length;
  const frontierCount = nodes.filter((n) => n.status === 'frontier').length;

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
            title="Anexo"
            aria-label="Anexar arquivo"
            className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleDockSubmit}
            disabled={!canSend}
            className="flex items-center justify-center rounded-lg bg-ink-600 hover:bg-ink-400 p-1.5 text-gray-300 hover:text-white transition-colors disabled:opacity-40"
            title={
              !session
                ? (pendingMode === 'practice' ? 'Iniciar Prática' : 'Iniciar Diagnóstico')
                : 'Enviar'
            }
            aria-label={
              !session
                ? (pendingMode === 'practice' ? 'Iniciar Prática' : 'Iniciar Diagnóstico')
                : 'Enviar'
            }
          >
            <CornerDownLeft className="h-4 w-4" />
            <span className="sr-only">
              {!session
                ? (pendingMode === 'practice' ? 'Iniciar Prática' : 'Iniciar Diagnóstico')
                : 'Enviar'}
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
          {tokenCount.toLocaleString()} tok
          {session
            ? ` · Q: ${session.questionCount || 0}/${minQuestions}+`
            : questionCount !== undefined
            ? ` · Q: ${questionCount}/${minQuestions}+`
            : ''}
        </span>

        <button
          type="button"
          onClick={handleDictatePill}
          disabled={isTranscribing}
          className={`flex items-center space-x-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-mono transition-colors ${
            isListening
              ? 'border-red-600 bg-red-950/60 text-red-400 animate-pulse'
              : 'border-ink-600 bg-ink-850 text-gray-400 hover:border-gray-500 hover:text-gray-200'
          }`}
          title="Ativar/Desativar Ditado por Voz"
          aria-label={isListening ? 'Ouvindo...' : isTranscribing ? 'Transcrevendo...' : 'Dictate'}
        >
          <Mic className={`h-3 w-3 ${isListening ? 'text-red-400' : 'text-gray-400'}`} />
          <span>{isListening ? 'Ouvindo...' : isTranscribing ? 'Transcrevendo...' : 'Dictate'}</span>
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
            title={`Modelo: ${modelName}. Clique para alterar.`}
          >
            <span className="truncate max-w-[160px]">{modelName}</span>
            <ChevronDown className="h-3 w-3 text-gray-500" />
          </button>

          {showModelMenu && (
            <div
              className="absolute right-0 bottom-full mb-2 w-80 rounded-xl border border-ink-500 bg-ink-850 p-2.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative mb-2">
                <input
                  type="text"
                  placeholder="Search models..."
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full rounded-lg border border-ink-500 bg-ink-950 px-3 py-1.5 text-xs font-sans text-white placeholder-gray-500 outline-none focus:border-gray-400"
                />
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                {filteredModels.length === 0 ? (
                  <div className="p-3 text-center text-xs text-gray-500 italic">
                    Nenhum modelo encontrado.
                  </div>
                ) : (
                  filteredModels.map((m) => {
                    const isSelected = modelName === m.id;
                    return (
                      <div
                        key={m.id}
                        onClick={() => {
                          if (onChangeModel) onChangeModel(m.id);
                          setShowModelMenu(false);
                          setModelSearchQuery('');
                        }}
                        className={`flex cursor-pointer flex-col rounded p-2 text-xs font-sans transition-colors ${
                          isSelected
                            ? 'bg-ink-600 text-white border-l-2 border-emerald-500 pl-2'
                            : 'hover:bg-ink-700 text-gray-300 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between font-medium">
                          <span className="truncate pr-2 font-semibold text-gray-200">
                            {m.name}
                          </span>
                          <span className="font-mono text-[10px] text-gray-400 shrink-0">
                            {m.price}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-gray-500 truncate mt-0.5">
                          {m.provider} · {m.slug.startsWith('~') ? m.slug : `~${m.slug}`} · {m.context}
                          {m.isReasoning && ' · (Reasoning)'}
                        </div>
                      </div>
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
                    <span>⚙ Configurar modelos...</span>
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
            title={`Thinking: ${thinkingLevel}. Clique para alterar.`}
          >
            <span>{(thinkingLevel || 'high').toLowerCase()}</span>
            <ChevronDown className="h-3 w-3 text-gray-500" />
          </button>

          {showThinkingMenu && (
            <div className="absolute right-0 bottom-full mb-1.5 w-32 rounded-xl border border-ink-600 bg-ink-850 p-1.5 shadow-2xl z-30 font-mono text-xs">
              <div className="px-2 py-1 text-[10px] uppercase font-bold text-gray-500">
                Thinking
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

  return (
    <div className="flex h-full w-full flex-col bg-ink-950 text-gray-200 relative">
      {/* Top Session Nav Tabs */}
      <div className="flex items-center justify-between border-b border-ink-700 px-6 py-1.5 bg-ink-950">
        <span className="label-mono">Sessão</span>

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
            <span>Chat Socrático</span>
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
            <span>Mapa de conceitos ({nodes.length})</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'dag' ? (
        <div className="flex-1 min-h-0 overflow-hidden p-4">
          <div className="flex h-full min-h-0 flex-col space-y-3">
            <div className="flex items-center justify-between bg-ink-900 p-3 rounded-lg border border-ink-700">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300">
                  Mapa de conceitos
                </h4>
                <p className="text-[11px] text-gray-400">
                  Clique em um conceito para ver os detalhes e iniciar o ensino socrático. Falso positivo e fronteira são os melhores pontos de partida.
                </p>
              </div>

              <button
                onClick={() => handleStartSocraticCycle()}
                disabled={nodes.length === 0}
                className="flex items-center space-x-1.5 rounded bg-gray-200 px-3.5 py-1.5 text-xs font-semibold text-ink-950 hover:bg-white shadow-sm transition-colors disabled:opacity-40"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Iniciar Ensino Socrático</span>
              </button>
            </div>

            <div className="flex-1 min-h-0 rounded-lg border border-ink-700 overflow-hidden">
              <KnowledgeGraph
                nodes={nodes}
                goal={session?.goal}
                onStartSocratic={(id) => handleStartSocraticCycle(id)}
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
            className="flex-1 overflow-y-auto px-6 py-5"
          >
            <div className="mx-auto max-w-3xl space-y-6 pb-8">
              {/* Top Phase Pill Divider (Coherent with active phase: PROBING / TEACHING / etc.) */}
              <div className="relative flex items-center justify-center py-1">
                <div className="absolute inset-x-0 border-t border-ink-700" />
                <span className="relative rounded-full border border-ink-600 bg-ink-950 px-3.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-gray-400">
                  {phaseDividerLabel}
                </span>
              </div>

              {/* Error Banner */}
              {actionError && (
                <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-3.5 text-xs text-red-200 flex items-start space-x-2">
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    {/HTTP (401|402|403|429)\b/.test(actionError) && (
                      <span className="block font-semibold text-red-100">
                        {/HTTP (402|429)\b/.test(actionError)
                          ? 'Limite ou créditos do provedor de IA esgotados'
                          : 'Problema com a chave do provedor de IA'}
                      </span>
                    )}
                    <span className="block">{actionError}</span>
                  </div>
                </div>
              )}

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
                        YOU
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
                        Nova sessão
                      </h2>
                      <p className="text-xs text-gray-400">
                        O professor vai abrir uma investigação sobre o que você já sabe.
                      </p>
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
                        YOU
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
                        QUESTION
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
                            YOUR THINKING
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
                        YOU
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
                  const turnThinking =
                    attempt.agentThinking ||
                    attempt.judgeReasoning;
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
                            YOU
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
                        YOU
                      </span>
                      <RichText text={msg.text} className="text-xs text-gray-200 leading-relaxed" />
                    </div>
                  ))}

              {/* ACTIVE QUESTION TURN (Probing Phase) */}
              {phase === 'probing' && currentQuestion && !socraticNode && (
                <div className="space-y-4 border-t border-ink-700 pt-4">
                  {isSubmitting && pendingAttempt && (
                    <AnsweredQuestionCard attempt={pendingAttempt} index={session?.attempts?.length || 0} />
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

                  {session && session.questionCount >= minQuestions && (
                    <div className="mx-auto max-w-2xl flex items-center justify-between rounded-lg border border-blue-900/60 bg-blue-950/20 p-3.5 text-xs text-blue-300 shadow-sm">
                      <span>
                        Você atingiu o piso de <strong>{session.questionCount} questões</strong>. Deseja avançar para o plano de ensino?
                      </span>
                      <button
                        onClick={handleAdvanceToPlan}
                        className="rounded bg-gray-200 px-3.5 py-1.5 text-xs font-semibold text-ink-950 hover:bg-white shadow-sm transition-colors"
                      >
                        Ver Plano de Ensino
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
                      <h2 className="text-base font-bold text-white font-serif">Plano de Ensino</h2>
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
                        <span>Ver mapa de conceitos</span>
                      </button>
                      <button
                        onClick={handleConfirmPlan}
                        className="flex items-center space-x-2 rounded bg-gray-200 px-5 py-2.5 text-xs font-semibold text-ink-950 hover:bg-white transition-colors shadow-md"
                      >
                        <Sparkles className="h-4 w-4" />
                        <span>Começar ensino</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SOCRATIC TEACHING PHASE */}
              {socraticNode && socraticPredictData && (
                <div className="space-y-4 border-t border-ink-700 pt-4">
                  <AgentThinkingBlock
                    thinkingText={`Iniciando intervenção socrática cirúrgica no conceito "${socraticNode.title}". Primeiro passo: solicitar que o estudante faça uma predição intuitiva antes da formalização teórica.`}
                    defaultExpanded={true}
                  />
                  <SocraticCard
                    key={socraticNode.id}
                    node={socraticNode}
                    step={socraticStep}
                    predictQuestion={socraticPredictData.questionText}
                    promptGoal={socraticPredictData.promptGoal}
                    teachProse={teachProse}
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
                    <h3 className="text-sm font-bold text-white font-serif">Passada de ensino concluída</h3>
                  </div>
                  <p className="text-xs leading-relaxed text-gray-300">
                    {pendingConceptCount === 0
                      ? 'Todos os conceitos do mapa foram dominados.'
                      : `${pendingConceptCount} ${
                          pendingConceptCount === 1 ? 'conceito ainda não está dominado' : 'conceitos ainda não estão dominados'
                        }. Abra o mapa de conceitos e escolha um para revisar quando quiser.`}
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
                    <span>Abrir mapa de conceitos</span>
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
                        label="QUESTION"
                        questionText={session.goalClarificationQuestion || ''}
                        options={scopeOptions}
                        selectedIndex={selectedIdx}
                        onSelect={setSelectedIdx}
                        dashedOption={{
                          label: 'Insira um escopo personalizado...',
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
                        label={`PROBE #${session?.questionCount || 1}`}
                        anchor={currentQuestion.anchorConcept}
                        questionText={currentQuestion.questionText}
                        options={currentQuestion.options}
                        selectedIndex={selectedIdx}
                        onSelect={(idx) => {
                          setSelectedIdx(idx);
                          setIsDontKnow(false);
                        }}
                        dashedOption={{
                          label: 'Não sei / Ainda não domino este conceito',
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
                        label="CHECK"
                        questionText={checkQuestion.questionText}
                        options={checkQuestion.options}
                        selectedIndex={selectedIdx}
                        onSelect={setSelectedIdx}
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
              {!hasDock && chatInputBox}
              {statusSubBar}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
