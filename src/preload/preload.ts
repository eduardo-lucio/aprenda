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

  submitCheckAnswer: (selectedIndex: number, confidence?: number, thinkingText?: string) =>
    ipcRenderer.invoke('session:submit-check', selectedIndex, confidence, thinkingText),

  cancelOperation: () => ipcRenderer.invoke('session:cancel'),

  listSessions: () => ipcRenderer.invoke('session:list'),

  loadSession: (id: string) => ipcRenderer.invoke('session:load', id),

  deleteSession: (id: string) => ipcRenderer.invoke('session:delete', id),

  saveSessionUi: (id: string, ui: any) => ipcRenderer.invoke('session:save-ui', id, ui),

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
