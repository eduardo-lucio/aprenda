import { localize } from './llmClient';

/** `fetch` with a deadline and an error the student can read, for short service calls. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15000
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err: any) {
    const host = (() => {
      try {
        return new URL(url).host;
      } catch {
        return url;
      }
    })();
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error(
        localize(
          `${host} não respondeu em ${Math.round(timeoutMs / 1000)} segundos. Tente de novo.`,
          `${host} did not answer within ${Math.round(timeoutMs / 1000)} seconds. Try again.`
        )
      );
    }
    throw new Error(
      localize(
        `Não foi possível conectar a ${host}. Verifique sua conexão e o endereço informado.`,
        `Could not reach ${host}. Check your connection and the address provided.`
      )
    );
  }
}
