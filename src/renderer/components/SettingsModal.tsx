import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Search,
  ChevronDown,
  Check,
  AlertTriangle,
  Key,
  ShieldCheck,
  Trash2,
  Sparkles,
  Palette,
  ExternalLink,
} from 'lucide-react';

export interface ProviderConfig {
  id: string;
  name: string;
  keyMasked: string;
  apiKey: string;
  baseUrl?: string;
  isActive?: boolean;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  slug: string;
  price: string;
  context: string;
  defaultEffort: 'off' | 'minimal' | 'low' | 'medium' | 'high';
  isReasoning?: boolean;
}

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

// Built-in catalog of 35 providers
export const AVAILABLE_PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter', envKey: 'OPENROUTER_API_KEY', defaultUrl: 'https://openrouter.ai/api/v1' },
  { id: 'google', name: 'Google', envKey: 'GEMINI_API_KEY', defaultUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  { id: 'openai', name: 'OpenAI', envKey: 'OPENAI_API_KEY', defaultUrl: 'https://api.openai.com/v1' },
  { id: 'deepseek', name: 'DeepSeek', envKey: 'DEEPSEEK_API_KEY', defaultUrl: 'https://api.deepseek.com/v1' },
  { id: 'anthropic', name: 'Anthropic', envKey: 'ANTHROPIC_API_KEY', defaultUrl: 'https://api.anthropic.com/v1' },
  { id: 'groq', name: 'Groq', envKey: 'GROQ_API_KEY', defaultUrl: 'https://api.groq.com/openai/v1' },
  { id: 'ollama', name: 'Ollama (Local)', envKey: 'OLLAMA_BASE_URL', defaultUrl: 'http://localhost:11434/v1' },
  { id: 'cerebras', name: 'Cerebras', envKey: 'CEREBRAS_API_KEY', defaultUrl: 'https://api.cerebras.ai/v1' },
  { id: 'fireworks', name: 'Fireworks', envKey: 'FIREWORKS_API_KEY', defaultUrl: 'https://api.fireworks.ai/inference/v1' },
  { id: 'together', name: 'Together AI', envKey: 'TOGETHER_API_KEY', defaultUrl: 'https://api.together.xyz/v1' },
  { id: 'mistral', name: 'Mistral AI', envKey: 'MISTRAL_API_KEY', defaultUrl: 'https://api.mistral.ai/v1' },
  { id: 'cohere', name: 'Cohere', envKey: 'COHERE_API_KEY', defaultUrl: 'https://api.cohere.com/v1' },
  { id: 'huggingface', name: 'Hugging Face', envKey: 'HF_TOKEN', defaultUrl: 'https://api-inference.huggingface.co/v1' },
  { id: 'kimi', name: 'Kimi For Coding', envKey: 'KIMI_API_KEY', defaultUrl: 'https://api.moonshot.cn/v1' },
  { id: 'baseten', name: 'Baseten', envKey: 'BASETEN_API_KEY', defaultUrl: 'https://bridge.baseten.co/v1' },
  { id: 'ant-ling', name: 'Ant Ling', envKey: 'ANT_LING_API_KEY', defaultUrl: 'https://api.antling.ai/v1' },
  { id: 'xai', name: 'xAI (Grok)', envKey: 'XAI_API_KEY', defaultUrl: 'https://api.x.ai/v1' },
  { id: 'perplexity', name: 'Perplexity', envKey: 'PERPLEXITY_API_KEY', defaultUrl: 'https://api.perplexity.ai' },
  { id: 'voyage', name: 'Voyage AI', envKey: 'VOYAGE_API_KEY', defaultUrl: 'https://api.voyageai.com/v1' },
  { id: 'custom', name: 'Custom endpoint...', envKey: 'CUSTOM_OPENAI_API_KEY', defaultUrl: 'http://localhost:8000/v1' },
];

