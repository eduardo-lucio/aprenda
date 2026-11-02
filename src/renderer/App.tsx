import React, { useState, useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, SessionItem } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { SessionView } from './views/SessionView';
import { SettingsModal, AppSettings, DEFAULT_SETTINGS } from './components/SettingsModal';
import { ProbingSession } from '../shared/types';

export default function App() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [pendingSessionMode, setPendingSessionMode] = useState<'teaching' | 'practice' | null>(null);
  const [currentSession, setCurrentSession] = useState<ProbingSession | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('aprenda_settings');
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_SETTINGS;
  });

  // Sync saved settings with Electron Main process on startup
  useEffect(() => {
    if (window.api?.updateSettings) {
      window.api.updateSettings({
        providerId: settings.activeProviderId,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.strongModel || settings.model,
        effortLevel: settings.strongThinking,
        deepgramApiKey: settings.deepgramApiKey,
        voiceLanguage: settings.voiceLanguage,
      });
    }
  }, []);

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem('aprenda_settings', JSON.stringify(newSettings));
    } catch {}
  };

  // Called when user clicks + TEACHING or + PRACTICE in sidebar
  const handleNewSession = (mode: 'teaching' | 'practice') => {
    setPendingSessionMode(mode);
    setActiveSessionId(null);
    setCurrentSession(null);
  };

  // Called by SessionView once the student submits their goal
  const handleSessionCreated = (newSession: ProbingSession) => {
    const item: SessionItem = {
      id: newSession.id,
      title: newSession.goal,
      mode: pendingSessionMode || newSession.mode || 'teaching',
      date: 'Hoje',
    };
    setSessions((prev) => [item, ...prev.filter((s) => s.id !== newSession.id)]);
    setActiveSessionId(newSession.id);
    setCurrentSession(newSession);
    setPendingSessionMode(null);
  };

  const handleSelectSession = async (id: string) => {
    setActiveSessionId(id);
    setPendingSessionMode(null);
    if (window.api?.getSession) {
      const sess = await window.api.getSession();
      if (sess && sess.id === id) {
        setCurrentSession(sess);
      }
    }
  };

  const handleDeleteSession = (id: string) => {
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      if (activeSessionId === id) {
        if (updated.length > 0) {
          setActiveSessionId(updated[0].id);
        } else {
          setActiveSessionId(null);
          setCurrentSession(null);
          setPendingSessionMode('teaching');
        }
      }
      return updated;
    });
  };

  const handleToggleDictate = () => {
    setIsRecording((prev) => !prev);
    window.dispatchEvent(new CustomEvent('toggle-dictate'));
  };

  const titleText = currentSession?.goal
    ? currentSession.goal
    : pendingSessionMode === 'practice'
    ? 'Nova Prática Rápida — APRENDA'
    : 'APRENDA — Diagnóstico Cognitivo & Ensino Socrático';

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0a0a0a] text-gray-100 overflow-hidden font-sans select-none">
      {/* Frameless Custom Title Bar */}
      <TitleBar title={titleText} />

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Retractable / Fixed Sidebar */}
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          pendingMode={pendingSessionMode}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {/* Central Session / Socratic Canvas */}
        <main className="flex-1 overflow-hidden">
          <SessionView
            currentSession={currentSession}
            pendingMode={pendingSessionMode}
            onSessionUpdate={(updated) => setCurrentSession(updated)}
            onSessionCreated={handleSessionCreated}
          />
        </main>
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        questionCount={currentSession?.questionCount || 0}
        frontierClarity={currentSession?.frontierClarity || 0}
        modelName={settings.strongModel || settings.model || 'Sem modelo'}
        thinkingLevel={settings.thinkingLevel}
        isRecording={isRecording}
        onToggleDictate={handleToggleDictate}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
        initialSettings={settings}
      />
    </div>
  );
}
