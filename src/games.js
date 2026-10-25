// Mini-jeux et carnet de vie. S'appuie sur les fonctions de app.js (state, say, play, save, openModal…).

const SPECIES_EMOJI = Object.fromEntries(Pet.SPECIES.map((s) => [s.id, s.icon]));

// Le bonheur gagné dépend du score ; un jeu fatigue un peu
function rewardGame(won, fun) {
  state.fun = Math.min(100, state.fun + fun);
  if (won) {
    state.stats.gamesWon++;
    Sound.play('win');
  }
  checkUnlocks();
  save();
}

function canPlay() {
  if (state.sleeping) { say('Zzz…'); return false; }
  if (state.energy < 15) { say(Pet.g(state, 'Trop fatigué pour jouer…', 'Trop fatiguée pour jouer…')); return false; }
  state.energy = Math.max(0, state.energy - 6);
  return true;
}

const Games = {
  open() {
    if (!state || state.dead || Pet.isEgg(state)) return;
    if (Pet.isSick(state)) { say('Je ne me sens pas assez bien pour jouer… 🤒'); return; } // il faut d'abord le soigner
    buildTricks();
    openModal('modal-games');
  },
};

// Boutons des tours : ceux qu'il connaît, et ceux qui restent à apprendre (grisés, avec l'astuce)
function buildTricks() {
  const box = $('trick-list');
  box.innerHTML = '';
  for (const tr of Pet.TRICKS) {
    const b = document.createElement('button');
    const known = (state.tricks || []).includes(tr.id);
    b.textContent = tr.icon + ' ' + t(tr.name);
    b.disabled = !known;
    b.title = known ? t('Faire ce tour') : t('À apprendre : {hint}', { hint: t(tr.hint) });
    b.addEventListener('click', () => {
      const r = Pet.doTrick(state, tr.id);
      closeModal();
      if (r.msg) say(r.msg, 2500);
      if (r.ok) { play(r.anim, r.dur); save(); }
    });
    box.appendChild(b);
  }
}

document.querySelectorAll('.close-modal').forEach((b) => b.addEventListener('click', () => {
  Catch.stop();
  closeModal();
}));

document.querySelectorAll('[data-game]').forEach((b) => b.addEventListener('click', () => {
  const game = b.dataset.game;
  if (game === 'ball') {
    closeModal();
    doAction('ball');
  } else if (game === 'catch') {
    if (canPlay()) Catch.start(); else closeModal();
  } else if (game === 'yarn') {
    closeModal();
    desk.yarnToggle();
  } else if (game === 'cups') {
    if (canPlay()) Cups.start(); else closeModal();
  }
}));

// ---------- Attrape les friandises ----------

