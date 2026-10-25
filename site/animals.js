// Animaux du site dessinés en direct avec le moteur de l'application (site/engine, copié par « npm run site-assets ») :
// ils respirent et clignent des yeux ; un clic joue leur cri et une petite animation propre à leur caractère.
(() => {
  if (typeof Draw === 'undefined' || typeof Pet === 'undefined') return;
  const CARD = { x: 30, y: 100, w: 180, h: 200 }; // même cadre que les images (scripts/render.js)
  const cards = [...document.querySelectorAll('.animal[data-species]')];
  const visible = new Set();

  for (const card of cards) {
    const img = card.querySelector('img');
    const canvas = document.createElement('canvas');
    canvas.className = 'live';
    canvas.setAttribute('aria-hidden', 'true');
    card.insertBefore(canvas, img);
    card.live = { canvas, ctx: canvas.getContext('2d'), img, phase: Math.random() * 10, anim: null, start: 0, dur: 0 };
    card.addEventListener('click', () => react(card));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); react(card); } });
  }

  // Seuls les animaux visibles à l'écran sont dessinés
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target);
  });
  cards.forEach((c) => io.observe(c));

  // Cri et animation selon le caractère : flamme du dragon, bonds du lapin, danse de la licorne…
  function react(card) {
    const species = card.dataset.species;
    const tr = Pet.TRAITS[species] || {};
    const L = card.live;
    L.anim = tr.flame ? 'love' : tr.hop ? 'hop' : tr.showOff ? 'dance' : (L.toggle = !L.toggle) ? 'jump' : 'love';
    L.dur = { love: 1.4, hop: 1.6, dance: 2, jump: 0.9 }[L.anim];
    L.start = performance.now();
    try { Sound.play('voice', species); } catch { /* pas de son possible */ }
  }

  function draw(card, now) {
    const L = card.live;
    const species = card.dataset.species;
    const tr = Pet.TRAITS[species] || {};
    // Taille réelle de la carte à l'écran, pour un dessin net
    const cssW = (card.classList.contains('is-live') ? L.canvas.clientWidth : L.img.clientWidth) || CARD.w;
    const scale = Math.max(1, cssW * (window.devicePixelRatio || 1) / CARD.w);
    const w = Math.round(CARD.w * scale), h = Math.round(CARD.h * scale);
    if (L.canvas.width !== w || L.canvas.height !== h) { L.canvas.width = w; L.canvas.height = h; }
    let anim = null, animT = 0;
    if (L.start) {
      animT = (now - L.start) / 1000;
      if (animT > L.dur) L.start = 0; else anim = L.anim;
    }
    const t = now / 1000 + L.phase;
    const hopping = anim === 'hop';
    L.ctx.setTransform(scale, 0, 0, scale, -CARD.x * scale, -CARD.y * scale);
    Draw.render(L.ctx, {
      stage: 'adult', species, mood: 'happy',
      eyes: anim && !hopping ? 'joy' : (t % 4.3) < 0.13 ? 'closed' : 'open',
      mouth: anim ? 'open' : 'smile',
      color: card.dataset.color, coat: null, dark: false, care: 0, style: 'cute',
      t, anim: hopping ? null : anim, animT, facing: 0, lookX: null, lookY: 0.15,
      walking: hopping, hop: hopping, flame: !!tr.flame && anim === 'love', accessory: null,
    });
    if (!card.classList.contains('is-live')) card.classList.add('is-live');
  }

  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (now - last < 40) return; // ~25 images/s suffisent
    last = now;
    for (const card of visible) draw(card, now);
  }
  requestAnimationFrame(frame);
})();
