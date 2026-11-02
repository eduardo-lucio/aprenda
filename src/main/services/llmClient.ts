export interface LLMConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  effortLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
  timeoutMs: number;
}

export const defaultLLMConfig: LLMConfig = {
  baseURL: process.env.OPENAI_BASE_URL || '',
  apiKey: process.env.OPENAI_API_KEY || '',
  model: process.env.OPENAI_MODEL || '',
  effortLevel: 'low',
  timeoutMs: 45000,
};

export function updateDefaultLLMConfig(newConfig: Partial<LLMConfig>): void {
  Object.assign(defaultLLMConfig, newConfig);
}

export function isLLMConfigured(): boolean {
  return Boolean(defaultLLMConfig.baseURL && defaultLLMConfig.model);
}

/**
 * Maps a provider id (as configured in Settings) to its OpenAI-compatible
 * chat completions base URL.
 */
export function resolveChatBaseUrl(providerId: string | undefined, baseUrl?: string): string {
  switch (providerId) {
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'google':
      return 'https://generativelanguage.googleapis.com/v1beta/openai';
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'deepseek':
      return 'https://api.deepseek.com/v1';
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    case 'groq':
      return 'https://api.groq.com/openai/v1';
    case 'cerebras':
      return 'https://api.cerebras.ai/v1';
    case 'together':
      return 'https://api.together.xyz/v1';
    case 'mistral':
      return 'https://api.mistral.ai/v1';
    case 'ollama': {
      const root = (baseUrl || 'http://localhost:11434').replace(/\/+$/, '').replace(/\/v1$/, '');
      return `${root}/v1`;
    }
    default:
      return (baseUrl || '').replace(/\/+$/, '');
  }
}

/** Removes reasoning blocks (<think>…</think>) and markdown fences from a model answer. */
export function cleanLLMText(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim();
}

/** Extracts and parses the first JSON object (or array) in a model answer. */
export function parseLLMJson<T = any>(raw: string): T {
  const text = cleanLLMText(raw);
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  let start = firstObj;
  let endChar = '}';
  if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
    start = firstArr;
    endChar = ']';
  }
  const end = text.lastIndexOf(endChar);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('A resposta do modelo não contém JSON válido.');
  }
  return JSON.parse(text.slice(start, end + 1)) as T;
}

export interface CallLLMOptions {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
  effortLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
  timeoutMs?: number;
  signal?: AbortSignal;
  config?: Partial<LLMConfig>;
}

export type LLMCaller = (options: CallLLMOptions) => Promise<string>;

async function doRequest(config: LLMConfig, options: CallLLMOptions, useJsonMode: boolean): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? config.timeoutMs);

  let onExternalAbort: (() => void) | undefined;
  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId);
      throw new Error('Operação cancelada pelo orquestrador.');
    }
    onExternalAbort = () => controller.abort();
    options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: options.prompt });

  const isReasoningModel = /\b(o1|o3|o4)\b/i.test(config.model);
  const isOpenRouter = config.baseURL.includes('openrouter.ai');

  const bodyPayload: any = {
    model: config.model,
    messages,
    ...(isReasoningModel ? {} : { temperature: options.temperature ?? 0.2 }),
    ...(useJsonMode ? { response_format: { type: 'json_object' } } : {}),
  };

  if (options.maxTokens) {
    if (isReasoningModel) {
      bodyPayload.max_completion_tokens = options.maxTokens;
    } else {
      bodyPayload.max_tokens = options.maxTokens;
    }
  }

  // Only pass reasoning parameters if explicitly supported by model/provider
  // OpenAI o1/o3/o4 accepts reasoning_effort. OpenRouter accepts reasoning object.
  // Standard models on OpenAI (gpt-4o), Groq, Gemini, DeepSeek reject these with HTTP 400.
  const effort = options.effortLevel ?? config.effortLevel;
  if (effort && effort !== 'off') {
    const mapped = effort === 'minimal' ? 'low' : effort;
    if (isReasoningModel) {
      bodyPayload.reasoning_effort = mapped;
    } else if (isOpenRouter) {
      bodyPayload.reasoning = { effort: mapped };
    }
  }

  try {
    return await fetch(`${config.baseURL.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey || 'none'}`,
        'HTTP-Referer': 'https://aprenda.app',
        'X-Title': 'APRENDA',
      },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (options.signal?.aborted) {
      throw new Error('Operação cancelada pelo orquestrador.');
    }
    if (err?.name === 'AbortError') {
      throw new Error('Tempo limite excedido aguardando resposta do modelo.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (options.signal && onExternalAbort) {
      options.signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export const callLLM: LLMCaller = async (options) => {
  const config = { ...defaultLLMConfig, ...options.config };

  if (!config.baseURL || !config.model) {
    throw new Error(
      'Nenhum provedor/modelo de IA configurado. Abra Configurações → Providers, valide sua chave e escolha um modelo em Agent.'
    );
  }

  let res = await doRequest(config, options, Boolean(options.jsonMode));

  // If provider rejects specialized payload (400/422), retry once with clean baseline payload
  if (!res.ok && (res.status === 400 || res.status === 422)) {
    res = await doRequest(config, { ...options, effortLevel: 'off' }, false);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const body: any = await res.json();
      detail = body?.error?.message || body?.message || '';
    } catch {}
    throw new Error(`Erro do provedor de IA (HTTP ${res.status})${detail ? `: ${detail}` : ''}`);
  }

  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('O modelo retornou uma resposta vazia.');
  }
  return content;
};
