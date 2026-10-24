// Dessin du petit être. Tout est dessiné en code (pas d'images) ; le style « pixel rétro »
// réutilise le même dessin, rendu en basse résolution puis agrandi sans lissage.

const INK = '#3b2a3a';
const GROUND = 292;
const CENTER = 120;
const PIXEL = 2; // taille d'un « gros pixel » en mode rétro

const SIZES = { baby: 30, child: 38, adult: 46 };

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function heart(ctx, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 10, s / 10);
  ctx.beginPath();
  ctx.moveTo(0, 3);
  ctx.bezierCurveTo(-10, -4, -5, -11, 0, -5);
  ctx.bezierCurveTo(5, -11, 10, -4, 0, 3);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

function ellipse(ctx, x, y, rx, ry, fill, stroke, lw = 2.5) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function drawEgg(ctx, v) {
  const p = v.eggProgress; // 0 → 1
  const wobble = Math.sin(v.t * (4 + p * 14)) * (0.04 + p * 0.18) * (p > 0.3 ? 1 : 0.4);
  const rx = 30, ry = 38;
  const cy = GROUND - ry;
  ellipse(ctx, CENTER, GROUND - 1, 30, 5, 'rgba(0,0,0,.15)');
  ctx.save();
  ctx.translate(CENTER, GROUND);
  ctx.rotate(wobble);
  ctx.translate(-CENTER, -GROUND);
  ellipse(ctx, CENTER, cy, rx, ry, '#fffaf2', INK, 3);
  ellipse(ctx, CENTER - 12, cy - 12, 7, 5, v.color);
  ellipse(ctx, CENTER + 13, cy + 2, 9, 6, v.color);
  ellipse(ctx, CENTER - 6, cy + 18, 6, 4, v.color);
  ellipse(ctx, CENTER - 14, cy - 22, 5, 8, 'rgba(255,255,255,.8)');
  if (p > 0.6) {
    ctx.beginPath();
    ctx.moveTo(CENTER - 22, cy - 6);
    ctx.lineTo(CENTER - 12, cy + 2);
    ctx.lineTo(CENTER - 4, cy - 8);
    ctx.lineTo(CENTER + 6, cy + 1);
    if (p > 0.85) { ctx.lineTo(CENTER + 14, cy - 9); ctx.lineTo(CENTER + 24, cy - 2); }
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  ctx.restore();
  return { left: CENTER - rx - 4, right: CENTER + rx + 4, top: cy - ry - 4, bottom: GROUND };
}

// Couleur des traits du visage : foncée d'habitude, claire sur un pelage noir
const LIGHT_INK = '#f3eadf';
const faceInk = (v) => (v.dark ? LIGHT_INK : INK);

function drawEyes(ctx, v, cx, ey, gap, er) {
  // Regard : vers la souris si elle est proche, sinon dans le sens de la marche
  const look = v.lookX != null ? v.lookX * er * 0.45 : v.facing * er * 0.5;
  const ly = (v.lookY || 0) * er * 0.35;
  const kind = v.eyes;
  const ink = faceInk(v);
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const x = cx + side * gap + look;
    if (kind === 'dead') {
      ctx.lineWidth = 3;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.moveTo(x - er * 0.8, ey - er * 0.8); ctx.lineTo(x + er * 0.8, ey + er * 0.8);
      ctx.moveTo(x + er * 0.8, ey - er * 0.8); ctx.lineTo(x - er * 0.8, ey + er * 0.8);
      ctx.stroke();
    } else if (kind === 'closed') {
      ctx.lineWidth = 3;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.arc(x, ey - er * 0.3, er * 0.8, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    } else if (kind === 'dizzy') {
      // Yeux en spirale
      ctx.lineWidth = 2;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      for (let k = 0; k < 28; k++) {
        const ang = k * 0.45 + v.t * 8 * side;
        const rr = er * 0.9 * (k / 28);
        ctx.lineTo(x + Math.cos(ang) * rr, ey + Math.sin(ang) * rr);
      }
      ctx.stroke();
    } else if (kind === 'joy') {
      ctx.lineWidth = 3;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.arc(x, ey + er * 0.4, er * 0.8, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
    } else {
      if (v.dark) {
        // Pelage noir : grands yeux jaunes de chat noir
        ellipse(ctx, x - look * 0.3, ey, er * 0.85, er * 1.1, (v.coat && v.coat.eye) || '#ffd84a', LIGHT_INK, 1.5);
        ellipse(ctx, x, ey + ly, er * 0.42, er * 0.85, '#1c1720');
      } else {
        ellipse(ctx, x, ey + ly, er * 0.8, er * 1.05, INK);
      }
      if (kind === 'tired') {
        // Paupière à moitié fermée
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - er, ey - er * 1.25, er * 2, er * 1.15);
        ctx.fillStyle = v.bodyColor;
        ctx.fill();
        ctx.restore();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = ink;
        ctx.beginPath();
        ctx.moveTo(x - er * 0.9, ey - er * 0.1);
        ctx.lineTo(x + er * 0.9, ey - er * 0.1);
        ctx.stroke();
      } else {
        ellipse(ctx, x - er * 0.25 + look * 0.2, ey + ly - er * 0.4, er * 0.3, er * 0.35, '#fff');
        ellipse(ctx, x + er * 0.3, ey + ly + er * 0.35, er * 0.13, er * 0.13, '#fff');
      }
      if (kind === 'sad') {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = ink;
        ctx.beginPath();
        ctx.moveTo(x - side * er * 1.1, ey - er * 1.9);
        ctx.lineTo(x + side * er * 0.6, ey - er * 1.5);
        ctx.stroke();
      }
    }
  }
}

function drawMouth(ctx, v, x, y, s) {
  // Sur le museau blanc du chat noir et blanc, la bouche reste foncée
  const onWhite = v.coat && v.coat.muzzle;
  const ink = onWhite ? INK : faceInk(v);
  const inside = v.dark && !onWhite ? '#7a2d3a' : INK;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = ink;
  const m = v.mouth;
  ctx.beginPath();
  if (m === 'open' || m === 'tongue') {
    ctx.moveTo(x - s, y - s * 0.2);
    ctx.quadraticCurveTo(x, y + s * 1.6, x + s, y - s * 0.2);
    ctx.closePath();
    ctx.fillStyle = inside;
    ctx.fill();
    if (v.dark) ctx.stroke();
    if (m === 'open') {
      ellipse(ctx, x, y + s * 0.5, s * 0.5, s * 0.3, '#ff7d96');
    } else {
      // Langue pendante qui halète : il a soif
      const pant = Math.sin(v.t * 9) * s * 0.15;
      ellipse(ctx, x + s * 0.1, y + s * 1.0 + pant, s * 0.5, s * 0.7, '#ff7d96', INK, 2);
      ctx.beginPath();
      ctx.moveTo(x + s * 0.1, y + s * 0.6 + pant);
      ctx.lineTo(x + s * 0.1, y + s * 1.2 + pant);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#d9506d';
      ctx.stroke();
    }
    return;
  }
  if (m === 'chomp') {
    ellipse(ctx, x, y + s * 0.3, s * 0.65, s * 0.7, inside, v.dark ? ink : null, 2);
    return;
  }
  if (m === 'o' || m === 'drool') {
    ellipse(ctx, x, y + s * 0.2, s * 0.35, s * 0.4, inside, v.dark ? ink : null, 2);
    if (m === 'drool') {
      // Filet de bave qui grossit : il a faim
      const k = (v.t * 0.6) % 1;
      const dx = x + s * 0.55, dy = y + s * 0.5;
      ctx.beginPath();
      ctx.moveTo(dx - s * 0.12, dy);
      ctx.quadraticCurveTo(dx - s * 0.25, dy + s * (0.4 + k), dx, dy + s * (0.5 + k));
      ctx.quadraticCurveTo(dx + s * 0.25, dy + s * (0.4 + k), dx + s * 0.12, dy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(170,220,255,.95)';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    return;
  }
  if (m === 'smile') {
    ctx.moveTo(x - s * 0.8, y);
    ctx.quadraticCurveTo(x - s * 0.4, y + s * 0.7, x, y + s * 0.1);
    ctx.quadraticCurveTo(x + s * 0.4, y + s * 0.7, x + s * 0.8, y);
  } else if (m === 'sad') {
    ctx.moveTo(x - s * 0.7, y + s * 0.6);
    ctx.quadraticCurveTo(x, y - s * 0.3, x + s * 0.7, y + s * 0.6);
  } else if (m === 'wavy') {
    ctx.moveTo(x - s, y + s * 0.3);
    ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.2, x, y + s * 0.3);
    ctx.quadraticCurveTo(x + s * 0.5, y + s * 0.8, x + s, y + s * 0.3);
  } else {
    ctx.moveTo(x - s * 0.6, y + s * 0.2);
    ctx.lineTo(x + s * 0.6, y + s * 0.2);
  }
  ctx.stroke();
}

// Thermomètre dans la bouche quand il est malade
function drawThermometer(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.45);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(r * 0.55, 0);
  ctx.lineWidth = r * 0.1 + 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = r * 0.1;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(r * 0.32, 0);
  ctx.lineWidth = r * 0.04;
  ctx.strokeStyle = '#ff4d5e';
  ctx.stroke();
  ellipse(ctx, 0, 0, r * 0.075, r * 0.075, '#ff4d5e', INK, 1.5);
  ctx.restore();
}

// Taches de saleté (positions fixes pour qu'elles ne clignotent pas)
function drawDirt(ctx, cx, cy, rx, ry) {
  const spots = [[-0.55, -0.1, 0.16], [0.45, 0.25, 0.12], [0.1, -0.45, 0.1], [-0.2, 0.45, 0.09]];
  for (const [dx, dy, s] of spots) {
    ellipse(ctx, cx + dx * rx, cy + dy * ry, rx * s, rx * s * 0.7, 'rgba(120,85,50,.45)');
  }
}

// Bulle de pensée avec l'objet réclamé (verre d'eau ou cuisse de poulet)
function drawThought(ctx, need, x, y, t) {
  ellipse(ctx, x - 14, y + 16, 2.5, 2.5, '#fff', INK, 1.5);
  ellipse(ctx, x - 8, y + 10, 4, 4, '#fff', INK, 1.5);
  ellipse(ctx, x + 4, y - 4, 15, 13, '#fff', INK, 2);
  const ix = x + 4, iy = y - 4;
  if (need === 'thirst') {
    ctx.beginPath();
    ctx.moveTo(ix, iy - 9);
    ctx.quadraticCurveTo(ix + 8, iy + 2, ix, iy + 7);
    ctx.quadraticCurveTo(ix - 8, iy + 2, ix, iy - 9);
    ctx.fillStyle = '#5fb4f0';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ellipse(ctx, ix - 2, iy + 1, 1.5, 2.5, 'rgba(255,255,255,.9)');
  } else if (need === 'hunger') {
    ctx.save();
    ctx.translate(ix, iy);
    ctx.rotate(-0.6 + Math.sin(t * 3) * 0.1);
    ellipse(ctx, 6, -1, 2.5, 2.5, '#fff', INK, 1.2);
    ellipse(ctx, 6, 2, 2.5, 2.5, '#fff', INK, 1.2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(1, -1, 5, 3);
    ellipse(ctx, -3, 0, 7, 5.5, '#c97a3d', INK, 1.5);
    ctx.restore();
  }
}

// Proportions du petit animal : grosse tête ronde posée sur un petit corps (style chibi)
function geometry(stage, species, jump = 0, squash = 1) {
  const r = SIZES[stage] || SIZES.baby;
  const bodyRx = r * 0.72 * squash;
  const bodyRy = r * 0.55 / squash;
  const bodyCy = GROUND - bodyRy * 0.95 - jump;
  const headRx = r * 1.0;
  const headRy = r * 0.86;
  const headCy = bodyCy - bodyRy * 0.55 - headRy * 0.75 + (squash - 1) * r * 2;
  const earH = { chat: 0.45, lapin: 0.95, ours: 0.22 }[species] || 0.45;
  return { r, bodyRx, bodyRy, bodyCy, headRx, headRy, headCy, top: headCy - headRy - r * earH };
}

function drawEars(ctx, species, cx, g, body, inner, t) {
  const { r, headRx, headRy, headCy } = g;
  for (const side of [-1, 1]) {
    ctx.save();
    if (species === 'lapin') {
      // Longues oreilles ; l'une se plie légèrement et bouge
      const flop = side > 0 ? 0.35 + Math.sin(t * 2) * 0.05 : -0.12;
      ctx.translate(cx + side * headRx * 0.38, headCy - headRy * 0.7);
      ctx.rotate(flop);
      ellipse(ctx, 0, -r * 0.55, r * 0.22, r * 0.6, body, INK, 2.5);
      ellipse(ctx, 0, -r * 0.5, r * 0.1, r * 0.42, inner);
    } else if (species === 'ours') {
      ellipse(ctx, cx + side * headRx * 0.68, headCy - headRy * 0.7, r * 0.26, r * 0.25, body, INK, 2.5);
      ellipse(ctx, cx + side * headRx * 0.68, headCy - headRy * 0.68, r * 0.13, r * 0.12, inner);
    } else {
      // Oreilles de chat : triangles aux pointes arrondies
      ctx.translate(cx + side * headRx * 0.55, headCy - headRy * 0.55);
      ctx.rotate(side * 0.3);
      const w = r * 0.36, h = r * 0.72;
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.quadraticCurveTo(-w * 0.25, -h, 0, -h);
      ctx.quadraticCurveTo(w * 0.25, -h, w, 0);
      ctx.closePath();
      ctx.fillStyle = body;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, -h * 0.12);
      ctx.quadraticCurveTo(0, -h * 0.85, w * 0.5, -h * 0.12);
      ctx.closePath();
      ctx.fillStyle = inner;
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawTail(ctx, species, cx, g, body, side, t, coat) {
  const { r, bodyRx, bodyRy, bodyCy } = g;
  const x = cx + side * bodyRx * 0.85;
  const y = bodyCy + bodyRy * 0.2;
  if (species === 'chat') {
    const sway = Math.sin(t * 2.2) * r * 0.15;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - side * r * 0.1, y);
    ctx.bezierCurveTo(x + side * r * 0.55, y + r * 0.1, x + side * r * 0.6 + sway, y - r * 0.6, x + side * r * 0.3 + sway, y - r * 0.8);
    const w = r * (coat && coat.fluffy ? 0.36 : 0.22); // queue touffue pour les poils longs
    ctx.lineWidth = w + 5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = w;
    ctx.strokeStyle = body;
    ctx.stroke();
    if (coat && coat.tailTip) ellipse(ctx, x + side * r * 0.3 + sway, y - r * 0.8, w * 0.55, w * 0.55, coat.tailTip);
  } else {
    const s = species === 'lapin' ? 0.24 : 0.15;
    ellipse(ctx, x + side * r * 0.05, y, r * s, r * s, species === 'lapin' ? shade(body, 0.12) : body, INK, 2.5);
  }
}

function drawFace(ctx, v, cx, g) {
  const { r, headRx, headRy, headCy } = g;
  const fx = cx + v.facing * 3;
  const er = r * 0.14;
  const ey = headCy + headRy * 0.02;
  const gap = headRx * 0.4;
  const mouthY = ey + er * 2.1;

  ellipse(ctx, fx - headRx * 0.66, ey + er * 1.5, headRx * 0.15, headRy * 0.09, 'rgba(255,110,140,.45)');
  ellipse(ctx, fx + headRx * 0.66, ey + er * 1.5, headRx * 0.15, headRy * 0.09, 'rgba(255,110,140,.45)');

  if (v.species === 'ours') {
    ellipse(ctx, fx, mouthY - er * 0.2, headRx * 0.3, headRy * 0.24, shade(v.bodyColor, 0.14), INK, 2);
  }
  drawEyes(ctx, v, cx, ey, gap, er);

  // Petit nez
  const ny = ey + er * 1.35;
  if (v.species === 'ours') ellipse(ctx, fx, ny, r * 0.08, r * 0.055, v.dark ? '#1c1720' : INK);
  else ellipse(ctx, fx, ny, r * 0.055, r * 0.04, '#ff7d96', INK, 1.5);

  if (v.species === 'chat' && v.mood !== 'dead') {
    // Moustaches
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = faceInk(v);
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      for (const dy of [-0.06, 0.08]) {
        ctx.beginPath();
        ctx.moveTo(fx + side * headRx * 0.55, ny + r * dy);
        ctx.lineTo(fx + side * headRx * 0.95, ny + r * dy * 2.2 - r * 0.03);
        ctx.stroke();
      }
    }
  }
  drawMouth(ctx, v, fx, mouthY - er * 0.3, r * 0.12);
  if (v.mood === 'sick' && !v.anim) drawThermometer(ctx, fx + r * 0.1, mouthY - er * 0.1, r);
  return mouthY;
}

// Accessoires gagnés en prenant soin de lui
function drawAccessory(ctx, kind, cx, g, v) {
  const { r, headRx, headRy, headCy, bodyCy, bodyRy } = g;
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  if (kind === 'noeud') {
    const y = headCy + headRy * 0.98;
    const w = r * 0.28;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(cx + side * w, y - w * 0.6);
      ctx.lineTo(cx + side * w, y + w * 0.6);
      ctx.closePath();
      ctx.fillStyle = '#e8455d';
      ctx.fill();
      ctx.stroke();
    }
    ellipse(ctx, cx, y, w * 0.28, w * 0.32, '#c22f47', INK, 2);
  } else if (kind === 'lunettes') {
    const er = r * 0.14;
    const ey = headCy + headRy * 0.02;
    const gap = headRx * 0.4;
    ctx.lineWidth = 2.5;
    for (const side of [-1, 1]) ellipse(ctx, cx + side * gap, ey, er * 1.55, er * 1.45, 'rgba(200,230,255,.25)', INK, 2.5);
    ctx.beginPath();
    ctx.moveTo(cx - gap + er * 1.5, ey - er * 0.3);
    ctx.quadraticCurveTo(cx, ey - er * 0.9, cx + gap - er * 1.5, ey - er * 0.3);
    ctx.stroke();
  } else if (kind === 'fleur') {
    const fx = cx - headRx * 0.55, fy = headCy - headRy * 0.72;
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 + v.t * 0.3;
      ellipse(ctx, fx + Math.cos(a) * r * 0.13, fy + Math.sin(a) * r * 0.13, r * 0.1, r * 0.1, '#ff9fc6', INK, 1.5);
    }
    ellipse(ctx, fx, fy, r * 0.08, r * 0.08, '#ffd84a', INK, 1.5);
  } else if (kind === 'couronne') {
    const y = headCy - headRy * 0.88;
    const w = headRx * 0.5, h = r * 0.38;
    ctx.beginPath();
    ctx.moveTo(cx - w, y);
    ctx.lineTo(cx - w, y - h);
    ctx.lineTo(cx - w * 0.5, y - h * 0.55);
    ctx.lineTo(cx, y - h * 1.15);
    ctx.lineTo(cx + w * 0.5, y - h * 0.55);
    ctx.lineTo(cx + w, y - h);
    ctx.lineTo(cx + w, y);
    ctx.closePath();
    ctx.fillStyle = '#ffd84a';
    ctx.fill();
    ctx.stroke();
    ellipse(ctx, cx, y - h * 0.35, r * 0.05, r * 0.05, '#e8455d');
  } else if (kind === 'sorciere') {
    const y = headCy - headRy * 0.7;
    ctx.save();
    ctx.translate(cx, y);
    ctx.rotate(-0.12);
    ellipse(ctx, 0, 0, headRx * 0.95, r * 0.13, '#3d2b56', INK, 2);
    ctx.beginPath();
    ctx.moveTo(-headRx * 0.5, -r * 0.05);
    ctx.quadraticCurveTo(-headRx * 0.2, -r * 0.8, headRx * 0.35, -r * 1.05);
    ctx.quadraticCurveTo(headRx * 0.15, -r * 0.6, headRx * 0.5, -r * 0.05);
    ctx.closePath();
    ctx.fillStyle = '#3d2b56';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f2a45a';
    ctx.fillRect(-headRx * 0.46, -r * 0.2, headRx * 0.93, r * 0.12);
    ctx.restore();
  } else if (kind === 'fete') {
    const bx = cx + headRx * 0.15, by = headCy - headRy * 0.82;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(0.2);
    ctx.beginPath();
    ctx.moveTo(-r * 0.32, 0);
    ctx.lineTo(0, -r * 0.85);
    ctx.lineTo(r * 0.32, 0);
    ctx.closePath();
    ctx.fillStyle = '#9b6fe8';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = r * 0.09;
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, -r * 0.2 * k);
      ctx.lineTo(r * 0.4, -r * 0.2 * k + r * 0.1);
      ctx.stroke();
    }
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ellipse(ctx, 0, -r * 0.88, r * 0.1, r * 0.1, '#ff6f91', INK, 1.5);
    ctx.restore();
  } else if (kind === 'noel') {
    const baseY = headCy - headRy * 0.62;
    const sway = Math.sin(v.t * 1.5) * 2;
    ctx.beginPath();
    ctx.moveTo(cx - headRx * 0.62, baseY + 4);
    ctx.quadraticCurveTo(cx + headRx * 0.1, baseY - r * 1.0, cx + headRx * 0.9 + sway, baseY - r * 0.2);
    ctx.quadraticCurveTo(cx + headRx * 0.3, baseY - r * 0.3, cx + headRx * 0.62, baseY + 4);
    ctx.closePath();
    ctx.fillStyle = '#e03a4e';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ellipse(ctx, cx, baseY + 3, headRx * 0.66, r * 0.12, '#fff', INK, 2);
    ellipse(ctx, cx + headRx * 0.9 + sway, baseY - r * 0.2, r * 0.13, r * 0.13, '#fff', INK, 2);
  }
}

