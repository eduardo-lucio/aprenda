import React from 'react';
import { CONFIDENCE_STOPS, DEFAULT_CONFIDENCE } from '../../shared/types';
import { useI18n } from '../i18n';

interface ConfidenceSliderProps {
  /** Undefined until the student moves it: the control rests in the middle and shows no number. */
  value: number | undefined;
  onChange: (val: number) => void;
}

export const ConfidenceSlider: React.FC<ConfidenceSliderProps> = ({ value, onChange }) => {
  const { t } = useI18n();
  const shown = value ?? DEFAULT_CONFIDENCE;
  const stopIndex = Math.max(0, CONFIDENCE_STOPS.findIndex((s) => s === shown));

  return (
    <div className="flex items-center space-x-4 border-y border-ink-600 px-4 py-2.5 text-xs">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-400 shrink-0">
        {t('confidence.label')}
      </span>

      <input
        type="range"
        min="0"
        max={CONFIDENCE_STOPS.length - 1}
        step="1"
        role="slider"
        aria-label={t('confidence.label')}
        aria-valuenow={shown}
        aria-valuetext={value === undefined ? t('confidence.unset') : `${value}%`}
        value={stopIndex}
        onChange={(e) => onChange(CONFIDENCE_STOPS[Number(e.target.value)])}
        className={`h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-ink-600 focus-ring ${
          value === undefined ? 'accent-gray-500' : 'accent-amber-400'
        }`}
      />

      <span
        title={value === undefined ? t('confidence.unsetHint') : undefined}
        className={`w-10 text-right font-mono text-xs font-semibold shrink-0 ${value === undefined ? 'text-gray-500' : 'text-gray-200'}`}
      >
        {value === undefined ? '—' : `${value}%`}
      </span>
    </div>
  );
};
