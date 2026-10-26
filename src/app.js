// Boucle principale : affichage, interactions souris, glisser-déposer, panneaux.

const $ = (id) => document.getElementById(id);

// Langue de l'interface (voir i18n.js) ; le réglage peut valoir 'auto'
I18N.lang = desk.lang.lang;
let langSetting = desk.lang.setting;
const canvas = $('scene');
const ctx = canvas.getContext('2d');
const bubble = $('bubble');
const panel = $('panel');
const modal = $('modal');
const stageEl = $('stage');

let state = null;
let petScaleNow = desk.scale || 1; // taille des animaux (réglage commun, voir main.js)
desk.onScale((s) => { petScaleNow = s; });

// La toile suit la densité de l'écran (zoom Windows 125 %, écran Retina…), sinon le dessin est agrandi et flou.
// Le dessin garde ses coordonnées de 240 x 300 grâce à la mise à l'échelle.
// Mac : la zone de dépôt (petite fenêtre posée sur l'animal, voir main.js) suit sa silhouette dans la fenêtre
// (envoyée seulement si elle change vraiment : la respiration et les petits sauts ne comptent pas)
let lastDropBox = null;
function sendDropBox() {
  if (!box) return;
  const r = { x: Math.round(box.left), y: Math.round(box.top + stageEl.offsetTop), w: Math.round(box.right - box.left), h: Math.round(box.bottom - box.top) };
  if (lastDropBox && ['x', 'y', 'w', 'h'].every((k) => Math.abs(r[k] - lastDropBox[k]) < 8)) return;
  lastDropBox = r;
  desk.dropBox(r);
}

let canvasDpr = 0;
function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  if (dpr !== canvasDpr) {
    canvasDpr = dpr;
    canvas.width = Math.round(240 * dpr);
    canvas.height = Math.round(300 * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
let draft = { style: 'cute', color: 'rose', species: 'chat', gender: 'm' }; // choix en cours dans la fenêtre « nouvel œuf »
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
let furn = null; // gamelle : { bowl: { x, food, water } }
let friends = []; // autres animaux : [{ name, x, points, level }] (envoyé par main.js)
let weather = null; // météo réelle : { city, condition, temp, isDay } (envoyée par main.js)
let dnd = false; // mode « ne pas déranger »
let festivity = null; // fête du moment (voir seasons.js), recalculée chaque minute
let cursor = null; // position de la souris par rapport à la fenêtre (envoyée par main.js)
let yarnInfo = null; // pelote de laine sortie : { x (par rapport à la fenêtre), moving }

// ---------- Utilitaires ----------

function save() {
  if (state && !desk.guest) desk.save(state); // un invité ne sauvegarde rien chez l'hôte
}

let reminderUntil = 0; // un rappel du pense-bête reste affiché : les autres bulles attendent

function say(text, ms = 3800) {
  if (!text || performance.now() < reminderUntil) return;
  // « Ne pas déranger » et mode concentration : il ne parle que si on est en train de s'occuper de lui
  if ((dnd || focusMode === 'sit') && panel.classList.contains('hidden') && !modalIsOpen()) return;
  bubble.textContent = t(text);
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
  else if (anim === 'fall') eyes = 'open';
  else if (['play', 'love', 'hatch', 'jump', 'roll', 'dance', 'spin', 'backflip', 'wave', 'tussle'].includes(anim)) eyes = 'joy';
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
  if (anim === 'fall') mouth = 'o';
  else if (anim === 'eat') mouth = Math.sin(animT * 14) > 0 ? 'chomp' : 'flat';
  else if (anim === 'drink' || mood === 'sleep' || hungryLook) mouth = hungryLook ? 'open' : 'o';
  else if (['play', 'love', 'hatch', 'dance', 'spin', 'backflip', 'wave', 'tussle'].includes(anim)) mouth = 'open';
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
    shine: Pet.shine(state), // embellissement : jours bien soignés (pelage brillant, collier, étoile)
    style: state.style,
    t,
    anim,
    animT,
    facing,
    lookX,
    lookY,
    walking: !!walking || visitWalk !== null,
    running: !!walking && walking.speed > 3,
    hop: !!Pet.trait(state).hop, // lapin : il sautille en marchant
    ailment: state.ailment || null, // petit ennui en cours : il se voit (nez rouge, puces…)
    flame: !!Pet.trait(state).flame && anim === 'love', // dragon : petite flamme pendant un câlin
    nightcap: state.sleeping && bedTime(),
    accessory: state.accessory,
    decor: festivity ? festivity.decor : null,
    magic: !!(festivity && festivity.magic), // soirée magique : baguette et étincelles
    // Pas de ciel dessiné autour de lui (soleil, nuages… en double avec plusieurs animaux) : seulement sa tenue,
    // la météo s'affiche une fois en haut du menu de l'icône
    gear: weatherGear(mood),
    ground: groundFx(), // ce que ses pattes soulèvent quand il marche (neige, boue, herbe, feuilles)
    night: isNight(),
    eggProgress: Math.min(1, Math.max(0, 1 - (state.hatchAt - Date.now()) / HATCH_DELAY)),
  };
}

// Hauteur du haut de la fenêtre qui dépasse de l'écran (perché tout en haut d'une fenêtre) : rien n'y est placé
let hiddenTop = 0;
desk.onHiddenTop((px) => { hiddenTop = px; });

function placePanel() {
  if (panel.classList.contains('hidden')) return;
  const head = Draw.restTop(state ? Pet.stage(state) : 'egg', state && state.species);
  panel.style.top = Math.max(2 + hiddenTop, head - panel.offsetHeight - 6) + 'px';
}

function placeBubble() {
  if (bubble.classList.contains('hidden')) return;
  // Panneau ouvert : la bulle passe au-dessus du panneau, sinon au-dessus de la tête
  const top = panel.classList.contains('hidden')
    ? box.top - bubble.offsetHeight - 10
    : panel.offsetTop - bubble.offsetHeight - 6;
  bubble.style.top = Math.max(2 + hiddenTop, top) + 'px';
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

  fitCanvas();
  box = Draw.render(ctx, buildView(now));
  sendDropBox();
  placePanel();
  placeBubble();
  wander(now);
}

// ---------- Promenade sur le bureau ----------

function canWander(allowedAnim) {
  return state && !state.dead && !state.sleeping && !state.paused && !dnd && focusMode !== 'sit' && !Pet.isEgg(state) && (!anim || anim === allowedAnim) &&
    !dragging && panel.classList.contains('hidden') && !modalIsOpen() && visitWalk === null && !visitAway;
}

// ---------- Visites entre ordinateurs (voir main.js) ----------
// visitWalk : sens de la marche pendant qu'il sort de l'écran ou y entre (la fenêtre glisse, lui ne fait que marcher)
let visitWalk = null;
let visitAway = false; // parti en visite chez un ami : il ne fait plus rien ici en attendant son retour
desk.onVisit((ev) => {
  if (ev.type === 'walk') {
    visitWalk = ev.dir ? ev.dir : null;
    if (ev.dir) { walking = null; facing = ev.dir; } else facing = 0;
  } else if (ev.type === 'leave') {
    visitAway = true;
    walking = null;
    panel.classList.add('hidden');
    closeModal();
    say(ev.walk === 2 ? t('Je raccompagne {name} chez {owner} ! 🐾', { name: ev.with, owner: ev.owner })
      : ev.walk ? t('On part en promenade chez {owner} ! 🐾', { owner: ev.owner })
        : t('Je vais rendre visite à {owner} ! 👋', { owner: ev.owner }), 2500);
  } else if (ev.type === 'gift' && !desk.guest) {
    // Cadeau ou carte postale envoyé par un ami : posé sur le bureau, à ouvrir d'un clic
    const from = { owner: ev.owner || '?', pet: ev.pet || '?' };
    addTreat(ev.kind === 'carte' ? 'card' : 'gift', ev.kind === 'carte' ? { from, msg: ev.msg || 0 } : { from });
    play('jump', 800);
    say(ev.kind === 'carte' ? t('Une carte postale de {pet} ({owner}) ! 💌', from) : t('Un cadeau de la part de {pet} ({owner}) ! 🎁', from), 5500);
  } else if (ev.type === 'advent' && !desk.guest) {
    // Calendrier de l'Avent : la boîte du jour, posée sur le bureau (le numéro passe par « edge »)
    addTreat('advent', { edge: String(ev.day), day: ev.day });
    play('jump', 800);
    say(t('La case {day} du calendrier de l\'Avent est arrivée ! Clique dessus 🎁', ev), 5000);
  } else if (ev.type === 'hosted' && !desk.guest) {
    state.stats.guests = (state.stats.guests || 0) + 1; // un visiteur est venu (trophée « Maison accueillante »)
    save();
  } else if (ev.type === 'home') {
    visitAway = false;
    state.stats.visits = (state.stats.visits || 0) + 1; // trophée « Grand voyageur »
    state.fun = Math.min(100, state.fun + 15);
    play('jump', 800);
    if (ev.ate > 0) {
      // On lui a donné à manger chez l'ami : il est vraiment rassasié
      state.hunger = Math.min(100, state.hunger + ev.ate);
      say(ev.played ? t('Me revoilà ! J\'ai joué avec {played} et bien mangé chez {owner} 😋', ev) : t('Me revoilà ! J\'ai bien mangé chez {owner} 😋', ev), 6000);
    } else {
      say(ev.played ? t('Me revoilà ! J\'ai joué avec {played} chez {owner} 🎉', ev) : t('Me revoilà ! C\'était bien chez {owner} 🏠', ev), 6000);
    }
    save();
  } else if (ev.type === 'arrive' && desk.guest) {
    play('jump', 800);
    say(desk.guest.walk === 2 ? t('On s\'est promenés ensemble ! Coucou, c\'est {name} de {owner} 🐾', { name: state.name, owner: desk.guest.owner })
      : t('Coucou, c\'est {name} de {owner} ! 👋', { name: state.name, owner: desk.guest.owner }), 5000);
  } else if (ev.type === 'bye' && desk.guest) {
    say('Au revoir, à bientôt ! 👋', 2500);
  }
});

// Petits numéros quand il ne marche pas : saut, roulade, étirement, regard autour de lui
const WANDER_TRICKS = [
  { anim: 'jump', dur: 800, say: ['Hop !', 'Youpi !'] },
  { anim: 'roll', dur: 900, say: ['Roulade !', 'Wiii !'], move: 5 },
  { anim: 'stretch', dur: 1500, say: ['Étiiiirement…'] },
  { anim: 'look', dur: 2400, say: ['Hmm ?', 'Qu\'est-ce que c\'est ?'] },
];

function startWalk(dir, steps, speed = 2) {
  if (state && Pet.isSick(state)) { steps = Math.ceil(steps / 2); speed = 1; } // malade : quelques pas, doucement
  walking = { dir, steps, speed };
  facing = dir;
}

function wander(now) {
  if (walking) {
    // En chassant la pelote : arrivé tout près, il bondit dessus
    // Arrivé à la gamelle, au panier ou à la plante
    const goal = walking.target && furn && furn[walking.target];
    if (goal && Math.abs(goal.x - 120) < 25 && canWander(walking.anim)) {
      const w = walking;
      walking = null;
      arriveFurniture(w.target, w.what);
      return;
    }
    if (walking.target === 'yarn' && yarnInfo && Math.abs(yarnInfo.x - 120) < 45 && canWander(walking.anim)) {
      walking = null;
      pounceYarn();
      return;
    }
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
        if (Pet.peeSoon(state)) return peeAgainstEdge(walking.dir);
        walking.dir *= -1;
        facing = walking.dir;
      }
    });
    return;
  }
  // Mode concentration : il va s'installer dans son panier (ou reste où il est)
  if (focusMode === 'go') {
    if (furn && furn.basket && Math.abs(furn.basket.x - 120) >= 25 && canWander()) goToFurniture('basket', 'focus', now);
    else focusMode = 'sit';
    return;
  }
  // Pointeur laser : il court vers le point rouge et bondit quand il est dessous
  // (pendant le laser, il ne fait rien d'autre ; les calmes ne le chassent qu'une fois de temps en temps)
  if (laserOn && cursor && canWander()) {
    if (now < nextLaserAt) return;
    nextLaserAt = now + (Pet.trait(state).calm ? 1500 : 180);
    const dx = cursor.x - 120;
    if (Math.abs(dx) > 25) {
      startWalk(dx > 0 ? 1 : -1, Math.min(20, Math.ceil(Math.abs(dx) / 6)), 6);
      walking.target = 'laser';
    } else if (Math.random() < 0.35) {
      play('jump', 700);
    }
    return;
  }
  // Musique : de temps en temps, quelques pas de danse (sans bruitage)
  if (musicOn && canWander() && now > nextDanceAt) {
    nextDanceAt = now + 12000 + Math.random() * 15000;
    anim = 'dance';
    animStart = now;
    animDur = 2400;
    if (Math.random() < 0.3) say('🎵', 1500);
    return;
  }
  // Faim ou soif : il va se servir à la gamelle
  if (furn && furn.bowl && canWander() && now > nextWalkAt) {
    if (state.hunger < 55 && furn.bowl.food >= 10) return goToFurniture('bowl', 'food', now);
    if (state.thirst < 55 && furn.bowl.water >= 10) return goToFurniture('bowl', 'water', now);
  }
  const sick = Pet.isSick(state); // malade : pas de pelote, ni saut, ni tour, et bien moins de balades
  if (yarnInfo && !sick && canWander() && state.energy > 15 && now > nextWalkAt) {
    chaseYarn(now);
    return;
  }
  if (now < nextWalkAt) return;
  const trait = Pet.trait(state);
  nextWalkAt = now + (3000 + Math.random() * 7000) * (trait.calm || 1) * (sick ? 3 : 1); // les calmes se baladent moins souvent
  if (!canWander() || Math.random() > 0.85) return;
  if (sick) { if (Math.random() < 0.5) startWalk(Math.random() < 0.5 ? -1 : 1, 20 + Math.floor(Math.random() * 40)); return; }

  // Curieux : la souris bouge près du sol à côté de lui, il va voir
  const cursorNear = cursor && Math.abs(cursor.x - 120) < 450 && Math.abs(cursor.y - (stageEl.offsetTop + 270)) < 250;
  const roll = Math.random();
  // Il va rendre visite à son meilleur ami
  // De temps en temps, il va voir la plante (plus souvent quand elle a soif)
  if (furn && furn.plant && roll < (furn.plant.water < 15 ? 0.2 : 0.07)) { goToFurniture('plant', null, now); return; }
  const buddy = friends.filter((f) => Math.abs(f.x) > 130 && Math.abs(f.x) < 1600).sort((a, b) => b.points - a.points)[0];
  if (buddy && roll < 0.2 + buddy.points / 400) {
    startWalk(buddy.x > 0 ? 1 : -1, Math.ceil((Math.abs(buddy.x) - 90) / 3), 3);
    return;
  }
  if (roll > 1 - Math.min(0.6, 0.3 * (trait.climb || 1))) {
    // Saut sur une fenêtre au-dessus de lui (s'il y en a une à portée) ; sinon, une balade ordinaire
    // (les grimpeurs le tentent plus souvent)
    desk.climb().then((r) => {
      if (r) {
        if (r.dir) facing = r.dir;
        play('jump', 800);
        if (Math.random() < 0.4) say('Hop, là-haut !', 1800);
      } else if (canWander()) {
        startWalk(Math.random() < 0.5 ? -1 : 1, 40 + Math.floor(Math.random() * 120));
      }
    });
    return;
  }
  if (cursorNear && roll < (trait.curious ? 0.6 : 0.35)) {
    const dx = cursor.x - 120;
    startWalk(dx > 0 ? 1 : -1, Math.min(150, Math.abs(dx) / 2), 2);
  } else if (roll < 0.6) {
    startWalk(Math.random() < 0.5 ? -1 : 1, 40 + Math.floor(Math.random() * 120));
  } else if (roll < 0.72) {
    // Petite course
    startWalk(Math.random() < 0.5 ? -1 : 1, 30 + Math.floor(Math.random() * 40), 5);
  } else if (state.tricks && state.tricks.length && Math.random() < (trait.showOff ? 0.8 : 0.35)) {
    // Il montre spontanément un des tours qu'il a appris
    const r = Pet.doTrick(state, state.tricks[Math.floor(Math.random() * state.tricks.length)]);
    if (r.ok) play(r.anim, r.dur);
  } else {
    const trick = WANDER_TRICKS[Math.floor(Math.random() * WANDER_TRICKS.length)];
    if (trick.move) {
      startWalk(Math.random() < 0.5 ? -1 : 1, Math.round(trick.dur / 33), trick.move);
      walking.anim = trick.anim;
    }
    play(trick.anim, trick.dur);
    if (Math.random() < 0.4) say(trick.say[Math.floor(Math.random() * trick.say.length)], 1800);
  }
}

