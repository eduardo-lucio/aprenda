import React, { useState } from 'react';
import { Search, Plus, BookOpen, Dumbbell, Settings, Layers } from 'lucide-react';

export interface SessionItem {
  id: string;
  title: string;
  mode: 'teaching' | 'practice';
  date: string;
}

interface SidebarProps {
  sessions: SessionItem[];
  activeSessionId?: string;
  onSelectSession: (id: string) => void;
  onNewSession: (mode: 'teaching' | 'practice') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
}) => {
  const [filterTab, setFilterTab] = useState<'ALL' | 'TEACHING' | 'PRACTICE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSessions = sessions.filter((s) => {
    const matchesFilter =
      filterTab === 'ALL' ||
      (filterTab === 'TEACHING' && s.mode === 'teaching') ||
      (filterTab === 'PRACTICE' && s.mode === 'practice');

    const matchesSearch = s.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <aside className="flex h-full w-64 flex-col border-r border-[#1e293b] bg-[#111111] text-gray-300">
      {/* Action Buttons */}
      <div className="flex flex-col gap-2 p-3 border-b border-[#1e293b]/60">
        <button
          onClick={() => onNewSession('teaching')}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600/20 px-3 py-2 text-xs font-semibold text-emerald-400 border border-emerald-500/40 hover:bg-emerald-600/30 transition-colors shadow-sm"
        >
          <BookOpen className="h-4 w-4" />
          <span>+ TEACHING</span>
        </button>

        <button
          onClick={() => onNewSession('practice')}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[#1e293b]/40 px-3 py-1.5 text-xs font-medium text-gray-300 border border-[#334155]/60 hover:bg-[#1e293b] transition-colors"
        >
          <Dumbbell className="h-3.5 w-3.5 text-gray-400" />
          <span>+ PRACTICE</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-[#1e293b] px-3 pt-2 text-[11px] font-semibold text-gray-400">
        {(['TEACHING', 'PRACTICE', 'ALL'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilterTab(tab)}
            className={`flex-1 pb-2 text-center transition-colors border-b-2 ${
              filterTab === tab
                ? 'border-emerald-500 text-gray-100'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-[#1e293b]/50">
        <div className="flex items-center rounded bg-[#0a0a0a] px-2 py-1 text-xs text-gray-300 border border-[#1e293b]">
          <Search className="mr-1.5 h-3.5 w-3.5 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar sessões..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs text-gray-200 outline-none placeholder:text-gray-600"
          />
        </div>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Sessões Recentes
        </div>

        {filteredSessions.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-600 italic">
            Nenhuma sessão encontrada.
          </div>
        ) : (
          filteredSessions.map((s) => {
            const isActive = s.id === activeSessionId;
            return (
              <div
                key={s.id}
                onClick={() => onSelectSession(s.id)}
                className={`group flex cursor-pointer flex-col rounded-md px-2.5 py-2 transition-colors ${
                  isActive
                    ? 'bg-[#1e293b] text-white border-l-2 border-emerald-500'
                    : 'text-gray-400 hover:bg-[#171717] hover:text-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium truncate font-serif">{s.title}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                      s.mode === 'teaching'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                        : 'bg-blue-950 text-blue-400 border border-blue-800/50'
                    }`}
                  >
                    {s.mode}
                  </span>
                </div>
                <span className="text-[10px] text-gray-500 mt-0.5">{s.date}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[#1e293b] p-3 text-xs text-gray-400 bg-[#0d0d0d]">
        <div className="flex items-center space-x-2">
          <Layers className="h-4 w-4 text-emerald-500" />
          <span className="text-[11px] font-medium text-gray-300">Camada 3 OSI</span>
        </div>
        <Settings className="h-4 w-4 cursor-pointer text-gray-500 hover:text-gray-300 transition-colors" />
      </div>
    </aside>
  );
};
