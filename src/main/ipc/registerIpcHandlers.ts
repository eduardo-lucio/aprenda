import { BrowserWindow, IpcMain } from 'electron';
import { SessionStateMachine } from '../fsm/SessionStateMachine';
import { KnowledgeStore } from '../knowledge/KnowledgeStore';
import { SocraticEngine } from '../socratic/SocraticEngine';
import { CheckQuestionData, ConceptNode, SettingsUpdatePayload } from '../../shared/types';
import { validateAndFetchModels } from '../services/providerValidationService';
import { resolveChatBaseUrl, updateDefaultLLMConfig } from '../services/llmClient';
import { transcribeWithDeepgram, validateDeepgramKey } from '../services/speechService';

export interface IpcDependencies {
  fsm: SessionStateMachine;
  store: KnowledgeStore;
  socratic: SocraticEngine;
  getMainWindow?: () => BrowserWindow | null;
}

export function registerIpcHandlers(ipcMain: IpcMain, deps: IpcDependencies): void {
  const { fsm, store, socratic, getMainWindow } = deps;
  fsm.setSocraticEngine(socratic);
  let currentSocraticNode: ConceptNode | undefined;
  let currentCheckData: CheckQuestionData | undefined;
  const speechConfig = { deepgramApiKey: '', voiceLanguage: 'pt-BR' };

  ipcMain.handle('session:start', async (_event, mode: 'teaching' | 'practice', goal: string) => {
    currentSocraticNode = undefined;
    currentCheckData = undefined;
    return await fsm.startSession(mode, goal);
  });

  ipcMain.handle('session:submit-goal', async (_event, option: string) => {
    return await fsm.submitGoalClarification(option);
  });

  ipcMain.handle(
    'session:submit-probe',
    async (
      _event,
      data: { selectedOptionIndex: number; confidence: number; thinkingText: string }
    ) => {
      const result = await fsm.submitProbeAnswer(data);
      return { ...result, session: fsm.getState() };
    }
  );

  ipcMain.handle('session:advance-diagnosis', async () => {
    fsm.forceAdvanceToDiagnosis();
    return fsm.getState();
  });

  ipcMain.handle('session:socratic-start', async (_event, nodeId?: string) => {
    const state = fsm.getState();
    let targetNode: ConceptNode | undefined = nodeId ? store.getNodeById(nodeId) : undefined;

    if (!targetNode) {
      const priority: ConceptNode['status'][] = ['false_positive', 'blind_spot', 'frontier'];
      const nodes = store.getStrand();
      for (const status of priority) {
        targetNode = nodes.find((n) => state.nodesState[n.id] === status);
        if (targetNode) break;
      }
      targetNode = targetNode || nodes[0];
    }

    if (!targetNode) {
      throw new Error('Ainda não há grafo de conceitos para esta sessão.');
    }

    currentSocraticNode = targetNode;
    currentCheckData = undefined;
    const predictData = await socratic.generatePredictStep(targetNode, state.goal);
    return { node: targetNode, ...predictData };
  });

  ipcMain.handle('session:submit-prediction', async (_event, text: string) => {
    if (!currentSocraticNode) {
      throw new Error('Nenhum conceito ativo no ciclo socrático.');
    }
    const teachResult = await socratic.submitPrediction(text);
    const checkQuestion =
      teachResult.checkQuestion || (await socratic.generateCheckQuestion(currentSocraticNode));
    currentCheckData = checkQuestion;

    return { teachProse: teachResult.teachProse, checkQuestion };
  });

  ipcMain.handle('session:submit-check', async (_event, selectedIndex: number) => {
    if (!currentCheckData) {
      throw new Error('No active check question');
    }

    const evalResult = socratic.evaluateCheck(selectedIndex, currentCheckData);
    if (currentSocraticNode && evalResult.isPassed) {
      fsm.markNodeStatus(currentSocraticNode.id, 'mastered');
    }

    return { ...evalResult, session: fsm.getState() };
  });

  ipcMain.handle('graph:get', async () => {
    const nodes = store.getNodes();
    if (!fsm.hasSession()) return nodes;
    const state = fsm.getState();
    return nodes.map((n) => ({ ...n, status: state.nodesState[n.id] || n.status }));
  });

  ipcMain.handle('session:get', async () => {
    return fsm.hasSession() ? fsm.getState() : null;
  });

  ipcMain.handle(
    'provider:validate-and-fetch',
    async (_event, params: { providerId: string; apiKey: string; baseUrl?: string }) => {
      return await validateAndFetchModels(params);
    }
  );

  ipcMain.handle('settings:update', async (_event, payload: SettingsUpdatePayload) => {
    if (payload.providerId !== undefined || payload.baseUrl !== undefined) {
      updateDefaultLLMConfig({
        baseURL: resolveChatBaseUrl(payload.providerId, payload.baseUrl),
      });
    }
    if (payload.apiKey !== undefined) {
      updateDefaultLLMConfig({ apiKey: payload.apiKey || (payload.providerId === 'ollama' ? 'ollama' : '') });
    }
    if (payload.model !== undefined) {
      updateDefaultLLMConfig({ model: payload.model });
    }
    if (payload.effortLevel !== undefined) {
      updateDefaultLLMConfig({ effortLevel: payload.effortLevel as any });
    }
    if (payload.deepgramApiKey !== undefined) speechConfig.deepgramApiKey = payload.deepgramApiKey;
    if (payload.voiceLanguage) speechConfig.voiceLanguage = payload.voiceLanguage;
    return { success: true };
  });

  ipcMain.handle('speech:validate-key', async (_event, apiKey: string) => {
    return await validateDeepgramKey(apiKey);
  });

  ipcMain.handle(
    'speech:transcribe',
    async (_event, params: { audio: ArrayBuffer | Uint8Array; mimeType: string; language?: string }) => {
      return await transcribeWithDeepgram({
        apiKey: speechConfig.deepgramApiKey,
        audio: params.audio,
        mimeType: params.mimeType,
        language: params.language || speechConfig.voiceLanguage,
      });
    }
  );

  ipcMain.on('window:action', (_event, action: 'minimize' | 'maximize' | 'close') => {
    const win = getMainWindow ? getMainWindow() : BrowserWindow.getFocusedWindow();
    if (!win) return;
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    } else if (action === 'close') win.close();
  });
}