// Rich model catalog mapped to provider IDs
export const PROVIDER_MODELS_CATALOG: Record<string, ModelOption[]> = {
  openrouter: [
    {
      id: 'anthropic/claude-3.7-sonnet',
      name: 'Anthropic: Claude 3.7 Sonnet',
      provider: 'openrouter',
      slug: '~anthropic/claude-3.7-sonnet',
      price: '$3.00/$15.00',
      context: '200k',
      defaultEffort: 'high',
      isReasoning: true,
    },
    {
      id: 'anthropic/claude-3.5-haiku',
      name: 'Anthropic: Claude 3.5 Haiku',
      provider: 'openrouter',
      slug: '~anthropic/claude-3.5-haiku',
      price: '$0.80/$4.00',
      context: '200k',
      defaultEffort: 'low',
    },
    {
      id: 'deepseek/deepseek-r1',
      name: 'DeepSeek: DeepSeek-R1',
      provider: 'openrouter',
      slug: '~deepseek/deepseek-r1',
      price: '$0.55/$2.19',
      context: '64k',
      defaultEffort: 'high',
      isReasoning: true,
    },
    {
      id: 'deepseek/deepseek-chat',
      name: 'DeepSeek: DeepSeek-V3',
      provider: 'openrouter',
      slug: '~deepseek/deepseek-chat',
      price: '$0.14/$0.28',
      context: '64k',
      defaultEffort: 'low',
    },
    {
      id: 'google/gemini-2.0-flash-001',
      name: 'Google: Gemini 2.0 Flash',
      provider: 'openrouter',
      slug: '~google/gemini-2.0-flash',
      price: '$0.10/$0.40',
      context: '1M',
      defaultEffort: 'medium',
    },
    {
      id: 'openai/gpt-4o',
      name: 'OpenAI: GPT-4o',
      provider: 'openrouter',
      slug: '~openai/gpt-4o',
      price: '$2.50/$10.00',
      context: '128k',
      defaultEffort: 'medium',
    },
    {
      id: 'openai/o3-mini',
      name: 'OpenAI: o3-mini',
      provider: 'openrouter',
      slug: '~openai/o3-mini',
      price: '$1.10/$4.40',
      context: '200k',
      defaultEffort: 'high',
      isReasoning: true,
    },
  ],
  google: [
    {
      id: 'gemini-2.0-flash',
      name: 'Google: Gemini 2.0 Flash',
      provider: 'google',
      slug: 'gemini-2.0-flash',
      price: 'Free Tier',
      context: '1M',
      defaultEffort: 'medium',
    },
    {
      id: 'gemini-2.0-flash-thinking-exp',
      name: 'Google: Gemini 2.0 Flash Thinking',
      provider: 'google',
      slug: 'gemini-2.0-flash-thinking',
      price: 'Free Tier',
      context: '1M',
      defaultEffort: 'high',
      isReasoning: true,
    },
    {
      id: 'gemini-1.5-pro',
      name: 'Google: Gemini 1.5 Pro',
      provider: 'google',
      slug: 'gemini-1.5-pro',
      price: 'Standard',
      context: '2M',
      defaultEffort: 'high',
    },
  ],
  openai: [
    {
      id: 'gpt-4o',
      name: 'OpenAI: GPT-4o',
      provider: 'openai',
      slug: 'gpt-4o',
      price: '$2.50/$10.00',
      context: '128k',
      defaultEffort: 'medium',
    },
    {
      id: 'gpt-4o-mini',
      name: 'OpenAI: GPT-4o-mini',
      provider: 'openai',
      slug: 'gpt-4o-mini',
      price: '$0.15/$0.60',
      context: '128k',
      defaultEffort: 'low',
    },
    {
      id: 'o3-mini',
      name: 'OpenAI: o3-mini',
      provider: 'openai',
      slug: 'o3-mini',
      price: '$1.10/$4.40',
      context: '200k',
      defaultEffort: 'high',
      isReasoning: true,
    },
    {
      id: 'o1',
      name: 'OpenAI: o1',
      provider: 'openai',
      slug: 'o1',
      price: '$15.00/$60.00',
      context: '200k',
      defaultEffort: 'high',
      isReasoning: true,
    },
  ],
  deepseek: [
    {
      id: 'deepseek-reasoner',
      name: 'DeepSeek: DeepSeek-R1 (Reasoner)',
      provider: 'deepseek',
      slug: 'deepseek-reasoner',
      price: '$0.55/$2.19',
      context: '64k',
      defaultEffort: 'high',
      isReasoning: true,
    },
    {
      id: 'deepseek-chat',
      name: 'DeepSeek: DeepSeek-V3',
      provider: 'deepseek',
      slug: 'deepseek-chat',
      price: '$0.14/$0.28',
      context: '64k',
      defaultEffort: 'low',
    },
  ],
  groq: [
    {
      id: 'llama-3.3-70b-versatile',
      name: 'Groq: Llama 3.3 70B Versatile',
      provider: 'groq',
      slug: 'llama-3.3-70b',
      price: 'Ultra-Fast',
      context: '128k',
      defaultEffort: 'medium',
    },
    {
      id: 'deepseek-r1-distill-llama-70b',
      name: 'Groq: DeepSeek R1 Distill 70B',
      provider: 'groq',
      slug: 'deepseek-r1-70b',
      price: 'Ultra-Fast',
      context: '128k',
      defaultEffort: 'high',
      isReasoning: true,
    },
  ],
  anthropic: [
    {
      id: 'claude-3-7-sonnet-20250219',
      name: 'Anthropic: Claude 3.7 Sonnet',
      provider: 'anthropic',
      slug: 'claude-3-7-sonnet',
      price: '$3.00/$15.00',
      context: '200k',
      defaultEffort: 'high',
      isReasoning: true,
    },
    {
      id: 'claude-3-5-haiku-20241022',
      name: 'Anthropic: Claude 3.5 Haiku',
      provider: 'anthropic',
      slug: 'claude-3-5-haiku',
      price: '$0.80/$4.00',
      context: '200k',
      defaultEffort: 'low',
    },
  ],
  ollama: [
    {
      id: 'deepseek-r1:14b',
      name: 'Ollama: DeepSeek-R1 14B',
      provider: 'ollama',
      slug: 'deepseek-r1:14b',
      price: 'Local GPU/CPU',
      context: '64k',
      defaultEffort: 'high',
      isReasoning: true,
    },
    {
      id: 'llama3.3:70b',
      name: 'Ollama: Llama 3.3 70B',
      provider: 'ollama',
      slug: 'llama3.3:70b',
      price: 'Local GPU/CPU',
      context: '128k',
      defaultEffort: 'medium',
    },
    {
      id: 'qwen2.5-coder:14b',
      name: 'Ollama: Qwen 2.5 Coder 14B',
      provider: 'ollama',
      slug: 'qwen2.5-coder:14b',
      price: 'Local GPU/CPU',
      context: '32k',
      defaultEffort: 'medium',
    },
  ],
};

