const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yarnApi', {
  onState: (cb) => ipcRenderer.on('yarn-state', (_e, s) => cb(s)),
  setIgnore: (ignore) => ipcRenderer.send('yarn-ignore', ignore),
  rewind: () => ipcRenderer.send('yarn-rewind'),
});
