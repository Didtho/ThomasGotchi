// Animaux du site dessinés en direct avec le moteur de l'application (site/engine, copié par « npm run site-assets ») :
// ils respirent et clignent des yeux ; un clic joue leur cri et une petite animation propre à leur caractère.
// Comme dans l'application, le site se met aux couleurs des fêtes : bannière, couleurs et accessoire de saison.
(() => {
  if (typeof Draw === 'undefined' || typeof Pet === 'undefined') return;
  I18N.lang = document.documentElement.lang || 'fr';
  const CARD = { x: 30, y: 100, w: 180, h: 200 }; // cartes de la liste (même cadre que les images, scripts/render.js)
  const HERO = { x: 44, y: 100, w: 152, h: 200 }; // chats du haut de page : même largeur que leur image, plus de place au-dessus

  // ---- Fête du moment (calendrier de l'application, src/seasons.js) ----
  // Aperçu d'une autre date : ?date=2026-12-25T19:00 (pour voir le site d'une fête sans attendre)
  const asked = new Date(new URLSearchParams(location.search).get('date') || NaN);
  const today = isNaN(asked) ? new Date() : asked;
  // Pays du visiteur d'après son navigateur (« fr-FR » → FR), sinon celui de la langue de la page
  const country = ((navigator.language || '').split('-')[1] || { fr: 'FR', en: 'US', es: 'ES', it: 'IT' }[I18N.lang] || 'FR').toUpperCase();
  const fete = typeof Seasons !== 'undefined' ? Seasons.current(today, country) : null;
  const FETE_ACCESSORY = { halloween: 'sorciere', noel: 'noel', nouvelan: 'fete', magie: 'magicien', paques: 'fleur' };
  // Partagé avec la démo jouable (demo.js) : son compagnon porte aussi l'accessoire de la fête
  window.TG_FETE = fete ? { accessory: FETE_ACCESSORY[fete.id] || null, magic: !!fete.magic } : {};
  if (fete) {
    document.body.classList.add('fete-' + fete.id);
    const banner = document.querySelector('.fete-banner');
    if (banner) { banner.textContent = t(fete.greeting); banner.hidden = false; }
  }

  // ---- Petits éléments de fête qui passent sur la page (sur une couche qui laisse passer les clics) ----
  // Chaque élément i a des réglages fixes tirés de son numéro ; sa position ne dépend que du temps.
  const rand = (i, k = 1) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const crossing = (i, t, W, H, speed) => { // traverse l'écran de gauche à droite (ou l'inverse), en vague
    const span = W + 200, dir = i % 2 ? -1 : 1;
    const k = ((t * speed * (1 + i * 0.3)) / span + rand(i)) % 1;
    return [dir > 0 ? -100 + k * span : W + 100 - k * span, H * (0.15 + 0.22 * (i % 3)) + Math.sin(t * 1.6 + i * 2) * 28, dir];
  };
  const falling = (i, t, W, H, speed) => { // tombe doucement en se balançant
    const y = ((t * speed * (0.7 + rand(i, 2) * 0.6) + rand(i, 3) * (H + 40)) % (H + 40)) - 20;
    return [rand(i) * W + Math.sin(t * 0.8 + i) * 20, y];
  };
  const rising = (i, t, W, H, speed) => { // monte en s'effaçant vers le haut
    const y = H + 20 - ((t * speed * (0.7 + rand(i, 2) * 0.6) + rand(i, 3) * (H + 40)) % (H + 40));
    return [rand(i) * W + Math.sin(t + i) * 15, y, Math.min(1, y / (H * 0.4))];
  };
  function heart(ctx, x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.45, y - s, x, y - s * 0.45);
    ctx.bezierCurveTo(x + s * 0.45, y - s, x + s, y - s * 0.4, x, y + s * 0.35);
    ctx.fill();
  }
  function star(ctx, x, y, s, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x - s * 0.15, y - s, s * 0.3, s * 2);
    ctx.fillRect(x - s, y - s * 0.15, s * 2, s * 0.3);
  }
  const COLORS = ['#ffd84a', '#ff6f91', '#6fd3ff', '#9fe3bd', '#cdb8ff'];
  const FETE_LAYERS = {
    // Halloween : chauves-souris (même dessin que dans l'application)
    halloween: { n: 3, draw(ctx, i, t, W, H) {
      const [x, y] = crossing(i, t, W, H, 55);
      const flap = Math.sin(t * 14 + i) * 5, s = 1.6 - (i % 3) * 0.2;
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = '#2b1d33';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-7, -6 - flap, -14, -flap);
      ctx.quadraticCurveTo(-8, 1, 0, 3);
      ctx.quadraticCurveTo(8, 1, 14, -flap);
      ctx.quadraticCurveTo(7, -6 - flap, 0, 0);
      ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 1, 3, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } },
    // Noël : flocons bleutés (des flocons blancs ne se verraient pas sur le fond clair)
    noel: { n: 16, draw(ctx, i, t, W, H) {
      const [x, y] = falling(i, t, W, H, 30);
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = '#9db8de';
      ctx.font = `${12 + rand(i, 4) * 10}px sans-serif`;
      ctx.fillText('❄', x, y);
    } },
    // Soirée magique : étoiles dorées qui scintillent
    magie: { n: 14, draw(ctx, i, t, W, H) {
      ctx.globalAlpha = Math.max(0, Math.sin(t * 1.5 + i * 1.7));
      star(ctx, rand(i) * W, rand(i, 2) * H, 5 + rand(i, 3) * 5, '#f2c230');
    } },
    // Nouvel An : confettis
    nouvelan: { n: 26, draw(ctx, i, t, W, H) {
      const [x, y] = falling(i, t, W, H, 60);
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 3 + i);
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fillRect(-4, -2, 8, 4);
      ctx.restore();
    } },
    // Saint-Valentin et fêtes de la famille : cœurs qui montent
    hearts: { n: 9, draw(ctx, i, t, W, H) {
      const [x, y, a] = rising(i, t, W, H, 35);
      ctx.globalAlpha = 0.7 * a;
      heart(ctx, x, y, 8 + rand(i, 4) * 6, i % 2 ? '#ff6f91' : '#ff9fc6');
    } },
    // Pâques : pétales pastel qui tombent
    paques: { n: 14, draw(ctx, i, t, W, H) {
      const [x, y] = falling(i, t, W, H, 35);
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2 + i));
      ctx.fillStyle = ['#ffb3cf', '#fff1a8', '#b9e8c9', '#d6c8ff'][i % 4];
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } },
    // Chandeleur : crêpes qui tombent en tournoyant
    chandeleur: { n: 6, draw(ctx, i, t, W, H) {
      const [x, y] = falling(i, t, W, H, 40);
      const flip = Math.abs(Math.cos(t * 2 + i));
      ctx.fillStyle = '#f3c06b';
      ctx.strokeStyle = '#3b2a3a';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(x, y, 14, 2 + flip * 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } },
    // 1er avril : poissons qui traversent l'écran
    poisson: { n: 3, draw(ctx, i, t, W, H) {
      const [x, y, dir] = crossing(i, t, W, H, 50);
      ctx.save(); ctx.translate(x, y); ctx.scale(-dir, 1);
      ctx.fillStyle = '#7fd1ff'; ctx.strokeStyle = '#3b2a3a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(23, -8 + Math.sin(t * 8) * 2); ctx.lineTo(23, 8 + Math.sin(t * 8) * 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3b2a3a'; ctx.beginPath(); ctx.arc(-6, -2, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } },
    // Fête de la musique : notes qui montent
    musique: { n: 10, draw(ctx, i, t, W, H) {
      const [x, y, a] = rising(i, t, W, H, 40);
      ctx.globalAlpha = 0.8 * a;
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.font = `bold ${18 + rand(i, 4) * 10}px sans-serif`;
      ctx.fillText(i % 2 ? '♫' : '♪', x, y);
    } },
    // Journée du chat : empreintes de pattes qui apparaissent et s'effacent
    chat: { n: 10, draw(ctx, i, t, W, H) {
      ctx.globalAlpha = Math.max(0, Math.sin(t * 0.8 + i * 1.3)) * 0.35;
      ctx.font = `${20 + rand(i, 4) * 10}px sans-serif`;
      ctx.fillText('🐾', rand(i) * W, rand(i, 2) * H);
    } },
  };
  // Thanksgiving : feuilles d'automne qui tombent en tournoyant
  FETE_LAYERS.thanksgiving = { n: 14, draw(ctx, i, t, W, H) {
    const [x, y] = falling(i, t, W, H, 35);
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 1.5 + i);
    ctx.fillStyle = ['#e8743a', '#c9452f', '#e8b13a'][i % 3];
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } };
  // Saint-Patrick : trèfles qui tombent
  FETE_LAYERS.stpatrick = { n: 12, draw(ctx, i, t, W, H) {
    const [x, y] = falling(i, t, W, H, 30);
    for (let j = 0; j < 3; j++) {
      const a = -Math.PI / 2 + j * (Math.PI * 2 / 3) + t * 0.5 + i;
      heart(ctx, x + Math.cos(a) * 5, y + Math.sin(a) * 5, 6, '#3fa560');
    }
  } };
  // Fêtes nationales : petits feux d'artifice qui éclatent à tour de rôle
  FETE_LAYERS.fireworks = { n: 5, draw(ctx, i, t, W, H) {
    const cycle = 2.6, phase = ((t + i * 0.9) % cycle) / cycle;
    const seed = Math.floor((t + i * 0.9) / cycle) * 7 + i;
    const cx = rand(seed) * W, cy = 60 + rand(seed, 2) * H * 0.45;
    ctx.globalAlpha = Math.max(0, 1 - phase);
    ctx.fillStyle = COLORS[seed % COLORS.length];
    for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6, r = phase * 45;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  } };
  for (const id of ['valentin', 'grandsmeres', 'meres', 'peres', 'grandsperes', 'grandsparents']) FETE_LAYERS[id] = FETE_LAYERS.hearts;
  for (const id of ['independance', 'canada', 'nationale', 'bonfire']) FETE_LAYERS[id] = FETE_LAYERS.fireworks;
  for (const id of ['rois', 'befana', 'ferragosto']) FETE_LAYERS[id] = FETE_LAYERS.nouvelan;
  FETE_LAYERS.pancake = FETE_LAYERS.chandeleur;
  FETE_LAYERS.inocentes = FETE_LAYERS.poisson;
  if (fete && FETE_LAYERS[fete.id] && !matchMedia('(prefers-reduced-motion: reduce)').matches) startFeteLayer(FETE_LAYERS[fete.id]);

  function startFeteLayer(kind) {
    const layer = document.createElement('canvas');
    layer.className = 'fete-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    const ctx = layer.getContext('2d');
    let last = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      if (now - last < 33) return;
      last = now;
      const dpr = window.devicePixelRatio || 1;
      const W = innerWidth, H = innerHeight;
      if (layer.width !== Math.round(W * dpr) || layer.height !== Math.round(H * dpr)) {
        layer.width = Math.round(W * dpr);
        layer.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const t = now / 1000;
      for (let i = 0; i < kind.n; i++) {
        ctx.globalAlpha = 1;
        kind.draw(ctx, i, t, W, H);
      }
      ctx.globalAlpha = 1;
    }
    requestAnimationFrame(frame);
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

  // Cri et animation selon le caractère : flamme du dragon, envol de l'oiseau, bonds du lapin, danse de la licorne…
  function react(item) {
    const tr = Pet.TRAITS[item.species] || {};
    item.anim = tr.flame ? 'love' : tr.fly ? 'fly' : tr.hop ? 'hop' : tr.showOff ? 'dance' : (item.toggle = !item.toggle) ? 'jump' : 'love';
    item.dur = { love: 1.4, fly: 1.8, hop: 1.6, dance: 2, jump: 0.9 }[item.anim];
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
    const flying = anim === 'fly';
    const coat = Pet.COATS[item.colorKey] || null;
    item.ctx.setTransform(scale, 0, 0, scale, -crop.x * scale, -crop.y * scale);
    Draw.render(item.ctx, {
      stage: 'adult', species, mood: 'happy',
      eyes: anim && !hopping && !flying ? 'joy' : (t % 4.3) < 0.13 ? 'closed' : 'open',
      mouth: anim ? 'open' : 'smile',
      color: Pet.COLORS[item.colorKey] || item.colorKey, coat, dark: !!(coat && coat.dark), care: 0, style: 'cute',
      t, anim: hopping || flying ? null : anim, animT, facing: 0, lookX: null, lookY: 0.15,
      walking: hopping, hop: hopping, flying, flame: !!tr.flame && anim === 'love',
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
