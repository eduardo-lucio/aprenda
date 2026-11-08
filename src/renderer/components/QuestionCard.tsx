import React, { useRef } from 'react';
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
  const groupRef = useRef<HTMLDivElement | null>(null);
  const dashedIndex = options.length;
  const count = options.length + (dashedOption ? 1 : 0);
  const selectAt = (i: number) => (i === dashedIndex ? dashedOption?.onSelect() : onSelect(i));
  // One tab stop for the whole group: the chosen option, or the first one
  const tabStop = dashedOption?.selected ? dashedIndex : selectedIndex ?? 0;

  const handleKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      selectAt(i);
      return;
    }
    const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + count) % count;
    groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
    selectAt(next);
  };

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

      <div ref={groupRef} role="radiogroup" aria-label={label} className="flex flex-col gap-2">
        {options.map((opt, idx) => {
          const isSelected = selectedIndex === idx;
          return (
            <div
              key={idx}
              role="radio"
              aria-checked={isSelected}
              tabIndex={tabStop === idx ? 0 : -1}
              onClick={() => onSelect(idx)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`focus-ring flex cursor-pointer items-center space-x-3 rounded-xl border px-4 py-3 text-[13px] transition-colors ${
                isSelected
                  ? 'border-gray-300 bg-ink-800 text-white'
                  : 'border-ink-600 bg-ink-800 text-gray-300 hover:border-ink-400 hover:bg-ink-700'
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isSelected ? 'border-gray-200' : 'border-ink-400 bg-transparent'
                }`}
              >
                {isSelected && <span className="h-2 w-2 rounded-full bg-gray-100" />}
              </span>
              <RichText text={opt} className="leading-snug" />
            </div>
          );
        })}

        {dashedOption && (
          <div
            role="radio"
            aria-checked={dashedOption.selected}
            tabIndex={tabStop === dashedIndex ? 0 : -1}
            onClick={dashedOption.onSelect}
            onKeyDown={(e) => handleKeyDown(e, dashedIndex)}
            className={`focus-ring flex cursor-pointer items-center space-x-3 rounded-xl border border-dashed px-4 py-3 text-xs transition-colors ${
              dashedOption.selected
                ? dashedTone === 'amber'
                  ? 'border-amber-500/80 bg-amber-950/20 text-amber-200'
                  : 'border-gray-300 bg-ink-800 text-white'
                : 'border-ink-500 bg-transparent text-gray-400 hover:border-gray-500 hover:bg-ink-800/40'
            }`}
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                dashedOption.selected
                  ? dashedTone === 'amber'
                    ? 'border-amber-400 bg-amber-500/20'
                    : 'border-gray-200'
                  : 'border-gray-600 bg-transparent'
              }`}
            >
              {dashedOption.selected && (
                <span
                  className={`h-2 w-2 rounded-full ${dashedTone === 'amber' ? 'bg-amber-400' : 'bg-gray-100'}`}
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