const Catch = (() => {
  const area = $('catch-area');
  const catcher = $('catcher');
  const DURATION = 20;
  const TREATS = ['🐟', '🍪', '🍓', '🧀', '🍩'];
  let items = [];
  let score = 0;
  let catcherX = 100;
  let endAt = 0;
  let nextSpawn = 0;
  let raf = 0;

  area.addEventListener('mousemove', (e) => {
    const r = area.getBoundingClientRect();
    catcherX = Math.max(14, Math.min(r.width - 14, e.clientX - r.left));
    catcher.style.left = catcherX + 'px';
  });

  function spawn() {
    const el = document.createElement('div');
    el.className = 'treat';
    const bad = Math.random() < 0.2;
    el.textContent = bad ? '💩' : TREATS[Math.floor(Math.random() * TREATS.length)];
    const x = 14 + Math.random() * (area.clientWidth - 28);
    el.style.left = x + 'px';
    area.appendChild(el);
    items.push({ el, x, y: -20, speed: 1.6 + Math.random() * 1.8 + score * 0.04, bad });
  }

  function loop(now) {
    const left = Math.max(0, Math.ceil((endAt - now) / 1000));
    $('catch-time').textContent = t('{s} s', { s: left });
    if (now > nextSpawn) {
      spawn();
      nextSpawn = now + 450 + Math.random() * 400;
    }
    const floor = area.clientHeight - 34;
    for (const it of items) {
      it.y += it.speed;
      it.el.style.top = it.y + 'px';
      if (!it.done && it.y >= floor - 6 && it.y <= floor + 12 && Math.abs(it.x - catcherX) < 24) {
        it.done = true;
        it.el.remove();
        if (it.bad) {
          score = Math.max(0, score - 2);
          Sound.play('poop');
        } else {
          score++;
          Sound.play('sparkle');
        }
        $('catch-score').textContent = score;
      } else if (it.y > area.clientHeight) {
        it.done = true;
        it.el.remove();
      }
    }
    items = items.filter((it) => !it.done);
    if (now >= endAt) return finish();
    raf = requestAnimationFrame(loop);
  }

  function clear() {
    cancelAnimationFrame(raf);
    for (const it of items) it.el.remove();
    items = [];
  }

  function finish() {
    clear();
    const won = score >= 10;
    $('catch-msg').textContent = won
      ? Pet.g(state, t('Bravo, {score} friandises ! {name} est ravi 😋', { score, name: state.name }), t('Bravo, {score} friandises ! {name} est ravie 😋', { score, name: state.name }))
      : t(score > 1 ? "{score} friandises… Essaie d'en attraper 10 !" : "{score} friandise… Essaie d'en attraper 10 !", { score });
    $('catch-again').classList.remove('hidden');
    state.hunger = Math.min(100, state.hunger + Math.min(20, score));
    rewardGame(won, Math.min(30, 5 + score * 2));
  }

  $('catch-again').addEventListener('click', () => { if (canPlay()) start(); });

  function start() {
    clear();
    score = 0;
    $('catch-score').textContent = '0';
    $('catch-msg').textContent = t('Bouge la souris pour attraper les friandises. Évite les 💩 !');
    $('catch-again').classList.add('hidden');
    catcher.textContent = SPECIES_EMOJI[state.species] || '🐱';
    openModal('modal-catch');
    endAt = performance.now() + DURATION * 1000;
    nextSpawn = 0;
    raf = requestAnimationFrame(loop);
  }

  return { start, stop: clear };
})();

// ---------- Le jeu des gobelets ----------

