import React, { useState, useEffect, useMemo } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, SessionItem } from './components/Sidebar';
import { SessionView } from './views/SessionView';
import { SettingsModal, AppSettings, DEFAULT_SETTINGS } from './components/SettingsModal';
import { ProbingSession, ModelOption } from '../shared/types';

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

  // Sync saved settings with Electron Main process on startup and whenever settings change
  useEffect(() => {
    if (window.api?.updateSettings) {
      const activeProvider = settings.providers?.find(
        (p) => p.id === settings.activeProviderId || p.isActive
      );
      const effectiveApiKey = activeProvider?.apiKey || settings.apiKey || '';
      const effectiveBaseUrl = activeProvider?.baseUrl || settings.baseUrl || '';
      const effectiveProviderId = settings.activeProviderId || activeProvider?.id || '';
      const effectiveModel = settings.strongModel || settings.model || activeProvider?.models?.[0]?.id || '';
      const effectiveEffort = settings.strongThinking || 'medium';

      window.api.updateSettings({
        providerId: effectiveProviderId,
        apiKey: effectiveApiKey,
        baseUrl: effectiveBaseUrl,
        model: effectiveModel,
        effortLevel: effectiveEffort as any,
        deepgramApiKey: settings.deepgramApiKey,
        voiceLanguage: settings.voiceLanguage,
      });
    }
  }, [settings]);

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

  const handleChangeThinkingLevel = (level: 'off' | 'low' | 'medium' | 'high') => {
    const capitalized = (level.charAt(0).toUpperCase() + level.slice(1)) as any;
    const updated = {
      ...settings,
      strongThinking: level,
      thinkingLevel: capitalized,
    };
    handleSaveSettings(updated);
  };

  const handleChangeModel = (model: string) => {
    const updated = {
      ...settings,
      strongModel: model,
      model: model,
    };
    handleSaveSettings(updated);
  };

  const [sessionTokens, setSessionTokens] = useState<number>(0);

  // Sync token usage with active session and live token updates
  useEffect(() => {
    if (currentSession?.tokensUsed !== undefined) {
      setSessionTokens(currentSession.tokensUsed);
    } else if (!currentSession) {
      setSessionTokens(0);
    }
  }, [currentSession?.id, currentSession?.tokensUsed]);

  useEffect(() => {
    if (!window.api?.onTokensUpdate) return;
    const unsub = window.api.onTokensUpdate((payload) => {
      setSessionTokens(payload.tokensUsed);
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  // Identify current active provider and its available models
  const activeProvider = useMemo(() => {
    if (!settings.providers || settings.providers.length === 0) return null;
    const found = settings.providers.find((p) => p.id === settings.activeProviderId);
    if (found) return found;
    return settings.providers.find((p) => p.isActive) || settings.providers[0];
  }, [settings.providers, settings.activeProviderId]);

  const activeProviderModels = useMemo<ModelOption[]>(() => {
    if (activeProvider && activeProvider.models && activeProvider.models.length > 0) {
      return activeProvider.models;
    }
    const fallbackId = settings.strongModel || settings.model || 'gemini-2.0-flash';
    return [
      {
        id: fallbackId,
        name: fallbackId,
        provider: activeProvider?.name || activeProvider?.id || 'openrouter',
        slug: `~${fallbackId}`,
        price: 'Free',
        context: '128k',
        defaultEffort: 'medium',
      },
    ];
  }, [activeProvider, settings.strongModel, settings.model]);

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
            modelName={settings.strongModel || settings.model || 'Sem modelo'}
            thinkingLevel={settings.strongThinking || settings.thinkingLevel || 'High'}
            tokenCount={sessionTokens}
            questionCount={currentSession?.questionCount}
            isRecording={isRecording}
            onToggleDictate={handleToggleDictate}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onChangeThinkingLevel={handleChangeThinkingLevel}
            onChangeModel={handleChangeModel}
            availableModels={activeProviderModels}
          />
        </main>
      </div>

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
