// Pelote de laine qui roule en bas de l'écran. La physique est calculée dans main.js ;
// ici on dessine la pelote et le fil déroulé, et on gère le clic (rembobiner).

const INK = '#3b2a3a';
const WOOL = '#e8455d';
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let yarn = null; // { x, r, angle, trail: [x…] } en coordonnées de la fenêtre

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

function draw() {
  fitCanvas();
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  if (!yarn) return;
  const ground = innerHeight - 8;

  // Fil déroulé, posé au sol, qui ondule et s'emmêle quand la pelote revient sur ses pas
  if (yarn.trail.length > 1) {
    ctx.beginPath();
    yarn.trail.forEach((x, i) => {
      const y = ground - 2 - Math.abs(Math.sin(i * 0.9)) * 5 - (i % 7 === 0 ? 4 : 0);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(yarn.x, ground - yarn.r);
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = WOOL;
    ctx.stroke();
  }

  // La pelote : boule rouge avec des brins enroulés qui tournent quand elle roule
  const cx = yarn.x, cy = ground - yarn.r, r = yarn.r;
  ctx.beginPath();
  ctx.ellipse(cx, ground + 1, r * 0.9, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,.15)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = WOOL;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(120,20,40,.55)';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 5; i++) {
    const a = yarn.angle + i * Math.PI / 5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.05, r * 0.45, a, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.35, cy - r * 0.4, r * 0.28, r * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.fill();
}

window.yarnApi.onState((s) => {
  yarn = s;
  draw();
});

// La fenêtre laisse passer les clics partout, sauf sur la pelote
function overBall(x, y) {
  if (!yarn) return false;
  const ground = innerHeight - 8;
  return Math.hypot(x - yarn.x, y - (ground - yarn.r)) < yarn.r + 6;
}

addEventListener('mousemove', (e) => window.yarnApi.setIgnore(!overBall(e.clientX, e.clientY)));
addEventListener('mouseout', (e) => { if (!e.relatedTarget) window.yarnApi.setIgnore(true); });
addEventListener('click', (e) => { if (overBall(e.clientX, e.clientY)) window.yarnApi.rewind(); });
