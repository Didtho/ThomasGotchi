// Animaux du site dessinés en direct avec le moteur de l'application (site/engine, copié par « npm run site-assets ») :
// ils respirent et clignent des yeux ; un clic joue leur cri et une petite animation propre à leur caractère.
// Comme dans l'application, le site se met aux couleurs des fêtes : bannière, couleurs et accessoire de saison.
(() => {
  if (typeof Draw === 'undefined' || typeof Pet === 'undefined') return;
  I18N.lang = document.documentElement.lang || 'fr';
  const CARD = { x: 30, y: 100, w: 180, h: 200 }; // cartes de la liste (même cadre que les images, scripts/render.js)
  const HERO = { x: 44, y: 100, w: 152, h: 200 }; // chats du haut de page : même largeur que leur image, plus de place au-dessus

  // ---- Fête du moment (calendrier de l'application, src/seasons.js) ----
  const fete = typeof Seasons !== 'undefined' ? Seasons.current(new Date()) : null;
  const FETE_ACCESSORY = { halloween: 'sorciere', noel: 'noel', nouvelan: 'fete', magie: 'magicien', paques: 'fleur' };
  if (fete) {
    document.body.classList.add('fete-' + fete.id);
    const banner = document.querySelector('.fete-banner');
    if (banner) { banner.textContent = t(fete.greeting); banner.hidden = false; }
    if (fete.id === 'halloween' && !matchMedia('(prefers-reduced-motion: reduce)').matches) startBats();
  }

  // Halloween : trois chauves-souris (même dessin que dans l'application) traversent l'écran en volant en vague,
  // sur une couche qui laisse passer les clics
  function startBats() {
    const layer = document.createElement('canvas');
    layer.className = 'bats';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    const ctx = layer.getContext('2d');
    // Chacune a sa hauteur, sa vitesse et son sens ; elle repart d'un bord après avoir traversé
    const bats = [0, 1, 2].map((i) => ({ y: 0.15 + i * 0.22, speed: 55 + i * 18, dir: i % 2 ? -1 : 1, offset: i * 0.37, size: 1.6 - i * 0.2 }));
    function bat(x, y, flap, s) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.fillStyle = '#2b1d33';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-7, -6 - flap, -14, -flap);
      ctx.quadraticCurveTo(-8, 1, 0, 3);
      ctx.quadraticCurveTo(8, 1, 14, -flap);
      ctx.quadraticCurveTo(7, -6 - flap, 0, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 1, 3, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    let lastBat = 0;
    function fly(now) {
      requestAnimationFrame(fly);
      if (now - lastBat < 33) return;
      lastBat = now;
      const dpr = window.devicePixelRatio || 1;
      const W = innerWidth, H = innerHeight;
      if (layer.width !== Math.round(W * dpr) || layer.height !== Math.round(H * dpr)) {
        layer.width = Math.round(W * dpr);
        layer.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const t = now / 1000;
      for (const [i, b] of bats.entries()) {
        const span = W + 200;
        const k = ((t * b.speed) / span + b.offset) % 1; // position le long de la traversée
        const x = b.dir > 0 ? -100 + k * span : W + 100 - k * span;
        const y = H * b.y + Math.sin(t * 1.6 + i * 2) * 28 + Math.sin(t * 4 + i) * 6;
        bat(x, y, Math.sin(t * 14 + i) * 5, b.size);
      }
    }
    requestAnimationFrame(fly);
  }

  // Animaux dessinés en direct : cartes de la liste, et chats du haut de page (qui remplacent leur image)
  const items = [];
  for (const el of document.querySelectorAll('.animal[data-species], img.pet[data-species]')) {
    const hero = el.tagName === 'IMG';
    const img = hero ? el : el.querySelector('img');
    const canvas = document.createElement('canvas');
    canvas.className = hero ? el.className + ' live' : 'live';
    canvas.setAttribute('aria-hidden', 'true');
    img.parentNode.insertBefore(canvas, img);
    const item = { el, hero, img, canvas, ctx: canvas.getContext('2d'), crop: hero ? HERO : CARD,
      species: el.dataset.species, colorKey: el.dataset.color, phase: Math.random() * 10, anim: null, start: 0, dur: 0 };
    items.push(item);
    const target = hero ? canvas : el;
    target.addEventListener('click', () => react(item));
    if (!hero) el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); react(item); } });
  }

  // Seuls les animaux visibles à l'écran sont dessinés
  const visible = new Set();
  // (les chats du haut de page partagent leur cadre : on surveille ce cadre pour les trois)
  items.forEach((i) => { i.watch = i.hero ? i.img.parentNode : i.el; });
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      for (const item of items.filter((i) => i.watch === e.target)) {
        if (e.isIntersecting) visible.add(item); else visible.delete(item);
      }
    }
  });
  new Set(items.map((i) => i.watch)).forEach((el) => io.observe(el));

  // Cri et animation selon le caractère : flamme du dragon, bonds du lapin, danse de la licorne…
  function react(item) {
    const tr = Pet.TRAITS[item.species] || {};
    item.anim = tr.flame ? 'love' : tr.hop ? 'hop' : tr.showOff ? 'dance' : (item.toggle = !item.toggle) ? 'jump' : 'love';
    item.dur = { love: 1.4, hop: 1.6, dance: 2, jump: 0.9 }[item.anim];
    item.start = performance.now();
    try { Sound.play('voice', item.species); } catch { /* pas de son possible */ }
  }

  function draw(item, now) {
    const { crop, species } = item;
    const tr = Pet.TRAITS[species] || {};
    const live = item.canvas.style.display === 'block';
    // Taille réelle à l'écran, pour un dessin net
    const cssW = (live ? item.canvas.clientWidth : item.img.clientWidth) || crop.w;
    const scale = Math.max(1, cssW * (window.devicePixelRatio || 1) / crop.w);
    const w = Math.round(crop.w * scale), h = Math.round(crop.h * scale);
    if (item.canvas.width !== w || item.canvas.height !== h) { item.canvas.width = w; item.canvas.height = h; }
    let anim = null, animT = 0;
    if (item.start) {
      animT = (now - item.start) / 1000;
      if (animT > item.dur) item.start = 0; else anim = item.anim;
    }
    const t = now / 1000 + item.phase;
    const hopping = anim === 'hop';
    const coat = Pet.COATS[item.colorKey] || null;
    item.ctx.setTransform(scale, 0, 0, scale, -crop.x * scale, -crop.y * scale);
    Draw.render(item.ctx, {
      stage: 'adult', species, mood: 'happy',
      eyes: anim && !hopping ? 'joy' : (t % 4.3) < 0.13 ? 'closed' : 'open',
      mouth: anim ? 'open' : 'smile',
      color: Pet.COLORS[item.colorKey] || item.colorKey, coat, dark: !!(coat && coat.dark), care: 0, style: 'cute',
      t, anim: hopping ? null : anim, animT, facing: 0, lookX: null, lookY: 0.15,
      walking: hopping, hop: hopping, flame: !!tr.flame && anim === 'love',
      accessory: fete ? FETE_ACCESSORY[fete.id] || null : null, magic: !!(fete && fete.magic),
    });
    if (!live) { item.canvas.style.display = 'block'; item.img.style.display = 'none'; }
  }

  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (now - last < 40) return; // ~25 images/s suffisent
    last = now;
    for (const item of visible) draw(item, now);
  }
  requestAnimationFrame(frame);
})();
