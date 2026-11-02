import React, { useState, useEffect } from 'react';
import { ConceptNode, ProbingSession, QuestionData } from '../../shared/types';
import { QuestionCard } from '../components/QuestionCard';
import { KnowledgeGraph } from '../components/KnowledgeGraph';
import { AgentThinkingBlock } from '../components/AgentThinkingBlock';
import { SocraticCard } from '../components/SocraticCard';
import {
  BookOpen,
  Sparkles,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Award,
  RefreshCw,
  AlertCircle,
  Loader2,
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
  currentSession,
  pendingMode = null,
  onSessionUpdate,
  onSessionCreated,
}) => {
  const [nodes, setNodes] = useState<ConceptNode[]>(initialNodes);
  const [session, setSession] = useState<ProbingSession | null>(currentSession || null);
  const [goalInput, setGoalInput] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [activeTab, setActiveTab] = useState<'session' | 'dag'>('session');
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
  const [actionError, setActionError] = useState<string | null>(null);

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
        setActiveTab('session');
        if (initialNodes.length === 0) {
          setNodes([]);
        }
      }
    }
  }, [currentSession, initialNodes.length]);

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

    setSubmittingLabel('Definindo objetivo e preparando opções de escopo...');
    setIsSubmitting(true);
    setActionError(null);
    try {
      const mode = pendingMode || 'teaching';
      const sess = await window.api.startSession(mode, goalToUse);
      setSession(sess);
      if (onSessionUpdate) onSessionUpdate(sess);
      if (onSessionCreated) onSessionCreated(sess);

      setAgentThinking(
        `Objetivo registrado (${mode.toUpperCase()}): "${goalToUse}". Selecione uma das opções de afunilamento para gerar o grafo de dependências e iniciar a sondagem.`
      );
    } catch (err: any) {
      setActionError(cleanError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectGoalOption = async (option: string) => {
    setSubmittingLabel('Construindo o Grafo de Dependências e preparando a 1ª questão...');
    setIsSubmitting(true);
    setActionError(null);
    try {
      const q = await window.api.submitGoalClarification(option);
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
      setAgentThinking(
        `Foco afunilado para: "${option}". Grafo de dependências gerado. Iniciando Fase 1 de Sondagem Adaptativa com piso mínimo de 8 questões. Avaliando raciocínio livre primeiro.`
      );
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
    setSubmittingLabel('O Juiz Cognitivo está analisando seu raciocínio livre...');
    setIsSubmitting(true);
    setActionError(null);
    try {
      const result = await window.api.submitProbeAnswer(data);
      await refreshGraph();
      setSession(result.session);
      if (onSessionUpdate) onSessionUpdate(result.session);

      const v = result.attempt.verdict;
      const vLabels = {
        mastered: '🟢 Domínio Comprovado',
        false_positive: '🟡 Falso Positivo Detectado (Acerto da letra com raciocínio incorreto)',
        blind_spot: '🔴 Ponto Cego (Erro com alta convicção)',
        frontier: '🔵 Limite de Fronteira',
      };

      setAgentThinking(
        `Diagnóstico do Juiz Cognitivo: ${vLabels[v] || v}.\n"${result.attempt.judgeReasoning}"\n` +
          (result.attempt.identifiedMisconception
            ? `Equívoco Identificado: ${result.attempt.identifiedMisconception}\n`
            : '') +
          `Avançando para a próxima sondagem adaptativa (Questão ${result.session.questionCount}/8+).`
      );

      if (result.nextAction === 'transition_diagnosis') {
        setCurrentQuestion(null);
        setActiveTab('session');
      } else if (result.nextQuestion) {
        setCurrentQuestion(result.nextQuestion);
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

  const phase = session?.phase || 'goal_orientation';

  // Stats counters for diagnosis view
  const masteredCount = nodes.filter((n) => n.status === 'mastered').length;
  const falsePositiveCount = nodes.filter((n) => n.status === 'false_positive').length;
  const blindSpotCount = nodes.filter((n) => n.status === 'blind_spot').length;
  const frontierCount = nodes.filter((n) => n.status === 'frontier').length;

  return (
    <div className="flex h-full w-full flex-col bg-[#0a0a0a] text-gray-200">
      {/* Top Session Nav Tabs */}
      <div className="flex items-center justify-between border-b border-[#1e293b] px-6 py-2 bg-[#111111]/70">
        <div className="flex items-center space-x-3">
          <span className="font-serif text-sm font-semibold text-gray-200 truncate max-w-md">
            {session?.goal || (pendingMode === 'practice' ? 'Nova Prática Rápida' : 'Nova Trilha Socrática')}
          </span>
          {session && (
            <span className="rounded bg-[#1e293b] px-2 py-0.5 text-[10px] font-mono text-emerald-400 border border-emerald-900/50 uppercase">
              Fase: {session.phase}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('session')}
            className={`flex items-center space-x-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'session'
                ? 'bg-[#1e293b] text-white shadow-sm'
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
                ? 'bg-[#1e293b] text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Grafo DAG ({nodes.length} nós)</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'dag' ? (
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
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {/* Collapsible Agent Thinking Block */}
            <AgentThinkingBlock thinkingText={agentThinking} defaultExpanded={false} />

            {actionError && (
              <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-3.5 text-xs text-red-200 flex items-start space-x-2">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <span>{actionError}</span>
              </div>
            )}

            {isSubmitting && (
              <div className="flex items-center space-x-2.5 rounded-lg border border-emerald-900/50 bg-emerald-950/25 px-4 py-3 text-xs text-emerald-300 shadow-md animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400 shrink-0" />
                <span className="font-medium">{submittingLabel || 'Processando com IA...'}</span>
              </div>
            )}

            {/* 1. GOAL ORIENTATION */}
            {(!session || (phase === 'goal_orientation' && !currentQuestion)) && (
              <div className="flex flex-col gap-5 rounded-lg border border-[#1e293b] bg-[#111111] p-6 shadow-xl">
                {!session?.goalClarificationOptions ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center space-x-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <h2 className="text-lg font-bold font-serif text-white">
                        {pendingMode === 'practice'
                          ? 'Prática Rápida: O que você deseja exercitar hoje?'
                          : 'O que você quer dominar hoje?'}
                      </h2>
                    </div>

                    <p className="text-xs text-gray-400 leading-relaxed">
                      {pendingMode === 'practice'
                        ? 'Digite o tema ou conteúdo que deseja praticar para aferir solidez de raciocínio e calibrar certeza.'
                        : 'Digite qualquer tema, disciplina ou conceito que deseja aprender. O APRENDA construirá dinamicamente o grafo de pré-requisitos e diagnosticará sua real competência.'}
                    </p>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={goalInput}
                        onChange={(e) => setGoalInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleStartGoal()}
                        placeholder="Ex: Digite o tema ou disciplina que deseja estudar..."
                        className="flex-1 rounded border border-[#1e293b] bg-[#0a0a0a] px-3.5 py-2 text-xs text-gray-200 outline-none focus:border-emerald-500"
                        autoFocus
                      />
                      <button
                        onClick={() => handleStartGoal()}
                        disabled={isSubmitting || !goalInput.trim()}
                        className="rounded bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50 shadow-sm"
                      >
                        {isSubmitting
                          ? 'Preparando...'
                          : pendingMode === 'practice'
                          ? 'Iniciar Prática'
                          : 'Iniciar Diagnóstico'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-semibold font-serif text-gray-200">
                      Escolha o escopo de ancoragem para a sondagem:
                    </h3>
                    <div className="flex flex-col gap-2">
                      {session.goalClarificationOptions.map((opt, i) => (
                        <div
                          key={i}
                          onClick={() => !isSubmitting && handleSelectGoalOption(opt)}
                          className={`flex cursor-pointer items-center justify-between rounded border border-[#1e293b] bg-[#0a0a0a] p-3 text-xs text-gray-300 hover:border-emerald-500 hover:bg-[#141414] transition-all shadow-sm ${
                            isSubmitting ? 'opacity-50 pointer-events-none' : ''
                          }`}
                        >
                          <span>{opt}</span>
                          <ArrowRight className="h-4 w-4 text-emerald-400" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. PROBING PHASE */}
            {phase === 'probing' && currentQuestion && !socraticNode && (
              <div className="space-y-4">
                <QuestionCard
                  question={currentQuestion}
                  onSubmit={handleProbeSubmit}
                  isSubmitting={isSubmitting}
                />

                {session && session.questionCount >= 8 && (
                  <div className="flex items-center justify-between rounded border border-blue-900/60 bg-blue-950/20 p-3.5 text-xs text-blue-300 shadow-sm">
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

            {/* 3. FRONTIER DIAGNOSIS SCREEN (Chat tab) */}
            {phase === 'frontier_diagnosis' && !socraticNode && (
              <div className="flex flex-col gap-5 rounded-lg border border-[#1e293b] bg-[#111111] p-6 shadow-xl animate-in fade-in duration-150">
                <div className="flex items-center justify-between border-b border-[#1e293b] pb-4">
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

                {/* Key Insights & Misconceptions */}
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

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <button
                    onClick={() => {
                      refreshGraph();
                      setActiveTab('dag');
                    }}
                    className="flex w-full sm:w-auto items-center justify-center space-x-2 rounded border border-[#1e293b] bg-[#0a0a0a] px-4 py-2.5 text-xs font-semibold text-gray-300 hover:border-gray-500 hover:text-white transition-colors"
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
            )}

            {/* 4. COMPLETED STAGE */}
            {phase === 'completed' && !socraticNode && (
              <div className="flex flex-col gap-5 rounded-lg border border-emerald-900/60 bg-[#111111] p-6 shadow-xl text-center items-center animate-in fade-in duration-150">
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
                    className="flex items-center space-x-2 rounded border border-[#1e293b] bg-[#0a0a0a] px-4 py-2 text-xs font-semibold text-gray-300 hover:border-gray-500 hover:text-white transition-colors"
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
            )}

            {/* 5. SOCRATIC TEACHING PHASE */}
            {socraticNode && socraticPredictData && (
              <SocraticCard
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
            )}
          </div>
        )}
      </div>
    </div>
  );
};
