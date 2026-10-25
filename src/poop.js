// Une crotte posée sur le bureau. Un clic la nettoie.

const INK = '#3b2a3a';
const params = new URLSearchParams(location.search);
const pixel = params.get('style') === 'pixel';
const kind = params.get('kind') || 'poop'; // 'poop' (crotte) ou 'pee' (flaque)
const edge = params.get('edge'); // pipi contre le bord de l'écran : coulure verticale
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
// En rétro, on dessine en basse résolution puis on agrandit ; sinon, à la densité de l'écran pour rester net
const scale = pixel ? 0.5 : (window.devicePixelRatio || 1);
canvas.width = canvas.height = Math.round(56 * scale);
if (pixel) canvas.classList.add('pixel');

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

  if (kind === 'gift' || kind === 'egg' || kind === 'letter') {
    if (kind === 'gift') drawGift(t); else if (kind === 'letter') drawLetter(t); else drawEgg(t);
    setTimeout(() => requestAnimationFrame(draw), 60);
    return;
  }
  if (kind === 'pee') {
    drawPuddle(t);
    setTimeout(() => requestAnimationFrame(draw), 120);
    return;
  }
  drawSwirl();

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
  drawFlies(t);
  setTimeout(() => requestAnimationFrame(draw), 60); // animation lente : quasiment rien pour le processeur
}

// Crotte enroulée : des boudins qui se chevauchent en spirale, et la petite pointe recourbée au sommet
function drawSwirl() {
  const BROWN = '#9a6a43';
  ellipse(28, 53, 16, 3, 'rgba(0,0,0,.15)');
  // Pointe recourbée (dessinée d'abord, le dernier boudin la recouvre à sa base)
  ctx.beginPath();
  ctx.moveTo(24, 34);
  ctx.quadraticCurveTo(25, 25, 32, 24);
  ctx.quadraticCurveTo(29, 28, 32, 34);
  ctx.closePath();
  ctx.fillStyle = BROWN;
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.stroke();
  // Boudins, du plus large au plus petit, légèrement décalés à gauche puis à droite
  for (const [x, y, rx, ry] of [[28, 47, 15, 6], [29.5, 40.5, 11.5, 5.2], [27, 35, 8, 4.4]]) {
    ellipse(x, y, rx, ry, BROWN, INK, 2.2);
    // Trait de l'enroulement qui passe devant
    ctx.beginPath();
    ctx.ellipse(x, y - ry * 0.35, rx * 0.75, ry * 0.7, 0, Math.PI * 0.15, Math.PI * 0.85);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = 'rgba(59,42,58,.45)';
    ctx.stroke();
  }
  ellipse(22, 44.5, 3, 1.6, 'rgba(255,255,255,.4)');
  ellipse(25, 33.5, 2, 1.1, 'rgba(255,255,255,.4)');
}

// Deux petites mouches qui tournent au-dessus de la crotte
function drawFlies(t) {
  for (let i = 0; i < 2; i++) {
    const s = t * (1.6 + i * 0.5) + i * 2.4;
    const x = 28 + Math.sin(s) * 16 + Math.sin(s * 2.7) * 3;
    const y = 16 + Math.sin(s * 1.9 + i) * 6;
    const up = Math.sin(t * 40 + i) > 0; // battement d'ailes
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(x + side * 1.3, y - 1.4, 0.9, 1.7, side * (up ? 0.9 : 0.3), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(160,175,190,.6)';
      ctx.fill();
    }
    ellipse(x, y, 1.6, 1.2, '#2a2230');
  }
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

// Lettre de la soirée magique, avec son cachet rouge ; une petite étoile scintille dessus
function drawLetter(t) {
  const y = 50 - Math.abs(Math.sin(t * 2.5)) * 2;
  ellipse(28, 53, 16, 3, 'rgba(0,0,0,.15)');
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(10, y - 22, 36, 22);
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.strokeRect(10, y - 22, 36, 22);
  ctx.beginPath();
  ctx.moveTo(10, y - 22);
  ctx.lineTo(28, y - 9);
  ctx.lineTo(46, y - 22);
  ctx.stroke();
  ellipse(28, y - 9, 4.5, 4.5, '#d8384a', INK, 1.5);
  ctx.globalAlpha = 0.5 + Math.sin(t * 5) * 0.5;
  ctx.fillStyle = '#ffd84a';
  ctx.fillRect(41, y - 31, 2, 8);
  ctx.fillRect(38, y - 28, 8, 2);
  ctx.globalAlpha = 1;
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
