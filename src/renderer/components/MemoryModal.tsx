import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { DemonstratedConcept, PracticeTarget } from '../../shared/types';
import { ErrorNotice } from './ErrorNotice';
import { localeOf, useI18n } from '../i18n';
import { cleanError } from '../lib/errors';

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Opens a practice session over the chosen concepts. Absent while an AI call is running. */
  onPractice?: (params: { material: string; targets: PracticeTarget[] }) => void;
}

/** What is kept between sessions: the learner can read it, erase it and practise from it. */
export const MemoryModal: React.FC<MemoryModalProps> = ({ isOpen, onClose, onPractice }) => {
  const { t, lang } = useI18n();
  const [entries, setEntries] = useState<DemonstratedConcept[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set());
    setConfirmClear(false);
    setError(null);
    setEntries(null);
    let alive = true;
    window.api
      .listMemory()
      .then((list) => alive && setEntries(list))
      .catch((err) => {
        if (!alive) return;
        setEntries([]);
        setError(cleanError(err, t('session.err.unexpected')));
      });
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      alive = false;
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  const groups = useMemo(() => {
    const byDiscipline = new Map<string, DemonstratedConcept[]>();
    for (const e of entries || []) {
      const key = e.discipline || t('memory.noDiscipline');
      byDiscipline.set(key, [...(byDiscipline.get(key) || []), e]);
    }
    return [...byDiscipline.entries()];
  }, [entries, t]);

  if (!isOpen) return null;

  const apply = async (action: () => Promise<DemonstratedConcept[]>) => {
    setError(null);
    try {
      const list = await action();
      setEntries(list);
      setSelected((prev) => new Set([...prev].filter((id) => list.some((e) => e.id === id))));
      setConfirmClear(false);
    } catch (err) {
      setError(cleanError(err, t('session.err.unexpected')));
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosen = (entries || []).filter((e) => selected.has(e.id));
  const practise = () => {
    if (!onPractice || chosen.length === 0) return;
    const disciplines = [...new Set(chosen.map((e) => e.discipline).filter(Boolean))];
    onPractice({
      material: disciplines.length === 1 ? disciplines[0] : chosen.map((e) => e.title).slice(0, 3).join(', '),
      targets: chosen.map((e) => ({ id: e.id, title: e.title, truth: e.truth })),
    });
  };

  const date = (at: number) => new Date(at).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('memory.title')}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[620px] max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-ink-600 bg-ink-850 font-sans text-gray-200 shadow-2xl outline-none"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-ink-600 px-6">
          <h2 className="font-serif text-2xl font-medium tracking-tight text-white">{t('memory.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-ink-600 hover:text-white"
            aria-label={t('settings.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 select-text space-y-5 overflow-y-auto px-6 py-4">
          <p className="text-xs leading-relaxed text-gray-400">{t('memory.intro')}</p>
          {error && <ErrorNotice message={error} />}
          {entries !== null && entries.length === 0 && !error && (
            <p data-testid="memory-empty" className="rounded-lg border border-ink-700 bg-ink-900 px-4 py-6 text-center text-xs text-gray-400">
              {t('memory.empty')}
            </p>
          )}
          {groups.map(([discipline, list]) => (
            <section key={discipline} className="space-y-2">
              <h3 className="label-mono text-gray-300">{discipline}</h3>
              <ul className="space-y-1.5">
                {list.map((e) => (
                  <li key={e.id} data-testid="memory-entry" className="flex items-start gap-3 rounded-lg border border-ink-700 bg-ink-900 px-3.5 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(e.id)}
                      onChange={() => toggle(e.id)}
                      aria-label={t('memory.select', { title: e.title })}
                      className="mt-1 h-3.5 w-3.5 shrink-0 accent-emerald-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-100">{e.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-gray-300">{e.truth}</p>
                      <p className="mt-1 font-mono text-[10px] text-gray-500">
                        {t(e.source === 'practice' ? 'memory.source.practice' : 'memory.source.lesson')} · {date(e.lastAt)}
                        {e.times > 1 ? ` · ${t('memory.times', { n: e.times })}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void apply(() => window.api.deleteMemory([e.id]))}
                      title={t('memory.delete')}
                      aria-label={t('memory.deleteOne', { title: e.title })}
                      className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-ink-700 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {entries !== null && entries.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-ink-600 px-6 py-3 text-[11px]">
            {confirmClear ? (
              <span className="flex items-center gap-3">
                <span className="text-amber-200">{t('memory.clear.confirm', { n: entries.length })}</span>
                <button type="button" onClick={() => void apply(() => window.api.clearMemory())} className="font-semibold text-amber-200 underline hover:text-amber-100">
                  {t('memory.clear.yes')}
                </button>
                <button type="button" onClick={() => setConfirmClear(false)} className="text-gray-400 underline hover:text-gray-200">
                  {t('memory.clear.no')}
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmClear(true)} className="text-gray-400 underline hover:text-gray-200">
                {t('memory.clear')}
              </button>
            )}
            <button
              type="button"
              data-testid="memory-practice"
              onClick={practise}
              disabled={!onPractice || chosen.length === 0}
              className="rounded bg-gray-200 px-4 py-2 text-xs font-bold text-black transition-colors hover:bg-white disabled:bg-ink-500 disabled:text-gray-400"
            >
              {chosen.length > 0 ? t('memory.practice', { n: chosen.length }) : t('memory.practice.none')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
