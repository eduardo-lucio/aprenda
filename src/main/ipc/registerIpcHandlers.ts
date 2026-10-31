import { BrowserWindow, IpcMain } from 'electron';
import { SessionStateMachine } from '../fsm/SessionStateMachine';
import { KnowledgeStore } from '../knowledge/KnowledgeStore';
import { SocraticEngine } from '../socratic/SocraticEngine';
import { CheckQuestionData, ConceptNode, SettingsUpdatePayload } from '../../shared/types';
import { validateAndFetchModels } from '../services/providerValidationService';
import { updateDefaultLLMConfig } from '../services/llmClient';

export interface IpcDependencies {
  fsm: SessionStateMachine;
  store: KnowledgeStore;
  socratic: SocraticEngine;
  getMainWindow?: () => BrowserWindow | null;
}

export function registerIpcHandlers(ipcMain: IpcMain, deps: IpcDependencies): void {
  const { fsm, store, socratic, getMainWindow } = deps;
  let currentSocraticNode: ConceptNode | undefined;
  let currentCheckData: CheckQuestionData | undefined;

  ipcMain.handle('session:start', async (_event, mode: 'teaching' | 'practice', goal: string) => {
    fsm.startSession(mode, goal);
    return fsm.getState();
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
      return {
        ...result,
        session: fsm.getState(),
      };
    }
  );

  ipcMain.handle('session:advance-diagnosis', async () => {
    fsm.forceAdvanceToDiagnosis();
    return fsm.getState();
  });

  ipcMain.handle('session:socratic-start', async (_event, nodeId?: string) => {
    const state = fsm.getState();
    let targetNode: ConceptNode | undefined;

    if (nodeId) {
      targetNode = store.getNodeById(nodeId);
    }

    if (!targetNode) {
      // Find yellow (false_positive) or blue (frontier) or red (blind_spot)
      const targetId = Object.keys(state.nodesState).find(
        (id) =>
          state.nodesState[id] === 'false_positive' ||
          state.nodesState[id] === 'frontier' ||
          state.nodesState[id] === 'blind_spot'
      );
      targetNode = targetId ? store.getNodeById(targetId) : store.getNodes()[0];
    }

    currentSocraticNode = targetNode;
    const predictData = await socratic.generatePredictStep(targetNode!);
    return {
      node: targetNode,
      ...predictData,
    };
  });

  ipcMain.handle('session:submit-prediction', async (_event, text: string) => {
    if (!currentSocraticNode) {
      currentSocraticNode = store.getNodes()[0];
    }
    const teachResult = await socratic.submitPrediction(text);
    const checkQuestion =
      teachResult.checkQuestion || (await socratic.generateCheckQuestion(currentSocraticNode));
    currentCheckData = checkQuestion;

    return {
      teachProse: teachResult.teachProse,
      checkQuestion,
    };
  });

  ipcMain.handle('session:submit-check', async (_event, selectedIndex: number) => {
    if (!currentCheckData) {
      throw new Error('No active check question');
    }

    const evalResult = socratic.evaluateCheck(selectedIndex, currentCheckData);
    const state = fsm.getState();

    if (currentSocraticNode) {
      if (evalResult.isPassed) {
        state.nodesState[currentSocraticNode.id] = 'mastered';
      }
    }

    return {
      ...evalResult,
      session: fsm.getState(),
    };
  });

  ipcMain.handle('graph:get', async () => {
    const nodes = store.getNodes();
    let state = null;
    try {
      state = fsm.getState();
    } catch (_err) {
      // session not started yet
    }

    if (state && state.nodesState) {
      return nodes.map((n) => ({
        ...n,
        status: state.nodesState[n.id] || n.status,
      }));
    }

    return nodes;
  });

  ipcMain.handle('session:get', async () => {
    try {
      return fsm.getState();
    } catch (_err) {
      return null;
    }
  });

  ipcMain.handle(
    'provider:validate-and-fetch',
    async (
      _event,
      params: { providerId: string; apiKey: string; baseUrl?: string }
    ) => {
      return await validateAndFetchModels(params);
    }
  );

  ipcMain.handle('settings:update', async (_event, payload: SettingsUpdatePayload) => {
    const configUpdate: any = {};
    if (payload.baseUrl) configUpdate.baseURL = payload.baseUrl;
    if (payload.apiKey) configUpdate.apiKey = payload.apiKey;
    if (payload.model) configUpdate.model = payload.model;
    updateDefaultLLMConfig(configUpdate);
    return { success: true };
  });

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
