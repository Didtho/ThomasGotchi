const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, net, Notification, dialog, powerMonitor, clipboard } = require('electron');
const os = require('os');
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

const alive = (p) => !!(p && p.win && !p.win.isDestroyed());

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
    enableLargerThanScreen: true, // Mac : sinon la fenêtre ne peut pas dépasser en haut de l'écran (sous la barre des menus)
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
  win.on('closed', () => { p.win = null; if (p.zone && !p.zone.isDestroyed()) p.zone.destroy(); });
  if (USE_DROP_ZONE) createDropZone(p);
  // Au chargement, il apprend si le mode « ne pas déranger » est actif
  win.webContents.once('did-finish-load', () => setTimeout(() => fallToFloor(p), 1500));
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('dnd', dnd);
    if (weather) win.webContents.send('weather', weather);
  });
  return p;
}

// ---- Mac : zone de dépôt posée sur l'animal ----
// Sur Mac, une fenêtre qui laisse passer la souris ne reçoit jamais un fichier glissé, même si elle se remet à capter
// la souris quand il arrive (vu dans le journal de diagnostic). Une petite fenêtre invisible qui capte toujours la
// souris est donc posée sur le corps de l'animal : elle reçoit les fichiers et transmet clics et mouvements à l'animal.
// TG_DROP_ZONE=1 l'active ailleurs, pour la tester.
const USE_DROP_ZONE = isMac || process.env.TG_DROP_ZONE === '1';

function createDropZone(p) {
  const zone = new BrowserWindow({
    width: 100, height: 100, show: false,
    transparent: true, frame: false, resizable: false, movable: false, maximizable: false, minimizable: false,
    fullscreenable: false, skipTaskbar: true, hasShadow: false, focusable: false, alwaysOnTop: true,
    enableLargerThanScreen: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload-dropzone.js'), contextIsolation: true, nodeIntegration: false },
  });
  zone.setAlwaysOnTop(true, 'screen-saver', 1); // un cran au-dessus de l'animal
  zone.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  zone.loadFile(path.join(__dirname, 'src', 'dropzone.html'));
  p.zone = zone;
  p.zoneBox = null; // silhouette de l'animal dans sa fenêtre : { x, y, w, h }
  p.win.on('move', () => syncDropZone(p));
  p.win.on('show', () => syncDropZone(p));
  p.win.on('hide', () => syncDropZone(p));
}

// La zone suit l'animal ; elle s'efface quand il est caché ou qu'une fenêtre de réglages est ouverte
function syncDropZone(p) {
  const zone = p.zone;
  if (!zone || zone.isDestroyed()) return;
  if (!alive(p) || !p.zoneBox || !p.win.isVisible() || p.expandUp || p.expandDown) {
    if (zone.isVisible()) zone.hide();
    return;
  }
  const b = p.win.getBounds();
  const r = { x: Math.round(b.x + p.zoneBox.x), y: Math.round(b.y + p.zoneBox.y), width: Math.max(20, p.zoneBox.w), height: Math.max(20, p.zoneBox.h) };
  const c = zone.getBounds();
  if (c.x !== r.x || c.y !== r.y || c.width !== r.width || c.height !== r.height) zone.setBounds(r);
  if (!zone.isVisible()) zone.showInactive();
}

const petOfZone = (sender) => [...pets.values()].find((p) => p.zone && !p.zone.isDestroyed() && p.zone.webContents === sender);

ipcMain.on('drop-box', (e, box) => {
  const p = petOf(e.sender);
  if (!p || !p.zone) return;
  p.zoneBox = box;
  syncDropZone(p);
});

