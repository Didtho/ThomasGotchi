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
