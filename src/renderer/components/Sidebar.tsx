import React, { useState } from 'react';
import { Search, Settings, Layers, Trash2, PanelLeft } from 'lucide-react';

export interface SessionItem {
  id: string;
  title: string;
  mode: 'teaching' | 'practice';
  date: string;
}

interface SidebarProps {
  sessions: SessionItem[];
  activeSessionId?: string | null;
  pendingMode?: 'teaching' | 'practice' | null;
  onSelectSession: (id: string) => void;
  onNewSession: (mode: 'teaching' | 'practice') => void;
  onDeleteSession?: (id: string) => void;
  onOpenSettings?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  activeSessionId,
  pendingMode,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onOpenSettings,
}) => {
  const [filterTab, setFilterTab] = useState<'ALL' | 'TEACHING' | 'PRACTICE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const filteredSessions = sessions.filter((s) => {
    const matchesFilter =
      filterTab === 'ALL' ||
      (filterTab === 'TEACHING' && s.mode === 'teaching') ||
      (filterTab === 'PRACTICE' && s.mode === 'practice');

    const matchesSearch = s.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  if (collapsed) {
    return (
      <aside className="flex h-full w-12 shrink-0 flex-col items-center border-r border-ink-700 bg-ink-900 py-3 text-gray-400">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Expandir barra lateral"
          aria-label="Expandir barra lateral"
          className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-ink-700 hover:text-gray-200"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onOpenSettings}
          title="Configurações do Agente & LLM"
          aria-label="Configurações do Agente"
          className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-ink-700 hover:text-gray-200"
        >
          <Settings className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  const actionBtn = (active: boolean) =>
    `flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-[11px] font-semibold uppercase tracking-widest transition-colors ${
      active ? 'bg-ink-700 text-gray-100' : 'text-gray-400 hover:bg-ink-800 hover:text-gray-200'
    }`;

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-ink-700 bg-ink-900 text-gray-300">
      {/* Brand + collapse */}
      <div className="flex h-14 shrink-0 items-center justify-between px-5">
        <Layers className="h-6 w-6 text-gray-100" aria-hidden />
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Recolher barra lateral"
          aria-label="Recolher barra lateral"
          className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-ink-700 hover:text-gray-200"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>

      {/* New session actions */}
      <div className="flex flex-col gap-0.5 px-3 pb-3">
        <button
          onClick={() => onNewSession('teaching')}
          className={actionBtn(pendingMode === 'teaching')}
          title="Iniciar nova trilha socrática de aprendizado"
        >
          <span>+ TEACHING</span>
        </button>
        <button
          onClick={() => onNewSession('practice')}
          className={actionBtn(pendingMode === 'practice')}
          title="Iniciar prática rápida de fixação"
        >
          <span>+ PRACTICE</span>
        </button>
      </div>

      {/* Sessions header + search */}
      <div className="flex items-center gap-2 px-5 pb-2">
        <span className="label-mono">Sessões</span>
        <div className="flex flex-1 items-center rounded border border-ink-600 bg-ink-850 px-2 py-1">
          <Search className="mr-1.5 h-3 w-3 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent font-mono text-[11px] text-gray-200 outline-none placeholder:text-gray-600"
          />
        </div>
      </div>

      {/* Filter segmented control */}
      <div className="mx-3 mb-3 flex rounded-lg border border-ink-600 bg-ink-850 p-0.5">
        {(['TEACHING', 'PRACTICE', 'ALL'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilterTab(tab)}
            className={`flex-1 rounded-md py-1.5 text-center font-mono text-[10px] font-semibold uppercase tracking-widest transition-colors ${
              filterTab === tab ? 'bg-ink-600 text-gray-100' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Sessions list */}
      <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-2">
        {filteredSessions.length === 0 ? (
          <div className="p-4 text-center font-mono text-[11px] text-gray-600">
            Nenhuma sessão encontrada.
          </div>
        ) : (
          filteredSessions.map((s) => {
            const isActive = s.id === activeSessionId && !pendingMode;
            return (
              <div
                key={s.id}
                onClick={() => onSelectSession(s.id)}
                className={`group relative flex cursor-pointer flex-col rounded-lg px-3 py-2.5 transition-colors ${
                  isActive
                    ? 'bg-ink-700 text-gray-100'
                    : 'text-gray-400 hover:bg-ink-800 hover:text-gray-200'
                }`}
              >
                <span className="truncate pr-5 text-sm font-medium">{s.title}</span>
                <span className="mt-1 font-mono text-[10px] text-gray-500">
                  {s.mode} · {s.date}
                </span>

                {onDeleteSession && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(s.id);
                    }}
                    title="Excluir sessão"
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
        title="Configurações do Agente & LLM"
        aria-label="Configurações do Agente"
        className="flex items-center gap-2 border-t border-ink-700 px-5 py-4 font-mono text-[11px] font-semibold uppercase tracking-widest text-gray-500 transition-colors hover:text-gray-200"
      >
        <Settings className="h-3.5 w-3.5" />
        <span>Configurações</span>
      </button>
    </aside>
  );
};
