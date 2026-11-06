import React from 'react';
import { ConceptNode } from '../../shared/types';
import { RichText } from './RichText';
import { Sparkles, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react';

export type SocraticStep = 'predict' | 'teach' | 'check';

interface SocraticCardProps {
  node: ConceptNode;
  step: SocraticStep;
  predictQuestion: string;
  promptGoal?: string;
  teachProse?: string;
  checkResult?: { isPassed: boolean; repairExplanation?: string } | null;
  isLoading?: boolean;
  onAdvanceToCheck: () => void;
  onFinishStep: () => void;
}

/**
 * Feed-side view of the Socratic cycle. All inputs (prediction text, check option, reasoning)
 * live in the docked chat field at the bottom of the screen.
 */
export const SocraticCard: React.FC<SocraticCardProps> = ({
  node,
  step,
  predictQuestion,
  promptGoal = 'Preveja o comportamento antes da teoria.',
  teachProse = '',
  checkResult = null,
  isLoading = false,
  onAdvanceToCheck,
  onFinishStep,
}) => {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[#1e293b] bg-[#111111] p-6 shadow-2xl text-gray-200">
      <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
        <div className="flex items-center space-x-2">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <span className="font-semibold text-xs tracking-wider uppercase text-emerald-400">
            Ciclo Socrático: {node.title}
          </span>
        </div>
        <div className="flex space-x-1 text-[10px] font-mono font-bold">
          <span className={`px-2 py-0.5 rounded ${step === 'predict' ? 'bg-purple-950 text-purple-300 border border-purple-700' : 'text-gray-500'}`}>
            1. PREDICT
          </span>
          <span className={`px-2 py-0.5 rounded ${step === 'teach' ? 'bg-blue-950 text-blue-300 border border-blue-700' : 'text-gray-500'}`}>
            2. TEACH
          </span>
          <span className={`px-2 py-0.5 rounded ${step === 'check' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'text-gray-500'}`}>
            3. CHECK
          </span>
        </div>
      </div>

      {step === 'predict' && (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-purple-300 italic">{promptGoal}</div>
          <RichText text={predictQuestion} className="text-sm font-serif leading-relaxed text-gray-100" />
          <p className="text-[11px] text-gray-500">
            {isLoading ? 'Conectando...' : 'Digite sua previsão no campo abaixo.'}
          </p>
        </div>
      )}

      {step === 'teach' && (
        <div className="flex flex-col gap-4">
          <div className="rounded border border-blue-900/60 bg-blue-950/20 p-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 block mb-1">
              Explicação Cirúrgica de 1 Degrau
            </span>
            <RichText text={teachProse} className="text-xs leading-relaxed text-gray-200" />
          </div>

          <div className="flex justify-end">
            <button
              onClick={onAdvanceToCheck}
              className="flex items-center space-x-2 rounded bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors shadow-md"
            >
              <span>Check Your Understanding</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {step === 'check' && !checkResult && (
        <p className="text-[11px] text-gray-500">
          {isLoading ? 'Verificando...' : 'Escolha uma alternativa no bloco de pergunta abaixo e envie.'}
        </p>
      )}

      {step === 'check' && checkResult && (
        <div className="flex flex-col gap-3">
          {checkResult.isPassed ? (
            <div className="flex items-center space-x-2 rounded border border-emerald-800 bg-emerald-950/40 p-3 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>Compreensão validada com sucesso! Conceito dominado.</span>
            </div>
          ) : (
            <div className="rounded border border-amber-800 bg-amber-950/40 p-3 text-xs text-amber-200">
              <div className="flex items-center space-x-2 font-bold mb-1">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <span>Ajuste Diagnóstico Realizado</span>
              </div>
              <RichText text={checkResult.repairExplanation || ''} className="text-[11px] leading-relaxed" />
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              onClick={onFinishStep}
              className="rounded bg-gray-200 px-4 py-2 text-xs font-bold text-black hover:bg-white transition-colors"
            >
              Avançar no Grafo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
