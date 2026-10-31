import React from 'react';
import { ConceptNode } from '../../shared/types';
import { X, Sparkles, BookOpen, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';

interface NodeDetailModalProps {
  node: ConceptNode | null;
  onClose: () => void;
  onStartSocratic?: (nodeId: string) => void;
}

export const NodeDetailModal: React.FC<NodeDetailModalProps> = ({
  node,
  onClose,
  onStartSocratic,
}) => {
  if (!node) return null;

  const getStatusBadge = (status: ConceptNode['status']) => {
    switch (status) {
      case 'mastered':
        return {
          label: '🟢 Domínio Sólido',
          bg: 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60',
          desc: 'Conhecimento demonstrado com raciocínio e convicção consistentes.',
        };
      case 'false_positive':
        return {
          label: '🟡 Falso Positivo',
          bg: 'bg-amber-950/80 text-amber-300 border-amber-600/60 ring-2 ring-amber-500/40 animate-pulse',
          desc: 'Acerto da alternativa mascarando fundamentação falha ou chute.',
        };
      case 'blind_spot':
        return {
          label: '🔴 Ponto Cego',
          bg: 'bg-red-950/80 text-red-400 border-red-700/60',
          desc: 'Erro cometido com convicção elevada (modelo mental distorcido).',
        };
      case 'frontier':
        return {
          label: '🔵 Fronteira Ativa',
          bg: 'bg-blue-950/80 text-blue-400 border-blue-700/60',
          desc: 'Limite atual do conhecimento demonstrado pelo aluno.',
        };
      default:
        return {
          label: '⚪ Não Testado',
          bg: 'bg-gray-900 text-gray-400 border-gray-700/60',
          desc: 'Nó ainda não avaliado pelo harness nesta sessão.',
        };
    }
  };

  const badge = getStatusBadge(node.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="flex w-full max-w-lg flex-col rounded-lg border border-[#1e293b] bg-[#111111] p-5 shadow-2xl text-gray-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#1e293b] pb-3">
          <div>
            <span className={`inline-block rounded px-2.5 py-0.5 text-xs font-semibold border ${badge.bg}`}>
              {badge.label}
            </span>
            <h3 className="mt-2 text-base font-bold text-white font-serif">{node.title}</h3>
            <span className="text-[11px] font-mono text-gray-500">ID: {node.id} • Nível {node.level}</span>
          </div>

          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-[#1e293b] hover:text-gray-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status description */}
        <div className="my-3 text-xs text-gray-400 italic">
          {badge.desc}
        </div>

        {/* Summary */}
        <div className="my-2 space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Resumo Técnico de Ancoragem
          </span>
          <p className="text-xs leading-relaxed text-gray-300 bg-[#0a0a0a] p-3 rounded border border-[#1e293b]/60">
            {node.summary}
          </p>
        </div>

        {/* Principle I: Unconditional Truth */}
        <div className="my-3 space-y-1">
          <div className="flex items-center space-x-1.5 text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Princípio I: Verdade Incondicional
            </span>
          </div>
          <div className="rounded-md border border-emerald-900/60 bg-emerald-950/20 p-3 text-xs leading-relaxed text-emerald-200 font-medium">
            &quot;{node.unconditionalTruth}&quot;
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-4 flex items-center justify-end space-x-2 border-t border-[#1e293b] pt-3">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-gray-400 hover:bg-[#1e293b] hover:text-gray-200"
          >
            Fechar
          </button>

          {onStartSocratic && (
            <button
              onClick={() => {
                onStartSocratic(node.id);
                onClose();
              }}
              className="flex items-center space-x-1.5 rounded bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition-colors"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Ensinar Nó (Loop Socrático)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