// ---------- Météo ----------


// Ce qu'il porte selon le temps qu'il fait (rien quand il dort)
function weatherGear(mood) {
  if (!weather || mood === 'sleep' || mood === 'dead') return null;
  if (weather.condition === 'rain' || weather.condition === 'storm') return 'umbrella';
  if (weather.temp <= 5 || weather.condition === 'snow') return 'scarf';
  if (weather.condition === 'clear' && weather.isDay && weather.temp >= 26) return 'sunglasses';
  return null;
}

// Sol sous ses pattes selon le temps : neige, boue sous la pluie, feuilles mortes en automne, herbe s'il fait beau
function groundFx() {
  if (!weather) return null;
  const c = weather.condition;
  if (c === 'snow') return 'snow';
  if (c === 'rain' || c === 'storm') return 'mud';
  const month = new Date().getMonth();
  if ((month === 9 || month === 10) && (c === 'clear' || c === 'clouds')) return 'leaves';
  if (c === 'clear' && weather.isDay) return 'grass';
  return null;
}

// Il commente quand le temps change
function reactToWeather(prev, w) {
  if (!w || !state || state.dead || state.sleeping || Pet.isEgg(state)) return;
  if (prev && prev.condition === w.condition && Math.abs(prev.temp - w.temp) < 8) return;
  const msg = {
    rain: t('Il pleut à {city}… heureusement j\'ai mon parapluie ☔', w),
    storm: t('Orage à {city} ! J\'ai un peu peur… ⛈️', w),
    snow: t('Il neige à {city} ! ❄️', w),
    fog: t('Quel brouillard à {city} ! 🌫️', w),
    clouds: t('Ciel gris à {city}, {temp}°C ☁️', w),
    clear: w.isDay ? t('Grand soleil à {city}, {temp}°C ☀️', w) : t('Belle nuit étoilée à {city} ✨', w),
  }[w.condition];
  // Caractère : la grenouille adore la pluie, le pingouin le froid (et supporte mal la chaleur)
  const likes = Pet.trait(state).likes;
  const rainy = w.condition === 'rain' || w.condition === 'storm';
  const cold = w.temp <= 5 || w.condition === 'snow';
  if ((likes === 'rain' && rainy) || (likes === 'cold' && cold)) {
    play('dance', 2000);
    state.fun = Math.min(100, state.fun + 10);
    say(likes === 'rain' ? t('Il pleut à {city} ! J\'adore ça 💚', w) : t('Il fait froid à {city}… parfait ! ❄️😊', w), 5000);
    return;
  }
  if (likes === 'cold' && w.temp >= 24) { say(t('{temp}°C à {city}… j\'ai bien trop chaud ! 🥵', w), 5000); return; }
  if (w.temp >= 30) say(t('Il fait {temp}°C à {city}, quelle chaleur ! 🥵', w), 5000);
  else if (w.temp <= 0) say(t('Brrr, {temp}°C à {city} ! Heureusement j\'ai mon écharpe 🧣', w), 5000);
  else if (msg) say(msg, 5000);
}

// ---------- Gamelle ----------

function goToFurniture(kind, what, now) {
  const dx = furn[kind].x - 120;
  nextWalkAt = now + 2000;
  if (Math.abs(dx) < 25) return arriveFurniture(kind, what);
  startWalk(dx > 0 ? 1 : -1, Math.min(220, Math.ceil(Math.abs(dx) / 3)), 3);
  walking.target = kind;
  walking.what = what;
}

