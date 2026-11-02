import React, { useState, useEffect } from 'react';
import { QuestionData } from '../../shared/types';
import { ConfidenceSlider } from './ConfidenceSlider';
import { ThinkingField } from './ThinkingField';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { Send, HelpCircle } from 'lucide-react';

interface QuestionCardProps {
  question: QuestionData;
  onSubmit: (data: {
    selectedOptionIndex: number;
    confidence: number;
    thinkingText: string;
  }) => void;
  isSubmitting?: boolean;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  onSubmit,
  isSubmitting = false,
}) => {
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [customAnswer, setCustomAnswer] = useState('');
  const [isCustomOption, setIsCustomOption] = useState(false);
  const [confidence, setConfidence] = useState<number>(50);
  const [thinkingText, setThinkingText] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset all fields whenever a new question is loaded
  useEffect(() => {
    setSelectedOptionIndex(null);
    setCustomAnswer('');
    setIsCustomOption(false);
    setConfidence(50);
    setThinkingText('');
    setValidationError(null);
  }, [question.id]);

  const { isListening, isTranscribing, error: speechError, toggleListening } = useSpeechRecognition((voiceText) => {
    setThinkingText((prev) => (prev ? `${prev} ${voiceText}` : voiceText));
    setValidationError(null);
  });

  // Connect global dictate toggle (e.g. from Status Bar)
  useEffect(() => {
    const handleGlobalDictate = () => {
      toggleListening();
    };
    window.addEventListener('toggle-dictate', handleGlobalDictate);
    return () => window.removeEventListener('toggle-dictate', handleGlobalDictate);
  }, [toggleListening]);

  const handleSubmit = () => {
    if (selectedOptionIndex === null && !isCustomOption) {
      setValidationError('Selecione uma alternativa ou escolha "Outro".');
      return;
    }

    if (isCustomOption && !customAnswer.trim()) {
      setValidationError('Digite sua resposta personalizada antes de enviar.');
      return;
    }

    if (!thinkingText.trim() || thinkingText.trim().length < 3) {
      setValidationError(
        'Explique seu raciocínio com pelo menos algumas palavras ou fale pelo microfone antes de enviar.'
      );
      return;
    }

    setValidationError(null);
    onSubmit({
      selectedOptionIndex: isCustomOption ? 99 : (selectedOptionIndex as number),
      confidence,
      thinkingText: thinkingText.trim(),
    });
  };

  const optionLetters = ['A', 'B', 'C', 'D'];

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[#1e293b] bg-[#111111] p-5 shadow-xl text-gray-200">
      {/* Header / Question Concept */}
      <div className="flex items-center justify-between border-b border-[#1e293b]/70 pb-3">
        <div className="flex items-center space-x-2">
          <HelpCircle className="h-4 w-4 text-emerald-400" />
          <span className="font-semibold text-xs tracking-wider uppercase text-emerald-400">
            {question.anchorConcept}
          </span>
        </div>
        <span className="rounded bg-[#1e293b] px-2 py-0.5 text-[10px] font-mono text-gray-400">
          Nível {question.difficulty || 2}/5
        </span>
      </div>

      {/* Question Text */}
      <div className="text-sm font-medium leading-relaxed text-gray-100 font-serif">
        {question.questionText}
      </div>

      {/* Options List */}
      <div className="flex flex-col gap-2">
        {question.options.map((opt, idx) => {
          const isSelected = !isCustomOption && selectedOptionIndex === idx;
          return (
            <div
              key={idx}
              onClick={() => {
                setSelectedOptionIndex(idx);
                setIsCustomOption(false);
                setValidationError(null);
              }}
              className={`flex cursor-pointer items-start space-x-3 rounded-md border p-3 text-xs transition-all ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-950/20 text-white shadow-sm ring-1 ring-emerald-500/40'
                  : 'border-[#1e293b] bg-[#0a0a0a]/60 text-gray-300 hover:border-gray-600 hover:bg-[#141414]'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[11px] font-bold ${
                  isSelected ? 'bg-emerald-500 text-black' : 'bg-[#1e293b] text-gray-400'
                }`}
              >
                {optionLetters[idx] || idx + 1}
              </span>
              <span className="leading-snug">{opt}</span>
            </div>
          );
        })}

        {/* Custom Option */}
        <div
          onClick={() => {
            setIsCustomOption(true);
            setSelectedOptionIndex(null);
            setValidationError(null);
          }}
          className={`flex cursor-pointer flex-col space-y-2 rounded-md border p-3 text-xs transition-all ${
            isCustomOption
              ? 'border-emerald-500 bg-emerald-950/20 text-white shadow-sm ring-1 ring-emerald-500/40'
              : 'border-[#1e293b] bg-[#0a0a0a]/60 text-gray-400 hover:border-gray-600'
          }`}
        >
          <div className="flex items-center space-x-3">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[11px] font-bold ${
                isCustomOption ? 'bg-emerald-500 text-black' : 'bg-[#1e293b] text-gray-400'
              }`}
            >
              *
            </span>
            <span>Outro / Escreva sua própria resposta...</span>
          </div>

          {isCustomOption && (
            <input
              type="text"
              value={customAnswer}
              onChange={(e) => setCustomAnswer(e.target.value)}
              placeholder="Digite sua resposta personalizada..."
              className="mt-1 w-full rounded border border-[#1e293b] bg-[#111111] p-2 text-xs text-gray-200 outline-none focus:border-emerald-500"
              autoFocus
            />
          )}
        </div>
      </div>

      {/* Confidence Slider */}
      <ConfidenceSlider value={confidence} onChange={setConfidence} />

      {/* Thinking Field */}
      <ThinkingField
        value={thinkingText}
        onChange={(val) => {
          setThinkingText(val);
          if (validationError) setValidationError(null);
        }}
        isRecording={isListening}
        isTranscribing={isTranscribing}
        onToggleRecording={toggleListening}
        onSubmitHotkey={handleSubmit}
        errorMessage={validationError || speechError}
      />

      {/* Submit Button */}
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex items-center space-x-2 rounded-md bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-md hover:bg-emerald-500 transition-colors disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          <span>{isSubmitting ? 'Avaliando Raciocínio...' : 'Enviar Resposta'}</span>
        </button>
      </div>
    </div>
  );
};
