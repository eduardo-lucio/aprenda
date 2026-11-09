import fs from 'fs';
import path from 'path';
import { PersistedUi, SessionSnapshot, SessionSummary } from '../../shared/types';

interface SessionRecord {
  snapshot: SessionSnapshot;
  ui: PersistedUi;
  updatedAt: number;
  pinned?: boolean;
  customTitle?: string;
}

/** Stores every session as JSON on disk (atomic write), so conversations survive app restarts. */
export class SessionRepository {
  private records = new Map<string, SessionRecord>();
  private writeTimer?: NodeJS.Timeout;
  private corruptBackup?: string;
  private writeListener?: (error: string | null) => void;
  private lastWriteFailed = false;

  constructor(private filePath: string) {
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as { sessions?: SessionRecord[] };
      if (!Array.isArray(parsed.sessions)) throw new Error('formato inesperado');
      for (const rec of parsed.sessions) {
        if (rec?.snapshot?.session?.id) this.records.set(rec.snapshot.session.id, rec);
      }
    } catch (err) {
      console.warn('[SessionRepository] Não foi possível ler as sessões salvas:', err);
      this.setCorruptFileAside();
    }
  }

  /** The next save would replace the unreadable file, and with it any chance of recovering the history. */
  private setCorruptFileAside(): void {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(path.dirname(this.filePath), `sessions.corrupt-${stamp}.json`);
    try {
      fs.renameSync(this.filePath, backup);
      this.corruptBackup = backup;
    } catch (err) {
      console.error('[SessionRepository] Não foi possível preservar o arquivo corrompido:', err);
    }
  }

  /** Where the unreadable session file was moved to, if that happened at startup. */
  getCorruptBackup(): string | undefined {
    return this.corruptBackup;
  }

  /** Called with the error text when saving fails, and with `null` when saving works again. */
  setWriteListener(listener: (error: string | null) => void): void {
    this.writeListener = listener;
  }

  private scheduleWrite(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => this.flush(), 150);
  }

  /** Writes immediately (also used on app quit). */
  flush(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = undefined;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ sessions: Array.from(this.records.values()) }));
      fs.renameSync(tmp, this.filePath);
      if (this.lastWriteFailed) this.writeListener?.(null);
      this.lastWriteFailed = false;
    } catch (err) {
      console.error('[SessionRepository] Falha ao salvar sessões:', err);
      this.lastWriteFailed = true;
      this.writeListener?.(String((err as Error)?.message || err));
    }
  }

  saveSnapshot(snapshot: SessionSnapshot): void {
    const id = snapshot.session.id;
    const prev = this.records.get(id);
    this.records.set(id, {
      snapshot,
      ui: prev?.ui || { chatMessages: [] },
      updatedAt: Date.now(),
      pinned: prev?.pinned,
      customTitle: prev?.customTitle,
    });
    this.scheduleWrite();
  }

  saveUi(id: string, ui: PersistedUi): void {
    const prev = this.records.get(id);
    if (!prev) return;
    prev.ui = ui;
    this.scheduleWrite();
  }

  get(id: string): { snapshot: SessionSnapshot; ui: PersistedUi } | undefined {
    const rec = this.records.get(id);
    return rec ? { snapshot: rec.snapshot, ui: rec.ui } : undefined;
  }

  setPinned(id: string, pinned: boolean): void {
    const rec = this.records.get(id);
    if (!rec) return;
    rec.pinned = pinned || undefined;
    this.scheduleWrite();
  }

  /** An empty title goes back to the generated one. */
  rename(id: string, title: string): void {
    const rec = this.records.get(id);
    if (!rec) return;
    rec.customTitle = title.trim().slice(0, 120) || undefined;
    this.scheduleWrite();
  }

  delete(id: string): void {
    if (this.records.delete(id)) this.scheduleWrite();
  }

  list(): SessionSummary[] {
    return Array.from(this.records.values())
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt)
      .map((r) => ({
        id: r.snapshot.session.id,
        title: r.customTitle ?? r.snapshot.session.topic ?? r.snapshot.session.goal,
        mode: r.snapshot.session.mode,
        updatedAt: r.updatedAt,
        pinned: r.pinned,
      }));
  }
}
