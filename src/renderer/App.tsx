import React, { useState, useEffect, useMemo } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, SessionItem } from './components/Sidebar';
import { SessionView } from './views/SessionView';
import { PracticeView } from './views/PracticeView';
import { MemoryModal } from './components/MemoryModal';
import { SettingsModal, AppSettings, DEFAULT_SETTINGS, normalizeEffort } from './components/SettingsModal';
import { ErrorNotice } from './components/ErrorNotice';
import { cleanError } from './lib/errors';
import { ProbingSession, ModelOption, PersistedUi, PracticeTarget } from '../shared/types';
import { I18nProvider, localeOf, MessageKey, normalizeLang, translate } from './i18n';

export default function App() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  /** True while a new session is open but the student has not typed the topic yet. */
  const [isCreating, setIsCreating] = useState(false);
  /** On a blank session: learn the topic (diagnosis, plan, lessons) or practise it (problems). */
  const [newMode, setNewMode] = useState<'teaching' | 'practice'>('teaching');
  const [currentSession, setCurrentSession] = useState<ProbingSession | null>(null);
  const [restoredUi, setRestoredUi] = useState<PersistedUi | null>(null);
  /** Bumped on navigation only: SessionView remounts, while a session gaining its id keeps the view. */
  const [viewEpoch, setViewEpoch] = useState(0);
  /** An AI call is running: sessions cannot be switched underneath it. */
  const [isBusy, setIsBusy] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('aprenda_settings');
      if (saved) {
        const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        return { ...parsed, language: normalizeLang(parsed.language), strongThinking: normalizeEffort(parsed.strongThinking) };
      }
    } catch {}
    return DEFAULT_SETTINGS;
  });
  const lang = normalizeLang(settings.language);
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);

  useEffect(() => {
    document.documentElement.lang = localeOf(lang);
  }, [lang]);

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
          pinned: r.pinned,
        }))
      );
    }).catch((err) => {
      setAppError(t('app.err.list', { detail: cleanError(err, t('session.err.unexpected')) }));
    });
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
        saveRequests: Boolean(settings.saveRequests),
        uiLanguage: lang,
      })?.catch?.((err: unknown) => console.error('[App] Falha ao aplicar as configurações:', err));
    }
  }, [settings]);

  // Older versions kept API keys in localStorage: hand them to the main process once, then forget them here
  useEffect(() => {
    const legacyProviders = (settings.providers || []).filter((p) => p.apiKey);
    if (!window.api?.migrateSecrets || (legacyProviders.length === 0 && !settings.deepgramApiKey && !settings.apiKey)) return;
    window.api
      .migrateSecrets({
        providers: legacyProviders.map((p) => ({ id: p.id, apiKey: p.apiKey })),
        deepgramApiKey: settings.deepgramApiKey,
      })
      .then(() => {
        handleSaveSettings({
          ...settings,
          apiKey: '',
          deepgramApiKey: '',
          providers: (settings.providers || []).map(({ apiKey: _apiKey, ...p }) => p),
        });
      })
      .catch((err) => console.error('[App] Falha ao migrar as chaves:', err));
  }, []);

  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  useEffect(() => {
    window.api?.getStorageStatus?.().then((status) => {
      if (status.corruptBackup) setStorageNotice(t('app.warn.corrupt', { file: status.corruptBackup }));
      else if (!status.secretsProtected) setStorageNotice(t('app.warn.plainKeys'));
    }).catch((err) => console.error('[App] Falha ao consultar o armazenamento:', err));
    return window.api?.onStorageError?.((error) => {
      setStorageError(error ? t('app.err.save', { detail: error }) : null);
    });
  }, []);

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem('aprenda_settings', JSON.stringify(newSettings));
    } catch {}
  };

  // Called when the student clicks "+ Nova sessão" in the sidebar
  const handleNewSession = () => {
    if (isBusy) return;
    setAppError(null);
    setNewMode('teaching');
    setIsCreating(true);
    setActiveSessionId(null);
    setCurrentSession(null);
    setRestoredUi(null);
    setViewEpoch((e) => e + 1);
  };

  // Called by SessionView once the student submits their goal
  const handleSessionCreated = (newSession: ProbingSession) => {
    const item: SessionItem = {
      id: newSession.id,
      title: newSession.topic ?? newSession.goal,
      mode: newSession.mode || 'teaching',
      date: new Date().toLocaleDateString(localeOf(lang)),
    };
    setSessions((prev) => {
      const existing = prev.find((s) => s.id === newSession.id);
      const merged = existing ? { ...item, title: existing.title, pinned: existing.pinned } : item;
      return [merged, ...prev.filter((s) => s.id !== newSession.id)].sort(
        (a, b) => Number(!!b.pinned) - Number(!!a.pinned)
      );
    });
    setActiveSessionId(newSession.id);
    setCurrentSession(newSession);
    setIsCreating(false);
  };

  // Practice over what a teaching session already taught: a session of its own, opened at once
  const handleStartPractice = async (params: { material: string; targets: PracticeTarget[]; sourceSessionId?: string }) => {
    if (isBusy) return;
    setIsMemoryOpen(false);
    setAppError(null);
    try {
      const practice = await window.api.startPractice(params);
      setRestoredUi(null);
      handleSessionCreated(practice);
      setViewEpoch((e) => e + 1);
    } catch (err) {
      setAppError(t('app.err.practice', { detail: cleanError(err, t('session.err.unexpected')) }));
    }
  };

  const handleSelectSession = async (id: string): Promise<boolean> => {
    if (isBusy || !window.api?.loadSession) return false;
    setAppError(null);
    try {
      const loaded = await window.api.loadSession(id);
      setRestoredUi(loaded.ui || { chatMessages: [] });
      setCurrentSession(loaded.session);
      setActiveSessionId(id);
      setIsCreating(false);
      setViewEpoch((e) => e + 1);
      return true;
    } catch (err) {
      setAppError(t('app.err.open', { detail: cleanError(err, t('session.err.unexpected')) }));
      return false;
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (isBusy) return;
    try {
      await window.api?.deleteSession?.(id);
    } catch (err) {
      setAppError(t('app.err.delete', { detail: cleanError(err, t('session.err.unexpected')) }));
      return;
    }
    const remaining = sessions.filter((s) => s.id !== id);
    setSessions(remaining);
    if (activeSessionId !== id) return;
    const next = remaining[0];
    if (!next || !(await handleSelectSession(next.id))) handleNewSession();
  };

  const handleRenameSession = async (id: string, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    try {
      await window.api?.renameSession?.(id, clean);
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: clean } : s)));
    } catch (err) {
      setAppError(t('app.err.rename', { detail: cleanError(err, t('session.err.unexpected')) }));
    }
  };

  const handlePinSession = async (id: string, pinned: boolean) => {
    try {
      await window.api?.pinSession?.(id, pinned);
      setSessions((prev) =>
        prev
          .map((s) => (s.id === id ? { ...s, pinned } : s))
          .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))
      );
    } catch (err) {
      setAppError(t('app.err.pin', { detail: cleanError(err, t('session.err.unexpected')) }));
    }
  };

  const handleToggleDictate = () => {
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

  const phaseLabel = currentSession?.phase ? t(`phase.${currentSession.phase}` as MessageKey) : undefined;

  return (
    <I18nProvider lang={lang}>
    <div className="flex h-screen w-screen bg-ink-950 text-gray-100 overflow-hidden font-sans select-none">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        isCreating={isCreating}
        locked={isBusy}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onPinSession={handlePinSession}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenMemory={() => setIsMemoryOpen(true)}
      />

      {/* Right column: frameless title bar + session canvas */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TitleBar phaseLabel={phaseLabel} />
        {[appError, storageError, storageNotice].filter(Boolean).map((message) => (
          <div key={message} className="shrink-0 px-6 pt-3">
            <ErrorNotice message={message!} />
          </div>
        ))}
        <main className="flex-1 overflow-hidden">
          {currentSession?.mode === 'practice' && currentSession.phase === 'practice' ? (
            <PracticeView
              key={`practice-${currentSession.id}-${viewEpoch}`}
              session={currentSession}
              onSessionUpdate={(updated) => setCurrentSession(updated)}
              onBusyChange={setIsBusy}
            />
          ) : (
          <SessionView
            key={viewEpoch}
            currentSession={currentSession}
            pendingMode={currentSession ? null : newMode}
            onPendingModeChange={setNewMode}
            onStartPractice={handleStartPractice}
            restoredUi={restoredUi}
            onSessionUpdate={(updated) => setCurrentSession(updated)}
            onSessionCreated={handleSessionCreated}
            onBusyChange={setIsBusy}
            modelName={settings.strongModel || settings.model || t('app.noModel')}
            thinkingLevel={settings.strongThinking || settings.thinkingLevel || 'High'}
            tokenCount={sessionTokens}
            minQuestions={settings.minQuestions}
            questionCount={currentSession?.questionCount}
            onToggleDictate={handleToggleDictate}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onChangeThinkingLevel={handleChangeThinkingLevel}
            onChangeModel={handleChangeModel}
            availableModels={activeProviderModels}
          />
          )}
        </main>
      </div>

      <MemoryModal
        isOpen={isMemoryOpen}
        onClose={() => setIsMemoryOpen(false)}
        onPractice={isBusy ? undefined : handleStartPractice}
      />

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
