// Logique du petit être : jauges, vieillissement, actions. Aucune notion d'affichage ici.

const HOUR = 3600 * 1000;
const HATCH_DELAY = 40 * 1000;
const MAX_POOPS = 4;

const COLORS = {
  rose: '#ffb3c9',
  menthe: '#9fe3bd',
  ciel: '#a9d4ff',
  citron: '#ffe17a',
  lavande: '#cdb8ff',
  noir: '#3a3540',
  noirblanc: '#3a3540',
  roux: '#f2a45a',
  gris: '#aaa6b0',
  marron: '#b07a52',
  orange: '#f08a3c',
  caramel: '#f0c27b',
  perle: '#bdb9c4',
  vert: '#8fd16a',
  blanc: '#f7f4fb',
  ardoise: '#8d8a99',
  simba: '#e9b27c',
  snoop: '#8f8a93',
  grisette: '#2f2b33',
};

// Pelages à motif, dessinés dans draw.js. Options possibles :
//   dark (pelage foncé : yeux jaunes, traits clairs), eye (couleur des yeux sur pelage foncé),
//   muzzle / blaze / chest / paws (museau, liseré entre les yeux, plastron, pattes blancs),
//   stripes (rayures), spots (taches), patches (taches colorées : [partie, dx, dy, rx, ry, couleur]),
//   tailTip (bout de queue), fluffy (poils longs), swatch (aperçu de la pastille dans les réglages)
const COATS = {
  noir: { name: 'Noir', dark: true },
  noirblanc: { name: 'Noir et blanc', dark: true, muzzle: true, blaze: true, chest: true, paws: true,
    swatch: 'linear-gradient(135deg, #3a3540 50%, #fbf8f4 50%)' },
  roux: { name: 'Roux tigré', stripes: '#c8692a',
    swatch: 'repeating-linear-gradient(45deg, #f2a45a 0 4px, #c8692a 4px 7px)' },
  gris: { name: 'Gris tacheté', spots: '#6c6772',
    swatch: 'radial-gradient(circle at 30% 35%, #6c6772 0 3px, transparent 3.5px), radial-gradient(circle at 70% 65%, #6c6772 0 3px, transparent 3.5px), #aaa6b0' },

  // Les chats de la maison, dessinés d'après leurs photos
  simba: { name: 'Simba (roux crème et blanc)', stripes: '#cf8a50', muzzle: true, chest: true, paws: true,
    tailTip: '#f6dcc0',
    swatch: 'linear-gradient(135deg, #e9b27c 55%, #fbf8f4 55%)' },
  snoop: { name: 'Snoop (tigrée grise et pêche)', stripes: '#5e5962', muzzle: true, chest: true, paws: true,
    patches: [['head', -0.45, -0.15, 0.32, 0.28, '#e7b58e'], ['head', 0.05, -0.75, 0.1, 0.22, '#e7b58e'],
      ['body', 0.55, -0.35, 0.28, 0.2, '#e7b58e'], ['body', -0.65, 0.1, 0.2, 0.25, '#e7b58e']],
    swatch: 'radial-gradient(circle at 30% 30%, #e7b58e 0 4px, transparent 4.5px), linear-gradient(135deg, #8f8a93 60%, #fbf8f4 60%)' },
  grisette: { name: 'Grisette (noire et blanche, poils longs)', dark: true, eye: '#cfc65a', fluffy: true,
    muzzle: true, blaze: 'wide', chest: true, paws: true,
    patches: [['body', 0.62, -0.42, 0.2, 0.3, '#fbf8f4'], ['body', -0.55, -0.5, 0.22, 0.16, '#fbf8f4']],
    swatch: 'linear-gradient(135deg, #2f2b33 45%, #fbf8f4 45% 60%, #2f2b33 60%)' },
};

