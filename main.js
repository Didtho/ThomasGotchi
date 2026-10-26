const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, net, Notification, dialog, powerMonitor, clipboard, globalShortcut } = require('electron');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Taille des fenêtres d'animaux (240 x 300 à la taille normale). Le réglage « Taille des animaux » (petScale)
// agrandit tout : ces valeurs suivent, et leurs pages sont zoomées (voir setPetScale).
let petScale = 1;
let W = 240;
let H = 300;
const PET_SESSION = 'pets'; // les fenêtres d'animaux ont leur propre session : leur zoom ne touche pas les autres fenêtres
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
  // Animal venu en visite d'un autre ordinateur (voir « Visites entre ordinateurs »)
  for (const g of guests.values()) if (g.win && !g.win.isDestroyed() && g.win.webContents === sender) return g;
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

// Niveau des animaux au-dessus des autres fenêtres. Sur Mac, en dessous de celui des fichiers qu'on fait glisser :
// au niveau « économiseur d'écran », le fichier glissé passait derrière l'animal et macOS ne le lui donnait pas.
const PET_LEVEL = isMac ? 'pop-up-menu' : 'screen-saver';

function keepOnTop() {
  for (const p of [...pets.values(), ...guests.values()]) if (alive(p)) p.win.setAlwaysOnTop(true, PET_LEVEL);
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
      additionalArguments: USE_DROP_ZONE ? ['--tg-drop-zone'] : [],
      partition: PET_SESSION,
      zoomFactor: petScale,
    },
  });
  const p = { id, win, name: '', active: false, expandUp: 0, expandDown: 0, dragTimer: null, ignoring: true };
  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(petScale));
  pets.set(id, p);

  win.setAlwaysOnTop(true, PET_LEVEL);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.on('closed', () => { p.win = null; if (p.zone && !p.zone.isDestroyed()) p.zone.destroy(); });
  // Haut de la fenêtre qui dépasse de l'écran (perché tout en haut d'une fenêtre) : le panneau et les bulles s'en écartent
  win.on('move', () => {
    if (!alive(p)) return;
    const b = win.getBounds();
    const hidden = Math.max(0, screen.getDisplayMatching(b).workArea.y - b.y);
    if (hidden !== p.hiddenTop) { p.hiddenTop = hidden; win.webContents.send('hidden-top', hidden / petScale); }
  });
  if (USE_DROP_ZONE) createDropZone(p);
  // Au chargement, il apprend si le mode « ne pas déranger » est actif
  win.webContents.once('did-finish-load', () => setTimeout(() => fallToFloor(p), 1500));
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('dnd', dnd);
    if (weather) win.webContents.send('weather', { ...weather, lead: false });
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
  // Niveau des fenêtres flottantes ordinaires (macOS ne propose peut-être pas les dépôts au niveau « économiseur
  // d'écran » des animaux). Elle est donc sous la fenêtre de l'animal, qui laisse passer la souris sur son corps.
  zone.setAlwaysOnTop(true, 'floating');
  zone.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Demandé explicitement : sur Mac, une fenêtre transparente laisse sinon passer la souris (et les fichiers)
  // à travers ses zones presque transparentes — la zone ne recevait rien
  zone.setIgnoreMouseEvents(false);
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
  if (!zone.isVisible()) {
    zone.showInactive();
    zone.setIgnoreMouseEvents(false);
  }
}

const petOfZone = (sender) => [...pets.values()].find((p) => p.zone && !p.zone.isDestroyed() && p.zone.webContents === sender);

