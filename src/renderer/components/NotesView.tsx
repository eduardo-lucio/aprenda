import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Circle, RotateCw } from 'lucide-react';
import { ConceptNode, ConceptNote } from '../../shared/types';
import { useStatusMeta } from '../graph/statusMeta';
import { useI18n } from '../i18n';
import { RichText } from './RichText';

interface NotesViewProps {
  nodes: ConceptNode[];
  notes: ConceptNote[];
  pendingIds: string[];
  error: string | null;
  onRetry: () => void;
  /** Concept to open the page on (when coming from the concept map). */
  initialNodeId?: string | null;
}

export const NotesView: React.FC<NotesViewProps> = ({ nodes, notes, pendingIds, error, onRetry, initialNodeId = null }) => {
  const { t } = useI18n();
  const statusMeta = useStatusMeta();
  const [focusId, setFocusId] = useState<string | null>(initialNodeId);
  const cardRefs = useRef(new Map<string, HTMLElement>());

  const ordered = useMemo(() => [...nodes].sort((a, b) => a.level - b.level), [nodes]);
  const noteById = useMemo(() => new Map(notes.map((n) => [n.nodeId, n])), [notes]);

  const scrollToCard = (id: string) => {
    cardRefs.current.get(id)?.scrollIntoView?.({ block: 'start' });
  };

  useEffect(() => {
    if (initialNodeId) scrollToCard(initialNodeId);
  }, [initialNodeId]);

  if (nodes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-ink-700 p-8 text-center text-sm text-gray-500">
        {t('notes.empty')}
      </div>
    );
  }

  const topicList = (
    title: string,
    topics: string[] | undefined,
    emptyText: string,
    icon: React.ReactNode,
    busy: boolean
  ) => (
    <section className="min-w-0">
      <h4 className="label-mono mb-2">{title}</h4>
      {!topics ? (
        <p className={`text-xs text-gray-500 ${busy ? 'animate-pulse' : ''}`}>
          {busy ? t('notes.writing') : t('notes.unavailable')}
        </p>
      ) : topics.length === 0 ? (
        <p className="text-xs text-gray-500">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">
          {topics.map((topic) => (
            <li key={topic} className="flex items-start gap-2 text-gray-300">
              <span className="mt-[3px] shrink-0">{icon}</span>
              <RichText text={topic} className="min-w-0 text-xs leading-relaxed" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <nav
        aria-label={t('notes.index')}
        className="hidden w-60 shrink-0 space-y-1 overflow-y-auto rounded-lg border border-ink-700 bg-ink-900 p-2 md:block"
      >
        {ordered.map((node) => (
          <button
            key={node.id}
            type="button"
            aria-current={focusId === node.id ? 'true' : undefined}
            onClick={() => {
              setFocusId(node.id);
              scrollToCard(node.id);
            }}
            className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors ${
              focusId === node.id ? 'bg-ink-700 text-white' : 'text-gray-400 hover:bg-ink-850 hover:text-gray-200'
            }`}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: statusMeta(node.status).stroke }} />
            <span className="truncate">{node.title}</span>
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1 select-text space-y-3 overflow-y-auto">
        {error && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-ink-600 bg-ink-850 p-3 text-xs text-gray-300">
            <span className="flex items-start gap-2">
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-gray-400" />
              {error}
            </span>
            <button
              type="button"
              onClick={onRetry}
              className="flex shrink-0 items-center gap-1.5 rounded border border-ink-500 px-2.5 py-1 font-mono text-[11px] text-gray-200 hover:border-ink-400 hover:text-white"
            >
              <RotateCw className="h-3 w-3" />
              {t('notes.retry')}
            </button>
          </div>
        )}

        {ordered.map((node) => {
          const meta = statusMeta(node.status);
          const note = noteById.get(node.id);
          const busy = pendingIds.includes(node.id);
          return (
            <article
              key={node.id}
              ref={(el) => {
                if (el) cardRefs.current.set(node.id, el);
                else cardRefs.current.delete(node.id);
              }}
              data-testid={`note-${node.id}`}
              aria-label={node.title}
              className={`scroll-mt-1 space-y-4 rounded-lg border bg-ink-900 p-4 ${
                focusId === node.id ? 'border-ink-400' : 'border-ink-700'
              }`}
            >
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-serif text-lg font-semibold leading-snug text-gray-100">{node.title}</h3>
                <div className="flex items-center gap-3">
                  {busy && note && <span className="animate-pulse font-mono text-[10px] text-gray-500">{t('notes.updating')}</span>}
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
                    style={{ borderColor: meta.stroke, color: meta.stroke, background: meta.fill }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.stroke }} />
                    {meta.label}
                  </span>
                </div>
              </header>

              <section>
                <h4 className="label-mono mb-1.5">{t('node.summary')}</h4>
                <RichText
                  text={note?.summary || node.summary || node.unconditionalTruth}
                  className="text-sm leading-relaxed text-gray-300"
                />
              </section>

              <div className="grid gap-4 border-t border-ink-700 pt-4 sm:grid-cols-2">
                {topicList(
                  t('notes.toLearn'),
                  note?.toLearn,
                  t('notes.toLearnEmpty'),
                  <Circle className="h-3 w-3 text-gray-500" />,
                  busy
                )}
                {topicList(
                  t('notes.learned'),
                  note?.learned,
                  t('notes.learnedEmpty'),
                  <Check className="h-3 w-3" style={{ color: statusMeta('mastered').stroke }} />,
                  busy
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
