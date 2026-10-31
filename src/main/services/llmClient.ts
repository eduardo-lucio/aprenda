export interface LLMConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export const defaultLLMConfig: LLMConfig = {
  baseURL: process.env.OPENAI_BASE_URL || 'http://localhost:11434/v1',
  apiKey: process.env.OPENAI_API_KEY || 'ollama',
  model: process.env.OPENAI_MODEL || 'gemini-2.0-flash',
  timeoutMs: 6000,
};

export async function callLLM(options: {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  jsonMode?: boolean;
  config?: Partial<LLMConfig>;
}): Promise<string> {
  const config = { ...defaultLLMConfig, ...options.config };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  const messages: Array<{ role: string; content: string }> = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: options.prompt });

  try {
    const res = await fetch(`${config.baseURL.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options.temperature ?? 0.2,
        ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`LLM HTTP error: ${res.status} ${res.statusText}`);
    }

    const data: any = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from LLM');
    }
    return content;
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}
