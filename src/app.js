// Boucle principale : affichage, interactions souris, glisser-déposer, panneaux.

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const ctx = canvas.getContext('2d');
const bubble = $('bubble');
const panel = $('panel');
const modal = $('modal');
const stageEl = $('stage');

let state = null;
let draft = { style: 'cute', color: 'rose', species: 'chat' }; // choix en cours dans la fenêtre « nouvel œuf »
let box = { left: 80, right: 160, top: 200, bottom: 292 };
let anim = null;
let animStart = 0;
let animDur = 0;
let facing = 0;
let walking = null;
let walkBusy = false;
let nextWalkAt = performance.now() + 4000;
let blinkUntil = 0;
let nextBlinkAt = performance.now() + 3000;
let bubbleUntil = 0;
let lastNeedAt = 0;
let lastNotifAt = 0;
let lastSaveAt = 0;
let lastFrame = 0;
let hideTimer = null;
let press = null;
let dragging = false;
let hungryLook = false;
let snoreTick = 0;
let unlockTick = 0;
let pendingMemorials = []; // souvenirs à transmettre au prochain œuf
let cursor = null; // position de la souris par rapport à la fenêtre (envoyée par main.js)

// ---------- Utilitaires ----------

function save() {
  if (state) desk.save(state);
}

function say(text, ms = 3800) {
  if (!text) return;
  bubble.textContent = text;
  bubble.classList.remove('hidden');
  bubbleUntil = performance.now() + ms;
}

function play(name, duration) {
  if (state) Sound.play(name, state.species);
  anim = name;
  animStart = performance.now();
  animDur = duration;
}

function applyStyle(style) {
  document.body.className = 'theme-' + style;
}

function modalIsOpen() {
  return !modal.classList.contains('hidden');
}

// ---------- Rendu ----------

function buildView(now) {
  const t = now / 1000;
  const animT = anim ? (now - animStart) / 1000 : 0;
  if (!state) {
    return { stage: 'egg', eggProgress: 0, color: Pet.COLORS[draft.color], style: draft.style, t };
  }
  const stage = Pet.stage(state);
  const mood = Pet.mood(state);
  const blinking = now < blinkUntil;

  let eyes = 'open';
  if (mood === 'dead') eyes = 'dead';
  else if (mood === 'sleep') eyes = 'closed';
  else if (anim === 'dizzy') eyes = 'dizzy';
  else if (anim === 'play' || anim === 'love' || anim === 'hatch' || anim === 'jump' || anim === 'roll') eyes = 'joy';
  else if (blinking) eyes = 'closed';
  else if (mood === 'sick' || state.energy < 25) eyes = 'tired';
  else if (mood === 'sad') eyes = 'sad';

  // Besoin le plus urgent, visible sur son visage et dans une bulle de pensée
  let need = null;
  if (mood !== 'dead' && mood !== 'sleep') {
    if (state.thirst < 30) need = 'thirst';
    else if (state.hunger < 30) need = 'hunger';
  }

  let mouth = 'smile';
  if (anim === 'eat') mouth = Math.sin(animT * 14) > 0 ? 'chomp' : 'flat';
  else if (anim === 'drink' || mood === 'sleep' || hungryLook) mouth = hungryLook ? 'open' : 'o';
  else if (anim === 'play' || anim === 'love' || anim === 'hatch') mouth = 'open';
  else if (mood === 'dead') mouth = 'flat';
  else if (mood === 'sick') mouth = 'wavy';
  else if (need === 'thirst') mouth = 'tongue';
  else if (need === 'hunger') mouth = 'drool';
  else if (mood === 'sad') mouth = 'sad';
  else if (mood === 'ok') mouth = 'flat';

  const coat = Pet.COATS[state.color] || {};

  // Les yeux suivent la souris quand elle n'est pas trop loin
  let lookX = null;
  let lookY = 0;
  if (cursor && !walking && mood !== 'sleep' && mood !== 'dead') {
    const headY = stageEl.offsetTop + Draw.restTop(stage, state.species) + 45;
    const dx = cursor.x - 120;
    const dy = cursor.y - headY;
    if (Math.hypot(dx, dy) < 900) {
      lookX = Math.max(-1, Math.min(1, dx / 160));
      lookY = Math.max(-1, Math.min(1, dy / 160));
    }
  }
  if (anim === 'look') {
    // Il regarde à gauche, puis à droite
    lookX = Math.sin(animT * 3);
    lookY = -0.3;
  }

  return {
    stage,
    species: state.species || 'chat',
    mood,
    eyes,
    mouth,
    color: Pet.COLORS[state.color] || Pet.COLORS.rose,
    coat,
    dark: !!coat.dark && mood !== 'dead',
    need,
    dirty: mood !== 'dead' && state.clean < 35,
    care: state.care,
    style: state.style,
    t,
    anim,
    animT,
    facing,
    lookX,
    lookY,
    walking: !!walking,
    running: !!walking && walking.speed > 3,
    nightcap: state.sleeping && isNight(),
    accessory: state.accessory,
    eggProgress: Math.min(1, Math.max(0, 1 - (state.hatchAt - Date.now()) / HATCH_DELAY)),
  };
}

