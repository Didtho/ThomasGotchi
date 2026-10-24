const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('furn', {
  onState: (cb) => ipcRenderer.on('furn-state', (_e, s) => cb(s)),
  click: () => ipcRenderer.send('furn-click'),
  dragStart: () => ipcRenderer.send('furn-drag-start'),
  dragEnd: () => ipcRenderer.send('furn-drag-end'),
});
