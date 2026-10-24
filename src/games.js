// Mini-jeux et carnet de vie. S'appuie sur les fonctions de app.js (state, say, play, save, openModal…).

const SPECIES_EMOJI = { chat: '🐱', lapin: '🐰', ours: '🐻' };

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
    buildTricks();
    openModal('modal-games');
  },
};

// Boutons des tours : ceux qu'il connaît, et ceux qui restent à apprendre (grisés, avec l'astuce)
function buildTricks() {
  const box = $('trick-list');
  box.innerHTML = '';
  for (const t of Pet.TRICKS) {
    const b = document.createElement('button');
    const known = (state.tricks || []).includes(t.id);
    b.textContent = t.icon + ' ' + t.name;
    b.disabled = !known;
    b.title = known ? 'Faire ce tour' : 'À apprendre : ' + t.hint;
    b.addEventListener('click', () => {
      const r = Pet.doTrick(state, t.id);
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
    $('catch-time').textContent = left + ' s';
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
      ? `Bravo, ${score} friandises ! ${state.name} est ${Pet.g(state, 'ravi', 'ravie')} 😋`
      : `${score} friandise${score > 1 ? 's' : ''}… Essaie d'en attraper 10 !`;
    $('catch-again').classList.remove('hidden');
    state.hunger = Math.min(100, state.hunger + Math.min(20, score));
    rewardGame(won, Math.min(30, 5 + score * 2));
  }

  $('catch-again').addEventListener('click', () => { if (canPlay()) start(); });

  function start() {
    clear();
    score = 0;
    $('catch-score').textContent = '0';
    $('catch-msg').textContent = 'Bouge la souris pour attraper les friandises. Évite les 💩 !';
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
    $('cups-title').textContent = `Où est ${Pet.g(state, 'caché', 'cachée')} ${state.name} ?`;
    $('cups-msg').textContent = `Regarde bien sous quel gobelet ${Pet.g(state, 'il', 'elle')} se cache…`;
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
    $('cups-msg').textContent = 'À toi ! Clique sur le bon gobelet.';
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
    $('cups-msg').textContent = won ? `Trouvé ! ${state.name} est ${Pet.g(state, 'tout content', 'toute contente')} 🎉` : `Raté ! ${Pet.g(state, 'Il', 'Elle')} était là…`;
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
  $('journal-title').textContent = `Carnet de ${s.name}`;
  const fav = Pet.favoriteFood(s);
  const rows = [
    ['Âge', Pet.ageText(s)],
    ['Fichiers mangés', s.meals],
    ['Plat préféré', fav || '—'],
    ['Câlins reçus', s.stats.hugs],
    ['Crottes ramassées', s.stats.poopsCleaned],
    ['Mini-jeux gagnés', s.stats.gamesWon],
    ['Accessoires', `${s.unlocked.length} / ${Pet.ACCESSORIES.length}`],
  ];
  const body = $('journal-body');
  body.innerHTML = '';
  const addRow = (label, value) => {
    const row = document.createElement('div');
    row.className = 'journal-row';
    const a = document.createElement('span');
    a.textContent = label;
    const b = document.createElement('b');
    b.textContent = value;
    row.append(a, b);
    body.appendChild(row);
  };
  rows.forEach(([l, v]) => addRow(l, v));

  // Prochain accessoire à gagner
  const next = Pet.ACCESSORIES.find((a) => !s.unlocked.includes(a.id));
  if (next) addRow('Prochain cadeau', `${next.icon} ${next.hint}`);

  if (friends.length) {
    const sub = document.createElement('div');
    sub.className = 'journal-sub';
    sub.textContent = 'Amis';
    body.appendChild(sub);
    for (const f of friends) {
      const hearts = f.level === 'meilleurs amis' ? '💞' : f.level === 'copains' ? '💗' : '🤍';
      addRow(`${hearts} ${f.name || 'Œuf'}`, f.level);
    }
  }

  if (s.memorials.length) {
    const sub = document.createElement('div');
    sub.className = 'journal-sub';
    const best = s.memorials.reduce((m, x) => (x.hours > m.hours ? x : m));
    sub.textContent = `Souvenirs (record : ${best.name}, ${best.age})`;
    body.appendChild(sub);
    for (const m of s.memorials.slice(-4).reverse()) addRow(`${SPECIES_EMOJI[m.species] || ''} ${m.name}`, m.age);
  }
  openModal('modal-journal');
}

$('set-journal').addEventListener('click', openJournal);
