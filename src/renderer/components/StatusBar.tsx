import React from 'react';
import { Mic, Cpu, Sparkles, Activity } from 'lucide-react';

interface StatusBarProps {
  questionCount?: number;
  frontierClarity?: number;
  modelName?: string;
  thinkingLevel?: string;
  isRecording?: boolean;
  onToggleDictate?: () => void;
  tokenCount?: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  questionCount = 0,
  frontierClarity = 0,
  modelName = 'gemini-2.0-flash',
  thinkingLevel = 'High',
  isRecording = false,
  onToggleDictate,
  tokenCount = 1420,
}) => {
  return (
    <footer className="flex h-8 w-full select-none items-center justify-between border-t border-[#1e293b] bg-[#0c0c0c] px-4 text-[11px] text-gray-400">
      {/* Left side: Dictate / Voice Status */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleDictate}
          className={`flex items-center space-x-1.5 rounded px-2 py-0.5 transition-colors ${
            isRecording
              ? 'bg-red-950 text-red-400 border border-red-700 animate-pulse'
              : 'hover:bg-[#1e293b] text-gray-300'
          }`}
          title="Ativar/Desativar Ditado por Voz"
        >
          <Mic className={`h-3.5 w-3.5 ${isRecording ? 'text-red-400' : 'text-gray-400'}`} />
          <span className="font-medium">{isRecording ? 'Ouvindo...' : 'Dictate'}</span>
        </button>

        <span className="text-gray-700">|</span>

        <div className="flex items-center space-x-1.5 text-gray-400">
          <Activity className="h-3 w-3 text-emerald-400" />
          <span>Fronteira: <strong className="text-gray-200">{frontierClarity}%</strong></span>
        </div>
      </div>

      {/* Right side: Model info, Thinking level, Tokens */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-1 text-gray-400">
          <Sparkles className="h-3 w-3 text-purple-400" />
          <span>Thinking: <strong className="text-gray-300">{thinkingLevel}</strong></span>
        </div>

        <span className="text-gray-700">|</span>

        <div className="flex items-center space-x-1 text-gray-400">
          <Cpu className="h-3 w-3 text-blue-400" />
          <span className="font-mono text-gray-300">{modelName}</span>
        </div>

        <span className="text-gray-700">|</span>

        <span className="text-gray-400">
          Q: <strong className="text-gray-200">{questionCount}</strong> / 8+
        </span>

        <span className="text-gray-700">|</span>

        <span className="font-mono text-gray-500">{tokenCount.toLocaleString()} tok</span>
      </div>
    </footer>
  );
};
