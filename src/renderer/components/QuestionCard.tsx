import React, { useState, useEffect } from 'react';
import { QuestionData } from '../../shared/types';
import { ConfidenceSlider } from './ConfidenceSlider';
import { ThinkingField } from './ThinkingField';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

interface QuestionCardProps {
  question: QuestionData;
  onSubmit: (data: {
    selectedOptionIndex: number;
    confidence: number;
    thinkingText: string;
  }) => void;
  isSubmitting?: boolean;
  questionNumber?: number;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  onSubmit,
  isSubmitting = false,
  questionNumber,
}) => {
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [isDontKnow, setIsDontKnow] = useState(false);
  const [confidence, setConfidence] = useState<number>(50);
  const [thinkingText, setThinkingText] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset all fields whenever a new question is loaded
  useEffect(() => {
    setSelectedOptionIndex(null);
    setIsDontKnow(false);
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

  // Listen to custom event from bottom chat bar if user sends reasoning from there
  useEffect(() => {
    const handleChatSubmit = (e: Event) => {
      const custom = e as CustomEvent<string>;
      const draft = (custom.detail || '').trim();
      if (!draft) return;
      if (selectedOptionIndex === null && !isDontKnow) {
        setThinkingText(draft);
        setValidationError('Selecione uma alternativa acima para enviar seu raciocínio.');
        return;
      }
      setValidationError(null);
      onSubmit({
        selectedOptionIndex: isDontKnow ? -1 : (selectedOptionIndex as number),
        confidence: isDontKnow ? Math.min(confidence, 30) : confidence,
        thinkingText: draft,
      });
    };
    window.addEventListener('chat-bar-submit-thinking', handleChatSubmit);
    return () => window.removeEventListener('chat-bar-submit-thinking', handleChatSubmit);
  }, [selectedOptionIndex, isDontKnow, confidence, onSubmit]);

  const handleSubmit = () => {
    if (selectedOptionIndex === null && !isDontKnow) {
      setValidationError('Selecione uma alternativa ou clique em "Não sei".');
      return;
    }

    if (!isDontKnow && (!thinkingText.trim() || thinkingText.trim().length < 3)) {
      setValidationError(
        'Explique seu raciocínio com pelo menos algumas palavras ou fale pelo microfone antes de enviar.'
      );
      return;
    }

    setValidationError(null);
    onSubmit({
      selectedOptionIndex: isDontKnow ? -1 : (selectedOptionIndex as number),
      confidence: isDontKnow ? Math.min(confidence, 30) : confidence,
      thinkingText: isDontKnow
        ? thinkingText.trim() || 'Não sei responder esta questão / ainda não domino o conceito.'
        : thinkingText.trim(),
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[#282828] bg-[#141414] p-5 shadow-2xl text-gray-200">
      {/* Header: PREDICTION + Anchor Concept */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          PREDICTION {questionNumber ? `#${questionNumber}` : ''}
        </span>
        <span className="font-mono text-[10px] text-gray-500 truncate max-w-[260px]">
          {question.anchorConcept}
        </span>
      </div>

      {/* Question Text */}
      <div className="text-sm font-semibold leading-relaxed text-gray-100">
        {question.questionText}
      </div>

      {/* Options List with Radio Circles */}
      <div className="flex flex-col gap-2">
        {question.options.map((opt, idx) => {
          const isSelected = !isDontKnow && selectedOptionIndex === idx;
          return (
            <div
              key={idx}
              onClick={() => {
                setSelectedOptionIndex(idx);
                setIsDontKnow(false);
                setValidationError(null);
              }}
              className={`flex cursor-pointer items-center space-x-3 rounded-lg border px-4 py-2.5 text-xs transition-all ${
                isSelected
                  ? 'border-emerald-500/80 bg-emerald-950/25 text-white ring-1 ring-emerald-500/30'
                  : 'border-[#282828] bg-[#181818] text-gray-300 hover:border-[#3a3a3a] hover:bg-[#1e1e1e]'
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isSelected
                    ? 'border-emerald-400 bg-emerald-500/20'
                    : 'border-gray-600 bg-transparent'
                }`}
              >
                {isSelected && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
              </span>
              <span className="leading-snug">{opt}</span>
            </div>
          );
        })}

        {/* Dashed Option "Não sei" */}
        <div
          onClick={() => {
            setIsDontKnow(true);
            setSelectedOptionIndex(null);
            setValidationError(null);
            setConfidence(0);
          }}
          className={`flex cursor-pointer items-center space-x-3 rounded-lg border border-dashed px-4 py-2.5 text-xs transition-all ${
            isDontKnow
              ? 'border-amber-500/80 bg-amber-950/20 text-amber-200'
              : 'border-[#2a2a2a] bg-transparent text-gray-400 hover:border-gray-600 hover:bg-[#181818]/50'
          }`}
        >
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
              isDontKnow ? 'border-amber-400 bg-amber-500/20' : 'border-gray-600 bg-transparent'
            }`}
          >
            {isDontKnow && <span className="h-2 w-2 rounded-full bg-amber-400" />}
          </span>
          <span className="font-mono text-[11px] leading-snug">
            Não sei / Ainda não domino este conceito
          </span>
        </div>
      </div>

      {/* Confidence Slider */}
      <ConfidenceSlider value={confidence} onChange={setConfidence} />

      {/* Thinking Field (with inline Submit button) */}
      <ThinkingField
        value={thinkingText}
        onChange={(val) => {
          setThinkingText(val);
          if (validationError) setValidationError(null);
        }}
        isRecording={isListening}
        isTranscribing={isTranscribing}
        isSubmitting={isSubmitting}
        onToggleRecording={toggleListening}
        onSubmitHotkey={handleSubmit}
        errorMessage={validationError || speechError}
      />
    </div>
  );
};