ipcMain.on('drop-box', (e, box) => {
  const p = petOf(e.sender);
  if (!p || !p.zone || !box) return;
  // La page de l'animal est zoomée : sa silhouette est convertie en points de l'écran
  p.zoneBox = { x: box.x * petScale, y: box.y * petScale, w: Math.round(box.w * petScale), h: Math.round(box.h * petScale) };
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

// Réglage « Taille des animaux » (1, 1,25 ou 1,5) : fenêtres et pages agrandies, pattes gardées au même endroit
function applyScaleValues(scale) {
  petScale = [1, 1.25, 1.5].includes(scale) ? scale : 1;
  W = Math.round(240 * petScale);
  H = Math.round(300 * petScale);
  FEET = 290 * petScale;
}

function setPetScale(scale) {
  const oldW = W, oldFeet = FEET;
  applyScaleValues(scale);
  for (const p of [...pets.values(), ...guests.values()]) {
    if (!alive(p)) continue;
    const b = p.win.getBounds();
    const feetX = b.x + oldW / 2, feetY = b.y + p.expandUp + oldFeet;
    p.win.webContents.setZoomFactor(petScale);
    placeWindow(p, feetX - W / 2, feetY - FEET - p.expandUp);
    saveWindowPosition(p);
  }
  sendToPets('scale', petScale);
  saveSettings();
}

ipcMain.on('get-scale', (e) => { e.returnValue = petScale; });
ipcMain.on('set-scale', (_e, scale) => setPetScale(Number(scale)));

// Gravité (réglage commun) : désactivée, un animal reste là où on le pose, même en l'air
let gravity = true;
ipcMain.on('get-gravity', (e) => { e.returnValue = gravity; });
ipcMain.on('set-gravity', (_e, on) => {
  gravity = !!on;
  saveSettings();
  if (gravity) for (const p of pets.values()) if (alive(p) && !p.away && !p.platform) fallToFloor(p); // ils retombent
});

function saveWindowPosition(p) {
  if (!alive(p) || p.guest) return;
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
  list.push(...Object.values(furniture).map((f) => f.win));
  return list.filter((w) => w && !w.isDestroyed());
}

const HIDE_SHORTCUT = 'CommandOrControl+Alt+T'; // tout cacher / tout afficher

// Cachés par une application en plein écran (voir checkFullscreen) : ils reviennent quand elle se termine
let autoHidden = false;
let autoHideSetting = true; // réglage « Se cacher en plein écran » (menu de l'icône, settings.json)
const allHidden = () => hiddenByUser || autoHidden;

function setAllVisible(show) {
  for (const p of [...pets.values(), ...guests.values()]) {
    if (!alive(p) || p.away) continue; // parti en visite : il reste absent
    if (show) p.win.showInactive(); else p.win.hide();
  }
  for (const w of objectWindows()) if (show) w.showInactive(); else w.hide();
  if (show) keepOnTop();
  buildTrayMenu();
}

// Menu de l'icône et raccourci clavier (Ctrl+Alt+T, Cmd+Option+T sur Mac)
function toggleVisible() {
  const show = !anyVisible();
  hiddenByUser = !show;
  if (show) autoHidden = false;
  setAllVisible(show);
}

// Discrétion : une application en plein écran (présentation, vidéo, jeu) cache les animaux le temps qu'elle dure.
// front : la grande fenêtre la plus en avant (hors ThomasGotchi) ; une fenêtre seulement agrandie ne compte pas.
let lastFront = '';
function checkFullscreen(front) {
  const key = front ? `${Math.round(front.x1)},${Math.round(front.y1)} → ${Math.round(front.x2)},${Math.round(front.y2)}` : 'aucune';
  if (key !== lastFront) { lastFront = key; diag('fenêtre au premier plan : ' + key); }
  if (!autoHideSetting) return;
  const full = !!front && screen.getAllDisplays().some(({ bounds: d }) =>
    front.x1 <= d.x + 1 && front.y1 <= d.y + 1 && front.x2 >= d.x + d.width - 1 && front.y2 >= d.y + d.height - 1);
  if (full && !autoHidden && !hiddenByUser) {
    autoHidden = true;
    diag('application en plein écran : animaux cachés');
    setAllVisible(false);
  } else if (!full && autoHidden) {
    autoHidden = false;
    diag('fin du plein écran : animaux de retour');
    if (!hiddenByUser) setAllVisible(true);
  }
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
    ...[...pets.values()].filter(alive).map((p) => `animal ${p.name || p.id} : ${JSON.stringify(p.win.getBounds())} ignore=${p.ignoring} visible=${p.win.isVisible()}`
      + (p.zone && !p.zone.isDestroyed() ? ` · zone de dépôt ${JSON.stringify(p.zone.getBounds())} visible=${p.zone.isVisible()} silhouette=${JSON.stringify(p.zoneBox)}` : USE_DROP_ZONE ? ' · pas de zone de dépôt' : '')),
    `fenêtres repérées : ${windowRects.size} (positions seulement ; « praticable » = l'animal peut monter dessus)`,
    ...[...windowRects.values()].map((r) => `  fenêtre ${Math.round(r.x1)},${Math.round(r.y1)} → ${Math.round(r.x2)},${Math.round(r.y2)}`
      + (platforms.some((pl) => pl.h === r.h) ? ' praticable' : r.y1 <= 150 ? ' trop près du haut' : ' bord caché')),
  ];
  clipboard.writeText([...head, '', ...diagLines].join('\n'));
  notify(tr('Diagnostic copié : colle-le dans un message pour l\'envoyer.'));
}

const siteUrl = () => 'https://thomasgotchi.mirimix.fr/' + (currentLang() === 'fr' ? '' : currentLang() + '/');

function sendMenu(p, action) {
  if (!alive(p)) return;
  if (p.away) return notify(tr('{name} est en visite chez {owner} 🧳', { name: p.name, owner: p.away.owner }));
  p.win.show();
  p.win.webContents.send('menu', action);
}

function openSettings(p) {
  if (!alive(p)) return;
  if (p.away) return notify(tr('{name} est en visite chez {owner} 🧳', { name: p.name, owner: p.away.owner }));
  p.win.show();
  p.win.webContents.send('menu', 'settings');
}

function buildTrayMenu() {
  if (!tray) return;
  const login = app.getLoginItemSettings().openAtLogin;
  const list = [...pets.values()];
  // Une action par animal : directe s'il n'y en a qu'un, sinon un sous-menu avec leurs prénoms
  const perPet = (label, action, dots = '…') => (list.length === 1
    ? { label: label + dots, click: () => action(list[0]) }
    : { label, submenu: list.map((p) => ({ label: p.name || tr('Œuf'), click: () => action(p) })) });
  const working = focus && focus.phase === 'work';
  const menu = Menu.buildFromTemplate([
    // En tête : la version (ou la mise à jour à installer), et la météo
    updateMenuItem(),
    // (rien à installer : on peut quand même chercher, juste sous la version)
    ...(updateState || updateUrl ? [] : [{ label: tr('🔎 Rechercher une mise à jour'), enabled: app.isPackaged, click: () => checkForUpdates(true) }]),
    ...(weather ? [{ label: weatherLine(), enabled: false }] : []),
    { type: 'separator' },
    { label: tr(anyVisible() ? 'Cacher' : 'Afficher'), click: toggleVisible, accelerator: HIDE_SHORTCUT, registerAccelerator: false },
    {
      label: tr('Ramener au coin de l\'écran'),
      click: () => {
        list.forEach((p, i) => { if (p.away) return; const d = defaultPosition(i); placeWindow(p, d.x, d.y); if (alive(p)) p.win.show(); });
        hiddenByUser = false;
        for (const w of objectWindows()) w.showInactive();
        buildTrayMenu();
      },
    },
    { type: 'separator' },
    // S'occuper de lui
    perPet(tr('⚙️ Réglages'), openSettings),
    perPet(tr('🍽️ Donner un fichier à manger'), chooseFood),
    perPet(tr('📸 Prendre une photo'), (p) => sendMenu(p, 'photo'), ''),
    { label: tr('📝 Pense-bête…'), click: () => sendMenu(list.find((p) => !p.away) || list[0], 'notes') },
    { type: 'separator' },
    // Jouer, et ses objets sur le bureau
    {
      label: tr('🎾 Jouer'),
      submenu: [
        perPet(tr('🎲 Mini-jeux'), (p) => sendMenu(p, 'games')),
        { type: 'separator' },
        { label: tr('🔴 Pointeur laser'), type: 'checkbox', checked: !!laser, click: () => (laser ? stopLaser() : startLaser()) },
        { label: tr('🧶 Pelote de laine'), type: 'checkbox', checked: !!yarn, click: toggleYarn },
      ],
    },
    {
      label: tr('🏠 Objets sur le bureau'),
      submenu: [
        { label: tr('Gamelle 🥣'), type: 'checkbox', checked: !!furniture.bowl, click: () => toggleFurniture('bowl') },
        { label: tr('Panier pour dormir 🧺'), type: 'checkbox', checked: !!furniture.basket, click: () => toggleFurniture('basket') },
        { label: tr('Plante à arroser 🪴'), type: 'checkbox', checked: !!furniture.plant, click: () => toggleFurniture('plant') },
      ],
    },
    { type: 'separator' },
    // Calme
    {
      label: tr(working ? '🎯 Concentration jusqu\'à {time}' : '🎯 Mode concentration ({n} min)',
        { n: FOCUS_MIN, time: working ? new Date(focus.until).toLocaleTimeString(currentLang(), { hour: '2-digit', minute: '2-digit' }) : '' }),
      type: 'checkbox', checked: !!working, click: () => (working ? stopFocus() : startFocus()),
    },
    { label: tr('🔕 Ne pas déranger'), type: 'checkbox', checked: dnd, click: (item) => setDnd(item.checked) },
    { label: tr('🏖️ Pause vacances (tous)'), type: 'checkbox', checked: allPaused, click: (item) => setAllPaused(item.checked) },
    { type: 'separator' },
    {
      label: tr('🐾 Animaux'),
      submenu: [
        { label: tr('Adopter un autre animal'), enabled: list.length < MAX_PETS, click: adoptPet },
        { label: tr('Importer un animal…'), enabled: list.length < MAX_PETS, click: importPet },
      ],
    },
    {
      label: tr('🔧 Options'),
      submenu: [
        {
          label: tr('🖥️ Se cacher en plein écran'), type: 'checkbox', checked: autoHideSetting,
          click: (item) => {
            autoHideSetting = item.checked;
            if (!autoHideSetting && autoHidden) { autoHidden = false; if (!hiddenByUser) setAllVisible(true); }
            saveSettings();
          },
        },
        {
          label: tr('Lancer au démarrage'), type: 'checkbox', checked: login,
          click: (item) => { app.setLoginItemSettings({ openAtLogin: item.checked }); },
        },
        { type: 'separator' },
        { label: tr('Site internet 🌐'), click: () => shell.openExternal(siteUrl()) },
        { label: tr('Copier le diagnostic 🩺'), click: copyDiag },
      ],
    },
    { type: 'separator' },
    { label: tr('Quitter'), click: () => app.quit() },
  ]);
  // À chaque ouverture du menu, une recherche discrète : une nouvelle version se télécharge aussitôt et une
  // notification prévient quand elle est prête
  menu.on('menu-will-show', () => { if (!checkingUpdate) checkForUpdates(false); });
  tray.setContextMenu(menu);
}

// Icône de la barre : normale, ou avec une pastille rouge quand un animal a besoin de quelque chose
let trayIcons = null;
function makeTrayIcons() {
  const size = isMac ? 18 : 16, scale = 2, px = size * scale; // dessinée en double taille pour rester nette
  const base = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: px, height: px, quality: 'best' });
  const pixels = base.toBitmap(); // octets dans l'ordre bleu, vert, rouge, alpha
  const normal = nativeImage.createFromBitmap(pixels, { width: px, height: px, scaleFactor: scale });
  const dot = Buffer.from(pixels);
  const r = px * 0.22, cx = px - r - 1, cy = px - r - 1;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > r + 1.5) continue;
      const i = (y * px + x) * 4;
      const [b, g, red] = d <= r ? [48, 59, 255] : [255, 255, 255]; // pastille rouge, liseré blanc
      dot[i] = b; dot[i + 1] = g; dot[i + 2] = red; dot[i + 3] = 255;
    }
  }
  return { normal, alert: nativeImage.createFromBitmap(dot, { width: px, height: px, scaleFactor: scale }) };
}

