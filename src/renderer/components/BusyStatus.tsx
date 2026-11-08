import React from 'react';

interface BusyStatusProps {
  label: string;
  cancelLabel: string;
  onCancel: () => void;
}

/** What the AI is doing right now, with a way out. */
export const BusyStatus: React.FC<BusyStatusProps> = ({ label, cancelLabel, onCancel }) => (
  <div role="status" className="flex items-center gap-2 px-1 text-xs text-gray-400">
    <span className="thinking-dot" aria-hidden />
    <span className="min-w-0 flex-1 truncate" title={label}>
      {label}
    </span>
    <button
      type="button"
      onClick={onCancel}
      className="shrink-0 rounded border border-ink-500 px-2.5 py-0.5 font-semibold text-gray-300 transition-colors hover:border-gray-400 hover:text-white"
    >
      {cancelLabel}
    </button>
  </div>
);
