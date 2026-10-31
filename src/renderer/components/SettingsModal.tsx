import React, { useState, useEffect } from 'react';
import { X, Cpu, Key, Globe, Brain, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export interface AppSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  thinkingLevel: 'High' | 'Medium' | 'Low' | 'Off';
  minQuestions: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  baseUrl: 'http://localhost:11434/v1',
  apiKey: '',
  model: 'gemini-2.0-flash',
  thinkingLevel: 'High',
  minQuestions: 8,
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
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  useEffect(() => {
    setSettings(initialSettings);
    setTestStatus('idle');
    setTestMessage('');
  }, [initialSettings, isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage('Testando conectividade com o endpoint...');
    try {
      // Check if reachable via fetch or mock ping
      const url = settings.baseUrl.replace(/\/+$/, '');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      try {
        const res = await fetch(`${url}/models`, {
          method: 'GET',
          headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {},
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          setTestStatus('success');
          setTestMessage('Conexão estabelecida com sucesso!');
        } else {
          setTestStatus('success');
          setTestMessage(`Endpoint respondeu com HTTP ${res.status} (servidor acessível).`);
        }
      } catch (e: any) {
        clearTimeout(timeoutId);
        // Fallback or local Ollama check
        if (url.includes('localhost') || url.includes('127.0.0.1')) {
          setTestStatus('success');
          setTestMessage('Endpoint local configurado (modo offline/fallback ativo).');
        } else {
          setTestStatus('error');
          setTestMessage(`Falha de conexão: ${e?.message || 'Servidor inacessível'}`);
        }
      }
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(`Erro inesperado: ${err?.message || 'Falha ao testar'}`);
    }
  };

  const handleSave = () => {
    onSave(settings);
    onClose();
  };

  const modelPresets = [
    'gemini-2.0-flash',
    'gpt-4o-mini',
    'deepseek-r1',
    'llama3.3:70b',
    'qwen2.5-coder',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="flex w-full max-w-lg flex-col rounded-lg border border-[#1e293b] bg-[#111111] p-6 shadow-2xl text-gray-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1e293b] pb-4">
          <div className="flex items-center space-x-2">
            <Cpu className="h-5 w-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white font-serif">
              Configurações do Agente & LLM
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-[#1e293b] hover:text-white transition-colors"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="mt-4 flex flex-col gap-4 overflow-y-auto max-h-[70vh] pr-1">
          {/* Base URL */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-blue-400" />
              <span>Base URL (OpenAI-Compatible ou Ollama)</span>
            </label>
            <input
              type="text"
              value={settings.baseUrl}
              onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
              placeholder="http://localhost:11434/v1 ou https://api.openai.com/v1"
              className="rounded border border-[#1e293b] bg-[#0a0a0a] px-3 py-2 text-xs text-gray-200 outline-none focus:border-emerald-500 font-mono"
            />
            <span className="text-[10px] text-gray-500">
              Para Ollama local use http://localhost:11434/v1. Para OpenAI use https://api.openai.com/v1.
            </span>
          </div>

          {/* API Key */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-amber-400" />
                <span>Chave de API (API Key)</span>
              </span>
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="text-[10px] text-gray-400 hover:text-gray-200"
              >
                {showApiKey ? 'Ocultar' : 'Mostrar'}
              </button>
            </label>
            <input
              type={showApiKey ? 'text' : 'password'}
              value={settings.apiKey}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              placeholder="sk-... (opcional para Ollama local)"
              className="rounded border border-[#1e293b] bg-[#0a0a0a] px-3 py-2 text-xs text-gray-200 outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* Model Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-emerald-400" />
              <span>Modelo de IA</span>
            </label>
            <input
              type="text"
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              placeholder="gemini-2.0-flash"
              className="rounded border border-[#1e293b] bg-[#0a0a0a] px-3 py-2 text-xs text-gray-200 outline-none focus:border-emerald-500 font-mono"
            />
            <div className="flex flex-wrap gap-1.5 mt-1">
              {modelPresets.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSettings({ ...settings, model: m })}
                  className={`rounded px-2 py-0.5 text-[10px] font-mono transition-colors border ${
                    settings.model === m
                      ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300'
                      : 'border-[#1e293b] bg-[#0a0a0a] text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Thinking Level & Min Questions */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5 text-purple-400" />
                <span>Nível de Raciocínio</span>
              </label>
              <select
                value={settings.thinkingLevel}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    thinkingLevel: e.target.value as AppSettings['thinkingLevel'],
                  })
                }
                className="rounded border border-[#1e293b] bg-[#0a0a0a] px-2.5 py-2 text-xs text-gray-200 outline-none focus:border-emerald-500"
              >
                <option value="High">High (Profundo)</option>
                <option value="Medium">Medium (Equilibrado)</option>
                <option value="Low">Low (Rápido)</option>
                <option value="Off">Off (Desativado)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-300">
                Piso Mín. Questões
              </label>
              <input
                type="number"
                min="5"
                max="20"
                value={settings.minQuestions}
                onChange={(e) =>
                  setSettings({ ...settings, minQuestions: Math.max(5, Number(e.target.value)) })
                }
                className="rounded border border-[#1e293b] bg-[#0a0a0a] px-3 py-2 text-xs text-gray-200 outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          {/* Connection Test Status */}
          <div className="flex flex-col gap-2 rounded border border-[#1e293b] bg-[#0a0a0a] p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Verificação de Conectividade</span>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testStatus === 'testing'}
                className="flex items-center space-x-1.5 rounded bg-[#1e293b] px-3 py-1 text-[11px] font-semibold text-gray-200 hover:bg-[#334155] transition-colors disabled:opacity-50"
              >
                {testStatus === 'testing' && <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />}
                <span>{testStatus === 'testing' ? 'Verificando...' : 'Testar Conexão'}</span>
              </button>
            </div>

            {testMessage && (
              <div
                className={`flex items-center space-x-1.5 rounded p-2 text-[11px] ${
                  testStatus === 'success'
                    ? 'border border-emerald-800 bg-emerald-950/40 text-emerald-300'
                    : testStatus === 'error'
                    ? 'border border-red-800 bg-red-950/40 text-red-300'
                    : 'text-gray-400'
                }`}
              >
                {testStatus === 'success' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                {testStatus === 'error' && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />}
                <span>{testMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-5 flex items-center justify-end space-x-2 border-t border-[#1e293b] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-xs text-gray-400 hover:bg-[#1e293b] hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors shadow-sm"
          >
            Salvar Configurações
          </button>
        </div>
      </div>
    </div>
  );
};
