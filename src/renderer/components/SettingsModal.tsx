import React, { useState, useEffect, useMemo, useRef } from 'react';
import { cleanError } from '../lib/errors';
import { X, ChevronDown, Check, AlertTriangle, Loader2, AlertCircle } from 'lucide-react';
import {
  ModelOption,
  ProviderConfig,
  ProviderValidationResult,
  PROBE_QUESTIONS_RANGE,
  clampProbeQuestions,
  VOICE_LANGUAGES,
} from '../../shared/types';
import { Lang, useI18n } from '../i18n';

type Effort = 'off' | 'low' | 'medium' | 'high';

export interface AppSettings {
  // Legacy / backwards compatibility fields
  baseUrl: string;
  apiKey: string;
  model: string;
  thinkingLevel: 'High' | 'Medium' | 'Low' | 'Off';
  minQuestions: number;

  // Multi-provider configuration
  activeProviderId: string;
  providers: ProviderConfig[];

  // Voice dictation (Deepgram) & spoken language
  deepgramApiKey: string;
  deepgramKeyMasked: string;
  deepgramValidated: boolean;
  voiceLanguage: string;

  // Model used by every agent of the session
  strongModel: string;
  strongThinking: Effort;

  /** Interface language; the AI also writes to the student in it. */
  language: Lang;
}

// Built-in catalog of providers supported for API validation
export const AVAILABLE_PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter', envKey: 'OPENROUTER_API_KEY', defaultUrl: 'https://openrouter.ai/api/v1' },
  { id: 'google', name: 'Google Gemini', envKey: 'GEMINI_API_KEY', defaultUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  { id: 'openai', name: 'OpenAI', envKey: 'OPENAI_API_KEY', defaultUrl: 'https://api.openai.com/v1' },
  { id: 'deepseek', name: 'DeepSeek', envKey: 'DEEPSEEK_API_KEY', defaultUrl: 'https://api.deepseek.com/v1' },
  { id: 'anthropic', name: 'Anthropic', envKey: 'ANTHROPIC_API_KEY', defaultUrl: 'https://api.anthropic.com/v1' },
  { id: 'groq', name: 'Groq', envKey: 'GROQ_API_KEY', defaultUrl: 'https://api.groq.com/openai/v1' },
  { id: 'ollama', name: 'Ollama (Local)', envKey: 'OLLAMA_BASE_URL', defaultUrl: 'http://localhost:11434' },
  { id: 'cerebras', name: 'Cerebras', envKey: 'CEREBRAS_API_KEY', defaultUrl: 'https://api.cerebras.ai/v1' },
  { id: 'together', name: 'Together AI', envKey: 'TOGETHER_API_KEY', defaultUrl: 'https://api.together.xyz/v1' },
  { id: 'mistral', name: 'Mistral AI', envKey: 'MISTRAL_API_KEY', defaultUrl: 'https://api.mistral.ai/v1' },
  { id: 'custom', name: 'Custom endpoint', envKey: 'CUSTOM_OPENAI_API_KEY', defaultUrl: 'http://localhost:8000/v1' },
];

export const DEFAULT_SETTINGS: AppSettings = {
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: '',
  model: '',
  thinkingLevel: 'High',
  minQuestions: 8,

  activeProviderId: '',
  providers: [],

  deepgramApiKey: '',
  deepgramKeyMasked: '',
  deepgramValidated: false,
  voiceLanguage: 'pt-BR',

  strongModel: '',
  strongThinking: 'high',

  language: 'pt',
};

const EFFORT_LEVELS: Effort[] = ['off', 'low', 'medium', 'high'];

/** Older versions could save 'minimal', and model metadata may still report it. */
export function normalizeEffort(value: unknown): Effort {
  return EFFORT_LEVELS.includes(value as Effort) ? (value as Effort) : value === 'minimal' ? 'low' : 'high';
}

/** Providers that can work without an API key. */
const KEYLESS_PROVIDERS = new Set(['ollama', 'custom']);
const QUICK_VOICE_LANGUAGES = ['pt-BR', 'en-US', 'es'];

