import net from 'net';
import { localize } from './llmClient';

/**
 * How long each address of a host gets to accept the connection before the next one is tried.
 * Node's default is 250 ms, and it drops the attempt instead of racing it: on a slow or lossy link
 * (a lost SYN is only resent after about a second) every address of the provider fails that way
 * and the call dies in half a second with "fetch failed" (ETIMEDOUT), even though the host is up.
 */
export const CONNECT_ATTEMPT_TIMEOUT_MS = 2500;

/** Process-wide network defaults for every `fetch` of the main process. Call once at startup. */
export function configureNetworkDefaults(): void {
  net.setDefaultAutoSelectFamilyAttemptTimeout(CONNECT_ATTEMPT_TIMEOUT_MS);
}

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
