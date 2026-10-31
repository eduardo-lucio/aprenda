import React, { useState, useEffect } from 'react';
import { ConceptNode, ProbingSession, QuestionData, CheckQuestionData } from '../../shared/types';
import { QuestionCard } from '../components/QuestionCard';
import { KnowledgeGraph } from '../components/KnowledgeGraph';
import { AgentThinkingBlock } from '../components/AgentThinkingBlock';
import { SocraticCard } from '../components/SocraticCard';
import { BookOpen, Sparkles, ArrowRight, BarChart3, RotateCcw, CheckCircle } from 'lucide-react';

interface SessionViewProps {
  initialNodes?: ConceptNode[];
  onSessionUpdate?: (session: ProbingSession) => void;
}

export const SessionView: React.FC<SessionViewProps> = ({
  initialNodes = [],
  onSessionUpdate,
}) => {
  const [nodes, setNodes] = useState<ConceptNode[]>(initialNodes);
  const [session, setSession] = useState<ProbingSession | null>(null);
  const [goalInput, setGoalInput] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [activeTab, setActiveTab] = useState<'session' | 'dag'>('session');
  const [agentThinking, setAgentThinking] = useState<string>(
    'Aguardando definição de escopo do estudante para calibrar busca topológica na árvore de dependências...'
  );
  const [socraticNode, setSocraticNode] = useState<ConceptNode | null>(null);
  const [socraticPredictData, setSocraticPredictData] = useState<{
    questionText: string;
    promptGoal?: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (window.api?.getGraphState && initialNodes.length === 0) {
      window.api.getGraphState().then((g) => setNodes(g));
    }
  }, [initialNodes.length]);

  const refreshGraph = async () => {
    if (window.api?.getGraphState) {
      const updated = await window.api.getGraphState();
      setNodes(updated);
    }
  };

  const handleStartGoal = async () => {
    if (!goalInput.trim()) return;
    setIsSubmitting(true);
    try {
      const sess = await window.api.startSession('teaching', goalInput.trim());
      setSession(sess);
      if (onSessionUpdate) onSessionUpdate(sess);
      setAgentThinking(
        `Objetivo registrado: "${goalInput}". Selecione uma das opções de afunilamento para delimitar a fronteira de teste.`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectGoalOption = async (option: string) => {
    setIsSubmitting(true);
    try {
      const q = await window.api.submitGoalClarification(option);
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
        `Foco afunilado para: "${option}". Iniciando Fase 1 de Sondagem Adaptativa com piso mínimo de 8 questões. Avaliando raciocínio livre primeiro.`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProbeSubmit = async (data: {
    selectedOptionIndex: number;
    confidence: number;
    thinkingText: string;
  }) => {
    setIsSubmitting(true);
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
        setActiveTab('dag');
      } else if (result.nextQuestion) {
        setCurrentQuestion(result.nextQuestion);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForceAdvanceDiagnosis = async () => {
    setIsSubmitting(true);
    try {
      const sess = await window.api.advanceToDiagnosis();
      setSession(sess);
      if (onSessionUpdate) onSessionUpdate(sess);
      setCurrentQuestion(null);
      setActiveTab('dag');
      setAgentThinking(
        'Sondagem concluída (piso de 8 questões atingido). Mapeamento completo da fronteira de conhecimento exibido no grafo.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartSocraticCycle = async (nodeId?: string) => {
    setIsSubmitting(true);
    try {
      const data = await window.api.startSocraticStep(nodeId);
      setSocraticNode(data.node);
      setSocraticPredictData({
        questionText: data.questionText,
        promptGoal: data.promptGoal,
      });
      setActiveTab('session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const phase = session?.phase || 'goal_orientation';

  return (
    <div className="flex h-full w-full flex-col bg-[#0a0a0a] text-gray-200">
      {/* Top Session Nav Tabs */}
      <div className="flex items-center justify-between border-b border-[#1e293b] px-6 py-2 bg-[#111111]/70">
        <div className="flex items-center space-x-3">
          <span className="font-serif text-sm font-semibold text-gray-200">
            {session?.goal || 'Redes de Computadores: Camada 3'}
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
                ? 'bg-[#1e293b] text-white'
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
                ? 'bg-[#1e293b] text-white'
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
                className="flex items-center space-x-1.5 rounded bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 shadow-sm"
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

            {/* 1. GOAL ORIENTATION */}
            {(!session || (phase === 'goal_orientation' && !currentQuestion)) && (
              <div className="flex flex-col gap-5 rounded-lg border border-[#1e293b] bg-[#111111] p-6 shadow-xl">
                {!session?.goalClarificationOptions ? (
                  <div className="flex flex-col gap-4">
                    <h2 className="text-lg font-bold font-serif text-white">
                      O que você quer dominar hoje?
                    </h2>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Defina sua intenção de aprendizado em Redes de Computadores (ex: Camada 3, Time-to-Live, Sub-redes CIDR ou Tabela de Rotas). O EduCognitive isolará os nós de dependência para testar sua real competência.
                    </p>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={goalInput}
                        onChange={(e) => setGoalInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleStartGoal()}
                        placeholder="Ex: Quero aprender a Camada 3 do Modelo OSI e TTL"
                        className="flex-1 rounded border border-[#1e293b] bg-[#0a0a0a] px-3.5 py-2 text-xs text-gray-200 outline-none focus:border-emerald-500"
                      />
                      <button
                        onClick={handleStartGoal}
                        disabled={isSubmitting || !goalInput.trim()}
                        className="rounded bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
                      >
                        Iniciar Diagnóstico
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
                          onClick={() => handleSelectGoalOption(opt)}
                          className="flex cursor-pointer items-center justify-between rounded border border-[#1e293b] bg-[#0a0a0a] p-3 text-xs text-gray-300 hover:border-emerald-500 hover:bg-[#141414] transition-all"
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
                  <div className="flex items-center justify-between rounded border border-blue-900/60 bg-blue-950/20 p-3.5 text-xs text-blue-300">
                    <span>
                      Você atingiu o piso de <strong>{session.questionCount} questões</strong>. Deseja avançar para o diagnóstico do grafo?
                    </span>
                    <button
                      onClick={handleForceAdvanceDiagnosis}
                      className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 shadow-sm"
                    >
                      Avançar para Diagnóstico
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 3. SOCRATIC TEACHING PHASE */}
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
