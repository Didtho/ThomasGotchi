const { contextBridge, ipcRenderer } = require('electron');

// Zone de dépôt posée sur l'animal (Mac) : souris transmise à l'animal, fichiers déposés donnés à manger
contextBridge.exposeInMainWorld('zone', {
  mouse: (type, x, y, button, clicks) => ipcRenderer.send('zone-mouse', type, x, y, button, clicks),
  feed: (meals) => ipcRenderer.send('zone-feed', meals),
  diag: (text) => ipcRenderer.send('zone-diag', text),
});
