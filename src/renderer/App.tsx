import React, { useState } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, SessionItem } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { SessionView } from './views/SessionView';
import { ProbingSession } from '../shared/types';

export default function App() {
  const [sessions, setSessions] = useState<SessionItem[]>([
    {
      id: 'sess-default',
      title: 'Camada 3 Modelo OSI (Redes)',
      mode: 'teaching',
      date: 'Hoje',
    },
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>('sess-default');
  const [currentSession, setCurrentSession] = useState<ProbingSession | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);

  const handleNewSession = async (mode: 'teaching' | 'practice') => {
    const newId = `sess-${Date.now()}`;
    const newTitle = mode === 'teaching' ? 'Nova Trilha Socrática' : 'Prática Rápida de Fixação';
    setSessions((prev) => [
      { id: newId, title: newTitle, mode, date: 'Agora' },
      ...prev,
    ]);
    setActiveSessionId(newId);
    if (window.api?.startSession) {
      const s = await window.api.startSession(mode, newTitle);
      setCurrentSession(s);
    }
  };

  const handleToggleDictate = () => {
    setIsRecording((prev) => !prev);
    window.dispatchEvent(new CustomEvent('toggle-dictate'));
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0a0a0a] text-gray-100 overflow-hidden font-sans select-none">
      {/* Frameless Custom Title Bar */}
      <TitleBar title={currentSession?.goal || 'Camada 3 Modelo OSI — Diagnóstico Cognitivo'} />

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Retractable / Fixed Sidebar */}
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={(id) => setActiveSessionId(id)}
          onNewSession={handleNewSession}
        />

        {/* Central Session / Socratic Canvas */}
        <main className="flex-1 overflow-hidden">
          <SessionView
            currentSession={currentSession}
            onSessionUpdate={(updated) => setCurrentSession(updated)}
          />
        </main>
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        questionCount={currentSession?.questionCount || 0}
        frontierClarity={currentSession?.frontierClarity || 0}
        isRecording={isRecording}
        onToggleDictate={handleToggleDictate}
      />
    </div>
  );
}