const Cups = (() => {
  const area = $('cups-area');
  const SLOTS = [8, 80, 152];
  let cups = [];
  let busy = false;
  let target = 0;

  function build() {
    area.innerHTML = '';
    cups = SLOTS.map((left, i) => {
      const el = document.createElement('div');
      el.className = 'cup';
      el.style.left = left + 'px';
      const peek = document.createElement('span');
      peek.className = 'peek';
      el.appendChild(peek);
      el.addEventListener('click', () => pick(i));
      area.appendChild(el);
      return { el, peek, slot: i };
    });
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function start() {
    build();
    busy = true;
    $('cups-again').classList.add('hidden');
    $('cups-title').textContent = Pet.g(state, t('Où est caché {name} ?', state), t('Où est cachée {name} ?', state));
    $('cups-msg').textContent = t(Pet.g(state, 'Regarde bien sous quel gobelet il se cache…', 'Regarde bien sous quel gobelet elle se cache…'));
    target = Math.floor(Math.random() * 3);
    cups.forEach((c, i) => { c.peek.textContent = i === target ? (SPECIES_EMOJI[state.species] || '🐱') : ''; });
    openModal('modal-cups');
    await wait(300);
    cups[target].el.classList.add('up');
    await wait(1200);
    cups[target].el.classList.remove('up');
    await wait(400);
    // Mélange : on échange la place de deux gobelets, plusieurs fois
    for (let n = 0; n < 7; n++) {
      const a = Math.floor(Math.random() * 3);
      const b = (a + 1 + Math.floor(Math.random() * 2)) % 3;
      [cups[a].slot, cups[b].slot] = [cups[b].slot, cups[a].slot];
      cups[a].el.style.left = SLOTS[cups[a].slot] + 'px';
      cups[b].el.style.left = SLOTS[cups[b].slot] + 'px';
      await wait(330);
    }
    $('cups-msg').textContent = t('À toi ! Clique sur le bon gobelet.');
    busy = false;
  }

  async function pick(i) {
    if (busy) return;
    busy = true;
    const won = i === target;
    cups[i].el.classList.add('up');
    if (!won) {
      await wait(500);
      cups[target].el.classList.add('up');
    }
    $('cups-msg').textContent = won
      ? Pet.g(state, t('Trouvé ! {name} est tout content 🎉', state), t('Trouvé ! {name} est toute contente 🎉', state))
      : t(Pet.g(state, 'Raté ! Il était là…', 'Raté ! Elle était là…'));
    $('cups-again').classList.remove('hidden');
    if (!won) Sound.play('sad');
    rewardGame(won, won ? 15 : 5);
  }

  $('cups-again').addEventListener('click', () => { if (canPlay()) start(); });

  return { start };
})();

// ---------- Carnet de vie ----------

function openJournal() {
  const s = state;
  $('journal-title').textContent = t('Carnet de {name}', s);
  const fav = Pet.favoriteFood(s);
  const rows = [
    ['Âge', Pet.ageText(s)],
    ['Fichiers mangés', s.meals],
    ['Plat préféré', fav ? t(fav) : '—'],
    ['Câlins reçus', s.stats.hugs],
    ['Crottes ramassées', s.stats.poopsCleaned],
    ['Mini-jeux gagnés', s.stats.gamesWon],
    ['Accessoires', `${s.unlocked.length} / ${Pet.accessoriesFor(s).length}`],
  ];
  const body = $('journal-body');
  body.innerHTML = '';
  const addRow = (label, value) => {
    const row = document.createElement('div');
    row.className = 'journal-row';
    const a = document.createElement('span');
    a.textContent = t(label);
    const b = document.createElement('b');
    b.textContent = typeof value === 'string' ? t(value) : value;
    row.append(a, b);
    body.appendChild(row);
  };
  rows.forEach(([l, v]) => addRow(l, v));

  // Prochain accessoire à gagner
  const next = Pet.accessoriesFor(s).find((a) => !s.unlocked.includes(a.id));
  if (next) addRow('Prochain cadeau', next.icon + ' ' + t(next.hint));

  const addSub = (text) => {
    const sub = document.createElement('div');
    sub.className = 'journal-sub';
    sub.textContent = text;
    body.appendChild(sub);
  };

  // Trophées : ceux gagnés en couleur, les autres grisés (l'astuce s'affiche au survol)
  const won = s.trophies || [];
  addSub(t('Trophées ({n} / {total})', { n: won.length, total: Pet.TROPHIES.length }));
  const shelf = document.createElement('div');
  shelf.className = 'trophies';
  for (const tr of Pet.TROPHIES) {
    const cup = document.createElement('span');
    const has = won.includes(tr.id);
    cup.textContent = tr.icon;
    cup.className = has ? 'won' : '';
    cup.title = has ? t(tr.name) : `${t(tr.name)} : ${t(tr.hint)}`;
    shelf.appendChild(cup);
  }
  body.appendChild(shelf);

  // Album : les photos souvenir (menu de l'icône) ; un clic ouvre la photo en grand
  addSub(t('Album photo'));
  const album = document.createElement('div');
  album.className = 'album';
  for (const ph of [...(s.photos || [])].reverse()) {
    const img = document.createElement('img');
    img.src = ph.thumb;
    img.title = new Date(ph.at).toLocaleDateString(I18N.lang, { day: 'numeric', month: 'long', year: 'numeric' });
    img.addEventListener('click', () => desk.openPhoto(ph.file));
    album.appendChild(img);
  }
  if (!(s.photos || []).length) album.textContent = t('Pas encore de photo : « Prendre une photo 📸 » dans le menu de l\'icône.');
  body.appendChild(album);

  if (friends.length) {
    const sub = document.createElement('div');
    sub.className = 'journal-sub';
    sub.textContent = t('Amis');
    body.appendChild(sub);
    for (const f of friends) {
      const hearts = f.level === 'meilleurs amis' ? '💞' : f.level === 'copains' ? '💗' : '🤍';
      addRow(hearts + ' ' + (f.name || t('Œuf')), f.level);
    }
  }

  if (s.memorials.length) {
    const sub = document.createElement('div');
    sub.className = 'journal-sub';
    const best = s.memorials.reduce((m, x) => (x.hours > m.hours ? x : m));
    sub.textContent = t('Souvenirs (record : {name}, {age})', { name: best.name, age: Pet.ageFromHours(best.hours) });
    body.appendChild(sub);
    for (const m of s.memorials.slice(-4).reverse()) addRow((SPECIES_EMOJI[m.species] || '') + ' ' + m.name, Pet.ageFromHours(m.hours));
  }
  openModal('modal-journal');
}

$('set-journal').addEventListener('click', openJournal);
