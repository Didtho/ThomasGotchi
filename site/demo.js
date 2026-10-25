// Démo jouable du site : un vrai compagnon (logique et dessin de l'application, dans site/engine) qu'on peut
// nourrir avec un fichier, caresser, faire boire, faire jouer et laver. Les fichiers ne quittent pas l'ordinateur :
// seuls leur nom et leur taille sont lus. Le temps passe plus vite que dans l'application pour voir les jauges bouger.
(() => {
  const canvas = document.getElementById('demo-canvas');
  if (!canvas || typeof Pet === 'undefined' || typeof Draw === 'undefined') return;
  const stage = document.getElementById('demo-stage');
  const bubble = document.querySelector('.demo-bubble');
  const ctx = canvas.getContext('2d');
  const CROP = { x: 20, y: 80, w: 200, h: 220 };
  const SPEED = 0.15; // heures de jeu écoulées par seconde réelle

  const state = Pet.create('Simba', 'cute', 'simba', 'chat');
  state.hatchAt = Date.now() - 10 * 86400000; // déjà adulte
  Object.assign(state, { hunger: 55, thirst: 50, fun: 60, clean: 70, energy: 90 });
  let anim = null, animStart = 0, animDur = 0, bubbleUntil = 0;
  const fete = window.TG_FETE || {};

  function say(text, ms = 3000) {
    bubble.textContent = t(text);
    bubble.hidden = false;
    bubbleUntil = performance.now() + ms;
  }
  function play(name, dur) {
    anim = name;
    animStart = performance.now();
    animDur = dur || 1400;
    try { Sound.play(name, state.species); } catch { /* pas de son */ }
  }
  // Résultat d'une action de l'application : message, animation, jauges
  function apply(r) {
    if (r.msg) say(r.msg);
    if (r.ok && r.anim) play(r.anim, 1600);
    updateBars();
  }

  // Nourriture : fichiers glissés sur lui ou choisis avec le bouton
  function eat(files) {
    [...files].slice(0, 3).forEach((f, i) => setTimeout(() => apply(Pet.feed(state, { name: f.name, size: f.size, isDir: false })), i * 1800));
  }
  stage.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; stage.classList.add('drop'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('drop'));
  stage.addEventListener('drop', (e) => { e.preventDefault(); stage.classList.remove('drop'); eat(e.dataTransfer.files); });
  const picker = document.getElementById('demo-file');
  picker.addEventListener('change', () => { eat(picker.files); picker.value = ''; });
  document.querySelector('[data-demo=feed]').addEventListener('click', () => picker.click());
  document.querySelector('[data-demo=drink]').addEventListener('click', () => apply(Pet.drink(state)));
  document.querySelector('[data-demo=play]').addEventListener('click', () => apply(Pet.play(state)));
  document.querySelector('[data-demo=wash]').addEventListener('click', () => apply(Pet.wash(state)));
  canvas.addEventListener('click', () => { const r = Pet.pet(state); if (r.ok) play('love', 1400); if (r.msg) say(r.msg); updateBars(); });

  const bars = { hunger: null, thirst: null, fun: null, clean: null };
  for (const k in bars) bars[k] = document.getElementById('demo-' + k);
  function updateBars() {
    for (const k in bars) {
      const v = Math.round(state[k]);
      bars[k].style.width = v + '%';
      bars[k].className = v < 25 ? 'low' : v < 50 ? 'mid' : '';
    }
  }

  // Le temps passe (en accéléré) : les jauges baissent, et il fait parfois ses besoins
  let lastTick = performance.now();
  setInterval(() => {
    const now = performance.now();
    const events = [];
    Pet.step(state, ((now - lastTick) / 1000) * SPEED, Date.now(), events);
    lastTick = now;
    state.energy = Math.max(state.energy, 60); // pas de sieste forcée pendant la démo
    state.sleeping = false;
    if (events.includes('poop') || events.includes('pee')) { state.poops = 0; state.clean = Math.max(0, state.clean - 15); say('Oups… 💩'); }
    updateBars();
  }, 1000);

  function draw(now) {
    requestAnimationFrame(draw);
    if (anim && now - animStart > animDur) anim = null;
    if (now > bubbleUntil) bubble.hidden = true;
    const dpr = window.devicePixelRatio || 1;
    const scale = (canvas.clientWidth || CROP.w) * dpr / CROP.w;
    const w = Math.round(CROP.w * scale), h = Math.round(CROP.h * scale);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const t = now / 1000, animT = anim ? (now - animStart) / 1000 : 0;
    const mood = Pet.mood(state);
    const need = state.thirst < 30 ? 'thirst' : state.hunger < 30 ? 'hunger' : null;
    const joy = ['play', 'love', 'jump', 'dance'].includes(anim);
    ctx.setTransform(scale, 0, 0, scale, -CROP.x * scale, -CROP.y * scale);
    Draw.render(ctx, {
      stage: 'adult', species: 'chat', mood, need,
      eyes: joy ? 'joy' : (t % 4.3) < 0.13 ? 'closed' : mood === 'sad' || mood === 'sick' ? 'sad' : 'open',
      mouth: anim === 'eat' ? (Math.sin(animT * 14) > 0 ? 'chomp' : 'flat') : joy ? 'open' : need ? 'flat' : 'smile',
      color: Pet.COLORS.simba, coat: Pet.COATS.simba, dark: false, care: state.care, style: 'cute',
      dirty: state.clean < 35, t, anim, animT, facing: 0, lookX: null, lookY: 0.15,
      accessory: fete.accessory || null, magic: !!fete.magic,
    });
  }
  updateBars();
  requestAnimationFrame(draw);
})();
