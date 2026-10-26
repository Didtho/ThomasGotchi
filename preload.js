const { contextBridge, ipcRenderer } = require('electron');

// Langue connue dès le chargement (pour afficher tout de suite les bons textes)
const initialLang = ipcRenderer.sendSync('get-lang');

contextBridge.exposeInMainWorld('desk', {
  lang: initialLang,
  country: ipcRenderer.sendSync('get-country'), // pays du système, pour les fêtes qui en dépendent
  isMac: process.platform === 'darwin',
  scale: ipcRenderer.sendSync('get-scale'), // taille des animaux (réglage commun à tous)
  setScale: (scale) => ipcRenderer.send('set-scale', scale),
  onScale: (cb) => ipcRenderer.on('scale', (_e, scale) => cb(scale)),
  gravity: () => ipcRenderer.sendSync('get-gravity'), // gravité (réglage commun) : sinon il reste là où on le pose
  setGravity: (on) => ipcRenderer.send('set-gravity', on),
  dropZone: process.argv.includes('--tg-drop-zone'), // zone de dépôt posée sur l'animal (Mac, voir main.js)
  setLang: (value) => ipcRenderer.send('set-lang', value),
  onLang: (cb) => ipcRenderer.on('lang', (_e, l) => cb(l)),
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
  diag: (text) => ipcRenderer.send('diag', text),
  dropBox: (box) => ipcRenderer.send('drop-box', box),
  status: (alert) => ipcRenderer.send('pet-status', alert), // besoin à signaler sur l'icône (ou null)
  savePhoto: (dataUrl, name) => ipcRenderer.invoke('save-photo', dataUrl, name),
  openPhoto: (file) => ipcRenderer.invoke('open-photo', file),
  owl: () => ipcRenderer.invoke('owl'), // soirée magique : un hibou traverse l'écran ; répond quand il passe au-dessus
  // Visites entre ordinateurs : invité venu d'ailleurs (sinon null), amis, départs et retours
  guest: ipcRenderer.sendSync('get-guest'),
  online: {
    get: () => ipcRenderer.invoke('online-get'),
    add: (code) => ipcRenderer.invoke('online-add', code),
    accept: (code) => ipcRenderer.invoke('online-accept', code),
    remove: (code) => ipcRenderer.invoke('online-remove', code),
    open: (on) => ipcRenderer.invoke('online-open', on),
    visit: (code, walk) => ipcRenderer.invoke('online-visit', code, walk), // walk : promenade à deux
    gift: (code, kind, msg) => ipcRenderer.invoke('online-gift', code, kind, msg), // 'cadeau' ou 'carte' (+ numéro du message)
  },
  // Pense-bête : rappels communs à tous les animaux ; onReminder quand c'est l'heure
  reminders: {
    get: () => ipcRenderer.invoke('reminders-get'),
    add: (r) => ipcRenderer.invoke('reminders-add', r),
    remove: (id) => ipcRenderer.invoke('reminders-remove', id),
  },
  onReminder: (cb) => ipcRenderer.on('reminder', (_e, r) => cb(r)),
  guestAte:(amount) => ipcRenderer.send('guest-ate', amount), // invité : ce qu'il vient de manger chez l'hôte
  onOnline: (cb) => ipcRenderer.on('online', (_e, data) => cb(data)),
  onVisit: (cb) => ipcRenderer.on('visit', (_e, ev) => cb(ev)),
  onHiddenTop: (cb) => ipcRenderer.on('hidden-top', (_e, px) => cb(px)),
  onFeedFiles: (cb) => ipcRenderer.on('feed-files', (_e, meals) => cb(meals)),
  poopAdd: (id, side, style, kind, edge) => ipcRenderer.invoke('poop-add', id, side, style, kind, edge),
  poopRestore: (spots, style) => ipcRenderer.invoke('poop-restore', spots, style),
  poopClearAll: () => ipcRenderer.send('poop-clear-all'),
  onPoopCleaned: (cb) => ipcRenderer.on('poop-cleaned', (_e, id) => cb(id)),
  petCount: () => ipcRenderer.invoke('pet-count'),
  version: () => ipcRenderer.invoke('get-version'),
  adopt: () => ipcRenderer.send('adopt'),
  release: () => ipcRenderer.send('release'),
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, pos) => cb(pos)),
  onShaken: (cb) => ipcRenderer.on('shaken', () => cb()),
  onYarn: (cb) => ipcRenderer.on('yarn', (_e, info) => cb(info)),
  yarnKick: (dir) => ipcRenderer.send('yarn-kick', dir),
  yarnToggle: () => ipcRenderer.send('yarn-toggle'),
  onFurniture: (cb) => ipcRenderer.on('furniture', (_e, f) => cb(f)),
  bowlUse: (what) => ipcRenderer.invoke('bowl-use', what),
  exportPet: (state) => ipcRenderer.invoke('export-pet', state),
  onDnd: (cb) => ipcRenderer.on('dnd', (_e, on) => cb(on)),
  onMusic: (cb) => ipcRenderer.on('music', (_e, on) => cb(on)), // Windows : de la musique joue (il danse)
  onLaser: (cb) => ipcRenderer.on('laser', (_e, on) => cb(on)), // pointeur laser à chasser
  onFocus: (cb) => ipcRenderer.on('focus', (_e, f) => cb(f)), // mode concentration : { phase: 'work' | 'pause' | 'end' | 'stop' }
  onFriends: (cb) => ipcRenderer.on('friends', (_e, list) => cb(list)),
  onUserEvent: (cb) => ipcRenderer.on('user-event', (_e, ev) => cb(ev)),
  speak: (text) => ipcRenderer.send('speak', text),
  onWeather: (cb) => ipcRenderer.on('weather', (_e, w) => cb(w)),
  getCity: () => ipcRenderer.invoke('get-city'),
  setCity: (c) => ipcRenderer.invoke('set-city', c),
  setDecor: (kind) => ipcRenderer.send('decor', kind),
  onFalling: (cb) => ipcRenderer.on('falling', () => cb()),
  onLanded: (cb) => ipcRenderer.on('landed', () => cb()),
  climb: () => ipcRenderer.invoke('climb'),
  onMeet: (cb) => ipcRenderer.on('meet', (_e, info) => cb(info)),
});
