const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, net, Notification, dialog, powerMonitor } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const W = 240;
const H = 300;
const MAX_PETS = 5;

// ---- Langue : automatique (celle de l'ordinateur) ou choisie dans les réglages ----
const LOCALES = {
  en: require('./src/locales/en.js'),
  es: require('./src/locales/es.js'),
  it: require('./src/locales/it.js'),
};
let langSetting = 'auto';

function currentLang() {
  if (langSetting !== 'auto') return langSetting;
  const l = (app.getLocale() || 'fr').slice(0, 2);
  return ['fr', 'en', 'es', 'it'].includes(l) ? l : 'en';
}

// Même principe que src/i18n.js : le texte français sert de clé
function tr(text, params) {
  const dict = LOCALES[currentLang()];
  let s = (dict && dict[text]) || text;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? params[k] : m));
  return s;
}
const isMac = process.platform === 'darwin';

let tray = null;
let updateUrl = null; // page de la nouvelle version (Mac : mise à jour manuelle)
let updateState = null; // Windows : { status: 'downloading' | 'ready', version }

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
  // Au chargement, il apprend si le mode « ne pas déranger » est actif
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('dnd', dnd);
    if (weather) win.webContents.send('weather', weather);
  });
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
    ? { label: tr('Réglages…'), click: () => openSettings(list[0]) }
    : { label: tr('Réglages'), submenu: list.map((p) => ({ label: p.name || tr('Œuf'), click: () => openSettings(p) })) };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `ThomasGotchi v${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: tr(anyVisible() ? 'Cacher' : 'Afficher'), click: toggleVisible },
    {
      label: tr('Ramener au coin de l\'écran'),
      click: () => list.forEach((p, i) => { const d = defaultPosition(i); placeWindow(p, d.x, d.y); if (alive(p)) p.win.show(); }),
    },
    settings,
    { label: tr('Adopter un autre animal'), enabled: list.length < MAX_PETS, click: adoptPet },
    { label: tr(yarn ? 'Ranger la pelote de laine' : 'Sortir la pelote de laine 🧶'), click: toggleYarn },
    { label: tr('Gamelle 🥣'), type: 'checkbox', checked: !!furniture, click: () => (furniture ? removeFurniture() : spawnFurniture()) },
    { type: 'separator' },
    { label: tr('🔕 Ne pas déranger'), type: 'checkbox', checked: dnd, click: (item) => setDnd(item.checked) },
    { label: tr('🏖️ Pause vacances (tous)'), type: 'checkbox', checked: allPaused, click: (item) => setAllPaused(item.checked) },
    { label: tr('Importer un animal…'), enabled: list.length < MAX_PETS, click: importPet },
    updateMenuItem(),
    { type: 'separator' },
    {
      label: tr('Lancer au démarrage'), type: 'checkbox', checked: login,
      click: (item) => { app.setLoginItemSettings({ openAtLogin: item.checked }); },
    },
    { type: 'separator' },
    { label: tr('Quitter'), click: () => app.quit() },
  ]));
}

function createTray() {
  let icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  icon = icon.resize({ width: isMac ? 18 : 16, height: isMac ? 18 : 16 });
  tray = new Tray(icon);
  tray.setToolTip(`ThomasGotchi v${app.getVersion()}`);
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
  if (p.expandUp || p.expandDown) return { above: p.expandUp > 0, extra: p.expandUp || p.expandDown };
  const b = p.win.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  const roomUp = Math.max(0, b.y - wa.y);
  const roomDown = Math.max(0, wa.y + wa.height - (b.y + b.height));
  // Vers le haut s'il y a la place, sinon vers le bas ; si aucun côté ne suffit, on prend le plus grand
  // (la fenêtre de réglages défilera) : elle ne sort jamais de l'écran
  if (roomUp >= extra) p.expandUp = extra;
  else if (roomDown >= extra) p.expandDown = extra;
  else if (roomUp >= roomDown) p.expandUp = roomUp;
  else p.expandDown = roomDown;
  p.win.setBounds({ x: b.x, y: b.y - p.expandUp, width: W, height: H + p.expandUp + p.expandDown });
  return { above: p.expandUp > 0, extra: p.expandUp || p.expandDown };
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

// Promenade : il peut passer d'un écran à l'autre. Il s'arrête un peu avant le bord extérieur
// des écrans, pour rester entièrement visible.
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
  const ahead = feetX + Math.sign(dx) * 55;
  const room = screen.getAllDisplays().some(({ workArea: wa }) => ahead >= wa.x && ahead < wa.x + wa.width);
  if (!target || !room) return { blockedLeft: dx < 0, blockedRight: dx > 0 };

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
ipcMain.handle('get-version', () => app.getVersion());
ipcMain.on('adopt', adoptPet);
ipcMain.on('release', (e) => { const p = petOf(e.sender); if (p) releasePet(p); });
ipcMain.on('quit', () => app.quit());

// ---- Crottes posées sur le bureau : chacune est une petite fenêtre qu'on clique pour nettoyer ----

const POOP = 56;
const poopWindows = new Map(); // id -> { win, owner }

function createPoop(owner, id, x, y, style, kind, edge) {
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
  w.loadFile(path.join(__dirname, 'src', 'poop.html'), { query: { style: style || 'cute', kind: kind || 'poop', edge: edge || '' } });
  poopWindows.set(id, { win: w, owner: owner.id, kind: kind || 'poop' });
  w.on('closed', () => poopWindows.delete(id));
}

function onSomeScreen(x, y) {
  return screen.getAllDisplays().some(({ workArea: wa }) =>
    x + POOP / 2 >= wa.x && x + POOP / 2 <= wa.x + wa.width &&
    y + POOP / 2 >= wa.y && y + POOP / 2 <= wa.y + wa.height);
}

// Nouvelle crotte à côté de ses pattes ; renvoie sa position pour la sauvegarde
function poopNextToPet(p, id, side, style, kind, edge) {
  const b = p.win.getBounds();
  // Contre le bord de l'écran : juste sous la patte levée ; sinon un peu à côté de lui
  const dist = edge ? 50 : 75 + Math.random() * 45;
  const wa = screen.getDisplayMatching(b).workArea;
  let x = Math.round(Math.min(Math.max(b.x + W / 2 + side * dist - POOP / 2, wa.x), wa.x + wa.width - POOP));
  let y = Math.round(b.y + p.expandUp + H - POOP + 2);
  if (kind === 'egg') {
    // Œufs de Pâques cachés n'importe où sur l'écran
    x = Math.round(wa.x + 40 + Math.random() * (wa.width - 80 - POOP));
    y = Math.round(wa.y + 80 + Math.random() * (wa.height - 120 - POOP));
  }
  createPoop(p, id, x, y, style, kind, edge);
  return { x, y };
}

ipcMain.handle('poop-add', (e, id, side, style, kind, edge) => {
  const p = petOf(e.sender);
  return p ? poopNextToPet(p, id, side, style, kind, edge) : null;
});

// Au démarrage : on remet les crottes là où elles étaient (ou près de lui si l'écran a été débranché)
ipcMain.handle('poop-restore', (e, spots, style) => {
  const p = petOf(e.sender);
  if (!p) return [];
  return spots.map((s, i) => {
    if (onSomeScreen(s.x, s.y)) {
      createPoop(p, s.id, s.x, s.y, style, s.kind, s.edge);
      return s;
    }
    return { ...s, ...poopNextToPet(p, s.id, i % 2 ? 1 : -1, style, s.kind, s.edge) };
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
  for (const poop of poopWindows.values()) {
    if (poop.owner === p.id && (poop.kind === 'poop' || poop.kind === 'pee') && !poop.win.isDestroyed()) poop.win.close();
  }
});

// ---- Pelote de laine : roule en bas de l'écran, les animaux courent après ----

const YARN_H = 90;
let yarn = null; // { win, wa, x (écran), vx, angle, trail, unrolled, ticks }

const yarnRadius = (y) => Math.max(5, 15 - y.unrolled / 180); // elle rapetisse en se déroulant

function spawnYarn() {
  const first = [...pets.values()].find(alive);
  const wa = first ? screen.getDisplayMatching(first.win.getBounds()).workArea : screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
    x: wa.x,
    y: wa.y + wa.height - YARN_H,
    width: wa.width,
    height: YARN_H,
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
      preload: path.join(__dirname, 'preload-yarn.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Un cran en dessous des animaux, pour qu'ils passent devant
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'src', 'yarn.html'));
  const start = first ? first.win.getBounds().x + W / 2 + 110 : wa.x + wa.width / 2;
  const x = Math.min(Math.max(start, wa.x + 30), wa.x + wa.width - 30);
  yarn = { win, wa, x, vx: 0, angle: 0, trail: [x], unrolled: 0, ticks: 0 };
  win.on('closed', () => { if (yarn && yarn.win === win) yarn = null; });
  buildTrayMenu();
}

function removeYarn() {
  if (!yarn) return;
  const w = yarn.win;
  yarn = null;
  if (!w.isDestroyed()) w.close();
  for (const p of pets.values()) if (alive(p)) p.win.webContents.send('yarn', null);
  buildTrayMenu();
}

function toggleYarn() {
  if (yarn) removeYarn(); else spawnYarn();
}

function yarnTick() {
  if (!yarn || yarn.win.isDestroyed()) return;
  const y = yarn;
  const r = yarnRadius(y);
  const moving = Math.abs(y.vx) > 0.05;
  if (moving) {
    y.x += y.vx;
    y.vx *= 0.965;
    const min = y.wa.x + r + 2, max = y.wa.x + y.wa.width - r - 2;
    if (y.x < min) { y.x = min; y.vx = -y.vx * 0.6; }
    if (y.x > max) { y.x = max; y.vx = -y.vx * 0.6; }
    y.angle += y.vx / r;
    if (r > 5) {
      y.unrolled += Math.abs(y.vx);
      const last = y.trail[y.trail.length - 1];
      if (Math.abs(y.x - last) > 8) {
        y.trail.push(y.x);
        if (y.trail.length > 600) y.trail.shift();
      }
    }
  } else {
    y.vx = 0;
  }
  // Pelote immobile : on ne redessine qu'une fois par demi-seconde
  if (moving || ++y.ticks % 15 === 0) {
    y.win.webContents.send('yarn-state', { x: y.x - y.wa.x, r, angle: y.angle, trail: y.trail.map((t) => t - y.wa.x) });
  }
  for (const p of pets.values()) {
    if (!alive(p) || !p.win.isVisible()) continue;
    p.win.webContents.send('yarn', { x: y.x - p.win.getBounds().x, moving: Math.abs(y.vx) > 0.5 });
  }
}

ipcMain.on('yarn-toggle', toggleYarn);
ipcMain.on('yarn-kick', (_e, dir) => { if (yarn) yarn.vx += dir * (6 + Math.random() * 6); });
ipcMain.on('yarn-rewind', () => {
  if (!yarn) return;
  yarn.trail = [yarn.x];
  yarn.unrolled = 0;
  yarn.vx = 0;
});
ipcMain.on('yarn-ignore', (_e, ignore) => {
  if (yarn && !yarn.win.isDestroyed()) yarn.win.setIgnoreMouseEvents(ignore, { forward: true });
});

// ---- Gamelle : partagée par tous les animaux, posée en bas de l'écran ----

const FURN = { bowl: { w: 84, h: 50 } };
let furniture = null; // { bowl: { win, x, food, water } }

function furnitureArea() {
  const first = [...pets.values()].find(alive);
  return first ? screen.getDisplayMatching(first.win.getBounds()).workArea : screen.getPrimaryDisplay().workArea;
}

function saveFurniture() {
  const f = furniture;
  try {
    writeJson('furniture.json', f
      ? { on: true, bowl: { x: f.bowl.x, food: f.bowl.food, water: f.bowl.water } }
      : { on: false });
  } catch { /* sans gravité */ }
}

function createFurnitureWindow(kind, x) {
  const { w, h } = FURN[kind];
  const wa = screen.getAllDisplays().map((d) => d.workArea).find((a) => x >= a.x && x < a.x + a.width) || furnitureArea();
  const win = new BrowserWindow({
    width: w, height: h,
    x: Math.round(Math.min(Math.max(x - w / 2, wa.x), wa.x + wa.width - w)),
    y: wa.y + wa.height - h,
    transparent: true, frame: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: false, focusable: false, alwaysOnTop: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload-furniture.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'src', 'furniture.html'), { query: { kind } });
  win.webContents.on('did-finish-load', sendFurnitureState);
  return win;
}

function spawnFurniture(saved) {
  if (furniture) return;
  const first = [...pets.values()].find(alive);
  const px = first ? first.win.getBounds().x + W / 2 : furnitureArea().x + 300;
  const s = saved && saved.bowl ? saved : { bowl: { x: px - 170, food: 100, water: 100 } };
  furniture = { bowl: { ...s.bowl, win: createFurnitureWindow('bowl', s.bowl.x) } };
  saveFurniture();
  buildTrayMenu();
}

function removeFurniture() {
  if (!furniture) return;
  if (!furniture.bowl.win.isDestroyed()) furniture.bowl.win.destroy();
  furniture = null;
  saveFurniture();
  for (const p of pets.values()) if (alive(p)) p.win.webContents.send('furniture', null);
  buildTrayMenu();
}

function sendFurnitureState() {
  if (!furniture) return;
  const { bowl } = furniture;
  if (!bowl.win.isDestroyed()) bowl.win.webContents.send('furn-state', { food: bowl.food, water: bowl.water });
}

// Les animaux savent où est la gamelle (position par rapport à leur fenêtre)
function sendFurnitureToPets() {
  if (!furniture) return;
  for (const p of pets.values()) {
    if (!alive(p)) continue;
    const bx = p.win.getBounds().x;
    p.win.webContents.send('furniture', {
      bowl: { x: furniture.bowl.x - bx, food: furniture.bowl.food, water: furniture.bowl.water },
    });
  }
}

function furnitureOf(sender) {
  if (!furniture) return null;
  return !furniture.bowl.win.isDestroyed() && furniture.bowl.win.webContents === sender ? 'bowl' : null;
}

ipcMain.on('furn-click', (e) => {
  const k = furnitureOf(e.sender);
  if (k === 'bowl') Object.assign(furniture.bowl, { food: 100, water: 100 });
  sendFurnitureState();
  saveFurniture();
});

let furnDrag = null;
ipcMain.on('furn-drag-start', (e) => {
  const k = furnitureOf(e.sender);
  if (!k) return;
  const item = furniture[k];
  const ox = screen.getCursorScreenPoint().x - item.win.getBounds().x;
  clearInterval(furnDrag);
  furnDrag = setInterval(() => {
    if (!furniture || item.win.isDestroyed()) return clearInterval(furnDrag);
    // Elle glisse le long du bas de l'écran (et peut changer d'écran)
    const cx = screen.getCursorScreenPoint().x;
    const wa = screen.getAllDisplays().map((d) => d.workArea).find((a) => cx >= a.x && cx < a.x + a.width) || furnitureArea();
    const { w, h } = FURN[k];
    const x = Math.round(Math.min(Math.max(cx - ox, wa.x), wa.x + wa.width - w));
    item.win.setBounds({ x, y: wa.y + wa.height - h, width: w, height: h });
    item.x = x + w / 2;
  }, 16);
});
ipcMain.on('furn-drag-end', () => { clearInterval(furnDrag); saveFurniture(); });

// Un animal se sert : renvoie la quantité obtenue (0 si le bol est vide)
ipcMain.handle('bowl-use', (_e, what) => {
  if (!furniture) return 0;
  const key = what === 'water' ? 'water' : 'food';
  const amount = Math.min(25, furniture.bowl[key]);
  furniture.bowl[key] -= amount;
  sendFurnitureState();
  saveFurniture();
  return amount;
});


// ---- Export / import d'un animal (fichier .thomasgotchi) ----

ipcMain.handle('export-pet', async (e, state) => {
  const p = petOf(e.sender);
  if (!p || !state) return false;
  const res = await dialog.showSaveDialog(p.win, {
    title: tr('Exporter {name}', { name: state.name }),
    defaultPath: path.join(app.getPath('documents'), `${state.name}.thomasgotchi`),
    filters: [{ name: tr('Animal ThomasGotchi'), extensions: ['thomasgotchi'] }],
  });
  if (res.canceled || !res.filePath) return false;
  // Les crottes et surprises restent sur ce bureau-ci
  const pet = { ...state, poops: 0, poopSpots: [], treatSpots: [], poopAt: null, peeAt: null };
  fs.writeFileSync(res.filePath, JSON.stringify({ format: 'thomasgotchi', exportedAt: Date.now(), pet }, null, 1));
  return true;
});

async function importPet() {
  const res = await dialog.showOpenDialog({
    title: tr('Importer un animal'),
    filters: [{ name: tr('Animal ThomasGotchi'), extensions: ['thomasgotchi', 'json'] }],
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths.length) return;
  let pet = null;
  try {
    const data = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8'));
    if (data.format === 'thomasgotchi' && data.pet && data.pet.version === 1 && typeof data.pet.name === 'string') pet = data.pet;
  } catch { /* fichier illisible */ }
  if (!pet) return dialog.showMessageBox({ type: 'warning', message: tr('Ce fichier n\'est pas un animal ThomasGotchi.') });
  if (pets.size >= MAX_PETS) return dialog.showMessageBox({ type: 'info', message: tr('Il y a déjà {n} animaux : laisses-en partir un avant d\'en importer un autre.', { n: MAX_PETS }) });
  // Le temps écoulé depuis l'export ne compte pas : il reprend sa vie là où elle s'était arrêtée
  pet.lastTick = Date.now();
  const id = Date.now().toString(36);
  writeJson(stateFile(id), pet);
  createPetWindow(id);
  savePetList();
  buildTrayMenu();
}

// ---- Pause vacances et « ne pas déranger » (pour tous les animaux) ----

let dnd = false;
let allPaused = false;

function sendToPets(channel, value) {
  for (const p of pets.values()) if (alive(p)) p.win.webContents.send(channel, value);
}

function saveSettings() {
  try { writeJson('settings.json', { dnd, city, lang: langSetting }); } catch { /* sans gravité */ }
}

ipcMain.on('get-lang', (e) => { e.returnValue = { setting: langSetting, lang: currentLang() }; });
ipcMain.on('set-lang', (_e, value) => {
  langSetting = ['auto', 'fr', 'en', 'es', 'it'].includes(value) ? value : 'auto';
  saveSettings();
  sendToPets('lang', currentLang());
  buildTrayMenu();
});

function setDnd(on) {
  dnd = on;
  sendToPets('dnd', dnd);
  saveSettings();
  buildTrayMenu();
}

function setAllPaused(on) {
  allPaused = on;
  sendToPets('menu', on ? 'pause' : 'resume');
  buildTrayMenu();
}

// ---- Ce que les animaux perçoivent autour d'eux ----

// Position de la souris, pour que leurs yeux la suivent
let lastCursor = '';
function sendCursor() {
  const c = screen.getCursorScreenPoint();
  const key = c.x + ',' + c.y;
  if (key === lastCursor) return;
  lastCursor = key;
  cursorMovedAt = Date.now();
  for (const p of pets.values()) {
    if (!alive(p) || !p.win.isVisible()) continue;
    const b = p.win.getBounds();
    p.win.webContents.send('cursor', { x: c.x - b.x, y: c.y - b.y });
  }
}

// ---- Amitié : deux animaux qui se croisent jouent ensemble et deviennent amis ----
// Points d'amitié par paire (0 à 100), sauvegardés dans friends.json

let friendship = {};
const friendLevel = (pts) => (pts >= 60 ? 'meilleurs amis' : pts >= 20 ? 'copains' : 'connaissances');

function saveFriendship() {
  try { writeJson('friends.json', friendship); } catch { /* sans gravité */ }
}

const lastMeet = new Map();
function checkMeetings() {
  const list = [...pets.values()].filter((p) => alive(p) && p.active && p.win.isVisible() && !p.dragTimer);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const ba = a.win.getBounds(), bb = b.win.getBounds();
      const close = Math.abs(ba.x - bb.x) < 110 && Math.abs((ba.y + ba.height) - (bb.y + bb.height)) < 60;
      const key = [a.id, b.id].sort().join('|');
      if (!close || Date.now() - (lastMeet.get(key) || 0) < 45000) continue;
      lastMeet.set(key, Date.now());
      const before = friendLevel(friendship[key] || 0);
      friendship[key] = Math.min(100, (friendship[key] || 0) + 5);
      const level = friendLevel(friendship[key]);
      saveFriendship();
      // Plus ils sont amis, plus leurs jeux sont variés et tendres
      const games = ['hug', 'chase', 'jump'];
      if (level !== 'connaissances') games.push('groom', 'tussle');
      if (level === 'meilleurs amis') games.push('hug', 'groom');
      const game = games[Math.floor(Math.random() * games.length)];
      const levelUp = level !== before ? level : null;
      a.win.webContents.send('meet', { name: b.name, side: bb.x > ba.x ? 1 : -1, game, role: 'flee', levelUp });
      b.win.webContents.send('meet', { name: a.name, side: ba.x > bb.x ? 1 : -1, game, role: 'chase', levelUp });
    }
  }
}

// Chaque animal sait où sont ses amis (pour aller les voir) et où en est leur amitié (pour le carnet)
function sendFriends() {
  const list = [...pets.values()].filter((p) => alive(p));
  for (const p of list) {
    const bx = p.win.getBounds().x;
    p.win.webContents.send('friends', list.filter((o) => o !== p && o.active).map((o) => {
      const pts = friendship[[p.id, o.id].sort().join('|')] || 0;
      return { name: o.name, x: o.win.getBounds().x - bx, points: pts, level: friendLevel(pts) };
    }));
  }
}

// ---- Voix : on utilise la synthèse vocale du système (Windows : voix française installée ; Mac : say) ----

let speaking = null;
ipcMain.on('speak', (_e, text) => {
  if (typeof text !== 'string' || !text.trim() || speaking) return;
  text = text.slice(0, 120);
  if (isMac) {
    const macVoice = { fr: 'Amelie', en: 'Samantha', es: 'Monica', it: 'Alice' }[currentLang()];
    speaking = spawn('say', ['-v', macVoice, '-r', '190', text]);
    speaking.on('error', () => { speaking = null; });
  } else {
    // Le texte passe par une variable d'environnement (jamais dans la commande elle-même)
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      // Une voix de la langue choisie ; s'il n'y en a pas, il reste muet plutôt que de parler avec un accent étranger
      '$v = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like ($env:TG_LANG + "*") } | Select-Object -First 1',
      'if (-not $v) { exit }',
      '$s.SelectVoice($v.VoiceInfo.Name)',
      '$t = [Security.SecurityElement]::Escape($env:TG_TEXT)',
      // Voix plus aiguë et un peu plus rapide : un petit animal
      '$s.SpeakSsml("<speak version=\'1.0\' xmlns=\'http://www.w3.org/2001/10/synthesis\' xml:lang=\'" + $v.VoiceInfo.Culture.Name + "\'><prosody pitch=\'+45%\' rate=\'+10%\'>$t</prosody></speak>")',
    ].join('; ');
    speaking = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      env: { ...process.env, TG_TEXT: text, TG_LANG: currentLang() },
      windowsHide: true,
    });
    speaking.on('error', () => { speaking = null; });
  }
  speaking.on('exit', () => { speaking = null; });
});

// ---- Météo réelle (Open-Meteo : gratuit, sans compte) ----

let city = 'Lyon';
let cityGeo = null; // { name, lat, lon } trouvé pour la ville choisie
let weather = null; // { city, condition, temp, isDay }

// Codes météo de l'OMM -> grandes familles qu'on sait dessiner
function weatherCondition(code) {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2 || code === 3) return 'clouds';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  return 'clouds';
}

async function fetchWeather() {
  if (!city) {
    weather = null;
    sendToPets('weather', null);
    return;
  }
  try {
    if (!cityGeo || cityGeo.query !== city) {
      const g = await (await net.fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr`)).json();
      const r = g.results && g.results[0];
      if (!r) { weather = null; sendToPets('weather', null); return; }
      cityGeo = { query: city, name: r.name, lat: r.latitude, lon: r.longitude };
    }
    const f = await (await net.fetch(`https://api.open-meteo.com/v1/forecast?latitude=${cityGeo.lat}&longitude=${cityGeo.lon}&current=temperature_2m,weather_code,is_day&timezone=auto`)).json();
    const c = f.current;
    weather = { city: cityGeo.name, condition: weatherCondition(c.weather_code), temp: Math.round(c.temperature_2m), isDay: c.is_day === 1 };
    sendToPets('weather', weather);
  } catch { /* hors ligne : on garde la dernière météo connue */ }
}

