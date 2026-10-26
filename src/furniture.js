// Meubles posés en bas de l'écran : gamelle (croquettes + eau), panier pour dormir, plante à arroser.
// Clic : remplir la gamelle, arroser la plante. Glisser : le déplacer le long du bas de l'écran.

const INK = '#3b2a3a';
const kind = new URLSearchParams(location.search).get('kind'); // 'bowl', 'basket' ou 'plant'
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let data = { food: 100, water: 100, growth: 0 };
let wateredAt = -1e9; // dernier arrosage (pas de gouttes à l'ouverture)
let sparkleAt = 0;

// Toile à la densité de l'écran (zoom Windows, écran Retina) pour un dessin net ; on dessine en coordonnées de la fenêtre
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
// Changement d'écran ou de zoom pendant que la fenêtre est ouverte
const fitCanvas = () => { if (canvas.width !== Math.round(innerWidth * (window.devicePixelRatio || 1))) resize(); };
addEventListener('resize', resize);
resize();

function ellipse(x, y, rx, ry, fill, stroke, lw = 2) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

// Un bol vu de face : bord ovale, contenu dont le niveau varie
function bowl(cx, base, w, color, level, fill) {
  const top = base - 18;
  ctx.beginPath();
  ctx.moveTo(cx - w, top);
  ctx.quadraticCurveTo(cx - w * 0.9, base, cx - w * 0.6, base);
  ctx.lineTo(cx + w * 0.6, base);
  ctx.quadraticCurveTo(cx + w * 0.9, base, cx + w, top);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ellipse(cx, top, w, 5, shade(color), INK, 2);
  if (level > 0.02) fill(cx, top, w * 0.85, level);
}

function shade(c) {
  return c === '#6f8fe8' ? '#5776cf' : '#d6394f';
}

// Panier en osier avec son coussin : bas sur l'avant, pour qu'on voie bien l'animal couché dedans
function basket(W, base) {
  const cx = W / 2, rx = W / 2 - 8;
  // Dossier (arrière, plus haut)
  ctx.beginPath();
  ctx.moveTo(cx - rx, base - 12);
  ctx.quadraticCurveTo(cx - rx, base - 34, cx, base - 34);
  ctx.quadraticCurveTo(cx + rx, base - 34, cx + rx, base - 12);
  ctx.closePath();
  ctx.fillStyle = '#c98f52';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // Coussin
  ellipse(cx, base - 13, rx - 6, 8, '#ff9fc6', INK, 1.8);
  ellipse(cx - 10, base - 15, 10, 3, 'rgba(255,255,255,.45)');
  // Bord avant en osier tressé
  ctx.beginPath();
  ctx.moveTo(cx - rx - 2, base - 12);
  ctx.quadraticCurveTo(cx - rx, base, cx - rx + 10, base);
  ctx.lineTo(cx + rx - 10, base);
  ctx.quadraticCurveTo(cx + rx, base, cx + rx + 2, base - 12);
  ctx.quadraticCurveTo(cx, base - 6, cx - rx - 2, base - 12);
  ctx.fillStyle = '#d9a066';
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(59,42,58,.35)';
  ctx.lineWidth = 1.2;
  for (let x = cx - rx + 8; x < cx + rx - 4; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, base - 8);
    ctx.lineTo(x + 3, base - 1);
    ctx.stroke();
  }
}

// Arrosoir (k de 0 à 1) : il apparaît en haut à gauche, se penche, verse un filet de gouttes sur la terre, puis s'efface
const WATERING = 1600; // durée de l'arrosage (ms)
function wateringCan(k, cx, soilY) {
  const alpha = Math.min(1, k / 0.12, (1 - k) / 0.12);
  const tilt = 0.9 * Math.sin(Math.min(1, Math.max(0, (k - 0.1) / 0.25)) * Math.PI / 2) * (k > 0.8 ? (1 - k) / 0.2 : 1);
  const px = cx - 29, py = 22; // centre de l'arrosoir (le filet tombe sur la terre, à gauche de la tige)
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(px, py);
  ctx.rotate(tilt);
  // Bec, puis corps, anse et rebord
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(8, 2);
  ctx.lineTo(19, -7);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#5aa9e6';
  ctx.stroke();
  ellipse(20, -8, 3, 2, '#5aa9e6', INK, 1.5);
  ctx.beginPath();
  ctx.arc(-11, -1, 6, Math.PI * 0.5, Math.PI * 1.5);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-10, -7);
  ctx.lineTo(10, -7);
  ctx.lineTo(9, 9);
  ctx.lineTo(-9, 9);
  ctx.closePath();
  ctx.fillStyle = '#5aa9e6';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.fillRect(-6, -4, 3, 10);
  ctx.restore();
  ctx.lineCap = 'butt';
  // Filet de gouttes depuis le bout du bec jusqu'à la terre, pendant qu'il est penché
  if (k > 0.25 && k < 0.82) {
    const sx = px + Math.cos(tilt) * 21 - Math.sin(tilt) * -8, sy = py + Math.sin(tilt) * 21 + Math.cos(tilt) * -8;
    ctx.strokeStyle = 'rgba(90,170,255,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + 3, sy + 4, sx + 3, soilY);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const f = (performance.now() / 500 + i / 5) % 1;
      ellipse(sx + 1 + f * 2, sy + f * (soilY - sy), 2, 3, 'rgba(70,150,240,.95)', INK, 0.8);
    }
  }
}

