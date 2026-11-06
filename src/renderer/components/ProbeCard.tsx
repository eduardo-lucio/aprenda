import React from 'react';
import { ConfidenceSlider } from './ConfidenceSlider';

interface ProbeCardProps {
  /** The question block (QuestionCard). */
  children: React.ReactNode;
  /** Confidence row is shown only when a value handler is provided. */
  confidence?: number;
  onConfidenceChange?: (value: number) => void;
  reasoning: string;
  onReasoningChange: (value: string) => void;
  placeholder: string;
  canSend: boolean;
  disabled?: boolean;
  onSubmit: () => void;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
}

/**
 * Single in-flow card: question + options, confidence, reasoning field and submit button.
 * Replaces the former floating dock.
 */
export const ProbeCard: React.FC<ProbeCardProps> = ({
  children,
  confidence,
  onConfidenceChange,
  reasoning,
  onReasoningChange,
  placeholder,
  canSend,
  disabled,
  onSubmit,
  textareaRef,
}) => (
  <div data-testid="probe-card" className="card dock-variant overflow-hidden">
    <div className="p-5">{children}</div>

    {confidence !== undefined && onConfidenceChange && (
      <ConfidenceSlider value={confidence} onChange={onConfidenceChange} />
    )}

    <div className="p-3">
      <div className="rounded-xl border border-ink-600 bg-ink-950 px-3.5 py-3 transition-colors focus-within:border-ink-400">
        <label className="label-mono mb-1.5 block" htmlFor="probe-reasoning">
          Seu raciocínio
        </label>
        <textarea
          id="probe-reasoning"
          ref={textareaRef}
          value={reasoning}
          onChange={(e) => onReasoningChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          rows={2}
          className="w-full resize-none bg-transparent font-sans text-sm text-gray-200 outline-none placeholder:text-gray-500"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-[10px] text-gray-600">↵ envia · ⇧↵ nova linha</span>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSend}
            aria-label="Enviar resposta"
            className="rounded-md bg-gray-200 px-3.5 py-1.5 font-mono text-[11px] font-semibold text-ink-950 transition-colors hover:bg-white disabled:bg-ink-500 disabled:text-gray-400"
          >
            Enviar resposta
          </button>
        </div>
      </div>
    </div>
  </div>
);
