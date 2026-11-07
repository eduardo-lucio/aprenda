import React, { useState, useEffect, useMemo } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, SessionItem } from './components/Sidebar';
import { SessionView } from './views/SessionView';
import { SettingsModal, AppSettings, DEFAULT_SETTINGS } from './components/SettingsModal';
import { ProbingSession, ModelOption, PersistedUi } from '../shared/types';
import { I18nProvider, localeOf, MessageKey, normalizeLang, translate } from './i18n';

export default function App() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  /** True while a new session is open but the student has not typed the topic yet. */
  const [isCreating, setIsCreating] = useState(false);
  const [currentSession, setCurrentSession] = useState<ProbingSession | null>(null);
  const [restoredUi, setRestoredUi] = useState<PersistedUi | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('aprenda_settings');
      if (saved) {
        const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        return { ...parsed, language: normalizeLang(parsed.language) };
      }
    } catch {}
    return DEFAULT_SETTINGS;
  });
  const lang = normalizeLang(settings.language);
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);

  // Load persisted sessions (survive app restarts)
  useEffect(() => {
    if (!window.api?.listSessions) return;
    window.api.listSessions().then((list) => {
      setSessions(
        list.map((r) => ({
          id: r.id,
          title: r.title,
          mode: r.mode,
          date: new Date(r.updatedAt).toLocaleDateString(localeOf(lang)),
        }))
      );
    }).catch(() => {});
  }, []);

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
        minProbeQuestions: settings.minQuestions,
        uiLanguage: lang,
      });
    }
  }, [settings]);

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem('aprenda_settings', JSON.stringify(newSettings));
    } catch {}
  };

  // Called when the student clicks "+ Nova sessão" in the sidebar
  const handleNewSession = () => {
    setIsCreating(true);
    setActiveSessionId(null);
    setCurrentSession(null);
  };

  // Called by SessionView once the student submits their goal
  const handleSessionCreated = (newSession: ProbingSession) => {
    const item: SessionItem = {
      id: newSession.id,
      title: newSession.goal,
      mode: newSession.mode || 'teaching',
      date: new Date().toLocaleDateString(localeOf(lang)),
    };
    setSessions((prev) => [item, ...prev.filter((s) => s.id !== newSession.id)]);
    setActiveSessionId(newSession.id);
    setCurrentSession(newSession);
    setIsCreating(false);
  };

  const handleSelectSession = async (id: string) => {
    setActiveSessionId(id);
    setIsCreating(false);
    try {
      const active = window.api?.getSession ? await window.api.getSession() : null;
      if (active && active.id === id) {
        setCurrentSession(active);
        return;
      }
      if (window.api?.loadSession) {
        const loaded = await window.api.loadSession(id);
        setRestoredUi(loaded.ui || { chatMessages: [] });
        setCurrentSession(loaded.session);
      }
    } catch {}
  };

  const handleDeleteSession = (id: string) => {
    window.api?.deleteSession?.(id);
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      if (activeSessionId === id) {
        if (updated.length > 0) {
          setActiveSessionId(updated[0].id);
        } else {
          setActiveSessionId(null);
          setCurrentSession(null);
          setIsCreating(true);
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

  const titleText = currentSession?.goal ? currentSession.goal : t('app.newSession');
  const phaseLabel = currentSession?.phase ? t(`phase.${currentSession.phase}` as MessageKey) : undefined;

  return (
    <I18nProvider lang={lang}>
    <div className="flex h-screen w-screen bg-ink-950 text-gray-100 overflow-hidden font-sans select-none">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        isCreating={isCreating}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Right column: frameless title bar + session canvas */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TitleBar title={titleText} phaseLabel={phaseLabel} />
        <main className="flex-1 overflow-hidden">
          <SessionView
            currentSession={currentSession}
            pendingMode={isCreating ? 'teaching' : null}
            restoredUi={restoredUi}
            onSessionUpdate={(updated) => setCurrentSession(updated)}
            onSessionCreated={handleSessionCreated}
            modelName={settings.strongModel || settings.model || t('app.noModel')}
            thinkingLevel={settings.strongThinking || settings.thinkingLevel || 'High'}
            tokenCount={sessionTokens}
            minQuestions={settings.minQuestions}
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
    </I18nProvider>
  );
}