// Espèces disponibles, avec leur couleur de départ (panda et pingouin gardent leurs couleurs naturelles)
const SPECIES = [
  { id: 'chat', name: 'Chat', icon: '🐱' },
  { id: 'lapin', name: 'Lapin', icon: '🐰' },
  { id: 'ours', name: 'Ourson', icon: '🐻' },
  { id: 'chien', name: 'Chien', icon: '🐶', color: 'marron' },
  { id: 'renard', name: 'Renard', icon: '🦊', color: 'orange' },
  { id: 'panda', name: 'Panda', icon: '🐼' },
  { id: 'pingouin', name: 'Pingouin', icon: '🐧' },
  { id: 'hamster', name: 'Hamster', icon: '🐹', color: 'caramel' },
  { id: 'koala', name: 'Koala', icon: '🐨', color: 'perle' },
  { id: 'grenouille', name: 'Grenouille', icon: '🐸', color: 'vert' },
  { id: 'licorne', name: 'Licorne', icon: '🦄', color: 'blanc' },
  { id: 'dragon', name: 'Dragon', icon: '🐲', color: 'vert' },
  { id: 'loup', name: 'Loup', icon: '🐺', color: 'ardoise' },
  { id: 'lion', name: 'Lion', icon: '🦁', color: 'caramel' },
  { id: 'tigre', name: 'Tigre', icon: '🐯', color: 'orange' },
  { id: 'cochon', name: 'Cochon', icon: '🐷', color: 'rose' },
  { id: 'mouton', name: 'Mouton', icon: '🐑', color: 'perle' },
  { id: 'souris', name: 'Souris', icon: '🐭', color: 'perle' },
  { id: 'hibou', name: 'Hibou', icon: '🦉', color: 'marron' },
  { id: 'singe', name: 'Singe', icon: '🐵', color: 'marron' },
  { id: 'raton', name: 'Raton laveur', icon: '🦝', color: 'ardoise' },
];

// Caractère propre à chaque espèce : un petit trait discret, affiché dans le panneau et présenté sur le site.
// name : [masculin, féminin] ; rates : multiplicateurs des jauges ; climb : envie de grimper ; calm : balades plus
// ou moins espacées ; bed : heures de coucher et de lever ; les autres options sont utilisées dans app.js et draw.js.
const TRAITS = {
  chat: { icon: '😴', name: ['Roi de la sieste', 'Reine de la sieste'], desc: 'Fait de longues siestes et se fatigue plus vite.', rates: { energy: 1.25 } },
  lapin: { icon: '🐇', name: ['Sauteur', 'Sauteuse'], desc: 'Se déplace en sautillant.', hop: true },
  ours: { icon: '🍯', name: ['Gourmand', 'Gourmande'], desc: 'A faim plus souvent, mais chaque repas lui fait très plaisir.', rates: { hunger: 1.25 }, feedFun: 6 },
  chien: { icon: '🎉', name: ['Fidèle', 'Fidèle'], desc: 'Fait la fête à ton retour et s\'ennuie vite sans toi.', rates: { fun: 1.25 }, welcome: true },
  renard: { icon: '🔎', name: ['Curieux', 'Curieuse'], desc: 'Va voir tout ce qui bouge, même la souris.', curious: true },
  panda: { icon: '💤', name: ['Gros dormeur', 'Grosse dormeuse'], desc: 'Se fatigue vite et adore dormir.', rates: { energy: 1.35 }, calm: 1.4 },
  pingouin: { icon: '❄️', name: ['Ami du froid', 'Amie du froid'], desc: 'Adore le froid et la neige, mais a vite chaud en été.', likes: 'cold' },
  hamster: { icon: '🏃', name: ['Infatigable', 'Infatigable'], desc: 'Bouge sans arrêt et se fatigue moins vite.', rates: { energy: 0.8 }, calm: 0.6 },
  koala: { icon: '🌿', name: ['Paisible', 'Paisible'], desc: 'Bouge peu et prend son temps.', calm: 2 },
  grenouille: { icon: '🌧️', name: ['Ami de la pluie', 'Amie de la pluie'], desc: 'Adore quand il pleut chez toi.', likes: 'rain' },
  licorne: { icon: '✨', name: ['Artiste', 'Artiste'], desc: 'Montre ses tours bien plus souvent.', showOff: true },
  dragon: { icon: '🔥', name: ['Cracheur de feu', 'Cracheuse de feu'], desc: 'Crache une petite flamme quand tu lui fais un câlin.', flame: true },
  loup: { icon: '🌕', name: ['Hurleur', 'Hurleuse'], desc: 'Hurle à la lune le soir.', howl: true },
  lion: { icon: '👑', name: ['Fier', 'Fière'], desc: 'Adore les caresses : elles lui font encore plus plaisir.', petFun: 6 },
  tigre: { icon: '⚡', name: ['Sportif', 'Sportive'], desc: 'Grimpe volontiers sur les fenêtres et bouge beaucoup.', climb: 1.6, calm: 0.8 },
  cochon: { icon: '🫧', name: ['Pas très propre', 'Pas très propre'], desc: 'Se salit plus vite… et ne s\'en soucie pas !', rates: { clean: 1.4 } },
  mouton: { icon: '☁️', name: ['Doux', 'Douce'], desc: 'A moins besoin de se dépenser.', rates: { fun: 0.75 }, calm: 1.3 },
  souris: { icon: '🧀', name: ['Petit appétit', 'Petit appétit'], desc: 'Mange peu : les repas tiennent plus longtemps.', rates: { hunger: 0.75 } },
  hibou: { icon: '🌙', name: ['Noctambule', 'Noctambule'], desc: 'Se couche tard et se lève tard.', bed: [2, 10] },
  singe: { icon: '🧗', name: ['Grimpeur', 'Grimpeuse'], desc: 'Grimpe très souvent sur les fenêtres.', climb: 2.2 },
  raton: { icon: '🧼', name: ['Maniaque', 'Maniaque'], desc: 'Se lave souvent les pattes : reste propre plus longtemps.', rates: { clean: 0.6 } },
};

