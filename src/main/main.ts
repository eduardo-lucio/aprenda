import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import { KnowledgeStore } from './knowledge/KnowledgeStore';
import { SessionStateMachine } from './fsm/SessionStateMachine';
import { SocraticEngine } from './socratic/SocraticEngine';
import { SessionRepository } from './persistence/SessionRepository';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';

let mainWindow: BrowserWindow | null = null;
let repository: SessionRepository | null = null;

const store = new KnowledgeStore();
const fsm = new SessionStateMachine(store);
const socratic = new SocraticEngine();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  registerIpcHandlers(ipcMain, {
    fsm,
    store,
    socratic,
    repository: repository || undefined,
    getMainWindow: () => mainWindow,
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Allow microphone capture for voice dictation (MediaRecorder / getUserMedia)
  const allowed = new Set(['media', 'audioCapture', 'microphone']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(allowed.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  repository = new SessionRepository(path.join(app.getPath('userData'), 'sessions.json'));
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => repository?.flush());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