// Souris sur la zone : rejouée dans la fenêtre de l'animal, aux mêmes coordonnées
ipcMain.on('zone-mouse', (e, type, x, y, button, clicks) => {
  const p = petOfZone(e.sender);
  if (!alive(p) || !p.zoneBox) return;
  const b = p.win.getBounds();
  const px = Math.round(x + p.zoneBox.x), py = Math.round(y + p.zoneBox.y);
  p.win.webContents.sendInputEvent({
    type: { mousedown: 'mouseDown', mouseup: 'mouseUp', mousemove: 'mouseMove' }[type],
    x: px, y: py, globalX: b.x + px, globalY: b.y + py,
    button: ['left', 'middle', 'right'][button] || 'left',
    clickCount: clicks || 1,
  });
});

ipcMain.on('zone-feed', (e, meals) => {
  const p = petOfZone(e.sender);
  if (!alive(p) || !Array.isArray(meals)) return;
  p.win.webContents.send('feed-files', meals.slice(0, 20));
});

ipcMain.on('zone-diag', (e, text) => {
  const p = petOfZone(e.sender);
  diag(`[${p ? p.name || p.id : '?'}] ${String(text).slice(0, 300)}`);
});

if (USE_DROP_ZONE) setInterval(() => { for (const p of pets.values()) syncDropZone(p); }, 100);

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
  if (p.zone && !p.zone.isDestroyed()) p.zone.destroy();
  pets.delete(p.id);
  decorWanted.delete(p.id);
  updateDecor();
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

// Cachés avec les animaux : crottes, décor de fête, pelote, gamelle (y compris ceux qui apparaissent pendant ce temps)
let hiddenByUser = false;

function objectWindows() {
  const list = [...poopWindows.values()].map((poop) => poop.win);
  if (decor) list.push(decor.win);
  if (yarn) list.push(yarn.win);
  if (furniture) list.push(...Object.values(furniture).map((f) => f.win));
  return list.filter((w) => w && !w.isDestroyed());
}

function toggleVisible() {
  const show = !anyVisible();
  hiddenByUser = !show;
  for (const p of pets.values()) {
    if (!alive(p)) continue;
    if (show) p.win.show(); else p.win.hide();
  }
  for (const w of objectWindows()) if (show) w.showInactive(); else w.hide();
  if (show) keepOnTop();
  buildTrayMenu();
}

// Nourrir avec des fichiers choisis dans une fenêtre, ou déposés sur l'icône (Mac) :
// seuls leur nom et leur taille sont lus, comme pour un fichier glissé sur l'animal
function feedFiles(p, files) {
  if (!alive(p)) return;
  const meals = files.map((f) => {
    try {
      const st = fs.statSync(f);
      return { name: path.basename(f), size: st.size, isDir: st.isDirectory() };
    } catch { return null; }
  }).filter(Boolean);
  diag(`[${p.name || p.id}] ${meals.length} fichier(s) donné(s) à manger hors glisser-déposer`);
  if (!meals.length) return;
  p.win.show();
  p.win.webContents.send('feed-files', meals);
}

async function chooseFood(p) {
  const r = await dialog.showOpenDialog({ title: tr('Donner un fichier à manger'), properties: ['openFile', 'multiSelections'] });
  if (!r.canceled) feedFiles(p, r.filePaths);
}

// ---- Journal de diagnostic : ce qui se passe quand on glisse un fichier (utile sur Mac, où le dépôt se perd).
// Gardé en mémoire seulement (400 dernières lignes), copié depuis le menu de l'icône pour être envoyé.
const diagLines = [];