function placePanel() {
  if (panel.classList.contains('hidden')) return;
  const head = Draw.restTop(state ? Pet.stage(state) : 'egg', state && state.species);
  panel.style.top = Math.max(2, head - panel.offsetHeight - 6) + 'px';
}

function placeBubble() {
  if (bubble.classList.contains('hidden')) return;
  // Panneau ouvert : la bulle passe au-dessus du panneau, sinon au-dessus de la tête
  const top = panel.classList.contains('hidden')
    ? box.top - bubble.offsetHeight - 10
    : panel.offsetTop - bubble.offsetHeight - 6;
  bubble.style.top = Math.max(2, top) + 'px';
}

function frame(now) {
  requestAnimationFrame(frame);
  if (now - lastFrame < 33) return; // ~30 images/s suffisent et ménagent le processeur
  lastFrame = now;

  if (anim && now - animStart > animDur) anim = null;
  if (now > nextBlinkAt) {
    blinkUntil = now + 140;
    nextBlinkAt = now + 2500 + Math.random() * 4000;
  }
  if (now > bubbleUntil) bubble.classList.add('hidden');

  box = Draw.render(ctx, buildView(now));
  placePanel();
  placeBubble();
  wander(now);
}

// ---------- Promenade sur le bureau ----------

function canWander(allowedAnim) {
  return state && !state.dead && !state.sleeping && !Pet.isEgg(state) && (!anim || anim === allowedAnim) &&
    !dragging && panel.classList.contains('hidden') && !modalIsOpen();
}

// Petits numéros quand il ne marche pas : saut, roulade, étirement, regard autour de lui
const TRICKS = [
  { anim: 'jump', dur: 800, say: ['Hop !', 'Youpi !'] },
  { anim: 'roll', dur: 900, say: ['Roulade !', 'Wiii !'], move: 5 },
  { anim: 'stretch', dur: 1500, say: ['Étiiiirement…'] },
  { anim: 'look', dur: 2400, say: ['Hmm ?', 'Qu\'est-ce que c\'est ?'] },
];

function startWalk(dir, steps, speed = 2) {
  walking = { dir, steps, speed };
  facing = dir;
}

function wander(now) {
  if (walking) {
    if (!canWander(walking.anim) || walking.steps <= 0) {
      walking = null;
      facing = 0;
      return;
    }
    if (walkBusy) return;
    walkBusy = true;
    walking.steps--;
    desk.moveBy(walking.dir * walking.speed, 0).then((r) => {
      walkBusy = false;
      if (!r || !walking) return;
      if ((r.blockedLeft && walking.dir < 0) || (r.blockedRight && walking.dir > 0)) {
        walking.dir *= -1;
        facing = walking.dir;
      }
    });
    return;
  }
  if (now < nextWalkAt) return;
  nextWalkAt = now + 3000 + Math.random() * 7000;
  if (!canWander() || Math.random() > 0.85) return;

  // Curieux : la souris bouge près du sol à côté de lui, il va voir
  const cursorNear = cursor && Math.abs(cursor.x - 120) < 450 && Math.abs(cursor.y - (stageEl.offsetTop + 270)) < 250;
  const roll = Math.random();
  if (cursorNear && roll < 0.35) {
    const dx = cursor.x - 120;
    startWalk(dx > 0 ? 1 : -1, Math.min(150, Math.abs(dx) / 2), 2);
  } else if (roll < 0.6) {
    startWalk(Math.random() < 0.5 ? -1 : 1, 40 + Math.floor(Math.random() * 120));
  } else if (roll < 0.72) {
    // Petite course
    startWalk(Math.random() < 0.5 ? -1 : 1, 30 + Math.floor(Math.random() * 40), 5);
  } else {
    const trick = TRICKS[Math.floor(Math.random() * TRICKS.length)];
    if (trick.move) {
      startWalk(Math.random() < 0.5 ? -1 : 1, Math.round(trick.dur / 33), trick.move);
      walking.anim = trick.anim;
    }
    play(trick.anim, trick.dur);
    if (Math.random() < 0.4) say(trick.say[Math.floor(Math.random() * trick.say.length)], 1800);
  }
}

