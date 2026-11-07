import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useI18n } from '../i18n';

interface AgentThinkingBlockProps {
  thinkingText?: string;
  defaultExpanded?: boolean;
  isStreaming?: boolean;
  statusLabel?: string;
}

export const AgentThinkingBlock: React.FC<AgentThinkingBlockProps> = ({
  thinkingText,
  defaultExpanded = false,
  isStreaming = false,
  statusLabel,
}) => {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || isStreaming);

  useEffect(() => {
    if (isStreaming) setIsExpanded(true);
  }, [isStreaming]);

  const text = thinkingText || t('thinking.placeholder');

  return (
    <div className="my-2 text-xs">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="group flex items-center gap-2 py-1.5 text-left text-gray-400 transition-colors hover:text-gray-200"
      >
        {/* Discreet "working" indicator on the left while the tutor is thinking */}
        {isStreaming && <span data-testid="thinking-indicator" className="thinking-dot" aria-hidden />}
        <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-gray-400 group-hover:text-gray-200">
          {t('thinking.label')}
        </span>
        {isExpanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-gray-500 group-hover:text-gray-300" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-gray-500 group-hover:text-gray-300" />
        )}
        {isStreaming && statusLabel && (
          <span className="ml-1 truncate font-sans text-[11px] text-gray-500">{statusLabel}</span>
        )}
      </button>

      {isExpanded && (
        <div className="mt-1.5 whitespace-pre-wrap pl-0.5 font-mono text-[11.5px] leading-relaxed text-gray-400/90">
          {text}
        </div>
      )}
    </div>
  );
};
