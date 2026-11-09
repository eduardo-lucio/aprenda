import React, { useLayoutEffect, useRef, useState } from 'react';

interface DictationOverlayProps {
  value: string;
  /** Same font and padding classes as the text field it covers. */
  className?: string;
}

const keyOf = (token: string, index: number) => `${index}:${token}`;

/**
 * A text field cannot style single words, so while dictating this copy of the text is drawn over it
 * (render it right after the transparent textarea). A word keeps its key while it stays the same, so
 * only new or corrected words animate. Mounted when dictation starts: text already there stays still.
 */
export const DictationOverlay: React.FC<DictationOverlayProps> = ({ value, className = '' }) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const tokens = value.split(/(\s+)/);
  const [alreadyThere] = useState(() => new Set(tokens.map(keyOf)));

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const field = overlay?.previousElementSibling as HTMLTextAreaElement | null;
    if (!overlay || !field) return;
    field.scrollTop = field.scrollHeight;
    overlay.style.width = `${field.clientWidth}px`;
    overlay.scrollTop = field.scrollTop;
  }, [value]);

  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      data-testid="dictation-overlay"
      className={`pointer-events-none absolute inset-y-0 left-0 overflow-hidden whitespace-pre-wrap break-words ${className}`}
    >
      {tokens.map((token, i) =>
        /^\s*$/.test(token) ? (
          token
        ) : (
          <span key={keyOf(token, i)} className={alreadyThere.has(keyOf(token, i)) ? undefined : 'dictated-word'}>
            {token}
          </span>
        )
      )}
    </div>
  );
};
