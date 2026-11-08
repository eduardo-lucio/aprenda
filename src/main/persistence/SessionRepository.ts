import fs from 'fs';
import path from 'path';
import { PersistedUi, SessionSnapshot, SessionSummary } from '../../shared/types';

interface SessionRecord {
  snapshot: SessionSnapshot;
  ui: PersistedUi;
  updatedAt: number;
}

/** Stores every session as JSON on disk (atomic write), so conversations survive app restarts. */
export class SessionRepository {
  private records = new Map<string, SessionRecord>();
  private writeTimer?: NodeJS.Timeout;

  constructor(private filePath: string) {
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as { sessions?: SessionRecord[] };
      for (const rec of parsed.sessions || []) {
        if (rec?.snapshot?.session?.id) this.records.set(rec.snapshot.session.id, rec);
      }
    } catch (err) {
      console.warn('[SessionRepository] Não foi possível ler as sessões salvas:', err);
    }
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
    } catch (err) {
      console.error('[SessionRepository] Falha ao salvar sessões:', err);
    }
  }

  saveSnapshot(snapshot: SessionSnapshot): void {
    const id = snapshot.session.id;
    const prev = this.records.get(id);
    this.records.set(id, { snapshot, ui: prev?.ui || { chatMessages: [] }, updatedAt: Date.now() });
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

  delete(id: string): void {
    if (this.records.delete(id)) this.scheduleWrite();
  }

  list(): SessionSummary[] {
    return Array.from(this.records.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((r) => ({
        id: r.snapshot.session.id,
        title: r.snapshot.session.topic ?? r.snapshot.session.goal,
        mode: r.snapshot.session.mode,
        updatedAt: r.updatedAt,
      }));
  }
}
