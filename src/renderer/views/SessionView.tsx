import React, { useState, useEffect, useRef } from 'react';
import { ChatTurnMessage, ConceptNode, ProbingSession, QuestionData } from '../../shared/types';
import { AgentThinkingBlock } from '../components/AgentThinkingBlock';
import { QuestionCard } from '../components/QuestionCard';
import { AnsweredQuestionCard } from '../components/AnsweredQuestionCard';
import { SocraticCard } from '../components/SocraticCard';
import { KnowledgeGraph } from '../components/KnowledgeGraph';
import { ScopeOrientationCard } from '../components/ScopeOrientationCard';
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
} from 'lucide-react';

interface SessionViewProps {
  initialNodes?: ConceptNode[];
  currentSession?: ProbingSession | null;
  pendingMode?: 'teaching' | 'practice' | null;
  onSessionUpdate?: (session: ProbingSession) => void;
  onSessionCreated?: (session: ProbingSession) => void;
}

export const SessionView: React.FC<SessionViewProps> = ({
  initialNodes = [],
  currentSession = null,
  pendingMode = 'teaching',
  onSessionUpdate,
  onSessionCreated,
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
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  const feedContainerRef = useRef<HTMLDivElement | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

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

  const scrollToBottom = () => {
    if (feedEndRef.current && typeof feedEndRef.current.scrollIntoView === 'function') {
      feedEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    setIsScrolledUp(false);
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
        setStreamingThinking('');
        setActiveTab('session');
        if (initialNodes.length === 0) {
          setNodes([]);
        }
      }
    }
  }, [currentSession, initialNodes.length]);

  // Auto-scroll feed down whenever a new question, attempt, message, or streaming thinking arrives
  useEffect(() => {
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
    streamingThinking,
    isSubmitting,
  ]);

  const handleFeedScroll = () => {
    const el = feedContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsScrolledUp(distanceFromBottom > 180);
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
    setStreamingThinking('');
    appendUserChatMessage(goalToUse);
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
    const userMsg = studentThinking?.trim()
      ? `${option}\n\n[Raciocínio]: ${studentThinking.trim()}`
      : option;
    appendUserChatMessage(userMsg);
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

  const handleBottomBarSubmit = () => {
    if (isSubmitting) return;

    // 1. If no session yet, bottom bar submits the initial goal
    if (!session) {
      if (goalInput.trim()) {
        handleStartGoal(goalInput.trim());
      }
      return;
    }

    // 2. If in goal_orientation waiting for scope, bottom bar submits custom scope
    if (session.phase === 'goal_orientation' && !currentQuestion) {
      const text = (bottomChatInput || customScopeInput).trim();
      if (text) {
        setBottomChatInput('');
        handleSelectGoalOption(text);
      }
      return;
    }

    // 3. If in probing with an active question, save user's message in the chat feed AND dispatch reasoning to QuestionCard
    if (session.phase === 'probing' && currentQuestion && bottomChatInput.trim()) {
      const msgText = bottomChatInput.trim();
      setBottomChatInput('');
      appendUserChatMessage(msgText, (session.attempts?.length || 0) + 1);
      window.dispatchEvent(
        new CustomEvent('chat-bar-submit-thinking', { detail: msgText })
      );
      return;
    }

    // 4. In any other phase (diagnosis, socratic, completed), save user's message in the chat feed
    if (bottomChatInput.trim()) {
      const msgText = bottomChatInput.trim();
      setBottomChatInput('');
      appendUserChatMessage(msgText, session.attempts?.length || 0);
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

  // Stats counters for diagnosis view
  const masteredCount = nodes.filter((n) => n.status === 'mastered').length;
  const falsePositiveCount = nodes.filter((n) => n.status === 'false_positive').length;
  const blindSpotCount = nodes.filter((n) => n.status === 'blind_spot').length;
  const frontierCount = nodes.filter((n) => n.status === 'frontier').length;

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
            onScroll={handleFeedScroll}
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
                  {chatMessages
                    .filter((m) => (m.afterAttemptCount || 0) === 0)
                    .map((msg) => (
                      <div
                        key={msg.id}
                        className="rounded-r-md border-l-2 border-[#3a3a3a] bg-[#141414]/90 px-4 py-2.5 space-y-1"
                      >
                        <span className="block font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                          YOU
                        </span>
                        <div className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap">
                          {msg.text}
                        </div>
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
                  {/* Saved User Messages before probing attempts (e.g. goal & scope) */}
                  {chatMessages
                    .filter((m) => (m.afterAttemptCount || 0) === 0)
                    .map((msg) => (
                      <div
                        key={msg.id}
                        className="rounded-r-md border-l-2 border-[#3a3a3a] bg-[#141414]/90 px-4 py-2.5 space-y-1"
                      >
                        <span className="block font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                          YOU
                        </span>
                        <div className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap">
                          {msg.text}
                        </div>
                      </div>
                    ))}

                  {/* Historical Goal Turn */}
                  <AgentThinkingBlock
                    thinkingText={
                      isSubmitting && phase === 'goal_orientation' && streamingThinking
                        ? streamingThinking
                        : session.agentThinking || agentThinking
                    }
                    defaultExpanded={false}
                  />

                  {/* If still choosing scope in goal_orientation */}
                  {phase === 'goal_orientation' && !currentQuestion && session.goalClarificationOptions && (
                    <div className="border-t border-[#1f1f1f] pt-5 space-y-4">
                      <ScopeOrientationCard
                        questionText={
                          session.goalClarificationQuestion ||
                          `O que exatamente você quer aprender sobre ${session.goal}? Escolha a opção que melhor descreve seu objetivo:`
                        }
                        options={session.goalClarificationOptions}
                        onSubmit={(selectedOption, thinkingText) =>
                          handleSelectGoalOption(selectedOption, thinkingText)
                        }
                        isSubmitting={isSubmitting}
                      />

                      {isSubmitting && (
                        <AgentThinkingBlock
                          thinkingText={streamingThinking || agentThinking}
                          defaultExpanded={true}
                          isStreaming={true}
                          statusLabel={submittingLabel}
                        />
                      )}
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
                          <div className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap">
                            {msg.text}
                          </div>
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
                      <div className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap">
                        {msg.text}
                      </div>
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

                  <div className="mx-auto max-w-2xl">
                    <QuestionCard
                      key={currentQuestion.id}
                      question={currentQuestion}
                      questionNumber={session?.questionCount || 1}
                      onSubmit={handleProbeSubmit}
                      isSubmitting={isSubmitting}
                    />
                  </div>

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
                    predictQuestion={socraticPredictData.questionText}
                    promptGoal={socraticPredictData.promptGoal}
                    onSubmitPrediction={async (pred) => {
                      return await window.api.submitPrediction(pred);
                    }}
                    onSubmitCheck={async (idx) => {
                      const res = await window.api.submitCheckAnswer(idx);
                      await refreshGraph();
                      if (res.session) setSession(res.session);
                      return res;
                    }}
                    onFinishStep={() => {
                      setSocraticNode(null);
                      setSocraticPredictData(null);
                      setActiveTab('dag');
                    }}
                  />
                </div>
              )}

              <div ref={feedEndRef} />
            </div>
          </div>

          {/* Floating "Jump to Active Question" Pill when Scrolled Up (like Screenshot 1) */}
          {isScrolledUp && currentQuestion && (
            <div className="pointer-events-none absolute bottom-16 inset-x-0 flex flex-col items-center gap-2 z-20">
              <button
                type="button"
                onClick={scrollToBottom}
                className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-[#333333] bg-[#141414]/95 text-gray-300 shadow-lg hover:border-gray-400 hover:text-white transition-colors"
                title="Descer para a questão atual"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={scrollToBottom}
                className="pointer-events-auto flex items-center space-x-3 rounded-full border border-[#2e2e2e] bg-[#141414]/95 px-4 py-1.5 text-xs text-gray-300 shadow-2xl hover:border-gray-500 transition-all max-w-lg"
              >
                <span className="font-mono text-[10px] uppercase tracking-wider text-gray-500 shrink-0">
                  {socraticNode ? 'PREDICTION' : 'PROBE'}
                </span>
                <span className="truncate text-gray-200">{currentQuestion.questionText}</span>
                <span className="font-semibold text-white shrink-0">Answer ↓</span>
              </button>
            </div>
          )}

          {/* Persistent Bottom Chat Input Bar */}
          <div className="border-t border-[#1a1a1a] bg-[#0e0e0e] px-6 py-3">
            <div className="mx-auto flex max-w-3xl items-center gap-2.5">
              {!session ? (
                <>
                  <input
                    type="text"
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleStartGoal()}
                    placeholder="Ex: Digite o tema ou disciplina que deseja estudar..."
                    className="flex-1 rounded-lg border border-[#262626] bg-[#141414] px-4 py-2.5 text-xs text-gray-200 outline-none focus:border-emerald-500 placeholder-gray-500 transition-colors"
                    autoFocus
                  />
                  <button
                    onClick={() => handleStartGoal()}
                    disabled={isSubmitting || !goalInput.trim()}
                    className="flex items-center space-x-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-40 shadow-sm shrink-0"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>
                      {isSubmitting
                        ? 'Preparando...'
                        : pendingMode === 'practice'
                        ? 'Iniciar Prática'
                        : 'Iniciar Diagnóstico'}
                    </span>
                  </button>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={bottomChatInput}
                    onChange={(e) => setBottomChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleBottomBarSubmit();
                      }
                    }}
                    placeholder={
                      phase === 'goal_orientation'
                        ? 'Ou digite seu próprio escopo personalizado aqui e pressione Enter...'
                        : 'Digite sua autoexplicação ou mensagem e pressione Enter para enviar...'
                    }
                    disabled={isSubmitting}
                    className="flex-1 rounded-lg border border-[#262626] bg-[#141414] px-4 py-2 text-xs text-gray-200 outline-none focus:border-emerald-500 placeholder-gray-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={handleBottomBarSubmit}
                    disabled={isSubmitting || !bottomChatInput.trim()}
                    className="flex items-center space-x-1.5 rounded-lg bg-[#242424] hover:bg-emerald-600 px-4 py-2 text-xs font-semibold text-gray-200 hover:text-white transition-colors disabled:opacity-40 shrink-0"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Enviar</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