type SettingsTab = 'providers' | 'model' | 'general';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
  initialSettings?: AppSettings;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialSettings = DEFAULT_SETTINGS,
}) => {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_SETTINGS, ...initialSettings });
  const [activeTab, setActiveTab] = useState<SettingsTab>('providers');
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);

  // Search & add provider
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [editingProvider, setEditingProvider] = useState<{
    id: string;
    name: string;
    apiKey: string;
    baseUrl: string;
    isNew?: boolean;
  } | null>(null);

  // Validation
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Deepgram
  const [deepgramDraftKey, setDeepgramDraftKey] = useState('');
  const [isEditingDeepgram, setIsEditingDeepgram] = useState(false);
  const [isValidatingDeepgram, setIsValidatingDeepgram] = useState(false);
  const [deepgramError, setDeepgramError] = useState<string | null>(null);

  // Model & effort popovers
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [isEffortMenuOpen, setIsEffortMenuOpen] = useState(false);

  useEffect(() => {
    setSettings({ ...DEFAULT_SETTINGS, ...initialSettings });
  }, [initialSettings, isOpen]);

  const updateSettings = (updates: Partial<AppSettings>) => {
    const next = { ...settings, ...updates };
    setSettings(next);
    onSave(next);
  };

  const activeProvider = useMemo(() => {
    const found = settings.providers?.find((p) => p.id === settings.activeProviderId);
    if (found) return found;
    return settings.providers?.find((p) => Boolean(p.isValidated)) || null;
  }, [settings.providers, settings.activeProviderId]);

  const availableModels = useMemo(
    () => (activeProvider?.isValidated && activeProvider.models ? activeProvider.models : []),
    [activeProvider]
  );

  const filteredModels = useMemo(() => {
    const q = modelSearchQuery.toLowerCase().trim();
    if (!q) return availableModels;
    return availableModels.filter(
      (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.slug.toLowerCase().includes(q)
    );
  }, [availableModels, modelSearchQuery]);

  const filteredProviders = useMemo(() => {
    const q = providerSearch.toLowerCase().trim();
    if (!q) return AVAILABLE_PROVIDERS;
    return AVAILABLE_PROVIDERS.filter((p) => p.name.toLowerCase().includes(q) || p.envKey.toLowerCase().includes(q));
  }, [providerSearch]);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, [isOpen]);

  const handleDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (showProviderDropdown || isModelMenuOpen || isEffortMenuOpen) {
        closeMenus();
        setShowProviderDropdown(false);
      } else {
        onClose();
      }
      return;
    }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!isOpen) return null;

  const closeMenus = () => {
    setIsModelMenuOpen(false);
    setIsEffortMenuOpen(false);
  };

  // Strict API key validation against the live provider endpoint (runs in the main process)
  const handleSaveProviderKey = async () => {
    if (!editingProvider) return;
    const key = editingProvider.apiKey.trim();

    // Editing a saved provider: a blank field keeps the key already stored
    if (!key && !KEYLESS_PROVIDERS.has(editingProvider.id) && editingProvider.isNew !== false) {
      setValidationError(t('settings.providers.errEmptyKey'));
      return;
    }

    setIsValidatingKey(true);
    setValidationError(null);

    try {
      if (!window.api?.validateProvider) throw new Error(t('settings.providers.errNoBackend'));
      const result: ProviderValidationResult = await window.api.validateProvider({
        providerId: editingProvider.id,
        apiKey: key,
        baseUrl: editingProvider.baseUrl,
      });

      if (!result.isValid) throw new Error(result.error || t('settings.providers.errRejected'));

      const newConfig: ProviderConfig = {
        id: result.providerId,
        name: result.providerName,
        keyMasked: result.keyMasked,
        baseUrl: editingProvider.baseUrl,
        isActive: true,
        isValidated: true,
        models: result.models,
      };

      const existing = (settings.providers || []).filter((p) => p.id !== editingProvider.id);
      const defaultModel = result.models[0]?.id || '';
      const defaultEffort = normalizeEffort(result.models[0]?.defaultEffort);
      // A model id only means something to the provider that listed it
      const keepModel =
        editingProvider.id === settings.activeProviderId && result.models.some((m) => m.id === settings.strongModel);

      updateSettings({
        providers: [newConfig, ...existing.map((p) => ({ ...p, isActive: false }))],
        activeProviderId: editingProvider.id,
        apiKey: '',
        baseUrl: editingProvider.baseUrl || settings.baseUrl,
        strongModel: keepModel ? settings.strongModel : defaultModel,
        model: keepModel ? settings.strongModel : defaultModel,
        strongThinking: keepModel ? settings.strongThinking : defaultEffort,
      });

      setEditingProvider(null);
      setShowProviderDropdown(false);
      setValidationError(null);
    } catch (err: any) {
      setValidationError(cleanError(err, t('settings.providers.errGeneric')));
    } finally {
      setIsValidatingKey(false);
    }
  };

  const activationFor = (provider: ProviderConfig, providers: ProviderConfig[]): Partial<AppSettings> => {
    const firstModel = provider.models?.[0];
    return {
      providers: providers.map((p) => ({ ...p, isActive: p.id === provider.id })),
      activeProviderId: provider.id,
      apiKey: '',
      baseUrl: provider.baseUrl || '',
      strongModel: firstModel?.id || '',
      model: firstModel?.id || '',
      strongThinking: normalizeEffort(firstModel?.defaultEffort),
    };
  };

  const handleActivateProvider = (provider: ProviderConfig) => {
    updateSettings(activationFor(provider, settings.providers || []));
  };

  const handleRemoveProvider = (id: string) => {
    void window.api?.deleteProviderKey?.(id);
    const updated = (settings.providers || []).filter((p) => p.id !== id);
    if (id !== settings.activeProviderId) {
      updateSettings({ providers: updated });
    } else if (updated.length > 0) {
      updateSettings(activationFor(updated[0], updated));
    } else {
      updateSettings({ providers: [], activeProviderId: '', apiKey: '', baseUrl: '', strongModel: '', model: '' });
    }
  };

  const handleSaveDeepgramKey = async () => {
    const key = deepgramDraftKey.trim();
    if (!key) {
      setDeepgramError(t('settings.voice.errEmptyKey'));
      return;
    }

    setIsValidatingDeepgram(true);
    setDeepgramError(null);
    try {
      if (!window.api?.validateDeepgramKey) throw new Error(t('settings.providers.errNoBackend'));
      const res = await window.api.validateDeepgramKey(key);
      updateSettings({ deepgramApiKey: '', deepgramKeyMasked: res.keyMasked, deepgramValidated: true });
      setIsEditingDeepgram(false);
      setDeepgramDraftKey('');
    } catch (err: any) {
      setDeepgramError(cleanError(err, t('settings.voice.errInvalid')));
    } finally {
      setIsValidatingDeepgram(false);
    }
  };

  const handleRemoveDeepgramKey = () => {
    void window.api?.deleteDeepgramKey?.();
    updateSettings({ deepgramApiKey: '', deepgramKeyMasked: '', deepgramValidated: false });
    setIsEditingDeepgram(false);
    setDeepgramDraftKey('');
    setDeepgramError(null);
  };

  const capitalize = (effort: Effort) => (effort.charAt(0).toUpperCase() + effort.slice(1)) as any;

  const handleSelectModel = (modelOption: ModelOption) => {
    updateSettings({
      strongModel: modelOption.id,
      model: modelOption.id,
      strongThinking: normalizeEffort(modelOption.defaultEffort),
      thinkingLevel: capitalize(normalizeEffort(modelOption.defaultEffort)),
    });
    setIsModelMenuOpen(false);
    setModelSearchQuery('');
  };

  const handleSelectEffort = (effort: Effort) => {
    updateSettings({ strongThinking: effort, thinkingLevel: capitalize(effort) });
    setIsEffortMenuOpen(false);
  };

  const navTabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'providers', label: t('settings.tab.providers') },
    { id: 'model', label: t('settings.tab.model') },
    { id: 'general', label: t('settings.tab.general') },
  ];

  const sectionTitle = 'text-[11px] font-mono tracking-widest text-gray-400 uppercase font-semibold mb-4';
  const subTitle = 'text-[10px] font-mono tracking-widest text-gray-500 uppercase font-semibold';
  const selectClass =
    'rounded border border-ink-500 bg-ink-800 px-3 py-1 text-xs font-sans text-gray-200 outline-none hover:border-gray-500';
  const currentModel = settings.strongModel || availableModels[0]?.id || t('settings.model.none');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.title')}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="flex w-full max-w-4xl h-[620px] max-h-full flex-col outline-none rounded-xl border border-ink-600 bg-ink-850 text-gray-200 shadow-2xl overflow-hidden font-sans"
        onClick={(e) => {
          e.stopPropagation();
          closeMenus();
        }}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-ink-600 px-6">
          <h2 className="text-2xl font-serif text-white tracking-tight font-medium">{t('settings.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-ink-600 hover:text-white transition-colors"
            aria-label={t('settings.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left navigation */}
          <div className="w-44 border-r border-ink-600 p-3 space-y-1 bg-ink-850">
            {navTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  closeMenus();
                }}
                className={`w-full text-left px-3 py-2 rounded-md text-xs font-sans transition-colors ${
                  activeTab === tab.id
                    ? 'bg-ink-600 text-white font-semibold shadow-sm'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-ink-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6 bg-ink-850 relative">
            {/* 1. PROVIDERS */}
            {activeTab === 'providers' && (
              <div className="space-y-6">
                <div>
                  <h3 className={sectionTitle}>{t('settings.providers.title')}</h3>
                  <div className={`${subTitle} mb-2`}>{t('settings.providers.keys')}</div>

                  {/* Configured keys */}
                  <div className="space-y-1 mb-2">
                    {settings.providers && settings.providers.length > 0 ? (
                      settings.providers.map((p) => {
                        const isCurrentActive = p.id === settings.activeProviderId;
                        return (
                          <div
                            key={p.id}
                            className={`group flex items-center justify-between py-2 px-2.5 rounded transition-colors text-xs font-sans border ${
                              isCurrentActive ? 'bg-ink-700 border-ink-500' : 'hover:bg-ink-800 border-transparent'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <span className={`h-2 w-2 rounded-full ${p.isValidated ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                              <span className="text-gray-200 font-medium">{p.name}</span>
                              {isCurrentActive && (
                                <span className="rounded bg-ink-600 px-1.5 py-0.2 text-[9px] font-mono text-emerald-400 border border-emerald-900/60 uppercase">
                                  {t('settings.active')}
                                </span>
                              )}
                              {p.isValidated && p.models && (
                                <span className="text-[10px] font-mono text-gray-400">
                                  {t('settings.providers.modelCount', { count: p.models.length })}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center space-x-3">
                              <span className="text-gray-400 font-mono text-[11px]">{p.keyMasked}</span>
                              {!isCurrentActive && p.isValidated && (
                                <button
                                  type="button"
                                  onClick={() => handleActivateProvider(p)}
                                  aria-label={t('settings.activateAria', { name: p.name })}
                                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-sans underline"
                                >
                                  {t('settings.activate')}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingProvider({
                                    id: p.id,
                                    name: p.name,
                                    apiKey: '',
                                    baseUrl: p.baseUrl || '',
                                    isNew: false,
                                  });
                                  setValidationError(null);
                                }}
                                className="text-[11px] text-gray-400 hover:text-white font-sans underline"
                              >
                                {t('settings.editKey')}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirmingRemoveId === p.id) {
                                    setConfirmingRemoveId(null);
                                    handleRemoveProvider(p.id);
                                  } else {
                                    setConfirmingRemoveId(p.id);
                                  }
                                }}
                                onBlur={() => setConfirmingRemoveId(null)}
                                className="text-[11px] text-red-400 hover:text-red-300 font-sans opacity-70 group-hover:opacity-100"
                              >
                                {confirmingRemoveId === p.id ? t('settings.confirmRemove') : t('settings.remove')}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-xs text-gray-500 italic py-2 px-2 font-sans">
                        {t('settings.providers.empty')}
                      </div>
                    )}
                  </div>

                  {/* Add provider */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                      className="flex w-full items-center justify-between rounded p-2 text-xs font-sans text-gray-300 hover:text-white hover:bg-ink-800 cursor-pointer transition-colors border border-transparent hover:border-ink-500"
                    >
                      <span className="font-medium">{t('settings.providers.add')}</span>
                      <span className="text-gray-500 font-mono text-xs">{AVAILABLE_PROVIDERS.length}</span>
                    </button>

                    {showProviderDropdown && (
                      <div className="absolute left-0 top-10 z-50 w-80 rounded-xl border border-ink-500 bg-ink-800 p-3 shadow-2xl">
                        <div className="relative mb-2">
                          <input
                            type="text"
                            placeholder={t('settings.providers.search')}
                            value={providerSearch}
                            onChange={(e) => setProviderSearch(e.target.value)}
                            autoFocus
                            className="w-full rounded-lg border border-ink-400 bg-ink-900 px-3 py-1.5 text-xs font-sans text-white placeholder:text-gray-500 outline-none focus:border-gray-400"
                          />
                        </div>

                        <div className="max-h-60 overflow-y-auto space-y-0.5 pr-1">
                          {filteredProviders.map((prov) => (
                            <button
                              key={prov.id}
                              type="button"
                              onClick={() => {
                                setEditingProvider({
                                  id: prov.id,
                                  name: prov.name,
                                  apiKey: '',
                                  baseUrl: prov.defaultUrl,
                                  isNew: true,
                                });
                                setValidationError(null);
                                setShowProviderDropdown(false);
                              }}
                              className="flex w-full cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-xs font-sans hover:bg-ink-600 text-gray-200 hover:text-white transition-colors"
                            >
                              <span>{prov.name}</span>
                              <span className="text-[10px] font-mono text-gray-400">{prov.envKey}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Inline form to insert an API key with live validation */}
                    {editingProvider && (
                      <div className="mt-3 rounded-lg border border-ink-500 bg-ink-800 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-sans text-white font-semibold">
                            {t('settings.providers.keyFor', { name: editingProvider.name })}
                          </span>
                          <button
                            type="button"
                            aria-label={t('settings.cancel')}
                            onClick={() => {
                              setEditingProvider(null);
                              setValidationError(null);
                            }}
                            className="text-gray-500 hover:text-gray-300"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {validationError && (
                          <div className="rounded border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-200 flex items-start space-x-2">
                            <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <span className="font-semibold text-red-300">{t('settings.providers.validationError')}</span>
                              <p className="text-[11px] leading-relaxed text-red-200">{validationError}</p>
                            </div>
                          </div>
                        )}

                        <div className="space-y-1">
                          <label className="text-[11px] font-sans text-gray-400" htmlFor="provider-api-key">
                            {t('settings.providers.apiKey')}
                          </label>
                          <input
                            id="provider-api-key"
                            type="password"
                            autoComplete="off"
                            spellCheck={false}
                            value={editingProvider.apiKey}
                            onChange={(e) => {
                              setEditingProvider({ ...editingProvider, apiKey: e.target.value });
                              if (validationError) setValidationError(null);
                            }}
                            placeholder={editingProvider.isNew === false ? t('settings.providers.keyKeep') : t('settings.providers.keyPlaceholder')}
                            disabled={isValidatingKey}
                            className="w-full rounded border border-ink-400 bg-ink-900 px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-gray-400 disabled:opacity-50"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !isValidatingKey) handleSaveProviderKey();
                            }}
                          />
                        </div>

                        {(editingProvider.id === 'custom' || editingProvider.id === 'ollama') && (
                          <div className="space-y-1">
                            <label className="text-[11px] font-sans text-gray-400" htmlFor="provider-base-url">
                              {t('settings.providers.baseUrl')}
                            </label>
                            <input
                              id="provider-base-url"
                              type="text"
                              value={editingProvider.baseUrl}
                              onChange={(e) => setEditingProvider({ ...editingProvider, baseUrl: e.target.value })}
                              placeholder="http://localhost:11434"
                              disabled={isValidatingKey}
                              className="w-full rounded border border-ink-400 bg-ink-900 px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-gray-400 disabled:opacity-50"
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-ink-600">
                          <span className="text-[10px] text-gray-400 font-mono">{t('settings.providers.validateHint')}</span>
                          <div className="flex space-x-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingProvider(null);
                                setValidationError(null);
                              }}
                              disabled={isValidatingKey}
                              className="px-3 py-1 text-xs font-sans text-gray-400 hover:text-white disabled:opacity-50"
                            >
                              {t('settings.cancel')}
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveProviderKey}
                              disabled={isValidatingKey}
                              className="flex items-center space-x-1.5 rounded bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-sans text-white font-medium transition-colors shadow-sm disabled:opacity-60"
                            >
                              {isValidatingKey ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  <span>{t('settings.validating')}</span>
                                </>
                              ) : (
                                <span>{t('settings.providers.saveKey')}</span>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <hr className="border-ink-600" />

                {/* VOICE DICTATION (DEEPGRAM) & SPOKEN LANGUAGE */}
                <div className="space-y-3">
                  <div className={subTitle}>{t('settings.voice.title')}</div>

                  {settings.deepgramValidated && !isEditingDeepgram ? (
                    <div className="flex items-center justify-between py-2 px-2.5 rounded bg-ink-700 border border-ink-500 text-xs font-sans">
                      <div className="flex items-center space-x-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span className="text-gray-200 font-medium">Deepgram (Nova-2)</span>
                        <span className="rounded bg-ink-600 px-1.5 py-0.2 text-[9px] font-mono text-emerald-400 border border-emerald-900/60 uppercase">
                          {t('settings.active')}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-gray-400 font-mono text-[11px]">
                          {settings.deepgramKeyMasked || t('settings.voice.configured')}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setDeepgramDraftKey('');
                            setIsEditingDeepgram(true);
                            setDeepgramError(null);
                          }}
                          className="text-[11px] text-gray-400 hover:text-white font-sans underline"
                        >
                          {t('settings.editKey')}
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveDeepgramKey}
                          className="text-[11px] text-red-400 hover:text-red-300 font-sans"
                        >
                          {t('settings.remove')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-ink-500 bg-ink-800 p-3.5 space-y-2.5">
                      {deepgramError && (
                        <div className="rounded border border-red-900/60 bg-red-950/40 p-2.5 text-xs text-red-200 flex items-start space-x-2">
                          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                          <span className="text-[11px] leading-relaxed">{deepgramError}</span>
                        </div>
                      )}
                      <p className="text-[11px] text-gray-400">{t('settings.voice.hint')}</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                            autoComplete="off"
                            spellCheck={false}
                          value={deepgramDraftKey}
                          onChange={(e) => {
                            setDeepgramDraftKey(e.target.value);
                            if (deepgramError) setDeepgramError(null);
                          }}
                          placeholder={t('settings.voice.placeholder')}
                          disabled={isValidatingDeepgram}
                          aria-label={t('settings.voice.keyAria')}
                          className="flex-1 rounded border border-ink-400 bg-ink-900 px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-gray-400 disabled:opacity-50"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !isValidatingDeepgram) handleSaveDeepgramKey();
                          }}
                        />
                        {isEditingDeepgram && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingDeepgram(false);
                              setDeepgramError(null);
                            }}
                            disabled={isValidatingDeepgram}
                            className="px-2.5 py-1.5 text-xs font-sans text-gray-400 hover:text-white"
                          >
                            {t('settings.cancel')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleSaveDeepgramKey}
                          disabled={isValidatingDeepgram}
                          className="flex items-center space-x-1.5 rounded bg-emerald-600 hover:bg-emerald-500 px-3.5 py-1.5 text-xs font-sans text-white font-medium transition-colors shadow-sm disabled:opacity-60"
                        >
                          {isValidatingDeepgram ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>{t('settings.validating')}</span>
                            </>
                          ) : (
                            <span>{t('settings.voice.save')}</span>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Spoken language */}
                  <div className="rounded-lg border border-ink-600 bg-ink-800 p-3 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-sans">
                      <div>
                        <span className="text-gray-200 font-medium block">{t('settings.voice.language')}</span>
                        <span className="text-[11px] text-gray-400">{t('settings.voice.languageHint')}</span>
                      </div>
                      <select
                        aria-label={t('settings.voice.language')}
                        value={settings.voiceLanguage || 'pt-BR'}
                        onChange={(e) => updateSettings({ voiceLanguage: e.target.value })}
                        className={selectClass}
                      >
                        {VOICE_LANGUAGES.map((lang) => (
                          <option key={lang.code} value={lang.code}>
                            {lang.label} ({lang.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {VOICE_LANGUAGES.filter((l) => QUICK_VOICE_LANGUAGES.includes(l.code)).map((opt) => {
                        const checked = (settings.voiceLanguage || 'pt-BR') === opt.code;
                        return (
                          <label
                            key={opt.code}
                            className={`flex cursor-pointer items-center space-x-1.5 rounded border px-2.5 py-1 text-[11px] font-sans transition-colors ${
                              checked
                                ? 'border-emerald-500/80 bg-emerald-950/30 text-emerald-300 font-medium'
                                : 'border-ink-500 bg-ink-850 text-gray-400 hover:text-gray-200'
                            }`}
                          >
                            <input
                              type="radio"
                              name="voice-language"
                              checked={checked}
                              onChange={() => updateSettings({ voiceLanguage: opt.code })}
                              className="h-3 w-3 accent-emerald-500 rounded"
                            />
                            <span>{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. MODEL */}
            {activeTab === 'model' && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={sectionTitle.replace(' mb-4', '')}>{t('settings.model.title')}</h3>
                    {activeProvider && activeProvider.isValidated && (
                      <span className="text-xs font-sans text-gray-400 flex items-center space-x-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span>
                          {t('settings.model.activeProvider')} <strong className="text-white">{activeProvider.name}</strong>
                          {activeProvider.models && ` ${t('settings.providers.modelCount', { count: activeProvider.models.length })}`}
                        </span>
                      </span>
                    )}
                  </div>

                  {(!activeProvider || !activeProvider.isValidated) && (
                    <div className="rounded-lg border border-amber-900/60 bg-amber-950/25 p-4 mb-5 text-xs space-y-2">
                      <div className="flex items-center space-x-2 text-amber-300 font-semibold">
                        <AlertTriangle className="h-4 w-4" />
                        <span>{t('settings.model.noProvider')}</span>
                      </div>
                      <p className="text-[11px] text-gray-300 leading-relaxed">{t('settings.model.noProviderHint')}</p>
                      <button
                        type="button"
                        onClick={() => setActiveTab('providers')}
                        className="rounded bg-amber-600/30 hover:bg-amber-600/40 text-amber-200 border border-amber-500/50 px-3 py-1 text-xs font-medium transition-colors"
                      >
                        {t('settings.model.goToProviders')}
                      </button>
                    </div>
                  )}

                  <div className="flex items-start justify-between py-3 border-b border-ink-700 relative">
                    <div>
                      <div className="text-xs font-sans text-gray-200 font-semibold">{t('settings.model.main')}</div>
                      <div className="text-[11px] font-sans text-gray-400">{t('settings.model.mainHint')}</div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {/* Model picker */}
                      <div className="relative">
                        <button
                          type="button"
                          disabled={!activeProvider?.isValidated}
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsEffortMenuOpen(false);
                            setIsModelMenuOpen(!isModelMenuOpen);
                            setModelSearchQuery('');
                          }}
                          className="flex items-center space-x-1.5 rounded border border-ink-500 bg-ink-800 px-3 py-1 text-xs font-mono text-gray-200 hover:border-gray-500 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <span className="max-w-[160px] truncate">{currentModel}</span>
                          <ChevronDown className="h-3 w-3 text-gray-400" />
                        </button>

                        {isModelMenuOpen && (
                          <div
                            className="absolute right-0 top-9 z-50 w-80 rounded-xl border border-ink-500 bg-ink-850 p-3 shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="relative mb-2">
                              <input
                                type="text"
                                placeholder={t('models.search')}
                                value={modelSearchQuery}
                                onChange={(e) => setModelSearchQuery(e.target.value)}
                                autoFocus
                                className="w-full rounded-lg border border-ink-400 bg-ink-900 px-3 py-1.5 text-xs font-sans text-white placeholder:text-gray-500 outline-none focus:border-gray-400"
                              />
                            </div>
                            <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                              {filteredModels.length === 0 ? (
                                <div className="p-3 text-center text-xs text-gray-500 italic">{t('models.empty')}</div>
                              ) : (
                                filteredModels.map((m) => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => handleSelectModel(m)}
                                    className={`flex w-full cursor-pointer flex-col rounded p-2 text-left text-xs font-sans transition-colors ${
                                      currentModel === m.id
                                        ? 'bg-ink-600 text-white'
                                        : 'hover:bg-ink-700 text-gray-300 hover:text-white'
                                    }`}
                                  >
                                    <div className="flex w-full items-center justify-between font-medium">
                                      <span className="truncate pr-2">{m.name}</span>
                                      <span className="text-[10px] font-mono text-gray-400 shrink-0">{m.price}</span>
                                    </div>
                                    <div className="text-[10px] font-mono text-gray-500 truncate mt-0.5">
                                      {m.provider} · {m.slug} · {m.context}
                                      {m.isReasoning && ` · ${t('models.reasoning')}`}
                                    </div>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Reasoning effort */}
                      <div className="relative">
                        <button
                          type="button"
                          aria-label={t('settings.model.effortAria', { effort: settings.strongThinking })}
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsModelMenuOpen(false);
                            setIsEffortMenuOpen(!isEffortMenuOpen);
                          }}
                          className="flex items-center space-x-1.5 rounded border border-ink-500 bg-ink-800 px-3 py-1 text-xs font-mono text-gray-200 hover:border-gray-500 hover:text-white transition-colors"
                        >
                          <span>{settings.strongThinking}</span>
                          <ChevronDown className="h-3 w-3 text-gray-400" />
                        </button>

                        {isEffortMenuOpen && (
                          <div
                            className="absolute right-0 top-9 z-50 w-36 rounded-xl border border-ink-500 bg-ink-850 py-1.5 shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {EFFORT_LEVELS.map((lvl) => (
                              <button
                                key={lvl}
                                type="button"
                                onClick={() => handleSelectEffort(lvl)}
                                className={`flex w-full cursor-pointer items-center justify-between px-3.5 py-1.5 text-xs font-mono transition-colors ${
                                  settings.strongThinking === lvl
                                    ? 'bg-ink-600 text-white font-semibold'
                                    : 'hover:bg-ink-700 text-gray-400 hover:text-gray-200'
                                }`}
                              >
                                <span>{lvl}</span>
                                {settings.strongThinking === lvl && <Check className="h-3.5 w-3.5 text-white" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Diagnosis length */}
                  <div className={`${subTitle} mt-8 mb-3`}>{t('settings.model.diagnosis')}</div>
                  <div className="rounded-lg border border-ink-600 bg-ink-850 px-4 py-3.5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <label htmlFor="min-questions" className="text-sm text-gray-200">
                          {t('settings.model.minQuestions')}
                        </label>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          {t('settings.model.minQuestionsHint', {
                            min: PROBE_QUESTIONS_RANGE.min,
                            max: PROBE_QUESTIONS_RANGE.max,
                          })}
                        </p>
                      </div>
                      <span
                        data-testid="min-questions-value"
                        className="w-8 shrink-0 text-right font-mono text-sm font-semibold text-gray-100"
                      >
                        {clampProbeQuestions(settings.minQuestions)}
                      </span>
                    </div>
                    <input
                      id="min-questions"
                      type="range"
                      role="slider"
                      aria-label={t('settings.model.minQuestions')}
                      min={PROBE_QUESTIONS_RANGE.min}
                      max={PROBE_QUESTIONS_RANGE.max}
                      step={1}
                      value={clampProbeQuestions(settings.minQuestions)}
                      onChange={(e) => updateSettings({ minQuestions: clampProbeQuestions(e.target.value) })}
                      className="focus-ring mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-ink-600 accent-amber-400"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 3. GENERAL */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <h3 className={sectionTitle}>{t('settings.general.title')}</h3>
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-ink-600 bg-ink-800 p-3 text-xs font-sans">
                    <div>
                      <span className="text-gray-200 font-medium block">{t('settings.general.language')}</span>
                      <span className="text-[11px] text-gray-400">{t('settings.general.languageHint')}</span>
                    </div>
                    <select
                      aria-label={t('settings.general.language')}
                      value={settings.language}
                      onChange={(e) => updateSettings({ language: e.target.value as Lang })}
                      className={selectClass}
                    >
                      <option value="pt">Português (Brasil)</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
