export const VOICE_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'pt-PT', label: 'Português (Portugal)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'es', label: 'Español' },
  { code: 'es-419', label: 'Español (Latinoamérica)' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'ru', label: 'Русский' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh-CN', label: '中文 (简体)' },
  { code: 'hi', label: 'हिन्दी' },
];

const DEEPGRAM_BASE = 'https://api.deepgram.com/v1';

async function readDeepgramError(res: Response): Promise<string> {
  try {
    const body: any = await res.json();
    return body?.err_msg || body?.message || body?.reason || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** Validates a Deepgram API key against the live API. Throws with a readable message when invalid. */
export async function validateDeepgramKey(apiKey: string): Promise<{ isValid: true; keyMasked: string }> {
  const key = apiKey.trim();
  if (!key) throw new Error('A chave do Deepgram não pode estar em branco.');

  let res: Response;
  try {
    res = await fetch(`${DEEPGRAM_BASE}/projects`, {
      method: 'GET',
      headers: { Authorization: `Token ${key}` },
    });
  } catch (e: any) {
    throw new Error(`Não foi possível conectar ao Deepgram: ${e?.message || 'sem conexão'}`);
  }

  // 403 = authenticated but key lacks the project-listing scope → still a real key
  if (!res.ok && res.status !== 403) {
    const msg = await readDeepgramError(res);
    throw new Error(`Chave Deepgram inválida: ${msg} (Erro ${res.status})`);
  }

  return {
    isValid: true,
    keyMasked: key.length > 8 ? `...${key.slice(-4)} • ${key.length}` : 'Configurada',
  };
}

/** Sends recorded audio to Deepgram's pre-recorded transcription endpoint and returns the transcript. */
export async function transcribeWithDeepgram(params: {
  apiKey: string;
  audio: ArrayBuffer | Uint8Array;
  mimeType?: string;
  language?: string;
}): Promise<string> {
  const key = params.apiKey.trim();
  if (!key) {
    throw new Error('Configure a chave do Deepgram em Configurações → Providers para usar a gravação de voz.');
  }

  const query = new URLSearchParams({
    model: 'nova-2',
    smart_format: 'true',
    punctuate: 'true',
    language: params.language || 'pt-BR',
  });

  const body = params.audio instanceof Uint8Array ? params.audio : new Uint8Array(params.audio);

  const res = await fetch(`${DEEPGRAM_BASE}/listen?${query.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${key}`,
      'Content-Type': (params.mimeType || 'audio/webm').split(';')[0],
    },
    body: body as any,
  });

  if (!res.ok) {
    const msg = await readDeepgramError(res);
    throw new Error(`Falha na transcrição do Deepgram: ${msg}`);
  }

  const data: any = await res.json();
  return String(data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim();
}