// Modèles prêts à adopter (un clic remplit le prénom, le pelage et le genre)
const PRESETS = [
  { name: 'Simba', species: 'chat', color: 'simba', gender: 'm', icon: '🧡' },
  { name: 'Snoop', species: 'chat', color: 'snoop', gender: 'f', icon: '🩶' },
  { name: 'Grisette', species: 'chat', color: 'grisette', gender: 'f', icon: '🖤' },
];

// Vitesses en points par heure. Calibrées pour qu'un petit être laissé seul tienne quelques jours.
const RATES = {
  hunger: 2.8,      // ~36 h pour passer de 100 à 0
  thirst: 3.3,      // ~30 h
  energy: 2.5,      // ~40 h éveillé
  energySleep: 25,  // ~4 h de sommeil pour une recharge complète
  fun: 2.1,         // ~48 h
  clean: 1.2,
  cleanPerPoop: 2,
  healthLoss: 4,    // par jauge vide : ~25 h avant la mort
  healthGain: 3,
};

// Valeur nutritive selon le type de fichier. Les fichiers ne sont jamais modifiés ni supprimés :
// seuls leur nom et leur taille sont utilisés.
const FOODS = [
  { cat: 'images', exts: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'heic', 'tif', 'tiff'],
    hunger: 12, fun: 8, msgs: ['Croustillant !', 'Ça a le goût de pixels !', 'Miam, une jolie image !'] },
  { cat: 'textes', exts: ['txt', 'md', 'rtf', 'log', 'csv', 'ini'],
    hunger: 14, msgs: ['Léger comme une salade.', 'Des petits mots, miam !'] },
  { cat: 'documents', exts: ['doc', 'docx', 'odt', 'pages'],
    hunger: 28, msgs: ['Un bon repas de mots !', 'Très nourrissant, ce document.'] },
  { cat: 'PDF', exts: ['pdf'],
    hunger: 35, msgs: ['Un PDF bien consistant !', 'Ça cale bien, merci !'] },
  { cat: 'tableurs', exts: ['xls', 'xlsx', 'ods', 'numbers'],
    hunger: 24, thirst: -5, fun: -2, msgs: ['Des chiffres… c\'est un peu sec.', 'Ça gratte la gorge, tous ces tableaux.'] },
  { cat: 'présentations', exts: ['ppt', 'pptx', 'odp', 'key'],
    hunger: 30, fun: 6, msgs: ['Des diapos colorées, miam !', 'Slide après slide… délicieux !'] },
  { cat: 'code', exts: ['js', 'ts', 'py', 'html', 'css', 'json', 'java', 'c', 'cpp', 'cs', 'php', 'rb', 'go', 'rs', 'sh', 'xml'],
    hunger: 18, fun: 10, msgs: ['Épicé, ce code !', 'Ça pique un peu… j\'adore !'] },
  { cat: 'musiques', exts: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'],
    hunger: 10, fun: 20, msgs: ['Ça chatouille le ventre !', 'Une musique en dessert !'] },
  { cat: 'vidéos', exts: ['mp4', 'avi', 'mkv', 'mov', 'webm', 'wmv'],
    hunger: 40, fun: 15, msgs: ['Un vrai festin !', 'Tout un film… je suis repu !'] },
  { cat: 'archives', exts: ['zip', 'rar', '7z', 'tar', 'gz'],
    hunger: 45, fun: -5, msgs: ['Très compact… un peu lourd.', 'Ouf, c\'était bien tassé !'] },
  { cat: 'programmes', exts: ['exe', 'msi', 'bat', 'cmd', 'dll', 'app', 'dmg', 'pkg'],
    hunger: 5, fun: -10, health: -15, msgs: ['Beurk ! Ça pique !', 'Bwaaah… j\'ai mal au ventre !'] },
];
const DEFAULT_FOOD = { cat: 'fichiers bizarres', hunger: 10, msgs: ['Bizarre… mais mangeable.', 'Hmm, goût inconnu.'] };

