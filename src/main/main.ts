import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { KnowledgeStore } from './knowledge/KnowledgeStore';
import { SessionStateMachine } from './fsm/SessionStateMachine';
import { SocraticEngine } from './socratic/SocraticEngine';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';

let mainWindow: BrowserWindow | null = null;

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
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