ipcMain.handle('get-city', () => city);
ipcMain.handle('set-city', (_e, c) => {
  city = String(c || '').trim().slice(0, 60);
  saveSettings();
  fetchWeather();
  return city;
});

// ---- Ce que fait l'utilisateur sur l'ordinateur ----
// Clavier très utilisé (la souris ne bouge pas mais l'ordinateur est actif) → il conseille une pause.
// Retour après une longue absence → il fait la fête.

let cursorMovedAt = Date.now();
let awaySince = 0;
let lastTypingTip = 0;
function watchUser() {
  const idle = powerMonitor.getSystemIdleTime(); // secondes sans clavier ni souris
  const now = Date.now();
  if (idle >= 600 && !awaySince) awaySince = now - idle * 1000;
  if (idle < 5 && awaySince) {
    sendToPets('user-event', { type: 'back', minutes: Math.round((now - awaySince) / 60000) });
    awaySince = 0;
  }
  if (idle < 3 && now - cursorMovedAt > 120000 && now - lastTypingTip > 30 * 60000) {
    lastTypingTip = now;
    sendToPets('user-event', { type: 'typing' });
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

// onClick : action quand on clique sur la notification
function notify(body, onClick) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: 'ThomasGotchi', body });
  if (onClick) n.on('click', onClick);
  n.show();
}

