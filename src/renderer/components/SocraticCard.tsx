import React, { useState } from 'react';
import { ConceptNode, CheckQuestionData } from '../../shared/types';
import { Sparkles, HelpCircle, ArrowRight, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface SocraticCardProps {
  node: ConceptNode;
  predictQuestion: string;
  promptGoal?: string;
  onSubmitPrediction: (prediction: string) => Promise<{
    teachProse: string;
    checkQuestion: CheckQuestionData;
  }>;
  onSubmitCheck: (selectedIndex: number) => Promise<{
    isPassed: boolean;
    repairExplanation?: string;
  }>;
  onFinishStep: () => void;
}

export const SocraticCard: React.FC<SocraticCardProps> = ({
  node,
  predictQuestion,
  promptGoal = 'Preveja o comportamento antes da teoria.',
  onSubmitPrediction,
  onSubmitCheck,
  onFinishStep,
}) => {
  // Step 1: Predict, Step 2: Teach, Step 3: Check
  const [currentStep, setCurrentStep] = useState<'predict' | 'teach' | 'check'>('predict');
  const [predictionText, setPredictionText] = useState('');
  const [teachProse, setTeachProse] = useState('');
  const [checkQuestion, setCheckQuestion] = useState<CheckQuestionData | null>(null);
  const [selectedCheckIndex, setSelectedCheckIndex] = useState<number | null>(null);
  const [checkResult, setCheckResult] = useState<{ isPassed: boolean; repairExplanation?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handlePredictSubmit = async () => {
    if (!predictionText.trim()) return;
    setIsLoading(true);
    try {
      const res = await onSubmitPrediction(predictionText.trim());
      setTeachProse(res.teachProse);
      setCheckQuestion(res.checkQuestion);
      setCurrentStep('teach');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckSubmit = async () => {
    if (selectedCheckIndex === null) return;
    setIsLoading(true);
    try {
      const res = await onSubmitCheck(selectedCheckIndex);
      setCheckResult(res);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[#1e293b] bg-[#111111] p-6 shadow-2xl text-gray-200">
      {/* Concept Header */}
      <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
        <div className="flex items-center space-x-2">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <span className="font-semibold text-xs tracking-wider uppercase text-emerald-400">
            Ciclo Socrático: {node.title}
          </span>
        </div>
        <div className="flex space-x-1 text-[10px] font-mono font-bold">
          <span className={`px-2 py-0.5 rounded ${currentStep === 'predict' ? 'bg-purple-950 text-purple-300 border border-purple-700' : 'text-gray-500'}`}>
            1. PREDICT
          </span>
          <span className={`px-2 py-0.5 rounded ${currentStep === 'teach' ? 'bg-blue-950 text-blue-300 border border-blue-700' : 'text-gray-500'}`}>
            2. TEACH
          </span>
          <span className={`px-2 py-0.5 rounded ${currentStep === 'check' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'text-gray-500'}`}>
            3. CHECK
          </span>
        </div>
      </div>

      {/* PHASE 1: PREDICT */}
      {currentStep === 'predict' && (
        <div className="flex flex-col gap-3 animate-in fade-in duration-150">
          <div className="text-xs text-purple-300 italic">{promptGoal}</div>
          <p className="text-sm font-serif leading-relaxed text-gray-100">{predictQuestion}</p>

          <textarea
            value={predictionText}
            onChange={(e) => setPredictionText(e.target.value)}
            placeholder="Qual é a sua hipótese ou previsão intuitiva?"
            rows={3}
            className="w-full rounded border border-[#1e293b] bg-[#0a0a0a] p-3 text-xs text-gray-200 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
          />

          <div className="flex justify-end">
            <button
              onClick={handlePredictSubmit}
              disabled={isLoading || !predictionText.trim()}
              className="flex items-center space-x-2 rounded bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 transition-colors disabled:opacity-50"
            >
              <span>{isLoading ? 'Conectando...' : 'Submeter Previsão'}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* PHASE 2: TEACH */}
      {currentStep === 'teach' && (
        <div className="flex flex-col gap-4 animate-in fade-in duration-150">
          <div className="rounded border border-blue-900/60 bg-blue-950/20 p-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 block mb-1">
              Explicação Cirúrgica de 1 Degrau
            </span>
            <p className="text-xs leading-relaxed text-gray-200 whitespace-pre-wrap">{teachProse}</p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setCurrentStep('check')}
              className="flex items-center space-x-2 rounded bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors shadow-md"
            >
              <span>Check Your Understanding</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* PHASE 3: CHECK */}
      {currentStep === 'check' && checkQuestion && (
        <div className="flex flex-col gap-4 animate-in fade-in duration-150">
          <div className="text-sm font-medium text-gray-100 font-serif">
            {checkQuestion.questionText}
          </div>

          <div className="flex flex-col gap-2">
            {checkQuestion.options.map((opt, idx) => {
              const isSelected = selectedCheckIndex === idx;
              return (
                <div
                  key={idx}
                  onClick={() => !checkResult && setSelectedCheckIndex(idx)}
                  className={`flex cursor-pointer items-center space-x-3 rounded border p-3 text-xs transition-all ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-950/30 text-white'
                      : 'border-[#1e293b] bg-[#0a0a0a]/60 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[11px] font-bold ${
                    isSelected ? 'bg-emerald-500 text-black' : 'bg-[#1e293b] text-gray-400'
                  }`}>
                    {idx + 1}
                  </span>
                  <span>{opt}</span>
                </div>
              );
            })}
          </div>

          {!checkResult && (
            <div className="flex justify-end pt-2">
              <button
                onClick={handleCheckSubmit}
                disabled={isLoading || selectedCheckIndex === null}
                className="rounded bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Verificando...' : 'Confirmar Resposta'}
              </button>
            </div>
          )}

          {/* Feedback and Repair */}
          {checkResult && (
            <div className="mt-2 flex flex-col gap-3">
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
                  <p className="text-[11px] leading-relaxed">{checkResult.repairExplanation}</p>
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
      )}
    </div>
  );
};
