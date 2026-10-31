import React from 'react';
import { Minus, Square, X } from 'lucide-react';

interface TitleBarProps {
  title?: string;
}

export const TitleBar: React.FC<TitleBarProps> = ({ title = 'APRENDA — EduCognitive Agent Harness' }) => {
  const handleWindowAction = (action: 'minimize' | 'maximize' | 'close') => {
    if (window.api?.windowAction) {
      window.api.windowAction(action);
    }
  };

  return (
    <div
      className="flex h-9 w-full select-none items-center justify-between border-b border-[#1e293b] bg-[#0a0a0a] px-3 text-xs text-gray-400"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      <div className="flex items-center space-x-2">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm" />
        <span className="font-semibold tracking-wider text-gray-200">APRENDA</span>
        <span className="text-gray-600">|</span>
        <span className="font-serif italic text-gray-300">{title}</span>
      </div>

      <div
        className="flex items-center space-x-1"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <button
          onClick={() => handleWindowAction('minimize')}
          className="flex h-6 w-7 items-center justify-center rounded hover:bg-[#1e293b] hover:text-gray-200 transition-colors"
          title="Minimizar"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => handleWindowAction('maximize')}
          className="flex h-6 w-7 items-center justify-center rounded hover:bg-[#1e293b] hover:text-gray-200 transition-colors"
          title="Maximizar"
        >
          <Square className="h-3 w-3" />
        </button>
        <button
          onClick={() => handleWindowAction('close')}
          className="flex h-6 w-7 items-center justify-center rounded hover:bg-red-600 hover:text-white transition-colors"
          title="Fechar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