let manualUpdateCheck = false; // recherche lancée depuis le menu : on guide l'utilisateur jusqu'au bout

function installUpdate() {
  require('electron-updater').autoUpdater.quitAndInstall();
}

// Ligne du menu de l'icône selon l'état de la mise à jour
function updateMenuItem() {
  if (updateState && updateState.status === 'ready') {
    return { label: tr('🔄 Redémarrer pour installer la v{v}', { v: updateState.version }), click: installUpdate };
  }
  if (updateState && updateState.status === 'downloading') {
    return { label: tr('⬇ Téléchargement de la v{v}…', { v: updateState.version }), enabled: false };
  }
  if (updateUrl) return { label: tr('⬇ Nouvelle version disponible'), click: () => shell.openExternal(updateUrl) };
  return { label: tr('Rechercher une mise à jour'), enabled: app.isPackaged, click: () => checkForUpdates(true) };
}

function setupAutoUpdater() {
  if (isMac || !app.isPackaged) return;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.on('update-available', (info) => {
    updateState = { status: 'downloading', version: info.version };
    buildTrayMenu();
    if (manualUpdateCheck) notify(tr('Nouvelle version {v} trouvée : téléchargement en cours…', { v: info.version }));
  });
  autoUpdater.on('update-downloaded', async (info) => {
    updateState = { status: 'ready', version: info.version };
    buildTrayMenu();
    if (manualUpdateCheck) {
      // Recherche lancée par l'utilisateur : on lui propose tout de suite d'installer
      manualUpdateCheck = false;
      const { response } = await dialog.showMessageBox({
        type: 'info',
        title: 'ThomasGotchi',
        message: tr('La version {v} est prête.', { v: info.version }),
        detail: tr('ThomasGotchi va redémarrer pour l\'installer. Tes animaux sont conservés.'),
        buttons: [tr('Redémarrer maintenant'), tr('Plus tard')],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) installUpdate();
    } else {
      // Trouvée en arrière-plan : simple notification ; un clic dessus lance l'installation
      notify(tr('La version {v} est prête : clique ici pour l\'installer (ou elle s\'installera à la prochaine ouverture).', { v: info.version }), installUpdate);
    }
  });
  autoUpdater.on('error', () => {
    if (updateState && updateState.status === 'downloading') updateState = null;
    buildTrayMenu();
  });
}

// manual : lancé depuis le menu, on prévient aussi quand il n'y a rien de nouveau
async function checkForUpdates(manual = false) {
  if (!app.isPackaged) return;
  try {
    if (isMac) {
      const res = await net.fetch('https://api.github.com/repos/Didtho/ThomasGotchi/releases/latest');
      const tag = ((await res.json()).tag_name || '').replace(/^v/, '');
      if (tag && newer(tag, app.getVersion())) { updateUrl = RELEASES; buildTrayMenu(); }
      else if (manual) notify(tr('Tu as déjà la dernière version (v{v}).', { v: app.getVersion() }));
    } else {
      const { autoUpdater } = require('electron-updater');
      manualUpdateCheck = manual;
      const result = await autoUpdater.checkForUpdates();
      const latest = result && result.updateInfo && result.updateInfo.version;
      if (manual && (!latest || !newer(latest, app.getVersion()))) notify(tr('Tu as déjà la dernière version (v{v}).', { v: app.getVersion() }));
    }
  } catch {
    if (manual) notify(tr('Impossible de vérifier les mises à jour (pas de connexion ?).'));
  }
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
  friendship = readJson('friends.json') || {};
  setInterval(checkMeetings, 1000);
  setInterval(sendFriends, 1000);
  setInterval(watchUser, 5000);
  setInterval(yarnTick, 33);
  setInterval(sendFurnitureToPets, 500);
  const furn = readJson('furniture.json');
  if (furn && furn.on) spawnFurniture(furn);
  const settings = readJson('settings.json') || {};
  dnd = !!settings.dnd;
  if (typeof settings.city === 'string') city = settings.city;
  if (typeof settings.lang === 'string') langSetting = settings.lang;
  buildTrayMenu();
  fetchWeather();
  setInterval(fetchWeather, 30 * 60000);
  setupAutoUpdater();
  checkForUpdates();
  setInterval(checkForUpdates, 6 * 3600 * 1000);
});

app.on('before-quit', () => { for (const p of pets.values()) saveWindowPosition(p); });
app.on('window-all-closed', () => app.quit());
