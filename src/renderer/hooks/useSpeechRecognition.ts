import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  resetTranscript: () => void;
}

export function useSpeechRecognition(onResult?: (text: string) => void): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    Boolean(
      (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition
    );

  useEffect(() => {
    if (!isSupported) return;

    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'pt-BR';

      recognition.onresult = (event: any) => {
        let currentText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentText += event.results[i][0].transcript;
        }
        setTranscript(currentText);
        if (onResult && currentText.trim()) {
          onResult(currentText);
        }
      };

      recognition.onerror = (event: any) => {
        // Silently handle recognition error and fall back to typing
        setError(event.error || 'Erro no reconhecimento de voz');
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch (err: any) {
      setError(err?.message || 'Falha ao inicializar fala');
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_e) {}
      }
    };
  }, [isSupported, onResult]);

  const startListening = useCallback(() => {
    if (!isSupported || !recognitionRef.current) {
      setIsListening((prev) => !prev); // Mock toggle if unsupported
      return;
    }
    setError(null);
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (_e) {
      setIsListening(true);
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_e) {}
    }
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  return {
    isListening,
    isSupported,
    transcript,
    error,
    startListening,
    stopListening,
    toggleListening,
    resetTranscript,
  };
}
