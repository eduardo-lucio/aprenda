import React, { useEffect } from 'react';
import { X, GraduationCap, NotebookPen } from 'lucide-react';
import { ConceptNode } from '../../shared/types';
import { useStatusMeta } from '../graph/statusMeta';
import { useI18n } from '../i18n';

interface NodeDetailPanelProps {
  node: ConceptNode;
  nodes: ConceptNode[];
  onClose: () => void;
  onSelect: (id: string) => void;
  onStartSocratic?: (nodeId: string) => void;
  onOpenNotes?: (nodeId: string) => void;
}

export const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({ node, nodes, onClose, onSelect, onStartSocratic, onOpenNotes }) => {
  const { t } = useI18n();
  const statusMeta = useStatusMeta();
  const meta = statusMeta(node.status);
  const prerequisites = node.prerequisites
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is ConceptNode => Boolean(n));
  const dependents = nodes.filter((n) => n.prerequisites.includes(node.id));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const relation = (title: string, list: ConceptNode[]) =>
    list.length > 0 && (
      <section>
        <h4 className="label-mono mb-1.5">{title}</h4>
        <ul className="space-y-1">
          {list.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onSelect(n.id)}
                className="flex w-full items-center gap-2 rounded-lg border border-ink-600 bg-ink-850 px-2.5 py-1.5 text-left text-xs text-gray-300 transition-colors hover:border-ink-400 hover:text-white"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: statusMeta(n.status).stroke }} />
                <span className="truncate">{n.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <aside
      data-testid="node-detail-panel"
      aria-label={t('node.detailsOf', { title: node.title })}
      className="flex h-full w-80 shrink-0 flex-col border-l border-ink-700 bg-ink-900"
    >
      <div className="flex items-start justify-between gap-3 border-b border-ink-700 p-4">
        <div className="min-w-0 space-y-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
            style={{ borderColor: meta.stroke, color: meta.stroke, background: meta.fill }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.stroke }} />
            {meta.label}
          </span>
          <h3 className="font-serif text-lg font-semibold leading-snug text-gray-100">{node.title}</h3>
          <p className="font-mono text-[10px] text-gray-500">{t('node.level', { level: node.level })}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('node.close')}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-ink-700 hover:text-gray-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 text-sm">
        <p className="text-xs leading-relaxed text-gray-500">{meta.description}</p>
        {node.summary && (
          <section>
            <h4 className="label-mono mb-1.5">{t('node.summary')}</h4>
            <p className="leading-relaxed text-gray-300">{node.summary}</p>
          </section>
        )}
        {node.unconditionalTruth && (
          <section>
            <h4 className="label-mono mb-1.5">{t('node.coreIdea')}</h4>
            <p className="rounded-lg border border-ink-600 bg-ink-850 p-3 leading-relaxed text-gray-200">
              {node.unconditionalTruth}
            </p>
          </section>
        )}
        {relation(t('node.prerequisites'), prerequisites)}
        {relation(t('node.unlocks'), dependents)}
      </div>

      {(onStartSocratic || onOpenNotes) && (
        <div className="space-y-2 border-t border-ink-700 p-4">
          {onOpenNotes && (
            <button
              type="button"
              onClick={() => onOpenNotes(node.id)}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-ink-500 px-3.5 py-2 font-mono text-[11px] font-semibold text-gray-200 transition-colors hover:border-ink-400 hover:text-white"
            >
              <NotebookPen className="h-4 w-4" />
              {t('node.openNotes')}
            </button>
          )}
          {onStartSocratic && (
          <button
            type="button"
            onClick={() => onStartSocratic(node.id)}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-200 px-3.5 py-2 font-mono text-[11px] font-semibold text-ink-950 transition-colors hover:bg-white"
          >
            <GraduationCap className="h-4 w-4" />
            {t('node.teach')}
          </button>
          )}
        </div>
      )}
    </aside>
  );
};