function diag(text) {
  const d = new Date();
  diagLines.push(d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0') + ' ' + text);
  if (diagLines.length > 400) diagLines.shift();
}

ipcMain.on('diag', (e, text) => {
  const p = petOf(e.sender);
  diag(`[${p ? p.name || p.id : '?'}] ${String(text).slice(0, 300)}`);
});

function copyDiag() {
  const head = [
    `ThomasGotchi ${app.getVersion()} · ${process.platform} ${os.release()} · Electron ${process.versions.electron}`,
    ...screen.getAllDisplays().map((d) => `écran ${JSON.stringify(d.bounds)} zone ${JSON.stringify(d.workArea)} x${d.scaleFactor}`),
    ...[...pets.values()].filter(alive).map((p) => `animal ${p.name || p.id} : ${JSON.stringify(p.win.getBounds())} ignore=${p.ignoring} visible=${p.win.isVisible()}`),
    `fenêtres repérées : ${windowRects.size}`,
  ];
  clipboard.writeText([...head, '', ...diagLines].join('\n'));
  notify(tr('Diagnostic copié : colle-le dans un message pour l\'envoyer.'));
}

const siteUrl = () => 'https://thomasgotchi.mirimix.fr/' + (currentLang() === 'fr' ? '' : currentLang() + '/');

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
  const food = list.length === 1
    ? { label: tr('Donner un fichier à manger…'), click: () => chooseFood(list[0]) }
    : { label: tr('Donner un fichier à manger'), submenu: list.map((p) => ({ label: p.name || tr('Œuf'), click: () => chooseFood(p) })) };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `ThomasGotchi v${app.getVersion()}`, enabled: false },
    { label: tr('Site internet 🌐'), click: () => shell.openExternal(siteUrl()) },
    { type: 'separator' },
    { label: tr(anyVisible() ? 'Cacher' : 'Afficher'), click: toggleVisible },
    {
      label: tr('Ramener au coin de l\'écran'),
      click: () => {
        list.forEach((p, i) => { const d = defaultPosition(i); placeWindow(p, d.x, d.y); if (alive(p)) p.win.show(); });
        hiddenByUser = false;
        for (const w of objectWindows()) w.showInactive();
        buildTrayMenu();
      },
    },
    settings,
    food,
    { label: tr('Adopter un autre animal'), enabled: list.length < MAX_PETS, click: adoptPet },
    { label: tr(yarn ? 'Ranger la pelote de laine' : 'Sortir la pelote de laine 🧶'), click: toggleYarn },
    { label: tr('Gamelle 🥣'), type: 'checkbox', checked: !!furniture, click: () => (furniture ? removeFurniture() : spawnFurniture()) },
    { type: 'separator' },
    { label: tr('🔕 Ne pas déranger'), type: 'checkbox', checked: dnd, click: (item) => setDnd(item.checked) },
    { label: tr('🏖️ Pause vacances (tous)'), type: 'checkbox', checked: allPaused, click: (item) => setAllPaused(item.checked) },
    { label: tr('Importer un animal…'), enabled: list.length < MAX_PETS, click: importPet },
    updateMenuItem(),
    { label: tr('Copier le diagnostic 🩺'), click: copyDiag },
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
  // Mac : des fichiers déposés sur l'icône de la barre des menus sont donnés à manger au premier animal visible
  tray.on('drop-files', (e, files) => {
    diag(`${files.length} fichier(s) déposé(s) sur l'icône`);
    const p = [...pets.values()].find((x) => alive(x) && x.win.isVisible()) || [...pets.values()].find(alive);
    feedFiles(p, files);
  });
  buildTrayMenu();
}

// ---- Communication avec les fenêtres des animaux ----

