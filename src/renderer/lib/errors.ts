/** Turns an IPC/JS error into the text shown to the student (no IPC wrapper, no class names). */
export function cleanError(err: unknown, fallback: string): string {
  return String((err as any)?.message || err || fallback)
    .replace(/^Error invoking remote method '[^']+': /, '')
    .replace(/^(?:\w*Error: )+/, '');
}

/** The student stopped the call: nothing to report. */
export function isCancelled(err: unknown): boolean {
  return /LLMCancelledError/.test(String((err as any)?.message || err || ''));
}

/** The session changed under a running call: nothing went wrong from the student's point of view. */
export function isSessionChanged(err: unknown): boolean {
  return /SessionChangedError/.test(String((err as any)?.message || err || ''));
}
