import React, { useState } from 'react';
import { Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { ProbeAttempt } from '../../shared/types';
import { RichText } from './RichText';

interface AnsweredQuestionCardProps {
  attempt: ProbeAttempt;
  index: number;
}

export const AnsweredQuestionCard: React.FC<AnsweredQuestionCardProps> = ({ attempt }) => {
  const [showUserThinking, setShowUserThinking] = useState(true);

  const isCorrectOption = attempt.selectedOptionIndex === attempt.correctOptionIndex;
  const isDontKnow = attempt.selectedOptionIndex === -1;

  const getBadgeConfig = () => {
    if (isDontKnow) {
      return {
        label: "DIDN'T KNOW",
        className: 'bg-[#262626] text-gray-300 border border-[#383838]',
      };
    }
    if (attempt.verdict === 'mastered') {
      return {
        label: 'CORRECT',
        className: 'bg-emerald-950/90 text-emerald-400 border border-emerald-700/50',
      };
    }
    if (attempt.verdict === 'false_positive') {
      return {
        label: 'FALSE POSITIVE',
        className: 'bg-amber-950/90 text-amber-300 border border-amber-700/50',
      };
    }
    return {
      label: isCorrectOption ? 'PARTIAL' : 'INCORRECT',
      className: 'bg-red-950/90 text-red-400 border border-red-800/50',
    };
  };

  const badge = getBadgeConfig();

  return (
    <div className="rounded-xl border border-[#242424] bg-[#141414] p-5 shadow-lg space-y-4">
      {/* Header: PROBE + Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <span className="font-mono text-[11px] uppercase tracking-widest text-gray-400">
            PROBE
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
      </div>

      {/* Question Text */}
      <RichText text={attempt.questionText} className="text-sm font-semibold leading-relaxed text-gray-100" />

      {/* Options */}
      <div className="flex flex-col gap-2">
        {attempt.options.map((opt, idx) => {
          const isSelected = attempt.selectedOptionIndex === idx;
          const isCorrect = attempt.correctOptionIndex === idx;

          let boxStyle = 'border-[#262626] bg-[#181818]/60 text-gray-400';
          if (isCorrect) {
            boxStyle = 'border-emerald-700/60 bg-emerald-950/30 text-emerald-100';
          } else if (isSelected && !isCorrect) {
            boxStyle = 'border-red-800/60 bg-red-950/25 text-red-200';
          }

          return (
            <div
              key={idx}
              className={`flex items-center space-x-3 rounded-lg border px-4 py-2.5 text-xs transition-colors ${boxStyle}`}
            >
              {isCorrect ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              ) : isSelected ? (
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
          Answered &quot;I don&apos;t know&quot;.
        </div>
      ) : (
        <div className="flex items-center space-x-3 pt-1">
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[#262626]">
            <div
              className={`h-full rounded-full transition-all ${
                attempt.verdict === 'mastered'
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
      <div className="border-l-2 border-[#2e2e2e] pl-3 pt-0.5">
        <button
          type="button"
          onClick={() => setShowUserThinking(!showUserThinking)}
          className="flex items-center space-x-1.5 font-mono text-[10px] uppercase tracking-widest text-gray-400 hover:text-gray-200 transition-colors"
        >
          <span>YOUR THINKING</span>
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
};
