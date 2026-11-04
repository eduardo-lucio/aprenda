import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

interface AgentThinkingBlockProps {
  thinkingText?: string;
  defaultExpanded?: boolean;
  isStreaming?: boolean;
  statusLabel?: string;
}

export const AgentThinkingBlock: React.FC<AgentThinkingBlockProps> = ({
  thinkingText = 'Analisando premissas conceituais, histórico de respostas e limites da fronteira de conhecimento...',
  defaultExpanded = false,
  isStreaming = false,
  statusLabel,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || isStreaming);
  const [displayedText, setDisplayedText] = useState(thinkingText);

  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true);
    }
  }, [isStreaming]);

  useEffect(() => {
    if (!isStreaming) {
      setDisplayedText(thinkingText);
      return;
    }

    // Real-time typewriter effect while streaming/thinking
    setDisplayedText('');
    let index = 0;
    const interval = setInterval(() => {
      index += 3;
      if (index >= thinkingText.length) {
        setDisplayedText(thinkingText);
        clearInterval(interval);
      } else {
        setDisplayedText(thinkingText.slice(0, index));
      }
    }, 18);

    return () => clearInterval(interval);
  }, [thinkingText, isStreaming]);

  return (
    <div className="my-2 text-xs">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="group flex items-center space-x-2 py-1.5 text-left text-gray-400 hover:text-gray-200 transition-colors"
      >
        <span className="font-mono text-[11px] font-semibold tracking-widest uppercase text-gray-400 group-hover:text-gray-200">
          AGENT&apos;S THINKING
        </span>
        {isExpanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-gray-500 group-hover:text-gray-300" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-gray-500 group-hover:text-gray-300" />
        )}
        {isStreaming && (
          <span className="flex items-center space-x-1.5 text-[11px] font-mono text-emerald-400/90 ml-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{statusLabel || 'Thinking...'}</span>
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="mt-1.5 pl-0.5 font-mono text-[11.5px] leading-relaxed text-gray-400/90 whitespace-pre-wrap">
          {displayedText}
          {isStreaming && (
            <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-emerald-400/80 animate-pulse" />
          )}
        </div>
      )}
    </div>
  );
};
