import React from 'react';
import { Gauge } from 'lucide-react';

interface ConfidenceSliderProps {
  value: number;
  onChange: (val: number) => void;
}

export const ConfidenceSlider: React.FC<ConfidenceSliderProps> = ({ value, onChange }) => {
  const getFeedbackLabel = (val: number) => {
    if (val < 30) return { label: 'Chute / Palpite Incerto', color: 'text-gray-400' };
    if (val < 60) return { label: 'Dúvida Razoável', color: 'text-blue-400' };
    if (val < 85) return { label: 'Confiante na Resposta', color: 'text-emerald-400' };
    return { label: 'Certeza Absoluta', color: 'text-emerald-300 font-bold' };
  };

  const feedback = getFeedbackLabel(value);

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-[#1e293b] bg-[#0a0a0a] p-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5 text-gray-300">
          <Gauge className="h-4 w-4 text-emerald-400" />
          <span className="font-semibold uppercase text-[11px] tracking-wider">
            Nível de Confiança
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`text-[11px] ${feedback.color}`}>{feedback.label}</span>
          <span className="font-mono font-bold text-gray-100 bg-[#1e293b] px-2 py-0.5 rounded">
            {value}%
          </span>
        </div>
      </div>

      <input
        type="range"
        min="0"
        max="100"
        step="5"
        role="slider"
        aria-valuenow={value}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[#1e293b] accent-emerald-500 focus:outline-none"
      />

      <div className="flex justify-between text-[10px] text-gray-500 font-mono">
        <span>0% (Chute)</span>
        <span>50% (Dúvida)</span>
        <span>100% (Certeza)</span>
      </div>
    </div>
  );
};