// ---------- Rythme du jour ----------

function isNight() {
  const h = new Date().getHours();
  return h >= 22 || h < 7;
}

// Identifiant de la nuit en cours (la date du soir), pour ne le coucher qu'une fois par nuit
function nightKey() {
  const d = new Date();
  if (d.getHours() < 7) d.setDate(d.getDate() - 1);
  return d.toDateString();
}

function dayRhythm() {
  if (state.dead || Pet.isEgg(state)) return;
  if (isNight()) {
    if (!state.sleeping && !anim && !modalIsOpen() && !dragging && state.bedNight !== nightKey()) {
      state.bedNight = nightKey();
      state.sleeping = true;
      state.nightSleep = true;
      walking = null;
      say('Il est tard… bonne nuit 🌙', 4000);
      save();
    }
  } else if (state.sleeping && state.nightSleep) {
    state.sleeping = false;
    state.nightSleep = false;
    play('stretch', 1500);
    say('Bonjour ! ☀️ Bien dormi !', 4000);
    save();
  }
}

// ---------- Logique (toutes les secondes) ----------

function logic() {
  if (!state) return;
  const before = Pet.stage(state);
  const events = Pet.tick(state);
  const after = Pet.stage(state);

  if (before === 'egg' && after !== 'egg') {
    play('hatch', 2000);
    say(`Coucou ! Je suis ${state.name} ! 💕`, 5000);
  } else if (before !== after && !state.dead) {
    play('heal', 2000);
    say(after === 'adult' ? 'Je suis devenu grand ! ⭐' : 'J\'ai grandi ! 🌱', 5000);
  }

  for (const ev of events) {
    if (ev === 'wake') { play('stretch', 1500); say('Bien dormi ! ☀️'); }
    if (ev === 'collapse') say('Trop fatigué… je m\'endors…');
    if (ev === 'poop') { addPoop(); Sound.play('poop'); say('Oups… 💩'); }
    if (ev === 'dead') { Sound.play('sad'); save(); showDead(); }
  }

  dayRhythm();

  // Petit ronflement de temps en temps
  if (state.sleeping && ++snoreTick % 4 === 0) Sound.play('snore');

  const now = performance.now();
  const need = Pet.need(state);
  if (need && now - lastNeedAt > 3 * 60 * 1000 && now > bubbleUntil) {
    lastNeedAt = now;
    Sound.play('alert');
    say(need, 5000);
  }
  if (Pet.isSick(state) && now - lastNotifAt > 3 * 3600 * 1000 && 'Notification' in window) {
    lastNotifAt = now;
    new Notification('ThomasGotchi', { body: `${state.name} est malade ! Viens vite t'occuper de lui.` });
  }

  if (!panel.classList.contains('hidden')) updatePanel();
  if (++unlockTick % 30 === 0) checkUnlocks();
  if (now - lastSaveAt > 15000) {
    lastSaveAt = now;
    save();
  }
}

// ---------- Panneau des jauges ----------

function updatePanel() {
  $('pet-name').textContent = state.name;
  $('pet-age').textContent = Pet.ageText(state);
  for (const key of ['hunger', 'thirst', 'energy', 'fun', 'clean', 'health']) {
    const v = state[key];
    const el = $('bar-' + key);
    el.style.width = v + '%';
    el.className = v < 25 ? 'low' : v < 50 ? 'mid' : '';
  }
  document.querySelector('[data-act=sleep]').classList.toggle('active', state.sleeping);
}

function showPanel() {
  clearTimeout(hideTimer);
  if (!state || state.dead || modalIsOpen()) return;
  if (panel.classList.contains('hidden')) {
    updatePanel();
    panel.classList.remove('hidden');
  }
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => panel.classList.add('hidden'), 900);
}

