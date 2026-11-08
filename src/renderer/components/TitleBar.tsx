import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

interface TitleBarProps {
  title?: string;
  phaseLabel?: string;
}

export const TitleBar: React.FC<TitleBarProps> = ({ title, phaseLabel }) => {
  const { t } = useI18n();
  const [isMaximized, setIsMaximized] = useState(false);

  // The window also changes by double-clicking the bar or by the system: the main process is the source of truth
  useEffect(() => window.api?.onMaximizedChange?.(setIsMaximized), []);

  const handleWindowAction = (action: 'minimize' | 'maximize' | 'close') => {
    window.api?.windowAction?.(action);
  };

  return (
    <header
      className="flex h-14 w-full shrink-0 select-none items-center justify-between gap-4 border-b border-ink-700 bg-ink-950 px-6 text-xs text-gray-400"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      <h1 title={title} className="min-w-0 flex-1 truncate font-serif text-2xl font-semibold text-gray-100">
        {title}
      </h1>

      {phaseLabel && (
        <div
          className="flex shrink-0 items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-400"
          data-testid="phase-badge"
        >
          <span className="h-4 w-4 rounded-full border-2 border-ink-400 border-t-gray-300" aria-hidden />
          <span>{phaseLabel}</span>
        </div>
      )}

      {/* Linux Default Window Control Buttons (Zorin / GNOME style) */}
      <div
        className="flex items-center space-x-2.5"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <button
          type="button"
          onClick={() => handleWindowAction('minimize')}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-600 text-[#e0e0e0] hover:bg-ink-400 active:bg-ink-400 transition-colors focus-ring"
          title={t('window.minimize')}
          aria-label={t('window.minimize')}
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
            <path d="M4 7v2h8V7z" fillRule="evenodd" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => handleWindowAction('maximize')}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-600 text-[#e0e0e0] hover:bg-ink-400 active:bg-ink-400 transition-colors focus-ring"
          title={isMaximized ? t('window.restore') : t('window.maximize')}
          aria-label={isMaximized ? t('window.restore') : t('window.maximize')}
        >
          {isMaximized ? (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
              <path d="M14 7V5h-3V2H9v3.78C9 6.45 9.525 7 10.188 7zm-7 7v-3.78C7 9.55 6.476 9 5.813 9H2v2h3v3z" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
              <path d="M8 3v2h3v3h2V4.22C13 3.55 12.476 3 11.813 3zM3 8v3.78c0 .67.525 1.22 1.188 1.22H8v-2H5V8z" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleWindowAction('close')}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-600 text-[#e0e0e0] hover:bg-[#c73838] hover:text-white active:bg-[#a82828] transition-colors focus-ring"
          title={t('window.close')}
          aria-label={t('window.close')}
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
            <path d="M5 4a1 1 0 0 0-.707 1.707L6.586 8l-2.293 2.293A1 1 0 0 0 5 12a1 1 0 0 0 .707-.293L8 9.414l2.283 2.283A1 1 0 0 0 12 11a1 1 0 0 0-.293-.707L9.414 8l2.283-2.283A1 1 0 0 0 11 4a1 1 0 0 0-.707.293L8 6.586 5.717 4.302A1.01 1.01 0 0 0 5 4z" />
          </svg>
        </button>
      </div>
    </header>
  );
};