function arriveFurniture(kind, what) {
  facing = 0;
  if (kind === 'basket' && what === 'focus') { focusMode = 'sit'; return; } // installé pour le mode concentration
  if (kind === 'basket') return lieDown(what === 'night');
  if (kind === 'plant') {
    // Il renifle la plante ; il remarque quand elle a soif, ou quand elle a fleuri
    const p = furn.plant;
    play('look', 2000);
    say(p.water < 15 ? 'La plante a soif ! Tu peux l\'arroser ? 💧' : p.growth >= 4 ? 'Mmm, ça sent bon ! 🌸' : 'Elle pousse bien ! 🌱', 3500);
    return;
  }
  desk.bowlUse(what).then((amount) => {
    if (!amount) return say('La gamelle est vide ! 🥺');
    if (what === 'water') {
      state.thirst = Math.min(100, state.thirst + amount);
      play('drink', 2000);
      say('Glou glou… 💧', 2000);
    } else {
      state.hunger = Math.min(100, state.hunger + amount);
      play('eat', 1800);
      say('Miam, des croquettes ! 😋', 2000);
    }
    save();
  });
}

// ---------- Panier : il y dort la nuit et y fait la sieste quand il est fatigué ----------

let basketTries = 0; // nombre d'allers vers le panier sans y arriver (au-delà, il dort où il est)

// Faut-il d'abord aller jusqu'au panier ? (il en prend le chemin si oui)
function walkToBasket(what) {
  if (!furn || !furn.basket || basketTries >= 4 || Math.abs(furn.basket.x - 120) < 20) return false;
  if (walking && walking.target === 'basket') return true; // déjà en route
  if (!canWander()) return false;
  basketTries++;
  goToFurniture('basket', what, performance.now());
  return true;
}

function lieDown(night) {
  basketTries = 0;
  if (state.sleeping) return;
  if (night) {
    state.bedNight = nightKey();
    state.nightSleep = true;
    say('Il est tard… bonne nuit 🌙', 4000);
  } else {
    say('Une petite sieste dans mon panier… 😴', 3000);
  }
  state.sleeping = true;
  walking = null;
  save();
}

// ---------- Pause vacances ----------

function setPause(on) {
  if (!state || state.dead || Pet.isEgg(state)) return;
  if (on && !state.paused) {
    Pet.pause(state);
    walking = null;
    say('Bonnes vacances ! À bientôt 🏖️', 4000);
  } else if (!on && state.paused) {
    Pet.resume(state);
    play('stretch', 1500);
    say('Te revoilà ! C\'étaient de bonnes vacances ? 🏖️', 4000);
  }
  updatePauseButton();
  save();
}

function updatePauseButton() {
  $('set-pause').textContent = t(state && state.paused ? '▶ Reprendre la vie' : '🏖️ Pause vacances');
}

// ---------- Pelote de laine ----------

function chaseYarn(now) {
  const dx = yarnInfo.x - 120;
  nextWalkAt = now + 700 + Math.random() * 1300;
  if (Math.abs(dx) < 45) return pounceYarn();
  // Il court quand elle est loin ou qu'elle file, sinon il trottine
  const speed = Math.abs(dx) > 300 || yarnInfo.moving ? 5 : 3;
  startWalk(dx > 0 ? 1 : -1, Math.min(160, Math.ceil(Math.abs(dx) / speed)), speed);
  walking.target = 'yarn';
}

// Coup de patte dans la pelote, qui part rouler
function pounceYarn() {
  const dir = yarnInfo.x >= 120 ? 1 : -1;
  facing = dir;
  play('jump', 800);
  setTimeout(() => desk.yarnKick(dir), 350);
  state.fun = Math.min(100, state.fun + 2);
  state.energy = Math.max(0, state.energy - 0.5);
  if (Math.random() < 0.25) say(['Attrape !', 'À moi la pelote !', 'Hop, un coup de patte !'][Math.floor(Math.random() * 3)], 1800);
}

// ---------- Fêtes ----------
// Le jour J, il souhaite la fête une fois (par fête et par an). À Noël un cadeau apparaît
// sur le bureau, à Pâques des œufs en chocolat sont cachés sur l'écran.

function celebrate() {
  const f = festivity;
  if (!f || state.dead || state.sleeping || Pet.isEgg(state) || modalIsOpen()) return;
  state.greeted = state.greeted || [];
  if (f.greetToday && !state.greeted.includes(f.key)) {
    state.greeted.push(f.key);
    state.fun = Math.min(100, state.fun + 10);
    play('jump', 800);
    // Anniversaire du maître : il chante « joyeux anniversaire » et le dit à voix haute
    if (f.song) {
      Sound.play('birthday');
      setTimeout(() => speak(t('Joyeux anniversaire{owner} !', { owner: owner() })), 4500);
    } else {
      Sound.play('win');
    }
    // Soirée magique : le hibou est tout fier, c'est son grand soir
    const proudOwl = f.magic && state.species === 'hibou';
    if (proudOwl) state.fun = Math.min(100, state.fun + 10);
    say(proudOwl ? t('Ce soir, les hiboux sont à l\'honneur ! 🦉✨') : f.greeting, 6000);
    checkUnlocks();
    save();
  }
  if (f.letter && !state.greeted.includes(f.key + '-lettre')) {
    // Un hibou traverse l'écran et dépose une lettre à côté de lui
    state.greeted.push(f.key + '-lettre');
    save();
    setTimeout(() => desk.owl().then((arrived) => {
      if (!arrived || !state) return;
      addTreat('letter');
      say('Oh ! Un hibou m\'apporte une lettre ! 🦉✉️', 5000);
    }), 9000);
  }
  if (f.gift && !state.greeted.includes(f.key + '-cadeau')) {
    state.greeted.push(f.key + '-cadeau');
    addTreat('gift');
    setTimeout(() => say('Oh ! Un cadeau est apparu sur le bureau 🎁', 5000), 7000);
  }
  if (f.eggs && !state.greeted.includes(f.key + '-oeufs')) {
    state.greeted.push(f.key + '-oeufs');
    for (let i = 0; i < 5; i++) addTreat('egg');
  }
}

// Surprises posées sur le bureau (cadeau, œufs) : comme les crottes, une petite fenêtre qu'on clique
// extra : informations gardées avec la surprise (par exemple qui l'envoie)
async function addTreat(kind, extra = {}) {
  const id = kind + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const pos = await desk.poopAdd(id, Math.random() < 0.5 ? -1 : 1, state.style, kind, extra.edge); // edge : n° du jour (Avent)
  if (!pos || !state) return;
  state.treatSpots = state.treatSpots || [];
  state.treatSpots.push({ id, kind, ...pos, ...extra });
  save();
}

function openTreat(spot) {
  state.treatSpots = state.treatSpots.filter((t) => t.id !== spot.id);
  Sound.play('win');
  if (spot.kind === 'gift') {
    // Le cadeau contient un accessoire pas encore gagné, sinon un grand moment de joie
    const missing = Pet.accessoriesFor(state).filter((a) => !state.unlocked.includes(a.id));
    const prize = missing[Math.floor(Math.random() * missing.length)];
    state.fun = Math.min(100, state.fun + 25);
    play('love', 1600);
    if (prize) {
      state.unlocked.push(prize.id);
      state.accessory = prize.id;
      say(t('Un cadeau ! C\'est… {icon} {name} ! Merci !', { icon: prize.icon, name: t(prize.name) }), 6000);
    } else {
      say('Un cadeau ! J\'adore, merci ! 🎁💕', 5000);
    }
  } else if (spot.kind === 'card') {
    // Carte postale d'un ami
    state.fun = Math.min(100, state.fun + 10);
    play('love', 1600);
    const from = spot.from || { pet: '?', owner: '?' };
    say(t('« {msg} » — {pet}, de chez {owner} 💌', { ...from, msg: t(CARD_MESSAGES[spot.msg] || CARD_MESSAGES[0]) }), 6000);
  } else if (spot.kind === 'advent') {
    openAdvent(Number(spot.day || spot.edge) || 1);
  } else if (spot.kind === 'letter') {
    // Lettre de la soirée magique : un chapeau de magicien, puis de gentils messages
    state.fun = Math.min(100, state.fun + 20);
    play('love', 1600);
    if (state.accessory !== 'magicien') {
      if (!state.unlocked.includes('magicien')) state.unlocked.push('magicien');
      state.accessory = 'magicien';
      say('Une lettre magique ! Elle contient… un chapeau de magicien 🪄✨', 6000);
    } else {
      say(pick(['« Ce soir, la magie est partout ! » ✨', '« Une étoile filante veille sur toi. » 🌠', '« Les hiboux ont parlé : tu es formidable ! » 🦉']), 6000);
    }
  } else {
    state.fun = Math.min(100, state.fun + 8);
    state.hunger = Math.min(100, state.hunger + 5);
    const left = state.treatSpots.filter((t) => t.kind === 'egg').length;
    say(left ? t('Un œuf en chocolat ! Encore {left} à trouver 🥚', { left }) : 'Tous les œufs trouvés ! Bravo 🐣🍫', 4000);
    play(left ? 'jump' : 'love', 1200);
  }
  save();
}

// ---------- Calendrier de l'Avent (boîte du jour envoyée par main.js) ----------
// Friandise, blague, neige magique ou jouet selon le jour ; le 24, un vrai cadeau (un accessoire s'il en manque)
const ADVENT_JOKES = [
  'Pourquoi les chats n\'aiment pas les ordinateurs ? À cause de la souris ! 🐭',
  'Que dit un flocon à un autre flocon ? « Tu es unique ! » ❄️',
  'Pourquoi le père Noël est-il toujours de bonne humeur ? Parce qu\'il connaît tous les enfants sages ! 🎅',
  'Quel est le dessert préféré des bonshommes de neige ? Les glaces, bien sûr ! ⛄',
  'Pourquoi les rennes ont-ils un nez rouge ? Ils ont trop fait de luge ! 🦌',
  'Comment appelle-t-on un sapin qui chante ? Un sapin de Noël… à capella ! 🎄',
];

