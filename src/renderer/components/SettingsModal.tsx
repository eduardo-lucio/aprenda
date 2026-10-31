import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, ChevronDown, Check, Globe, RefreshCw } from 'lucide-react';

export interface ProviderConfig {
  id: string;
  name: string;
  keyMasked: string;
  apiKey: string;
  baseUrl?: string;
}

export interface AppSettings {
  // Backwards compatibility fields
  baseUrl: string;
  apiKey: string;
  model: string;
  thinkingLevel: 'High' | 'Medium' | 'Low' | 'Off';
  minQuestions: number;

  // Multi-provider configuration
  providers: ProviderConfig[];

  // Agent Models
  strongModel: string;
  strongThinking: 'high' | 'medium' | 'low' | 'off';
  cheapModel: string;
  cheapThinking: 'high' | 'medium' | 'low' | 'off';
  visionModel: string;
  visionThinking: 'high' | 'medium' | 'low' | 'off';

  // Agent Tools
  graphTools: boolean;
  quizzing: 'multiple_choice' | 'free_recall';
  toolResearch: boolean;
  toolDemo: boolean;
  toolVisual: boolean;
  toolPdf: boolean;

  // Subscriptions & CLI
  chatgptConnected: boolean;
  copilotConnected: boolean;
  grokConnected: boolean;
  claudeCode: boolean;

  // Dictation & Language
  deepgramKey: string;
  language: string;

  // Appearance
  mode: string;
  background: string;
  readingFont: string;
  readingFontSize: number;
  sessionNamesSerif: boolean;
  headingWeight: number;
  boldColor: string;
  italicColor: string;

  // Graph
  edgeStyle: 'curved' | 'straight';
  showArrowheads: boolean;
  autoFocusFrontier: boolean;

  // General
  appVersion: string;
  autoUpdates: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  baseUrl: 'http://localhost:11434/v1',
  apiKey: '',
  model: 'gemini-2.0-flash',
  thinkingLevel: 'High',
  minQuestions: 8,

  providers: [
    {
      id: 'openrouter',
      name: 'OpenRouter',
      keyMasked: '...868f • 73',
      apiKey: '',
      baseUrl: 'https://openrouter.ai/api/v1',
    },
  ],

  strongModel: 'free',
  strongThinking: 'high',
  cheapModel: 'gemini-3.8-flash:batch',
  cheapThinking: 'low',
  visionModel: 'gemini-3.8-flash:batch',
  visionThinking: 'low',

  graphTools: false,
  quizzing: 'multiple_choice',
  toolResearch: false,
  toolDemo: false,
  toolVisual: false,
  toolPdf: false,

  chatgptConnected: false,
  copilotConnected: false,
  grokConnected: false,
  claudeCode: false,

  deepgramKey: 'Key • ...370c • 40',
  language: 'Portuguese (pt-BR)',

  mode: 'Dark',
  background: '#141414',
  readingFont: 'Source Sans 3',
  readingFontSize: 16,
  sessionNamesSerif: false,
  headingWeight: 900,
  boldColor: 'same as text',
  italicColor: 'same as text',

  edgeStyle: 'curved',
  showArrowheads: true,
  autoFocusFrontier: true,

  appVersion: '0.4.0',
  autoUpdates: false,
};

