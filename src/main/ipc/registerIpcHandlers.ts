import { BrowserWindow, IpcMain } from 'electron';
import { SessionChangedError, SessionStateMachine } from '../fsm/SessionStateMachine';
import { KnowledgeStore } from '../knowledge/KnowledgeStore';
import { SocraticEngine } from '../socratic/SocraticEngine';
import {
  CheckQuestionData,
  ConceptNode,
  LessonProgress,
  PersistedUi,
  PlanRevision,
  PracticeTarget,
  ProbeAnswerKind,
  SettingsUpdatePayload,
} from '../../shared/types';
import { validateAndFetchModels } from '../services/providerValidationService';
import {
  localize,
  resetLLMConnectionToEnv,
  resolveChatBaseUrl,
  setGlobalThinkingStreamListener,
  updateDefaultLLMConfig,
  addGlobalTokenListener,
  cancelForegroundLLM,
  setResponseLanguage,
} from '../services/llmClient';
import { ConceptNotesGenerator } from '../services/ConceptNotesGenerator';
import { SessionRepository } from '../persistence/SessionRepository';
import { LearnerMemory } from '../persistence/LearnerMemory';
import { DEEPGRAM_SECRET, providerSecret, SecretStore } from '../persistence/SecretStore';
import { DeepgramStream, openDeepgramStream, transcribeWithDeepgram, validateDeepgramKey } from '../services/speechService';

export interface IpcDependencies {
  fsm: SessionStateMachine;
  store: KnowledgeStore;
  socratic: SocraticEngine;
  getMainWindow?: () => BrowserWindow | null;
  repository?: SessionRepository;
  memory?: LearnerMemory;
  secrets?: SecretStore;
  notesGenerator?: ConceptNotesGenerator;
}