function openAdvent(day) {
  state.fun = Math.min(100, state.fun + 10);
  if (day >= 24) {
    const missing = Pet.accessoriesFor(state).filter((a) => !state.unlocked.includes(a.id));
    const prize = missing[Math.floor(Math.random() * missing.length)];
    state.fun = 100;
    play('love', 1800);
    if (prize) {
      state.unlocked.push(prize.id);
      state.accessory = prize.id;
      say(t('Dernière case : {icon} {name} ! Joyeux Noël ! 🎄', { icon: prize.icon, name: t(prize.name) }), 7000);
    } else {
      say('Dernière case : un énorme câlin ! Joyeux Noël ! 🎄💕', 7000);
    }
    return;
  }
  const kind = day % 4;
  if (kind === 1) {
    state.hunger = Math.min(100, state.hunger + 15);
    play('eat', 1600);
    say(t('Case {day} : une friandise ! Miam 🍪', { day }), 5000);
  } else if (kind === 2) {
    play('jump', 900);
    say(t('Case {day} : une blague ! {joke}', { day, joke: t(ADVENT_JOKES[Math.floor(day / 4) % ADVENT_JOKES.length]) }), 9000);
  } else if (kind === 3) {
    play('dance', 2000);
    say(t('Case {day} : de la neige magique ! ❄️✨', { day }), 5000);
  } else {
    state.fun = Math.min(100, state.fun + 10);
    play('roll', 900);
    say(t('Case {day} : un petit jouet ! 🧸', { day }), 5000);
  }
}

// ---------- Rythme du jour ----------

function isNight() {
  const h = new Date().getHours();
  return h >= 22 || h < 7;
}

// Heures où il dort : de 22 h à 7 h, sauf caractère différent (le hibou noctambule se couche à 2 h, se lève à 10 h)
const bedHours = () => Pet.trait(state).bed || [22, 7];
function bedTime() {
  const [bed, wake] = bedHours();
  const h = new Date().getHours();
  return bed > wake ? h >= bed || h < wake : h >= bed && h < wake;
}

// Identifiant de la nuit en cours (la date du soir), pour ne le coucher qu'une fois par nuit
function nightKey() {
  const d = new Date();
  if (d.getHours() < bedHours()[1]) d.setDate(d.getDate() - 1);
  return d.toDateString();
}

function dayRhythm() {
  if (state.dead || Pet.isEgg(state)) return;
  if (state.sleeping) basketTries = 0;
  if (bedTime()) {
    // Déjà endormi au moment du coucher : il passe la nuit entière à dormir
    if (state.sleeping && state.bedNight !== nightKey()) {
      state.bedNight = nightKey();
      state.nightSleep = true;
      save();
    } else if (!state.sleeping && !anim && !modalIsOpen() && !dragging && state.bedNight !== nightKey()) {
      if (!walkToBasket('night')) lieDown(true); // avec un panier, il va d'abord s'y coucher
    }
  } else if (state.sleeping && state.nightSleep) {
    state.sleeping = false;
    state.nightSleep = false;
    play('stretch', 1500);
    say('Bonjour ! ☀️ Bien dormi !', 4000);
    speak(t('Bonjour{owner} !', { owner: owner() }));
    save();
  } else if (!state.sleeping && state.energy < 25 && furn && furn.basket && !Pet.isSick(state)) {
    walkToBasket('nap'); // fatigué en journée : une sieste dans son panier
  }
}

// ---------- Logique (toutes les secondes) ----------

let lastAlert; // dernier besoin signalé à l'icône de la barre des tâches (indéfini : rien d'envoyé encore)

function logic() {
  if (!state) return;
  const before = Pet.stage(state);
  const events = Pet.tick(state);
  const after = Pet.stage(state);

  if (before === 'egg' && after !== 'egg') {
    play('hatch', 2000);
    say(t('Coucou ! Je suis {name} ! 💕', state), 5000);
    speak(t('Bonjour{owner}, je suis {name} !', { owner: owner(), name: state.name }));
  } else if (before !== after && !state.dead) {
    play('heal', 2000);
    say(after === 'adult' ? Pet.g(state, 'Je suis devenu grand ! ⭐', 'Je suis devenue grande ! ⭐') : 'J\'ai grandi ! 🌱', 5000);
  }

  for (const ev of events) {
    // Parti en visite : ses besoins, il les a faits chez l'ami (pas de crotte sur un bureau vide)
    if (visitAway && (ev === 'poop' || ev === 'pee')) { state.poops = Math.max(0, state.poops - 1); continue; }
    if (ev === 'wake') { play('stretch', 1500); say('Bien dormi ! ☀️'); }
    if (ev === 'collapse') say(Pet.g(state, 'Trop fatigué… je m\'endors…', 'Trop fatiguée… je m\'endors…'));
    if (ev === 'pee') { addPoop(Math.random() < 0.5 ? -1 : 1, 'pee'); Sound.play('pee'); say('Oups… pipi 💦'); }
    if (ev === 'poop') { addPoop(); Sound.play('poop'); say('Oups… 💩'); }
    if (ev === 'ailment') { Sound.play('alert'); say(Pet.ailmentStart(state), 6000); save(); } // petit ennui au hasard
    if (ev === 'dead') { Sound.play('sad'); save(); showDead(); }
  }

  dayRhythm();
  if (unlockTick % 60 === 1) {
    festivity = Seasons.birthday(state) || ownerBirthday() || Seasons.current(new Date(), desk.country || 'FR');
    desk.setDecor(festivity && !state.dead ? festivity.decor : null);
  }
  celebrate();

  // Chaque minute passée ensemble : bilan de la semaine (prêt le lundi) et embellissement (jours bien soignés)
  if (unlockTick % 60 === 30 && !desk.guest && !state.dead && !state.paused && !Pet.isEgg(state)) {
    if (Pet.weekTick(state)) {
      if (state.lastWeek.minutes >= 30) say('Le bilan de la semaine est dans mon carnet ! 📒', 6000);
      save();
    }
    const shine = Pet.careTick(state);
    if (shine) {
      play('love', 1800);
      say([null, 'Mon pelage brille ! Merci de si bien t\'occuper de moi ✨', 'Un collier doré ! Un mois que tu prends soin de moi 💛',
        'Une médaille étoile ! Trois mois de bons soins, tu es formidable 🌟'][shine], 7000);
      save();
    }
  }

  // Pastille sur l'icône de la barre des tâches quand il a besoin de quelque chose (voir main.js)
  const alert = Pet.isEgg(state) || state.dead || state.paused ? null
    : Pet.isSick(state) ? 'sick' : state.hunger < 25 ? 'hunger' : state.thirst < 25 ? 'thirst' : state.clean < 20 ? 'dirty' : null;
  if (alert !== lastAlert) { lastAlert = alert; desk.status(alert); }

  // Caractère : le loup hurle à la lune une fois par soir, entre 20 h et 22 h
  if (Pet.trait(state).howl && !state.sleeping && !state.dead && !dnd && !Pet.isEgg(state)) {
    const h = new Date().getHours();
    if (h >= 20 && h < 22 && state.howlNight !== nightKey()) {
      state.howlNight = nightKey();
      Sound.play('voice', state.species);
      say('Aouuuuh ! 🌕', 3500);
      save();
    }
  }

  // Petit ronflement de temps en temps
  if (state.sleeping && ++snoreTick % 4 === 0) Sound.play('snore');

  const now = performance.now();
  const need = Pet.need(state);
  if (need && now - lastNeedAt > 3 * 60 * 1000 && now > bubbleUntil) {
    lastNeedAt = now;
    Sound.play('alert');
    say(need, 5000);
  }
  if (!dnd && Pet.isSick(state) && now - lastNotifAt > 3 * 3600 * 1000 && 'Notification' in window) {
    lastNotifAt = now;
    new Notification('ThomasGotchi', { body: Pet.g(state, t('{name} est malade ! Viens vite t\'occuper de lui.', state), t('{name} est malade ! Viens vite t\'occuper d\'elle.', state)) });
  }

  if (!panel.classList.contains('hidden')) updatePanel();
  if (++unlockTick % 30 === 0) checkUnlocks();
  if (now - lastSaveAt > 15000) {
    lastSaveAt = now;
    save();
  }
}

// ---------- Panneau des jauges ----------

// Caractère de l'espèce choisie, affiché sous la liste des animaux (nouvel œuf, réglages)
function showTraitHint(card, species, gender) {
  const el = card.querySelector('.trait-hint');
  const tr = Pet.TRAITS[species || 'chat'];
  if (el) el.textContent = tr ? `${tr.icon} ${t(gender === 'f' ? tr.name[1] : tr.name[0])} : ${t(tr.desc)}` : '';
}

function updatePanel() {
  $('pet-name').textContent = state.name + (state.paused ? ' 🏖️' : '') + (dnd ? ' 🔕' : '');
  const trait = Pet.trait(state);
  $('pet-trait').textContent = Pet.isEgg(state) ? '' : Pet.traitLabel(state);
  $('pet-trait').title = trait.desc ? t(trait.desc) : '';
  $('pet-age').textContent = Pet.ageText(state); // (la météo est en haut du menu de l'icône)
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
  hideTimer = null;
  if (!state || state.dead || modalIsOpen() || desk.guest || visitAway) return; // pas de panneau pour un invité
  if (panel.classList.contains('hidden')) {
    updatePanel();
    panel.classList.remove('hidden');
  }
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { hideTimer = null; panel.classList.add('hidden'); }, 900);
}

function doAction(act) {
  if (!state) return;
  if (state.paused && act !== 'settings') { say('Je suis en vacances 🏖️ (Réglages pour reprendre)'); return; }
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
  return overHit(x, y) || overPet(x, y);
}

function overHit(x, y) {
  const el = document.elementFromPoint(x, y);
  return !!(el && el.closest('.hit'));
}

// Sur Mac, le corps de l'animal est couvert par la zone de dépôt (voir main.js), qui reçoit les fichiers et nous
// renvoie la souris : la fenêtre ne capte alors elle-même la souris que sur les boutons et panneaux
const zoneMode = !!desk.dropZone;
const wantsMouse = (x, y) => (zoneMode ? overHit(x, y) : overInteractive(x, y));

