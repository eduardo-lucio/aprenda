import { ConceptNode } from '../../shared/types';

export type NodeStatus = ConceptNode['status'];

export interface StatusMeta {
  label: string;
  /** Pill border and dot. */
  stroke: string;
  /** Pill background. */
  fill: string;
  description: string;
}

/** Single source of truth for how a concept status looks and is named (legend, pills and side panel). */
export const STATUS_META: Record<NodeStatus, StatusMeta> = {
  mastered: { label: 'Domínio', stroke: '#22c55e', fill: '#0a2415', description: 'Você demonstrou dominar este conceito.' },
  false_positive: { label: 'Falso positivo', stroke: '#facc15', fill: '#2a1f06', description: 'Acertou com confiança alta, mas o raciocínio não sustenta.' },
  blind_spot: { label: 'Ponto cego', stroke: '#ef4444', fill: '#2a0d0d', description: 'Errou com confiança alta: não sabe que não sabe.' },
  frontier: { label: 'Fronteira', stroke: '#60a5fa', fill: '#0e1b36', description: 'Está no limite do que você sabe: ótimo ponto para aprender.' },
  untested: { label: 'Não testado', stroke: '#52525b', fill: '#141414', description: 'Ainda não foi testado na sondagem.' },
};

export const STATUS_ORDER: NodeStatus[] = ['mastered', 'false_positive', 'blind_spot', 'frontier', 'untested'];
