import React from 'react';
import { RichText } from './RichText';

export interface QuestionCardDashedOption {
  label: string;
  selected: boolean;
  onSelect: () => void;
  tone?: 'emerald' | 'amber';
}

interface QuestionCardProps {
  /** Small caps header, e.g. "PROBE #2", "QUESTION", "CHECK". */
  label: string;
  /** Optional right-aligned context (e.g. the anchor concept). */
  anchor?: string;
  questionText: string;
  options: string[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  /** Optional dashed row below the options ("Não sei", "Insira um escopo personalizado..."). */
  dashedOption?: QuestionCardDashedOption;
}

/**
 * Presentational question block. It owns no input of its own: the reasoning / custom answer
 * is typed in the shared chat field that is docked right below it.
 */
export const QuestionCard: React.FC<QuestionCardProps> = ({
  label,
  anchor,
  questionText,
  options,
  selectedIndex,
  onSelect,
  dashedOption,
}) => {
  const dashedTone = dashedOption?.tone === 'amber' ? 'amber' : 'emerald';

  return (
    <div className="flex flex-col gap-3 text-gray-200">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          {label}
        </span>
        {anchor && (
          <span className="font-mono text-[10px] text-gray-500 truncate max-w-[260px]">{anchor}</span>
        )}
      </div>

      <RichText text={questionText} className="text-sm font-semibold leading-relaxed text-gray-100" />

      <div className="flex flex-col gap-2">
        {options.map((opt, idx) => {
          const isSelected = selectedIndex === idx;
          return (
            <div
              key={idx}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onClick={() => onSelect(idx)}
              onKeyDown={(e) => {
                if (e.key === ' ') {
                  e.preventDefault();
                  onSelect(idx);
                }
              }}
              className={`flex cursor-pointer items-center space-x-3 rounded-lg border px-4 py-2.5 text-xs transition-all ${
                isSelected
                  ? 'border-emerald-500/80 bg-emerald-950/25 text-white ring-1 ring-emerald-500/30'
                  : 'border-[#282828] bg-[#181818] text-gray-300 hover:border-[#3a3a3a] hover:bg-[#1e1e1e]'
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isSelected ? 'border-emerald-400 bg-emerald-500/20' : 'border-gray-600 bg-transparent'
                }`}
              >
                {isSelected && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
              </span>
              <RichText text={opt} className="leading-snug" />
            </div>
          );
        })}

        {dashedOption && (
          <div
            role="radio"
            aria-checked={dashedOption.selected}
            tabIndex={0}
            onClick={dashedOption.onSelect}
            className={`flex cursor-pointer items-center space-x-3 rounded-lg border border-dashed px-4 py-2.5 text-xs transition-all ${
              dashedOption.selected
                ? dashedTone === 'amber'
                  ? 'border-amber-500/80 bg-amber-950/20 text-amber-200'
                  : 'border-emerald-500/80 bg-emerald-950/20 text-white'
                : 'border-[#2e2e2e] bg-transparent text-gray-400 hover:border-gray-500 hover:bg-[#181818]/40'
            }`}
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                dashedOption.selected
                  ? dashedTone === 'amber'
                    ? 'border-amber-400 bg-amber-500/20'
                    : 'border-emerald-400 bg-emerald-500/20'
                  : 'border-gray-600 bg-transparent'
              }`}
            >
              {dashedOption.selected && (
                <span
                  className={`h-2 w-2 rounded-full ${dashedTone === 'amber' ? 'bg-amber-400' : 'bg-emerald-400'}`}
                />
              )}
            </span>
            <span className="font-mono text-[11px] italic leading-snug">{dashedOption.label}</span>
          </div>
        )}
      </div>
    </div>
  );
};
