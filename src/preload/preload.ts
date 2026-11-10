import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI, ProbeAnswerKind } from '../shared/types';

const api: ElectronAPI = {
  startSession: (mode: 'teaching' | 'practice', goal: string) =>
    ipcRenderer.invoke('session:start', mode, goal),

  submitGoalClarification: (option: string, thinkingText?: string) =>
    ipcRenderer.invoke('session:submit-goal', option, thinkingText),

  requestOrientation: (thinkingText?: string) =>
    ipcRenderer.invoke('session:request-orientation', thinkingText),

  submitProbeAnswer: (data: {
    selectedOptionIndex: number;
    answerKind?: ProbeAnswerKind;
    confidence?: number;
    thinkingText: string;
  }) => ipcRenderer.invoke('session:submit-probe', data),

  advanceToPlan: () =>
    ipcRenderer.invoke('session:advance-plan'),

  confirmPlan: () =>
    ipcRenderer.invoke('session:confirm-plan'),

  startSocraticStep: (nodeId?: string) =>
    ipcRenderer.invoke('session:socratic-start', nodeId),

  submitPrediction: (text: string) =>
    ipcRenderer.invoke('session:submit-prediction', text),

  submitCheckAnswer: (selectedIndex: number, confidence?: number, thinkingText?: string, readingThoughts?: string) =>
    ipcRenderer.invoke('session:submit-check', selectedIndex, confidence, thinkingText, readingThoughts),

  startPractice: (params) => ipcRenderer.invoke('practice:start', params),
  practiceNext: () => ipcRenderer.invoke('practice:next'),
  practiceSubmit: (kind, text) => ipcRenderer.invoke('practice:submit', kind, text),
  practiceConclude: (reason) => ipcRenderer.invoke('practice:conclude', reason),
  practiceAsk: (text) => ipcRenderer.invoke('practice:ask', text),
  practiceClose: () => ipcRenderer.invoke('practice:close'),

  cancelOperation: () => ipcRenderer.invoke('session:cancel'),

  getStorageStatus: () => ipcRenderer.invoke('app:storage-status'),

  migrateSecrets: (legacy) => ipcRenderer.invoke('secrets:migrate', legacy),

  deleteProviderKey: (id: string) => ipcRenderer.invoke('secrets:delete-provider', id),

  deleteDeepgramKey: () => ipcRenderer.invoke('secrets:delete-deepgram'),

  onStorageError: (callback: (error: string | null) => void) => {
    const handler = (_event: any, error: string | null) => callback(error);
    ipcRenderer.on('app:storage-error', handler);
    return () => {
      ipcRenderer.removeListener('app:storage-error', handler);
    };
  },

  listSessions: () => ipcRenderer.invoke('session:list'),

  loadSession: (id: string) => ipcRenderer.invoke('session:load', id),

  deleteSession: (id: string) => ipcRenderer.invoke('session:delete', id),
  renameSession: (id: string, title: string) => ipcRenderer.invoke('session:rename', id, title),
  pinSession: (id: string, pinned: boolean) => ipcRenderer.invoke('session:pin', id, pinned),
  resumeLesson: (nodeId: string, checkQuestion: unknown, progress?: unknown) =>
    ipcRenderer.invoke('session:resume-lesson', nodeId, checkQuestion, progress),
  continueLesson: () => ipcRenderer.invoke('session:continue-lesson'),

  saveSessionUi: (id: string, ui: any) => ipcRenderer.invoke('session:save-ui', id, ui),

  generateConceptNotes: (sessionId: string, nodeIds: string[]) =>
    ipcRenderer.invoke('notes:generate', sessionId, nodeIds),

  getGraphState: () =>
    ipcRenderer.invoke('graph:get'),

  getSession: () =>
    ipcRenderer.invoke('session:get'),

  windowAction: (action: 'minimize' | 'maximize' | 'close') =>
    ipcRenderer.send('window:action', action),

  validateProvider: (params: { providerId: string; apiKey: string; baseUrl?: string }) =>
    ipcRenderer.invoke('provider:validate-and-fetch', params),

  updateSettings: (settings: any) =>
    ipcRenderer.invoke('settings:update', settings),

  validateDeepgramKey: (apiKey: string) =>
    ipcRenderer.invoke('speech:validate-key', apiKey),

  transcribeAudio: (params: { audio: ArrayBuffer; mimeType: string; language?: string }) =>
    ipcRenderer.invoke('speech:transcribe', params),

  startSpeechStream: (params: { language?: string }) =>
    ipcRenderer.invoke('speech:stream-start', params),

  sendSpeechChunk: (chunk: ArrayBuffer) => ipcRenderer.send('speech:stream-chunk', chunk),

  stopSpeechStream: () => ipcRenderer.invoke('speech:stream-stop'),

  onSpeechStreamEvent: (callback: (event: any) => void) => {
    const handler = (_event: any, payload: any) => callback(payload);
    ipcRenderer.on('speech:stream-event', handler);
    return () => {
      ipcRenderer.removeListener('speech:stream-event', handler);
    };
  },

  onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
    const handler = (_event: any, isMaximized: boolean) => callback(isMaximized);
    ipcRenderer.on('window:maximized-change', handler);
    return () => {
      ipcRenderer.removeListener('window:maximized-change', handler);
    };
  },

  onThinkingStream: (callback: (payload: { text: string; done?: boolean }) => void) => {
    const handler = (_event: any, payload: { text: string; done?: boolean }) => {
      callback(payload);
    };
    ipcRenderer.on('llm:thinking-stream', handler);
    return () => {
      ipcRenderer.removeListener('llm:thinking-stream', handler);
    };
  },

  onTokensUpdate: (callback: (payload: { tokensUsed: number }) => void) => {
    const handler = (_event: any, payload: { tokensUsed: number }) => {
      callback(payload);
    };
    ipcRenderer.on('session:tokens-update', handler);
    return () => {
      ipcRenderer.removeListener('session:tokens-update', handler);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