// Rythme de vie : multiplie la vitesse à laquelle les jauges baissent (zen ≈ 5 jours sans soins, exigeant ≈ 1 jour)
const PACES = { zen: 0.5, normal: 1, exigeant: 2 };

const clamp = (v) => Math.max(0, Math.min(100, v));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

const Pet = {
  COLORS,
  COATS,
  PRESETS,
  SPECIES,
  TRAITS,

  // Accord au masculin ou au féminin selon le genre choisi
  g(s, masc, fem) {
    return s && s.gender === 'f' ? fem : masc;
  },

  // Caractère de son espèce (objet vide si l'espèce n'en a pas)
  trait(s) {
    return (s && TRAITS[s.species || 'chat']) || {};
  },

  // Nom du caractère, accordé et traduit, avec son icône : « 😴 Roi de la sieste »
  traitLabel(s) {
    const tr = Pet.trait(s);
    return tr.name ? `${tr.icon} ${t(Pet.g(s, tr.name[0], tr.name[1]))}` : '';
  },

  // memorials : souvenirs des compagnons précédents, transmis d'un œuf à l'autre
  create(name, style, color, species, memorials = [], now = Date.now()) {
    return {
      version: 1,
      name: name || 'Didou',
      style: style || 'cute',
      species: species || 'chat',
      color: color || 'rose',
      born: now,
      hatchAt: now + HATCH_DELAY,
      hunger: 80, thirst: 80, energy: 90, fun: 80, clean: 100, health: 100,
      care: 80,
      sleeping: false,
      dead: false,
      diedAt: null,
      poops: 0,
      poopSpots: [], // positions des crottes sur l'écran (gérées par app.js)
      poopAt: null,
      peeAt: null,
      meals: 0,
      lastTick: now,
      stats: { hugs: 0, poopsCleaned: 0, gamesWon: 0, foods: {} },
      unlocked: [],
      accessory: null,
      memorials,
    };
  },

  isEgg(s, now = Date.now()) {
    return now < s.hatchAt;
  },

  stage(s, now = Date.now()) {
    if (Pet.isEgg(s, now)) return 'egg';
    const ageH = (now - s.hatchAt) / HOUR;
    if (ageH < 24) return 'baby';
    if (ageH < 72) return 'child';
    return 'adult';
  },

  ageText(s, now = Date.now()) {
    if (Pet.isEgg(s, now)) return t('œuf');
    const end = s.dead ? s.diedAt : now;
    const h = Math.floor((end - s.hatchAt) / HOUR);
    const d = Math.floor(h / 24);
    if (d > 0) return t('{d} j {h} h', { d, h: h % 24 });
    if (h > 0) return t('{h} h', { h });
    return t('{m} min', { m: Math.max(1, Math.floor((end - s.hatchAt) / 60000)) });
  },

  // Fait avancer le temps. Renvoie la liste des événements survenus ('wake', 'collapse', 'poop', 'dead').
  // Complète les sauvegardes faites avant l'ajout du carnet et des accessoires
  upgrade(s) {
    s.stats = s.stats || { hugs: 0, poopsCleaned: 0, gamesWon: 0, foods: {} };
    s.unlocked = s.unlocked || [];
    s.memorials = s.memorials || [];
    if (s.accessory === undefined) s.accessory = null;
    s.pace = s.pace || 'normal';
    s.tricks = s.tricks || [];
  },

  // ---- Pause vacances : le temps s'arrête pour lui (il ne vieillit pas, n'a ni faim ni soif) ----

  pause(s, now = Date.now()) {
    if (s.paused || s.dead) return;
    s.paused = true;
    s.pausedAt = now;
  },

  resume(s, now = Date.now()) {
    if (!s.paused) return;
    const away = now - s.pausedAt;
    // On décale toutes les échéances de la durée de la pause
    s.hatchAt += away;
    if (s.poopAt) s.poopAt += away;
    if (s.peeAt) s.peeAt += away;
    s.paused = false;
    s.pausedAt = null;
    s.lastTick = now;
  },

  tick(s, now = Date.now()) {
    const events = [];
    if (s.dead || s.paused) { s.lastTick = now; return events; }
    // Rattrapage par pas d'une minute (temps écoulé pendant que l'application était fermée)
    const maxCatchUp = 14 * 24 * HOUR;
    let time = Math.max(s.lastTick, now - maxCatchUp);
    while (time < now && !s.dead) {
      const next = Math.min(now, time + 60000);
      Pet.step(s, (next - time) / HOUR, next, events);
      time = next;
    }
    s.lastTick = now;
    return events;
  },

  step(s, dtH, now, events) {
    if (Pet.isEgg(s, now)) return;
    const slow = s.sleeping ? 0.5 : 1;
    const k = PACES[s.pace] || 1; // les jauges baissent plus ou moins vite selon le rythme choisi
    const m = Pet.trait(s).rates || {}; // son caractère : certaines jauges baissent plus ou moins vite
    s.hunger = clamp(s.hunger - RATES.hunger * (m.hunger || 1) * dtH * slow * k);
    s.thirst = clamp(s.thirst - RATES.thirst * dtH * slow * k);
    s.energy = clamp(s.energy + (s.sleeping ? RATES.energySleep : -RATES.energy * (m.energy || 1) * k) * dtH);
    if (!s.sleeping) s.fun = clamp(s.fun - RATES.fun * (m.fun || 1) * dtH * k);
    s.clean = clamp(s.clean - (RATES.clean * (m.clean || 1) + RATES.cleanPerPoop * s.poops) * dtH * k);

    // La nuit, il dort jusqu'au matin même une fois reposé (voir app.js)
    if (s.sleeping && s.energy >= 100 && !s.nightSleep) { s.sleeping = false; events.push('wake'); }
    if (!s.sleeping && s.energy <= 0) { s.sleeping = true; events.push('collapse'); }

    // Pendant son sommeil, il se retient jusqu'au réveil
    if (s.peeAt && now >= s.peeAt && !s.sleeping) {
      s.peeAt = null;
      if (s.poops < MAX_POOPS) { s.poops++; events.push('pee'); }
    }

    if (s.poopAt && now >= s.poopAt && !s.sleeping) {
      s.poopAt = null;
      if (s.poops < MAX_POOPS) { s.poops++; events.push('poop'); }
    }

    const empty = [s.hunger, s.thirst, s.clean].filter((v) => v <= 0).length + (s.fun <= 0 ? 0.5 : 0);
    if (empty > 0) s.health = clamp(s.health - RATES.healthLoss * empty * dtH * k);
    else if (s.hunger > 40 && s.thirst > 40 && s.clean > 30) s.health = clamp(s.health + RATES.healthGain * dtH);

    // Moyenne glissante de la qualité des soins (sur environ une journée) : décide de l'évolution adulte
    const avg = (s.hunger + s.thirst + s.energy + s.fun + s.clean + s.health) / 6;
    s.care += (avg - s.care) * Math.min(1, dtH / 24);

    if (s.health <= 0) {
      s.dead = true;
      s.sleeping = false;
      s.diedAt = now;
      events.push('dead');
    }
  },

  isSick(s) {
    return !s.dead && s.health < 45;
  },

  mood(s) {
    if (s.dead) return 'dead';
    if (s.sleeping || s.paused) return 'sleep';
    if (Pet.isSick(s)) return 'sick';
    const low = Math.min(s.hunger, s.thirst, s.fun, s.clean, s.energy);
    if (low < 20) return 'sad';
    if (low > 60) return 'happy';
    return 'ok';
  },

  // Ce que le petit être réclame, pour la bulle de dialogue
  need(s) {
    if (s.dead || s.sleeping || s.paused) return null;
    if (Pet.isSick(s)) return 'Je ne me sens pas bien… 🤒';
    if (s.thirst < 20) return 'J\'ai soif ! 💧';
    if (s.hunger < 20) return 'J\'ai faim ! Donne-moi un fichier 📄';
    if (s.clean < 20) return Pet.g(s, 'Je suis tout sale… 🛁', 'Je suis toute sale… 🛁');
    if (s.energy < 15) return Pet.g(s, 'Je suis fatigué… 😪', 'Je suis fatiguée… 😪');
    if (s.fun < 20) return 'Je m\'ennuie… on joue ? 🎾';
    return null;
  },

  // ---- Actions ----

  feed(s, file) {
    if (s.dead) return { ok: false };
    if (Pet.isEgg(s)) return { ok: false, msg: 'Je suis encore dans l\'œuf !' };
    if (s.sleeping) return { ok: false, msg: 'Zzz… pas maintenant…' };
    if (file.isDir) return { ok: false, msg: 'Un dossier entier ? C\'est trop gros !' };
    if (s.hunger > 95) return { ok: false, msg: 'Je n\'ai plus faim !' };

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const food = FOODS.find((f) => f.exts.includes(ext)) || DEFAULT_FOOD;
    let factor = 1;
    let msg = pick(food.msgs).replace('repu', Pet.g(s, 'repu', 'repue'));
    if (file.size < 1024) { factor = 0.4; msg = 'Juste une miette…'; }
    else if (file.size > 50 * 1024 * 1024) { factor = 1.3; msg = 'Énorme ! Petite indigestion…'; s.energy = clamp(s.energy - 8); }

    s.hunger = clamp(s.hunger + food.hunger * factor);
    s.thirst = clamp(s.thirst + (food.thirst || 0));
    s.fun = clamp(s.fun + (food.fun || 0) + 2);
    s.health = clamp(s.health + (food.health || 0));
    s.meals++;
    s.stats.foods[food.cat] = (s.stats.foods[food.cat] || 0) + 1;
    if (!s.poopAt && s.poops < MAX_POOPS && Math.random() < 0.4) {
      s.poopAt = Date.now() + (10 + Math.random() * 40) * 60000;
    }
    const short = file.name.length > 16 ? file.name.slice(0, 14) + '…' : file.name;
    return { ok: true, msg: t('{file} : {msg}', { file: short, msg: t(msg) }), anim: 'eat', bad: (food.health || 0) < 0 };
  },

  drink(s) {
    if (s.dead || Pet.isEgg(s)) return { ok: false };
    if (s.sleeping) return { ok: false, msg: 'Zzz…' };
    if (s.thirst > 95) return { ok: false, msg: 'Je n\'ai plus soif !' };
    s.thirst = clamp(s.thirst + 35);
    // Ce qui rentre doit sortir : un petit pipi un peu plus tard
    if (!s.peeAt && Math.random() < 0.45) s.peeAt = Date.now() + (15 + Math.random() * 45) * 60000;
    return { ok: true, msg: pick(['Glou glou glou !', 'Ahh, ça fait du bien !', 'Rafraîchissant !']), anim: 'drink' };
  },

  toggleSleep(s) {
    if (s.dead || Pet.isEgg(s)) return { ok: false };
    if (s.sleeping) {
      s.sleeping = false;
      s.nightSleep = false;
      return { ok: true, msg: s.energy < 60 ? 'Hmm… déjà ? *bâille*' : 'Bonjour ! ☀️' };
    }
    if (s.energy > 90) return { ok: false, msg: Pet.g(s, 'Je ne suis pas fatigué !', 'Je ne suis pas fatiguée !') };
    s.sleeping = true;
    return { ok: true, msg: 'Bonne nuit… 🌙' };
  },

  play(s) {
    if (s.dead || Pet.isEgg(s)) return { ok: false };
    if (s.sleeping) return { ok: false, msg: 'Zzz…' };
    if (s.energy < 15) return { ok: false, msg: Pet.g(s, 'Trop fatigué pour jouer…', 'Trop fatiguée pour jouer…') };
    s.fun = clamp(s.fun + 20);
    s.energy = clamp(s.energy - 8);
    s.hunger = clamp(s.hunger - 3);
    s.thirst = clamp(s.thirst - 4);
    return { ok: true, msg: pick(['Youpiii !', 'Encore, encore !', 'Hihi, trop drôle !']), anim: 'play' };
  },

  wash(s) {
    if (s.dead || Pet.isEgg(s)) return { ok: false };
    if (s.sleeping) return { ok: false, msg: 'Zzz…' };
    const hadPoop = s.poops > 0;
    s.stats.poopsCleaned += s.poops;
    s.poops = 0;
    s.clean = 100;
    return { ok: true, msg: hadPoop ? 'Tout propre, et le sol aussi ! ✨' : 'Plouf ! Tout propre ✨', anim: 'wash' };
  },

  heal(s) {
    if (s.dead || Pet.isEgg(s)) return { ok: false };
    if (!Pet.isSick(s) && s.health > 80) return { ok: false, msg: 'Je ne suis pas malade !' };
    s.health = clamp(s.health + 35);
    s.fun = clamp(s.fun - 5);
    return { ok: true, msg: 'Beurk, le médicament… mais ça va mieux !', anim: 'heal' };
  },

  // Une crotte ramassée à la main sur l'écran
  // Envie de faire pipi dans la demi-heure : s'il arrive au bord de l'écran, il en profite
  peeSoon(s) {
    return !!s.peeAt && s.peeAt - Date.now() < 30 * 60000 && s.poops < MAX_POOPS;
  },

  // Il lève la patte contre le bord de l'écran
  peeNow(s) {
    s.peeAt = null;
    s.poops = Math.min(MAX_POOPS, s.poops + 1);
  },

  cleanPoop(s) {
    s.stats.poopsCleaned++;
    s.poops = Math.max(0, s.poops - 1);
    s.clean = clamp(s.clean + 8);
  },

  pet(s) {
    if (s.dead || s.sleeping || Pet.isEgg(s)) return { ok: false };
    s.fun = clamp(s.fun + 3);
    s.stats.hugs++;
    return { ok: true, anim: 'love' };
  },

  // ---- Carnet de vie et accessoires ----

  // Durée de vie lisible, à partir d'un nombre d'heures (pour les souvenirs du carnet)
  ageFromHours(hours) {
    const h = Math.floor(hours);
    if (h >= 24) return t('{d} j {h} h', { d: Math.floor(h / 24), h: h % 24 });
    return h > 0 ? t('{h} h', { h }) : t('{m} min', { m: Math.max(1, Math.round(hours * 60)) });
  },

  favoriteFood(s) {
    const entries = Object.entries(s.stats.foods);
    if (!entries.length) return null;
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  },

  // Souvenir laissé par ce compagnon quand on fait éclore un nouvel œuf
  memorial(s) {
    if (s.hatchAt > Date.now()) return null;
    return { name: s.name, species: s.species, color: s.color, age: Pet.ageText(s), dead: s.dead,
      hours: ((s.dead ? s.diedAt : Date.now()) - s.hatchAt) / HOUR };
  },

  // Tours appris à force de soins et de jeux ; renvoie ceux qui viennent d'être appris
  learnTricks(s) {
    if (s.dead || Pet.isEgg(s)) return [];
    s.tricks = s.tricks || [];
    const fresh = TRICKS.filter((tr) => !s.tricks.includes(tr.id) && tr.earned(s));
    for (const tr of fresh) s.tricks.push(tr.id);
    return fresh;
  },

  // Faire un tour sur demande : un peu fatigant, mais ça rend heureux
  doTrick(s, id) {
    if (s.dead || s.sleeping || s.paused || Pet.isEgg(s)) return { ok: false };
    if (s.energy < 10) return { ok: false, msg: Pet.g(s, 'Trop fatigué pour faire des tours…', 'Trop fatiguée pour faire des tours…') };
    const trick = TRICKS.find((x) => x.id === id);
    if (!trick || !s.tricks.includes(id)) return { ok: false };
    s.fun = clamp(s.fun + 4);
    s.energy = clamp(s.energy - 2);
    return { ok: true, anim: trick.anim, dur: trick.dur, msg: trick.say };
  },

  // Débloque les accessoires mérités ; renvoie ceux qui viennent d'être gagnés
  checkUnlocks(s, now = new Date()) {
    if (s.dead || Pet.isEgg(s)) return [];
    const fresh = ACCESSORIES.filter((a) => !s.unlocked.includes(a.id) && a.earned(s, now));
    for (const a of fresh) s.unlocked.push(a.id);
    return fresh;
  },
};

