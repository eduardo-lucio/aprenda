import React from 'react';

interface ConfidenceSliderProps {
  value: number;
  onChange: (val: number) => void;
}

export const ConfidenceSlider: React.FC<ConfidenceSliderProps> = ({ value, onChange }) => {
  return (
    <div className="flex items-center space-x-4 border-y border-[#262626] px-4 py-2.5 text-xs">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-400 shrink-0">
        CONFIDENCE
      </span>

      <input
        type="range"
        min="0"
        max="100"
        step="5"
        role="slider"
        aria-label="Confiança"
        aria-valuenow={value}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-[#262626] accent-amber-400 focus:outline-none"
      />

      <span className="w-10 text-right font-mono text-xs font-semibold text-gray-200 shrink-0">
        {value}%
      </span>
    </div>
  );
};
