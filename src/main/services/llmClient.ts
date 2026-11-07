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

export type ResponseLanguage = 'pt' | 'en';
let responseLanguage: ResponseLanguage = 'pt';

/** Language the student uses the app in: every text the AI writes for them follows it. */
export function setResponseLanguage(lang: ResponseLanguage): void {
  responseLanguage = lang === 'en' ? 'en' : 'pt';
}

export function getResponseLanguage(): ResponseLanguage {
  return responseLanguage;
}

/** Picks the Portuguese or English version of a user-facing text produced by the main process. */
export function localize(ptText: string, enText: string): string {
  return responseLanguage === 'en' ? enText : ptText;
}

const ENGLISH_OUTPUT_RULE = `

---

OUTPUT LANGUAGE: the student uses the app in English. Write EVERY text meant for the student (questions, options, explanations, plans, diagnoses and "agentThinking") in natural English, even though these instructions are in Portuguese. Keep JSON keys and ids exactly as specified.`;

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

/** Extracts native reasoning (<think>...</think>) from a model response if present. */
export function extractLLMThinking(raw: string): string | undefined {
  const matches = Array.from(raw.matchAll(/<think>([\s\S]*?)<\/think>/gi));
  if (matches.length > 0) {
    const combined = matches
      .map((m) => (m[1] || '').trim())
      .filter(Boolean)
      .join('\n\n')
      .trim();
    if (combined) return combined;
  }
  return undefined;
}

/** Removes reasoning blocks (<think>…</think>) and outer markdown JSON fences from a model answer. */
export function cleanLLMText(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
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

export type ThinkingStreamListener = (payload: { text: string; done?: boolean }) => void;

let globalThinkingListener: ThinkingStreamListener | undefined;

export function setGlobalThinkingStreamListener(listener?: ThinkingStreamListener): void {
  globalThinkingListener = listener;
}

export function emitThinkingStream(text: string, done = false): void {
  if (globalThinkingListener) {
    try {
      globalThinkingListener({ text, done });
    } catch {}
  }
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model?: string;
}

export type TokenUsageListener = (usage: TokenUsage) => void;
let globalTokenListeners: TokenUsageListener[] = [];

export function addGlobalTokenListener(listener: TokenUsageListener): () => void {
  globalTokenListeners.push(listener);
  return () => {
    globalTokenListeners = globalTokenListeners.filter((l) => l !== listener);
  };
}

export function emitTokenUsage(usage: TokenUsage): void {
  for (const listener of globalTokenListeners) {
    try {
      listener(usage);
    } catch {}
  }
}

/** Extracts partial or complete thinking from an accumulating LLM stream buffer. */
export function extractPartialThinkingFromBuffer(raw: string): string | undefined {
  // 1. Check for <think>...</think> (even if unclosed while streaming)
  const thinkOpenIdx = raw.search(/<think>/i);
  if (thinkOpenIdx !== -1) {
    const afterOpen = raw.slice(thinkOpenIdx + 7);
    const thinkCloseIdx = afterOpen.search(/<\/think>/i);
    const inner = thinkCloseIdx !== -1 ? afterOpen.slice(0, thinkCloseIdx) : afterOpen;
    if (inner.trim()) return inner.trim();
  }

  // 2. Check for "agentThinking": "..." inside JSON buffer while streaming
  const jsonMatch = raw.match(/"agentThinking"\s*:\s*"((?:\\.|[^"\\])*)/);
  if (jsonMatch && jsonMatch[1]) {
    try {
      // Unescape partial JSON string escapes safely
      const unescaped = jsonMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      if (unescaped.trim()) return unescaped.trim();
    } catch {
      return jsonMatch[1];
    }
  }

  return undefined;
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
  isBackground?: boolean;
  config?: Partial<LLMConfig>;
}

export type LLMCaller = (options: CallLLMOptions) => Promise<string>;

