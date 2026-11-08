import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorNoticeProps {
  message: string;
  title?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export const ErrorNotice: React.FC<ErrorNoticeProps> = ({ message, title, onRetry, retryLabel }) => (
  <div
    role="alert"
    className="flex items-start gap-2 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-xs text-red-200"
  >
    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden />
    <div className="min-w-0 flex-1 space-y-1">
      {title && <span className="block font-semibold text-red-100">{title}</span>}
      <span className="block break-words">{message}</span>
    </div>
    {onRetry && retryLabel && (
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded border border-red-800 px-2.5 py-1 font-semibold text-red-100 transition-colors hover:bg-red-900/40"
      >
        {retryLabel}
      </button>
    )}
  </div>
);
