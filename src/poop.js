// Une crotte posée sur le bureau. Un clic la nettoie.

const INK = '#3b2a3a';
const params = new URLSearchParams(location.search);
const pixel = params.get('style') === 'pixel';
const kind = params.get('kind') || 'poop'; // 'poop' (crotte) ou 'pee' (flaque)
const edge = params.get('edge'); // pipi contre le bord de l'écran : coulure verticale
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const scale = pixel ? 0.5 : 1; // en rétro, on dessine en basse résolution puis on agrandit
if (pixel) {
  canvas.width = 28;
  canvas.height = 28;
  canvas.classList.add('pixel');
}

let cleanedAt = 0;

function ellipse(x, y, rx, ry, fill, stroke, lw = 2) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function draw(now) {
  const t = now / 1000;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, 56, 56);

  if (cleanedAt) {
    // Petites étincelles pendant le nettoyage, puis la crotte disparaît
    const k = (now - cleanedAt) / 450;
    ctx.globalAlpha = Math.max(0, 1 - k);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + k * 2;
      const x = 28 + Math.cos(a) * (8 + k * 16), y = 34 + Math.sin(a) * (6 + k * 12);
      ctx.fillStyle = '#ffd84a';
      ctx.fillRect(x - 1.5, y - 5, 3, 10);
      ctx.fillRect(x - 5, y - 1.5, 10, 3);
    }
    ctx.globalAlpha = 1;
    if (k >= 1) { window.poop.clean(); return; }
    requestAnimationFrame(draw);
    return;
  }

  if (kind === 'gift' || kind === 'egg') {
    if (kind === 'gift') drawGift(t); else drawEgg(t);
    setTimeout(() => requestAnimationFrame(draw), 60);
    return;
  }
  if (kind === 'pee') {
    drawPuddle(t);
    setTimeout(() => requestAnimationFrame(draw), 120);
    return;
  }
  ellipse(28, 53, 15, 3, 'rgba(0,0,0,.15)');
  for (const [dy, w] of [[0, 14], [-9, 10.5], [-17, 7]]) ellipse(28, 47 + dy, w, 6, '#9a6a43', INK, 2.2);
  ellipse(23, 38, 2.5, 1.6, 'rgba(255,255,255,.45)');

  // Lignes d'odeur
  ctx.strokeStyle = 'rgba(110,140,60,.85)';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  for (let k = -1; k <= 1; k++) {
    const ox = 28 + k * 8, oy = 10 - ((t * 10 + (k + 1) * 4) % 10);
    ctx.globalAlpha = Math.min(1, (oy + 2) / 6);
    ctx.beginPath();
    ctx.moveTo(ox, oy + 8);
    ctx.quadraticCurveTo(ox + 4, oy + 4, ox, oy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  setTimeout(() => requestAnimationFrame(draw), 60); // animation lente : quasiment rien pour le processeur
}

// Flaque jaune ; contre le bord de l'écran, avec une coulure le long du bord
function drawPuddle(t) {
  if (edge) {
    const x = edge === 'left' ? 9 : 47;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(232,196,70,.85)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, 14);
    ctx.quadraticCurveTo(x + (edge === 'left' ? 3 : -3), 32, x, 48);
    ctx.stroke();
  }
  const cx = edge === 'left' ? 22 : edge === 'right' ? 34 : 28;
  ellipse(cx, 49, 22, 6.5, 'rgba(244,215,94,.88)', '#c9a530', 1.8);
  ellipse(cx + 9, 50, 7, 3, 'rgba(244,215,94,.88)');
  // Reflet qui scintille
  ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.3;
  ellipse(cx - 8, 47.5, 5, 1.4, '#fffbe0');
  ctx.globalAlpha = 1;
}

// Paquet cadeau qui sautille pour attirer l'attention
function drawGift(t) {
  const hop = Math.abs(Math.sin(t * 3)) * 4;
  const y = 50 - hop;
  ellipse(28, 53, 15, 3, 'rgba(0,0,0,.15)');
  ctx.fillStyle = '#e8455d';
  ctx.fillRect(12, y - 24, 32, 24);
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.strokeRect(12, y - 24, 32, 24);
  ctx.fillStyle = '#ffd84a';
  ctx.fillRect(25, y - 24, 6, 24);
  ctx.fillRect(10, y - 30, 36, 7);
  ctx.strokeRect(10, y - 30, 36, 7);
  ellipse(23, y - 34, 6, 4, '#ffd84a', INK, 1.8);
  ellipse(33, y - 34, 6, 4, '#ffd84a', INK, 1.8);
}

// Œuf en chocolat emballé, qui brille un peu
function drawEgg(t) {
  ellipse(28, 53, 11, 2.5, 'rgba(0,0,0,.15)');
  ellipse(28, 38, 12, 15, '#8a5a3c', INK, 2);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(28, 38, 12, 15, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = ['#ff9fc6', '#9fe3bd', '#ffe17a', '#a9d4ff'][Math.floor(t / 4) % 4];
  ctx.fillRect(14, 34, 28, 7);
  ctx.restore();
  ctx.globalAlpha = 0.5 + Math.sin(t * 4) * 0.4;
  ellipse(23, 31, 3, 4, '#fff');
  ctx.globalAlpha = 1;
}

canvas.addEventListener('click', () => {
  if (!cleanedAt) cleanedAt = performance.now();
});

requestAnimationFrame(draw);