// x, y : coordonnées dans la fenêtre ; la zone du petit être peut être décalée quand la fenêtre est agrandie
function overPet(x, y) {
  y -= stageEl.offsetTop;
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

document.addEventListener('mousemove', (e) => {
  if (press && !dragging && !bigHug && Math.hypot(e.screenX - press.x, e.screenY - press.y) > 4) {
    clearTimeout(hugTimer);
    dragging = true;
    walking = null;
    desk.dragStart();
  }
  if (dragging) return;
  const over = overInteractive(e.clientX, e.clientY);
  desk.setIgnore(!wantsMouse(e.clientX, e.clientY));
  if (over && !laserOn) showPanel(); // pendant le laser, pas de panneau : il doit pouvoir bondir sur le point
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
  clearTimeout(hugTimer);
  hugTimer = setTimeout(startBigHug, 700); // bouton gardé enfoncé sans bouger : un gros câlin
});

document.addEventListener('mouseup', () => {
  clearTimeout(hugTimer);
  if (bigHug) {
    endBigHug();
  } else if (dragging) {
    dragging = false;
    desk.dragEnd();
  } else if (press) {
    clickPet();
  }
  press = null;
});

window.addEventListener('blur', () => {
  clearTimeout(hugTimer);
  if (bigHug) endBigHug();
  if (dragging) { dragging = false; desk.dragEnd(); }
  press = null;
});

// ---------- Gros câlin : on reste appuyé sur lui ----------
// Les félins ronronnent ; il fait des cœurs tant qu'on le tient, et ça compte double.
let hugTimer = null;
let bigHug = null;
const PURRS = ['chat', 'lion', 'tigre'];

function startBigHug() {
  if (!press || dragging || !state || state.dead || state.sleeping || state.paused || Pet.isEgg(state)) return;
  walking = null;
  const purr = PURRS.includes(state.species || 'chat');
  const tick = () => {
    anim = 'love';
    animStart = performance.now();
    animDur = 900;
    state.fun = Math.min(100, state.fun + 2);
    if (purr) Sound.play('purr');
  };
  tick();
  bigHug = setInterval(tick, 800);
  say(purr ? 'Rrrrrr… 💕' : 'Oh oui, un gros câlin ! 🥰', 3000);
}

function endBigHug() {
  clearInterval(bigHug);
  bigHug = null;
  Pet.pet(state);
  Pet.pet(state); // un gros câlin compte double
  play('love', 1400);
  save();
}

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (state && !state.dead && overPet(e.clientX, e.clientY)) openSettings();
});

function clickPet() {
  if (!state || state.dead) return;
  if (state.paused) { say('Je suis en vacances 🏖️'); return; }
  if (Pet.isEgg(state)) { say('Toc toc… 🥚'); return; }
  if (state.sleeping) { say('Zzz… chuuut…'); return; }
  const r = Pet.pet(state);
  if (r.ok) play('love', 1400);
  if (r.ok && Pet.trait(state).petFun) state.fun = Math.min(100, state.fun + Pet.trait(state).petFun); // le lion adore ça
  if (r.ok && Math.random() < 0.12) speak(t('Je t\'aime{owner} !', { owner: owner() }));
}

// ---------- Crottes sur le bureau ----------
// Chaque crotte est une petite fenêtre posée à l'endroit où il l'a faite ; un clic dessus la nettoie.

// kind : 'poop' (crotte) ou 'pee' (flaque) ; edge : 'left' / 'right' pour un pipi contre le bord de l'écran
async function addPoop(side = Math.random() < 0.5 ? -1 : 1, kind = 'poop', edge = null) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const pos = await desk.poopAdd(id, side, state.style, kind, edge);
  if (!pos || !state) return;
  state.poopSpots = state.poopSpots || [];
  state.poopSpots.push({ id, kind, edge, ...pos });
  save();
}

// Arrivé au bord de l'écran avec une envie pressante : il lève la patte contre le bord
function peeAgainstEdge(dir) {
  walking = null;
  facing = dir;
  Pet.peeNow(state);
  play('pee', 2200);
  say('Je marque mon territoire ! 💦', 2500);
  setTimeout(() => addPoop(dir, 'pee', dir < 0 ? 'left' : 'right'), 900);
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
  if (state.treatSpots && state.treatSpots.length) state.treatSpots = await desk.poopRestore(state.treatSpots, state.style);
}

// ---------- Glisser-déposer de fichiers = nourriture ----------

// Chaque étape est notée dans le journal de diagnostic (menu de l'icône) pour comprendre où un dépôt se perd
let dragOverSeen = false;

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  desk.diag(`fichier glissé au-dessus (dragenter, types : ${[...e.dataTransfer.types].join(', ') || 'aucun'})`);
  desk.setIgnore(false);
  if (state && !state.dead && !state.sleeping) hungryLook = true;
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy'; // le fichier d'origine n'est jamais déplacé ni supprimé
  if (!dragOverSeen) { dragOverSeen = true; desk.diag(`dragover (${e.clientX}, ${e.clientY})`); }
});

document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) { hungryLook = false; dragOverSeen = false; desk.diag('le fichier ressort de la fenêtre (dragleave)'); }
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragOverSeen = false;
  desk.diag(`dépôt reçu (drop) : ${e.dataTransfer.files.length} fichier(s), ${e.dataTransfer.items.length} élément(s)`);
  hungryLook = false;
  if (!state) return;
  const meals = [];
  for (const item of e.dataTransfer.items) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
    const file = item.getAsFile();
    if (file) meals.push({ name: file.name, size: file.size, isDir: !!(entry && entry.isDirectory) });
  }
  eat(meals);
});

// Fichiers choisis depuis le menu de l'icône (ou déposés sur l'icône, sur Mac)
desk.onFeedFiles((meals) => { if (state) eat(meals); });

function eat(meals) {
  meals.slice(0, 5).forEach((meal, i) => {
    setTimeout(() => {
      if (state.paused) return say('Je suis en vacances 🏖️');
      const before = state.hunger;
      const r = Pet.feed(state, meal);
      if (r.ok && desk.guest) desk.guestAte(state.hunger - before); // invité : il en profitera en rentrant chez lui
      if (r.ok && !desk.guest) checkUnlocks();
      if (r.ok && Pet.trait(state).feedFun) state.fun = Math.min(100, state.fun + Pet.trait(state).feedFun); // l'ourson gourmand
      if (r.msg) say(r.msg, 3500);
      if (r.ok) play(r.anim, 1800);
      if (!panel.classList.contains('hidden')) updatePanel();
      save();
    }, i * 2000);
  });
  if (meals.length > 5) setTimeout(() => say('Ouf, j\'ai assez mangé pour l\'instant !'), 10000);
}

// ---------- Voix : il dit le prénom de son maître ou de sa maîtresse ----------

const owner = () => (state && state.owner ? ' ' + state.owner : '');

// La voix vient du système (voir main.js) : elle marche même sans voix dans le navigateur intégré
function speak(text) {
  if (!state || state.voice === false || dnd) return;
  desk.speak(t(text));
}

// ---------- Accessoires ----------

function checkUnlocks() {
  for (const tr of Pet.learnTricks(state)) {
    Sound.play('win');
    say(t('J\'ai appris un tour : {icon} {name} ! (bouton 🎾)', { icon: tr.icon, name: t(tr.name) }), 5500);
    save();
  }
  for (const a of Pet.checkUnlocks(state)) {
    if (!state.accessory) state.accessory = a.id;
    Sound.play('win');
    say(t('Cadeau ! {icon} {name} débloqué !', { icon: a.icon, name: t(a.name) }), 5000);
    save();
  }
  if (desk.guest) return; // un invité ne gagne rien chez l'hôte
  for (const tr of Pet.checkTrophies(state)) {
    Sound.play('win');
    play('jump', 800);
    say(t('Trophée gagné : {icon} {name} ! (dans le carnet)', { icon: tr.icon, name: t(tr.name) }), 5500);
    save();
  }
}

function buildAccessories(container) {
  container.innerHTML = '';
  const owned = Pet.ACCESSORIES.filter((a) => state.unlocked.includes(a.id));
  if (!owned.length) {
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = Pet.g(state, t('Prends bien soin de lui pour gagner des accessoires !'), t('Prends bien soin d\'elle pour gagner des accessoires !'));
    container.appendChild(hint);
    return;
  }
  for (const a of [{ id: '', icon: '∅', name: 'Aucun' }, ...owned]) {
    const b = document.createElement('button');
    b.dataset.value = a.id;
    b.textContent = a.icon;
    b.title = t(a.name);
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
    b.title = coat ? t(coat.name) : key;
    b.classList.toggle('on', key === current);
    b.addEventListener('click', () => {
      container.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onPick(key);
    });
    container.appendChild(b);
  }
}

