import React, { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';

interface ScopeOrientationCardProps {
  questionText: string;
  options: string[];
  onSubmit: (selectedOption: string, thinkingText: string) => void;
  isSubmitting?: boolean;
}

export const ScopeOrientationCard: React.FC<ScopeOrientationCardProps> = ({
  questionText,
  options,
  onSubmit,
  isSubmitting = false,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [customText, setCustomText] = useState<string>('');
  const [thinkingText, setThinkingText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleSelectOption = (idx: number) => {
    setSelectedIndex(idx);
    setIsCustomMode(false);
    setError(null);
  };

  const handleSelectCustom = () => {
    setSelectedIndex(null);
    setIsCustomMode(true);
    setError(null);
  };

  const handleSubmit = () => {
    let chosenOption = '';
    if (isCustomMode) {
      chosenOption = customText.trim();
      if (!chosenOption) {
        setError('Digite sua opção personalizada antes de enviar.');
        return;
      }
    } else if (selectedIndex !== null && options[selectedIndex]) {
      chosenOption = options[selectedIndex];
    } else {
      setError('Escolha uma das opções acima ou digite uma opção personalizada.');
      return;
    }

    setError(null);
    onSubmit(chosenOption, thinkingText.trim());
  };

  const isSubmitDisabled =
    isSubmitting || (selectedIndex === null && (!isCustomMode || !customText.trim()));

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[#282828] bg-[#141414] p-5 sm:p-6 shadow-2xl text-gray-200">
      {/* Header: QUESTION */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          QUESTION
        </span>
      </div>

      {/* Question Prompt Text */}
      <div className="text-sm font-semibold leading-relaxed text-gray-100">
        {questionText}
      </div>

      {/* 9 Options List */}
      <div className="flex flex-col gap-2">
        {options.map((opt, idx) => {
          const isSelected = !isCustomMode && selectedIndex === idx;
          return (
            <div
              key={idx}
              onClick={() => handleSelectOption(idx)}
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
              <span className="leading-snug">{opt}</span>
            </div>
          );
        })}

        {/* 10th Dashed Option: "Type your own answer..." */}
        <div
          onClick={handleSelectCustom}
          className={`flex cursor-pointer items-center space-x-3 rounded-lg border border-dashed px-4 py-2.5 text-xs transition-all ${
            isCustomMode
              ? 'border-emerald-500/80 bg-emerald-950/20 text-white'
              : 'border-[#2e2e2e] bg-transparent text-gray-400 hover:border-gray-500 hover:bg-[#181818]/40'
          }`}
        >
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
              isCustomMode ? 'border-emerald-400 bg-emerald-500/20' : 'border-gray-600 bg-transparent'
            }`}
          >
            {isCustomMode && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
          </span>

          {isCustomMode ? (
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation();
                  handleSubmit();
                }
              }}
              placeholder="Digite seu próprio objetivo ou recorte personalizado..."
              className="flex-1 bg-transparent text-xs text-white outline-none placeholder-gray-500"
              autoFocus
            />
          ) : (
            <span className="text-gray-400 italic">Type your own answer...</span>
          )}
        </div>
      </div>

      {error && <div className="text-[11px] text-red-400">{error}</div>}

      {/* YOUR THINKING Section */}
      <div className="border-t border-[#222222] pt-3 space-y-2">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          YOUR THINKING
        </div>

        <textarea
          value={thinkingText}
          onChange={(e) => setThinkingText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Why this answer? Whatever comes to mind."
          rows={2}
          className="w-full resize-none rounded-lg border border-[#262626] bg-[#0e0e0e] p-3 text-xs text-gray-200 outline-none focus:border-emerald-500 placeholder-gray-500 transition-colors"
        />

        <div className="flex items-center justify-between pt-1">
          <div className="font-mono text-[10px] text-gray-500 space-x-2">
            <span>↵ submits</span>
            <span>⇧↵ newline</span>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            className="flex items-center space-x-1.5 rounded-lg bg-[#282828] hover:bg-emerald-600 px-4 py-2 text-xs font-semibold text-gray-200 hover:text-white transition-colors disabled:opacity-40 shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Processando...</span>
              </>
            ) : (
              <>
                <span>Submit answer</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