// Ce dont chaque animal a besoin, affiché dans l'infobulle de l'icône
const ALERTS = { hunger: '{name} a faim 🍔', thirst: '{name} a soif 💧', sick: '{name} est malade 🤒', dirty: '{name} a besoin d\'un bain 🛁' };
function updateTrayAlert() {
  if (!tray) return;
  const lines = [...pets.values()].filter((p) => alive(p) && p.alert && !p.away).map((p) => tr(ALERTS[p.alert], { name: p.name || tr('Œuf') }));
  tray.setImage(lines.length ? trayIcons.alert : trayIcons.normal);
  const away = [...pets.values()].filter((p) => p.away).map((p) => tr('{name} est en visite chez {owner} 🧳', { name: p.name, owner: p.away.owner }));
  tray.setToolTip([`ThomasGotchi v${app.getVersion()}`, weatherLine(), ...lines, ...away].filter(Boolean).join('\n'));
}

ipcMain.on('pet-status', (e, alert) => {
  const p = petOf(e.sender);
  if (!p) return;
  p.alert = ALERTS[alert] ? alert : null;
  updateTrayAlert();
});

// Photo souvenir : enregistrée dans Images > ThomasGotchi ; un clic sur la notification ouvre le dossier
ipcMain.handle('save-photo', (e, dataUrl, name) => {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return null;
  const dir = path.join(app.getPath('pictures'), 'ThomasGotchi');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
  const safe = String(name || 'ThomasGotchi').replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'ThomasGotchi';
  const file = path.join(dir, `${safe}-${stamp}.png`);
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  notify(tr('Photo enregistrée dans Images › ThomasGotchi'), () => shell.showItemInFolder(file));
  return file;
});

// Album du carnet : ouvrir une photo en grand (seulement celles du dossier Images > ThomasGotchi)
ipcMain.handle('open-photo', (_e, file) => {
  const dir = path.join(app.getPath('pictures'), 'ThomasGotchi');
  const full = path.resolve(String(file || ''));
  if (!full.startsWith(dir + path.sep) || !fs.existsSync(full)) return false;
  shell.openPath(full);
  return true;
});

function createTray() {
  trayIcons = makeTrayIcons();
  tray = new Tray(trayIcons.normal);
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

let FEET = 290; // distance entre le haut de la fenêtre d'un animal et la ligne où posent ses pattes (suit la taille)
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
  // Plein écran : on regarde la première grande fenêtre (les petites, toujours devant, comme les gadgets, ne comptent pas)
  checkFullscreen(rects.find((r) => (r.x2 - r.x1) * (r.y2 - r.y1) > 250000));
  checkSupports();
}

let musicOn = false;
function setMusic(on) {
  if (on === musicOn) return;
  musicOn = on;
  diag(on ? 'musique en cours' : 'musique arrêtée');
  sendToPets('music', on);
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
      // Windows : « M1 » / « M0 » quand de la musique se met à jouer ou s'arrête (les animaux dansent)
      const media = lines.filter((l) => l === 'M1' || l === 'M0').pop();
      if (media) setMusic(media === 'M1');
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
  // Sans gravité : posé tout près d'un bord (fenêtre, bas de l'écran), il s'y pose ; sinon il reste en l'air
  if (!gravity) {
    if (first.y - f0.y < 12) land(p, first);
    return saveWindowPosition(p);
  }
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
    if (!alive(p) || !p.platform || p.dragTimer || p.fallTimer || p.climbTimer || p.expandUp || p.expandDown || p.sliding) continue;
    const rect = windowRects.get(p.platform);
    const b = p.win.getBounds();
    if (rect && p.platformX !== null && rect.x1 !== p.platformX) {
      placeWindow(p, b.x + (rect.x1 - p.platformX), b.y); // la fenêtre a bougé : il voyage avec elle
      p.platformX = rect.x1;
    }
    const nb = p.win.getBounds();
    const f = feetOf(nb);
    const pl = platforms.find((x) => x.h === p.platform && f.x >= x.x1 && f.x <= x.x2);
    if (!pl) { if (gravity) fallToFloor(p); else p.platform = null; continue; } // sans gravité : il reste là
    if (Math.abs(pl.y - f.y) > 1) placeWindow(p, nb.x, pl.y - FEET);
  }
}