async function doRequest(
  config: LLMConfig,
  options: CallLLMOptions,
  useJsonMode: boolean,
  useStream = false
): Promise<Response> {
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
    ...(useStream ? { stream: true, stream_options: { include_usage: true } } : {}),
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
  if (effort) {
    if (effort === 'off') {
      if (isOpenRouter) {
        bodyPayload.reasoning = { effort: 'none' };
      }
    } else {
      const mapped = effort === 'minimal' ? 'low' : effort;
      if (isReasoningModel) {
        bodyPayload.reasoning_effort = mapped;
      } else if (isOpenRouter) {
        bodyPayload.reasoning = { effort: mapped };
      }
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

async function readResponseOrStream(
  res: Response,
  shouldEmitLiveThinking: boolean,
  messages: Array<{ role: string; content: string }> = [],
  model = ''
): Promise<{ content: string; nativeReasoning: string }> {
  const contentType = res.headers?.get?.('content-type') || '';
  const isSSE = contentType.includes('text/event-stream') && res.body && typeof res.body.getReader === 'function';

  if (isSSE) {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder('utf-8');
    let sseBuffer = '';
    let contentAcc = '';
    let reasoningAcc = '';
    let reportedUsage: TokenUsage | null = null;
    let streamError: any = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });

      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const dataStr = line.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed?.error) {
            streamError = parsed.error;
            continue;
          }
          if (parsed?.usage) {
            const p = Number(parsed.usage.prompt_tokens) || 0;
            const c = Number(parsed.usage.completion_tokens) || 0;
            const t = Number(parsed.usage.total_tokens) || (p + c);
            if (t > 0) {
              reportedUsage = { promptTokens: p, completionTokens: c, totalTokens: t, model };
            }
          }

          const delta = parsed?.choices?.[0]?.delta || parsed?.choices?.[0]?.message;
          if (!delta) continue;

          const rChunk = delta.reasoning_content || delta.reasoning || '';
          const cChunk = delta.content || '';

          if (rChunk) reasoningAcc += String(rChunk);
          if (cChunk) contentAcc += String(cChunk);

          if (shouldEmitLiveThinking) {
            const partialFromContent = extractPartialThinkingFromBuffer(contentAcc);
            const liveThinking = (partialFromContent || reasoningAcc.trim()).trim();
            if (liveThinking) {
              emitThinkingStream(liveThinking, false);
            }
          }
        } catch {
          // Ignore malformed partial SSE line
        }
      }
    }

    if (streamError && !contentAcc.trim()) {
      const code = Number(streamError.code) || 0;
      const detail = String(streamError.message || '');
      if ([401, 402, 403, 429].includes(code)) throwProviderLimit(code, detail);
      throw new Error(`Erro do provedor de IA${code ? ` (HTTP ${code})` : ''}${detail ? `: ${detail}` : ''}`);
    }

    if (shouldEmitLiveThinking) {
      const partialFromContent = extractPartialThinkingFromBuffer(contentAcc);
      const finalThinking = (partialFromContent || reasoningAcc.trim()).trim();
      if (finalThinking) {
        emitThinkingStream(finalThinking, true);
      }
    }

    if (!reportedUsage) {
      const promptChars = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
      const outputChars = contentAcc.length + reasoningAcc.length;
      const p = Math.max(1, Math.ceil(promptChars / 3.8));
      const c = Math.max(1, Math.ceil(outputChars / 3.8));
      reportedUsage = { promptTokens: p, completionTokens: c, totalTokens: p + c, model };
    }
    emitTokenUsage(reportedUsage);

    return { content: contentAcc, nativeReasoning: reasoningAcc.trim() };
  }

  // Fallback for non-streaming responses (or unit test mocks returning res.json())
  const data: any = await res.json();
  if (data?.error && !data?.choices?.length) {
    const code = Number(data.error.code) || 0;
    const detail = String(data.error.message || '');
    if ([401, 402, 403, 429].includes(code)) throwProviderLimit(code, detail);
    throw new Error(`Erro do provedor de IA${code ? ` (HTTP ${code})` : ''}${detail ? `: ${detail}` : ''}`);
  }
  const msg = data?.choices?.[0]?.message;
  const content = String(msg?.content || '');
  const nativeReasoning = String(msg?.reasoning_content || msg?.reasoning || '').trim();

  let reportedUsage: TokenUsage | null = null;
  if (data?.usage) {
    const p = Number(data.usage.prompt_tokens) || 0;
    const c = Number(data.usage.completion_tokens) || 0;
    const t = Number(data.usage.total_tokens) || (p + c);
    if (t > 0) {
      reportedUsage = { promptTokens: p, completionTokens: c, totalTokens: t, model };
    }
  }
  if (!reportedUsage) {
    const promptChars = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
    const outputChars = content.length + nativeReasoning.length;
    const p = Math.max(1, Math.ceil(promptChars / 3.8));
    const c = Math.max(1, Math.ceil(outputChars / 3.8));
    reportedUsage = { promptTokens: p, completionTokens: c, totalTokens: p + c, model };
  }
  emitTokenUsage(reportedUsage);

  if (shouldEmitLiveThinking) {
    const extracted = extractPartialThinkingFromBuffer(content) || extractLLMThinking(content);
    const combined = (extracted || nativeReasoning).trim();
    if (combined) {
      emitThinkingStream(combined, true);
    }
  }

  return { content, nativeReasoning };
}


export type ProviderLimitKind = 'rate_limit' | 'credits' | 'auth';

/** Provider refused the call because of quota/credits/key. Must never be masked by offline fallbacks. */
export class ProviderLimitError extends Error {
  constructor(public kind: ProviderLimitKind, message: string, public status?: number) {
    super(message);
    this.name = 'ProviderLimitError';
  }
}