export function registerIpcHandlers(ipcMain: IpcMain, deps: IpcDependencies): void {
  const { fsm, store, socratic, getMainWindow, repository, secrets } = deps;
  const notesGenerator = deps.notesGenerator ?? new ConceptNotesGenerator();
  fsm.setSocraticEngine(socratic);
  const memory = deps.memory;
  fsm.setMemory(memory);
  if (repository) {
    fsm.setPersistence((snap) => repository.saveSnapshot(snap));
    repository.setWriteListener((error) => {
      const win = getMainWindow ? getMainWindow() : null;
      if (win && !win.isDestroyed()) win.webContents.send('app:storage-error', error);
    });
  }

  setGlobalThinkingStreamListener((payload) => {
    const win = getMainWindow ? getMainWindow() : BrowserWindow.getFocusedWindow();
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.send('llm:thinking-stream', payload);
    }
  });

  addGlobalTokenListener(() => {
    const win = getMainWindow ? getMainWindow() : BrowserWindow.getFocusedWindow();
    if (win && !win.isDestroyed() && win.webContents) {
      const currentTokens = fsm.hasSession() ? fsm.getTokensUsed() : 0;
      win.webContents.send('session:tokens-update', { tokensUsed: currentTokens });
    }
  });
  let currentSocraticNode: ConceptNode | undefined;
  let currentCheckData: CheckQuestionData | undefined;
  const speechConfig = { deepgramApiKey: '', voiceLanguage: 'pt-BR' };
  let speechStream: DeepgramStream | null = null;
  let speechStreamSeq = 0;

  // Foreground AI calls in flight: sessions cannot be swapped underneath them
  let foregroundOps = 0;
  const foreground = async <T>(fn: () => Promise<T>): Promise<T> => {
    foregroundOps++;
    try {
      return await fn();
    } finally {
      foregroundOps--;
    }
  };
  const refuseWhileBusy = (): void => {
    if (foregroundOps > 0) {
      throw new Error(
        localize(
          'Aguarde a resposta da IA terminar antes de trocar de sessão.',
          'Please wait for the AI to finish before switching sessions.'
        )
      );
    }
  };
  const forgetLesson = (): void => {
    currentSocraticNode = undefined;
    currentCheckData = undefined;
    socratic.reset();
  };

  ipcMain.handle('session:start', async (_event, mode: 'teaching' | 'practice', goal: string) => {
    refuseWhileBusy();
    forgetLesson();
    return foreground(() => fsm.startSession(mode, goal));
  });

  ipcMain.handle(
    'practice:start',
    async (_event, params: { material: string; targets?: PracticeTarget[]; sourceSessionId?: string }) => {
      refuseWhileBusy();
      forgetLesson();
      return fsm.startPractice(params || { material: '' });
    }
  );
  ipcMain.handle('practice:next', async () => foreground(() => fsm.practiceNext()));
  ipcMain.handle('practice:submit', async (_event, kind: 'work' | 'claim', text: string) =>
    foreground(() => fsm.practiceSubmit(kind === 'claim' ? 'claim' : 'work', String(text ?? '')))
  );
  ipcMain.handle('practice:conclude', async (_event, reason: 'surrendered' | 'dismissed') => fsm.practiceConclude(reason));
  ipcMain.handle('practice:ask', async (_event, text: string) => foreground(() => fsm.practiceAsk(String(text ?? ''))));
  ipcMain.handle('practice:close', async () => fsm.practiceClose());

  ipcMain.handle('session:cancel', async () => {
    cancelForegroundLLM();
  });

  ipcMain.handle('app:storage-status', async () => ({
    corruptBackup: repository?.getCorruptBackup(),
    secretsProtected: secrets ? secrets.isProtected() : true,
  }));

  // Keys only travel renderer → main: there is deliberately no channel to read one back
  ipcMain.handle(
    'secrets:migrate',
    async (_event, legacy: { providers?: Array<{ id: string; apiKey?: string }>; deepgramApiKey?: string }) => {
      for (const p of legacy.providers || []) {
        if (p.apiKey) secrets?.set(providerSecret(p.id), p.apiKey);
      }
      if (legacy.deepgramApiKey) secrets?.set(DEEPGRAM_SECRET, legacy.deepgramApiKey);
    }
  );

  ipcMain.handle('secrets:delete-provider', async (_event, id: string) => {
    secrets?.delete(providerSecret(id));
  });

  ipcMain.handle('secrets:delete-deepgram', async () => {
    secrets?.delete(DEEPGRAM_SECRET);
    speechConfig.deepgramApiKey = '';
  });

  ipcMain.handle('memory:list', async () => memory?.list() ?? []);
  ipcMain.handle('memory:delete', async (_event, ids: string[]) => {
    memory?.delete(Array.isArray(ids) ? ids.map(String) : []);
    return memory?.list() ?? [];
  });
  ipcMain.handle('memory:clear', async () => {
    memory?.clear();
    return [];
  });

  ipcMain.handle('session:list', async () => (repository ? repository.list() : []));

  ipcMain.handle('session:load', async (_event, id: string) => {
    refuseWhileBusy();
    const rec = repository?.get(id);
    if (!rec) throw new Error(localize('Sessão salva não encontrada.', 'Saved session not found.'));
    // Already active (e.g. back from "+ New session"): its live state is newer than the snapshot
    if (fsm.getActiveSessionId() !== id) {
      fsm.restoreSnapshot(rec.snapshot);
      forgetLesson();
    }
    return { session: fsm.getState(), ui: rec.ui };
  });

  ipcMain.handle('session:delete', async (_event, id: string) => {
    refuseWhileBusy();
    if (fsm.getActiveSessionId() === id) {
      fsm.endSession();
      forgetLesson();
    }
    repository?.delete(id);
  });

  ipcMain.handle('session:rename', async (_event, id: string, title: string) => {
    repository?.rename(id, String(title ?? ''));
  });

  ipcMain.handle('session:pin', async (_event, id: string, pinned: boolean) => {
    repository?.setPinned(id, !!pinned);
  });

  ipcMain.handle(
    'session:resume-lesson',
    async (_event, nodeId: string, checkQuestion: CheckQuestionData | null, progress?: LessonProgress) => {
      const node = fsm.hasSession() ? store.getNodeById(nodeId) : undefined;
      if (!node) throw new Error(localize('Conceito não encontrado no grafo desta sessão.', 'Concept not found in this session\'s map.'));
      currentSocraticNode = node;
      currentCheckData = checkQuestion ?? undefined;
      socratic.resumeNode(node, progress);
    }
  );

  ipcMain.handle('session:save-ui', async (_event, id: string, ui: PersistedUi) => {
    repository?.saveUi(id, ui);
  });

  ipcMain.handle('session:submit-goal', async (_event, option: string, thinkingText?: string) => {
    return foreground(() => fsm.submitGoalClarification(option, thinkingText));
  });

  ipcMain.handle('session:request-orientation', async (_event, thinkingText?: string) => {
    return foreground(() => fsm.requestOrientation(thinkingText));
  });

  ipcMain.handle(
    'session:submit-probe',
    async (
      _event,
      data: {
        selectedOptionIndex: number;
        answerKind?: ProbeAnswerKind;
        confidence?: number;
        thinkingText: string;
      }
    ) => {
      return foreground(async () => {
        const result = await fsm.submitProbeAnswer(data);
        return { ...result, session: fsm.getState() };
      });
    }
  );

  ipcMain.handle('session:advance-plan', async () => {
    return foreground(async () => {
      await fsm.advanceToPlan();
      return fsm.getState();
    });
  });

  ipcMain.handle('session:confirm-plan', async () => {
    fsm.confirmPlan();
    return fsm.getState();
  });

  ipcMain.handle('session:socratic-start', async (_event, nodeId?: string) => {
    const state = fsm.getState();
    if (state.phase !== 'teaching') {
      throw new Error(
        localize(
          'As aulas começam depois do diagnóstico e da confirmação do plano.',
          'Lessons start after the diagnosis and once the plan is confirmed.'
        )
      );
    }
    let targetNode: ConceptNode | undefined;

    if (nodeId) {
      // Explicit request (e.g. from the concept map): always allowed, even for already-taught concepts
      targetNode = store.getNodeById(nodeId);
      if (!targetNode) throw new Error(localize('Conceito não encontrado no grafo desta sessão.', 'Concept not found in this session\'s map.'));
    } else {
      const nextId = fsm.nextTeachingNodeId();
      targetNode = nextId ? store.getNodeById(nextId) : undefined;
      // Nothing left: every concept is mastered
      if (!targetNode) return null;
    }

    currentSocraticNode = targetNode;
    currentCheckData = undefined;
    const node = targetNode;
    return foreground(async () => {
      const predictData = await socratic.generatePredictStep(node, state.goal, {
        failures: fsm.getLessonFailures(node.id),
      });
      return { node, ...predictData };
    });
  });

  ipcMain.handle('session:submit-prediction', async (_event, text: string) => {
    if (!currentSocraticNode) {
      throw new Error(localize('Nenhum conceito ativo no ciclo socrático.', 'There is no active lesson.'));
    }
    const node = currentSocraticNode;
    const failures = fsm.getLessonFailures(node.id);
    return foreground(async () => {
      const teachResult = await socratic.submitPrediction(text, failures, fsm.getProbeReference(node.id));
      currentCheckData = teachResult.checkQuestion;
      return teachResult;
    });
  });

  ipcMain.handle('session:continue-lesson', async () => {
    const node = currentSocraticNode;
    if (!node) {
      throw new Error(localize('Nenhum conceito ativo no ciclo socrático.', 'There is no active lesson.'));
    }
    // A repair is written from the verification that failed; a new step starts clean
    const lastFailure = fsm.getLessonFailures(node.id).slice(-1)[0];
    return foreground(async () => {
      const step = await socratic.continueLesson(lastFailure, fsm.getProbeReference(node.id));
      currentCheckData = step.checkQuestion;
      return step;
    });
  });

  ipcMain.handle(
    'session:submit-check',
    async (_event, selectedIndex: number, confidence?: number, thinkingText?: string, readingThoughts?: string) => {
    if (!currentCheckData) {
      throw new Error(localize('Nenhuma pergunta de verificação ativa. Reinicie a etapa socrática deste conceito.', 'There is no active verification question. Restart this concept\'s lesson.'));
    }

    const check = currentCheckData;
    const node = currentSocraticNode;
    return foreground(async () => {
      const evalResult = socratic.evaluateCheck(selectedIndex, check);
      const verdict = node
        ? await fsm.recordCheckVerdict(
            node.id,
            check,
            { selectedOptionIndex: selectedIndex, confidence, thinkingText },
            { conceptDone: socratic.isLastStep(), readingThoughts }
          )
        : undefined;
      const mastered = verdict === 'mastered';
      // The verification was answered: it cannot be sent twice against the same step
      currentCheckData = undefined;
      const wasShortcut = Boolean(socratic.getProgress()?.shortcut);
      const outcome = socratic.recordCheck(mastered, readingThoughts);

      // Repairs ran out: before the concept is simply tried again, ask whether a foundation is missing.
      // Best effort: the answer is already recorded, so a failure here must not turn into an error.
      let planRevision: PlanRevision | null = null;
      if (outcome === 'concept_requeued' && node && !wasShortcut) {
        try {
          planRevision = await fsm.reviseAfterFailure(node.id);
        } catch (err) {
          if (err instanceof SessionChangedError) throw err;
          console.warn('[ipc] Não foi possível rever o plano:', err);
        }
      }
      return {
        ...evalResult,
        mastered,
        outcome,
        progress: socratic.getProgress(),
        ...(planRevision ? { planRevision } : {}),
        session: fsm.getState(),
      };
    });
  });

  ipcMain.handle('notes:generate', async (_event, sessionId: string, nodeIds: string[]) => {
    if (!fsm.hasSession() || fsm.getActiveSessionId() !== sessionId) {
      throw new Error(localize('Esta sessão não está mais ativa.', 'This session is no longer active.'));
    }
    const state = fsm.getState();
    const lessons = repository?.get(sessionId)?.ui.lessons ?? [];
    const evidence = nodeIds.flatMap((id) => {
      const node = store.getNodeById(id);
      if (!node) return [];
      return [
        {
          node: { ...node, status: state.nodesState[id] || node.status },
          attempts: state.attempts.filter((a) => a.nodeId === id),
          lessons: lessons.filter((l) => l.nodeId === id),
        },
      ];
    });
    // Not a foreground call on purpose: the student can keep working and switch sessions meanwhile
    return notesGenerator.generate(state.goal, evidence);
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
      const apiKey = params.apiKey.trim() || secrets?.get(providerSecret(params.providerId)) || '';
      const result = await validateAndFetchModels({ ...params, apiKey });
      if (apiKey) secrets?.set(providerSecret(result.providerId), apiKey);
      return result;
    }
  );

  ipcMain.handle('settings:update', async (_event, payload: SettingsUpdatePayload) => {
    const apiKey = payload.apiKey || (payload.providerId ? secrets?.get(providerSecret(payload.providerId)) : '') || '';
    if (payload.providerId || apiKey) {
      updateDefaultLLMConfig({
        baseURL: resolveChatBaseUrl(payload.providerId, payload.baseUrl),
        apiKey: apiKey || (payload.providerId === 'ollama' ? 'ollama' : ''),
        model: payload.model || '',
      });
    } else if (payload.providerId !== undefined || payload.apiKey !== undefined) {
      // Nothing configured in the app: whatever the environment provides still applies
      resetLLMConnectionToEnv();
    }
    if (payload.effortLevel !== undefined) {
      updateDefaultLLMConfig({ effortLevel: payload.effortLevel as any });
    }
    speechConfig.deepgramApiKey = payload.deepgramApiKey || secrets?.get(DEEPGRAM_SECRET) || '';
    if (payload.voiceLanguage) speechConfig.voiceLanguage = payload.voiceLanguage;
    if (payload.minProbeQuestions !== undefined) fsm.setMinProbeQuestions(payload.minProbeQuestions);
    if (payload.saveRequests !== undefined) fsm.setSaveRequests(Boolean(payload.saveRequests));
    if (payload.uiLanguage) setResponseLanguage(payload.uiLanguage);
    return { success: true };
  });

  ipcMain.handle('speech:validate-key', async (_event, apiKey: string) => {
    const result = await validateDeepgramKey(apiKey);
    secrets?.set(DEEPGRAM_SECRET, apiKey.trim());
    speechConfig.deepgramApiKey = apiKey.trim();
    return result;
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

  ipcMain.handle('speech:stream-start', (event, params: { language?: string }) => {
    speechStream?.abort();
    const id = ++speechStreamSeq;
    const sender = event.sender;
    const emit = (payload: Record<string, unknown>) => {
      if (!sender.isDestroyed()) sender.send('speech:stream-event', { id, ...payload });
    };
    const stream = openDeepgramStream({
      apiKey: speechConfig.deepgramApiKey,
      language: params?.language || speechConfig.voiceLanguage,
      onTranscript: (text, isFinal) => emit({ type: isFinal ? 'final' : 'interim', text }),
      onError: (message) => emit({ type: 'error', message }),
      onClose: () => {
        if (speechStream === stream) speechStream = null;
        emit({ type: 'closed' });
      },
    });
    speechStream = stream;
    return id;
  });

  ipcMain.on('speech:stream-chunk', (_event, chunk: ArrayBuffer | Uint8Array) => {
    speechStream?.send(chunk);
  });

  ipcMain.handle('speech:stream-stop', async () => {
    await speechStream?.finish();
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
