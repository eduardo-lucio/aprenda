import { useCallback } from 'react';
import { ConceptNode } from '../../shared/types';
import { MessageKey, useI18n } from '../i18n';

export type NodeStatus = ConceptNode['status'];

export interface StatusMeta {
  label: string;
  /** Pill border and dot. */
  stroke: string;
  /** Pill background. */
  fill: string;
  description: string;
}

/** Colors of each concept status (labels and descriptions come from the active language). */
export const STATUS_COLORS: Record<NodeStatus, { stroke: string; fill: string }> = {
  mastered: { stroke: '#22c55e', fill: '#0a2415' },
  false_positive: { stroke: '#facc15', fill: '#2a1f06' },
  blind_spot: { stroke: '#ef4444', fill: '#2a0d0d' },
  frontier: { stroke: '#60a5fa', fill: '#0e1b36' },
  untested: { stroke: '#52525b', fill: '#141414' },
};

export const STATUS_ORDER: NodeStatus[] = ['mastered', 'false_positive', 'blind_spot', 'frontier', 'untested'];

/** Single source of truth for how a concept status looks and is named (legend, pills and side panel). */
export function useStatusMeta(): (status: NodeStatus) => StatusMeta {
  const { t } = useI18n();
  return useCallback(
    (status: NodeStatus) => ({
      ...STATUS_COLORS[status],
      label: t(`status.${status}.label` as MessageKey),
      description: t(`status.${status}.description` as MessageKey),
    }),
    [t]
  );
}
