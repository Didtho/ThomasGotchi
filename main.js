const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');

const W = 240;
const H = 300;
const MAX_PETS = 5;
const isMac = process.platform === 'darwin';

let tray = null;
let updateUrl = null; // page de la nouvelle version (Mac : mise à jour manuelle)

// Chaque petit animal a sa propre fenêtre et ses propres fichiers de sauvegarde.
// p = { id, win, name, active, expandUp, expandDown, dragTimer, ignoring }
const pets = new Map();

const dataFile = (name) => path.join(app.getPath('userData'), name);

function readJson(name) {
  try {
    return JSON.parse(fs.readFileSync(dataFile(name), 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(name, data) {
  // Écriture atomique : on écrit un fichier temporaire puis on le renomme
  const file = dataFile(name);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

// Le premier animal garde les noms de fichiers d'origine (compatibilité avec les anciennes sauvegardes)
const stateFile = (id) => (id === 'main' ? 'pet.json' : `pet-${id}.json`);
const windowFile = (id) => (id === 'main' ? 'window.json' : `window-${id}.json`);

function savePetList() {
  try { writeJson('pets.json', [...pets.keys()]); } catch { /* sans gravité */ }
}

function petOf(sender) {
  for (const p of pets.values()) if (p.win && !p.win.isDestroyed() && p.win.webContents === sender) return p;
  return null;
}

const alive = (p) => p.win && !p.win.isDestroyed();

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// ---- Fenêtres des animaux ----

function defaultPosition(index = 0) {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - W - 60 - index * 170, y: wa.y + wa.height - H };
}

function initialPosition(id, index) {
  const saved = readJson(windowFile(id));
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    // On vérifie que la position est encore sur un écran branché
    const visible = screen.getAllDisplays().some(({ workArea: wa }) =>
      saved.x + W / 2 >= wa.x && saved.x + W / 2 <= wa.x + wa.width &&
      saved.y + H / 2 >= wa.y && saved.y + H / 2 <= wa.y + wa.height);
    if (visible) return saved;
  }
  return defaultPosition(index);
}

function placeWindow(p, x, y) {
  if (!alive(p)) return;
  p.win.setBounds({ x: Math.round(x), y: Math.round(y), width: W, height: H + p.expandUp + p.expandDown });
}

function keepOnTop() {
  for (const p of pets.values()) if (alive(p)) p.win.setAlwaysOnTop(true, 'screen-saver');
}

function createPetWindow(id) {
  const pos = initialPosition(id, pets.size);
  const win = new BrowserWindow({
    width: W,
    height: H,
    x: pos.x,
    y: pos.y,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  const p = { id, win, name: '', active: false, expandUp: 0, expandDown: 0, dragTimer: null, ignoring: true };
  pets.set(id, p);

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.on('closed', () => { p.win = null; });
  return p;
}

function saveWindowPosition(p) {
  if (!alive(p)) return;
  const [x, y] = p.win.getPosition();
  try { writeJson(windowFile(p.id), { x, y: y + p.expandUp }); } catch { /* sans gravité */ }
}

function adoptPet() {
  if (pets.size >= MAX_PETS) return;
  const id = Date.now().toString(36);
  createPetWindow(id);
  savePetList();
  buildTrayMenu();
}

function releasePet(p) {
  if (pets.size <= 1) return;
  for (const [poopId, poop] of poopWindows) {
    if (poop.owner === p.id && !poop.win.isDestroyed()) poop.win.close();
    poopWindows.delete(poopId);
  }
  if (alive(p)) p.win.destroy();
  pets.delete(p.id);
  for (const f of [stateFile(p.id), windowFile(p.id)]) {
    try { fs.unlinkSync(dataFile(f)); } catch { /* déjà absent */ }
  }
  savePetList();
  buildTrayMenu();
}

// ---- Icône près de l'horloge ----

function anyVisible() {
  return [...pets.values()].some((p) => alive(p) && p.win.isVisible());
}

function toggleVisible() {
  const show = !anyVisible();
  for (const p of pets.values()) {
    if (!alive(p)) continue;
    if (show) p.win.show(); else p.win.hide();
  }
  if (show) keepOnTop();
  buildTrayMenu();
}

function openSettings(p) {
  if (!alive(p)) return;
  p.win.show();
  p.win.webContents.send('menu', 'settings');
}

function buildTrayMenu() {
  if (!tray) return;
  const login = app.getLoginItemSettings().openAtLogin;
  const list = [...pets.values()];
  const settings = list.length === 1
    ? { label: 'Réglages…', click: () => openSettings(list[0]) }
    : { label: 'Réglages', submenu: list.map((p) => ({ label: p.name || 'Œuf', click: () => openSettings(p) })) };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: anyVisible() ? 'Cacher' : 'Afficher', click: toggleVisible },
    {
      label: 'Ramener au coin de l\'écran',
      click: () => list.forEach((p, i) => { const d = defaultPosition(i); placeWindow(p, d.x, d.y); if (alive(p)) p.win.show(); }),
    },
    settings,
    { label: 'Adopter un autre animal', enabled: list.length < MAX_PETS, click: adoptPet },
    ...(updateUrl ? [{ label: '⬇ Nouvelle version disponible', click: () => shell.openExternal(updateUrl) }] : []),
    { type: 'separator' },
    {
      label: 'Lancer au démarrage', type: 'checkbox', checked: login,
      click: (item) => { app.setLoginItemSettings({ openAtLogin: item.checked }); },
    },
    { type: 'separator' },
    { label: 'Quitter', click: () => app.quit() },
  ]));
}

function createTray() {
  let icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  icon = icon.resize({ width: isMac ? 18 : 16, height: isMac ? 18 : 16 });
  tray = new Tray(icon);
  tray.setToolTip('ThomasGotchi');
  if (!isMac) tray.on('click', toggleVisible);
  buildTrayMenu();
}

// ---- Communication avec les fenêtres des animaux ----

ipcMain.on('set-ignore', (e, ignore) => {
  const p = petOf(e.sender);
  if (!p || ignore === p.ignoring) return;
  p.ignoring = ignore;
  p.win.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.on('drag-start', (e) => {
  const p = petOf(e.sender);
  if (!p) return;
  clearInterval(p.dragTimer);
  const c = screen.getCursorScreenPoint();
  const [wx, wy] = p.win.getPosition();
  const ox = c.x - wx;
  const oy = c.y - wy;
  // Détection d'une secousse : plusieurs allers-retours rapides en moins d'une seconde
  let lastX = c.x;
  let lastDir = 0;
  let flips = [];
  p.dragTimer = setInterval(() => {
    const cur = screen.getCursorScreenPoint();
    placeWindow(p, cur.x - ox, cur.y - oy);
    const dx = cur.x - lastX;
    lastX = cur.x;
    if (Math.abs(dx) < 12) return;
    const dir = Math.sign(dx);
    if (lastDir && dir !== lastDir) {
      const now = Date.now();
      flips = flips.filter((t) => now - t < 1000).concat(now);
      if (flips.length >= 4 && now - (p.lastShake || 0) > 3000) {
        p.lastShake = now;
        flips = [];
        p.win.webContents.send('shaken');
      }
    }
    lastDir = dir;
  }, 10);
});

ipcMain.handle('drag-end', (e) => {
  const p = petOf(e.sender);
  if (!p) return;
  clearInterval(p.dragTimer);
  p.dragTimer = null;
  saveWindowPosition(p);
});

ipcMain.handle('expand', (e, extra) => {
  const p = petOf(e.sender);
  if (!p) return null;
  if (p.expandUp || p.expandDown) return { above: p.expandUp > 0 };
  const b = p.win.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  // Vers le haut s'il y a la place, sinon vers le bas (animal collé en haut de l'écran)
  if (b.y - extra >= wa.y) p.expandUp = extra;
  else p.expandDown = extra;
  p.win.setBounds({ x: b.x, y: b.y - p.expandUp, width: W, height: H + extra });
  return { above: p.expandUp > 0 };
});

ipcMain.handle('collapse', (e) => {
  const p = petOf(e.sender);
  if (!p || !(p.expandUp || p.expandDown)) return;
  const b = p.win.getBounds();
  const up = p.expandUp;
  p.expandUp = 0;
  p.expandDown = 0;
  p.win.setBounds({ x: b.x, y: b.y + up, width: W, height: H });
});

// Distance verticale entre une hauteur et une zone d'écran (0 si elle est dedans)
function verticalGap(wa, y) {
  if (y < wa.y) return wa.y - y;
  if (y > wa.y + wa.height) return y - (wa.y + wa.height);
  return 0;
}

// Promenade : il peut passer d'un écran à l'autre. Il est bloqué seulement quand le milieu
// de son corps sortirait de tous les écrans.
ipcMain.handle('move-by', (e, dx, dy) => {
  const p = petOf(e.sender);
  if (!p || p.dragTimer) return null;
  const b = p.win.getBounds();
  const feetX = b.x + W / 2 + dx;
  const feetY = b.y + b.height;
  const target = screen.getAllDisplays()
    .map((d) => d.workArea)
    .filter((wa) => feetX >= wa.x && feetX < wa.x + wa.width)
    .sort((a, c) => verticalGap(a, feetY) - verticalGap(c, feetY))[0];
  if (!target) return { blockedLeft: dx < 0, blockedRight: dx > 0 };

  // S'il marchait en bas de l'écran, il reste posé en bas du nouvel écran (même si les hauteurs diffèrent)
  const current = screen.getDisplayMatching(b).workArea;
  const onFloor = feetY >= current.y + current.height - 4;
  const floor = target.y + target.height - b.height;
  let ny = b.y + dy;
  if (onFloor || ny > floor) ny = floor;
  ny = Math.max(ny, target.y);
  placeWindow(p, b.x + dx, ny);
  return { blockedLeft: false, blockedRight: false };
});

ipcMain.handle('load-state', (e) => {
  const p = petOf(e.sender);
  return p ? readJson(stateFile(p.id)) : null;
});

ipcMain.handle('save-state', (e, state) => {
  const p = petOf(e.sender);
  if (!p || !state) return false;
  const name = state.name || '';
  p.active = !state.dead && Date.now() >= state.hatchAt;
  if (name !== p.name) { p.name = name; buildTrayMenu(); }
  try { writeJson(stateFile(p.id), state); return true; } catch { return false; }
});

ipcMain.handle('get-login', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('set-login', (_e, on) => {
  app.setLoginItemSettings({ openAtLogin: !!on });
  buildTrayMenu();
});
ipcMain.handle('pet-count', () => pets.size);
ipcMain.on('adopt', adoptPet);
ipcMain.on('release', (e) => { const p = petOf(e.sender); if (p) releasePet(p); });
ipcMain.on('quit', () => app.quit());

// ---- Crottes posées sur le bureau : chacune est une petite fenêtre qu'on clique pour nettoyer ----

const POOP = 56;
const poopWindows = new Map(); // id -> { win, owner }

function createPoop(owner, id, x, y, style) {
  const w = new BrowserWindow({
    width: POOP,
    height: POOP,
    x,
    y,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload-poop.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Un cran en dessous des animaux, pour qu'ils passent devant en marchant
  w.setAlwaysOnTop(true, 'floating');
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  w.loadFile(path.join(__dirname, 'src', 'poop.html'), { query: { style: style || 'cute' } });
  poopWindows.set(id, { win: w, owner: owner.id });
  w.on('closed', () => poopWindows.delete(id));
}

function onSomeScreen(x, y) {
  return screen.getAllDisplays().some(({ workArea: wa }) =>
    x + POOP / 2 >= wa.x && x + POOP / 2 <= wa.x + wa.width &&
    y + POOP / 2 >= wa.y && y + POOP / 2 <= wa.y + wa.height);
}

// Nouvelle crotte à côté de ses pattes ; renvoie sa position pour la sauvegarde
function poopNextToPet(p, id, side, style) {
  const b = p.win.getBounds();
  const x = Math.round(b.x + W / 2 + side * (75 + Math.random() * 45) - POOP / 2);
  const y = Math.round(b.y + p.expandUp + H - POOP + 2);
  createPoop(p, id, x, y, style);
  return { x, y };
}

ipcMain.handle('poop-add', (e, id, side, style) => {
  const p = petOf(e.sender);
  return p ? poopNextToPet(p, id, side, style) : null;
});

// Au démarrage : on remet les crottes là où elles étaient (ou près de lui si l'écran a été débranché)
ipcMain.handle('poop-restore', (e, spots, style) => {
  const p = petOf(e.sender);
  if (!p) return [];
  return spots.map((s, i) => {
    if (onSomeScreen(s.x, s.y)) {
      createPoop(p, s.id, s.x, s.y, style);
      return s;
    }
    return { id: s.id, ...poopNextToPet(p, s.id, i % 2 ? 1 : -1, style) };
  });
});

ipcMain.on('poop-clean', (e) => {
  for (const [id, poop] of poopWindows) {
    if (poop.win.webContents !== e.sender) continue;
    poop.win.close();
    const owner = pets.get(poop.owner);
    if (owner && alive(owner)) owner.win.webContents.send('poop-cleaned', id);
  }
});

ipcMain.on('poop-clear-all', (e) => {
  const p = petOf(e.sender);
  if (!p) return;
  for (const poop of poopWindows.values()) if (poop.owner === p.id && !poop.win.isDestroyed()) poop.win.close();
});

// ---- Ce que les animaux perçoivent autour d'eux ----

// Position de la souris, pour que leurs yeux la suivent
let lastCursor = '';
function sendCursor() {
  const c = screen.getCursorScreenPoint();
  const key = c.x + ',' + c.y;
  if (key === lastCursor) return;
  lastCursor = key;
  for (const p of pets.values()) {
    if (!alive(p) || !p.win.isVisible()) continue;
    const b = p.win.getBounds();
    p.win.webContents.send('cursor', { x: c.x - b.x, y: c.y - b.y });
  }
}

// Deux animaux qui se croisent se font un câlin (au plus une fois par minute pour chaque paire)
const lastMeet = new Map();
function checkMeetings() {
  const list = [...pets.values()].filter((p) => alive(p) && p.active && p.win.isVisible() && !p.dragTimer);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const ba = a.win.getBounds(), bb = b.win.getBounds();
      const close = Math.abs(ba.x - bb.x) < 110 && Math.abs((ba.y + ba.height) - (bb.y + bb.height)) < 60;
      const key = [a.id, b.id].sort().join('|');
      if (!close || Date.now() - (lastMeet.get(key) || 0) < 60000) continue;
      lastMeet.set(key, Date.now());
      a.win.webContents.send('meet', { name: b.name, side: bb.x > ba.x ? 1 : -1 });
      b.win.webContents.send('meet', { name: a.name, side: ba.x > bb.x ? 1 : -1 });
    }
  }
}

// ---- Mises à jour ----
// Windows : téléchargement et installation automatiques (au prochain redémarrage de l'application).
// Mac : l'application n'étant pas signée, macOS refuse la mise à jour automatique ; on propose
// simplement le lien de téléchargement dans le menu.

const RELEASES = 'https://github.com/Didtho/ThomasGotchi/releases/latest';

function newer(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

async function checkForUpdates() {
  if (!app.isPackaged) return;
  try {
    if (isMac) {
      const res = await net.fetch('https://api.github.com/repos/Didtho/ThomasGotchi/releases/latest');
      const tag = ((await res.json()).tag_name || '').replace(/^v/, '');
      if (tag && newer(tag, app.getVersion())) { updateUrl = RELEASES; buildTrayMenu(); }
    } else {
      const { autoUpdater } = require('electron-updater');
      await autoUpdater.checkForUpdatesAndNotify();
    }
  } catch { /* hors ligne : on réessaiera plus tard */ }
}

// ---- Cycle de vie ----

app.on('second-instance', () => {
  for (const p of pets.values()) if (alive(p)) p.win.show();
  keepOnTop();
});

app.setAppUserModelId('com.thomasgotchi.app'); // nom affiché dans les notifications Windows

app.whenReady().then(() => {
  if (isMac && app.dock) app.dock.hide();
  const saved = readJson('pets.json');
  const ids = Array.isArray(saved) && saved.length ? saved.slice(0, MAX_PETS) : ['main'];
  ids.forEach(createPetWindow);
  createTray();
  // Certaines applications plein écran repassent devant : on réaffirme régulièrement
  setInterval(keepOnTop, 4000);
  setInterval(sendCursor, 80);
  setInterval(checkMeetings, 1000);
  checkForUpdates();
  setInterval(checkForUpdates, 6 * 3600 * 1000);
});

app.on('before-quit', () => { for (const p of pets.values()) saveWindowPosition(p); });
app.on('window-all-closed', () => app.quit());
