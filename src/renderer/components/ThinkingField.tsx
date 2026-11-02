import React, { KeyboardEvent } from 'react';
import { Mic, MicOff, MessageSquare, Loader2 } from 'lucide-react';

interface ThinkingFieldProps {
  value: string;
  onChange: (val: string) => void;
  isRecording?: boolean;
  isTranscribing?: boolean;
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
    <div className="flex flex-col gap-1.5 rounded-md border border-[#1e293b] bg-[#0a0a0a] p-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5 text-gray-300">
          <MessageSquare className="h-4 w-4 text-purple-400" />
          <span className="font-semibold uppercase text-[11px] tracking-wider text-gray-200">
            Your Thinking (Autoexplicação)
          </span>
          <span className="text-[10px] text-gray-500 font-normal italic">
            — avaliado antes da letra marcada
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleRecording}
          disabled={isTranscribing}
          title="Ditar raciocínio por voz"
          className={`flex items-center space-x-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors border ${
            isTranscribing
              ? 'bg-purple-950/60 text-purple-300 border-purple-700 cursor-wait'
              : isRecording
              ? 'bg-red-950 text-red-400 border-red-700 animate-pulse'
              : 'bg-[#1e293b]/60 text-gray-300 border-[#334155] hover:bg-[#1e293b]'
          }`}
        >
          {isTranscribing ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-purple-300" />
              <span>Transcrevendo voz...</span>
            </>
          ) : isRecording ? (
            <>
              <Mic className="h-3 w-3 text-red-400" />
              <span>Gravando áudio... (Parar)</span>
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
        className="w-full resize-none rounded bg-[#111111] p-2.5 text-xs text-gray-200 placeholder:text-gray-600 border border-[#1e293b]/80 focus:border-purple-500/80 focus:outline-none"
      />

      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <span>Enter para enviar • Shift+Enter para quebra de linha</span>
        <span>{value.trim().length} caracteres</span>
      </div>

      {errorMessage && (
        <div className="rounded bg-amber-950/40 p-2 text-[11px] text-amber-400 border border-amber-800/50">
          {errorMessage}
        </div>
      )}
    </div>
  );
};