function doAction(act) {
  if (!state) return;
  let r;
  switch (act) {
    case 'feed': say('Glisse un fichier sur moi pour me nourrir ! 📄'); return;
    case 'drink': r = Pet.drink(state); break;
    case 'sleep': r = Pet.toggleSleep(state); break;
    case 'play': Games.open(); return;
    case 'ball': r = Pet.play(state); if (r.ok) r.anim = 'play'; break;
    case 'wash': r = Pet.wash(state); break;
    case 'heal': r = Pet.heal(state); break;
    case 'settings': openSettings(); return;
    default: return;
  }
  if (r.msg) say(r.msg);
  if (r.ok && r.anim) play(r.anim, r.anim === 'play' ? 1800 : 2000);
  if (r.ok && act === 'wash') clearPoops();
  updatePanel();
  save();
}

panel.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (btn) doAction(btn.dataset.act);
});

// ---------- Souris : survol, clic, déplacement ----------
// La fenêtre laisse passer les clics partout, sauf sur le petit être et les panneaux.

function overInteractive(x, y) {
  const el = document.elementFromPoint(x, y);
  if (el && el.closest('.hit')) return true;
  return overPet(x, y);
}

// x, y : coordonnées dans la fenêtre ; la zone du petit être peut être décalée quand la fenêtre est agrandie
function overPet(x, y) {
  y -= stageEl.offsetTop;
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

document.addEventListener('mousemove', (e) => {
  if (press && !dragging && Math.hypot(e.screenX - press.x, e.screenY - press.y) > 4) {
    dragging = true;
    walking = null;
    desk.dragStart();
  }
  if (dragging) return;
  const over = overInteractive(e.clientX, e.clientY);
  desk.setIgnore(!over);
  if (over) showPanel();
  else scheduleHide();
});

document.addEventListener('mouseout', (e) => {
  if (e.relatedTarget || dragging || modalIsOpen()) return;
  desk.setIgnore(true);
  scheduleHide();
});

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || e.target.closest('.hit') || !overPet(e.clientX, e.clientY)) return;
  press = { x: e.screenX, y: e.screenY };
});

document.addEventListener('mouseup', () => {
  if (dragging) {
    dragging = false;
    desk.dragEnd();
  } else if (press) {
    clickPet();
  }
  press = null;
});

window.addEventListener('blur', () => {
  if (dragging) { dragging = false; desk.dragEnd(); }
  press = null;
});

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (state && !state.dead && overPet(e.clientX, e.clientY)) openSettings();
});

function clickPet() {
  if (!state || state.dead) return;
  if (Pet.isEgg(state)) { say('Toc toc… 🥚'); return; }
  if (state.sleeping) { say('Zzz… chuuut…'); return; }
  const r = Pet.pet(state);
  if (r.ok) play('love', 1400);
}

// ---------- Crottes sur le bureau ----------
// Chaque crotte est une petite fenêtre posée à l'endroit où il l'a faite ; un clic dessus la nettoie.

async function addPoop(side = Math.random() < 0.5 ? -1 : 1) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const pos = await desk.poopAdd(id, side, state.style);
  if (!pos || !state) return;
  state.poopSpots = state.poopSpots || [];
  state.poopSpots.push({ id, ...pos });
  save();
}

function clearPoops() {
  desk.poopClearAll();
  state.poopSpots = [];
  save();
}

// Au démarrage : on remet les crottes sauvegardées, et on ajoute celles faites pendant l'absence
async function restorePoops() {
  const spots = (state.poopSpots || []).slice(0, state.poops);
  state.poopSpots = spots.length ? await desk.poopRestore(spots, state.style) : [];
  for (let i = state.poopSpots.length; i < state.poops; i++) await addPoop(i % 2 ? 1 : -1);
}

// ---------- Glisser-déposer de fichiers = nourriture ----------

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  desk.setIgnore(false);
  if (state && !state.dead && !state.sleeping) hungryLook = true;
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy'; // le fichier d'origine n'est jamais déplacé ni supprimé
});

document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) hungryLook = false;
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  hungryLook = false;
  if (!state) return;
  const meals = [];
  for (const item of e.dataTransfer.items) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
    const file = item.getAsFile();
    if (file) meals.push({ name: file.name, size: file.size, isDir: !!(entry && entry.isDirectory) });
  }
  meals.slice(0, 5).forEach((meal, i) => {
    setTimeout(() => {
      const r = Pet.feed(state, meal);
      if (r.ok) checkUnlocks();
      if (r.msg) say(r.msg, 3500);
      if (r.ok) play(r.anim, 1800);
      if (!panel.classList.contains('hidden')) updatePanel();
      save();
    }, i * 2000);
  });
  if (meals.length > 5) setTimeout(() => say('Ouf, j\'ai assez mangé pour l\'instant !'), 10000);
});