ipcMain.on('set-ignore', (e, ignore) => {
  const p = petOf(e.sender);
  if (!p || ignore === p.ignoring) return;
  p.ignoring = ignore;
  diag(`[${p.name || p.id}] la fenêtre ${ignore ? 'laisse passer la souris' : 'capte la souris'}`);
  p.win.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.on('drag-start', (e) => {
  const p = petOf(e.sender);
  if (!p) return;
  clearInterval(p.dragTimer);
  clearInterval(p.fallTimer);
  clearInterval(p.climbTimer);
  p.fallTimer = null;
  p.climbTimer = null;
  p.platform = null;
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
  fallToFloor(p);
});

// ---- Gravité et fenêtres ----
// Un petit programme (src/windows-watcher.ps1 sous Windows, src/mac-watcher.js sur Mac) donne la position des
// fenêtres ouvertes : les animaux peuvent marcher sur leur bord supérieur, tombent au bord ou quand la fenêtre
// disparaît, et suivent la fenêtre si on la déplace. Sans ces informations, seul le bas de l'écran compte.

const FEET = 290; // distance entre le haut de la fenêtre d'un animal et la ligne où posent ses pattes
let platforms = []; // bords visibles : { h, x1, x2, y } en coordonnées d'écran (DIP)
let windowRects = new Map(); // id de fenêtre -> { x1, y1, x2, y2 }
let watcher = null;
let appQuitting = false;

// Morceaux d'un segment [a, b] qui ne sont pas recouverts par [c, d]
function subtractSpan(spans, c, d) {
  const out = [];
  for (const [a, b] of spans) {
    if (d <= a || c >= b) { out.push([a, b]); continue; }
    if (c > a) out.push([a, c]);
    if (d < b) out.push([d, b]);
  }
  return out;
}

function updatePlatforms(raw) {
  const rects = raw.map(([h, l, t, r, b]) => {
    const d = isMac ? { x: l, y: t, width: r - l, height: b - t } : screen.screenToDipRect(null, { x: l, y: t, width: r - l, height: b - t });
    return { h, x1: d.x, y1: d.y, x2: d.x + d.width, y2: d.y + d.height };
  });
  windowRects = new Map(rects.map((r) => [r.h, r]));
  // Le bord du haut d'une fenêtre n'est utilisable que là où aucune fenêtre placée devant ne le cache
  const list = [];
  rects.forEach((w, i) => {
    let spans = [[w.x1, w.x2]];
    for (let j = 0; j < i; j++) {
      const o = rects[j];
      if (o.y1 <= w.y1 && o.y2 >= w.y1) spans = subtractSpan(spans, o.x1, o.x2);
    }
    for (const [a, b] of spans) if (b - a >= 60 && w.y1 > 150) list.push({ h: w.h, x1: a, x2: b, y: w.y1 });
  });
  platforms = list;
  checkSupports();
}

function startWindowWatcher() {
  if (process.platform !== 'win32' && !isMac) return;
  try {
    const env = { ...process.env, TG_PID: String(process.pid) };
    if (isMac) {
      // Le script est lu ici et passé en texte : osascript ne sait pas lire dans l'archive de l'application
      const script = fs.readFileSync(path.join(__dirname, 'src', 'mac-watcher.js'), 'utf8');
      watcher = spawn('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], { env });
    } else {
      const script = fs.readFileSync(path.join(__dirname, 'src', 'windows-watcher.ps1'), 'utf8');
      const encoded = Buffer.from(script, 'utf16le').toString('base64');
      watcher = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
        env,
        windowsHide: true,
      });
    }
    const startedAt = Date.now();
    diag('suivi des fenêtres lancé');
    watcher.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (!text.startsWith('#< CLIXML')) diag('suivi des fenêtres, erreur : ' + text.slice(0, 300)); // CLIXML : bavardage de PowerShell
    });
    let buffer = '';
    watcher.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      const last = lines.filter((l) => l.startsWith('[')).pop();
      if (last) { try { updatePlatforms(JSON.parse(last)); } catch { /* ligne incomplète */ } }
    });
    watcher.on('exit', (code) => {
      watcher = null;
      diag(`suivi des fenêtres arrêté (code ${code}, après ${Math.round((Date.now() - startedAt) / 1000)} s)`);
      // Sur Mac, le script s'arrête de lui-même toutes les 3 minutes : on le relance en gardant les fenêtres connues.
      // S'il s'arrête tout de suite, c'est qu'il ne marche pas sur ce Mac : seul le bas de l'écran comptera.
      if (isMac && !appQuitting && Date.now() - startedAt > 20000) return startWindowWatcher();
      platforms = [];
    });
  } catch { watcher = null; }
}