// Boutons des espèces (émoji seul, nom au survol), construits une fois au démarrage
for (const box of document.querySelectorAll('[data-group=species]')) {
  for (const sp of Pet.SPECIES) {
    const b = document.createElement('button');
    b.dataset.value = sp.id;
    b.textContent = sp.icon;
    b.title = sp.name;
    box.appendChild(b);
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
  const r = extra ? await desk.expand(extra) : { above: true, extra: 0 };
  const got = r ? r.extra : 0; // place réellement obtenue (l'écran peut être trop petit)
  let room;
  if (!r || r.above) {
    stageEl.style.top = got + 'px';
    modal.style.top = '0px';
    room = got + head;
    modal.style.alignItems = 'flex-end';
  } else {
    // Pas assez de place au-dessus : la fenêtre s'agrandit vers le bas, sous l'animal
    stageEl.style.top = '0px';
    modal.style.top = Math.max(0, 300 + got - cardH) + 'px';
    room = Math.min(cardH, 300 + got);
    modal.style.alignItems = 'flex-start';
  }
  modal.style.height = room + 'px';
  // Si la carte est plus haute que la place disponible, elle défile
  const card = $(id);
  card.style.maxHeight = cardH > room ? (room - 8) + 'px' : '';
  card.style.overflowY = cardH > room ? 'auto' : '';
  modal.style.visibility = '';
  desk.setIgnore(false);
}

function closeModal() {
  if (!modalIsOpen()) return;
  modal.classList.add('hidden');
  stageEl.style.top = '';
  for (const card of modal.querySelectorAll('.card')) { card.style.maxHeight = ''; card.style.overflowY = ''; }
  desk.collapse();
  desk.setIgnore(true);
}

function openNew() {
  const card = $('modal-new');
  draft = { style: state ? state.style : 'cute', color: state ? state.color : 'rose', species: (state && state.species) || 'chat', gender: (state && state.gender) || 'm' };
  applyStyle(draft.style);
  $('new-name').value = '';
  bindChoices(card.querySelector('[data-group=style]'), draft.style, (v) => { draft.style = v; applyStyle(v); });
  const bindDraft = () => {
    showTraitHint(card, draft.species, draft.gender);
    bindChoices(card.querySelector('[data-group=species]'), draft.species, (v) => {
      draft.species = v;
      showTraitHint(card, v, draft.gender);
      const sp = Pet.SPECIES.find((x) => x.id === v);
      if (sp && sp.color) {
        draft.color = sp.color;
        buildSwatches(card.querySelector('[data-group=color]'), draft.color, (c) => { draft.color = c; });
      }
    });
    bindChoices(card.querySelector('[data-group=gender]'), draft.gender, (v) => { draft.gender = v; showTraitHint(card, draft.species, v); });
    buildSwatches(card.querySelector('[data-group=color]'), draft.color, (v) => { draft.color = v; });
  };
  bindDraft();
  // Modèles prêts à adopter : les chats de la maison
  const presets = $('presets');
  presets.innerHTML = '';
  for (const p of Pet.PRESETS) {
    const b = document.createElement('button');
    b.textContent = p.icon + ' ' + p.name;
    b.addEventListener('click', () => {
      $('new-name').value = p.name;
      Object.assign(draft, { species: p.species, color: p.color, gender: p.gender });
      bindDraft();
      presets.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    });
    presets.appendChild(b);
  }
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
  state.gender = draft.gender;
  Sound.enabled = true;
  applyStyle(state.style);
  closeModal();
  save();
  say(Pet.g(state, 'Prends soin de cet œuf… il va bientôt éclore !', 'Prends soin de cet œuf… elle va bientôt éclore !'), 5000);
});
$('new-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('new-ok').click(); });

async function openSettings() {
  if (desk.guest) return; // un invité n'a pas de réglages ici
  if (!state || state.dead) return;
  const card = $('modal-settings');
  $('set-name').value = state.name;
  bindChoices(card.querySelector('[data-group=style]'), state.style, (v) => { state.style = v; applyStyle(v); save(); });
  showTraitHint(card, state.species || 'chat', state.gender);
  bindChoices(card.querySelector('[data-group=species]'), state.species || 'chat', (v) => { state.species = v; showTraitHint(card, v, state.gender); save(); });
  bindChoices(card.querySelector('[data-group=gender]'), state.gender || 'm', (v) => { state.gender = v; showTraitHint(card, state.species, v); save(); });
  bindChoices(card.querySelector('[data-group=pace]'), state.pace || 'normal', (v) => { state.pace = v; save(); });
  // Taille de tous les animaux : les réglages se ferment, puis les fenêtres s'agrandissent (pattes au même endroit)
  bindChoices(card.querySelector('[data-group=scale]'), String(petScaleNow), (v) => {
    petScaleNow = Number(v);
    closeModal();
    setTimeout(() => desk.setScale(petScaleNow), 300);
  });
  bindChoices(card.querySelector('[data-group=lang]'), langSetting, (v) => { langSetting = v; desk.setLang(v); });
  updatePauseButton();
  buildAccessories(card.querySelector('[data-group=accessory]'));
  buildSwatches(card.querySelector('[data-group=color]'), state.color, (v) => { state.color = v; save(); });
  $('set-login').checked = await desk.getLogin();
  $('set-sound').checked = state.sound !== false;
  $('set-voice').checked = state.voice !== false;
  $('set-gravity').checked = desk.gravity(); // réglage commun à tous les animaux (main.js)
  showSettingsTab('animal');
  $('set-owner').value = state.owner || '';
  fillBirthday();
  $('set-city').value = await desk.getCity();
  $('set-version').textContent = `ThomasGotchi v${await desk.version()}`;
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
$('set-owner').addEventListener('input', () => { state.owner = $('set-owner').value.trim(); save(); });

// Onglets des réglages (Animal, Toi, Options)
function showSettingsTab(name) {
  for (const b of document.querySelectorAll('#modal-settings .tabs button')) b.classList.toggle('on', b.dataset.tab === name);
  for (const p of document.querySelectorAll('#modal-settings .tab-page')) p.classList.toggle('on', p.dataset.page === name);
}
for (const b of document.querySelectorAll('#modal-settings .tabs button')) {
  b.addEventListener('click', () => {
    showSettingsTab(b.dataset.tab);
    if (b.dataset.tab === 'amis') loadFriends(); // l'inscription aux visites ne se fait qu'ici, à la première ouverture
  });
}

// ---------- Onglet « Amis » : code ami, demandes, visites ----------
function renderFriends(data) {
  if (!data || data.error) {
    $('fr-code').textContent = '—';
    $('fr-msg').textContent = t('Pas de connexion pour le moment.');
    return;
  }
  $('fr-code').textContent = data.code || '—';
  $('fr-open').checked = data.open !== false;
  const list = $('fr-list');
  list.textContent = '';
  for (const f of data.friends || []) {
    const row = document.createElement('div');
    row.className = 'friend';
    // Prénom de l'ami, et en dessous son animal (icône de l'espèce + prénom)
    const who = document.createElement('span');
    who.className = 'who';
    const name = document.createElement('b');
    name.textContent = (f.status === 'ok' ? (f.online ? '🟢 ' : '⚪ ') : '✉️ ') + (f.owner || f.code);
    who.appendChild(name);
    if (f.pet && f.pet.name) {
      const pet = document.createElement('small');
      pet.textContent = (SPECIES_EMOJI[f.pet.species] || '🐾') + ' ' + f.pet.name;
      who.appendChild(pet);
    }
    who.title = f.pet && f.pet.name ? t('{owner} et son animal {pet}', { owner: f.owner || f.code, pet: f.pet.name }) : (f.owner || f.code);
    row.appendChild(who);
    // Les boutons restent groupés : s'ils ne tiennent pas à côté du prénom, ils passent ensemble à la ligne
    const btns = document.createElement('div');
    btns.className = 'fr-btns';
    row.appendChild(btns);
    const button = (label, title, onClick) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (title) b.title = t(title);
      b.addEventListener('click', onClick);
      btns.appendChild(b);
    };
    if (f.status === 'received') button(t('Accepter'), null, async () => renderFriends(await desk.online.accept(f.code)));
    else if (f.status === 'sent') { const s = document.createElement('em'); s.textContent = t('en attente'); btns.appendChild(s); }
    else {
      if (f.online) button('🚪', 'Envoyer en visite', () => sendVisit(f));
      if (f.online) button('🐾', 'Promenade à deux (son animal le raccompagnera)', () => sendVisit(f, true));
      button('🎁', 'Envoyer un cadeau', () => sendGift(f, 'cadeau'));
      button('💌', 'Envoyer une carte postale', () => toggleCardChoices(row, f));
    }
    button('✕', 'Retirer cet ami', async () => { if (confirm(t('Retirer {name} de tes amis ?', { name: f.owner || f.code }))) renderFriends(await desk.online.remove(f.code)); });
    list.appendChild(row);
  }
  if (!(data.friends || []).length) list.textContent = t('Pas encore d\'amis.');
}

async function loadFriends() {
  $('fr-msg').textContent = '';
  renderFriends(await desk.online.get());
}

// Messages des cartes postales : seul le numéro voyage (chacun le lit dans sa langue).
// Ne jamais changer l'ordre : ajouter les nouveaux à la fin.
const CARD_MESSAGES = ['Je pense à toi !', 'Bonne journée ! ☀️', 'Tu me manques !', 'Joyeux anniversaire ! 🎂', 'Bon courage ! 💪', 'Gros bisous ! 😘'];

// Liste des messages sous la ligne de l'ami ; un clic envoie la carte
function toggleCardChoices(row, f) {
  const open = row.nextElementSibling && row.nextElementSibling.classList.contains('card-choices');
  document.querySelectorAll('#fr-list .card-choices').forEach((el) => el.remove());
  if (open) return;
  const box = document.createElement('div');
  box.className = 'card-choices';
  CARD_MESSAGES.forEach((text, i) => {
    const b = document.createElement('button');
    b.textContent = t(text);
    b.addEventListener('click', () => { box.remove(); sendGift(f, 'carte', i); });
    box.appendChild(b);
  });
  row.after(box);
}

// Cadeau ou carte postale (un de chaque par jour et par ami) ; il arrive même si l'ami n'est pas connecté
async function sendGift(f, kind, msg = 0) {
  const r = await desk.online.gift(f.code, kind, msg);
  const name = f.owner || f.code;
  $('fr-msg').textContent = r.error === 'deja' ? t('Déjà envoyé aujourd\'hui à {name} : réessaie demain.', { name })
    : r.error ? t('Pas de connexion pour le moment.')
      : kind === 'carte' ? t('Carte postale envoyée à {name} ! 💌', { name }) : t('Cadeau envoyé à {name} ! 🎁', { name });
}

// « Envoyer en visite » : les réglages se ferment d'abord (sa fenêtre doit retrouver sa taille pour qu'il parte)
async function sendVisit(f, walk = false) {
  closeModal();
  await new Promise((r) => setTimeout(r, 400));
  const r = await desk.online.visit(f.code, walk);
  if (!r || !r.error) return;
  const name = f.owner || f.code;
  const why = {
    absent: t('{name} n\'est pas là en ce moment.', { name }),
    dort: t('Zzz… je dors, on ira plus tard 😴'),
    malade: t('Je ne me sens pas assez bien pour sortir… 🤒'),
    oeuf: t('Toc toc… 🥚'),
    parti: t('Je suis déjà en visite !'),
    occupe: t('{name} reçoit déjà quelqu\'un, on essaiera plus tard.', { name }),
    reseau: t('Pas de connexion pour le moment.'),
  }[r.error] || t('Pas possible pour le moment.');
  say(why, 4500);
}

$('fr-add').addEventListener('click', async () => {
  const code = $('fr-input').value.trim().toUpperCase();
  if (!code) return;
  const r = await desk.online.add(code);
  $('fr-msg').textContent = r.error === 'code' ? t('Ce code n\'existe pas.') : r.error === 'soi' ? t('C\'est ton propre code !')
    : r.error ? t('Pas de connexion pour le moment.') : r.status === 'ok' ? t('Vous êtes amis ! 🎉') : t('Demande envoyée : il reste à l\'accepter de son côté.');
  if (!r.error) $('fr-input').value = '';
  renderFriends(r);
});
$('fr-copy').addEventListener('click', () => {
  const code = $('fr-code').textContent;
  if (code && code !== '—' && code !== '…') navigator.clipboard.writeText(code).then(() => { $('fr-msg').textContent = t('Code copié !'); });
});
$('fr-open').addEventListener('change', async (e) => renderFriends(await desk.online.open(e.target.checked)));
// Nouvelles toutes les 30 s (amis qui arrivent, demandes reçues) : la liste se met à jour si l'onglet est ouvert
desk.onOnline((data) => {
  const page = document.querySelector('#modal-settings .tab-page[data-page=amis]');
  if (modalIsOpen() && page && page.classList.contains('on')) renderFriends(data);
});

// Anniversaire du maître : jour et mois (les mois s'affichent dans la langue de l'interface)
function fillBirthday() {
  const day = $('set-bday-day'), month = $('set-bday-month');
  if (day.options.length === 1) for (let d = 1; d <= 31; d++) day.add(new Option(String(d), String(d)));
  month.length = 1;
  for (let m = 1; m <= 12; m++) month.add(new Option(new Date(2000, m - 1, 1).toLocaleDateString(I18N.lang, { month: 'long' }), String(m)));
  const [d, m] = (state.ownerBirthday || '').split('/');
  day.value = d || '';
  month.value = m || '';
}
for (const id of ['set-bday-day', 'set-bday-month']) {
  $(id).addEventListener('change', () => {
    const d = $('set-bday-day').value, m = $('set-bday-month').value;
    state.ownerBirthday = d && m ? `${d}/${m}` : '';
    save();
  });
}

// Le jour de l'anniversaire du maître : gâteau, chanson et cadeau
function ownerBirthday(d = new Date()) {
  if (!state || !state.ownerBirthday || state.ownerBirthday !== `${d.getDate()}/${d.getMonth() + 1}`) return null;
  return { id: 'anniv-maitre', key: `anniv-maitre-${d.getFullYear()}`, decor: 'cake', greetToday: true, song: true, gift: true,
    greeting: t('Joyeux anniversaire{owner} ! 🎂🎉', { owner: owner() }) };
}

// Photo souvenir : une jolie carte avec l'animal (tenue et fête du moment comprises), son prénom et la date
function takePhoto() {
  if (!state || Pet.isEgg(state)) return;
  const W = 600, H = 780, S = 2.8;
  const card = document.createElement('canvas');
  card.width = W;
  card.height = H;
  const c = card.getContext('2d');
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#fff0f6');
  bg.addColorStop(1, '#ffd9e8');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  // L'animal est dessiné sur sa propre toile (le moteur efface sa zone), puis collé
  const pet = document.createElement('canvas');
  pet.width = 240 * S;
  pet.height = 300 * S;
  const pc = pet.getContext('2d');
  pc.setTransform(S, 0, 0, S, 0, 0);
  Draw.render(pc, buildView(performance.now()));
  // Cadrage : on garde la scène sans le ciel vide du haut ni les bords
  const crop = { x: 15 * S, y: 60 * S, w: 210 * S, h: 240 * S };
  c.drawImage(pet, crop.x, crop.y, crop.w, crop.h, (W - crop.w) / 2, 0, crop.w, crop.h);
  c.textAlign = 'center';
  c.fillStyle = '#3b2a3a';
  c.font = 'bold 44px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  c.fillText(state.name, W / 2, 722);
  c.fillStyle = '#c2447a';
  c.font = '600 22px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  c.fillText(new Date().toLocaleDateString(I18N.lang, { day: 'numeric', month: 'long', year: 'numeric' }) + ' · ThomasGotchi', W / 2, 758);
  desk.savePhoto(card.toDataURL('image/png'), state.name).then((file) => {
    if (!file || !state) return;
    // Album du carnet : une petite vignette (24 photos au plus) et le chemin de la photo en grand
    const thumb = document.createElement('canvas');
    thumb.width = 120;
    thumb.height = 156;
    thumb.getContext('2d').drawImage(card, 0, 0, 120, 156);
    state.photos = [...(state.photos || []), { file, at: Date.now(), thumb: thumb.toDataURL('image/jpeg', 0.75) }].slice(-24);
    state.stats.photos = (state.stats.photos || 0) + 1;
    save();
    checkUnlocks();
  });
  play('love', 1400);
  say(Pet.g(state, 'Clic ! Je suis beau, non ? 📸', 'Clic ! Je suis belle, non ? 📸'), 3500);
}
$('set-city').addEventListener('change', () => desk.setCity($('set-city').value));
$('set-gravity').addEventListener('change', (e) => desk.setGravity(e.target.checked));
$('set-voice').addEventListener('change', (e) => {
  state.voice = e.target.checked;
  if (state.voice) speak(t('Bonjour{owner} !', { owner: owner() }));
  save();
});
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
  if (!confirm(Pet.g(state, t('Laisser partir {name} ? Il s\'en ira pour toujours.', state), t('Laisser partir {name} ? Elle s\'en ira pour toujours.', state)))) return;
  desk.poopClearAll();
  desk.release();
});

