const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desk', {
  setIgnore: (ignore) => ipcRenderer.send('set-ignore', ignore),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragEnd: () => ipcRenderer.invoke('drag-end'),
  expand: (extra) => ipcRenderer.invoke('expand', extra),
  collapse: () => ipcRenderer.invoke('collapse'),
  moveBy: (dx, dy) => ipcRenderer.invoke('move-by', dx, dy),
  load: () => ipcRenderer.invoke('load-state'),
  save: (state) => ipcRenderer.invoke('save-state', state),
  getLogin: () => ipcRenderer.invoke('get-login'),
  setLogin: (on) => ipcRenderer.invoke('set-login', on),
  quit: () => ipcRenderer.send('quit'),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, action) => cb(action)),
  poopAdd: (id, side, style) => ipcRenderer.invoke('poop-add', id, side, style),
  poopRestore: (spots, style) => ipcRenderer.invoke('poop-restore', spots, style),
  poopClearAll: () => ipcRenderer.send('poop-clear-all'),
  onPoopCleaned: (cb) => ipcRenderer.on('poop-cleaned', (_e, id) => cb(id)),
});
