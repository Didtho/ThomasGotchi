// Une crotte posée sur le bureau. Un clic la nettoie.

const INK = '#3b2a3a';
const params = new URLSearchParams(location.search);
const pixel = params.get('style') === 'pixel';
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

canvas.addEventListener('click', () => {
  if (!cleanedAt) cleanedAt = performance.now();
});

requestAnimationFrame(draw);