const feetOf = (b) => ({ x: b.x + W / 2, y: b.y + FEET });

function floorAt(feetX, b) {
  const wa = screen.getAllDisplays().map((d) => d.workArea).find((a) => feetX >= a.x && feetX < a.x + a.width)
    || screen.getDisplayMatching(b).workArea;
  return wa.y + wa.height - H + FEET; // ligne des pattes quand la fenêtre touche le bas de l'écran
}

// Surface la plus proche sous les pattes : bord de fenêtre ou bas de l'écran
function surfaceBelow(feetX, feetY, b) {
  let best = { y: floorAt(feetX, b), h: null };
  for (const pl of platforms) {
    if (feetX >= pl.x1 && feetX <= pl.x2 && pl.y >= feetY - 2 && pl.y < best.y) best = { y: pl.y, h: pl.h };
  }
  return best;
}

function land(p, surface) {
  const b = p.win.getBounds();
  placeWindow(p, b.x, surface.y - FEET);
  p.platform = surface.h;
  p.platformX = surface.h && windowRects.get(surface.h) ? windowRects.get(surface.h).x1 : null;
}

// Gravité : il tombe jusqu'à la première surface sous ses pattes
function fallToFloor(p) {
  if (!alive(p) || p.expandUp || p.expandDown) return saveWindowPosition(p);
  clearInterval(p.fallTimer);
  const b0 = p.win.getBounds();
  const f0 = feetOf(b0);
  const first = surfaceBelow(f0.x, f0.y, b0);
  if (f0.y >= first.y - 2) { land(p, first); return saveWindowPosition(p); }
  p.platform = null;
  p.win.webContents.send('falling');
  let vy = 0;
  p.fallTimer = setInterval(() => {
    if (!alive(p) || p.dragTimer) return clearInterval(p.fallTimer);
    const b = p.win.getBounds();
    const f = feetOf(b);
    const surface = surfaceBelow(f.x, f.y, b);
    vy = Math.min(vy + 1.4, 28);
    if (f.y + vy >= surface.y) {
      clearInterval(p.fallTimer);
      p.fallTimer = null;
      land(p, surface);
      p.win.webContents.send('landed');
      saveWindowPosition(p);
    } else {
      placeWindow(p, b.x, b.y + vy);
    }
  }, 16);
}

// Un animal posé sur une fenêtre la suit si elle bouge, et tombe si elle disparaît ou s'il n'y a plus de bord sous lui
// ---- Les crottes et flaques obéissent aussi à la gravité ----
const POOP_BASE = 53; // hauteur de la base de la crotte dans sa petite fenêtre

function settlePoop(poop) {
  if (!poop || poop.win.isDestroyed() || poop.falling) return;
  const b = poop.win.getBounds();
  const cx = b.x + b.width / 2;
  const base = b.y + POOP_BASE;
  const surface = surfaceBelow(cx, base, b);
  const rect = surface.h && windowRects.get(surface.h);
  poop.platform = surface.h;
  poop.platformX = rect ? rect.x1 : null;
  poop.platformY = rect ? rect.y1 : null;
  if (Math.abs(surface.y - base) <= 2) return;
  // Petite chute jusqu'à la surface
  poop.falling = true;
  let vy = 0;
  const timer = setInterval(() => {
    if (poop.win.isDestroyed()) return clearInterval(timer);
    const cb = poop.win.getBounds();
    vy = Math.min(vy + 1.4, 28);
    const target = surface.y - POOP_BASE;
    const y = Math.min(target, cb.y + vy);
    poop.win.setBounds({ x: cb.x, y: Math.round(y), width: cb.width, height: cb.height });
    if (y >= target) { clearInterval(timer); poop.falling = false; }
  }, 16);
}

