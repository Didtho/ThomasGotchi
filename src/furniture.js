// Gamelle (croquettes + eau) posée en bas de l'écran.
// Clic : la remplir. Glisser : la déplacer le long du bas de l'écran.

const INK = '#3b2a3a';
const kind = new URLSearchParams(location.search).get('kind'); // 'bowl'
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let data = { food: 100, water: 100 };
let sparkleAt = 0;

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}
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

function draw(now) {
  const t = now / 1000;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const base = H - 8;
  ellipse(W / 2, base + 2, W / 2 - 6, 4, 'rgba(0,0,0,.15)');

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
  }

  // Étincelles après un remplissage
  const k = (now - sparkleAt) / 600;
  if (k < 1) {
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
  setTimeout(() => requestAnimationFrame(draw), k < 1 ? 16 : 120);
}
requestAnimationFrame(draw);

window.furn.onState((s) => {
  if (s.food > data.food + 20 || s.water > data.water + 20) sparkleAt = performance.now();
  data = s;
});

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
  if (press.moved) window.furn.dragEnd(); else window.furn.click();
  press = null;
});