// ---------- Accessoires ----------

function checkUnlocks() {
  for (const a of Pet.checkUnlocks(state)) {
    if (!state.accessory) state.accessory = a.id;
    Sound.play('win');
    say(`Cadeau ! ${a.icon} ${a.name} débloqué !`, 5000);
    save();
  }
}

function buildAccessories(container) {
  container.innerHTML = '';
  const owned = Pet.ACCESSORIES.filter((a) => state.unlocked.includes(a.id));
  if (!owned.length) {
    container.innerHTML = '<span class="hint">Prends bien soin de lui pour gagner des accessoires !</span>';
    return;
  }
  for (const a of [{ id: '', icon: '∅', name: 'Aucun' }, ...owned]) {
    const b = document.createElement('button');
    b.dataset.value = a.id;
    b.textContent = a.icon;
    b.title = a.name;
    container.appendChild(b);
  }
  bindChoices(container, state.accessory || '', (v) => { state.accessory = v || null; save(); });
}

// ---------- Fenêtres : nouvel œuf, réglages, décès ----------

function buildSwatches(container, current, onPick) {
  container.innerHTML = '';
  for (const [key, hex] of Object.entries(Pet.COLORS)) {
    const b = document.createElement('button');
    const coat = Pet.COATS[key];
    b.style.background = (coat && coat.swatch) || hex;
    b.title = coat ? coat.name : key;
    b.classList.toggle('on', key === current);
    b.addEventListener('click', () => {
      container.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onPick(key);
    });
    container.appendChild(b);
  }
}

function bindChoices(container, current, onPick) {
  container.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', b.dataset.value === current);
    b.onclick = () => {
      container.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onPick(b.dataset.value);
    };
  });
}

async function openModal(id) {
  for (const card of modal.querySelectorAll('.card')) card.classList.toggle('hidden', card.id !== id);
  panel.classList.add('hidden');
  bubble.classList.add('hidden');
  closeModal();

  // On mesure la carte, puis on agrandit la fenêtre juste assez pour qu'elle tienne au-dessus de la tête
  modal.style.visibility = 'hidden';
  modal.classList.remove('hidden');
  const cardH = $(id).offsetHeight + 10;
  const head = Draw.restTop(state ? Pet.stage(state) : 'egg', state && state.species);
  const extra = Math.max(0, cardH - head);
  const r = extra ? await desk.expand(extra) : { above: true };
  if (r && r.above) {
    stageEl.style.top = extra + 'px';
    modal.style.top = '0px';
    modal.style.height = (extra + head) + 'px';
    modal.style.alignItems = 'flex-end';
  } else {
    // Petit être collé en haut de l'écran : la fenêtre s'agrandit vers le bas
    stageEl.style.top = '0px';
    modal.style.top = (300 + extra - cardH) + 'px';
    modal.style.height = cardH + 'px';
    modal.style.alignItems = 'flex-start';
  }
  modal.style.visibility = '';
  desk.setIgnore(false);
}

function closeModal() {
  if (!modalIsOpen()) return;
  modal.classList.add('hidden');
  stageEl.style.top = '';
  desk.collapse();
  desk.setIgnore(true);
}

function openNew() {
  const card = $('modal-new');
  draft = { style: state ? state.style : 'cute', color: state ? state.color : 'rose', species: (state && state.species) || 'chat' };
  applyStyle(draft.style);
  $('new-name').value = '';
  bindChoices(card.querySelector('[data-group=style]'), draft.style, (v) => { draft.style = v; applyStyle(v); });
  bindChoices(card.querySelector('[data-group=species]'), draft.species, (v) => { draft.species = v; });
  buildSwatches(card.querySelector('[data-group=color]'), draft.color, (v) => { draft.color = v; });
  if (state) {
    const m = Pet.memorial(state);
    pendingMemorials = (state.memorials || []).concat(m ? [m] : []).slice(-12);
  }
  state = null;
  openModal('modal-new');
  setTimeout(() => $('new-name').focus(), 200);
}

