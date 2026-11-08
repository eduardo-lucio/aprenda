export { VOICE_LANGUAGES } from '../../shared/types';
import { fetchWithTimeout } from './http';

import { localize } from './llmClient';

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
    res = await fetchWithTimeout(`${DEEPGRAM_BASE}/projects`, {
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
    throw new Error(
      localize(
        'Para usar o ditado, configure a chave do Deepgram em Configurações → Provedores.',
        'To use dictation, set up your Deepgram key in Settings → Providers.'
      )
    );
  }

  const query = new URLSearchParams({
    model: 'nova-2',
    smart_format: 'true',
    punctuate: 'true',
    language: params.language || 'pt-BR',
  });

  const body = params.audio instanceof Uint8Array ? params.audio : new Uint8Array(params.audio);

  const res = await fetchWithTimeout(`${DEEPGRAM_BASE}/listen?${query.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${key}`,
      'Content-Type': (params.mimeType || 'audio/webm').split(';')[0],
    },
    body: body as any,
  }, 60000);

  if (!res.ok) {
    const msg = await readDeepgramError(res);
    throw new Error(`Falha na transcrição do Deepgram: ${msg}`);
  }

  const data: any = await res.json();
  return String(data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim();
}
