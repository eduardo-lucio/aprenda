import { contextBridge, ipcRenderer } from 'electron';
import { ElectronAPI } from '../shared/types';

const api: ElectronAPI = {
  startSession: (mode: 'teaching' | 'practice', goal: string) =>
    ipcRenderer.invoke('session:start', mode, goal),

  submitGoalClarification: (option: string) =>
    ipcRenderer.invoke('session:submit-goal', option),

  submitProbeAnswer: (data: {
    selectedOptionIndex: number;
    confidence: number;
    thinkingText: string;
  }) => ipcRenderer.invoke('session:submit-probe', data),

  advanceToDiagnosis: () =>
    ipcRenderer.invoke('session:advance-diagnosis'),

  startSocraticStep: (nodeId?: string) =>
    ipcRenderer.invoke('session:socratic-start', nodeId),

  submitPrediction: (text: string) =>
    ipcRenderer.invoke('session:submit-prediction', text),

  submitCheckAnswer: (selectedIndex: number) =>
    ipcRenderer.invoke('session:submit-check', selectedIndex),

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

  onThinkingStream: (callback: (payload: { text: string; done?: boolean }) => void) => {
    const handler = (_event: any, payload: { text: string; done?: boolean }) => {
      callback(payload);
    };
    ipcRenderer.on('llm:thinking-stream', handler);
    return () => {
      ipcRenderer.removeListener('llm:thinking-stream', handler);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
