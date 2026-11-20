// The only bridge between the game page and the app. Exposes a small, fixed API as window.woof.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('woof', {
  info: () => ipcRenderer.invoke('info'),
  auth: {
    status: () => ipcRenderer.invoke('auth:status'),
    start: () => ipcRenderer.invoke('auth:start'),
    wait: () => ipcRenderer.invoke('auth:wait'),
    cancel: () => ipcRenderer.invoke('auth:cancel'),
    signOut: () => ipcRenderer.invoke('auth:signOut'),
  },
  cloud: {
    session: () => ipcRenderer.invoke('cloud:session'),
    sync: (payload) => ipcRenderer.invoke('cloud:sync', payload),
    claim: (ids) => ipcRenderer.invoke('cloud:claim', ids),
  },
  open: (url) => ipcRenderer.invoke('open', url),
  copy: (text) => ipcRenderer.invoke('copy', text),
  onUpdate: (cb) => ipcRenderer.on('update', (_e, u) => cb(u)),
  restartToUpdate: () => ipcRenderer.send('update:restart'),
  onQuit: (cb) => ipcRenderer.on('quit', () => cb()),
  quitReady: () => ipcRenderer.send('quit:ready'),
});
