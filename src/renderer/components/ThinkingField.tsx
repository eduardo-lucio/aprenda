import React, { KeyboardEvent } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

interface ThinkingFieldProps {
  value: string;
  onChange: (val: string) => void;
  isRecording?: boolean;
  isTranscribing?: boolean;
  isSubmitting?: boolean;
  onToggleRecording?: () => void;
  onSubmitHotkey?: () => void;
  placeholder?: string;
  errorMessage?: string | null;
}

export const ThinkingField: React.FC<ThinkingFieldProps> = ({
  value,
  onChange,
  isRecording = false,
  isTranscribing = false,
  isSubmitting = false,
  onToggleRecording,
  onSubmitHotkey,
  placeholder = 'Escreva ou dite seu raciocínio livre aqui antes de enviar a resposta...',
  errorMessage,
}) => {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (onSubmitHotkey) onSubmitHotkey();
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#262626] bg-[#0e0e0e] p-3.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          YOUR THINKING
        </span>

        <button
          type="button"
          onClick={onToggleRecording}
          disabled={isTranscribing}
          title="Ditar raciocínio por voz"
          className={`flex items-center space-x-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-mono transition-colors border ${
            isTranscribing
              ? 'bg-purple-950/60 text-purple-300 border-purple-700 cursor-wait'
              : isRecording
              ? 'bg-red-950 text-red-400 border-red-700 animate-pulse'
              : 'bg-[#1a1a1a] text-gray-400 border-[#2e2e2e] hover:text-gray-200 hover:bg-[#242424]'
          }`}
        >
          {isTranscribing ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-purple-300" />
              <span>Transcrevendo...</span>
            </>
          ) : isRecording ? (
            <>
              <Mic className="h-3 w-3 text-red-400" />
              <span>Ouvindo...</span>
            </>
          ) : (
            <>
              <MicOff className="h-3 w-3 text-gray-400" />
              <span>Gravar Voz</span>
            </>
          )}
        </button>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none bg-transparent py-1 text-xs text-gray-200 placeholder:text-gray-500 focus:outline-none"
      />

      {errorMessage && (
        <div className="rounded bg-amber-950/40 px-2.5 py-1.5 text-[11px] text-amber-400 border border-amber-800/50">
          {errorMessage}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="font-mono text-[10px] text-gray-500">
          ↵ submits · ⇧↵ newline
        </span>

        <button
          type="button"
          onClick={onSubmitHotkey}
          disabled={isSubmitting}
          className="rounded-md bg-[#2a2a2a] hover:bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-gray-200 hover:text-white transition-colors disabled:opacity-50"
        >
          {isSubmitting ? 'Avaliando...' : 'Enviar Resposta'}
        </button>
      </div>
    </div>
  );
};