// Saut sur une fenêtre un peu au-dessus de lui (déclenché de temps en temps par l'animal)
ipcMain.handle('climb', (e) => {
  const p = petOf(e.sender);
  if (!p || !gravity || p.dragTimer || p.fallTimer || p.climbTimer || p.expandUp || p.expandDown) return false; // sans gravité, il ne grimpe pas
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

ipcMain.handle('expand', async (e, cssExtra) => {
  const r = expandPet(petOf(e.sender), Math.round(cssExtra * petScale));
  return r && { above: r.above, extra: r.extra / petScale }; // la page compte en points zoomés
});

function expandPet(p, extra) {
  if (!p) return null;
  if (p.expandUp || p.expandDown) return { above: p.expandUp > 0, extra: p.expandUp || p.expandDown };
  const b = p.win.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  // Perché tout en haut d'une fenêtre, le haut de sa propre fenêtre peut dépasser de l'écran : on la redescend
  // le temps des réglages (elle reprend sa place à la fermeture), sinon la carte serait coupée en haut
  p.expandShift = Math.max(0, wa.y - b.y);
  const top = b.y + p.expandShift;
  const roomUp = Math.max(0, top - wa.y);
  const roomDown = Math.max(0, wa.y + wa.height - (top + b.height));
  // Vers le haut s'il y a la place, sinon vers le bas ; si aucun côté ne suffit, on prend le plus grand
  // (la fenêtre de réglages défilera) : elle ne sort jamais de l'écran
  if (roomUp >= extra) p.expandUp = extra;
  else if (roomDown >= extra) p.expandDown = extra;
  else if (roomUp >= roomDown) p.expandUp = roomUp;
  else p.expandDown = roomDown;
  p.win.setBounds({ x: b.x, y: top - p.expandUp, width: W, height: H + p.expandUp + p.expandDown });
  return { above: p.expandUp > 0, extra: p.expandUp || p.expandDown };
}

ipcMain.handle('collapse', (e) => {
  const p = petOf(e.sender);
  if (!p || !(p.expandUp || p.expandDown)) return;
  const b = p.win.getBounds();
  const up = p.expandUp, shift = p.expandShift || 0;
  p.expandUp = 0;
  p.expandDown = 0;
  p.expandShift = 0;
  p.win.setBounds({ x: b.x, y: b.y + up - shift, width: W, height: H }); // il retrouve sa place d'avant
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
  dx *= petScale; // un grand animal fait de plus grands pas
  dy *= petScale;
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
  if (p.guest) return false; // un invité ne s'enregistre pas ici
  const name = state.name || '';
  p.lastState = state; // prénom du maître et apparence, pour les visites entre ordinateurs
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
    show: !allHidden(),
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
    show: !allHidden(),
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
    if (!allHidden()) win.showInactive();
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

// ---- Soirée magique : un hibou traverse l'écran au-dessus de l'animal et lâche une lettre ----
// La réponse arrive quand il passe au-dessus de lui (false s'il n'a pas pu voler : animal caché, etc.)
ipcMain.handle('owl', (e) => new Promise((resolve) => {
  const p = petOf(e.sender);
  if (!alive(p) || hiddenByUser || !p.win.isVisible()) return resolve(false);
  const b = p.win.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  const OW = 90, OH = 80;
  const target = b.x + W / 2 - OW / 2;
  const dir = target - wa.x > wa.x + wa.width - target ? 1 : -1; // il arrive du côté le plus éloigné
  let x = dir > 0 ? wa.x - OW : wa.x + wa.width;
  const baseY = Math.max(wa.y + 10, b.y + p.expandUp + FEET - 260);
  const owl = new BrowserWindow({
    width: OW, height: OH, x, y: baseY, transparent: true, frame: false, resizable: false, movable: false,
    focusable: false, skipTaskbar: true, hasShadow: false, alwaysOnTop: true, enableLargerThanScreen: true,
    backgroundColor: '#00000000', webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  owl.setAlwaysOnTop(true, PET_LEVEL);
  owl.setIgnoreMouseEvents(true);
  owl.loadFile(path.join(__dirname, 'src', 'owl.html'), { query: { dir: String(dir) } });
  let passed = false, n = 0;
  const timer = setInterval(() => {
    if (owl.isDestroyed()) { clearInterval(timer); if (!passed) resolve(false); return; }
    x += dir * 10;
    n++;
    owl.setBounds({ x: Math.round(x), y: Math.round(baseY + Math.sin(n / 8) * 12), width: OW, height: OH });
    // L'animal a pu marcher entre-temps : on vise sa position du moment
    const aim = alive(p) ? p.win.getBounds().x + W / 2 - OW / 2 : target;
    if (!passed && (dir > 0 ? x >= aim : x <= aim)) { passed = true; resolve(true); }
    if (x < wa.x - OW - 10 || x > wa.x + wa.width + 10) { clearInterval(timer); owl.destroy(); if (!passed) resolve(false); }
  }, 16);
}));

// ---- Meubles : gamelle, panier, plante — partagés par tous les animaux, posés en bas de l'écran ----

const FURN = { bowl: { w: 84, h: 50 }, basket: { w: 100, h: 46 }, plant: { w: 90, h: 96 } }; // plante : place pour l'arrosoir
// { bowl: { win, x, food, water }, basket: { win, x }, plant: { win, x, water, growth, at } }
let furniture = {};
const furnData = (f) => { const { win, ...data } = f; return data; }; // ce qu'on garde et envoie (sans la fenêtre)

function furnitureArea() {
  const first = [...pets.values()].find(alive);
  return first ? screen.getDisplayMatching(first.win.getBounds()).workArea : screen.getPrimaryDisplay().workArea;
}

function saveFurniture() {
  const data = { on: !!furniture.bowl }; // « on » : ancien format (gamelle seule)
  for (const k of Object.keys(FURN)) data[k] = furniture[k] ? furnData(furniture[k]) : null;
  try { writeJson('furniture.json', data); } catch { /* sans gravité */ }
}

function createFurnitureWindow(kind, x) {
  const { w, h } = FURN[kind];
  const wa = screen.getAllDisplays().map((d) => d.workArea).find((a) => x >= a.x && x < a.x + a.width) || furnitureArea();
  const win = new BrowserWindow({
    width: w, height: h,
    x: Math.round(Math.min(Math.max(x - w / 2, wa.x), wa.x + wa.width - w)),
    y: wa.y + wa.height - h,
    transparent: true, frame: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: false, focusable: false, alwaysOnTop: true, show: !allHidden(), backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload-furniture.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'src', 'furniture.html'), { query: { kind } });
  win.webContents.on('did-finish-load', sendFurnitureState);
  return win;
}

// Posé à côté du premier animal (la gamelle à gauche, le panier à droite, la plante un peu plus loin à gauche)
function spawnFurniture(kind, saved) {
  if (furniture[kind]) return;
  const first = [...pets.values()].find(alive);
  const px = first ? first.win.getBounds().x + W / 2 : furnitureArea().x + 300;
  const fresh = {
    bowl: { x: px - 170, food: 100, water: 100 },
    basket: { x: px + 190 },
    plant: { x: px - 280, water: 100, growth: 0, at: Date.now() },
  }[kind];
  const s = saved && Number.isFinite(saved.x) ? { ...fresh, ...saved } : fresh;
  furniture[kind] = { ...s, win: createFurnitureWindow(kind, s.x) };
  if (kind === 'plant') plantTick(); // le temps passé application fermée compte aussi
  saveFurniture();
  buildTrayMenu();
}

function removeFurniture(kind) {
  const f = furniture[kind];
  if (!f) return;
  hideFurnTip();
  if (!f.win.isDestroyed()) f.win.destroy();
  delete furniture[kind];
  saveFurniture();
  if (!Object.keys(furniture).length) for (const p of pets.values()) if (alive(p)) p.win.webContents.send('furniture', null);
  buildTrayMenu();
}

const toggleFurniture = (kind) => (furniture[kind] ? removeFurniture(kind) : spawnFurniture(kind));

// Plante : l'eau baisse en 3 jours ; bien arrosée, elle pousse d'un cran par jour (graine, pousse, tige, bouton, fleur).
// Sans eau, elle penche un peu mais ne meurt jamais.
function plantTick() {
  const p = furniture.plant;
  if (!p) return;
  const now = Date.now();
  const hours = Math.max(0, (now - (p.at || now)) / 3600000);
  p.at = now;
  if (p.water > 15) p.growth = Math.min(4, (p.growth || 0) + hours / 24);
  p.water = Math.max(0, p.water - hours * 100 / 72);
  sendFurnitureState();
  saveFurniture();
}

function sendFurnitureState() {
  for (const f of Object.values(furniture)) if (!f.win.isDestroyed()) f.win.webContents.send('furn-state', furnData(f));
}

// Les animaux savent où sont les meubles (position par rapport à leur fenêtre, en pixels de la page)
function sendFurnitureToPets() {
  if (!Object.keys(furniture).length) return;
  for (const p of pets.values()) {
    if (!alive(p)) continue;
    const bx = p.win.getBounds().x;
    const data = {};
    for (const [k, f] of Object.entries(furniture)) data[k] = { ...furnData(f), x: (f.x - bx) / petScale };
    p.win.webContents.send('furniture', data);
  }
}

function furnitureOf(sender) {
  return Object.keys(furniture).find((k) => !furniture[k].win.isDestroyed() && furniture[k].win.webContents === sender) || null;
}

// Bulle d'aide au survol d'un meuble (petite fenêtre au-dessus, qui laisse passer les clics)
let furnTip = null;
let furnTipTimer = null;

function showFurnTip(kind) {
  const f = furniture[kind];
  if (!f || f.win.isDestroyed()) return;
  const text = {
    bowl: tr('Clic : remplir · Glisser : déplacer'),
    basket: tr('Son panier pour dormir · Glisser : déplacer'),
    plant: tr('Clic : arroser (eau : {n} %) · Glisser : déplacer', { n: Math.round(f.water || 0) }),
  }[kind];
  const b = f.win.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  const w = 300, h = 34;
  const x = Math.round(Math.min(Math.max(b.x + b.width / 2 - w / 2, wa.x), wa.x + wa.width - w));
  hideFurnTip();
  furnTip = new BrowserWindow({
    width: w, height: h, x, y: b.y - h, transparent: true, frame: false, resizable: false, focusable: false,
    skipTaskbar: true, hasShadow: false, alwaysOnTop: true, show: false, backgroundColor: '#00000000',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  furnTip.setIgnoreMouseEvents(true);
  furnTip.setAlwaysOnTop(true, 'floating');
  furnTip.loadFile(path.join(__dirname, 'src', 'tip.html'), { query: { text } });
  furnTip.once('ready-to-show', () => { if (furnTip && !furnTip.isDestroyed()) furnTip.showInactive(); });
}

function hideFurnTip() {
  clearTimeout(furnTipTimer);
  if (furnTip && !furnTip.isDestroyed()) furnTip.destroy();
  furnTip = null;
}

ipcMain.on('furn-hover', (e, on) => {
  const k = furnitureOf(e.sender);
  hideFurnTip();
  if (on && k) furnTipTimer = setTimeout(() => showFurnTip(k), 500);
});

// Clic : remplir la gamelle, arroser la plante
ipcMain.on('furn-click', (e) => {
  hideFurnTip();
  const k = furnitureOf(e.sender);
  if (k === 'bowl') Object.assign(furniture.bowl, { food: 100, water: 100 });
  else if (k === 'plant') furniture.plant.water = 100;
  else return;
  sendFurnitureState();
  saveFurniture();
});

let furnDrag = null;
ipcMain.on('furn-drag-start', (e) => {
  hideFurnTip();
  const k = furnitureOf(e.sender);
  if (!k) return;
  const item = furniture[k];
  const ox = screen.getCursorScreenPoint().x - item.win.getBounds().x;
  clearInterval(furnDrag);
  furnDrag = setInterval(() => {
    if (!furniture[k] || item.win.isDestroyed()) return clearInterval(furnDrag);
    // Il glisse le long du bas de l'écran (et peut changer d'écran)
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
  if (!furniture.bowl) return 0;
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
  try { writeJson('settings.json', { dnd, city, lang: langSetting, autoHide: autoHideSetting, scale: petScale, gravity }); } catch { /* sans gravité */ }
}

ipcMain.on('get-lang', (e) => { e.returnValue = { setting: langSetting, lang: currentLang() }; });

// Pays réglé dans le système (certaines fêtes en dépendent) ; à défaut, celui de la langue
ipcMain.on('get-country', (e) => {
  const code = (app.getLocaleCountryCode && app.getLocaleCountryCode()) || (app.getLocale().split('-')[1] || '');
  e.returnValue = code.toUpperCase() || { fr: 'FR', en: 'US', es: 'ES', it: 'IT' }[currentLang()] || 'FR';
});
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
    p.win.webContents.send('cursor', { x: (c.x - b.x) / petScale, y: (c.y - b.y) / petScale }); // en points de sa page
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
  // Les animaux en visite chez nous jouent aussi avec ceux de la maison (sans compter dans leur amitié)
  const list = [...pets.values(), ...guests.values()].filter((p) => alive(p) && p.active && p.win.isVisible() && !p.dragTimer && !p.sliding);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const ba = a.win.getBounds(), bb = b.win.getBounds();
      const close = Math.abs(ba.x - bb.x) < 110 && Math.abs((ba.y + ba.height) - (bb.y + bb.height)) < 60;
      const key = [a.id, b.id].sort().join('|');
      if (!close || Date.now() - (lastMeet.get(key) || 0) < 45000) continue;
      lastMeet.set(key, Date.now());
      if (a.guest || b.guest) {
        const [guest, host] = a.guest ? [a, b] : [b, a];
        if (!host.guest && host.name) guest.played.add(host.name); // raconté au retour : « j'ai joué avec … »
        const game = ['hug', 'chase', 'jump'][Math.floor(Math.random() * 3)];
        a.win.webContents.send('meet', { name: b.name, side: bb.x > ba.x ? 1 : -1, game, role: 'flee', levelUp: null });
        b.win.webContents.send('meet', { name: a.name, side: ba.x > bb.x ? 1 : -1, game, role: 'chase', levelUp: null });
        continue;
      }
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
  // Un visiteur venu d'ailleurs compte comme un copain : ceux de la maison vont le voir, et lui va vers eux
  const list = [...pets.values(), ...guests.values()].filter((p) => alive(p) && !p.away);
  for (const p of list) {
    const bx = p.win.getBounds().x;
    p.win.webContents.send('friends', list.filter((o) => o !== p && o.active).map((o) => {
      const pts = p.guest || o.guest ? 40 : friendship[[p.id, o.id].sort().join('|')] || 0;
      return { name: o.name, x: o.win.getBounds().x - bx, points: pts, level: friendLevel(pts) };
    }));
  }
}

// ---- Visites entre ordinateurs (amis acceptés des deux côtés, voir site/api/visits.php) ----
// L'installation ne s'inscrit qu'à la première ouverture de l'onglet « Amis » ; ensuite elle donne de ses nouvelles
// toutes les 30 s. Un animal part vraiment : il quitte l'écran, apparaît chez l'ami (« invité »), puis revient.
// TG_API permet de tester avec le service de WAMP.
const VISITS_API = process.env.TG_API || 'https://thomasgotchi.mirimix.fr/api/visits.php';
const VISIT_LENGTH = Number(process.env.TG_VISIT_LENGTH) || 10 * 60000;
let online = null; // { code, secret, open } (online.json)
let onlineData = { friends: [] };
const guests = new Map(); // animaux venus en visite : id de visite -> fenêtre et infos
let visitsToday = { day: '', count: 0 };

async function api(body) {
  try {
    const r = await net.fetch(VISITS_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json();
  } catch {
    return { error: 'reseau' };
  }
}

async function ensureOnline() {
  if (online) return online;
  const r = await api({ action: 'register' });
  if (!r.code) return null;
  online = { code: r.code, secret: r.secret, open: true };
  writeJson('online.json', online);
  return online;
}

// Prénom du maître et apparence d'un animal, d'après sa dernière sauvegarde
function petCard(p) {
  const s = p && p.lastState;
  if (!s) return { owner: '', pet: {} };
  return { owner: s.owner || '', pet: { name: s.name, species: s.species || 'chat', color: s.color, gender: s.gender, accessory: s.accessory, style: s.style } };
}

const publicOnline = () => ({ code: online ? online.code : null, open: online ? online.open : true, friends: onlineData.friends || [] });

async function syncOnline() {
  if (!online) return;
  const first = [...pets.values()].find((p) => alive(p) && p.lastState);
  const r = await api({ action: 'sync', secret: online.secret, open: online.open, ...petCard(first) });
  if (r.error) return;
  onlineData = r;
  sendToPets('online', publicOnline());
  // Même côté pour tous ceux qui arrivent : après une promenade, les deux amis entrent ensemble
  const side = Math.random() < 0.5 ? -1 : 1;
  for (const v of r.back || []) comeHome(v, side);
  for (const v of r.incoming || []) {
    // Promenade (retour) : l'animal de l'ami attend que le nôtre rentre, pour arriver avec lui
    if (v.walk === 2 && [...pets.values()].some((p) => p.away && p.away.code === v.code)) continue;
    receiveGuest(v, side);
  }
  // Cadeau ou carte postale d'un ami : remis à l'un des animaux présents, qui le pose sur le bureau
  for (const gift of r.gifts || []) {
    const p = [...pets.values()].find((x) => alive(x) && !x.away && x.lastState && !x.lastState.dead);
    if (p) p.win.webContents.send('visit', { type: 'gift', kind: gift.kind, msg: gift.msg || 0, owner: gift.owner, pet: gift.pet });
  }
  maybeVisit();
}

// Un animal peut partir en visite s'il est éveillé, en forme et pas déjà occupé
const canVisit = (p) => !visitBlocker(p);
// Raison qui l'empêche de partir (affichée dans l'onglet « Amis »), ou null
function visitBlocker(p) {
  const s = p && p.lastState;
  if (!alive(p) || !s || s.dead) return 'occupe';
  if (p.away) return 'parti';
  if (Date.now() < s.hatchAt) return 'oeuf';
  if (s.sleeping || s.paused) return 'dort';
  if (s.ailment || (s.health || 100) < 45) return 'malade';
  if (p.sliding || !p.win.isVisible() || p.expandUp || p.expandDown || p.dragTimer) return 'occupe';
  return null;
}

// Visites spontanées : une ou deux par jour au plus, quand un ami a son application ouverte
function maybeVisit() {
  if (!online || !online.open || dnd || allHidden()) return;
  const day = new Date().toDateString();
  if (visitsToday.day !== day) visitsToday = { day, count: 0 };
  if (visitsToday.count >= 2 || Math.random() > 1 / 60) return;
  const friends = (onlineData.friends || []).filter((f) => f.status === 'ok' && f.online);
  const ready = [...pets.values()].filter(canVisit);
  if (!friends.length || !ready.length) return;
  // Une fois sur trois, c'est une promenade : l'animal de l'ami le raccompagnera ensuite
  startVisit(ready[Math.floor(Math.random() * ready.length)], friends[Math.floor(Math.random() * friends.length)].code, Math.random() < 0.33 ? 1 : 0);
}

// walk : 0 visite simple, 1 promenade (aller), 2 promenade (il raccompagne le visiteur : with = prénom du visiteur)
// dir : sens de la sortie (sinon le bord de l'écran le plus proche)
async function startVisit(p, code, walk = 0, dir = 0, withName = '') {
  if (!online) return { error: 'reseau' };
  const blocked = visitBlocker(p);
  if (blocked) return { error: blocked };
  const r = await api({ action: 'visit-start', secret: online.secret, code, walk, ...petCard(p) });
  if (r.error) return r;
  if (walk !== 2) visitsToday.count++;
  p.away = { id: r.id, owner: r.owner, code };
  diag(`[${p.name || p.id}] part ${walk ? 'en promenade' : 'en visite'} chez ${r.owner}`);
  p.win.webContents.send('visit', { type: 'leave', owner: r.owner, walk, with: withName });
  setTimeout(() => slideOut(p, () => { if (alive(p)) p.win.hide(); updateTrayAlert(); }, dir), 2500);
  return r;
}

// Bord de l'écran le plus proche pour sortir ou entrer
function edgeOf(p) {
  const b = p.win.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  return { wa, dir: b.x + W / 2 < wa.x + wa.width / 2 ? -1 : 1 };
}

// Il marche jusqu'à sortir de l'écran (la fenêtre glisse ; la page n'anime que ses pattes)
function slideOut(p, done, forceDir = 0) {
  if (!alive(p)) return done && done();
  const edge = edgeOf(p);
  const wa = edge.wa;
  const dir = forceDir || edge.dir;
  p.sliding = true;
  p.platform = null;
  p.win.webContents.send('visit', { type: 'walk', dir });
  const timer = setInterval(() => {
    if (!alive(p)) { clearInterval(timer); return; }
    const b = p.win.getBounds();
    placeWindow(p, b.x + dir * 5, b.y);
    if (b.x > wa.x + wa.width || b.x + W < wa.x) {
      clearInterval(timer);
      p.sliding = false;
      p.win.webContents.send('visit', { type: 'walk', dir: 0 });
      if (done) done();
    }
  }, 16);
}

// Il entre par un bord de l'écran, au sol, et s'avance un peu
function slideIn(p, side, wa, done) {
  if (!alive(p)) return;
  const y = wa.y + wa.height - H;
  const target = side < 0 ? wa.x + 40 + Math.random() * 160 : wa.x + wa.width - W - 40 - Math.random() * 160;
  placeWindow(p, side < 0 ? wa.x - W : wa.x + wa.width, y);
  p.sliding = true;
  p.platform = null;
  if (!p.win.isVisible()) p.win.showInactive();
  p.win.webContents.send('visit', { type: 'walk', dir: -side });
  const timer = setInterval(() => {
    if (!alive(p)) { clearInterval(timer); return; }
    const b = p.win.getBounds();
    const nx = b.x - side * 5;
    placeWindow(p, nx, y);
    if (side < 0 ? nx >= target : nx <= target) {
      clearInterval(timer);
      p.sliding = false;
      p.win.webContents.send('visit', { type: 'walk', dir: 0 });
      if (done) done();
    }
  }, 16);
}

// Retour de visite : il revient par le bord de l'écran, tout content
function comeHome(v, side = Math.random() < 0.5 ? -1 : 1) {
  const p = [...pets.values()].find((x) => x.away && x.away.id === v.id);
  api({ action: 'visit-home', secret: online.secret, id: v.id });
  if (!alive(p)) return;
  const owner = p.away.owner;
  p.away = null;
  const wa = screen.getDisplayMatching(p.win.getBounds()).workArea;
  slideIn(p, side, wa, () => {
    p.win.webContents.send('visit', { type: 'home', owner: v.owner || owner, played: v.played, ate: v.ate || 0 });
    diag(`[${p.name || p.id}] rentre de chez ${v.owner || owner}`);
  });
  updateTrayAlert();
}

// Un animal d'un ami arrive en visite : une fenêtre d'animal « invité », sans sauvegarde ni réglages
function receiveGuest(v, side = Math.random() < 0.5 ? -1 : 1) {
  if (guests.has(v.id)) return;
  if (dnd || allHidden() || guests.size >= 3) { // jusqu'à 3 visiteurs en même temps
    api({ action: 'visit-end', secret: online.secret, id: v.id, played: '' }); // pas le moment : il rentre aussitôt
    return;
  }
  const first = [...pets.values()].find(alive);
  const wa = first ? screen.getDisplayMatching(first.win.getBounds()).workArea : screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
    width: W, height: H, x: side < 0 ? wa.x - W : wa.x + wa.width, y: wa.y + wa.height - H,
    transparent: true, frame: false, resizable: false, movable: true, maximizable: false, minimizable: false,
    fullscreenable: false, skipTaskbar: true, hasShadow: false, alwaysOnTop: true, enableLargerThanScreen: true,
    show: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
      partition: PET_SESSION, zoomFactor: petScale },
  });
  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(petScale));
  const g = { id: 'invite-' + v.id, win, visit: v, guest: true, name: v.pet.name || '', played: new Set(),
    active: true, expandUp: 0, expandDown: 0, dragTimer: null, ignoring: true };
  guests.set(v.id, g);
  win.setAlwaysOnTop(true, PET_LEVEL);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.on('closed', () => { g.win = null; guests.delete(v.id); });
  win.webContents.once('did-finish-load', () => {
    api({ action: 'visit-arrived', secret: online.secret, id: v.id });
    diag(`visite de ${v.pet.name || '?'} (${v.owner})`);
    slideIn(g, side, wa, () => win.webContents.send('visit', { type: 'arrive' }));
    sendToPets('visit', { type: 'hosted' }); // les animaux de la maison comptent leurs visiteurs
    g.leaveTimer = setTimeout(() => guestLeave(g), VISIT_LENGTH);
  });
}

function guestLeave(g) {
  if (!alive(g)) return;
  clearTimeout(g.leaveTimer);
  g.win.webContents.send('visit', { type: 'bye' });
  const dir = edgeOf(g).dir;
  // Promenade : un de nos animaux raccompagne le visiteur chez lui (ils sortent ensemble, du même côté)
  if (g.visit.walk === 1 && g.visit.code && online && online.open && !dnd) {
    const host = [...pets.values()].find(canVisit);
    if (host) startVisit(host, g.visit.code, 2, dir, g.name);
  }
  setTimeout(() => slideOut(g, () => {
    api({ action: 'visit-end', secret: online.secret, id: g.visit.id, played: [...g.played][0] || '', ate: Math.round(g.ate || 0) });
    if (alive(g)) g.win.destroy();
  }, dir), 2500);
}

// Le visiteur a mangé un fichier chez nous : il en profitera en rentrant chez lui
ipcMain.on('guest-ate', (e, amount) => {
  const g = [...guests.values()].find((x) => alive(x) && x.win.webContents === e.sender);
  if (g) g.ate = Math.min(100, (g.ate || 0) + Math.max(0, Number(amount) || 0));
});

// La page d'un invité apprend qui elle est (sa page est la même que celle d'un animal de la maison)
ipcMain.on('get-guest', (e) => {
  const g = [...guests.values()].find((x) => alive(x) && x.win.webContents === e.sender);
  e.returnValue = g ? { owner: g.visit.owner, pet: g.visit.pet, walk: g.visit.walk || 0 } : null;
});

// Onglet « Amis » des réglages
ipcMain.handle('online-get', async () => {
  if (!(await ensureOnline())) return { error: 'reseau' };
  await syncOnline();
  return publicOnline();
});
ipcMain.handle('online-add', async (_e, code) => {
  if (!(await ensureOnline())) return { error: 'reseau' };
  const r = await api({ action: 'friend-add', secret: online.secret, code: String(code || '') });
  await syncOnline();
  return { ...r, ...publicOnline() };
});
ipcMain.handle('online-accept', async (_e, code) => {
  if (!online) return publicOnline();
  await api({ action: 'friend-accept', secret: online.secret, code: String(code || '') });
  await syncOnline();
  return publicOnline();
});
ipcMain.handle('online-remove', async (_e, code) => {
  if (!online) return publicOnline();
  await api({ action: 'friend-remove', secret: online.secret, code: String(code || '') });
  await syncOnline();
  return publicOnline();
});
ipcMain.handle('online-open', async (_e, open) => {
  if (!online) return publicOnline();
  online.open = !!open;
  writeJson('online.json', online);
  await syncOnline();
  return publicOnline();
});
// Envoyer un cadeau ou une carte postale à un ami, de la part de cet animal
// (msg : numéro du message de la carte, choisi dans une liste ; jamais de texte libre)
ipcMain.handle('online-gift', async (e, code, kind, msg) => {
  const p = petOf(e.sender);
  if (!online || !p || p.guest) return { error: 'reseau' };
  const card = petCard(p);
  return api({ action: 'gift-send', secret: online.secret, code: String(code || ''), kind: kind === 'carte' ? 'carte' : 'cadeau',
    msg: Number(msg) || 0, owner: card.owner, pet: card.pet.name || '' });
});

// « Envoyer en visite » : cet animal part chez l'ami choisi
// (walk : promenade, l'animal de l'ami le raccompagnera)
ipcMain.handle('online-visit', async (e, code, walk) => {
  const p = petOf(e.sender);
  if (!p || p.guest) return { error: 'occupe' };
  return startVisit(p, String(code || ''), walk ? 1 : 0);
});

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

// La météo part à tous les animaux (pour leur tenue) ; un seul la commente (lead), et elle s'affiche une fois
// en haut du menu de l'icône et dans son infobulle
function sendWeather() {
  const lead = [...pets.values()].find((p) => alive(p) && !p.away);
  for (const p of pets.values()) if (alive(p)) p.win.webContents.send('weather', weather && { ...weather, lead: p === lead });
  buildTrayMenu();
  updateTrayAlert();
}

const WEATHER_ICONS = { clear: '☀️', clouds: '☁️', rain: '🌧️', storm: '⛈️', snow: '❄️', fog: '🌫️' };
const weatherLine = () => (weather
  ? tr('{icon} {temp} °C à {city}', { icon: weather.condition === 'clear' && !weather.isDay ? '🌙' : WEATHER_ICONS[weather.condition] || '', temp: weather.temp, city: weather.city })
  : null);

async function fetchWeather() {
  if (!city) {
    weather = null;
    sendWeather();
    return;
  }
  try {
    if (!cityGeo || cityGeo.query !== city) {
      const g = await (await net.fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr`)).json();
      const r = g.results && g.results[0];
      if (!r) { weather = null; sendWeather(); return; }
      cityGeo = { query: city, name: r.name, lat: r.latitude, lon: r.longitude };
    }
    const f = await (await net.fetch(`https://api.open-meteo.com/v1/forecast?latitude=${cityGeo.lat}&longitude=${cityGeo.lon}&current=temperature_2m,weather_code,is_day&timezone=auto`)).json();
    const c = f.current;
    weather = { city: cityGeo.name, condition: weatherCondition(c.weather_code), temp: Math.round(c.temperature_2m), isDay: c.is_day === 1 };
    sendWeather();
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

// En tête du menu de l'icône : la version, ou la mise à jour à installer
function updateMenuItem() {
  if (updateState && updateState.status === 'ready') {
    return { label: tr('🔄 Redémarrer pour installer la v{v}', { v: updateState.version }), click: installUpdate };
  }
  if (updateState && updateState.status === 'downloading') {
    return { label: tr('⬇ Téléchargement de la v{v}…', { v: updateState.version }), enabled: false };
  }
  if (updateUrl) return { label: tr('⬇ Nouvelle version disponible'), click: () => shell.openExternal(updateUrl) };
  return { label: `ThomasGotchi v${app.getVersion()}`, enabled: false };
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
let checkingUpdate = false; // une recherche est en cours
async function checkForUpdates(manual = false) {
  if (!app.isPackaged) return;
  if (updateState) return; // déjà trouvée : en téléchargement ou prête
  checkingUpdate = true;
  setTimeout(() => { checkingUpdate = false; }, 15000); // le temps de la réponse de GitHub
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

// ---------- Pointeur laser ----------
// Pendant 30 s, un point rouge suit la souris (petite fenêtre qui laisse passer les clics) ; les animaux le chassent.
let laser = null; // { win, timer, end }

function startLaser() {
  if (laser) return;
  const win = new BrowserWindow({
    width: 40, height: 40, transparent: true, frame: false, resizable: false, focusable: false, skipTaskbar: true,
    hasShadow: false, alwaysOnTop: true, show: false, backgroundColor: '#00000000',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.setIgnoreMouseEvents(true);
  win.setAlwaysOnTop(true, PET_LEVEL);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'src', 'laser.html'));
  win.once('ready-to-show', () => win.showInactive());
  const follow = () => {
    if (win.isDestroyed()) return;
    const c = screen.getCursorScreenPoint();
    win.setBounds({ x: c.x - 20, y: c.y - 20, width: 40, height: 40 });
    win.moveTop();
  };
  follow();
  laser = { win, timer: setInterval(follow, 16), end: setTimeout(stopLaser, 30000) };
  sendToPets('laser', true);
  buildTrayMenu();
}

function stopLaser() {
  if (!laser) return;
  clearInterval(laser.timer);
  clearTimeout(laser.end);
  if (!laser.win.isDestroyed()) laser.win.destroy();
  laser = null;
  sendToPets('laser', false);
  buildTrayMenu();
}

// ---------- Calendrier de l'Avent ----------
// Du 1er au 24 décembre, une boîte numérotée par jour, posée près d'un animal (advent.json : dernier jour donné).
// TG_ADVENT_DAY : forcer un jour pour les tests.
function checkAdvent() {
  const d = new Date();
  const day = Number(process.env.TG_ADVENT_DAY) || (d.getMonth() === 11 && d.getDate() <= 24 ? d.getDate() : 0);
  if (!day || allHidden()) return;
  const key = `${d.getFullYear()}-${day}`;
  if ((readJson('advent.json') || {}).last === key) return;
  const p = [...pets.values()].find((x) => alive(x) && !x.away && x.lastState && !x.lastState.dead && !(Date.now() < x.lastState.hatchAt));
  if (!p) return;
  try { writeJson('advent.json', { last: key }); } catch { return; }
  p.win.webContents.send('visit', { type: 'advent', day });
}

// ---------- Mode concentration ----------
// 25 min de travail : les animaux vont s'installer sagement (dans leur panier s'il y en a un), sans bouger ni parler.
// Ensuite ils félicitent et proposent 5 min de pause ; à la fin de la pause, ils le signalent.
const FOCUS_MIN = Number(process.env.TG_FOCUS_MIN) || 25; // TG_FOCUS_MIN : plus court pour les tests
let focus = null; // { phase: 'work' | 'pause', until, timer }

function startFocus() {
  stopFocus(true);
  const until = Date.now() + FOCUS_MIN * 60000;
  focus = { phase: 'work', until, timer: setTimeout(() => {
    focus = { phase: 'pause', timer: setTimeout(() => { focus = null; sendToPets('focus', { phase: 'end' }); buildTrayMenu(); }, (FOCUS_MIN / 5) * 60000) };
    sendToPets('focus', { phase: 'pause', minutes: FOCUS_MIN });
    buildTrayMenu();
  }, FOCUS_MIN * 60000) };
  sendToPets('focus', { phase: 'work', until });
  buildTrayMenu();
}

function stopFocus(silent) {
  if (!focus) return;
  clearTimeout(focus.timer);
  focus = null;
  if (!silent) { sendToPets('focus', { phase: 'stop' }); buildTrayMenu(); }
}

// ---------- Pense-bête ----------
// Rappels notés par l'utilisateur (reminders.json), communs à tous les animaux : { id, text, at (ms), daily }.
// À l'heure dite, un animal vient le dire dans une bulle ; s'ils sont tous cachés ou partis, une notification.
// Un rappel manqué pendant que l'application était fermée est donné au démarrage (s'il date de moins de 12 h).
let reminders = [];

function saveReminders() {
  try { writeJson('reminders.json', reminders); } catch { /* sans gravité */ }
}

function checkReminders() {
  const now = Date.now();
  let changed = false;
  for (const r of reminders.slice()) {
    if (r.at > now) continue;
    if (now - r.at < 12 * 3600000) fireReminder(r, now - r.at > 2 * 60000);
    if (r.daily) { while (r.at <= now) r.at += 86400000; } else reminders = reminders.filter((x) => x !== r);
    changed = true;
  }
  if (changed) saveReminders();
}

function fireReminder(r, late) {
  // (pas un œuf : il ne pourrait rien dire)
  const p = [...pets.values()].find((x) => alive(x) && !x.away && !x.guest && x.lastState && !x.lastState.dead && !(Date.now() < x.lastState.hatchAt));
  diag(`pense-bête${late ? ' (en retard)' : ''} : ${p && !allHidden() ? p.name || p.id : 'notification'}`);
  if (p && !allHidden()) {
    p.win.showInactive();
    p.win.webContents.send('reminder', { text: r.text, late });
  } else {
    notify('📝 ' + r.text);
  }
}

ipcMain.handle('reminders-get', () => reminders);
ipcMain.handle('reminders-add', (_e, r) => {
  const text = String((r && r.text) || '').trim().slice(0, 80);
  const at = Number(r && r.at);
  if (!text || !at) return reminders;
  reminders.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text, at, daily: !!r.daily });
  reminders.sort((a, b) => a.at - b.at);
  saveReminders();
  return reminders;
});
ipcMain.handle('reminders-remove', (_e, id) => {
  reminders = reminders.filter((r) => r.id !== id);
  saveReminders();
  return reminders;
});

app.setAppUserModelId('com.thomasgotchi.app'); // nom affiché dans les notifications Windows

app.whenReady().then(() => {
  if (isMac && app.dock) app.dock.hide();
  applyScaleValues(Number((readJson('settings.json') || {}).scale) || 1); // taille des animaux, avant de créer leurs fenêtres
  gravity = (readJson('settings.json') || {}).gravity !== false; // avant leur première chute au démarrage
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
  const furn = readJson('furniture.json') || {};
  if (furn.on && furn.bowl) spawnFurniture('bowl', furn.bowl);
  if (furn.basket) spawnFurniture('basket', furn.basket);
  if (furn.plant) spawnFurniture('plant', furn.plant);
  setInterval(plantTick, 60000);
  const settings = readJson('settings.json') || {};
  dnd = !!settings.dnd;
  autoHideSetting = settings.autoHide !== false;
  // Raccourci clavier pour tout cacher / tout afficher, même quand ThomasGotchi n'est pas au premier plan
  try { globalShortcut.register(HIDE_SHORTCUT, toggleVisible); } catch { /* raccourci déjà pris par une autre application */ }
  if (typeof settings.city === 'string') city = settings.city;
  if (typeof settings.lang === 'string') langSetting = settings.lang;
  buildTrayMenu();
  fetchWeather();
  setInterval(fetchWeather, 30 * 60000);
  setupAutoUpdater();
  checkForUpdates();
  setInterval(checkForUpdates, 3600 * 1000);
  // Visites entre ordinateurs : seulement si l'onglet « Amis » a déjà été ouvert une fois (inscription faite)
  const account = readJson('online.json');
  if (account && account.code && account.secret) online = { open: true, ...account };
  reminders = Array.isArray(readJson('reminders.json')) ? readJson('reminders.json') : [];
  setTimeout(checkReminders, 8000); // laisse aux animaux le temps de se réveiller
  setInterval(checkReminders, 15000);
  setTimeout(checkAdvent, 20000);
  setInterval(checkAdvent, 60000);
  setTimeout(syncOnline, 5000);
  setInterval(syncOnline, Number(process.env.TG_SYNC) || 30000); // TG_SYNC : plus court pour les tests
});

app.on('before-quit', () => { for (const p of pets.values()) saveWindowPosition(p); });
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { appQuitting = true; globalShortcut.unregisterAll(); if (watcher) watcher.kill(); });
