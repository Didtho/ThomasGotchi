const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const W = 240;
const H = 300;
const isMac = process.platform === 'darwin';

let win = null;
let tray = null;
let dragTimer = null;
let ignoring = true;
// Hauteur ajoutée au-dessus / en dessous du petit être pendant qu'une fenêtre de réglages est ouverte
let expandUp = 0;
let expandDown = 0;

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

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function defaultPosition() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - W - 60, y: wa.y + wa.height - H };
}

function initialPosition() {
  const saved = readJson('window.json');
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    // On vérifie que la position est encore sur un écran branché
    const visible = screen.getAllDisplays().some(({ workArea: wa }) =>
      saved.x + W / 2 >= wa.x && saved.x + W / 2 <= wa.x + wa.width &&
      saved.y + H / 2 >= wa.y && saved.y + H / 2 <= wa.y + wa.height);
    if (visible) return saved;
  }
  return defaultPosition();
}

function placeWindow(x, y) {
  if (!win || win.isDestroyed()) return;
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: W, height: H + expandUp + expandDown });
}

function keepOnTop() {
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(true, 'screen-saver');
}

function createWindow() {
  const pos = initialPosition();
  win = new BrowserWindow({
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

  keepOnTop();
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Certaines applications plein écran repassent devant : on réaffirme régulièrement
  setInterval(keepOnTop, 4000);

  win.on('closed', () => { win = null; });
}

function saveWindowPosition() {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  try { writeJson('window.json', { x, y: y + expandUp }); } catch { /* sans gravité */ }
}

function toggleVisible() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else { win.show(); keepOnTop(); }
  buildTrayMenu();
}

function buildTrayMenu() {
  if (!tray) return;
  const login = app.getLoginItemSettings().openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: win && win.isVisible() ? 'Cacher' : 'Afficher', click: toggleVisible },
    { label: 'Ramener au coin de l\'écran', click: () => { const p = defaultPosition(); placeWindow(p.x, p.y); win.show(); } },
    { label: 'Réglages…', click: () => { win.show(); win.webContents.send('menu', 'settings'); } },
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

// ---- Communication avec la fenêtre ----

ipcMain.on('set-ignore', (_e, ignore) => {
  if (!win || ignore === ignoring) return;
  ignoring = ignore;
  win.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.on('drag-start', () => {
  if (!win) return;
  clearInterval(dragTimer);
  const c = screen.getCursorScreenPoint();
  const [wx, wy] = win.getPosition();
  const ox = c.x - wx;
  const oy = c.y - wy;
  dragTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    placeWindow(p.x - ox, p.y - oy);
  }, 10);
});

ipcMain.handle('drag-end', () => {
  clearInterval(dragTimer);
  dragTimer = null;
  saveWindowPosition();
});

ipcMain.handle('expand', (_e, extra) => {
  if (!win) return null;
  if (expandUp || expandDown) return { above: expandUp > 0 };
  const b = win.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  // Vers le haut s'il y a la place, sinon vers le bas (petit être collé en haut de l'écran)
  if (b.y - extra >= wa.y) expandUp = extra;
  else expandDown = extra;
  win.setBounds({ x: b.x, y: b.y - expandUp, width: W, height: H + extra });
  return { above: expandUp > 0 };
});

ipcMain.handle('collapse', () => {
  if (!win || !(expandUp || expandDown)) return;
  const b = win.getBounds();
  const up = expandUp;
  expandUp = 0;
  expandDown = 0;
  win.setBounds({ x: b.x, y: b.y + up, width: W, height: H });
});

// Distance verticale entre une hauteur et une zone d'écran (0 si elle est dedans)
function verticalGap(wa, y) {
  if (y < wa.y) return wa.y - y;
  if (y > wa.y + wa.height) return y - (wa.y + wa.height);
  return 0;
}

// Promenade : il peut passer d'un écran à l'autre. Il est bloqué seulement quand le milieu
// de son corps sortirait de tous les écrans.
ipcMain.handle('move-by', (_e, dx, dy) => {
  if (!win || dragTimer) return null;
  const b = win.getBounds();
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
  placeWindow(b.x + dx, ny);
  return { blockedLeft: false, blockedRight: false };
});

// ---- Crottes posées sur le bureau : chacune est une petite fenêtre qu'on clique pour nettoyer ----

const POOP = 56;
const poopWindows = new Map();

function createPoop(id, x, y, style) {
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
  // Un cran en dessous du petit être, pour qu'il passe devant en marchant
  w.setAlwaysOnTop(true, 'floating');
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  w.loadFile(path.join(__dirname, 'src', 'poop.html'), { query: { style: style || 'cute' } });
  poopWindows.set(id, w);
  w.on('closed', () => poopWindows.delete(id));
}

function onSomeScreen(x, y) {
  return screen.getAllDisplays().some(({ workArea: wa }) =>
    x + POOP / 2 >= wa.x && x + POOP / 2 <= wa.x + wa.width &&
    y + POOP / 2 >= wa.y && y + POOP / 2 <= wa.y + wa.height);
}

// Nouvelle crotte à côté de ses pattes ; renvoie sa position pour la sauvegarde
function poopNextToPet(id, side, style) {
  const b = win.getBounds();
  const x = Math.round(b.x + W / 2 + side * (75 + Math.random() * 45) - POOP / 2);
  const y = Math.round(b.y + expandUp + H - POOP + 2);
  createPoop(id, x, y, style);
  return { x, y };
}

ipcMain.handle('poop-add', (_e, id, side, style) => (win ? poopNextToPet(id, side, style) : null));

// Au démarrage : on remet les crottes là où elles étaient (ou près de lui si l'écran a été débranché)
ipcMain.handle('poop-restore', (_e, spots, style) => spots.map((s, i) => {
  if (onSomeScreen(s.x, s.y)) {
    createPoop(s.id, s.x, s.y, style);
    return s;
  }
  return { id: s.id, ...poopNextToPet(s.id, i % 2 ? 1 : -1, style) };
}));

ipcMain.on('poop-clean', (e) => {
  for (const [id, w] of poopWindows) {
    if (w.webContents === e.sender) {
      w.close();
      if (win) win.webContents.send('poop-cleaned', id);
    }
  }
});

ipcMain.on('poop-clear-all', () => {
  for (const w of poopWindows.values()) w.close();
});

ipcMain.handle('load-state', () => readJson('pet.json'));
ipcMain.handle('save-state', (_e, state) => {
  try { writeJson('pet.json', state); return true; } catch { return false; }
});
ipcMain.handle('get-login', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('set-login', (_e, on) => {
  app.setLoginItemSettings({ openAtLogin: !!on });
  buildTrayMenu();
});
ipcMain.on('quit', () => app.quit());

// ---- Cycle de vie ----

app.on('second-instance', () => { if (win) { win.show(); keepOnTop(); } });

app.setAppUserModelId('com.thomasgotchi.app'); // nom affiché dans les notifications Windows

app.whenReady().then(() => {
  if (isMac && app.dock) app.dock.hide();
  createWindow();
  createTray();
});

app.on('before-quit', saveWindowPosition);
app.on('window-all-closed', () => app.quit());
