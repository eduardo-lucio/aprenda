import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChatTurnMessage,
  CheckQuestionData,
  ConceptNode,
  ProbingSession,
  QuestionData,
  ModelOption,
} from '../../shared/types';
import { AgentThinkingBlock } from '../components/AgentThinkingBlock';
import { QuestionCard } from '../components/QuestionCard';
import { AnsweredQuestionCard } from '../components/AnsweredQuestionCard';
import { SocraticCard, SocraticStep } from '../components/SocraticCard';
import { RichText, toPlainPreview } from '../components/RichText';
import { ConfidenceSlider } from '../components/ConfidenceSlider';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { KnowledgeGraph } from '../components/KnowledgeGraph';
import {
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowDown,
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
} from 'lucide-react';

interface SessionViewProps {
  initialNodes?: ConceptNode[];
  currentSession?: ProbingSession | null;
  pendingMode?: 'teaching' | 'practice' | null;
  onSessionUpdate?: (session: ProbingSession) => void;
  onSessionCreated?: (session: ProbingSession) => void;
  modelName?: string;
  thinkingLevel?: string;
  tokenCount?: number;
  questionCount?: number;
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
  pendingMode = 'teaching',
  onSessionUpdate,
  onSessionCreated,
  modelName = 'gemini-2.0-flash',
  thinkingLevel = 'High',
  tokenCount = 0,
  questionCount,
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
  const [submittingLabel, setSubmittingLabel] = useState<string>('');
  const [customScopeInput, setCustomScopeInput] = useState('');
  const [bottomChatInput, setBottomChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatTurnMessage[]>([]);
  const [streamingThinking, setStreamingThinking] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [answeredScope, setAnsweredScope] = useState<{
    questionText: string;
    options: string[];
    selectedOption: string;
    thinkingText?: string;
  } | null>(null);
  const lastScrollTopRef = useRef(0);
  const autoScrollingRef = useRef(false);

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
  const [confidence, setConfidence] = useState<number>(50);

  // Socratic cycle state (lifted out of the card: inputs live in the chat field)
  const [socraticStep, setSocraticStep] = useState<SocraticStep>('predict');
  const [teachProse, setTeachProse] = useState('');
  const [checkQuestion, setCheckQuestion] = useState<CheckQuestionData | null>(null);
  const [checkResult, setCheckResult] = useState<{ isPassed: boolean; repairExplanation?: string } | null>(null);
  const [socraticLoading, setSocraticLoading] = useState(false);

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

  const feedContainerRef = useRef<HTMLDivElement | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const activeDockRef = useRef<HTMLDivElement | null>(null);
  const collapseTimestampRef = useRef<number>(0);

  const collapseDock = () => {
    setDockCollapsed((prev) => {
      if (!prev) collapseTimestampRef.current = Date.now();
      return true;
    });
  };

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
    setConfidence(50);
    setDockCollapsed(false);
  }, [currentQuestion?.id, session?.id, socraticStep, checkQuestion?.questionText]);

  useEffect(() => {
    setSocraticStep('predict');
    setTeachProse('');
    setCheckQuestion(null);
    setCheckResult(null);
  }, [socraticNode?.id]);

  const scrollToBottom = () => {
    const el = feedContainerRef.current;
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else if (feedEndRef.current && typeof feedEndRef.current.scrollIntoView === 'function') {
      feedEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  /** Re-opens the docked question and brings the feed back to the bottom. */
  const expandDock = () => {
    autoScrollingRef.current = true;
    setDockCollapsed(false);
    requestAnimationFrame(() => {
      scrollToBottom();
    });
    setTimeout(() => {
      autoScrollingRef.current = false;
      const el = feedContainerRef.current;
      if (el) lastScrollTopRef.current = el.scrollTop;
    }, 700);
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

  // Auto-scroll feed down only when a new turn/question/attempt arrives (NEVER on streamingThinking chunks)
  useEffect(() => {
    if (dockCollapsed) return;
    const timer = setTimeout(() => {
      scrollToBottom();
    }, 60);
    return () => clearTimeout(timer);
  }, [
    session?.phase,
    session?.attempts?.length,
    currentQuestion?.id,
    socraticNode?.id,
    chatMessages.length,
    isSubmitting,
    dockCollapsed,
  ]);

  const handleFeedScroll = () => {
    const el = feedContainerRef.current;
    if (!el) return;
    const previousTop = lastScrollTopRef.current;
    lastScrollTopRef.current = el.scrollTop;
    if (autoScrollingRef.current) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (el.scrollTop < previousTop) {
      const dockEl = activeDockRef.current;
      if (dockEl && el.clientHeight > 0) {
        const containerRect = el.getBoundingClientRect();
        const dockRect = dockEl.getBoundingClientRect();
        if (containerRect.height > 0 && dockRect.height > 0) {
          // Only collapse once the user scrolls up past the top of the question (or reaches top of page)
          if ((dockRect.top > containerRect.top + 48 && distanceFromBottom > 12) || el.scrollTop <= 4) {
            collapseDock();
          }
          return;
        }
      }
      if (distanceFromBottom > 12) {
        collapseDock();
      }
    } else if (
      el.scrollTop > previousTop + 4 &&
      distanceFromBottom < 20 &&
      Date.now() - collapseTimestampRef.current > 350
    ) {
      setDockCollapsed(false);
    }
  };

  const handleFeedWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (autoScrollingRef.current) return;
    const el = feedContainerRef.current;
    if (e.deltaY < -4) {
      const dockEl = activeDockRef.current;
      if (dockEl && el && el.clientHeight > 0) {
        const containerRect = el.getBoundingClientRect();
        const dockRect = dockEl.getBoundingClientRect();
        if (containerRect.height > 0 && dockRect.height > 0) {
          if (dockRect.top >= containerRect.top - 16 || el.scrollTop <= 8) {
            collapseDock();
          }
          return;
        }
      }
      collapseDock();
    } else if (
      e.deltaY > 10 &&
      dockCollapsed &&
      el &&
      el.scrollHeight - el.scrollTop - el.clientHeight < 24 &&
      Date.now() - collapseTimestampRef.current > 350
    ) {
      expandDock();
    }
  };

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
    confidence: number;
    thinkingText: string;
  }) => {
    setStreamingThinking('');
    setSubmittingLabel('O Juiz Cognitivo está analisando seu raciocínio em tempo real...');
    setAgentThinking('Avaliando a resposta do estudante em tempo real...');
    setIsSubmitting(true);
    setActionError(null);
    try {
      const result = await window.api.submitProbeAnswer(data);
      await refreshGraph();
      setSession(result.session);
      if (onSessionUpdate) onSessionUpdate(result.session);

      if (result.nextAction === 'transition_diagnosis') {
        setCurrentQuestion(null);
        setActiveTab('session');
        setAgentThinking(
          result.session.agentThinking ||
            `Sondagem concluída (${result.session.questionCount} questões avaliadas). Consolidando o mapa completo da fronteira cognitiva com nós dominados, falsos positivos e pontos cegos.`
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
    }
  };

  const handleForceAdvanceDiagnosis = async () => {
    setSubmittingLabel('Finalizando diagnóstico da fronteira...');
    setIsSubmitting(true);
    setActionError(null);
    try {
      const sess = await window.api.advanceToDiagnosis();
      setSession(sess);
      if (onSessionUpdate) onSessionUpdate(sess);
      setCurrentQuestion(null);
      setActiveTab('session');
      setAgentThinking(
        'Sondagem concluída (piso de 8 questões atingido). Diagnóstico completo da fronteira de conhecimento exibido abaixo.'
      );
    } catch (err: any) {
      setActionError(cleanError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartSocraticCycle = async (nodeId?: string) => {
    setSubmittingLabel('Preparando etapa socrática (Predição)...');
    setIsSubmitting(true);
    setActionError(null);
    try {
      const targetId =
        nodeId ||
        nodes.find((n) => n.status === 'false_positive')?.id ||
        nodes.find((n) => n.status === 'frontier')?.id ||
        nodes.find((n) => n.status === 'blind_spot')?.id ||
        nodes[0]?.id;

      const data = await window.api.startSocraticStep(targetId);
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

  const handleCheckSubmit = async (index: number) => {
    setSocraticLoading(true);
    setActionError(null);
    try {
      const res = await window.api.submitCheckAnswer(index);
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
  const modeLabel = (session?.mode || pendingMode || 'teaching').toUpperCase();
  const phaseDividerLabel = !session
    ? modeLabel
    : socraticNode || phase === 'socratic_teach'
    ? 'TEACHING'
    : phase === 'probing'
    ? 'PROBING'
    : phase === 'frontier_diagnosis'
    ? 'DIAGNOSIS'
    : phase === 'completed'
    ? 'COMPLETED'
    : 'ORIENTATION';

  // ---- Docked question + shared chat field ----
  // Hide the docked question immediately while isSubmitting is true so answered questions never linger
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
  const dockIsCollapsed = hasDock && dockCollapsed;
  const collapsedLabel = isScopeMode ? 'QUESTION' : isSocraticCheck ? 'CHECK' : 'PROBE';
  const collapsedText = toPlainPreview(
    isScopeMode
      ? session?.goalClarificationQuestion || ''
      : isSocraticCheck
      ? checkQuestion?.questionText || ''
      : currentQuestion?.questionText || ''
  );

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
        confidence: isDontKnow ? Math.min(confidence, 30) : confidence,
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
      handleCheckSubmit(selectedIdx);
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
    <div className={hasDock && !dockIsCollapsed ? 'p-2.5' : ''}>
      {/* Input Box with Paperclip and Enter button */}
      <div className="relative flex items-start rounded-xl border border-[#262626] bg-[#141414] px-3.5 py-2.5 shadow-sm focus-within:border-[#383838] transition-colors">
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
          onClick={() => {
            if (dockIsCollapsed) expandDock();
          }}
          disabled={isSubmitting || socraticLoading}
          rows={(hasDock && !dockIsCollapsed) || isSocraticPredict ? 2 : 1}
          className="flex-1 resize-none bg-transparent text-xs text-gray-200 outline-none placeholder:text-gray-500 font-sans"
          autoFocus={!dockIsCollapsed}
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
            className="flex items-center justify-center rounded-lg bg-[#262626] hover:bg-[#383838] p-1.5 text-gray-300 hover:text-white transition-colors disabled:opacity-40"
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
      {hasDock && !dockIsCollapsed && (
        <div className="mt-1.5 flex items-center space-x-3 px-1 font-mono text-[10px] text-gray-500">
          <span>↵ envia</span>
          <span>⇧↵ nova linha</span>
        </div>
      )}
    </div>
  );

  const statusSubBar = (
    <div className="flex items-center justify-between px-1 text-xs select-none">
      {/* Left side: Tokens info & Dictate pill */}
      <div className="flex items-center space-x-3">
        <span className="font-mono text-[11px] text-gray-500">
          {tokenCount.toLocaleString()} tok
          {session
            ? ` · Q: ${session.questionCount || 0}/8+`
            : questionCount !== undefined
            ? ` · Q: ${questionCount}/8+`
            : ''}
        </span>

        <button
          type="button"
          onClick={handleDictatePill}
          disabled={isTranscribing}
          className={`flex items-center space-x-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-mono transition-colors ${
            isListening
              ? 'border-red-600 bg-red-950/60 text-red-400 animate-pulse'
              : 'border-[#262626] bg-[#141414] text-gray-400 hover:border-gray-500 hover:text-gray-200'
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
            className="flex items-center space-x-1.5 rounded-full border border-[#262626] bg-[#141414] px-3 py-0.5 text-[11px] font-mono text-gray-300 hover:border-gray-500 hover:text-white transition-colors"
            title={`Modelo: ${modelName}. Clique para alterar.`}
          >
            <span className="truncate max-w-[160px]">{modelName}</span>
            <ChevronDown className="h-3 w-3 text-gray-500" />
          </button>

          {showModelMenu && (
            <div
              className="absolute right-0 bottom-full mb-2 w-80 rounded-xl border border-[#2e2e2e] bg-[#141414] p-2.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative mb-2">
                <input
                  type="text"
                  placeholder="Search models..."
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full rounded-lg border border-[#333333] bg-[#0c0c0c] px-3 py-1.5 text-xs font-sans text-white placeholder-gray-500 outline-none focus:border-gray-400"
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
                            ? 'bg-[#252525] text-white border-l-2 border-emerald-500 pl-2'
                            : 'hover:bg-[#1e1e1e] text-gray-300 hover:text-white'
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
                <div className="border-t border-[#262626] mt-2 pt-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModelMenu(false);
                      setModelSearchQuery('');
                      onOpenSettings();
                    }}
                    className="flex items-center space-x-1.5 w-full text-left px-2 py-1.5 text-[11px] font-mono text-gray-400 hover:text-emerald-400 hover:bg-[#1e1e1e] rounded-lg transition-colors"
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
            className="flex items-center space-x-1.5 rounded-full border border-[#262626] bg-[#141414] px-2.5 py-0.5 text-[11px] font-mono text-gray-300 hover:border-gray-500 hover:text-white transition-colors"
            title={`Thinking: ${thinkingLevel}. Clique para alterar.`}
          >
            <span>{(thinkingLevel || 'high').toLowerCase()}</span>
            <ChevronDown className="h-3 w-3 text-gray-500" />
          </button>

          {showThinkingMenu && (
            <div className="absolute right-0 bottom-full mb-1.5 w-32 rounded-xl border border-[#2a2a2a] bg-[#161616] p-1.5 shadow-2xl z-30 font-mono text-xs">
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
                      : 'text-gray-300 hover:bg-[#222]'
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
    <div className="flex h-full w-full flex-col bg-[#0a0a0a] text-gray-200 relative">
      {/* Top Session Nav Tabs */}
      <div className="flex items-center justify-between border-b border-[#1a1a1a] px-6 py-2 bg-[#0e0e0e]">
        <div className="flex items-center space-x-3">
          <span className="font-serif text-sm font-semibold text-gray-200 truncate max-w-md">
            {session?.goal || (pendingMode === 'practice' ? 'Nova Prática Rápida' : 'Nova Trilha Socrática')}
          </span>
          {session && (
            <span className="rounded bg-[#1a1a1a] px-2 py-0.5 text-[10px] font-mono text-emerald-400 border border-emerald-900/40 uppercase">
              Fase: {session.phase}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('session')}
            className={`flex items-center space-x-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'session'
                ? 'bg-[#1f1f1f] text-white shadow-sm'
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
                ? 'bg-[#1f1f1f] text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Grafo DAG ({nodes.length} nós)</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'dag' ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex h-full flex-col space-y-4">
            <div className="flex items-center justify-between bg-[#111111] p-3 rounded-lg border border-[#1e293b]">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300">
                  Mapeamento da Fronteira Cognitiva
                </h4>
                <p className="text-[11px] text-gray-400">
                  Clique em qualquer nó amarelo (Falso Positivo) ou azul (Fronteira) para iniciar o ensino socrático cirúrgico.
                </p>
              </div>

              <button
                onClick={() => handleStartSocraticCycle()}
                disabled={nodes.length === 0}
                className="flex items-center space-x-1.5 rounded bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 shadow-sm transition-colors disabled:opacity-40"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Iniciar Ensino Socrático</span>
              </button>
            </div>

            <div className="flex-1 rounded-lg border border-[#1e293b] overflow-hidden">
              <KnowledgeGraph
                nodes={nodes}
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
            onScroll={handleFeedScroll}
            onWheel={handleFeedWheel}
            className="flex-1 overflow-y-auto px-6 py-5"
          >
            <div className="mx-auto max-w-3xl space-y-6 pb-8">
              {/* Top Phase Pill Divider (Coherent with active phase: PROBING / TEACHING / etc.) */}
              <div className="relative flex items-center justify-center py-1">
                <div className="absolute inset-x-0 border-t border-[#1f1f1f]" />
                <span className="relative rounded-full border border-[#2a2a2a] bg-[#0a0a0a] px-3.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-gray-400">
                  {phaseDividerLabel}
                </span>
              </div>

              {/* Error Banner */}
              {actionError && (
                <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-3.5 text-xs text-red-200 flex items-start space-x-2">
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{actionError}</span>
                </div>
              )}

              {/* TURN 0: Initial Empty State & Goal Orientation */}
              {!session ? (
                <div className="space-y-4">
                  {/* Show user message immediately when submitted while starting session */}
                  {goalTurnMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className="rounded-r-md border-l-2 border-[#3a3a3a] bg-[#141414]/90 px-4 py-2.5 space-y-1"
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
                      className="rounded-r-md border-l-2 border-[#3a3a3a] bg-[#141414]/90 px-4 py-2.5 space-y-1"
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
                    <div className="rounded-xl border border-[#242424] bg-[#141414] p-5 shadow-lg space-y-3">
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
                                  : 'border-[#262626] bg-[#181818]/60 text-gray-400'
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
                        <div className="border-l-2 border-[#2e2e2e] pl-3 pt-0.5">
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
                      className="rounded-r-md border-l-2 border-[#3a3a3a] bg-[#141414]/90 px-4 py-2.5 space-y-1"
                    >
                      <span className="block font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                        YOU
                      </span>
                      <RichText text={msg.text} className="text-xs text-gray-200 leading-relaxed" />
                    </div>
                  ))}

                  {/* 4. Streaming thinking while building DAG & 1st question after scope selection */}
                  {phase === 'goal_orientation' && !currentQuestion && isSubmitting && hasScopeMsg && (
                    <div className="border-t border-[#1f1f1f] pt-5 space-y-4">
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
                    <div key={`${attempt.questionId}-${idx}`} className="space-y-3 border-t border-[#1f1f1f] pt-4">
                      {turnThinking && (
                        <AgentThinkingBlock thinkingText={turnThinking} defaultExpanded={false} />
                      )}
                      <AnsweredQuestionCard attempt={attempt} index={idx} />
                      {turnMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className="rounded-r-md border-l-2 border-[#3a3a3a] bg-[#141414]/90 px-4 py-2.5 space-y-1"
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
                      className="rounded-r-md border-l-2 border-[#3a3a3a] bg-[#141414]/90 px-4 py-2.5 space-y-1"
                    >
                      <span className="block font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                        YOU
                      </span>
                      <RichText text={msg.text} className="text-xs text-gray-200 leading-relaxed" />
                    </div>
                  ))}

              {/* ACTIVE QUESTION TURN (Probing Phase) */}
              {phase === 'probing' && currentQuestion && !socraticNode && (
                <div className="space-y-4 border-t border-[#1f1f1f] pt-4">
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

                  {session && session.questionCount >= 8 && (
                    <div className="mx-auto max-w-2xl flex items-center justify-between rounded-lg border border-blue-900/60 bg-blue-950/20 p-3.5 text-xs text-blue-300 shadow-sm">
                      <span>
                        Você atingiu o piso de <strong>{session.questionCount} questões</strong>. Deseja avançar para o diagnóstico do grafo?
                      </span>
                      <button
                        onClick={handleForceAdvanceDiagnosis}
                        className="rounded bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 shadow-sm transition-colors"
                      >
                        Avançar para Diagnóstico
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* FRONTIER DIAGNOSIS TURN */}
              {phase === 'frontier_diagnosis' && !socraticNode && (
                <div className="space-y-4 border-t border-[#1f1f1f] pt-4">
                  <AgentThinkingBlock
                    thinkingText={agentThinking}
                    defaultExpanded={false}
                  />

                  <div className="flex flex-col gap-5 rounded-xl border border-[#262626] bg-[#141414] p-6 shadow-xl">
                    <div className="flex items-center justify-between border-b border-[#242424] pb-4">
                      <div className="flex items-center space-x-2.5">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        <div>
                          <h2 className="text-base font-bold text-white font-serif">
                            Diagnóstico da Fronteira Cognitiva Concluído
                          </h2>
                          <p className="text-xs text-gray-400">
                            {session?.questionCount || 8} questões avaliadas com calibração de certeza e autoexplicação.
                          </p>
                        </div>
                      </div>

                      <span className="rounded bg-[#1e293b] px-2.5 py-1 text-xs font-mono font-bold text-emerald-400 border border-emerald-900/60">
                        Clareza: 100%
                      </span>
                    </div>

                    {/* Cognitive Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="rounded border border-emerald-900/60 bg-emerald-950/20 p-3 text-center">
                        <span className="text-xl font-bold font-mono text-emerald-400">{masteredCount}</span>
                        <span className="block text-[11px] font-semibold text-gray-300 mt-0.5">🟢 Domínio Sólido</span>
                      </div>

                      <div className="rounded border border-amber-900/60 bg-amber-950/20 p-3 text-center ring-1 ring-amber-500/30">
                        <span className="text-xl font-bold font-mono text-amber-300">{falsePositiveCount}</span>
                        <span className="block text-[11px] font-semibold text-amber-300 mt-0.5">🟡 Falsos Positivos</span>
                      </div>

                      <div className="rounded border border-red-900/60 bg-red-950/20 p-3 text-center">
                        <span className="text-xl font-bold font-mono text-red-400">{blindSpotCount}</span>
                        <span className="block text-[11px] font-semibold text-gray-300 mt-0.5">🔴 Pontos Cegos</span>
                      </div>

                      <div className="rounded border border-blue-900/60 bg-blue-950/20 p-3 text-center">
                        <span className="text-xl font-bold font-mono text-blue-400">{frontierCount}</span>
                        <span className="block text-[11px] font-semibold text-gray-300 mt-0.5">🔵 Fronteira Ativa</span>
                      </div>
                    </div>

                    {falsePositiveCount > 0 && (
                      <div className="rounded border border-amber-800/80 bg-amber-950/30 p-4 text-xs text-amber-200 space-y-1.5">
                        <div className="flex items-center space-x-2 font-bold text-amber-300">
                          <AlertTriangle className="h-4 w-4" />
                          <span>Falsos Positivos Detectados pelo Juiz Cognitivo</span>
                        </div>
                        <p className="text-[11px] text-gray-300 leading-relaxed">
                          Você acertou a alternativa correta em alguns nós, porém sua autoexplicação indicou conceitos imprecisos ou dedução por eliminação. O ensino socrático cirúrgico irá ancorar os princípios incondicionais antes de avançar.
                        </p>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                      <button
                        onClick={() => {
                          refreshGraph();
                          setActiveTab('dag');
                        }}
                        className="flex w-full sm:w-auto items-center justify-center space-x-2 rounded border border-[#2a2a2a] bg-[#0a0a0a] px-4 py-2.5 text-xs font-semibold text-gray-300 hover:border-gray-500 hover:text-white transition-colors"
                      >
                        <BarChart3 className="h-4 w-4 text-emerald-400" />
                        <span>Explorar no Grafo DAG</span>
                      </button>

                      <button
                        onClick={() => handleStartSocraticCycle()}
                        className="flex w-full sm:w-auto items-center justify-center space-x-2 rounded bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors shadow-md"
                      >
                        <Sparkles className="h-4 w-4" />
                        <span>Iniciar Ensino Socrático Cirúrgico</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* COMPLETED STAGE */}
              {phase === 'completed' && !socraticNode && (
                <div className="border-t border-[#1f1f1f] pt-4">
                  <div className="flex flex-col gap-5 rounded-xl border border-emerald-900/60 bg-[#141414] p-6 shadow-xl text-center items-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-950 text-emerald-400 border border-emerald-700/60">
                      <Award className="h-6 w-6" />
                    </div>

                    <div className="space-y-1">
                      <h2 className="text-lg font-bold font-serif text-white">
                        Parabéns! Ciclo Socrático Concluído
                      </h2>
                      <p className="text-xs text-gray-400 max-w-md mx-auto">
                        Você validou seu entendimento cirúrgico e eliminou equívocos na árvore de dependências conceituais.
                      </p>
                    </div>

                    <div className="flex items-center space-x-3 pt-2">
                      <button
                        onClick={() => {
                          refreshGraph();
                          setActiveTab('dag');
                        }}
                        className="flex items-center space-x-2 rounded border border-[#2a2a2a] bg-[#0a0a0a] px-4 py-2 text-xs font-semibold text-gray-300 hover:border-gray-500 hover:text-white transition-colors"
                      >
                        <BarChart3 className="h-4 w-4 text-emerald-400" />
                        <span>Ver Grafo Atualizado</span>
                      </button>

                      <button
                        onClick={() => {
                          setSession(null);
                          setGoalInput('');
                          setCurrentQuestion(null);
                          setSocraticNode(null);
                        }}
                        className="flex items-center space-x-2 rounded bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors shadow-sm"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span>Nova Trilha de Aprendizado</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SOCRATIC TEACHING PHASE */}
              {socraticNode && socraticPredictData && (
                <div className="space-y-4 border-t border-[#1f1f1f] pt-4">
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
                    onFinishStep={() => {
                      setSocraticNode(null);
                      setSocraticPredictData(null);
                      setActiveTab('dag');
                    }}
                  />
                </div>
              )}

              {/* ACTIVE QUESTION INSIDE THE CHAT FLOW (grows vertically with zero internal scroll; animates smoothly on shrink) */}
              {hasDock && (
                <div
                  ref={activeDockRef}
                  data-testid="active-question-dock"
                  aria-hidden={dockIsCollapsed}
                  className={`mx-auto w-full max-w-2xl grid transition-[grid-template-rows,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] origin-bottom ${
                    dockIsCollapsed
                      ? 'grid-rows-[0fr] opacity-0 scale-95 translate-y-4 pointer-events-none select-none'
                      : 'grid-rows-[1fr] opacity-100 scale-100 translate-y-0'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="flex flex-col gap-2 pt-2">
                      <div className="overflow-hidden rounded-2xl border border-[#262626] bg-[#141414] shadow-2xl">
                        <div className="p-5">
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
                        </div>

                        {isProbeMode && (
                          <ConfidenceSlider value={confidence} onChange={setConfidence} />
                        )}

                        {!dockIsCollapsed && chatInputBox}
                      </div>

                      {!dockIsCollapsed && statusSubBar}
                    </div>
                  </div>
                </div>
              )}

              <div ref={feedEndRef} className={!hasDock || dockIsCollapsed ? 'h-28' : 'h-2'} />
            </div>
          </div>

          {/* Floating Bottom Bar: overlays the bottom without shortening the full-page scrollbar; animates in when question shrinks */}
          <div
            className={`absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent px-6 pb-3 pt-4 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              !hasDock || dockIsCollapsed
                ? 'translate-y-0 opacity-100 scale-100 pointer-events-auto'
                : 'translate-y-6 opacity-0 scale-95 pointer-events-none'
            }`}
          >
            <div className="mx-auto flex max-w-2xl flex-col gap-2">
              {dockIsCollapsed && (
                <div className="flex flex-col items-center gap-2 transition-all duration-300 ease-out">
                  <button
                    type="button"
                    onClick={expandDock}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-[#333333] bg-[#141414]/95 text-gray-300 shadow-lg hover:border-gray-400 hover:text-white transition-all hover:scale-105"
                    title="Descer para a questão atual"
                    aria-label="Descer para a questão atual"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    data-testid="collapsed-question-pill"
                    onClick={expandDock}
                    className="flex w-full items-center space-x-3 rounded-xl border border-[#2e2e2e] bg-[#141414]/95 px-4 py-2.5 text-left text-xs text-gray-300 shadow-2xl hover:border-gray-500 hover:bg-[#181818] transition-all cursor-pointer group"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400 group-hover:text-gray-300 font-semibold shrink-0">
                      {collapsedLabel}
                    </span>
                    <span className="flex-1 truncate text-gray-200 group-hover:text-white font-medium">
                      {collapsedText}
                    </span>
                    <span className="font-semibold text-blue-400 group-hover:text-blue-300 shrink-0 flex items-center space-x-1">
                      <span>Answer</span>
                      <ArrowDown className="h-3 w-3" />
                    </span>
                  </button>
                </div>
              )}

              {!hasDock && chatInputBox}
              {(!hasDock || dockIsCollapsed) && statusSubBar}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
