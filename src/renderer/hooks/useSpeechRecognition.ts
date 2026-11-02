import { useState, useEffect, useRef, useCallback } from 'react';
import { transcribeWithDeepgram } from '../../main/services/speechService';

export interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isTranscribing: boolean;
  isSupported: boolean;
  transcript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  resetTranscript: () => void;
}

interface StoredVoiceSettings {
  deepgramApiKey?: string;
  deepgramValidated?: boolean;
  voiceLanguage?: string;
}

function getVoiceSettings(): StoredVoiceSettings {
  try {
    const raw = localStorage.getItem('aprenda_settings');
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  return {};
}

function pickMimeType(): string {
  const MR: any = typeof window !== 'undefined' ? (window as any).MediaRecorder : undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  if (MR?.isTypeSupported) {
    for (const c of candidates) {
      if (MR.isTypeSupported(c)) return c;
    }
  }
  return 'audio/webm';
}

export function useSpeechRecognition(onResult?: (text: string) => void): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const onResultRef = useRef(onResult);

  // Keep latest onResult callback without restarting recognition
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const hasWebSpeech =
    typeof window !== 'undefined' &&
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const hasMediaDevices =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  const isSupported = hasWebSpeech || hasMediaDevices;

  const cleanupMediaStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!hasWebSpeech) return;

    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      const settings = getVoiceSettings();
      recognition.lang = settings.voiceLanguage || 'pt-BR';

      recognition.onresult = (event: any) => {
        let finalChunk = '';
        let fullTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0].transcript;
          fullTranscript += text;
          if (res.isFinal) {
            finalChunk += text;
          }
        }

        setTranscript(fullTranscript);

        if (finalChunk.trim() && onResultRef.current) {
          onResultRef.current(finalChunk.trim());
        }
      };

      recognition.onerror = (event: any) => {
        const errCode = event?.error || '';
        if (errCode === 'network' || errCode === 'service-not-allowed') {
          setError(
            'Reconhecimento nativo indisponível no Electron. Configure sua chave de API do Deepgram em Configurações → Providers para gravar voz.'
          );
        } else if (errCode === 'not-allowed' || errCode === 'permission-denied') {
          setError('Permissão de microfone negada. Verifique as permissões de áudio do sistema.');
        } else {
          setError(errCode || 'Erro no reconhecimento de voz');
        }
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
      cleanupMediaStream();
    };
  }, [hasWebSpeech, cleanupMediaStream]);

  const startDeepgramRecording = useCallback(
    async (apiKey: string, language: string) => {
      if (!navigator.mediaDevices?.getUserMedia || typeof (window as any).MediaRecorder === 'undefined') {
        setError('Captura de microfone não suportada neste ambiente.');
        return;
      }

      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        audioChunksRef.current = [];

        const mimeType = pickMimeType();
        let recorder: MediaRecorder;
        try {
          recorder = new MediaRecorder(stream, { mimeType });
        } catch {
          recorder = new MediaRecorder(stream);
        }
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e: BlobEvent) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = async () => {
          const actualMime = recorder.mimeType || mimeType;
          const blob = new Blob(audioChunksRef.current, { type: actualMime });
          audioChunksRef.current = [];
          cleanupMediaStream();
          setIsListening(false);

          if (blob.size === 0) {
            setError('Nenhum áudio capturado pelo microfone.');
            return;
          }

          setIsTranscribing(true);
          try {
            const buffer = await blob.arrayBuffer();
            let text = '';
            if (window.api?.transcribeAudio) {
              text = await window.api.transcribeAudio({
                audio: buffer,
                mimeType: actualMime,
                language,
              });
            } else {
              text = await transcribeWithDeepgram({
                apiKey,
                audio: buffer,
                mimeType: actualMime,
                language,
              });
            }

            if (text && text.trim()) {
              setTranscript(text.trim());
              if (onResultRef.current) {
                onResultRef.current(text.trim());
              }
            } else {
              setError('Nenhuma fala detectada no áudio gravado. Tente falar mais próximo ao microfone.');
            }
          } catch (err: any) {
            const cleanMsg = String(err?.message || err || 'Erro ao transcrever com Deepgram').replace(
              /^Error invoking remote method '[^']+': (Error: )?/,
              ''
            );
            setError(cleanMsg);
          } finally {
            setIsTranscribing(false);
          }
        };

        recorder.start();
        setIsListening(true);
      } catch (err: any) {
        cleanupMediaStream();
        setIsListening(false);
        setError(
          err?.name === 'NotAllowedError'
            ? 'Permissão de microfone negada.'
            : `Não foi possível acessar o microfone: ${err?.message || 'erro de dispositivo'}`
        );
      }
    },
    [cleanupMediaStream]
  );

  const startListening = useCallback(() => {
    const settings = getVoiceSettings();
    const deepgramKey = (settings.deepgramApiKey || '').trim();
    const voiceLang = settings.voiceLanguage || 'pt-BR';

    // Prefer Deepgram MediaRecorder flow whenever a Deepgram API key is configured
    if (deepgramKey) {
      void startDeepgramRecording(deepgramKey, voiceLang);
      return;
    }

    if (recognitionRef.current) {
      setError(null);
      try {
        recognitionRef.current.lang = voiceLang;
        recognitionRef.current.start();
        setIsListening(true);
      } catch (_e) {
        setIsListening(true);
      }
      return;
    }

    setError(
      'Para gravar sua explicação por voz, adicione sua chave de API do Deepgram em Configurações → Providers.'
    );
  }, [startDeepgramRecording]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch (_e) {
        cleanupMediaStream();
        setIsListening(false);
      }
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_e) {}
    }
    setIsListening(false);
  }, [cleanupMediaStream]);

  const toggleListening = useCallback(() => {
    if (isTranscribing) return;
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, isTranscribing, startListening, stopListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  return {
    isListening,
    isTranscribing,
    isSupported,
    transcript,
    error,
    startListening,
    stopListening,
    toggleListening,
    resetTranscript,
  };
}