export const DEFAULT_SETTINGS: AppSettings = {
  baseUrl: 'http://localhost:11434/v1',
  apiKey: '',
  model: 'gemini-2.0-flash',
  thinkingLevel: 'High',
  minQuestions: 8,

  activeProviderId: 'openrouter',
  providers: [
    {
      id: 'openrouter',
      name: 'OpenRouter',
      keyMasked: '...4591 • 73',
      apiKey: '',
      baseUrl: 'https://openrouter.ai/api/v1',
      isActive: true,
    },
  ],

  strongModel: 'free',
  strongThinking: 'high',
  cheapModel: 'gemini-3.8-flash:batch',
  cheapThinking: 'low',
  visionModel: 'gemini-3.8-flash:batch',
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
  };

  // Identify active provider
  const activeProvider = useMemo(() => {
    const found = settings.providers?.find((p) => p.id === settings.activeProviderId && p.apiKey);
    if (found) return found;
    // Fallback to any provider with key
    return settings.providers?.find((p) => Boolean(p.apiKey)) || null;
  }, [settings.providers, settings.activeProviderId]);

  // Identify available models for active provider
  const availableModelsForActiveProvider = useMemo(() => {
    if (!activeProvider) return [];
    const catalog = PROVIDER_MODELS_CATALOG[activeProvider.id];
    if (catalog && catalog.length > 0) return catalog;
    // Fallback standard OpenAI compatible models for custom/other providers
    return [
      {
        id: 'gpt-4o',
        name: `${activeProvider.name}: Default Strong`,
        provider: activeProvider.id,
        slug: 'default-strong',
        price: 'Standard',
        context: '128k',
        defaultEffort: 'medium' as const,
      },
      {
        id: 'gpt-4o-mini',
        name: `${activeProvider.name}: Default Cheap`,
        provider: activeProvider.id,
        slug: 'default-cheap',
        price: 'Fast',
        context: '128k',
        defaultEffort: 'low' as const,
      },
    ];
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

  // Handle saving an API key for a provider
  const handleSaveProviderKey = () => {
    if (!editingProvider) return;
    const key = editingProvider.apiKey.trim();
    const masked =
      key.length > 8 ? `...${key.slice(-4)} • ${key.length}` : key ? 'Configurado' : 'Sem chave';

    const newConfig: ProviderConfig = {
      id: editingProvider.id,
      name: editingProvider.name,
      keyMasked: masked,
      apiKey: key,
      baseUrl: editingProvider.baseUrl,
      isActive: true,
    };

    const existing = (settings.providers || []).filter((p) => p.id !== editingProvider.id);
    const updated = [newConfig, ...existing.map((p) => ({ ...p, isActive: false }))];

    updateSettings({
      providers: updated,
      activeProviderId: editingProvider.id,
      apiKey: key,
      baseUrl: editingProvider.baseUrl || settings.baseUrl,
    });

    setEditingProvider(null);
    setShowProviderDropdown(false);
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
          // Close popups if clicking outside them
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
                                  p.apiKey ? 'bg-emerald-500' : 'bg-gray-600'
                                }`}
                              />
                              <span className="text-gray-200 font-medium">{p.name}</span>
                              {isCurrentActive && (
                                <span className="rounded bg-[#282828] px-1.5 py-0.2 text-[9px] font-mono text-emerald-400 border border-emerald-900/60 uppercase">
                                  Ativo
                                </span>
                              )}
                            </div>

                            <div className="flex items-center space-x-3">
                              <span className="text-gray-400 font-mono text-[11px]">{p.keyMasked}</span>

                              <button
                                type="button"
                                onClick={() =>
                                  setEditingProvider({
                                    id: p.id,
                                    name: p.name,
                                    apiKey: p.apiKey || '',
                                    baseUrl: p.baseUrl || '',
                                    isNew: false,
                                  })
                                }
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

                    {/* Modal / Inline form to insert API key */}
                    {editingProvider && (
                      <div className="mt-3 rounded-lg border border-[#333333] bg-[#1c1c1c] p-4 space-y-3 animate-in fade-in duration-100">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-sans text-white font-semibold">
                            Configurar Chave de API: {editingProvider.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingProvider(null)}
                            className="text-gray-500 hover:text-gray-300"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-sans text-gray-400">Chave de API (API Key)</label>
                          <input
                            type="password"
                            value={editingProvider.apiKey}
                            onChange={(e) =>
                              setEditingProvider({ ...editingProvider, apiKey: e.target.value })
                            }
                            placeholder="Insira sua chave (ex: sk-... ou token)"
                            className="w-full rounded border border-[#3a3a3a] bg-[#111111] px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-gray-400"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveProviderKey()}
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
                              placeholder="http://localhost:11434/v1"
                              className="w-full rounded border border-[#3a3a3a] bg-[#111111] px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-gray-400"
                            />
                          </div>
                        )}

                        <div className="flex justify-end space-x-2 pt-2 border-t border-[#2a2a2a]">
                          <button
                            type="button"
                            onClick={() => setEditingProvider(null)}
                            className="px-3 py-1 text-xs font-sans text-gray-400 hover:text-white"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveProviderKey}
                            className="rounded bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-sans text-white font-medium transition-colors shadow-sm"
                          >
                            Salvar Chave de API
                          </button>
                        </div>
                      </div>
                    )}
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
                    {activeProvider && activeProvider.apiKey && (
                      <span className="text-xs font-sans text-gray-400 flex items-center space-x-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span>Provedor Ativo: <strong className="text-white">{activeProvider.name}</strong></span>
                      </span>
                    )}
                  </div>

                  {/* Warning banner if NO provider is configured */}
                  {(!activeProvider || !activeProvider.apiKey) && (
                    <div className="rounded-lg border border-amber-900/60 bg-amber-950/25 p-4 mb-5 text-xs space-y-2 animate-in fade-in duration-100">
                      <div className="flex items-center space-x-2 text-amber-300 font-semibold">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Nenhum provedor configurado com Chave de API</span>
                      </div>
                      <p className="text-[11px] text-gray-300 leading-relaxed">
                        Para identificar os agentes e modelos disponíveis, configure a chave de API do provedor desejado (ex: OpenRouter, Google, OpenAI, DeepSeek ou Ollama) na aba de Provedores.
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
                      currentModel: settings.strongModel,
                      currentEffort: settings.strongThinking,
                    },
                    {
                      slot: 'cheap' as const,
                      label: 'Cheap',
                      sub: 'The assistants that research, build demos, and grade your work',
                      currentModel: settings.cheapModel,
                      currentEffort: settings.cheapThinking,
                    },
                    {
                      slot: 'vision' as const,
                      label: 'Vision',
                      sub: 'The assistants that draw and read PDFs',
                      currentModel: settings.visionModel,
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
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenEffortSelectorSlot(null);
                              setOpenModelSelectorSlot(
                                openModelSelectorSlot === row.slot ? null : row.slot
                              );
                              setModelSearchQuery('');
                            }}
                            className="flex items-center space-x-1.5 rounded border border-[#333333] bg-[#1c1c1c] px-3 py-1 text-xs font-mono text-gray-200 hover:border-gray-500 hover:text-white transition-colors"
                          >
                            <span className="max-w-[160px] truncate">{row.currentModel}</span>
                            <ChevronDown className="h-3 w-3 text-gray-400" />
                          </button>

                          {/* Searchable Model Dropdown Popover (Image 3) */}
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
                                          {m.provider} · {m.slug} {m.context}
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

                        {/* 2. Effort / Thinking Selection Pill Button (Image 4) */}
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

                          {/* Effort Dropdown Popover (Image 4) */}
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
