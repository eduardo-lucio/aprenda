import fs from 'fs';
import path from 'path';
import { DemonstratedConcept } from '../../shared/types';

/** What a demonstration brings: the concept, where it was shown and how. */
export interface Demonstration {
  title: string;
  truth: string;
  discipline: string;
  sessionId: string;
  source: DemonstratedConcept['source'];
}

/** Only the latest entries reach a prompt: older ones stay on disk and on the memory screen. */
export const MAX_REMEMBERED_IN_PROMPT = 40;

const keyOf = (title: string): string =>
  title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * What the learner has demonstrated, across sessions: the concept, when and where. It is a record
 * of evidence with a date, not a seal: the probe starts from it and confirms, it does not trust it.
 */
export class LearnerMemory {
  private entries = new Map<string, DemonstratedConcept>();
  private corruptBackup?: string;

  constructor(private filePath: string, private now: () => number = Date.now) {
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as { demonstrated?: DemonstratedConcept[] };
      if (!Array.isArray(parsed.demonstrated)) throw new Error('formato inesperado');
      for (const e of parsed.demonstrated) {
        if (e?.id && typeof e.title === 'string') this.entries.set(e.id, e);
      }
    } catch (err) {
      console.warn('[LearnerMemory] Não foi possível ler a memória salva:', err);
      // The next write would replace the unreadable file, and with it any chance of recovering it
      const stamp = new Date(this.now()).toISOString().replace(/[:.]/g, '-');
      const backup = path.join(path.dirname(this.filePath), `memory.corrupt-${stamp}.json`);
      try {
        fs.renameSync(this.filePath, backup);
        this.corruptBackup = backup;
      } catch (renameErr) {
        console.error('[LearnerMemory] Não foi possível preservar o arquivo corrompido:', renameErr);
      }
    }
  }

  /** Where the unreadable file was moved to, if that happened at startup. */
  getCorruptBackup(): string | undefined {
    return this.corruptBackup;
  }

  private write(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ demonstrated: Array.from(this.entries.values()) }));
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error('[LearnerMemory] Falha ao salvar a memória:', err);
    }
  }

  /** The same concept shown again updates its entry: the date moves and the count grows. */
  record(d: Demonstration): DemonstratedConcept | undefined {
    const title = (d.title || '').trim();
    const id = keyOf(title);
    if (!id) return undefined;
    const at = this.now();
    const prev = this.entries.get(id);
    const entry: DemonstratedConcept = {
      id,
      title,
      truth: (d.truth || '').trim() || prev?.truth || title,
      discipline: (d.discipline || '').trim() || prev?.discipline || '',
      sessionId: d.sessionId,
      source: d.source,
      firstAt: prev?.firstAt ?? at,
      lastAt: at,
      times: (prev?.times ?? 0) + 1,
    };
    this.entries.set(id, entry);
    this.write();
    return entry;
  }

  /** Latest first. */
  list(): DemonstratedConcept[] {
    return Array.from(this.entries.values())
      .sort((a, b) => b.lastAt - a.lastAt)
      .map((e) => ({ ...e }));
  }

  get(id: string): DemonstratedConcept | undefined {
    const e = this.entries.get(id);
    return e ? { ...e } : undefined;
  }

  delete(ids: string[]): void {
    let changed = false;
    for (const id of ids || []) changed = this.entries.delete(String(id)) || changed;
    if (changed) this.write();
  }

  clear(): void {
    if (this.entries.size === 0) return;
    this.entries.clear();
    this.write();
  }
}