const ACCESSORIES = [
  { id: 'noeud', name: 'Nœud papillon', icon: '🎀', hint: 'vivre une journée entière',
    earned: (s) => Date.now() - s.hatchAt >= 24 * HOUR },
  { id: 'lunettes', name: 'Lunettes', icon: '👓', hint: 'manger 15 fichiers', earned: (s) => s.meals >= 15 },
  { id: 'fleur', name: 'Fleur', icon: '🌸', hint: 'gagner 5 mini-jeux', earned: (s) => s.stats.gamesWon >= 5 },
  { id: 'couronne', name: 'Couronne', icon: '👑', hint: 'devenir un adulte très bien soigné',
    earned: (s) => Pet.stage(s) === 'adult' && s.care >= 70 },
  { id: 'sorciere', name: 'Chapeau de sorcière', icon: '🎃', hint: 'être là pour Halloween',
    earned: (s, d) => (d.getMonth() === 9 && d.getDate() >= 15) || (d.getMonth() === 10 && d.getDate() <= 2) },
  { id: 'noel', name: 'Bonnet de Noël', icon: '🎅', hint: 'être là en décembre', earned: (s, d) => d.getMonth() === 11 },
  { id: 'fete', name: 'Chapeau de fête', icon: '🥳', hint: 'fêter la nouvelle année',
    earned: (s, d) => (d.getMonth() === 11 && d.getDate() === 31) || (d.getMonth() === 0 && d.getDate() <= 2) },
];
Pet.ACCESSORIES = ACCESSORIES;