/** Works on typed errors and on errors that lost their class (IPC, mocks) via the HTTP code in the message. */
export function isProviderLimitError(err: unknown): boolean {
  if (err instanceof ProviderLimitError) return true;
  const msg = String((err as any)?.message || err || '');
  return /HTTP (401|402|403|429)\b/i.test(msg);
}

/** No provider/model configured yet: retrying cannot help. */
export class LLMNotConfiguredError extends Error {
  constructor() {
    super(
      localize(
        'Nenhum provedor de IA configurado. Abra Configurações → Provedores, valide sua chave e escolha um modelo na aba Modelo.',
        'No AI provider configured. Open Settings → Providers, validate your key and pick a model in the Model tab.'
      )
    );
    this.name = 'LLMNotConfiguredError';
  }
}

/** Errors for which a retry is pointless (quota/key/credits or missing configuration). */
export function isFatalLLMError(err: unknown): boolean {
  return isProviderLimitError(err) || err instanceof LLMNotConfiguredError;
}

function throwProviderLimit(status: number, detail: string): never {
  const d = detail ? `: ${detail}` : '';
  if (status === 429) {
    throw new ProviderLimitError(
      'rate_limit',
      localize(
        `O provedor de IA recusou por excesso de pedidos (HTTP 429)${d}. Em modelos gratuitos (:free) do OpenRouter isso costuma ser o limite diário da chave: espere um pouco ou troque de chave, provedor ou modelo em Configurações.`,
        `The AI provider refused because of too many requests (HTTP 429)${d}. On free (:free) OpenRouter models this is usually the key's daily limit: wait a bit or switch key, provider or model in Settings.`
      ),
      429
    );
  }
  if (status === 402) {
    throw new ProviderLimitError(
      'credits',
      localize(
        `Os créditos do provedor de IA acabaram (HTTP 402)${d}. Adicione créditos ou troque o provedor ou o modelo em Configurações.`,
        `The AI provider credits ran out (HTTP 402)${d}. Add credits or switch provider or model in Settings.`
      ),
      402
    );
  }
  throw new ProviderLimitError(
    'auth',
    localize(
      `A chave de API é inválida ou não tem permissão (HTTP ${status})${d}. Confira em Configurações → Provedores.`,
      `The API key is invalid or not authorized (HTTP ${status})${d}. Check Settings → Providers.`
    ),
    status
  );
}

export const callLLM: LLMCaller = async (options) => {
  const config = { ...defaultLLMConfig, ...options.config };

  if (!config.baseURL || !config.model) {
    throw new LLMNotConfiguredError();
  }

  if (responseLanguage === 'en') {
    options = { ...options, systemPrompt: `${options.systemPrompt || ''}${ENGLISH_OUTPUT_RULE}` };
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: options.prompt });

  const shouldStreamLive = !options.isBackground && Boolean(globalThinkingListener);
  let res = await doRequest(config, options, Boolean(options.jsonMode), shouldStreamLive);

  // If provider rejects specialized payload (400/422), retry once with clean baseline payload
  if (!res.ok && (res.status === 400 || res.status === 422)) {
    res = await doRequest(config, { ...options, effortLevel: 'off' }, false, shouldStreamLive);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const body: any = await res.json();
      detail = body?.error?.message || body?.message || '';
    } catch {}
    if ([401, 402, 403, 429].includes(res.status)) throwProviderLimit(res.status, detail);
    throw new Error(`Erro do provedor de IA (HTTP ${res.status})${detail ? `: ${detail}` : ''}`);
  }

  let { content, nativeReasoning } = await readResponseOrStream(res, shouldStreamLive, messages, config.model);

  // If a reasoning model exhausted max_tokens inside <think> and returned empty content, retry once without maxTokens cap
  if ((!content || !content.trim()) && options.maxTokens) {
    const retryRes = await doRequest(
      config,
      { ...options, maxTokens: undefined, effortLevel: 'off' },
      false,
      shouldStreamLive
    );
    if (retryRes.ok) {
      const retried = await readResponseOrStream(retryRes, shouldStreamLive, messages, config.model);
      content = retried.content;
      nativeReasoning = retried.nativeReasoning || nativeReasoning;
    }
  }

  if ((!content || !content.trim()) && nativeReasoning) {
    if (nativeReasoning.includes('{') && nativeReasoning.includes('}')) {
      content = nativeReasoning;
    }
  }

  if (!content || typeof content !== 'string' || !content.trim()) {
    throw new Error('O modelo retornou uma resposta vazia.');
  }

  if (nativeReasoning && !/<think>/i.test(content)) {
    return `<think>${nativeReasoning}</think>\n${content}`;
  }
  return content;
};
