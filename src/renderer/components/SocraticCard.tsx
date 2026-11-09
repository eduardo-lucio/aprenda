import React from 'react';
import { ConceptNode, ProbeAttempt } from '../../shared/types';
import { RichText } from './RichText';
import { AnsweredQuestionCard } from './AnsweredQuestionCard';
import { useI18n } from '../i18n';
import { ArrowRight } from 'lucide-react';

export type SocraticStep = 'predict' | 'teach' | 'check';

interface SocraticCardProps {
  node: ConceptNode;
  step: SocraticStep;
  predictQuestion: string;
  promptGoal?: string;
  teachProse?: string;
  /** What the student guessed, kept in view while reading the explanation. */
  prediction?: string;
  /** The answered check, shown like an answered probe question. */
  answeredCheck?: ProbeAttempt | null;
  /** False once the verdict says the concept is not mastered: the next lesson repeats it. */
  mastered?: boolean;
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
  teachProse = '',
  prediction = '',
  answeredCheck = null,
  mastered,
  isLoading = false,
  onAdvanceToCheck,
  onFinishStep,
}) => {
  const { t } = useI18n();
  const sectionLabel = (text: string, tone: string) => (
    <span className={`font-mono text-[10px] font-bold uppercase tracking-widest ${tone}`}>{text}</span>
  );

  return (
    <div className="flex flex-col gap-6 text-gray-200">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-mono text-[11px] font-semibold uppercase tracking-widest text-gray-300">
          {node.title}
        </span>
      </div>

      {/* 1 · Palpite: the question, then what the student answered, as in a conversation */}
      <section className="flex flex-col gap-3">
        {sectionLabel(t('lesson.section.predict'), 'text-purple-300')}
        <RichText text={predictQuestion} className="font-serif text-base leading-relaxed text-gray-100" />
        {step === 'predict' && (
          <p className="text-[11px] text-gray-500">{isLoading ? t('lesson.loading') : t('lesson.predictHint')}</p>
        )}
      </section>

      {prediction && (
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-ink-700 px-4 py-2.5">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-gray-400">
            {t('lesson.yourPrediction')}
          </span>
          <RichText text={prediction} className="text-sm leading-relaxed text-gray-100" />
        </div>
      )}

      {/* 2 · Explicação */}
      {(step === 'teach' || step === 'check') && (
        <section className="flex flex-col gap-3">
          {sectionLabel(t('lesson.section.teach'), 'text-blue-300')}
          <div className="rounded-xl bg-ink-850 px-5 py-4">
            <RichText text={teachProse} className="text-sm leading-7 text-gray-100" />
          </div>
          {step === 'teach' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onAdvanceToCheck}
                className="flex items-center space-x-2 rounded bg-gray-200 px-4 py-2 text-xs font-semibold text-ink-950 shadow-md transition-colors hover:bg-white"
              >
                <span>{t('lesson.toCheck')}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </section>
      )}

      {/* 3 · Verificação (the question and options are docked above the chat field) */}
      {step === 'check' && (
        <section className="flex flex-col gap-3 border-t border-ink-700 pt-5">
          {answeredCheck ? (
            <>
              <AnsweredQuestionCard
                attempt={answeredCheck}
                index={0}
                label={t('lesson.section.check')}
                diagnosisLabel={t('lesson.explanation')}
              />
              {mastered === false && (
                <p className="text-sm text-amber-200">
                  {t(answeredCheck.selectedOptionIndex === answeredCheck.correctOptionIndex ? 'lesson.retryWeak' : 'lesson.retryWrong')}
                </p>
              )}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={onFinishStep}
                  disabled={isLoading}
                  className="rounded bg-gray-200 px-4 py-2 text-xs font-bold text-black transition-colors hover:bg-white disabled:cursor-wait disabled:opacity-50"
                >
                  {t(mastered === false ? 'lesson.retry' : 'lesson.next')}
                </button>
              </div>
            </>
          ) : (
            <>
              {sectionLabel(t('lesson.section.check'), 'text-emerald-300')}
              <p className="text-[11px] text-gray-500">{isLoading ? t('lesson.checking') : t('lesson.checkHint')}</p>
            </>
          )}
        </section>
      )}
    </div>
  );
};
