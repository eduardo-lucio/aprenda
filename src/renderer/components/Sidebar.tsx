import React, { useState } from 'react';
import { Search, Settings, Layers, Trash2, PanelLeft } from 'lucide-react';
import { useI18n } from '../i18n';

export interface SessionItem {
  id: string;
  title: string;
  mode: 'teaching' | 'practice';
  date: string;
}

interface SidebarProps {
  sessions: SessionItem[];
  activeSessionId?: string | null;
  /** True while a new (not yet started) session is open. */
  isCreating?: boolean;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession?: (id: string) => void;
  onOpenSettings?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  activeSessionId,
  isCreating = false,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onOpenSettings,
}) => {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const filteredSessions = sessions.filter((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()));

  if (collapsed) {
    return (
      <aside className="flex h-full w-12 shrink-0 flex-col items-center border-r border-ink-700 bg-ink-900 py-3 text-gray-400">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title={t('sidebar.expand')}
          aria-label={t('sidebar.expand')}
          className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-ink-700 hover:text-gray-200"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onOpenSettings}
          title={t('sidebar.settings')}
          aria-label={t('sidebar.settings')}
          className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-ink-700 hover:text-gray-200"
        >
          <Settings className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-ink-700 bg-ink-900 text-gray-300">
      {/* Brand + collapse */}
      <div className="flex h-14 shrink-0 items-center justify-between px-5">
        <Layers className="h-6 w-6 text-gray-100" aria-hidden />
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title={t('sidebar.collapse')}
          aria-label={t('sidebar.collapse')}
          className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-ink-700 hover:text-gray-200"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>

      {/* New session */}
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onNewSession}
          title={t('sidebar.newSessionHint')}
          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-[11px] font-semibold uppercase tracking-widest transition-colors ${
            isCreating ? 'bg-ink-700 text-gray-100' : 'text-gray-400 hover:bg-ink-800 hover:text-gray-200'
          }`}
        >
          {t('sidebar.newSession')}
        </button>
      </div>

      {/* Sessions header + search */}
      <div className="flex items-center gap-2 px-5 pb-3">
        <span className="label-mono">{t('sidebar.sessions')}</span>
        <div className="flex flex-1 items-center rounded border border-ink-600 bg-ink-850 px-2 py-1">
          <Search className="mr-1.5 h-3 w-3 text-gray-500" />
          <input
            type="text"
            placeholder={t('sidebar.search')}
            aria-label={t('sidebar.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent font-mono text-[11px] text-gray-200 outline-none placeholder:text-gray-600"
          />
        </div>
      </div>

      {/* Sessions list */}
      <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-2">
        {filteredSessions.length === 0 ? (
          <div className="p-4 text-center font-mono text-[11px] text-gray-600">{t('sidebar.empty')}</div>
        ) : (
          filteredSessions.map((s) => {
            const isActive = s.id === activeSessionId && !isCreating;
            return (
              <div
                key={s.id}
                onClick={() => onSelectSession(s.id)}
                className={`group relative flex cursor-pointer flex-col rounded-lg px-3 py-2.5 transition-colors ${
                  isActive ? 'bg-ink-700 text-gray-100' : 'text-gray-400 hover:bg-ink-800 hover:text-gray-200'
                }`}
              >
                <span className="truncate pr-5 text-sm font-medium">{s.title}</span>
                <span className="mt-1 font-mono text-[10px] text-gray-500">{s.date}</span>

                {onDeleteSession && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(s.id);
                    }}
                    title={t('sidebar.delete')}
                    aria-label={t('sidebar.delete')}
                    className="absolute right-2 top-2 hidden h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-red-950 hover:text-red-400 group-hover:flex"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <button
        type="button"
        onClick={onOpenSettings}
        title={t('sidebar.settings')}
        aria-label={t('sidebar.settings')}
        className="flex items-center gap-2 border-t border-ink-700 px-5 py-4 font-mono text-[11px] font-semibold uppercase tracking-widest text-gray-500 transition-colors hover:text-gray-200"
      >
        <Settings className="h-3.5 w-3.5" />
        <span>{t('sidebar.settings')}</span>
      </button>
    </aside>
  );
};