$('set-reset').addEventListener('click', () => {
  if (confirm(t('Recommencer avec un nouvel œuf ? {name} disparaîtra pour toujours.', state))) openNew();
});

function showDead() {
  const p = { name: state.name, age: Pet.ageText(state) };
  $('dead-text').textContent = Pet.g(state,
    t('{name} est parti au paradis des pixels après {age} de vie. Il ne faut pas oublier de le nourrir, de le faire boire et de le laver…', p),
    t('{name} est partie au paradis des pixels après {age} de vie. Il ne faut pas oublier de la nourrir, de la faire boire et de la laver…', p));
  openModal('modal-dead');
}
$('dead-ok').addEventListener('click', openNew);

// ---------- Pense-bête (rappels gardés par main.js, communs à tous les animaux) ----------
async function openNotes() {
  if (desk.guest || !state || state.dead) return;
  $('note-text').value = '';
  $('note-msg').textContent = '';
  $('note-day').value = 'today';
  $('note-date').classList.add('hidden');
  renderNotes(await desk.reminders.get());
  await openModal('modal-notes');
  $('note-text').focus();
}

// Jour du rappel en clair : « aujourd'hui à 18:00 », « demain à 9:30 », « tous les jours à 8:00 », « 3 nov. 14:00 »
function noteWhen(r) {
  const d = new Date(r.at);
  const time = d.toLocaleTimeString(I18N.lang, { hour: '2-digit', minute: '2-digit' });
  if (r.daily) return t('tous les jours à {time}', { time });
  const day = (x) => Math.floor((x.getTime() - x.getTimezoneOffset() * 60000) / 86400000);
  const diff = day(d) - day(new Date());
  if (diff === 0) return t('aujourd\'hui à {time}', { time });
  if (diff === 1) return t('demain à {time}', { time });
  return d.toLocaleDateString(I18N.lang, { day: 'numeric', month: 'short' }) + ' ' + time;
}

function renderNotes(list) {
  const box = $('notes-list');
  box.textContent = '';
  for (const r of list) {
    const row = document.createElement('div');
    row.className = 'note';
    const text = document.createElement('span');
    text.textContent = r.text;
    const when = document.createElement('em');
    when.textContent = noteWhen(r);
    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = t('Effacer ce rappel');
    del.addEventListener('click', async () => { renderNotes(await desk.reminders.remove(r.id)); openModal('modal-notes'); });
    row.append(text, when, del);
    box.appendChild(row);
  }
  if (!list.length) box.textContent = t('Aucun rappel pour le moment.');
}