// Une crotte posée sur une fenêtre la suit si elle bouge, et tombe si la fenêtre disparaît
function checkPoopSupports() {
  for (const poop of poopWindows.values()) {
    if (!poop.platform || poop.falling || poop.win.isDestroyed()) continue;
    const rect = windowRects.get(poop.platform);
    const b = poop.win.getBounds();
    if (rect && (rect.x1 !== poop.platformX || rect.y1 !== poop.platformY)) {
      poop.win.setBounds({ x: Math.round(b.x + rect.x1 - poop.platformX), y: Math.round(b.y + rect.y1 - poop.platformY), width: b.width, height: b.height });
      poop.platformX = rect.x1;
      poop.platformY = rect.y1;
    }
    const nb = poop.win.getBounds();
    const cx = nb.x + nb.width / 2;
    if (!platforms.some((pl) => pl.h === poop.platform && cx >= pl.x1 && cx <= pl.x2)) {
      poop.platform = null;
      settlePoop(poop);
    }
  }
}

function checkSupports() {
  checkPoopSupports();
  for (const p of pets.values()) {
    if (!alive(p) || !p.platform || p.dragTimer || p.fallTimer || p.climbTimer || p.expandUp || p.expandDown) continue;
    const rect = windowRects.get(p.platform);
    const b = p.win.getBounds();
    if (rect && p.platformX !== null && rect.x1 !== p.platformX) {
      placeWindow(p, b.x + (rect.x1 - p.platformX), b.y); // la fenêtre a bougé : il voyage avec elle
      p.platformX = rect.x1;
    }
    const nb = p.win.getBounds();
    const f = feetOf(nb);
    const pl = platforms.find((x) => x.h === p.platform && f.x >= x.x1 && f.x <= x.x2);
    if (!pl) { fallToFloor(p); continue; }
    if (Math.abs(pl.y - f.y) > 1) placeWindow(p, nb.x, pl.y - FEET);
  }
}