const AVAILABLE_PROVIDERS = [
  { id: 'ant-ling', name: 'Ant Ling', envKey: 'ANT_LING_API_KEY' },
  { id: 'anthropic', name: 'Anthropic', envKey: 'ANTHROPIC_API_KEY' },
  { id: 'baseten', name: 'Baseten', envKey: 'BASETEN_API_KEY' },
  { id: 'cerebras', name: 'Cerebras', envKey: 'CEREBRAS_API_KEY' },
  { id: 'custom', name: 'Custom endpoint...', envKey: 'CUSTOM_OPENAI_API_KEY' },
  { id: 'deepseek', name: 'DeepSeek', envKey: 'DEEPSEEK_API_KEY' },
  { id: 'fireworks', name: 'Fireworks', envKey: 'FIREWORKS_API_KEY' },
  { id: 'google', name: 'Google', envKey: 'GEMINI_API_KEY' },
  { id: 'groq', name: 'Groq', envKey: 'GROQ_API_KEY' },
  { id: 'huggingface', name: 'Hugging Face', envKey: 'HF_TOKEN' },
  { id: 'kimi', name: 'Kimi For Coding', envKey: 'KIMI_API_KEY' },
  { id: 'ollama', name: 'Ollama (Local)', envKey: 'OLLAMA_BASE_URL' },
  { id: 'openai', name: 'OpenAI', envKey: 'OPENAI_API_KEY' },
  { id: 'openrouter', name: 'OpenRouter', envKey: 'OPENROUTER_API_KEY' },
  { id: 'together', name: 'Together AI', envKey: 'TOGETHER_API_KEY' },
  { id: 'mistral', name: 'Mistral AI', envKey: 'MISTRAL_API_KEY' },
  { id: 'cohere', name: 'Cohere', envKey: 'COHERE_API_KEY' },
  { id: 'voyage', name: 'Voyage AI', envKey: 'VOYAGE_API_KEY' },
  { id: 'perplexity', name: 'Perplexity', envKey: 'PERPLEXITY_API_KEY' },
  { id: 'xai', name: 'xAI (Grok)', envKey: 'XAI_API_KEY' },
];

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

  const [activeTab, setActiveTab] = useState<
    'Providers' | 'Agent' | 'Appearance' | 'Graph' | 'Keyboard' | 'General'
  >('Providers');

  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [addingProvider, setAddingProvider] = useState<{ id: string; name: string } | null>(null);
  const [inputKey, setInputKey] = useState('');
  const [updateCheckStatus, setUpdateCheckStatus] = useState<string | null>(null);

  useEffect(() => {
    setSettings({ ...DEFAULT_SETTINGS, ...initialSettings });
  }, [initialSettings, isOpen]);

  const updateSettings = (updates: Partial<AppSettings>) => {
    const next = { ...settings, ...updates };
    setSettings(next);
    onSave(next);
  };

  const filteredProviders = useMemo(() => {
    const q = providerSearch.toLowerCase().trim();
    if (!q) return AVAILABLE_PROVIDERS;
    return AVAILABLE_PROVIDERS.filter(
      (p) => p.name.toLowerCase().includes(q) || p.envKey.toLowerCase().includes(q)
    );
  }, [providerSearch]);

  if (!isOpen) return null;

  const handleAddProviderSubmit = () => {
    if (!addingProvider) return;
    const masked = inputKey.length > 8 ? `...${inputKey.slice(-4)} • ${inputKey.length}` : 'configured';
    const newProvider: ProviderConfig = {
      id: addingProvider.id,
      name: addingProvider.name,
      keyMasked: masked,
      apiKey: inputKey,
    };
    const updated = [...(settings.providers || []).filter((p) => p.id !== addingProvider.id), newProvider];

    updateSettings({
      providers: updated,
      apiKey: inputKey || settings.apiKey,
    });
    setAddingProvider(null);
    setInputKey('');
    setShowProviderDropdown(false);
  };

  const handleRemoveProvider = (id: string) => {
    const updated = (settings.providers || []).filter((p) => p.id !== id);
    updateSettings({ providers: updated });
  };

  const handleCheckUpdates = () => {
    setUpdateCheckStatus('checking');
    setTimeout(() => {
      setUpdateCheckStatus('up-to-date');
      setTimeout(() => setUpdateCheckStatus(null), 3000);
    }, 1200);
  };

  const navTabs: ('Providers' | 'Agent' | 'Appearance' | 'Graph' | 'Keyboard' | 'General')[] = [
    'Providers',
    'Agent',
    'Appearance',
    'Graph',
    'Keyboard',
    'General',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-4xl h-[620px] flex-col rounded-xl border border-[#262626] bg-[#141414] text-gray-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-[#222222] px-6">
          <h2 className="text-2xl font-serif text-[#f1f1f1] tracking-tight">Settings</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[#666666] hover:bg-[#222222] hover:text-[#cccccc] transition-colors"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Main 2-Column Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Navigation Sidebar */}
          <div className="w-44 border-r border-[#222222] p-3 space-y-1 bg-[#141414]">
            {navTabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`w-full text-left px-3 py-2 rounded-md text-xs font-mono transition-colors ${
                    isActive
                      ? 'bg-[#242424] text-white font-medium shadow-sm'
                      : 'text-[#888888] hover:text-[#cccccc] hover:bg-[#1a1a1a]'
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* Right Tab Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#141414]">
            {/* 1. PROVIDERS TAB */}
            {activeTab === 'Providers' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-[11px] font-mono tracking-widest text-[#737373] uppercase mb-4">
                    PROVIDERS
                  </h3>

                  <div className="text-[10px] font-mono tracking-widest text-[#555555] uppercase mb-2">
                    MODEL API KEYS
                  </div>

                  {/* Configured Keys */}
                  <div className="space-y-1 mb-2">
                    {settings.providers && settings.providers.length > 0 ? (
                      settings.providers.map((p) => (
                        <div
                          key={p.id}
                          className="group flex items-center justify-between py-1.5 px-2 rounded hover:bg-[#1a1a1a] transition-colors text-xs font-mono"
                        >
                          <span className="text-[#d4d4d4] font-mono">{p.name}</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-[#777777] font-mono">{p.keyMasked}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveProvider(p.id)}
                              className="hidden group-hover:block text-[10px] text-red-500 hover:text-red-400 font-mono"
                              title="Remover"
                            >
                              remover
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-[#555555] italic py-1 px-2 font-mono">
                        Nenhum provedor configurado.
                      </div>
                    )}
                  </div>

                  {/* Add Provider Button / Row */}
                  <div className="relative">
                    <div
                      onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                      className="flex items-center justify-between rounded p-2 text-xs font-mono text-[#888888] hover:text-[#cccccc] hover:bg-[#1c1c1c] cursor-pointer transition-colors border border-transparent hover:border-[#2a2a2a]"
                    >
                      <span>+ Add a provider</span>
                      <span className="text-[#555555] font-mono">35</span>
                    </div>

                    {/* Searchable Dropdown Popover */}
                    {showProviderDropdown && (
                      <div className="absolute left-0 top-10 z-50 w-80 rounded-xl border border-[#2a2a2a] bg-[#161616] p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-100">
                        <div className="relative mb-2">
                          <input
                            type="text"
                            placeholder="Search providers..."
                            value={providerSearch}
                            onChange={(e) => setProviderSearch(e.target.value)}
                            autoFocus
                            className="w-full rounded-lg border border-[#333333] bg-[#0f0f0f] px-3 py-1.5 text-xs font-mono text-[#e5e5e5] placeholder:text-[#555555] outline-none focus:border-[#666666]"
                          />
                        </div>

                        <div className="max-h-60 overflow-y-auto space-y-0.5 pr-1">
                          {filteredProviders.map((prov) => (
                            <div
                              key={prov.id}
                              onClick={() => {
                                setAddingProvider(prov);
                                setInputKey('');
                              }}
                              className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs font-mono hover:bg-[#242424] transition-colors"
                            >
                              <span className="text-[#d4d4d4]">{prov.name}</span>
                              <span className="text-[10px] text-[#666666]">{prov.envKey}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Mini modal to enter key when provider clicked */}
                    {addingProvider && (
                      <div className="mt-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3 space-y-2">
                        <div className="text-xs font-mono text-[#d4d4d4]">
                          Insira a chave para <strong>{addingProvider.name}</strong>:
                        </div>
                        <input
                          type="password"
                          value={inputKey}
                          onChange={(e) => setInputKey(e.target.value)}
                          placeholder="sk-... ou endpoint URL"
                          className="w-full rounded border border-[#333333] bg-[#111111] px-2.5 py-1.5 text-xs font-mono text-white outline-none focus:border-[#555555]"
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && handleAddProviderSubmit()}
                        />
                        <div className="flex justify-end space-x-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setAddingProvider(null)}
                            className="px-2.5 py-1 text-xs font-mono text-[#888888] hover:text-white"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleAddProviderSubmit}
                            className="rounded bg-[#2a2a2a] hover:bg-[#383838] px-3 py-1 text-xs font-mono text-white transition-colors"
                          >
                            Salvar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <hr className="border-[#222222]" />

                {/* Subscriptions */}
                <div>
                  <div className="text-[10px] font-mono tracking-widest text-[#555555] uppercase mb-3">
                    SUBSCRIPTIONS
                  </div>
                  <div className="space-y-2">
                    {[
                      { key: 'chatgptConnected', label: 'ChatGPT' },
                      { key: 'copilotConnected', label: 'GitHub Copilot' },
                      { key: 'grokConnected', label: 'Grok' },
                    ].map((sub) => {
                      const isConn = (settings as any)[sub.key];
                      return (
                        <div key={sub.key} className="flex items-center justify-between text-xs font-mono">
                          <span className="text-[#d4d4d4]">{sub.label}</span>
                          <button
                            type="button"
                            onClick={() => updateSettings({ [sub.key]: !isConn } as any)}
                            className={`rounded-md border px-2.5 py-1 text-xs font-mono transition-colors ${
                              isConn
                                ? 'border-emerald-600/60 bg-emerald-950/40 text-emerald-400'
                                : 'border-[#333333] bg-[#1c1c1c] text-[#cccccc] hover:border-[#555555] hover:text-white'
                            }`}
                          >
                            {isConn ? 'Connected' : 'Connect'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <hr className="border-[#222222]" />

                {/* External CLI */}
                <div>
                  <div className="text-[10px] font-mono tracking-widest text-[#555555] uppercase mb-3">
                    EXTERNAL CLI
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#d4d4d4]">Claude Code</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.claudeCode}
                      onClick={() => updateSettings({ claudeCode: !settings.claudeCode })}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                        settings.claudeCode ? 'bg-[#d4d4d4]' : 'bg-[#2a2a2a]'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow ring-0 transition duration-200 ease-in-out mt-0.5 ${
                          settings.claudeCode ? 'translate-x-4 bg-[#141414]' : 'translate-x-0.5 bg-[#888888]'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <hr className="border-[#222222]" />

                {/* Dictation */}
                <div>
                  <div className="text-[10px] font-mono tracking-widest text-[#555555] uppercase mb-3">
                    DICTATION
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono mb-4">
                    <span className="text-[#d4d4d4]">Deepgram</span>
                    <span className="text-[#777777] font-mono">{settings.deepgramKey}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono pt-1">
                    <span className="text-[#d4d4d4]">Language</span>
                    <select
                      value={settings.language}
                      onChange={(e) => updateSettings({ language: e.target.value })}
                      className="rounded border border-[#333333] bg-[#1c1c1c] px-3 py-1 text-xs font-mono text-[#d4d4d4] outline-none hover:border-[#555555]"
                    >
                      <option value="Portuguese (pt-BR)">Portuguese (pt-BR)</option>
                      <option value="English (US)">English (US)</option>
                      <option value="Spanish (ES)">Spanish (ES)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 2. AGENT TAB */}
            {activeTab === 'Agent' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-[11px] font-mono tracking-widest text-[#737373] uppercase mb-4">
                    AGENT
                  </h3>

                  <div className="text-[10px] font-mono tracking-widest text-[#555555] uppercase mb-3">
                    MODELS
                  </div>

                  {/* Strong Model */}
                  <div className="flex items-start justify-between py-2 border-b border-[#1c1c1c]">
                    <div>
                      <div className="text-xs font-mono text-[#d4d4d4] font-medium">Strong</div>
                      <div className="text-[11px] font-mono text-[#666666]">
                        The main model for your sessions
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <select
                        value={settings.strongModel}
                        onChange={(e) =>
                          updateSettings({
                            strongModel: e.target.value,
                            model: e.target.value,
                          })
                        }
                        className="rounded border border-[#2e2e2e] bg-[#181818] px-2.5 py-1 text-xs font-mono text-[#d4d4d4] outline-none hover:border-[#444444]"
                      >
                        <option value="free">free</option>
                        <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                        <option value="gpt-4o-mini">gpt-4o-mini</option>
                        <option value="deepseek-r1">deepseek-r1</option>
                        <option value="llama3.3:70b">llama3.3:70b</option>
                      </select>

                      <select
                        value={settings.strongThinking}
                        onChange={(e) =>
                          updateSettings({
                            strongThinking: e.target.value as any,
                            thinkingLevel: (e.target.value.charAt(0).toUpperCase() +
                              e.target.value.slice(1)) as any,
                          })
                        }
                        className="rounded border border-[#2e2e2e] bg-[#181818] px-2.5 py-1 text-xs font-mono text-[#d4d4d4] outline-none hover:border-[#444444]"
                      >
                        <option value="high">high</option>
                        <option value="medium">medium</option>
                        <option value="low">low</option>
                        <option value="off">off</option>
                      </select>
                    </div>
                  </div>

                  {/* Cheap Model */}
                  <div className="flex items-start justify-between py-2 border-b border-[#1c1c1c]">
                    <div>
                      <div className="text-xs font-mono text-[#d4d4d4] font-medium">Cheap</div>
                      <div className="text-[11px] font-mono text-[#666666]">
                        The assistants that research, build demos, and grade your work
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <select
                        value={settings.cheapModel}
                        onChange={(e) => updateSettings({ cheapModel: e.target.value })}
                        className="rounded border border-[#2e2e2e] bg-[#181818] px-2.5 py-1 text-xs font-mono text-[#d4d4d4] outline-none hover:border-[#444444]"
                      >
                        <option value="gemini-3.8-flash:batch">gemini-3.8-flash:batch</option>
                        <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                        <option value="gpt-4o-mini">gpt-4o-mini</option>
                      </select>

                      <select
                        value={settings.cheapThinking}
                        onChange={(e) => updateSettings({ cheapThinking: e.target.value as any })}
                        className="rounded border border-[#2e2e2e] bg-[#181818] px-2.5 py-1 text-xs font-mono text-[#d4d4d4] outline-none hover:border-[#444444]"
                      >
                        <option value="high">high</option>
                        <option value="medium">medium</option>
                        <option value="low">low</option>
                        <option value="off">off</option>
                      </select>
                    </div>
                  </div>

                  {/* Vision Model */}
                  <div className="flex items-start justify-between py-2">
                    <div>
                      <div className="text-xs font-mono text-[#d4d4d4] font-medium">Vision</div>
                      <div className="text-[11px] font-mono text-[#666666]">
                        The assistants that draw and read PDFs
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <select
                        value={settings.visionModel}
                        onChange={(e) => updateSettings({ visionModel: e.target.value })}
                        className="rounded border border-[#2e2e2e] bg-[#181818] px-2.5 py-1 text-xs font-mono text-[#d4d4d4] outline-none hover:border-[#444444]"
                      >
                        <option value="gemini-3.8-flash:batch">gemini-3.8-flash:batch</option>
                        <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                        <option value="gpt-4o-mini">gpt-4o-mini</option>
                      </select>

                      <select
                        value={settings.visionThinking}
                        onChange={(e) => updateSettings({ visionThinking: e.target.value as any })}
                        className="rounded border border-[#2e2e2e] bg-[#181818] px-2.5 py-1 text-xs font-mono text-[#d4d4d4] outline-none hover:border-[#444444]"
                      >
                        <option value="high">high</option>
                        <option value="medium">medium</option>
                        <option value="low">low</option>
                        <option value="off">off</option>
                      </select>
                    </div>
                  </div>
                </div>

                <hr className="border-[#222222]" />

                {/* Tools */}
                <div>
                  <div className="text-[10px] font-mono tracking-widest text-[#555555] uppercase mb-3">
                    TOOLS
                  </div>

                  <div className="space-y-3">
                    {/* Graph Tools */}
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs font-mono text-[#d4d4d4]">Graph tools</div>
                        <div className="text-[11px] font-mono text-[#666666]">
                          Lets the tutor consult your knowledge map between sessions
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.graphTools}
                        onClick={() => updateSettings({ graphTools: !settings.graphTools })}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                          settings.graphTools ? 'bg-[#d4d4d4]' : 'bg-[#2a2a2a]'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow ring-0 transition duration-200 ease-in-out mt-0.5 ${
                            settings.graphTools ? 'translate-x-4 bg-[#141414]' : 'translate-x-0.5 bg-[#888888]'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Quizzing Segmented Control */}
                    <div className="flex items-start justify-between py-1">
                      <div>
                        <div className="text-xs font-mono text-[#d4d4d4]">Quizzing</div>
                        <div className="text-[11px] font-mono text-[#666666]">
                          How both tutors check your understanding
                        </div>
                      </div>
                      <div className="flex rounded-md border border-[#2a2a2a] bg-[#101010] p-0.5">
                        <button
                          type="button"
                          onClick={() => updateSettings({ quizzing: 'multiple_choice' })}
                          className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                            settings.quizzing === 'multiple_choice'
                              ? 'bg-[#242424] text-white font-medium'
                              : 'text-[#666666] hover:text-[#cccccc]'
                          }`}
                        >
                          Multiple choice
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSettings({ quizzing: 'free_recall' })}
                          className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                            settings.quizzing === 'free_recall'
                              ? 'bg-[#242424] text-white font-medium'
                              : 'text-[#666666] hover:text-[#cccccc]'
                          }`}
                        >
                          Free recall
                        </button>
                      </div>
                    </div>

                    {/* Other Tools */}
                    {[
                      { key: 'toolResearch', label: 'Tool · research' },
                      { key: 'toolDemo', label: 'Tool · demo' },
                      { key: 'toolVisual', label: 'Tool · visual' },
                      { key: 'toolPdf', label: 'Tool · pdf' },
                    ].map((t) => {
                      const isChecked = (settings as any)[t.key];
                      return (
                        <div key={t.key} className="flex items-center justify-between text-xs font-mono">
                          <span className="text-[#d4d4d4]">{t.label}</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isChecked}
                            onClick={() => updateSettings({ [t.key]: !isChecked } as any)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                              isChecked ? 'bg-[#d4d4d4]' : 'bg-[#2a2a2a]'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow ring-0 transition duration-200 ease-in-out mt-0.5 ${
                                isChecked ? 'translate-x-4 bg-[#141414]' : 'translate-x-0.5 bg-[#888888]'
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 3. APPEARANCE TAB */}
            {activeTab === 'Appearance' && (
              <div className="space-y-4">
                <h3 className="text-[11px] font-mono tracking-widest text-[#737373] uppercase mb-4">
                  APPEARANCE
                </h3>

                {/* Mode */}
                <div className="flex items-center justify-between py-1 border-b border-[#1c1c1c]">
                  <div>
                    <div className="text-xs font-mono text-[#d4d4d4]">Mode</div>
                    <div className="text-[11px] font-mono text-[#666666]">Coming soon</div>
                  </div>
                  <select
                    value={settings.mode}
                    onChange={(e) => updateSettings({ mode: e.target.value })}
                    className="rounded border border-[#2e2e2e] bg-[#181818] px-3 py-1 text-xs font-mono text-[#d4d4d4] outline-none hover:border-[#444444]"
                  >
                    <option value="Dark">Dark</option>
                    <option value="Light">Light</option>
                  </select>
                </div>

                {/* Background */}
                <div className="flex items-center justify-between py-1 border-b border-[#1c1c1c]">
                  <div>
                    <div className="text-xs font-mono text-[#d4d4d4]">Background</div>
                    <div className="text-[11px] font-mono text-[#666666]">Empty = #141414</div>
                  </div>
                  <input
                    type="text"
                    value={settings.background}
                    onChange={(e) => updateSettings({ background: e.target.value })}
                    className="w-44 rounded border border-[#2e2e2e] bg-[#181818] px-3 py-1 text-xs font-mono text-[#d4d4d4] outline-none focus:border-[#555555]"
                  />
                </div>

                {/* Reading font */}
                <div className="flex items-center justify-between py-1 border-b border-[#1c1c1c]">
                  <div>
                    <div className="text-xs font-mono text-[#d4d4d4]">Reading font</div>
                    <div className="text-[11px] font-mono text-[#666666]">Empty = Source Sans 3</div>
                  </div>
                  <select
                    value={settings.readingFont}
                    onChange={(e) => updateSettings({ readingFont: e.target.value })}
                    className="rounded border border-[#2e2e2e] bg-[#181818] px-3 py-1 text-xs font-mono text-[#d4d4d4] outline-none hover:border-[#444444]"
                  >
                    <option value="Source Sans 3">Source Sans 3</option>
                    <option value="Inter">Inter</option>
                    <option value="JetBrains Mono">JetBrains Mono</option>
                  </select>
                </div>

                {/* Reading font size */}
                <div className="flex items-center justify-between py-1 border-b border-[#1c1c1c]">
                  <div>
                    <div className="text-xs font-mono text-[#d4d4d4]">Reading font size</div>
                    <div className="text-[11px] font-mono text-[#666666]">16px</div>
                  </div>
                  <input
                    type="number"
                    value={settings.readingFontSize}
                    onChange={(e) => updateSettings({ readingFontSize: Number(e.target.value) })}
                    className="w-44 rounded border border-[#2e2e2e] bg-[#181818] px-3 py-1 text-xs font-mono text-[#d4d4d4] outline-none focus:border-[#555555]"
                  />
                </div>

                {/* Session names in serif */}
                <div className="flex items-center justify-between py-1 border-b border-[#1c1c1c]">
                  <div>
                    <div className="text-xs font-mono text-[#d4d4d4]">Session names in serif</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.sessionNamesSerif}
                    onClick={() => updateSettings({ sessionNamesSerif: !settings.sessionNamesSerif })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                      settings.sessionNamesSerif ? 'bg-[#d4d4d4]' : 'bg-[#2a2a2a]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow ring-0 transition duration-200 ease-in-out mt-0.5 ${
                        settings.sessionNamesSerif ? 'translate-x-4 bg-[#141414]' : 'translate-x-0.5 bg-[#888888]'
                      }`}
                    />
                  </button>
                </div>

                {/* Heading weight */}
                <div className="flex items-center justify-between py-1 border-b border-[#1c1c1c]">
                  <div>
                    <div className="text-xs font-mono text-[#d4d4d4]">Heading weight</div>
                    <div className="text-[11px] font-mono text-[#666666]">900</div>
                  </div>
                  <input
                    type="text"
                    value={settings.headingWeight}
                    onChange={(e) => updateSettings({ headingWeight: Number(e.target.value) })}
                    className="w-44 rounded border border-[#2e2e2e] bg-[#181818] px-3 py-1 text-xs font-mono text-[#d4d4d4] outline-none focus:border-[#555555]"
                  />
                </div>

                {/* Bold color */}
                <div className="flex items-center justify-between py-1 border-b border-[#1c1c1c]">
                  <div>
                    <div className="text-xs font-mono text-[#d4d4d4]">Bold color</div>
                    <div className="text-[11px] font-mono text-[#666666]">Empty = same as text</div>
                  </div>
                  <input
                    type="text"
                    value={settings.boldColor}
                    onChange={(e) => updateSettings({ boldColor: e.target.value })}
                    className="w-44 rounded border border-[#2e2e2e] bg-[#181818] px-3 py-1 text-xs font-mono text-[#d4d4d4] outline-none focus:border-[#555555]"
                  />
                </div>

                {/* Italic color */}
                <div className="flex items-center justify-between py-1">
                  <div>
                    <div className="text-xs font-mono text-[#d4d4d4]">Italic color</div>
                    <div className="text-[11px] font-mono text-[#666666]">Empty = same as text</div>
                  </div>
                  <input
                    type="text"
                    value={settings.italicColor}
                    onChange={(e) => updateSettings({ italicColor: e.target.value })}
                    className="w-44 rounded border border-[#2e2e2e] bg-[#181818] px-3 py-1 text-xs font-mono text-[#d4d4d4] outline-none focus:border-[#555555]"
                  />
                </div>
              </div>
            )}

            {/* 4. GRAPH TAB */}
            {activeTab === 'Graph' && (
              <div className="space-y-4">
                <h3 className="text-[11px] font-mono tracking-widest text-[#737373] uppercase mb-4">
                  GRAPH
                </h3>

                <div className="flex items-center justify-between py-1 border-b border-[#1c1c1c]">
                  <div>
                    <div className="text-xs font-mono text-[#d4d4d4]">Edge style</div>
                    <div className="text-[11px] font-mono text-[#666666]">
                      Curved Bézier or orthogonal straight paths
                    </div>
                  </div>
                  <select
                    value={settings.edgeStyle}
                    onChange={(e) => updateSettings({ edgeStyle: e.target.value as any })}
                    className="rounded border border-[#2e2e2e] bg-[#181818] px-3 py-1 text-xs font-mono text-[#d4d4d4] outline-none hover:border-[#444444]"
                  >
                    <option value="curved">Curved Bézier</option>
                    <option value="straight">Straight</option>
                  </select>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-[#1c1c1c]">
                  <div>
                    <div className="text-xs font-mono text-[#d4d4d4]">Arrowhead markers</div>
                    <div className="text-[11px] font-mono text-[#666666]">
                      Show direction from prerequisite to dependent nodes
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.showArrowheads}
                    onClick={() => updateSettings({ showArrowheads: !settings.showArrowheads })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                      settings.showArrowheads ? 'bg-[#d4d4d4]' : 'bg-[#2a2a2a]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow ring-0 transition duration-200 ease-in-out mt-0.5 ${
                        settings.showArrowheads ? 'translate-x-4 bg-[#141414]' : 'translate-x-0.5 bg-[#888888]'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between py-1">
                  <div>
                    <div className="text-xs font-mono text-[#d4d4d4]">Auto-focus active node</div>
                    <div className="text-[11px] font-mono text-[#666666]">
                      Center DAG canvas on current evaluation concept
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.autoFocusFrontier}
                    onClick={() => updateSettings({ autoFocusFrontier: !settings.autoFocusFrontier })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                      settings.autoFocusFrontier ? 'bg-[#d4d4d4]' : 'bg-[#2a2a2a]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow ring-0 transition duration-200 ease-in-out mt-0.5 ${
                        settings.autoFocusFrontier ? 'translate-x-4 bg-[#141414]' : 'translate-x-0.5 bg-[#888888]'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}

            {/* 5. KEYBOARD TAB */}
            {activeTab === 'Keyboard' && (
              <div className="space-y-4">
                <h3 className="text-[11px] font-mono tracking-widest text-[#737373] uppercase mb-4">
                  KEYBOARD SHORTCUTS
                </h3>

                {[
                  { label: 'Toggle Voice Dictation', key: 'Ctrl + D' },
                  { label: 'Submit Answer', key: 'Enter' },
                  { label: 'Linebreak in Reasoning Field', key: 'Shift + Enter' },
                  { label: 'Switch between Chat and DAG', key: 'Ctrl + G' },
                  { label: 'Open Settings Modal', key: 'Ctrl + ,' },
                ].map((sc) => (
                  <div key={sc.label} className="flex items-center justify-between py-1.5 border-b border-[#1c1c1c] text-xs font-mono">
                    <span className="text-[#d4d4d4]">{sc.label}</span>
                    <kbd className="rounded border border-[#2e2e2e] bg-[#1c1c1c] px-2.5 py-1 text-[11px] font-mono text-[#e5e5e5] shadow-sm">
                      {sc.key}
                    </kbd>
                  </div>
                ))}
              </div>
            )}

            {/* 6. GENERAL TAB */}
            {activeTab === 'General' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-[11px] font-mono tracking-widest text-[#737373] uppercase mb-4">
                    GENERAL
                  </h3>

                  <div className="flex items-start justify-between py-2 border-b border-[#1c1c1c]">
                    <div className="space-y-1">
                      <div className="text-xs font-mono text-[#d4d4d4] font-medium">
                        Version {settings.appVersion}
                      </div>
                      <div className="text-[11px] font-mono text-[#666666] leading-relaxed max-w-sm">
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
                            <span className="text-[#888888] underline cursor-pointer hover:text-white">
                              Release notes
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleCheckUpdates}
                      className="rounded-md border border-[#333333] bg-[#1c1c1c] px-3 py-1.5 text-xs font-mono text-[#cccccc] hover:border-[#555555] hover:text-white transition-colors"
                    >
                      Check for updates
                    </button>
                  </div>

                  <div className="flex items-start justify-between py-3">
                    <div className="space-y-1 max-w-sm">
                      <div className="text-xs font-mono text-[#d4d4d4] font-medium">
                        Automatic updates
                      </div>
                      <div className="text-[11px] font-mono text-[#666666] leading-relaxed">
                        Check at startup and every 24 hours. Turning this off does not stop updates already in progress or ready to install.
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.autoUpdates}
                      onClick={() => updateSettings({ autoUpdates: !settings.autoUpdates })}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                        settings.autoUpdates ? 'bg-[#d4d4d4]' : 'bg-[#2a2a2a]'
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
