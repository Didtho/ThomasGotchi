// Objet de fête posé sur le bureau (citrouille, sapin, gâteau, œufs de Pâques).
// Il reste immobile en bas de l'écran : les animaux passent devant en se promenant.

const INK = '#3b2a3a';
const kind = new URLSearchParams(location.search).get('kind');
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

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

const isNight = () => { const h = new Date().getHours(); return h >= 19 || h < 7; };

// Citrouille ; son visage s'illumine le soir
function pumpkin(x, ground, t) {
  const y = ground - 14;
  ellipse(x, ground + 1, 22, 3, 'rgba(0,0,0,.15)');
  for (const [dx, w] of [[-9, 11], [9, 11], [0, 12]]) ellipse(x + dx, y, w, 13, '#f28c28', INK, 2);
  ctx.fillStyle = '#4c7a2e';
  ctx.fillRect(x - 2, y - 19, 4, 7);
  ctx.fillStyle = isNight() ? `rgba(255,214,90,${0.75 + Math.sin(t * 6) * 0.2})` : '#5a2d0c';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * 7, y - 6); ctx.lineTo(x + side * 3, y - 1); ctx.lineTo(x + side * 10, y - 1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(x - 8, y + 4); ctx.lineTo(x - 4, y + 7); ctx.lineTo(x, y + 4); ctx.lineTo(x + 4, y + 7); ctx.lineTo(x + 8, y + 4);
  ctx.lineTo(x + 6, y + 9); ctx.lineTo(x - 6, y + 9);
  ctx.closePath();
  ctx.fill();
}

// Petit sapin aux boules qui clignotent
function tree(x, ground, t) {
  ellipse(x, ground + 1, 18, 3, 'rgba(0,0,0,.15)');
  ctx.fillStyle = '#7a4a2a';
  ctx.fillRect(x - 3, ground - 9, 6, 9);
  for (const [dy, w] of [[-9, 18], [-22, 14], [-33, 10]]) {
    ctx.beginPath();
    ctx.moveTo(x - w, ground + dy); ctx.lineTo(x, ground + dy - 18); ctx.lineTo(x + w, ground + dy);
    ctx.closePath();
    ctx.fillStyle = '#2e8b57';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  [['#e8455d', -8, -14], ['#ffd84a', 7, -24], ['#6f8fe8', -4, -32], ['#e8455d', 5, -12]].forEach(([c, dx, dy], i) =>
    ellipse(x + dx, ground + dy, 2.6, 2.6, (Math.floor(t * 2) + i) % 3 ? c : '#fff'));
  ellipse(x, ground - 53, 4, 4, '#ffd84a', INK, 1.5);
}

// Gâteau d'anniversaire, bougie qui vacille
function cake(x, ground, t) {
  ellipse(x, ground + 1, 18, 3, 'rgba(0,0,0,.15)');
  ctx.fillStyle = '#ffd1dc';
  ctx.fillRect(x - 15, ground - 18, 30, 18);
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.strokeRect(x - 15, ground - 18, 30, 18);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - 15, ground - 18, 30, 5);
  ctx.fillStyle = '#6f8fe8';
  ctx.fillRect(x - 1.5, ground - 28, 3, 10);
  ellipse(x + Math.sin(t * 12) * 0.8, ground - 31, 2.5, 4, '#ffb52e');
}

// Œufs de Pâques dans l'herbe
function eggs(x, ground) {
  [['#ff9fc6', -16], ['#9fe3bd', -2], ['#ffe17a', 13]].forEach(([c, dx]) => {
    ellipse(x + dx, ground - 8, 6, 8, c, INK, 1.8);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + dx - 5, ground - 8); ctx.lineTo(x + dx + 5, ground - 8);
    ctx.stroke();
  });
}

const DRAW = { halloween: pumpkin, snow: tree, cake, spring: eggs };

function draw(now) {
  const t = now / 1000;
  fitCanvas();
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  if (DRAW[kind]) DRAW[kind](innerWidth / 2, innerHeight - 8, t);
  setTimeout(() => requestAnimationFrame(draw), 120); // animation lente : presque rien pour le processeur
}
requestAnimationFrame(draw);
