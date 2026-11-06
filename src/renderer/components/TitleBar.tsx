import React, { useState } from 'react';

interface TitleBarProps {
  title?: string;
}

export const TitleBar: React.FC<TitleBarProps> = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  const handleWindowAction = (action: 'minimize' | 'maximize' | 'close') => {
    if (window.api?.windowAction) {
      window.api.windowAction(action);
      if (action === 'maximize') {
        setIsMaximized((prev) => !prev);
      }
    }
  };

  return (
    <header
      className="flex h-9 w-full select-none items-center justify-between border-b border-[#141414] bg-[#0a0a0a] px-3.5 text-xs text-gray-400"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* Top-left is kept clean and minimalist: name and phrase removed */}
      <div className="flex-1 h-full" />

      {/* Linux Default Window Control Buttons (Zorin / GNOME style) */}
      <div
        className="flex items-center space-x-2.5"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <button
          type="button"
          onClick={() => handleWindowAction('minimize')}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-[#262626] text-[#e0e0e0] hover:bg-[#383838] active:bg-[#444] transition-colors focus:outline-none"
          title="Minimizar"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
            <path d="M4 7v2h8V7z" fillRule="evenodd" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => handleWindowAction('maximize')}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-[#262626] text-[#e0e0e0] hover:bg-[#383838] active:bg-[#444] transition-colors focus:outline-none"
          title={isMaximized ? 'Restaurar' : 'Maximizar'}
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
          className="flex h-6 w-6 items-center justify-center rounded-full bg-[#262626] text-[#e0e0e0] hover:bg-[#c73838] hover:text-white active:bg-[#a82828] transition-colors focus:outline-none"
          title="Fechar"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
            <path d="M5 4a1 1 0 0 0-.707 1.707L6.586 8l-2.293 2.293A1 1 0 0 0 5 12a1 1 0 0 0 .707-.293L8 9.414l2.283 2.283A1 1 0 0 0 12 11a1 1 0 0 0-.293-.707L9.414 8l2.283-2.283A1 1 0 0 0 11 4a1 1 0 0 0-.707.293L8 6.586 5.717 4.302A1.01 1.01 0 0 0 5 4z" />
          </svg>
        </button>
      </div>
    </header>
  );
};
