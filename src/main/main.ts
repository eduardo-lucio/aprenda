import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, session, shell } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
import { KnowledgeStore } from './knowledge/KnowledgeStore';
import { SessionStateMachine } from './fsm/SessionStateMachine';
import { SocraticEngine } from './socratic/SocraticEngine';
import { SessionRepository } from './persistence/SessionRepository';
import { LearnerMemory } from './persistence/LearnerMemory';
import { SecretStore } from './persistence/SecretStore';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { configureNetworkDefaults } from './services/http';

configureNetworkDefaults();

let mainWindow: BrowserWindow | null = null;

const store = new KnowledgeStore();
const fsm = new SessionStateMachine(store);
const socratic = new SocraticEngine();
let repository: SessionRepository | null = null;

const rendererFile = path.join(__dirname, '../renderer/index.html');
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

/** The only page this app ever shows. Anything else must not receive `window.api`. */
function isAppPage(url: string): boolean {
  if (devServerUrl) return url.startsWith(devServerUrl);
  return url.split(/[?#]/)[0] === pathToFileURL(rendererFile).href;
}

function openInBrowser(url: string): void {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: !app.isPackaged,
    },
  });

  // Dropping a file or a link on the window would otherwise navigate to it, with the preload still attached
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppPage(url)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url);
    return { action: 'deny' };
  });

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(rendererFile);
  }

  const sendMaximized = (isMaximized: boolean) => mainWindow?.webContents.send('window:maximized-change', isMaximized);
  mainWindow.on('maximize', () => sendMaximized(true));
  mainWindow.on('unmaximize', () => sendMaximized(false));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function focusMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

async function start(): Promise<void> {
  await app.whenReady();

  // The default menu carries Reload and DevTools shortcuts, which would break a running session
  if (app.isPackaged) Menu.setApplicationMenu(null);

  // Voice dictation (MediaRecorder / getUserMedia) is the only permission, and only for the app's own page
  const allowed = new Set(['media', 'audioCapture', 'microphone']);
  const isOwnPage = (wc: Electron.WebContents | null) =>
    Boolean(wc && mainWindow && wc === mainWindow.webContents && isAppPage(wc.getURL()));
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(allowed.has(permission) && isOwnPage(wc));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => allowed.has(permission) && isOwnPage(wc));

  repository = new SessionRepository(path.join(app.getPath('userData'), 'sessions.json'));
  registerIpcHandlers(ipcMain, {
    fsm,
    store,
    socratic,
    repository,
    memory: new LearnerMemory(path.join(app.getPath('userData'), 'memory.json')),
    secrets: new SecretStore(path.join(app.getPath('userData'), 'secrets.json'), safeStorage),
    getMainWindow: () => mainWindow,
  });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

process.on('uncaughtException', (err) => console.error('[main] Exceção não tratada:', err));
process.on('unhandledRejection', (reason) => console.error('[main] Promessa rejeitada sem tratamento:', reason));

// Each process writes the whole session file: a second one would erase what the first saved
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focusMainWindow);

  start().catch((err) => {
    console.error('[main] Falha ao iniciar:', err);
    dialog.showErrorBox('APRENDA', String(err?.message || err));
    app.quit();
  });

  app.on('before-quit', () => repository?.flush());

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
