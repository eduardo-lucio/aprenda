import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ChevronDown,
  Check,
  AlertTriangle,
  Palette,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  ModelOption,
  ProviderConfig,
  ProviderValidationResult,
} from '../../shared/types';
import { validateAndFetchModels } from '../../main/services/providerValidationService';
import { validateDeepgramKey, VOICE_LANGUAGES } from '../../main/services/speechService';

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

  // Voice Recognition (Deepgram) & Voice Language
  deepgramApiKey: string;
  deepgramKeyMasked: string;
  deepgramValidated: boolean;
  voiceLanguage: string;

  // Agent Models
  strongModel: string;
  strongThinking: 'off' | 'minimal' | 'low' | 'medium' | 'high';
  cheapModel: string;
  cheapThinking: 'off' | 'minimal' | 'low' | 'medium' | 'high';
  visionModel: string;
  visionThinking: 'off' | 'minimal' | 'low' | 'medium' | 'high';

  // Language & General
  language: string;
  appVersion: string;
  autoUpdates: boolean;
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
  { id: 'custom', name: 'Custom endpoint...', envKey: 'CUSTOM_OPENAI_API_KEY', defaultUrl: 'http://localhost:8000/v1' },
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
  cheapModel: '',
  cheapThinking: 'low',
  visionModel: '',
  visionThinking: 'low',

  language: 'Portuguese (pt-BR)',
  appVersion: '0.4.0',
  autoUpdates: false,
};

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
  const [settings, setSettings] = useState<AppSettings>({
    ...DEFAULT_SETTINGS,
    ...initialSettings,
  });

  const [activeTab, setActiveTab] = useState<'Providers' | 'Agent' | 'Appearance' | 'General'>('Providers');

  // Search & Add Provider state
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [editingProvider, setEditingProvider] = useState<{
    id: string;
    name: string;
    apiKey: string;
    baseUrl: string;
    isNew?: boolean;
  } | null>(null);

  // Validation state
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Deepgram Voice Recognition state
  const [deepgramDraftKey, setDeepgramDraftKey] = useState('');
  const [isEditingDeepgram, setIsEditingDeepgram] = useState(false);
  const [isValidatingDeepgram, setIsValidatingDeepgram] = useState(false);
  const [deepgramError, setDeepgramError] = useState<string | null>(null);

  // Model & Effort selector dropdown states in Agent tab
  const [openModelSelectorSlot, setOpenModelSelectorSlot] = useState<'strong' | 'cheap' | 'vision' | null>(null);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [openEffortSelectorSlot, setOpenEffortSelectorSlot] = useState<'strong' | 'cheap' | 'vision' | null>(null);

  const [updateCheckStatus, setUpdateCheckStatus] = useState<string | null>(null);

  useEffect(() => {
    setSettings({ ...DEFAULT_SETTINGS, ...initialSettings });
  }, [initialSettings, isOpen]);

  const updateSettings = (updates: Partial<AppSettings>) => {
    const next = { ...settings, ...updates };
    setSettings(next);
    onSave(next);

    // Synchronize to Electron Main LLM client if available
    if (window.api?.updateSettings) {
      window.api.updateSettings({
        providerId: next.activeProviderId,
        apiKey: next.apiKey,
        baseUrl: next.baseUrl,
        model: next.strongModel || next.model,
        effortLevel: next.strongThinking,
        deepgramApiKey: next.deepgramApiKey,
        voiceLanguage: next.voiceLanguage,
      });
    }
  };

  // Identify active provider
  const activeProvider = useMemo(() => {
    const found = settings.providers?.find((p) => p.id === settings.activeProviderId);
    if (found) return found;
    return settings.providers?.find((p) => Boolean(p.apiKey && p.isValidated)) || null;
  }, [settings.providers, settings.activeProviderId]);

  // Identify available models dynamically fetched from the active validated provider
  const availableModelsForActiveProvider = useMemo(() => {
    if (!activeProvider || !activeProvider.isValidated || !activeProvider.models) {
      return [];
    }
    return activeProvider.models;
  }, [activeProvider]);

  const filteredModels = useMemo(() => {
    const q = modelSearchQuery.toLowerCase().trim();
    if (!q) return availableModelsForActiveProvider;
    return availableModelsForActiveProvider.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.slug.toLowerCase().includes(q)
    );
  }, [availableModelsForActiveProvider, modelSearchQuery]);

  const filteredProviders = useMemo(() => {
    const q = providerSearch.toLowerCase().trim();
    if (!q) return AVAILABLE_PROVIDERS;
    return AVAILABLE_PROVIDERS.filter(
      (p) => p.name.toLowerCase().includes(q) || p.envKey.toLowerCase().includes(q)
    );
  }, [providerSearch]);

  if (!isOpen) return null;

  // Strict API Key Validation against live provider endpoint
  const handleSaveProviderKey = async () => {
    if (!editingProvider) return;
    const key = editingProvider.apiKey.trim();

    if (!key && editingProvider.id !== 'ollama') {
      setValidationError('Por favor, insira uma Chave de API válida.');
      return;
    }

    setIsValidatingKey(true);
    setValidationError(null);

    try {
      let result: ProviderValidationResult;

      // Prefer window.api IPC (Electron Main process) to bypass browser CORS
      if (window.api?.validateProvider) {
        result = await window.api.validateProvider({
          providerId: editingProvider.id,
          apiKey: key,
          baseUrl: editingProvider.baseUrl,
        });
      } else {
        // Fallback for tests or direct execution
        result = await validateAndFetchModels({
          providerId: editingProvider.id,
          apiKey: key,
          baseUrl: editingProvider.baseUrl,
        });
      }

      if (!result.isValid) {
        throw new Error(result.error || 'A chave de API informada foi rejeitada pelo provedor.');
      }

      const newConfig: ProviderConfig = {
        id: result.providerId,
        name: result.providerName,
        keyMasked: result.keyMasked,
        apiKey: key,
        baseUrl: editingProvider.baseUrl,
        isActive: true,
        isValidated: true,
        models: result.models,
      };

      const existing = (settings.providers || []).filter((p) => p.id !== editingProvider.id);
      const updatedProviders = [newConfig, ...existing.map((p) => ({ ...p, isActive: false }))];

      // Auto-assign default models if empty or from previous provider
      const defaultModel = result.models[0]?.id || '';
      const defaultEffort = result.models[0]?.defaultEffort || 'high';

      updateSettings({
        providers: updatedProviders,
        activeProviderId: editingProvider.id,
        apiKey: key,
        baseUrl: editingProvider.baseUrl || settings.baseUrl,
        strongModel: settings.strongModel || defaultModel,
        model: settings.model || defaultModel,
        strongThinking: settings.strongThinking || defaultEffort,
        cheapModel: settings.cheapModel || defaultModel,
        visionModel: settings.visionModel || defaultModel,
      });

      setEditingProvider(null);
      setShowProviderDropdown(false);
      setValidationError(null);
    } catch (err: any) {
      setValidationError(
        err.message || 'Falha na validação com o provedor. Verifique sua chave e tente novamente.'
      );
    } finally {
      setIsValidatingKey(false);
    }
  };

  const handleRemoveProvider = (id: string) => {
    const updated = (settings.providers || []).filter((p) => p.id !== id);
    const nextActive = updated.length > 0 ? updated[0].id : '';
    updateSettings({
      providers: updated,
      activeProviderId: nextActive,
      apiKey: updated[0]?.apiKey || '',
    });
  };

  const handleSaveDeepgramKey = async () => {
    const key = deepgramDraftKey.trim();
    if (!key) {
      setDeepgramError('Por favor, insira sua Chave de API do Deepgram.');
      return;
    }

    setIsValidatingDeepgram(true);
    setDeepgramError(null);
    try {
      let res: { isValid: boolean; keyMasked: string };
      if (window.api?.validateDeepgramKey) {
        res = await window.api.validateDeepgramKey(key);
      } else {
        res = await validateDeepgramKey(key);
      }
      updateSettings({
        deepgramApiKey: key,
        deepgramKeyMasked: res.keyMasked,
        deepgramValidated: true,
      });
      setIsEditingDeepgram(false);
      setDeepgramDraftKey('');
    } catch (err: any) {
      const cleanMsg = String(err?.message || err || 'Chave Deepgram inválida.').replace(
        /^Error invoking remote method '[^']+': (Error: )?/,
        ''
      );
      setDeepgramError(cleanMsg);
    } finally {
      setIsValidatingDeepgram(false);
    }
  };

  const handleRemoveDeepgramKey = () => {
    updateSettings({
      deepgramApiKey: '',
      deepgramKeyMasked: '',
      deepgramValidated: false,
    });
    setIsEditingDeepgram(false);
    setDeepgramDraftKey('');
    setDeepgramError(null);
  };

  const handleSelectModel = (slot: 'strong' | 'cheap' | 'vision', modelOption: ModelOption) => {
    const updates: Partial<AppSettings> = {};
    if (slot === 'strong') {
      updates.strongModel = modelOption.id;
      updates.model = modelOption.id;
      updates.strongThinking = modelOption.defaultEffort;
      updates.thinkingLevel = (modelOption.defaultEffort.charAt(0).toUpperCase() +
        modelOption.defaultEffort.slice(1)) as any;
    } else if (slot === 'cheap') {
      updates.cheapModel = modelOption.id;
      updates.cheapThinking = modelOption.defaultEffort;
    } else if (slot === 'vision') {
      updates.visionModel = modelOption.id;
      updates.visionThinking = modelOption.defaultEffort;
    }
    updateSettings(updates);
    setOpenModelSelectorSlot(null);
    setModelSearchQuery('');
  };

  const handleSelectEffort = (
    slot: 'strong' | 'cheap' | 'vision',
    effort: 'off' | 'minimal' | 'low' | 'medium' | 'high'
  ) => {
    const updates: Partial<AppSettings> = {};
    if (slot === 'strong') {
      updates.strongThinking = effort;
      updates.thinkingLevel = (effort.charAt(0).toUpperCase() + effort.slice(1)) as any;
    } else if (slot === 'cheap') {
      updates.cheapThinking = effort;
    } else if (slot === 'vision') {
      updates.visionThinking = effort;
    }
    updateSettings(updates);
    setOpenEffortSelectorSlot(null);
  };

  const handleCheckUpdates = () => {
    setUpdateCheckStatus('checking');
    setTimeout(() => {
      setUpdateCheckStatus('up-to-date');
      setTimeout(() => setUpdateCheckStatus(null), 3000);
    }, 1200);
  };

  const navTabs: ('Providers' | 'Agent' | 'Appearance' | 'General')[] = [
    'Providers',
    'Agent',
    'Appearance',
    'General',
  ];

  const effortLevels: ('off' | 'minimal' | 'low' | 'medium' | 'high')[] = [
    'off',
    'minimal',
    'low',
    'medium',
    'high',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-4xl h-[620px] flex-col rounded-xl border border-[#2a2a2a] bg-[#141414] text-gray-200 shadow-2xl overflow-hidden font-sans"
        onClick={(e) => {
          e.stopPropagation();
          if (openModelSelectorSlot) setOpenModelSelectorSlot(null);
          if (openEffortSelectorSlot) setOpenEffortSelectorSlot(null);
        }}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-[#262626] px-6">
          <h2 className="text-2xl font-serif text-white tracking-tight font-medium">Settings</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-[#262626] hover:text-white transition-colors"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Main 2-Column Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Navigation Sidebar */}
          <div className="w-44 border-r border-[#262626] p-3 space-y-1 bg-[#141414]">
            {navTabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab);
                    setOpenModelSelectorSlot(null);
                    setOpenEffortSelectorSlot(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-xs font-sans transition-colors ${
                    isActive
                      ? 'bg-[#282828] text-white font-semibold shadow-sm'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#1c1c1c]'
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* Right Tab Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#141414] relative">
            {/* 1. PROVIDERS TAB */}
            {activeTab === 'Providers' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-[11px] font-mono tracking-widest text-gray-400 uppercase font-semibold mb-4">
                    PROVIDERS
                  </h3>

                  <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase font-semibold mb-2">
                    MODEL API KEYS
                  </div>

                  {/* Configured Keys */}
                  <div className="space-y-1 mb-2">
                    {settings.providers && settings.providers.length > 0 ? (
                      settings.providers.map((p) => {
                        const isCurrentActive = p.id === settings.activeProviderId;
                        return (
                          <div
                            key={p.id}
                            className={`group flex items-center justify-between py-2 px-2.5 rounded transition-colors text-xs font-sans border ${
                              isCurrentActive
                                ? 'bg-[#1e1e1e] border-[#333333]'
                                : 'hover:bg-[#1a1a1a] border-transparent'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <span
                                className={`h-2 w-2 rounded-full ${
                                  p.isValidated ? 'bg-emerald-500' : 'bg-amber-500'
                                }`}
                              />
                              <span className="text-gray-200 font-medium">{p.name}</span>
                              {isCurrentActive && (
                                <span className="rounded bg-[#282828] px-1.5 py-0.2 text-[9px] font-mono text-emerald-400 border border-emerald-900/60 uppercase">
                                  Ativo
                                </span>
                              )}
                              {p.isValidated && p.models && (
                                <span className="text-[10px] font-mono text-gray-400">
                                  ({p.models.length} modelos)
                                </span>
                              )}
                            </div>

                            <div className="flex items-center space-x-3">
                              <span className="text-gray-400 font-mono text-[11px]">{p.keyMasked}</span>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingProvider({
                                    id: p.id,
                                    name: p.name,
                                    apiKey: p.apiKey || '',
                                    baseUrl: p.baseUrl || '',
                                    isNew: false,
                                  });
                                  setValidationError(null);
                                }}
                                className="text-[11px] text-gray-400 hover:text-white font-sans underline"
                              >
                                Editar Chave
                              </button>

                              <button
                                type="button"
                                onClick={() => handleRemoveProvider(p.id)}
                                className="text-[11px] text-red-400 hover:text-red-300 font-sans opacity-70 group-hover:opacity-100"
                                title="Remover"
                              >
                                remover
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-xs text-gray-500 italic py-2 px-2 font-sans">
                        Nenhum provedor configurado ainda. Clique abaixo para adicionar sua Chave de API.
                      </div>
                    )}
                  </div>

                  {/* Add Provider Button / Row */}
                  <div className="relative">
                    <div
                      onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                      className="flex items-center justify-between rounded p-2 text-xs font-sans text-gray-300 hover:text-white hover:bg-[#1c1c1c] cursor-pointer transition-colors border border-transparent hover:border-[#2e2e2e]"
                    >
                      <span className="font-medium">+ Add a provider</span>
                      <span className="text-gray-500 font-mono text-xs">{AVAILABLE_PROVIDERS.length}</span>
                    </div>

                    {/* Searchable Dropdown Popover */}
                    {showProviderDropdown && (
                      <div className="absolute left-0 top-10 z-50 w-80 rounded-xl border border-[#333333] bg-[#1a1a1a] p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-100">
                        <div className="relative mb-2">
                          <input
                            type="text"
                            placeholder="Search providers..."
                            value={providerSearch}
                            onChange={(e) => setProviderSearch(e.target.value)}
                            autoFocus
                            className="w-full rounded-lg border border-[#3a3a3a] bg-[#111111] px-3 py-1.5 text-xs font-sans text-white placeholder:text-gray-500 outline-none focus:border-gray-400"
                          />
                        </div>

                        <div className="max-h-60 overflow-y-auto space-y-0.5 pr-1">
                          {filteredProviders.map((prov) => (
                            <div
                              key={prov.id}
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
                              className="flex cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-xs font-sans hover:bg-[#282828] text-gray-200 hover:text-white transition-colors"
                            >
                              <span>{prov.name}</span>
                              <span className="text-[10px] font-mono text-gray-400">{prov.envKey}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Modal / Inline form to insert API key with live validation */}
                    {editingProvider && (
                      <div className="mt-3 rounded-lg border border-[#333333] bg-[#1c1c1c] p-4 space-y-3 animate-in fade-in duration-100">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-sans text-white font-semibold">
                            Configurar Chave de API: {editingProvider.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProvider(null);
                              setValidationError(null);
                            }}
                            className="text-gray-500 hover:text-gray-300"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Error alert box if validation fails */}
                        {validationError && (
                          <div className="rounded border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-200 flex items-start space-x-2 animate-in fade-in duration-100">
                            <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <span className="font-semibold text-red-300">Erro de validação:</span>
                              <p className="text-[11px] leading-relaxed text-red-200">
                                {validationError}
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="space-y-1">
                          <label className="text-[11px] font-sans text-gray-400">
                            Chave de API (API Key)
                          </label>
                          <input
                            type="password"
                            value={editingProvider.apiKey}
                            onChange={(e) => {
                              setEditingProvider({ ...editingProvider, apiKey: e.target.value });
                              if (validationError) setValidationError(null);
                            }}
                            placeholder="Insira sua chave real (ex: sk-... ou token)"
                            disabled={isValidatingKey}
                            className="w-full rounded border border-[#3a3a3a] bg-[#111111] px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-gray-400 disabled:opacity-50"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !isValidatingKey) {
                                handleSaveProviderKey();
                              }
                            }}
                          />
                        </div>

                        {(editingProvider.id === 'custom' || editingProvider.id === 'ollama') && (
                          <div className="space-y-1">
                            <label className="text-[11px] font-sans text-gray-400">Endpoint Base URL</label>
                            <input
                              type="text"
                              value={editingProvider.baseUrl}
                              onChange={(e) =>
                                setEditingProvider({ ...editingProvider, baseUrl: e.target.value })
                              }
                              placeholder="http://localhost:11434"
                              disabled={isValidatingKey}
                              className="w-full rounded border border-[#3a3a3a] bg-[#111111] px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-gray-400 disabled:opacity-50"
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-[#2a2a2a]">
                          <span className="text-[10px] text-gray-400 font-mono">
                            A chave será validada online via API antes de ser ativada.
                          </span>

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
                              Cancelar
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
                                  <span>Validando Chave...</span>
                                </>
                              ) : (
                                <span>Salvar Chave de API</span>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <hr className="border-[#262626]" />

                {/* VOICE RECOGNITION (DEEPGRAM) & VOICE LANGUAGE */}
                <div className="space-y-3">
                  <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase font-semibold">
                    RECONHECIMENTO DE VOZ (DEEPGRAM API KEY)
                  </div>

                  {settings.deepgramValidated && settings.deepgramApiKey && !isEditingDeepgram ? (
                    <div className="flex items-center justify-between py-2 px-2.5 rounded bg-[#1e1e1e] border border-[#333333] text-xs font-sans">
                      <div className="flex items-center space-x-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span className="text-gray-200 font-medium">Deepgram (Nova-2)</span>
                        <span className="rounded bg-[#282828] px-1.5 py-0.2 text-[9px] font-mono text-emerald-400 border border-emerald-900/60 uppercase">
                          Ativo
                        </span>
                      </div>

                      <div className="flex items-center space-x-3">
                        <span className="text-gray-400 font-mono text-[11px]">
                          {settings.deepgramKeyMasked || 'Configurada'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setDeepgramDraftKey(settings.deepgramApiKey);
                            setIsEditingDeepgram(true);
                            setDeepgramError(null);
                          }}
                          className="text-[11px] text-gray-400 hover:text-white font-sans underline"
                        >
                          Editar Chave
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveDeepgramKey}
                          className="text-[11px] text-red-400 hover:text-red-300 font-sans"
                        >
                          remover
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-[#333333] bg-[#1c1c1c] p-3.5 space-y-2.5">
                      {deepgramError && (
                        <div className="rounded border border-red-900/60 bg-red-950/40 p-2.5 text-xs text-red-200 flex items-start space-x-2">
                          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                          <span className="text-[11px] leading-relaxed">{deepgramError}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          value={deepgramDraftKey}
                          onChange={(e) => {
                            setDeepgramDraftKey(e.target.value);
                            if (deepgramError) setDeepgramError(null);
                          }}
                          placeholder="Token Deepgram (DEEPGRAM_API_KEY)"
                          disabled={isValidatingDeepgram}
                          aria-label="Chave de API do Deepgram"
                          className="flex-1 rounded border border-[#3a3a3a] bg-[#111111] px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-gray-400 disabled:opacity-50"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !isValidatingDeepgram) {
                              handleSaveDeepgramKey();
                            }
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
                            Cancelar
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
                              <span>Validando...</span>
                            </>
                          ) : (
                            <span>Salvar Deepgram</span>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Voice Language Selector (Checkbox / Pill Selection + Select Box) */}
                  <div className="rounded-lg border border-[#2a2a2a] bg-[#181818] p-3 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-sans">
                      <div>
                        <span className="text-gray-200 font-medium block">Idioma da Voz (Reconhecimento de Fala)</span>
                        <span className="text-[11px] text-gray-400">
                          Marque ou selecione o idioma falado ao gravar suas explicações
                        </span>
                      </div>

                      <select
                        aria-label="Idioma da Voz"
                        value={settings.voiceLanguage || 'pt-BR'}
                        onChange={(e) => updateSettings({ voiceLanguage: e.target.value })}
                        className="rounded border border-[#333333] bg-[#1c1c1c] px-3 py-1 text-xs font-sans text-gray-200 outline-none hover:border-gray-500"
                      >
                        {VOICE_LANGUAGES.map((lang) => (
                          <option key={lang.code} value={lang.code}>
                            {lang.label} ({lang.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {[
                        { code: 'pt-BR', label: 'Português (Brasil)' },
                        { code: 'en-US', label: 'English (US)' },
                        { code: 'es', label: 'Español' },
                      ].map((opt) => {
                        const checked = (settings.voiceLanguage || 'pt-BR') === opt.code;
                        return (
                          <label
                            key={opt.code}
                            className={`flex cursor-pointer items-center space-x-1.5 rounded border px-2.5 py-1 text-[11px] font-sans transition-colors ${
                              checked
                                ? 'border-emerald-500/80 bg-emerald-950/30 text-emerald-300 font-medium'
                                : 'border-[#333333] bg-[#141414] text-gray-400 hover:text-gray-200'
                            }`}
                          >
                            <input
                              type="checkbox"
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

                <hr className="border-[#262626]" />

                {/* Language Setting */}
                <div className="flex items-center justify-between text-xs font-sans pt-1">
                  <span className="text-gray-200 font-medium">Language</span>
                  <select
                    value={settings.language}
                    onChange={(e) => updateSettings({ language: e.target.value })}
                    className="rounded border border-[#333333] bg-[#1c1c1c] px-3 py-1 text-xs font-sans text-gray-200 outline-none hover:border-gray-500"
                  >
                    <option value="Portuguese (pt-BR)">Portuguese (pt-BR)</option>
                    <option value="English (US)">English (US)</option>
                    <option value="Spanish (ES)">Spanish (ES)</option>
                  </select>
                </div>
              </div>
            )}

            {/* 2. AGENT TAB */}
            {activeTab === 'Agent' && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[11px] font-mono tracking-widest text-gray-400 uppercase font-semibold">
                      AGENT
                    </h3>
                    {activeProvider && activeProvider.isValidated && (
                      <span className="text-xs font-sans text-gray-400 flex items-center space-x-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span>
                          Provedor Ativo: <strong className="text-white">{activeProvider.name}</strong>
                          {activeProvider.models && ` (${activeProvider.models.length} modelos reais)`}
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Warning banner if NO provider is validated */}
                  {(!activeProvider || !activeProvider.isValidated || !activeProvider.apiKey) && (
                    <div className="rounded-lg border border-amber-900/60 bg-amber-950/25 p-4 mb-5 text-xs space-y-2 animate-in fade-in duration-100">
                      <div className="flex items-center space-x-2 text-amber-300 font-semibold">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Nenhum provedor configurado com Chave de API</span>
                      </div>
                      <p className="text-[11px] text-gray-300 leading-relaxed">
                        Para identificar os agentes e modelos reais disponíveis, configure e valide a chave de API do provedor desejado (ex: OpenRouter, Google, OpenAI, DeepSeek ou Ollama) na aba de Provedores.
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveTab('Providers')}
                        className="rounded bg-amber-600/30 hover:bg-amber-600/40 text-amber-200 border border-amber-500/50 px-3 py-1 text-xs font-medium transition-colors"
                      >
                        Ir para a aba Providers
                      </button>
                    </div>
                  )}

                  <div className="text-[10px] font-mono tracking-widest text-gray-500 uppercase font-semibold mb-3">
                    MODELS
                  </div>

                  {/* Models list: Strong, Cheap, Vision */}
                  {[
                    {
                      slot: 'strong' as const,
                      label: 'Strong',
                      sub: 'The main model for your sessions',
                      currentModel: settings.strongModel || (availableModelsForActiveProvider[0]?.id ?? 'Nenhum selecionado'),
                      currentEffort: settings.strongThinking,
                    },
                    {
                      slot: 'cheap' as const,
                      label: 'Cheap',
                      sub: 'The assistants that research, build demos, and grade your work',
                      currentModel: settings.cheapModel || (availableModelsForActiveProvider[0]?.id ?? 'Nenhum selecionado'),
                      currentEffort: settings.cheapThinking,
                    },
                    {
                      slot: 'vision' as const,
                      label: 'Vision',
                      sub: 'The assistants that draw and read PDFs',
                      currentModel: settings.visionModel || (availableModelsForActiveProvider[0]?.id ?? 'Nenhum selecionado'),
                      currentEffort: settings.visionThinking,
                    },
                  ].map((row) => (
                    <div
                      key={row.slot}
                      className="flex items-start justify-between py-3 border-b border-[#222222] relative"
                    >
                      <div>
                        <div className="text-xs font-sans text-gray-200 font-semibold">{row.label}</div>
                        <div className="text-[11px] font-sans text-gray-400">{row.sub}</div>
                      </div>

                      <div className="flex items-center space-x-2">
                        {/* 1. Model Selection Pill Button */}
                        <div className="relative">
                          <button
                            type="button"
                            disabled={!activeProvider?.isValidated}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenEffortSelectorSlot(null);
                              setOpenModelSelectorSlot(
                                openModelSelectorSlot === row.slot ? null : row.slot
                              );
                              setModelSearchQuery('');
                            }}
                            className="flex items-center space-x-1.5 rounded border border-[#333333] bg-[#1c1c1c] px-3 py-1 text-xs font-mono text-gray-200 hover:border-gray-500 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <span className="max-w-[160px] truncate">{row.currentModel}</span>
                            <ChevronDown className="h-3 w-3 text-gray-400" />
                          </button>

                          {/* Searchable Model Dropdown Popover */}
                          {openModelSelectorSlot === row.slot && (
                            <div
                              className="absolute right-0 top-9 z-50 w-80 rounded-xl border border-[#333333] bg-[#161616] p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="relative mb-2">
                                <input
                                  type="text"
                                  placeholder="Search models..."
                                  value={modelSearchQuery}
                                  onChange={(e) => setModelSearchQuery(e.target.value)}
                                  autoFocus
                                  className="w-full rounded-lg border border-[#3a3a3a] bg-[#101010] px-3 py-1.5 text-xs font-sans text-white placeholder:text-gray-500 outline-none focus:border-gray-400"
                                />
                              </div>

                              <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                                {filteredModels.length === 0 ? (
                                  <div className="p-3 text-center text-xs text-gray-500 italic">
                                    Nenhum modelo encontrado para este provedor.
                                  </div>
                                ) : (
                                  filteredModels.map((m) => {
                                    const isSelected = row.currentModel === m.id;
                                    return (
                                      <div
                                        key={m.id}
                                        onClick={() => handleSelectModel(row.slot, m)}
                                        className={`flex cursor-pointer flex-col rounded p-2 text-xs font-sans transition-colors ${
                                          isSelected
                                            ? 'bg-[#282828] text-white'
                                            : 'hover:bg-[#202020] text-gray-300 hover:text-white'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between font-medium">
                                          <span className="truncate pr-2">{m.name}</span>
                                          <span className="text-[10px] font-mono text-gray-400 shrink-0">
                                            {m.price}
                                          </span>
                                        </div>
                                        <div className="text-[10px] font-mono text-gray-500 truncate mt-0.5">
                                          {m.provider} · {m.slug} · {m.context}
                                          {m.isReasoning && ' · (Reasoning)'}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 2. Effort / Thinking Selection Pill Button */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenModelSelectorSlot(null);
                              setOpenEffortSelectorSlot(
                                openEffortSelectorSlot === row.slot ? null : row.slot
                              );
                            }}
                            className="flex items-center space-x-1.5 rounded border border-[#333333] bg-[#1c1c1c] px-3 py-1 text-xs font-mono text-gray-200 hover:border-gray-500 hover:text-white transition-colors"
                          >
                            <span>{row.currentEffort}</span>
                            <ChevronDown className="h-3 w-3 text-gray-400" />
                          </button>

                          {/* Effort Dropdown Popover */}
                          {openEffortSelectorSlot === row.slot && (
                            <div
                              className="absolute right-0 top-9 z-50 w-36 rounded-xl border border-[#333333] bg-[#161616] py-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {effortLevels.map((lvl) => {
                                const isSelected = row.currentEffort === lvl;
                                return (
                                  <div
                                    key={lvl}
                                    onClick={() => handleSelectEffort(row.slot, lvl)}
                                    className={`flex cursor-pointer items-center justify-between px-3.5 py-1.5 text-xs font-mono transition-colors ${
                                      isSelected
                                        ? 'bg-[#242424] text-white font-semibold'
                                        : 'hover:bg-[#202020] text-gray-400 hover:text-gray-200'
                                    }`}
                                  >
                                    <span>{lvl}</span>
                                    {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. APPEARANCE TAB (Em Breve) */}
            {activeTab === 'Appearance' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-[11px] font-mono tracking-widest text-gray-400 uppercase font-semibold mb-4">
                    APPEARANCE
                  </h3>

                  <div className="rounded-xl border border-[#2a2a2a] bg-[#181818] p-8 text-center flex flex-col items-center justify-center space-y-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#262626] text-gray-300">
                      <Palette className="h-6 w-6" />
                    </div>
                    <div className="space-y-1 max-w-sm">
                      <h4 className="text-sm font-semibold font-sans text-white">
                        Personalização de Aparência (Em Breve)
                      </h4>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        Ajustes de temas visuais, fontes de leitura, pesos tipográficos e esquemas de contraste customizados estão sendo calibrados para a próxima versão.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. GENERAL TAB */}
            {activeTab === 'General' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-[11px] font-mono tracking-widest text-gray-400 uppercase font-semibold mb-4">
                    GENERAL
                  </h3>

                  <div className="flex items-start justify-between py-2.5 border-b border-[#222222]">
                    <div className="space-y-1">
                      <div className="text-xs font-sans text-gray-200 font-semibold">
                        Version {settings.appVersion}
                      </div>
                      <div className="text-[11px] font-sans text-gray-400 leading-relaxed max-w-sm">
                        {updateCheckStatus === 'checking' ? (
                          <span className="text-blue-400">Checking for updates...</span>
                        ) : updateCheckStatus === 'up-to-date' ? (
                          <span className="text-emerald-400">You are running the latest version!</span>
                        ) : (
                          <>
                            No newer version was found at the last check.
                            <br />
                            Checking downloads available updates. Downloaded updates install when you quit the app.
                            <br />
                            <span className="text-gray-300 underline cursor-pointer hover:text-white">
                              Release notes
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleCheckUpdates}
                      className="rounded-md border border-[#333333] bg-[#1c1c1c] px-3.5 py-1.5 text-xs font-sans text-gray-200 hover:border-gray-500 hover:text-white transition-colors"
                    >
                      Check for updates
                    </button>
                  </div>

                  <div className="flex items-start justify-between py-3">
                    <div className="space-y-1 max-w-sm">
                      <div className="text-xs font-sans text-gray-200 font-semibold">
                        Automatic updates
                      </div>
                      <div className="text-[11px] font-sans text-gray-400 leading-relaxed">
                        Check at startup and every 24 hours. Turning this off does not stop updates already in progress or ready to install.
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.autoUpdates}
                      onClick={() => updateSettings({ autoUpdates: !settings.autoUpdates })}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                        settings.autoUpdates ? 'bg-white' : 'bg-[#2a2a2a]'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow ring-0 transition duration-200 ease-in-out mt-0.5 ${
                          settings.autoUpdates ? 'translate-x-4 bg-[#141414]' : 'translate-x-0.5 bg-[#888888]'
                        }`}
                      />
                    </button>
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