// Tours que l'animal apprend petit à petit
const TRICKS = [
  { id: 'salut', name: 'Dire bonjour', icon: '👋', hint: 'recevoir 15 câlins', anim: 'wave', dur: 1800, say: 'Coucou ! 👋',
    earned: (s) => s.stats.hugs >= 15 },
  { id: 'roulade', name: 'Roulade', icon: '🌀', hint: 'gagner 3 mini-jeux', anim: 'roll', dur: 900, say: 'Et hop, une roulade !',
    earned: (s) => s.stats.gamesWon >= 3 },
  { id: 'danse', name: 'Danse', icon: '💃', hint: 'manger 10 fichiers', anim: 'dance', dur: 3000, say: '♪ Je danse ! ♫',
    earned: (s) => s.meals >= 10 },
  { id: 'toupie', name: 'Toupie', icon: '🌪️', hint: 'ramasser 8 crottes', anim: 'spin', dur: 1500, say: 'Je tourne, je tourne !',
    earned: (s) => s.stats.poopsCleaned >= 8 },
  { id: 'salto', name: 'Saut périlleux', icon: '🤸', hint: 'devenir adulte', anim: 'backflip', dur: 1100, say: 'Ta-daaa ! 🤸',
    earned: (s) => Pet.stage(s) === 'adult' },
];
Pet.TRICKS = TRICKS;