// Plante en pot : elle grandit (data.growth de 0 à 4) et penche quand elle a soif
function plant(W, H, base, t) {
  const cx = W / 2;
  const g = data.growth || 0;
  const thirsty = data.water < 15;
  // Pot en terre cuite
  ctx.beginPath();
  ctx.moveTo(cx - 17, base - 26);
  ctx.lineTo(cx + 17, base - 26);
  ctx.lineTo(cx + 13, base);
  ctx.lineTo(cx - 13, base);
  ctx.closePath();
  ctx.fillStyle = '#d9774a';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = '#c4643a';
  ctx.fillRect(cx - 19, base - 30, 38, 7);
  ctx.strokeRect(cx - 19, base - 30, 38, 7);
  // Terre (plus foncée quand elle vient d'être arrosée)
  ellipse(cx, base - 30, 15, 2.5, data.water > 60 ? '#5a3a26' : '#8a6040');
  // Tige : sa hauteur suit la croissance ; elle se balance doucement, ou penche si elle a soif
  const top = base - 31;
  const height = 6 + Math.min(g, 4) * 9;
  const lean = thirsty ? 9 : Math.sin(t * 1.2) * 1.5;
  const tipX = cx + lean, tipY = top - height + (thirsty ? 4 : 0);
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.quadraticCurveTo(cx, top - height * 0.6, tipX, tipY);
  ctx.strokeStyle = '#3f8f3a';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Feuilles : une paire de plus à chaque cran
  const leafColor = thirsty ? '#a9b85a' : '#6cc04a';
  for (let i = 0; i < Math.min(3, Math.floor(g) + 1); i++) {
    const k = (i + 1) / 4;
    const lx = cx + lean * k * k, ly = top - height * k;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(side * (thirsty ? 1.3 : 0.9));
      ellipse(0, -6, 3.2, 6.5, leafColor, INK, 1.3);
      ctx.restore();
    }
  }
  // Bouton (cran 3), puis fleur épanouie (cran 4)
  if (g >= 4) {
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 + t * 0.2;
      ellipse(tipX + Math.cos(a) * 6, tipY + Math.sin(a) * 6, 4.5, 4.5, '#ff7fae', INK, 1.3);
    }
    ellipse(tipX, tipY, 4, 4, '#ffd84a', INK, 1.3);
  } else if (g >= 3) {
    ellipse(tipX, tipY - 2, 4, 5.5, '#ff9fc6', INK, 1.3);
  }
  // Juste après un clic : l'arrosoir arrive, se penche et verse
  const k = (performance.now() - wateredAt) / WATERING;
  if (k < 1) wateringCan(k, cx, base - 31);
  // Petite goutte qui clignote au-dessus quand elle a soif (discret)
  if (thirsty && Math.sin(t * 2) > 0) ellipse(cx + 17, top - height - 2, 3.5, 5, 'rgba(110,180,255,.9)', INK, 1.3);
}

function draw(now) {
  const t = now / 1000;
  fitCanvas();
  const W = innerWidth, H = innerHeight;
  ctx.clearRect(0, 0, W, H);
  const base = H - 8;
  ellipse(W / 2, base + 2, kind === 'plant' ? 22 : W / 2 - 6, 4, 'rgba(0,0,0,.15)');

  if (kind === 'bowl') {
    // Bol rouge de croquettes, bol bleu d'eau
    bowl(W * 0.3, base, 18, '#e8455d', data.food / 100, (cx, top, w, level) => {
      for (let i = 0; i < Math.ceil(level * 9); i++) {
        ellipse(cx - w * 0.7 + (i % 5) * w * 0.35, top - 1 - Math.floor(i / 5) * 3 + (i % 2), 3.2, 2.4, '#b9773d', INK, 1);
      }
    });
    bowl(W * 0.72, base, 16, '#6f8fe8', data.water / 100, (cx, top, w, level) => {
      ellipse(cx, top, w * level, 3.5 * level, `rgba(130,200,255,${0.6 + Math.sin(t * 3) * 0.15})`);
    });
  } else if (kind === 'basket') {
    basket(W, base);
  } else if (kind === 'plant') {
    plant(W, H, base, t);
  }

  // Étincelles après un remplissage
  const k = (now - sparkleAt) / 600;
  if (k < 1 && kind === 'bowl') {
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = '#ffd84a';
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + k * 2;
      const x = W / 2 + Math.cos(a) * (10 + k * 22), y = base - 18 + Math.sin(a) * (6 + k * 10);
      ctx.fillRect(x - 1.5, y - 5, 3, 10);
      ctx.fillRect(x - 5, y - 1.5, 10, 3);
    }
    ctx.globalAlpha = 1;
  }
  const busy = k < 1 || now - wateredAt < WATERING;
  setTimeout(() => requestAnimationFrame(draw), busy ? 16 : 120);
}
requestAnimationFrame(draw);

window.furn.onState((s) => {
  if (kind === 'bowl' && (s.food > data.food + 20 || s.water > data.water + 20)) sparkleAt = performance.now();
  data = s;
});

// Survol : bulle d'aide (affichée par main.js)
document.documentElement.addEventListener('mouseenter', () => window.furn.hover(true));
document.documentElement.addEventListener('mouseleave', () => window.furn.hover(false));

// Clic simple = remplir ; glisser = déplacer
let press = null;
addEventListener('mousedown', (e) => { press = { x: e.screenX, moved: false }; });
addEventListener('mousemove', (e) => {
  if (press && !press.moved && Math.abs(e.screenX - press.x) > 4) {
    press.moved = true;
    window.furn.dragStart();
  }
});
addEventListener('mouseup', () => {
  if (!press) return;
  if (press.moved) window.furn.dragEnd();
  else {
    window.furn.click();
    if (kind === 'plant') wateredAt = performance.now(); // l'arrosoir passe à chaque clic, même si elle a déjà de l'eau
  }
  press = null;
});