// Saut sur une fenêtre un peu au-dessus de lui (déclenché de temps en temps par l'animal)
ipcMain.handle('climb', (e) => {
  const p = petOf(e.sender);
  if (!p || p.dragTimer || p.fallTimer || p.climbTimer || p.expandUp || p.expandDown) return false;
  const b = p.win.getBounds();
  const f = feetOf(b);
  // Fenêtre au-dessus de lui, jusqu'à 350 px sur le côté : il choisit la plus proche
  const gap = (pl) => (f.x < pl.x1 ? pl.x1 - f.x : f.x > pl.x2 ? f.x - pl.x2 : 0);
  const target = platforms
    .filter((pl) => pl.y < f.y - 50 && gap(pl) <= 350 && pl.x2 - pl.x1 >= 100)
    .sort((x, y) => (gap(x) + (f.y - x.y) * 0.5) - (gap(y) + (f.y - y.y) * 0.5))[0];
  if (!target) return false;
  // Grand bond en arc : il monte juste au-dessus du bord en se décalant vers la fenêtre, puis se pose dessus
  const g = 1.4;
  const landX = Math.min(Math.max(f.x, target.x1 + 40), target.x2 - 40);
  const rise = (f.y - target.y) + 30;
  let vy = -Math.sqrt(2 * g * rise);
  const ticks = Math.ceil(-vy / g);
  const vx = (landX - f.x) / ticks;
  p.platform = null;
  p.climbTimer = setInterval(() => {
    if (!alive(p) || p.dragTimer) { clearInterval(p.climbTimer); p.climbTimer = null; return; }
    const cb = p.win.getBounds();
    vy += g;
    if (vy >= 0) {
      clearInterval(p.climbTimer);
      p.climbTimer = null;
      fallToFloor(p); // il retombe sur le bord de la fenêtre
      return;
    }
    placeWindow(p, cb.x + vx, cb.y + vy);
  }, 16);
  return { dir: Math.sign(landX - f.x) };
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

  if (p.platform) {
    // Sur une fenêtre : il avance à la même hauteur ; au-delà du bord, il tombe
    placeWindow(p, b.x + dx, b.y);
    const pl = platforms.find((x) => x.h === p.platform && feetX >= x.x1 && feetX <= x.x2);
    if (!pl) fallToFloor(p);
    return { blockedLeft: false, blockedRight: false };
  }

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
    show: !hiddenByUser,
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
  const poop = { win: w, owner: owner.id, kind: kind || 'poop', platform: null, platformX: null, platformY: null };
  poopWindows.set(id, poop);
  // Une fois les fenêtres connues, elle se pose sur la surface qui est sous elle (bord de fenêtre ou bas de l'écran)
  if (kind !== 'egg') setTimeout(() => settlePoop(poop), 600);
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
  let y = Math.round(b.y + p.expandUp + FEET - POOP_BASE);
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
    show: !hiddenByUser,
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

// ---- Objet de fête posé sur le bureau (citrouille, sapin, gâteau, œufs) ----
// Chaque animal annonce le décor de sa fête du moment ; un seul objet est posé pour tous,
// immobile, à côté du premier animal. Il laisse passer les clics.

const DECOR = { w: 70, h: 70 };
const DECOR_ORDER = ['snow', 'halloween', 'spring', 'cake']; // en cas de fêtes différentes, la plus « générale » gagne
const decorWanted = new Map(); // id de l'animal -> décor souhaité (ou null)
let decor = null; // { win, kind }

function updateDecor() {
  const kinds = [...decorWanted.values()].filter(Boolean);
  const kind = DECOR_ORDER.find((k) => kinds.includes(k)) || null;
  if (decor && decor.kind === kind) return;
  if (decor && !decor.win.isDestroyed()) decor.win.destroy();
  decor = null;
  if (!kind) return;
  const first = [...pets.values()].find(alive);
  const b = first ? first.win.getBounds() : null;
  const wa = b ? screen.getDisplayMatching(b).workArea : screen.getPrimaryDisplay().workArea;
  const saved = readJson('decor.json');
  // Même place qu'avant si possible, sinon juste à gauche du premier animal
  let x = saved && Number.isFinite(saved.x) ? saved.x : (b ? b.x + W / 2 - 150 : wa.x + 200);
  x = Math.round(Math.min(Math.max(x, wa.x), wa.x + wa.width - DECOR.w));
  const win = new BrowserWindow({
    width: DECOR.w, height: DECOR.h, x, y: wa.y + wa.height - DECOR.h,
    transparent: true, frame: false, resizable: false, movable: false, maximizable: false, minimizable: false,
    fullscreenable: false, skipTaskbar: true, hasShadow: false, focusable: false, alwaysOnTop: true, show: false,
    backgroundColor: '#00000000', webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  // Affichée seulement une fois dessinée, fond transparent réaffirmé : sur Mac, elle apparaissait avec un carré blanc
  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    win.setBackgroundColor('#00000000');
    if (!hiddenByUser) win.showInactive();
  });
  win.loadFile(path.join(__dirname, 'src', 'decor.html'), { query: { kind } });
  decor = { win, kind };
  try { writeJson('decor.json', { x }); } catch { /* sans gravité */ }
}

ipcMain.on('decor', (e, kind) => {
  const p = petOf(e.sender);
  if (!p) return;
  decorWanted.set(p.id, kind || null);
  updateDecor();
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
    skipTaskbar: true, hasShadow: false, focusable: false, alwaysOnTop: true, show: !hiddenByUser, backgroundColor: '#00000000',
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
    const inside = c.x >= b.x && c.x < b.x + b.width && c.y >= b.y && c.y < b.y + b.height;
    if (inside !== !!p.cursorInside) {
      p.cursorInside = inside;
      diag(`[${p.name || p.id}] souris ${inside ? 'entre dans' : 'sort de'} sa fenêtre (${c.x}, ${c.y})`);
    }
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
  startWindowWatcher();
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
app.on('will-quit', () => { appQuitting = true; if (watcher) watcher.kill(); });
