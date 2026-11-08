import React, { useState } from 'react';
import { Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { ProbeAttempt } from '../../shared/types';
import { RichText } from './RichText';
import { useI18n } from '../i18n';

interface AnsweredQuestionCardProps {
  attempt: ProbeAttempt;
  index: number;
  /** Sent, verdict not back yet: nothing here may reveal the answer key. */
  pending?: boolean;
}

export const AnsweredQuestionCard: React.FC<AnsweredQuestionCardProps> = React.memo(({ attempt, pending = false }) => {
  const { t } = useI18n();
  const [showUserThinking, setShowUserThinking] = useState(true);

  const isCorrectOption = attempt.selectedOptionIndex === attempt.correctOptionIndex;
  const isOwnAnswer = attempt.selectedOptionIndex === -1 && attempt.answerKind === 'own_answer';
  const isDontKnow = attempt.selectedOptionIndex === -1 && !isOwnAnswer;

  const getBadgeConfig = () => {
    if (isDontKnow) {
      return {
        label: t('answered.badge.dontKnow'),
        className: 'bg-ink-600 text-gray-300 border border-ink-400',
      };
    }
    if (attempt.verdict === 'mastered') {
      return {
        label: t('answered.badge.correct'),
        className: 'bg-emerald-950/90 text-emerald-400 border border-emerald-700/50',
      };
    }
    if (attempt.verdict === 'false_positive') {
      return {
        label: t('answered.badge.falsePositive'),
        className: 'bg-amber-950/90 text-amber-300 border border-amber-700/50',
      };
    }
    return {
      // A written answer has no answer-key bit: anything short of mastery is only partial
      label: isCorrectOption || (isOwnAnswer && attempt.verdict === 'frontier') ? t('answered.badge.partial') : t('answered.badge.wrong'),
      className: 'bg-red-950/90 text-red-400 border border-red-800/50',
    };
  };

  const badge = getBadgeConfig();

  return (
    <div className="card p-5 space-y-4">
      {/* Header: PROBE + Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <span className="font-mono text-[11px] uppercase tracking-widest text-gray-400">
            {t('answered.header')}
          </span>
          {!pending && (
            <span
              className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${badge.className}`}
            >
              {badge.label}
            </span>
          )}
        </div>
      </div>

      {/* Question Text */}
      <RichText text={attempt.questionText} className="text-sm font-semibold leading-relaxed text-gray-100" />

      {/* Options */}
      <div className="flex flex-col gap-2">
        {attempt.options.map((opt, idx) => {
          const isSelected = attempt.selectedOptionIndex === idx;
          const isCorrect = !pending && attempt.correctOptionIndex === idx;

          let boxStyle = 'border-ink-600 bg-ink-800/60 text-gray-400';
          if (pending && isSelected) {
            boxStyle = 'border-ink-400 bg-ink-700/60 text-gray-100';
          } else if (isCorrect) {
            boxStyle = 'border-emerald-700/60 bg-emerald-950/30 text-emerald-100';
          } else if (isSelected && !isCorrect) {
            boxStyle = 'border-red-800/60 bg-red-950/25 text-red-200';
          }

          return (
            <div
              key={idx}
              className={`flex items-center space-x-3 rounded-xl border px-4 py-3 text-[13px] transition-colors ${boxStyle}`}
            >
              {isCorrect ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              ) : isSelected && !pending ? (
                <X className="h-3.5 w-3.5 shrink-0 text-red-400" />
              ) : (
                <span className="h-3.5 w-3.5 shrink-0" />
              )}
              <RichText text={opt} className="leading-snug" />
            </div>
          );
        })}
      </div>

      {/* Confidence Bar OR Answered "I don't know" */}
      {isDontKnow ? (
        <div className="text-xs text-gray-400 pt-0.5">
          {t('answered.dontKnow')}
        </div>
      ) : attempt.confidence === undefined ? null : (
        <div className="flex items-center space-x-3 pt-1">
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-ink-600">
            <div
              className={`h-full rounded-full transition-all ${
                pending
                  ? 'bg-ink-400'
                  : attempt.verdict === 'mastered'
                  ? 'bg-emerald-500'
                  : attempt.verdict === 'false_positive'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500/80'
              }`}
              style={{ width: `${Math.max(4, attempt.confidence)}%` }}
            />
          </div>
          <span className="font-mono text-[11px] text-gray-400 shrink-0">
            {attempt.confidence}%
          </span>
        </div>
      )}

      {/* Collapsible YOUR THINKING */}
      <div className="border-l-2 border-ink-500 pl-3 pt-0.5">
        <button
          type="button"
          onClick={() => setShowUserThinking(!showUserThinking)}
          className="flex items-center space-x-1.5 font-mono text-[10px] uppercase tracking-widest text-gray-400 hover:text-gray-200 transition-colors"
        >
          <span>{isOwnAnswer ? t('answered.ownAnswer') : t('answered.reasoning')}</span>
          {showUserThinking ? (
            <ChevronUp className="h-3 w-3 text-gray-500" />
          ) : (
            <ChevronDown className="h-3 w-3 text-gray-500" />
          )}
        </button>

        {showUserThinking && (
          <RichText text={attempt.thinkingText} className="mt-1.5 text-xs text-gray-300 leading-relaxed" />
        )}
      </div>
    </div>
  );
});
