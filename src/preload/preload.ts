import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  windowAction: (action: 'minimize' | 'maximize' | 'close') => {
    ipcRenderer.send('window:action', action);
  },
});
