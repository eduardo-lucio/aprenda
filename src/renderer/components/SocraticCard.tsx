import React from 'react';
import { ConceptNode } from '../../shared/types';
import { RichText } from './RichText';
import { useI18n } from '../i18n';
import { Sparkles, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react';

export type SocraticStep = 'predict' | 'teach' | 'check';

interface SocraticCardProps {
  node: ConceptNode;
  step: SocraticStep;
  predictQuestion: string;
  promptGoal?: string;
  teachProse?: string;
  /** What the student guessed, kept in view while reading the explanation. */
  prediction?: string;
  checkResult?: { isPassed: boolean; repairExplanation?: string } | null;
  isLoading?: boolean;
  onAdvanceToCheck: () => void;
  onFinishStep: () => void;
}

/**
 * Feed-side view of one lesson (guess → explanation → check). All inputs (guess text, check option,
 * reasoning) live in the docked chat field at the bottom of the screen.
 */
export const SocraticCard: React.FC<SocraticCardProps> = ({
  node,
  step,
  predictQuestion,
  promptGoal,
  teachProse = '',
  prediction = '',
  checkResult = null,
  isLoading = false,
  onAdvanceToCheck,
  onFinishStep,
}) => {
  const { t } = useI18n();
  const stepPill = (active: boolean, tone: string) =>
    `px-2 py-0.5 rounded ${active ? tone : 'text-gray-500'}`;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-ink-700 bg-ink-900 p-6 shadow-2xl text-gray-200">
      <div className="flex items-center justify-between border-b border-ink-700 pb-3">
        <div className="flex min-w-0 items-center space-x-2">
          <Sparkles className="h-4 w-4 shrink-0 text-gray-300" />
          <span className="truncate font-semibold font-mono text-[10px] tracking-widest uppercase text-gray-300">
            {node.title}
          </span>
        </div>
        <div className="flex shrink-0 space-x-1 text-[10px] font-mono font-bold uppercase">
          <span className={stepPill(step === 'predict', 'bg-purple-950 text-purple-300 border border-purple-700')}>
            {t('lesson.step.predict')}
          </span>
          <span className={stepPill(step === 'teach', 'bg-blue-950 text-blue-300 border border-blue-700')}>
            {t('lesson.step.teach')}
          </span>
          <span className={stepPill(step === 'check', 'bg-emerald-950 text-emerald-300 border border-emerald-700')}>
            {t('lesson.step.check')}
          </span>
        </div>
      </div>

      {step === 'predict' && (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-purple-300 italic">{promptGoal || t('lesson.predictGoal')}</div>
          <RichText text={predictQuestion} className="text-sm font-serif leading-relaxed text-gray-100" />
          <p className="text-[11px] text-gray-500">{isLoading ? t('lesson.loading') : t('lesson.predictHint')}</p>
        </div>
      )}

      {step !== 'predict' && prediction && (
        <div className="border-l-2 border-ink-500 pl-3">
          <span className="block font-mono text-[10px] uppercase tracking-widest text-gray-400">
            {t('lesson.yourPrediction')}
          </span>
          <RichText text={prediction} className="mt-1 text-xs leading-relaxed text-gray-300" />
        </div>
      )}

      {(step === 'teach' || step === 'check') && (
        <div className="flex flex-col gap-4">
          <div className="rounded border border-blue-900/60 bg-blue-950/20 p-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 block mb-1">
              {t('lesson.explanation')}
            </span>
            <RichText text={teachProse} className="text-xs leading-relaxed text-gray-200" />
          </div>

          {step === 'teach' && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onAdvanceToCheck}
              className="flex items-center space-x-2 rounded bg-gray-200 px-4 py-2 text-xs font-semibold text-ink-950 hover:bg-white transition-colors shadow-md"
            >
              <span>{t('lesson.toCheck')}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          )}
        </div>
      )}

      {step === 'check' && !checkResult && (
        <p className="text-[11px] text-gray-500">{isLoading ? t('lesson.checking') : t('lesson.checkHint')}</p>
      )}

      {step === 'check' && checkResult && (
        <div className="flex flex-col gap-3">
          {checkResult.isPassed ? (
            <div className="flex items-center space-x-2 rounded border border-emerald-800 bg-emerald-950/40 p-3 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{t('lesson.passed')}</span>
            </div>
          ) : (
            <div className="rounded border border-amber-800 bg-amber-950/40 p-3 text-xs text-amber-200">
              <div className="flex items-center space-x-2 font-bold mb-1">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <span>{t('lesson.failed')}</span>
              </div>
              <RichText text={checkResult.repairExplanation || ''} className="text-[11px] leading-relaxed" />
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onFinishStep}
              className="rounded bg-gray-200 px-4 py-2 text-xs font-bold text-black hover:bg-white transition-colors"
            >
              {t('lesson.next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
