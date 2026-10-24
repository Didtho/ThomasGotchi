const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('poop', {
  clean: () => ipcRenderer.send('poop-clean'),
});