$('note-day').addEventListener('change', () => {
  const pick = $('note-day').value === 'date';
  $('note-date').classList.toggle('hidden', !pick);
  if (pick && !$('note-date').value) {
    const d = new Date(Date.now() + 2 * 86400000);
    $('note-date').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  openModal('modal-notes'); // la carte change de hauteur
});

$('note-add').addEventListener('click', async () => {
  const text = $('note-text').value.trim();
  const [h, m] = ($('note-time').value || '').split(':').map(Number);
  if (!text) { $('note-msg').textContent = t('Écris d\'abord ce qu\'il faut te rappeler.'); return; }
  if (!Number.isFinite(h) || !Number.isFinite(m)) { $('note-msg').textContent = t('Choisis une heure.'); return; }
  const kind = $('note-day').value;
  const at = new Date();
  if (kind === 'date' && $('note-date').value) {
    const [y, mo, d] = $('note-date').value.split('-').map(Number);
    at.setFullYear(y, mo - 1, d);
  } else if (kind === 'tomorrow') {
    at.setDate(at.getDate() + 1);
  }
  at.setHours(h, m, 0, 0);
  // « Tous les jours » : la première fois aujourd'hui, ou demain si l'heure est déjà passée
  if (kind === 'daily' && at.getTime() <= Date.now()) at.setDate(at.getDate() + 1);
  if (at.getTime() <= Date.now()) { $('note-msg').textContent = t('Cette heure est déjà passée.'); return; }
  renderNotes(await desk.reminders.add({ text, at: at.getTime(), daily: kind === 'daily' }));
  $('note-text').value = '';
  $('note-msg').textContent = t('C\'est noté ! {name} te le rappellera 📝', state);
  openModal('modal-notes');
});

// C'est l'heure d'un rappel : il saute et le dit, même en « ne pas déranger » (c'est toi qui l'as demandé)
desk.onReminder((r) => {
  if (!state || state.dead) return;
  closeModal();
  if (!state.sleeping) play('jump', 800);
  Sound.play('alert');
  bubble.textContent = r.late ? t('Tu avais noté : « {text} » 📝', r) : t('C\'est l\'heure : « {text} » ⏰', r);
  bubble.classList.remove('hidden');
  bubbleUntil = reminderUntil = performance.now() + 15000;
});

desk.onMenu((action) => {
  if (action === 'settings') openSettings();
  if (action === 'notes') openNotes();
  if (action === 'games') doAction('play'); // fenêtre des mini-jeux (refusée s'il dort, est malade…)
  if (action === 'photo') takePhoto();
  if (action === 'pause') setPause(true);
  if (action === 'resume') setPause(false);
});

$('set-pause').addEventListener('click', () => setPause(!state.paused));
$('set-export').addEventListener('click', async () => {
  if (await desk.exportPet(state)) say(Pet.g(state, t('{name} est sauvegardé dans un fichier 💾', state), t('{name} est sauvegardée dans un fichier 💾', state)));
});

desk.onFurniture((f) => { furn = f; });

// Musique (Windows) : il danse en rythme de temps en temps, sans bruitage pour ne pas couvrir la musique
let musicOn = false;
let nextDanceAt = 0;
let nextLaserAt = 0;
desk.onMusic((on) => { musicOn = on; nextDanceAt = performance.now() + 4000; });

// Pointeur laser : il court après le point rouge (sauf les calmes, qui s'en lassent vite)
let laserOn = false;
desk.onLaser((on) => {
  laserOn = on;
  if (!state || state.dead || Pet.isEgg(state)) return;
  if (on && canWander()) say(Pet.trait(state).calm ? 'Un point rouge ? Bof… 😐' : 'Un point rouge ! Je vais l\'attraper ! 🔴', 2500);
  if (!on && walking && walking.target === 'laser') walking = null;
});

// Mode concentration : il va s'installer (dans son panier s'il y en a un), puis ne bouge plus et ne parle plus
let focusMode = null; // null, 'go' (en route vers le panier) ou 'sit' (installé)
desk.onFocus((f) => {
  if (!state || state.dead || Pet.isEgg(state)) return;
  Sound.muted = dnd || f.phase === 'work';
  if (f.phase === 'work') {
    walking = null;
    closeModal();
    say('Au travail ! Je me fais tout petit… 🤫', 3000);
    focusMode = 'go';
  } else {
    focusMode = null;
    if (f.phase === 'pause') {
      state.stats.focus = (state.stats.focus || 0) + 1;
      play('dance', 2000);
      say(t('Bravo, {n} minutes de concentration ! Une pause de 5 minutes ? ☕', { n: f.minutes }), 8000);
      save();
    } else if (f.phase === 'end') {
      play('jump', 800);
      say('Fin de la pause ! On s\'y remet ? 💪', 5000);
    }
  }
});
desk.onDnd((on) => {
  dnd = on;
  Sound.muted = on;
  if (on) walking = null;
});

let cursorOnPet = false;

desk.onCursor((pos) => {
  cursor = pos;
  // Sur Mac, pendant qu'on fait glisser un fichier, la fenêtre ne reçoit aucun mouvement de souris : sans ça,
  // elle laisserait passer le fichier jusqu'au bureau au lieu de le donner à manger
  const onPet = overPet(pos.x, pos.y);
  if (onPet !== cursorOnPet) { cursorOnPet = onPet; desk.diag(onPet ? `souris sur l'animal (${pos.x}, ${pos.y})` : 'souris hors de l\'animal'); }
  if (!zoneMode && !dragging && onPet) desk.setIgnore(false);
  // Mac : la souris sur l'animal passe par la zone de dépôt, qui ne reçoit pas les survols quand l'application
  // n'est pas au premier plan ; c'est donc la position de la souris qui fait apparaître le panneau
  if (zoneMode && onPet && !dragging && !modalIsOpen() && state && panel.classList.contains('hidden')) showPanel();
  // L'animal a pu s'éloigner de la souris sans qu'elle bouge (marche, chute, fenêtre déplacée) : on vérifie ici
  if (!panel.classList.contains('hidden') && !modalIsOpen() && !dragging && !overInteractive(pos.x, pos.y)) {
    desk.setIgnore(true);
    if (!hideTimer) scheduleHide();
  }
});

// On l'a secoué en le déplaçant
desk.onShaken(() => {
  if (!state || state.dead || state.sleeping || Pet.isEgg(state)) return;
  play('dizzy', 2500);
  state.fun = Math.max(0, state.fun - 3);
  say('Ouh là… tout tourne ! 😵', 2500);
});

// Un autre animal passe tout près : petit câlin
desk.onYarn((info) => { yarnInfo = info; });

// Un autre animal passe tout près : câlin, jeu du chat (l'un fuit, l'autre poursuit) ou sauts ensemble
desk.onFriends((list) => { friends = list || []; });

// Chute après avoir été lâché en hauteur, puis atterrissage avec un petit rebond
desk.onFalling(() => {
  walking = null;
  if (state && !state.dead) play('fall', 10000);
});
desk.onLanded(() => {
  if (!state || state.dead) return;
  play('land', 350);
  Sound.play('jump');
  if (Math.random() < 0.3 && !state.sleeping) say(['Ouf !', 'Atterrissage réussi !', 'Boing !'][Math.floor(Math.random() * 3)], 1800);
});

// Changement de langue (depuis n'importe quel animal) : on retraduit tout de suite
desk.onLang((l) => {
  I18N.lang = l;
  translatePage();
  if (state && !panel.classList.contains('hidden')) updatePanel();
  if (state && modalIsOpen() && !$('modal-settings').classList.contains('hidden')) updatePauseButton();
});
desk.onWeather((w) => {
  const prev = weather;
  weather = w;
  if (w && w.lead) reactToWeather(prev, w); // un seul animal commente le temps (main.js choisit lequel)
});

// Ce que fait l'utilisateur sur l'ordinateur
desk.onUserEvent((ev) => {
  if (!state || state.dead || state.sleeping || state.paused || Pet.isEgg(state) || modalIsOpen()) return;
  if (ev.type === 'back' && Pet.trait(state).welcome) {
    // Le chien fidèle fait la fête
    play('dance', 2200);
    Sound.play('voice', state.species);
    state.fun = Math.min(100, state.fun + 10);
    say(t('Tu es là{owner} ! Youpi ! 🎉', { owner: owner() }), 4500);
    speak(t('Te revoilà{owner} !', { owner: owner() }));
  } else if (ev.type === 'back') {
    play('jump', 800);
    say(t('Te revoilà{owner} ! Tu m\'as manqué 💕', { owner: owner() }), 4500);
    speak(t('Te revoilà{owner} !', { owner: owner() }));
  } else if (ev.type === 'typing') {
    play('stretch', 1500);
    say('Tu tapes beaucoup… 🥱 Une petite pause ?', 4500);
  }
});

desk.onMeet(({ name, side, game, role, levelUp }) => {
  if (!state || state.dead || state.sleeping || Pet.isEgg(state) || modalIsOpen()) return;
  walking = null;
  facing = side;
  state.fun = Math.min(100, state.fun + 5);
  const other = name || t('toi');
  if (levelUp && levelUp !== 'connaissances') {
    play('love', 1600);
    say(t('{other} et moi, on est {level} ! 💞', { other, level: t(levelUp) }), 4500);
    return;
  }
  if (game === 'groom') {
    // Toilette : il lèche la tête de son ami
    play('love', 2200);
    say(role === 'flee' ? 'Slurp slurp ! 👅' : t('Merci pour la toilette, {other} 😽', { other }), 2500);
    return;
  }
  if (game === 'tussle') {
    // Chamaillerie pour rire
    play('tussle', 1800);
    say(role === 'flee' ? 'Chamaillerie ! 😼' : 'Même pas mal ! 😹', 2000);
    return;
  }
  if (game === 'chase') {
    if (role === 'flee') {
      startWalk(-side, 55, 5);
      say(t('Attrape-moi, {other} ! 😹', { other }), 2200);
    } else {
      setTimeout(() => { if (canWander()) startWalk(side, 60, 5); }, 450);
      say('Je vais t\'attraper !', 2200);
    }
  } else if (game === 'jump') {
    play('jump', 800);
    setTimeout(() => { if (!anim) play('jump', 800); }, 900);
    say(role === 'flee' ? 'Hop hop !' : t('On saute, {other} ?', { other }), 1800);
  } else {
    play('love', 1600);
    say(t('Coucou {other} ! 💕', { other }));
  }
});

desk.onPoopCleaned((id) => {
  if (!state) return;
  const treat = (state.treatSpots || []).find((t) => t.id === id);
  if (treat) return openTreat(treat);
  state.poopSpots = (state.poopSpots || []).filter((p) => p.id !== id);
  Pet.cleanPoop(state);
  Sound.play('sparkle');
  if (!state.dead && !state.sleeping) say(state.poops ? 'Merci ! ✨' : 'Tout propre, merci ! ✨');
  save();
});
window.addEventListener('beforeunload', save);

// ---------- Démarrage ----------

translatePage();

(async function start() {
  // Animal venu en visite d'un autre ordinateur : rien n'est chargé ni sauvegardé ici
  if (desk.guest) {
    const g = desk.guest, pet = g.pet || {};
    state = Pet.create(pet.name || '?', pet.style || 'cute', pet.color || 'rose', pet.species || 'chat');
    // Faim à moitié : de quoi accepter un repas de son hôte (ce qu'il mange lui profite à son retour)
    Object.assign(state, { gender: pet.gender || 'm', accessory: pet.accessory || null, hatchAt: Date.now() - 30 * 86400000,
      hunger: 40, thirst: 90, energy: 90, fun: 90, clean: 90, health: 100 });
    applyStyle(state.style);
    requestAnimationFrame(frame);
    return;
  }
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
