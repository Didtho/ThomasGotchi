// Hibou de la soirée magique : il traverse l'écran en battant des ailes, une lettre dans les pattes.
// main.js déplace la fenêtre ; ici on ne dessine que l'oiseau.

const INK = '#3b2a3a';
const dir = Number(new URLSearchParams(location.search).get('dir')) || 1; // 1 : vers la droite
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;
canvas.width = Math.round(innerWidth * dpr);
canvas.height = Math.round(innerHeight * dpr);

function ellipse(x, y, rx, ry, fill, stroke, lw = 2, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function draw(now) {
  const t = now / 1000;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, 90, 80);
  // Tourné dans le sens du vol
  ctx.translate(45, 0);
  ctx.scale(dir, 1);
  ctx.translate(-45, 0);
  const flap = Math.sin(t * 14); // battement d'ailes
  // Lettre tenue dans les pattes
  ctx.fillStyle = '#fffaf0';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.fillRect(36, 56, 22, 15);
  ctx.strokeRect(36, 56, 22, 15);
  ctx.beginPath();
  ctx.moveTo(36, 56);
  ctx.lineTo(47, 64);
  ctx.lineTo(58, 56);
  ctx.stroke();
  ellipse(47, 64, 2.6, 2.6, '#d8384a');
  // Ailes déployées sur les côtés, qui battent autour de l'épaule
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(45 + side * 11, 42);
    ctx.rotate(side * flap * 0.6);
    ellipse(side * 15, 0, 16, 6.5, '#8a5a3c', INK, 2);
    ctx.restore();
  }
  // Corps et tête
  ellipse(45, 42, 15, 17, '#a8734d', INK, 2);
  ellipse(45, 46, 9, 10, '#e8cfa8');
  for (const side of [-1, 1]) {
    // Aigrettes, grands yeux et pupilles
    ctx.beginPath();
    ctx.moveTo(45 + side * 7, 27);
    ctx.lineTo(45 + side * 13, 20);
    ctx.lineTo(45 + side * 12, 31);
    ctx.closePath();
    ctx.fillStyle = '#8a5a3c';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ellipse(45 + side * 6, 36, 5.5, 5.5, '#fff', INK, 1.6);
    ellipse(45 + side * 6 + 1.2, 36, 2.6, 2.6, INK);
  }
  // Bec
  ctx.beginPath();
  ctx.moveTo(43, 40);
  ctx.lineTo(47, 40);
  ctx.lineTo(45, 44);
  ctx.closePath();
  ctx.fillStyle = '#f2a33a';
  ctx.fill();
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
