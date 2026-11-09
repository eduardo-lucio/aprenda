import { cleanError } from '../lib/errors';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useI18n } from '../i18n';
import { SpeechStreamEvent } from '../../shared/types';

const STREAM_TIMESLICE_MS = 250;

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

/** Swaps the words still being recognized at the end of a field; anything the student typed before them stays. */
export function applyDictation(current: string, previousInterim: string, next: string): string {
  const base =
    previousInterim && current.endsWith(previousInterim)
      ? current.slice(0, -previousInterim.length).trimEnd()
      : current;
  if (!next) return base;
  return base ? `${base} ${next}` : next;
}

export function useSpeechRecognition(
  onResult?: (text: string) => void,
  onInterim?: (text: string) => void
): UseSpeechRecognitionReturn {
  const { t } = useI18n();
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const onResultRef = useRef(onResult);
  const onInterimRef = useRef(onInterim);
  const interimRef = useRef('');
  const unsubscribeStreamRef = useRef<(() => void) | null>(null);

  // Keep latest onResult callback without restarting recognition
  useEffect(() => {
    onResultRef.current = onResult;
    onInterimRef.current = onInterim;
  }, [onResult, onInterim]);

  const emitInterim = useCallback((text: string) => {
    if (text === interimRef.current) return;
    interimRef.current = text;
    onInterimRef.current?.(text);
  }, []);

  const emitFinal = useCallback((text: string) => {
    interimRef.current = '';
    onResultRef.current?.(text);
  }, []);

  /** Recognition ended with words still on screen: they become part of the text. */
  const commitInterim = useCallback(() => {
    if (interimRef.current) emitFinal(interimRef.current);
  }, [emitFinal]);

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
        let interimChunk = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0].transcript;
          fullTranscript += text;
          if (res.isFinal) {
            finalChunk += text;
          } else {
            interimChunk += text;
          }
        }

        setTranscript(fullTranscript);

        if (finalChunk.trim()) emitFinal(finalChunk.trim());
        emitInterim(interimChunk.trim());
      };

      recognition.onerror = (event: any) => {
        const errCode = event?.error || '';
        if (errCode === 'network' || errCode === 'service-not-allowed') {
          setError(t('voice.err.noNative'));
        } else if (errCode === 'not-allowed' || errCode === 'permission-denied') {
          setError(t('voice.err.denied'));
        } else {
          setError(errCode || t('voice.err.generic'));
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        commitInterim();
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch (err: any) {
      setError(err?.message || t('voice.err.generic'));
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_e) {}
      }
      cleanupMediaStream();
    };
  }, [hasWebSpeech, cleanupMediaStream, emitFinal, emitInterim, commitInterim]);

  // Leaving the screen must not keep the microphone or the live connection open
  useEffect(
    () => () => {
      unsubscribeStreamRef.current?.();
      unsubscribeStreamRef.current = null;
      void window.api?.stopSpeechStream?.();
      cleanupMediaStream();
    },
    [cleanupMediaStream]
  );

  const startDeepgramRecording = useCallback(
    async (language: string) => {
      if (!navigator.mediaDevices?.getUserMedia || typeof (window as any).MediaRecorder === 'undefined') {
        setError(t('voice.err.unsupported'));
        return;
      }

      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        audioChunksRef.current = [];

        // Live transcription; without it the recording is still transcribed when it ends
        let streamId: number | null = null;
        let streamFailed = false;
        let streamHadText = false;
        let streamError: string | null = null;
        let sendQueue: Promise<void> = Promise.resolve();
        const earlyEvents: SpeechStreamEvent[] = [];
        const handleStreamEvent = (event: SpeechStreamEvent) => {
          if (streamId === null) {
            earlyEvents.push(event);
            return;
          }
          if (event.id !== streamId) return;
          if (event.type === 'interim') {
            streamHadText = true;
            emitInterim(event.text);
          } else if (event.type === 'final') {
            if (event.text) {
              streamHadText = true;
              setTranscript(event.text);
              emitFinal(event.text);
            } else {
              emitInterim('');
            }
          } else if (event.type === 'error') {
            streamFailed = true;
            streamError = event.message;
          }
        };
        if (window.api?.startSpeechStream && window.api.onSpeechStreamEvent) {
          unsubscribeStreamRef.current = window.api.onSpeechStreamEvent(handleStreamEvent);
          try {
            streamId = await window.api.startSpeechStream({ language });
            earlyEvents.splice(0).forEach(handleStreamEvent);
          } catch (err) {
            streamFailed = true;
            streamError = cleanError(err, t('voice.err.generic'));
            unsubscribeStreamRef.current?.();
            unsubscribeStreamRef.current = null;
          }
        }
        const streaming = streamId !== null;

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
            if (streaming && !streamFailed) {
              const data = e.data;
              // Keeps the chunks in recording order: the first one holds the container header
              sendQueue = sendQueue.then(async () => {
                window.api?.sendSpeechChunk?.(await data.arrayBuffer());
              });
            }
          }
        };

        recorder.onstop = async () => {
          const actualMime = recorder.mimeType || mimeType;
          const blob = new Blob(audioChunksRef.current, { type: actualMime });
          audioChunksRef.current = [];
          cleanupMediaStream();
          setIsListening(false);

          if (streaming) {
            setIsTranscribing(true);
            try {
              await sendQueue;
              await window.api?.stopSpeechStream?.();
            } catch {
              streamFailed = true;
            } finally {
              setIsTranscribing(false);
              unsubscribeStreamRef.current?.();
              unsubscribeStreamRef.current = null;
            }
            commitInterim();
            if (streamHadText) {
              if (streamFailed) setError(streamError || t('voice.err.generic'));
              return;
            }
            if (!streamFailed) {
              setError(t('voice.err.noSpeech'));
              return;
            }
          }

          if (blob.size === 0) {
            setError(t('voice.err.noAudio'));
            return;
          }

          setIsTranscribing(true);
          try {
            const buffer = await blob.arrayBuffer();
            if (!window.api?.transcribeAudio) throw new Error(t('voice.err.unsupported'));
            const text = await window.api.transcribeAudio({
              audio: buffer,
              mimeType: actualMime,
              language,
            });

            if (text && text.trim()) {
              setTranscript(text.trim());
              if (onResultRef.current) {
                onResultRef.current(text.trim());
              }
              // The text arrived, but only at the end: say why the words did not appear live
              if (streamFailed) setError(t('voice.err.liveFailed', { detail: streamError || t('voice.err.generic') }));
            } else {
              setError(t('voice.err.noSpeech'));
            }
          } catch (err: any) {
            setError(cleanError(err, t('voice.err.generic')));
          } finally {
            setIsTranscribing(false);
          }
        };

        if (streaming) recorder.start(STREAM_TIMESLICE_MS);
        else recorder.start();
        setIsListening(true);
      } catch (err: any) {
        cleanupMediaStream();
        setIsListening(false);
        setError(
          err?.name === 'NotAllowedError'
            ? t('voice.err.denied')
            : t('voice.err.mic', { detail: err?.message || '' })
        );
      }
    },
    [cleanupMediaStream, commitInterim, emitFinal, emitInterim, t]
  );

  const startListening = useCallback(() => {
    const settings = getVoiceSettings();
    const hasDeepgram = Boolean(settings.deepgramValidated || (settings.deepgramApiKey || '').trim());
    const voiceLang = settings.voiceLanguage || 'pt-BR';

    // Prefer Deepgram MediaRecorder flow whenever a Deepgram API key is configured
    if (hasDeepgram) {
      void startDeepgramRecording(voiceLang);
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

    setError(t('voice.err.noKey'));
  }, [startDeepgramRecording, t]);

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