// Bonnet de nuit quand il dort le soir : il coiffe le haut de la tête et sa pointe retombe sur le côté
function drawNightcap(ctx, cx, g, t, species) {
  const { r, headRx, headRy, headCy } = g;
  const sway = Math.sin(t * 1.2) * 2;
  // Le lapin le porte entre ses longues oreilles ; chat et ourson ont les oreilles dessous
  const [a1, a2] = species === 'lapin' ? [Math.PI * 1.25, Math.PI * 1.75] : [Math.PI * 1.1, Math.PI * 1.9];
  const at = (a, k) => [cx + Math.cos(a) * headRx * k, headCy + Math.sin(a) * headRy * k];
  const [lx, ly] = at(a1, 1.04);
  const [rx, ry] = at(a2, 1.04);
  const top = headCy - headRy;
  const tipX = cx + headRx * 1.05 + sway;
  const tipY = headCy - headRy * 0.25;

  ctx.beginPath();
  ctx.moveTo(lx, ly);
  ctx.bezierCurveTo(cx - headRx * 0.5, top - r * 0.75, cx + headRx * 0.35, top - r * 0.95, tipX, tipY);
  ctx.quadraticCurveTo(cx + headRx * 0.75, top - r * 0.15, rx, ry);
  ctx.ellipse(cx, headCy, headRx * 1.04, headRy * 1.04, 0, a2, a1, true);
  ctx.closePath();
  ctx.fillStyle = '#6f8fe8';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.stroke();
  // Petites étoiles sur le tissu
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  for (const [dx, dy] of [[-0.25, -0.25], [0.2, -0.45], [0.55, -0.2]]) {
    ctx.beginPath();
    ctx.arc(cx + dx * headRx, top + dy * r, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Revers blanc qui suit l'arrondi du crâne
  ctx.beginPath();
  ctx.ellipse(cx, headCy, headRx * 1.06, headRy * 1.06, 0, a1, a2);
  ctx.ellipse(cx, headCy, headRx * 0.88, headRy * 0.84, 0, a2, a1, true);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.stroke();

  ellipse(ctx, tipX, tipY + r * 0.05, r * 0.14, r * 0.14, '#fff', INK, 2);
}

// Poils longs : joues ébouriffées qui dépassent de la tête
function drawCheekTufts(ctx, cx, g, body) {
  const { r, headRx, headRy, headCy } = g;
  for (const side of [-1, 1]) {
    const x = cx + side * headRx * 0.9, y = headCy + headRy * 0.25;
    ctx.beginPath();
    ctx.moveTo(x - side * r * 0.1, y - r * 0.3);
    ctx.lineTo(x + side * r * 0.28, y - r * 0.12);
    ctx.lineTo(x + side * r * 0.04, y - r * 0.02);
    ctx.lineTo(x + side * r * 0.3, y + r * 0.14);
    ctx.lineTo(x - side * r * 0.05, y + r * 0.2);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}

// Collerette blanche sous le menton (poils longs)
function drawRuff(ctx, cx, g) {
  const { r, headRx, headRy, headCy } = g;
  const y = headCy + headRy * 0.82;
  ctx.beginPath();
  ctx.moveTo(cx - headRx * 0.5, y - r * 0.05);
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const x = cx - headRx * 0.5 + (headRx * i) / n;
    ctx.lineTo(x, y + (i % 2 ? r * 0.22 : r * 0.08));
  }
  ctx.lineTo(cx + headRx * 0.5, y - r * 0.05);
  ctx.closePath();
  ctx.fillStyle = WHITE_FUR;
  ctx.fill();
}

const WHITE_FUR = '#fbf8f4';

// Motifs du pelage, découpés à la forme de la tête ou du corps
function drawCoat(ctx, coat, part, cx, cy, rx, ry, r) {
  if (!coat || !(coat.stripes || coat.spots || coat.muzzle || coat.chest || coat.patches)) return;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.lineCap = 'round';

  // Taches colorées (pêche de Snoop, taches blanches de Grisette…)
  for (const [where, dx, dy, prx, pry, color] of coat.patches || []) {
    if (where === part) ellipse(ctx, cx + dx * rx, cy + dy * ry, prx * rx, pry * ry, color);
  }
  if (part === 'head' && coat.muzzle) {
    // Museau blanc, et liseré blanc entre les yeux (plus large pour Grisette)
    ellipse(ctx, cx, cy + ry * 0.5, rx * 0.46, ry * 0.38, WHITE_FUR);
    if (coat.blaze) {
      const w = coat.blaze === 'wide' ? 0.24 : 0.13;
      ctx.beginPath();
      ctx.moveTo(cx - rx * w, cy + ry * 0.25);
      ctx.quadraticCurveTo(cx - rx * w * 0.2, cy - ry * 0.3, cx, cy - ry * 0.55);
      ctx.quadraticCurveTo(cx + rx * w * 0.2, cy - ry * 0.3, cx + rx * w, cy + ry * 0.25);
      ctx.closePath();
      ctx.fillStyle = WHITE_FUR;
      ctx.fill();
    }
  }
  if (part === 'body' && coat.chest) ellipse(ctx, cx, cy + ry * 0.15, rx * 0.6, ry * 0.85, WHITE_FUR);

  const col = coat.stripes || coat.spots;
  if (col) {
    ctx.strokeStyle = col;
    if (part === 'head') {
      // Rayures du front (le « M » des chats tigrés)
      ctx.lineWidth = r * 0.08;
      for (const k of [-1, 0, 1]) {
        const x = cx + k * rx * 0.2;
        ctx.beginPath();
        ctx.moveTo(x, cy - ry);
        ctx.lineTo(x + k * rx * 0.03, cy - ry * (k ? 0.7 : 0.56));
        ctx.stroke();
      }
      if (coat.stripes) {
        for (const side of [-1, 1]) {
          for (const dy of [-0.05, 0.18]) {
            ctx.beginPath();
            ctx.moveTo(cx + side * rx, cy + ry * dy);
            ctx.lineTo(cx + side * rx * 0.75, cy + ry * (dy + 0.04));
            ctx.stroke();
          }
        }
      }
      if (coat.spots) {
        for (const [dx, dy, s] of [[-0.55, -0.5, 0.1], [0.5, -0.55, 0.08], [0.72, -0.1, 0.07], [-0.74, 0.12, 0.07]]) {
          ellipse(ctx, cx + dx * rx, cy + dy * ry, rx * s, rx * s * 0.85, col);
        }
      }
    } else {
      if (coat.stripes) {
        ctx.lineWidth = r * 0.09;
        for (const side of [-1, 1]) {
          for (const dy of [-0.45, -0.05, 0.35]) {
            ctx.beginPath();
            ctx.moveTo(cx + side * rx * 1.05, cy + ry * dy);
            ctx.quadraticCurveTo(cx + side * rx * 0.75, cy + ry * (dy + 0.05), cx + side * rx * 0.55, cy + ry * (dy + 0.2));
            ctx.stroke();
          }
        }
      }
      if (coat.spots) {
        for (const [dx, dy, s] of [[-0.62, -0.25, 0.14], [0.5, -0.42, 0.12], [0.7, 0.2, 0.1], [-0.48, 0.38, 0.1], [0.05, -0.62, 0.09]]) {
          ellipse(ctx, cx + dx * rx, cy + dy * ry, rx * s, rx * s * 0.8, col);
        }
      }
    }
  }
  ctx.restore();
  ellipse(ctx, cx, cy, rx, ry, null, INK, 3); // on retrace le contour par-dessus
}

function drawCreature(ctx, v) {
  const species = v.species || 'chat';
  const breathe = Math.sin(v.t * (v.mood === 'sleep' ? 1.6 : 2.6));
  let squash = 1 + breathe * 0.025;
  let jump = 0;
  let float = 0;

  const a = v.anim;
  const at = v.animT;
  if (a === 'play') { jump = Math.abs(Math.sin(at * 7)) * 34; squash = 1 - Math.abs(Math.sin(at * 7)) * 0.06; }
  if (a === 'love' || a === 'heal') jump = Math.abs(Math.sin(at * 9)) * 6 * Math.max(0, 1 - at);
  if (a === 'eat') squash = 1 + Math.abs(Math.sin(at * 12)) * 0.04;
  // Marche : un petit rebond à chaque pas
  const stride = v.walking ? v.t * (v.running ? 22 : 12) : 0;
  if (v.walking) jump = Math.abs(Math.sin(stride)) * (v.running ? 5 : 2.5);
  if (a === 'jump') { const k = Math.min(1, at / 0.8); jump = Math.sin(k * Math.PI) * 48; squash = k < 0.12 || k > 0.88 ? 1.1 : 0.94; }
  if (a === 'roll') jump = Math.sin(Math.min(1, at / 0.9) * Math.PI) * 28;
  if (a === 'stretch') squash = 1 + Math.sin(Math.min(1, at / 1.5) * Math.PI) * 0.16;
  if (v.mood === 'dead') float = 40 + Math.sin(v.t * 1.5) * 6;

  const cx = CENTER;
  const g = geometry(v.stage, species, jump + float, squash);
  const { r, bodyRx, bodyRy, bodyCy, headRx, headRy, headCy } = g;
  const body = v.mood === 'dead' ? '#f4f1ff' : v.color;
  const inner = v.mood === 'dead' ? '#e6e0f5' : '#ff9fb9';
  v.bodyColor = body;

  // Tombe sous le fantôme
  if (v.mood === 'dead') {
    ctx.beginPath();
    ctx.moveTo(cx - 22, GROUND);
    ctx.lineTo(cx - 22, GROUND - 30);
    ctx.arc(cx, GROUND - 30, 22, Math.PI, 0);
    ctx.lineTo(cx + 22, GROUND);
    ctx.closePath();
    ctx.fillStyle = '#b9b3c4';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillRect(cx - 2, GROUND - 42, 4, 22);
    ctx.fillRect(cx - 9, GROUND - 35, 18, 4);
    ctx.globalAlpha = 0.85;
  }

  // Ombre
  const sh = Math.max(0.3, 1 - (jump + float) / 80);
  ellipse(ctx, cx, GROUND - 1, bodyRx * 1.1 * sh, 5 * sh, 'rgba(0,0,0,.15)');

  // En marchant, il se penche vers l'avant et se dandine
  ctx.save();
  if (v.walking && a !== 'roll') {
    ctx.translate(cx, GROUND);
    ctx.rotate(v.facing * (v.running ? 0.14 : 0.07) + Math.sin(stride) * 0.035);
    ctx.translate(-cx, -GROUND);
  }
  if (a === 'pee') {
    // Pipi : il se penche du côté opposé pour lever la patte
    ctx.translate(cx, GROUND);
    ctx.rotate(-(v.facing || 1) * 0.12);
    ctx.translate(-cx, -GROUND);
  }
  if (a === 'roll') {
    // Roulade : un tour complet autour du milieu du corps
    const pivot = (headCy + bodyCy) / 2;
    ctx.translate(cx, pivot);
    ctx.rotate(Math.min(1, at / 0.9) * Math.PI * 2 * (v.facing || 1));
    ctx.translate(-cx, -pivot);
  }

  // Pelage foncé : léger halo clair pour rester visible sur un fond sombre
  const halo = (on) => {
    ctx.shadowColor = on && v.dark && v.style !== 'pixel' ? 'rgba(255,255,255,.6)' : 'transparent';
    ctx.shadowBlur = on && v.dark && v.style !== 'pixel' ? 7 : 0;
  };
  halo(true);
  const tailSide = v.facing > 0 ? -1 : 1;
  drawTail(ctx, species, cx, g, body, tailSide, v.t * (v.walking ? 2.5 : 1), v.mood === 'dead' ? null : v.coat);

  // Corps, ventre, petites pattes
  const grad = ctx.createRadialGradient(cx - bodyRx * 0.3, bodyCy - bodyRy * 0.4, r * 0.1, cx, bodyCy, r);
  grad.addColorStop(0, shade(body, 0.08));
  grad.addColorStop(1, shade(body, -0.08));
  ellipse(ctx, cx, bodyCy, bodyRx, bodyRy, grad, INK, 3);
  halo(false);
  const coat = v.mood === 'dead' ? null : v.coat;
  if (!(coat && coat.chest)) ellipse(ctx, cx, bodyCy + bodyRy * 0.15, bodyRx * 0.55, bodyRy * 0.6, shade(body, 0.12));
  drawCoat(ctx, coat, 'body', cx, bodyCy, bodyRx, bodyRy, r);
  if (v.mood === 'sick') ellipse(ctx, cx, bodyCy, bodyRx, bodyRy, 'rgba(130,190,70,.28)');
  if (v.dirty) drawDirt(ctx, cx, bodyCy + bodyRy * 0.1, bodyRx, bodyRy);
  // Pattes : en marchant, elles avancent et se lèvent chacune leur tour
  const pawY = bodyCy + bodyRy * 0.82;
  for (const [side, phase] of [[-1, 0], [1, Math.PI]]) {
    const s = v.walking ? Math.sin(stride + phase) : 0;
    const lifted = a === 'pee' && side === (v.facing || 1); // patte levée côté bord
    const px = cx + side * bodyRx * 0.42 + v.facing * s * r * 0.14 + (lifted ? side * r * 0.2 : 0);
    const py = pawY - Math.max(0, s) * r * 0.14 - (lifted ? r * 0.4 : 0);
    if (lifted && at > 0.4) {
      // Petit jet vers le bord
      for (let k = 0; k < 4; k++) {
        const q = ((at * 3 + k / 4) % 1);
        ellipse(ctx, px + side * (r * 0.2 + q * r * 0.5), py + q * q * r * 0.6, 2.2, 2.2, '#f4d75e');
      }
    }
    ellipse(ctx, px, py, r * 0.19, r * 0.12, coat && coat.paws ? WHITE_FUR : body, INK, 2.5);
  }

  // Tête
  halo(true);
  drawEars(ctx, species, cx, g, body, inner, v.t);
  if (coat && coat.fluffy) drawCheekTufts(ctx, cx, g, body);
  const hg = ctx.createRadialGradient(cx - headRx * 0.35, headCy - headRy * 0.45, r * 0.1, cx, headCy, r * 1.2);
  hg.addColorStop(0, shade(body, 0.12));
  hg.addColorStop(0.6, body);
  hg.addColorStop(1, shade(body, -0.1));
  ellipse(ctx, cx, headCy, headRx, headRy, hg, INK, 3);
  halo(false);
  drawCoat(ctx, coat, 'head', cx, headCy, headRx, headRy, r);
  if (coat && coat.fluffy && coat.chest) drawRuff(ctx, cx, g);
  if (v.mood === 'sick') ellipse(ctx, cx, headCy, headRx, headRy, 'rgba(130,190,70,.28)');
  ellipse(ctx, cx - headRx * 0.45, headCy - headRy * 0.55, headRx * 0.18, headRy * 0.1, 'rgba(255,255,255,.65)');
  if (v.dirty) drawDirt(ctx, cx, headCy - headRy * 0.3, headRx * 0.9, headRy * 0.5);

  const mouthY = drawFace(ctx, v, cx, g);
  // Les chapeaux laissent la place au bonnet de nuit quand il dort
  const hat = ['couronne', 'sorciere', 'noel', 'fete'].includes(v.accessory);
  if (v.accessory && v.mood !== 'dead' && !(hat && v.nightcap)) drawAccessory(ctx, v.accessory, cx, g, v);
  if (v.nightcap) drawNightcap(ctx, cx, g, v.t, species);

  // Adulte bien soigné : une barrette étoile sur la tête
  if (v.stage === 'adult' && v.mood !== 'dead' && v.care >= 55 && !v.nightcap) {
    const sx = cx + headRx * 0.5, sy = headCy - headRy * 0.72;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? 4.5 : 10;
      const ang = -Math.PI / 2 + i * Math.PI / 5;
      ctx.lineTo(sx + Math.cos(ang) * rr, sy + Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffd84a';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  if (v.mood === 'sick') {
    ctx.beginPath();
    const dx = cx + headRx * 0.75, dy = headCy - headRy * 0.35 + (v.t * 12) % 8;
    ctx.moveTo(dx, dy - 7);
    ctx.quadraticCurveTo(dx + 6, dy + 2, dx, dy + 4);
    ctx.quadraticCurveTo(dx - 6, dy + 2, dx, dy - 7);
    ctx.fillStyle = '#9fd3ff';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  if (v.dirty && v.mood !== 'dead') {
    // Petites lignes d'odeur au-dessus de la tête
    ctx.strokeStyle = 'rgba(110,140,60,.85)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let k = -1; k <= 1; k++) {
      const ox = cx + k * headRx * 0.45;
      const oy = g.top - 4 - ((v.t * 12 + (k + 1) * 5) % 14);
      ctx.beginPath();
      ctx.moveTo(ox, oy + 10);
      ctx.quadraticCurveTo(ox + 5, oy + 5, ox, oy);
      ctx.stroke();
    }
  }
  ctx.restore();

  if (v.need && !v.anim && v.mood !== 'sleep' && v.mood !== 'dead') {
    drawThought(ctx, v.need, cx + headRx * 0.95, g.top + 8 + Math.sin(v.t * 2) * 2, v.t);
  }

  // Auréole du fantôme
  if (v.mood === 'dead') {
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.ellipse(cx, g.top - 6, headRx * 0.45, 6, 0, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffd84a';
    ctx.stroke();
  }

  drawEffects(ctx, v, cx, headCy, headRx, headRy, mouthY);
  return { left: cx - headRx - 8, right: cx + headRx + 8, top: g.top - 6, bottom: GROUND };
}

function drawEffects(ctx, v, cx, cy, rx, ry, mouthY) {
  const at = v.animT;
  const t = v.t;
  if (v.mood === 'sleep') {
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = INK;
    for (let i = 0; i < 3; i++) {
      const k = ((t * 0.5 + i / 3) % 1);
      ctx.globalAlpha = 1 - k;
      ctx.font = `bold ${10 + k * 10}px sans-serif`;
      ctx.fillText('Z', cx + rx * 0.6 + k * 26, cy - ry * 0.6 - k * 40);
    }
    ctx.globalAlpha = 1;
  }
  if (v.anim === 'love') {
    for (let i = 0; i < 3; i++) {
      const k = Math.min(1, at * 1.2 + i * 0.12);
      ctx.globalAlpha = Math.max(0, 1 - k);
      heart(ctx, cx + (i - 1) * 24 + Math.sin(at * 6 + i) * 5, cy - ry * 0.7 - k * 40, 12, '#ff6f91');
    }
    ctx.globalAlpha = 1;
  }
  if (v.anim === 'eat' && at < 0.9) {
    // Un petit document qui file vers la bouche
    const k = at / 0.9;
    const x = cx + rx * 1.3 * (1 - k), y = mouthY - 4;
    const s = 1 - k * 0.7;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-9, -12, 18, 22);
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.strokeRect(-9, -12, 18, 22);
    ctx.fillStyle = v.color;
    for (let i = 0; i < 3; i++) ctx.fillRect(-5, -7 + i * 6, 10, 2.5);
    ctx.restore();
  }
  if (v.anim === 'drink') {
    const x = cx + rx * 0.75, y = mouthY + 6;
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 14); ctx.lineTo(x + 8, y - 14); ctx.lineTo(x + 6, y + 10); ctx.lineTo(x - 6, y + 10);
    ctx.closePath();
    ctx.fillStyle = 'rgba(200,235,255,.9)';
    ctx.fill();
    ctx.fillStyle = '#6cb8f0';
    const lvl = Math.max(0, 1 - at / 1.8);
    ctx.fillRect(x - 6, y + 10 - 20 * lvl, 12, 20 * lvl);
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 2, y - 4);
    ctx.lineTo(x - 2, y - 20);
    ctx.lineTo(x - rx * 0.6, y - 9);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ff6f91';
    ctx.stroke();
  }
  if (v.anim === 'wash') {
    for (let i = 0; i < 9; i++) {
      const k = (at * 0.7 + i / 9) % 1;
      const x = cx + Math.sin(i * 2.3 + at * 3) * rx * 0.9;
      const y = cy + ry * 0.6 - k * ry * 2;
      ctx.globalAlpha = 1 - k;
      ellipse(ctx, x, y, 4 + (i % 3) * 2, 4 + (i % 3) * 2, 'rgba(210,240,255,.7)', '#7fb7e6', 1.5);
    }
    ctx.globalAlpha = 1;
  }
  if (v.anim === 'heal' || v.anim === 'hatch') {
    for (let i = 0; i < 6; i++) {
      const ang = i * Math.PI / 3 + at * 2;
      const d = rx * (0.9 + at * 0.5);
      const x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d * 0.8;
      ctx.globalAlpha = Math.max(0, 1 - at / 2);
      ctx.fillStyle = v.anim === 'heal' ? '#7be08f' : '#ffd84a';
      ctx.fillRect(x - 2, y - 7, 4, 14);
      ctx.fillRect(x - 7, y - 2, 14, 4);
    }
    ctx.globalAlpha = 1;
  }
  if (v.anim === 'dizzy') {
    // Petites étoiles qui tournent autour de la tête
    for (let i = 0; i < 3; i++) {
      const ang = t * 4 + i * Math.PI * 2 / 3;
      const x = cx + Math.cos(ang) * rx * 0.8, y = cy - ry * 1.05 + Math.sin(ang) * 6;
      ctx.fillStyle = '#ffd84a';
      ctx.fillRect(x - 1.5, y - 5, 3, 10);
      ctx.fillRect(x - 5, y - 1.5, 10, 3);
    }
  }
  if (v.anim === 'play') {
    const bx = cx - rx * 1.25, by = GROUND - 9 - Math.abs(Math.cos(at * 7)) * 40;
    ellipse(ctx, bx, by, 9, 9, '#ffd84a', INK, 2);
    ctx.beginPath();
    ctx.arc(bx - 13, by, 11, -0.6, 0.6);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// ---- Décors des fêtes (Halloween, Noël, Nouvel An…) ----

// Derrière l'animal : objets posés au sol
function drawDecorBack(ctx, v) {
  const t = v.t;
  if (v.decor === 'halloween') {
    // Citrouille (son visage s'illumine la nuit)
    const x = CENTER - 84, y = GROUND - 14;
    for (const [dx, w] of [[-9, 11], [9, 11], [0, 12]]) ellipse(ctx, x + dx, y, w, 13, '#f28c28', INK, 2);
    ctx.fillStyle = '#4c7a2e';
    ctx.fillRect(x - 2, y - 19, 4, 7);
    ctx.fillStyle = v.night ? `rgba(255,214,90,${0.75 + Math.sin(t * 6) * 0.2})` : '#5a2d0c';
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
  } else if (v.decor === 'snow') {
    // Petit sapin décoré
    const x = CENTER + 86, y = GROUND;
    ctx.fillStyle = '#7a4a2a';
    ctx.fillRect(x - 3, y - 9, 6, 9);
    for (const [dy, w] of [[-9, 18], [-22, 14], [-33, 10]]) {
      ctx.beginPath();
      ctx.moveTo(x - w, y + dy); ctx.lineTo(x, y + dy - 18); ctx.lineTo(x + w, y + dy);
      ctx.closePath();
      ctx.fillStyle = '#2e8b57';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    [['#e8455d', -8, -14], ['#ffd84a', 7, -24], ['#6f8fe8', -4, -32], ['#e8455d', 5, -12]].forEach(([c, dx, dy], i) =>
      ellipse(ctx, x + dx, y + dy, 2.6, 2.6, (Math.floor(t * 2) + i) % 3 ? c : '#fff'));
    ellipse(ctx, x, y - 53, 4, 4, '#ffd84a', INK, 1.5);
  } else if (v.decor === 'cake') {
    // Gâteau d'anniversaire avec une bougie qui vacille
    const x = CENTER - 84, y = GROUND;
    ctx.fillStyle = '#ffd1dc';
    ctx.fillRect(x - 15, y - 18, 30, 18);
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.strokeRect(x - 15, y - 18, 30, 18);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 15, y - 18, 30, 5);
    ctx.fillStyle = '#6f8fe8';
    ctx.fillRect(x - 1.5, y - 28, 3, 10);
    ellipse(ctx, x + Math.sin(t * 12) * 0.8, y - 31, 2.5, 4, '#ffb52e');
  } else if (v.decor === 'spring') {
    // Œufs de Pâques et fleurs dans l'herbe
    [['#ff9fc6', -86], ['#9fe3bd', -72], ['#ffe17a', 80]].forEach(([c, dx]) => {
      ellipse(ctx, CENTER + dx, GROUND - 8, 6, 8, c, INK, 1.8);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(CENTER + dx - 5, GROUND - 8); ctx.lineTo(CENTER + dx + 5, GROUND - 8);
      ctx.stroke();
    });
  }
}

// Devant l'animal : ce qui vole ou tombe
function drawDecorFront(ctx, v) {
  const t = v.t;
  if (v.decor === 'snow') {
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    for (let i = 0; i < 28; i++) {
      const speed = 14 + (i % 4) * 6;
      const x = (i * 53 + Math.sin(t + i) * 8) % 240;
      const y = (t * speed + i * 37) % 300;
      ctx.beginPath();
      ctx.arc(x, y, 1.4 + (i % 3) * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (v.decor === 'halloween') {
    // Deux chauves-souris qui volettent
    for (let i = 0; i < 2; i++) {
      const x = 120 + Math.sin(t * 0.7 + i * 3) * 95;
      const y = 120 + i * 30 + Math.sin(t * 2 + i) * 15;
      const flap = Math.sin(t * 14 + i) * 5;
      ctx.fillStyle = '#2b1d33';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x - 7, y - 6 - flap, x - 14, y - flap);
      ctx.quadraticCurveTo(x - 8, y + 1, x, y + 3);
      ctx.quadraticCurveTo(x + 8, y + 1, x + 14, y - flap);
      ctx.quadraticCurveTo(x + 7, y - 6 - flap, x, y);
      ctx.fill();
      ellipse(ctx, x, y + 1, 3, 3.5, '#2b1d33');
    }
  } else if (v.decor === 'fireworks') {
    // Bouquets de feu d'artifice qui éclatent à tour de rôle
    const colors = ['#ffd84a', '#ff6f91', '#6fd3ff', '#9fe3bd'];
    for (let i = 0; i < 3; i++) {
      const phase = (t / 2.2 + i / 3) % 1;
      const seed = Math.floor(t / 2.2 + i / 3) * 7 + i;
      const cx = 40 + (seed * 61) % 160, cy = 40 + (seed * 37) % 90;
      ctx.globalAlpha = Math.max(0, 1 - phase);
      ctx.fillStyle = colors[seed % 4];
      for (let k = 0; k < 12; k++) {
        const a = k * Math.PI / 6;
        const d = phase * 32;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d + phase * phase * 10, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    drawConfetti(ctx, t, 14);
  } else if (v.decor === 'confetti') {
    drawConfetti(ctx, t, 22);
  } else if (v.decor === 'hearts') {
    for (let i = 0; i < 6; i++) {
      const k = (t * 0.25 + i / 6) % 1;
      ctx.globalAlpha = Math.sin(k * Math.PI);
      heart(ctx, 25 + ((i * 71) % 190) + Math.sin(t * 2 + i) * 6, 290 - k * 230, 9, '#ff6f91');
    }
    ctx.globalAlpha = 1;
  }
}

function drawConfetti(ctx, t, n) {
  const colors = ['#ffd84a', '#ff6f91', '#6fd3ff', '#9fe3bd', '#cdb8ff'];
  for (let i = 0; i < n; i++) {
    const x = (i * 47 + Math.sin(t * 1.5 + i) * 10) % 240;
    const y = (t * (18 + (i % 5) * 5) + i * 41) % 300;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 3 + i);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(-3, -1.5, 6, 3);
    ctx.restore();
  }
}

// ---- Rendu, avec passage optionnel en pixel art ----

const lowRes = document.createElement('canvas');
lowRes.width = Math.ceil(240 / PIXEL);
lowRes.height = Math.ceil(300 / PIXEL);
const lowCtx = lowRes.getContext('2d', { willReadFrequently: true });

function pixelate() {
  const { width: w, height: h } = lowRes;
  const img = lowCtx.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (d[o + 3] > 90) {
      solid[i] = 1;
      d[o + 3] = 255;
      // Palette réduite : 6 niveaux par canal
      for (let c = 0; c < 3; c++) d[o + c] = Math.round(d[o + c] / 51) * 51;
    } else {
      d[o + 3] = 0;
    }
  }
  // Contour sombre d'un pixel autour de la silhouette
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (solid[i]) continue;
      if ((x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) ||
          (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w])) {
        const o = i * 4;
        d[o] = 43; d[o + 1] = 29; d[o + 2] = 43; d[o + 3] = 255;
      }
    }
  }
  lowCtx.putImageData(img, 0, 0);
}

const Draw = {
  GROUND,
  CENTER,

  // Haut de la tête au repos (sans saut ni respiration), pour caler le panneau juste au-dessus
  restTop(stage, species) {
    if (stage === 'egg') return GROUND - 82;
    return geometry(stage, species || 'chat').top - 6;
  },

  // v : { stage, species, mood, eyes, mouth, color, care, t, anim, animT, facing, walking, eggProgress, style }
  render(ctx, v) {
    ctx.clearRect(0, 0, 240, 300);
    const pixel = v.style === 'pixel';
    const target = pixel ? lowCtx : ctx;
    if (pixel) {
      lowCtx.setTransform(1, 0, 0, 1, 0, 0);
      lowCtx.clearRect(0, 0, lowRes.width, lowRes.height);
      lowCtx.setTransform(1 / PIXEL, 0, 0, 1 / PIXEL, 0, 0);
    }
    target.save();
    if (v.decor) drawDecorBack(target, v);
    const box = v.stage === 'egg' ? drawEgg(target, v) : drawCreature(target, v);
    if (v.decor) drawDecorFront(target, v);
    target.restore();
    if (pixel) {
      pixelate();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(lowRes, 0, 0, lowRes.width * PIXEL, lowRes.height * PIXEL);
    }
    return box;
  },
};
