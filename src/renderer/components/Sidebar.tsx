import React, { useEffect, useState } from 'react';
import { Search, Settings, Trash2, PanelLeft, Pin, PinOff, Pencil } from 'lucide-react';
import { useI18n } from '../i18n';

export interface SessionItem {
  id: string;
  title: string;
  mode: 'teaching' | 'practice';
  date: string;
  pinned?: boolean;
}

interface SidebarProps {
  sessions: SessionItem[];
  activeSessionId?: string | null;
  /** True while a new (not yet started) session is open. */
  isCreating?: boolean;
  /** An AI call is running: opening, creating and deleting sessions is disabled. */
  locked?: boolean;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession?: (id: string) => void;
  onRenameSession?: (id: string, title: string) => void;
  onPinSession?: (id: string, pinned: boolean) => void;
  onOpenSettings?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  activeSessionId,
  isCreating = false,
  locked = false,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onPinSession,
  onOpenSettings,
}) => {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const menuSession = menu ? sessions.find((s) => s.id === menu.id) : undefined;

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const finishRename = (save: boolean) => {
    if (save && renamingId && renameValue.trim()) onRenameSession?.(renamingId, renameValue);
    setRenamingId(null);
  };

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
        <svg viewBox="30 30 112 112" className="h-7 w-7" aria-hidden="true">
          <g stroke="#F3F4F6" strokeWidth="14.6" strokeLinecap="round" fill="none">
            <line x1="88.7" y1="38.5" x2="132" y2="132.5" />
            <line x1="85" y1="101" x2="117" y2="101" />
          </g>
          <circle cx="74.7" cy="69" r="10" fill="#F3F4F6" />
          <circle cx="57.2" cy="98.5" r="10" fill="#F3F4F6" />
          <circle cx="43.5" cy="129.5" r="11.8" fill="#F5D039" />
        </svg>
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
          disabled={locked}
          title={locked ? t('sidebar.locked') : t('sidebar.newSessionHint')}
          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-[11px] font-semibold uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            isCreating ? 'bg-ink-700 text-gray-100' : 'text-gray-400 hover:bg-ink-800 hover:text-gray-200'
          }`}
        >
          {t('sidebar.newSession')}
        </button>
      </div>

      {/* Sessions header + search */}
      <div className="flex items-center gap-2 px-5 pb-3">
        <span className="label-mono">{t('sidebar.sessions')}</span>
        <div className="flex flex-1 items-center rounded border border-ink-600 bg-ink-850 px-2 py-1 focus-within:border-gray-400">
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
                onContextMenu={(e) => {
                  if (locked) return;
                  e.preventDefault();
                  setConfirmingDeleteId(null);
                  setMenu({ id: s.id, x: Math.min(e.clientX, window.innerWidth - 190), y: Math.min(e.clientY, window.innerHeight - 140) });
                }}
                onMouseLeave={() => setConfirmingDeleteId((id) => (id === s.id ? null : id))}
                className={`group relative rounded-lg transition-colors ${
                  isActive ? 'bg-ink-700 text-gray-100' : 'text-gray-400 hover:bg-ink-800 hover:text-gray-200'
                } ${locked ? 'opacity-60' : ''}`}
              >
                {renamingId === s.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    maxLength={120}
                    aria-label={t('sidebar.rename')}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => finishRename(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') finishRename(true);
                      if (e.key === 'Escape') finishRename(false);
                    }}
                    className="m-2 w-[calc(100%-1rem)] rounded border border-ink-500 bg-ink-850 px-2 py-1 text-sm text-gray-100 outline-none focus:border-gray-400"
                  />
                ) : (
                <button
                  type="button"
                  onClick={() => onSelectSession(s.id)}
                  disabled={locked}
                  aria-current={isActive ? 'true' : undefined}
                  title={locked ? t('sidebar.locked') : s.title}
                  className="focus-ring flex w-full flex-col rounded-lg px-3 py-2.5 text-left disabled:cursor-not-allowed"
                >
                  <span className="flex w-full items-center gap-1.5 pr-5 text-sm font-medium">
                    {s.pinned && <Pin className="h-3 w-3 shrink-0 text-gray-500" aria-label={t('sidebar.pinned')} />}
                    <span className="truncate">{s.title}</span>
                  </span>
                  <span className="mt-1 font-mono text-[10px] text-gray-500">{s.date}</span>
                </button>
                )}

                {onDeleteSession && !locked && confirmingDeleteId === s.id && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmingDeleteId(null);
                      onDeleteSession(s.id);
                    }}
                    className="absolute right-2 top-2 rounded bg-red-950 px-2 py-0.5 font-mono text-[10px] font-semibold text-red-300 transition-colors hover:bg-red-900"
                  >
                    {t('sidebar.confirmDelete')}
                  </button>
                )}

                {onDeleteSession && !locked && confirmingDeleteId !== s.id && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmingDeleteId(s.id);
                    }}
                    title={t('sidebar.delete')}
                    aria-label={t('sidebar.delete')}
                    className="focus-ring absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded text-gray-500 opacity-0 transition-colors hover:bg-red-950 hover:text-red-400 focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {menu && menuSession && (
        <div
          role="menu"
          style={{ position: 'fixed', left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          className="z-50 w-44 rounded-lg border border-ink-600 bg-ink-850 py-1 font-mono text-[11px] text-gray-200 shadow-xl"
        >
          {onPinSession && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onPinSession(menuSession.id, !menuSession.pinned);
                setMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ink-700"
            >
              {menuSession.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              {menuSession.pinned ? t('sidebar.unpin') : t('sidebar.pin')}
            </button>
          )}
          {onRenameSession && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setRenameValue(menuSession.title);
                setRenamingId(menuSession.id);
                setMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ink-700"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t('sidebar.rename')}
            </button>
          )}
          {onDeleteSession && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                setConfirmingDeleteId(menuSession.id);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-400 hover:bg-red-950"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('sidebar.delete')}
            </button>
          )}
        </div>
      )}

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
