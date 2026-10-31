import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';

interface AgentThinkingBlockProps {
  thinkingText?: string;
  defaultExpanded?: boolean;
}

export const AgentThinkingBlock: React.FC<AgentThinkingBlockProps> = ({
  thinkingText = 'Analisando premissas conceituais, histórico de respostas e limites da fronteira de conhecimento...',
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="my-3 rounded-md border border-[#1e293b] bg-[#0f172a]/20 overflow-hidden text-xs">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-gray-400 hover:text-gray-200 transition-colors bg-[#111111]/60"
      >
        <div className="flex items-center space-x-2">
          <Brain className="h-3.5 w-3.5 text-purple-400" />
          <span className="font-semibold tracking-wider uppercase text-[10px] text-gray-300">
            Agent&apos;s Thinking
          </span>
          <span className="rounded bg-purple-950/60 px-1.5 py-0.2 text-[9px] text-purple-300 border border-purple-800/40">
            Internal
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-[#1e293b]/60 p-3 font-mono text-[11px] leading-relaxed text-gray-400 bg-[#0a0a0a]/90 whitespace-pre-wrap">
          {thinkingText}
        </div>
      )}
    </div>
  );
};