$('new-ok').addEventListener('click', () => {
  const name = $('new-name').value.trim() || 'Didou';
  desk.poopClearAll();
  state = Pet.create(name, draft.style, draft.color, draft.species, pendingMemorials);
  Sound.enabled = true;
  applyStyle(state.style);
  closeModal();
  save();
  say(`Prends soin de cet œuf… il va bientôt éclore !`, 5000);
});
$('new-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('new-ok').click(); });

async function openSettings() {
  if (!state || state.dead) return;
  const card = $('modal-settings');
  $('set-name').value = state.name;
  bindChoices(card.querySelector('[data-group=style]'), state.style, (v) => { state.style = v; applyStyle(v); save(); });
  bindChoices(card.querySelector('[data-group=species]'), state.species || 'chat', (v) => { state.species = v; save(); });
  buildAccessories(card.querySelector('[data-group=accessory]'));
  buildSwatches(card.querySelector('[data-group=color]'), state.color, (v) => { state.color = v; save(); });
  $('set-login').checked = await desk.getLogin();
  $('set-sound').checked = state.sound !== false;
  const count = await desk.petCount();
  $('set-adopt').disabled = count >= 5;
  $('set-release').classList.toggle('hidden', count <= 1);
  openModal('modal-settings');
}

$('set-name').addEventListener('input', () => {
  const v = $('set-name').value.trim();
  if (v) state.name = v;
});
$('set-login').addEventListener('change', (e) => desk.setLogin(e.target.checked));
$('set-sound').addEventListener('change', (e) => {
  state.sound = e.target.checked;
  Sound.enabled = state.sound;
  if (state.sound) Sound.play('voice', state.species);
  save();
});
$('set-close').addEventListener('click', () => { closeModal(); save(); });
$('set-quit').addEventListener('click', () => { save(); desk.quit(); });
$('set-adopt').addEventListener('click', () => {
  closeModal();
  desk.adopt();
});
$('set-release').addEventListener('click', () => {
  if (!confirm(`Laisser partir ${state.name} ? Il s'en ira pour toujours.`)) return;
  desk.poopClearAll();
  desk.release();
});

$('set-reset').addEventListener('click', () => {
  if (confirm(`Recommencer avec un nouvel œuf ? ${state.name} disparaîtra pour toujours.`)) openNew();
});

function showDead() {
  $('dead-text').textContent = `${state.name} est parti au paradis des pixels après ${Pet.ageText(state)} de vie. Il ne faut pas oublier de le nourrir, de le faire boire et de le laver…`;
  openModal('modal-dead');
}
$('dead-ok').addEventListener('click', openNew);

desk.onMenu((action) => { if (action === 'settings') openSettings(); });

desk.onCursor((pos) => { cursor = pos; });

// On l'a secoué en le déplaçant
desk.onShaken(() => {
  if (!state || state.dead || state.sleeping || Pet.isEgg(state)) return;
  play('dizzy', 2500);
  state.fun = Math.max(0, state.fun - 3);
  say('Ouh là… tout tourne ! 😵', 2500);
});

// Un autre animal passe tout près : petit câlin
desk.onMeet(({ name, side }) => {
  if (!state || state.dead || state.sleeping || Pet.isEgg(state) || modalIsOpen()) return;
  walking = null;
  facing = side;
  play('love', 1600);
  state.fun = Math.min(100, state.fun + 5);
  say(`Coucou ${name || 'toi'} ! 💕`);
});

desk.onPoopCleaned((id) => {
  if (!state) return;
  state.poopSpots = (state.poopSpots || []).filter((p) => p.id !== id);
  Pet.cleanPoop(state);
  Sound.play('sparkle');
  if (!state.dead && !state.sleeping) say(state.poops ? 'Merci ! ✨' : 'Tout propre, merci ! ✨');
  save();
});
window.addEventListener('beforeunload', save);

// ---------- Démarrage ----------

(async function start() {
  const saved = await desk.load();
  if (saved && saved.version === 1) {
    state = saved;
    Pet.upgrade(state);
    const away = Date.now() - state.lastTick;
    const events = Pet.tick(state);
    Sound.enabled = state.sound !== false;
    applyStyle(state.style);
    await restorePoops();
    if (state.dead) showDead();
    else if (events.includes('poop')) say('Pendant ton absence… oups 💩', 5000);
    else if (away > 3600 * 1000 && !state.sleeping) say('Te revoilà ! 💕', 4000);
    save();
  } else {
    openNew();
  }
  setInterval(logic, 1000);
  requestAnimationFrame(frame);
})();
