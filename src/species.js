// Ce qui distingue chaque espèce : proportions, oreilles, queue, visage et détails (ailes, corne…).
// Utilise les outils de dessin de draw.js (ellipse, shade, INK, drawEyes, drawMouth…).

const RAINBOW = ['#ff6f91', '#ffb347', '#ffe17a', '#8fd16a', '#6fc3ff', '#b58cff'];
const BLACK_FUR = '#2f2b33';

// Hauteur de ce qui dépasse au-dessus de la tête (oreilles, corne…), en fraction de la taille
const TOP_EXTRA = {
  chat: 0.45, lapin: 0.95, ours: 0.22, chien: 0.12, renard: 0.62, panda: 0.22, pingouin: 0.02,
  hamster: 0.14, koala: 0.3, grenouille: 0.3, licorne: 0.78, dragon: 0.5,
};

// Espèces aux couleurs naturelles imposées (la couleur choisie ne s'applique pas)
const FIXED_BODY = { panda: '#f6f4f1', pingouin: '#36415c' };

// Proportions du petit animal : grosse tête ronde posée sur un petit corps (style chibi)
function geometry(stage, species, jump = 0, squash = 1) {
  const r = SIZES[stage] || SIZES.baby;
  const bodyRx = r * 0.72 * squash;
  const bodyRy = r * 0.55 / squash;
  const bodyCy = GROUND - bodyRy * 0.95 - jump;
  const headRx = r * 1.0;
  const headRy = r * 0.86;
  const headCy = bodyCy - bodyRy * 0.55 - headRy * 0.75 + (squash - 1) * r * 2;
  const earH = TOP_EXTRA[species] !== undefined ? TOP_EXTRA[species] : 0.45;
  return { r, bodyRx, bodyRy, bodyCy, headRx, headRy, headCy, top: headCy - headRy - r * earH };
}

// Oreille pointue (chat, renard, licorne) ; scale agrandit ou réduit, tip colore la pointe
function pointyEar(ctx, x, y, side, r, scale, body, inner, tip) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(side * 0.3);
  const w = r * 0.36 * scale, h = r * 0.72 * scale;
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.quadraticCurveTo(-w * 0.25, -h, 0, -h);
  ctx.quadraticCurveTo(w * 0.25, -h, w, 0);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  if (tip) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = tip;
    ctx.fillRect(-w, -h, w * 2, h * 0.38);
    ctx.restore();
  }
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
  ctx.restore();
}

// Oreilles (et cornes) dessinées derrière la tête
function drawEars(ctx, species, cx, g, body, inner, t) {
  const { r, headRx, headRy, headCy } = g;
  for (const side of [-1, 1]) {
    if (species === 'lapin') {
      // Longues oreilles ; l'une se plie légèrement et bouge
      ctx.save();
      const flop = side > 0 ? 0.35 + Math.sin(t * 2) * 0.05 : -0.12;
      ctx.translate(cx + side * headRx * 0.38, headCy - headRy * 0.7);
      ctx.rotate(flop);
      ellipse(ctx, 0, -r * 0.55, r * 0.22, r * 0.6, body, INK, 2.5);
      ellipse(ctx, 0, -r * 0.5, r * 0.1, r * 0.42, inner);
      ctx.restore();
    } else if (species === 'ours' || species === 'panda') {
      const c = species === 'panda' ? BLACK_FUR : body;
      ellipse(ctx, cx + side * headRx * 0.68, headCy - headRy * 0.7, r * 0.26, r * 0.25, c, INK, 2.5);
      if (species === 'ours') ellipse(ctx, cx + side * headRx * 0.68, headCy - headRy * 0.68, r * 0.13, r * 0.12, inner);
    } else if (species === 'koala') {
      ellipse(ctx, cx + side * headRx * 0.86, headCy - headRy * 0.5, r * 0.38, r * 0.36, body, INK, 2.5);
      ellipse(ctx, cx + side * headRx * 0.9, headCy - headRy * 0.48, r * 0.22, r * 0.2, shade(body, 0.25));
    } else if (species === 'hamster') {
      ellipse(ctx, cx + side * headRx * 0.6, headCy - headRy * 0.8, r * 0.16, r * 0.15, body, INK, 2.2);
      ellipse(ctx, cx + side * headRx * 0.6, headCy - headRy * 0.78, r * 0.08, r * 0.08, inner);
    } else if (species === 'renard') {
      pointyEar(ctx, cx + side * headRx * 0.55, headCy - headRy * 0.5, side, r, 1.3, body, '#fff6ef', BLACK_FUR);
    } else if (species === 'licorne') {
      pointyEar(ctx, cx + side * headRx * 0.58, headCy - headRy * 0.6, side, r, 0.7, body, inner);
    } else if (species === 'dragon') {
      // Petites cornes recourbées
      ctx.save();
      ctx.translate(cx + side * headRx * 0.42, headCy - headRy * 0.78);
      ctx.beginPath();
      ctx.moveTo(-r * 0.09, 0);
      ctx.quadraticCurveTo(side * r * 0.05, -r * 0.35, side * r * 0.22, -r * 0.45);
      ctx.quadraticCurveTo(side * r * 0.06, -r * 0.2, r * 0.09, 0);
      ctx.closePath();
      ctx.fillStyle = '#fff1c9';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.restore();
    } else if (species === 'chat') {
      pointyEar(ctx, cx + side * headRx * 0.55, headCy - headRy * 0.55, side, r, 1, body, inner);
    }
    // chien : oreilles tombantes dessinées devant la tête ; grenouille, pingouin : pas d'oreilles
  }
}

function strokeTail(ctx, path, w, color) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path();
  ctx.lineWidth = w + 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  path();
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawTail(ctx, species, cx, g, body, side, t, coat) {
  const { r, bodyRx, bodyRy, bodyCy } = g;
  const x = cx + side * bodyRx * 0.85;
  const y = bodyCy + bodyRy * 0.2;
  const sway = Math.sin(t * 2.2) * r * 0.15;
  const curve = (k = 1, s = sway) => () => {
    ctx.beginPath();
    ctx.moveTo(x - side * r * 0.1, y);
    ctx.bezierCurveTo(x + side * r * 0.55 * k, y + r * 0.1, x + side * r * 0.6 * k + s, y - r * 0.6 * k, x + side * r * 0.3 * k + s, y - r * 0.8 * k);
  };
  if (species === 'chat') {
    const w = r * (coat && coat.fluffy ? 0.36 : 0.22); // queue touffue pour les poils longs
    strokeTail(ctx, curve(), w, body);
    if (coat && coat.tailTip) ellipse(ctx, x + side * r * 0.3 + sway, y - r * 0.8, w * 0.55, w * 0.55, coat.tailTip);
  } else if (species === 'chien') {
    // Petite queue qui remue vite
    strokeTail(ctx, curve(0.6, Math.sin(t * 9) * r * 0.18), r * 0.18, body);
  } else if (species === 'renard') {
    // Grosse queue touffue au bout blanc
    strokeTail(ctx, curve(1.1), r * 0.5, body);
    ellipse(ctx, x + side * r * 0.33 + sway, y - r * 0.88, r * 0.22, r * 0.2, '#fff6ef', INK, 2);
  } else if (species === 'licorne') {
    // Queue arc-en-ciel : une mèche par couleur
    RAINBOW.forEach((c, i) => {
      const off = (i - 2.5) * r * 0.05;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - side * r * 0.1, y + off);
      ctx.bezierCurveTo(x + side * r * 0.5, y + off, x + side * r * 0.7 + sway, y + r * 0.2 + off, x + side * r * 0.55 + sway, y + r * 0.55 + off);
      ctx.lineWidth = r * 0.07;
      ctx.strokeStyle = c;
      ctx.stroke();
    });
  } else if (species === 'dragon') {
    // Longue queue qui ondule, terminée par une pointe
    const tx = x + side * r * 0.85, ty = y + r * 0.35 + Math.sin(t * 2) * 3;
    strokeTail(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(x - side * r * 0.1, y);
      ctx.quadraticCurveTo(x + side * r * 0.5, y + r * 0.45, tx, ty);
    }, r * 0.2, body);
    ctx.beginPath();
    ctx.moveTo(tx, ty - r * 0.14);
    ctx.lineTo(tx + side * r * 0.25, ty);
    ctx.lineTo(tx, ty + r * 0.14);
    ctx.closePath();
    ctx.fillStyle = shade(body, -0.12);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
  } else if (species === 'lapin' || species === 'ours' || species === 'panda') {
    const s = species === 'lapin' ? 0.24 : 0.15;
    const c = species === 'lapin' ? shade(body, 0.12) : species === 'panda' ? BLACK_FUR : body;
    ellipse(ctx, x + side * r * 0.05, y, r * s, r * s, c, INK, 2.5);
  }
  // hamster, koala, pingouin, grenouille : pas de queue visible
}

// Couches de détails propres à l'espèce, appelées par drawCreature :
//   back : derrière le corps (ailes)        body : sur le corps (ventre, ailerons)
//   head : sur la tête, avant le visage      top  : par-dessus le visage (corne)
function speciesLayer(ctx, layer, species, cx, g, body, v) {
  const { r, bodyRx, bodyRy, bodyCy, headRx, headRy, headCy } = g;
  const t = v.t;
  const clipTo = (x, y, rx, ry, draw) => {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    draw();
    ctx.restore();
  };

  if (layer === 'back' && species === 'dragon') {
    // Petites ailes qui battent
    const flap = Math.sin(t * (v.walking ? 10 : 3)) * 0.18;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(cx + side * bodyRx * 0.5, bodyCy - bodyRy * 0.55);
      ctx.rotate(side * (0.25 + flap));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(side * r * 0.75, -r * 0.55);
      ctx.quadraticCurveTo(side * r * 0.62, -r * 0.2, side * r * 0.72, r * 0.05);
      ctx.quadraticCurveTo(side * r * 0.45, -r * 0.05, side * r * 0.42, r * 0.18);
      ctx.quadraticCurveTo(side * r * 0.22, r * 0.02, 0, r * 0.15);
      ctx.closePath();
      ctx.fillStyle = shade(body, 0.12);
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.restore();
    }
  }

  if (layer === 'body') {
    if (species === 'panda') {
      // Épaules et bras noirs
      clipTo(cx, bodyCy, bodyRx, bodyRy, () => ellipse(ctx, cx, bodyCy - bodyRy * 0.45, bodyRx * 1.05, bodyRy * 0.42, BLACK_FUR));
      ellipse(ctx, cx, bodyCy, bodyRx, bodyRy, null, INK, 3);
    } else if (species === 'pingouin') {
      ellipse(ctx, cx, bodyCy + bodyRy * 0.12, bodyRx * 0.64, bodyRy * 0.82, '#fbf8f4');
      for (const side of [-1, 1]) {
        // Ailerons
        ctx.save();
        ctx.translate(cx + side * bodyRx * 0.95, bodyCy - bodyRy * 0.05);
        ctx.rotate(side * (0.35 + Math.sin(t * 3) * 0.08));
        ellipse(ctx, 0, r * 0.12, r * 0.13, r * 0.36, body, INK, 2.5);
        ctx.restore();
      }
    } else if (species === 'dragon') {
      // Ventre à écailles
      ctx.strokeStyle = shade(body, -0.15);
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, bodyCy - bodyRy * 0.25 + i * bodyRy * 0.3, bodyRx * 0.42, 0.2 * Math.PI, 0.8 * Math.PI);
        ctx.stroke();
      }
    }
  }

  if (layer === 'head') {
    const ey = headCy + headRy * 0.02;
    const gap = headRx * 0.4;
    if (species === 'panda') {
      // Taches noires autour des yeux
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(cx + side * gap * 1.08 + v.facing * 2, ey + r * 0.06);
        ctx.rotate(side * -0.65);
        ellipse(ctx, 0, 0, r * 0.26, r * 0.34, BLACK_FUR);
        ctx.restore();
      }
    } else if (species === 'pingouin') {
      // Masque blanc en forme de cœur
      clipTo(cx, headCy, headRx, headRy, () => {
        ctx.fillStyle = '#fbf8f4';
        ctx.beginPath();
        ctx.arc(cx - headRx * 0.32, headCy - headRy * 0.05, headRx * 0.42, 0, Math.PI * 2);
        ctx.arc(cx + headRx * 0.32, headCy - headRy * 0.05, headRx * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ellipse(ctx, cx, headCy + headRy * 0.4, headRx * 0.66, headRy * 0.52, '#fbf8f4');
      });
      ellipse(ctx, cx, headCy, headRx, headRy, null, INK, 3);
    } else if (species === 'renard') {
      // Joues et museau blancs
      clipTo(cx, headCy, headRx, headRy, () => {
        for (const side of [-1, 1]) ellipse(ctx, cx + side * headRx * 0.45, headCy + headRy * 0.55, headRx * 0.5, headRy * 0.42, '#fff6ef');
      });
      ellipse(ctx, cx, headCy, headRx, headRy, null, INK, 3);
    } else if (species === 'hamster') {
      // Grosses bajoues
      for (const side of [-1, 1]) ellipse(ctx, cx + side * headRx * 0.6, headCy + headRy * 0.3, r * 0.3, r * 0.24, shade(body, 0.16));
    } else if (species === 'chien') {
      // Oreilles tombantes
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(cx + side * headRx * 0.9, headCy - headRy * 0.15);
        ctx.rotate(side * (0.3 + Math.sin(t * 2 + side) * 0.04));
        ellipse(ctx, 0, r * 0.18, r * 0.22, r * 0.46, shade(body, -0.18), INK, 2.5);
        ctx.restore();
      }
    } else if (species === 'grenouille') {
      // Yeux posés sur le dessus de la tête, et quelques taches
      for (const side of [-1, 1]) ellipse(ctx, cx + side * headRx * 0.48, headCy - headRy * 0.62, r * 0.3, r * 0.28, body, INK, 2.5);
      for (const [dx, dy] of [[-0.55, 0.15], [0.6, 0.25], [0.1, -0.25]]) ellipse(ctx, cx + dx * headRx, headCy + dy * headRy, r * 0.07, r * 0.06, shade(body, -0.15));
    } else if (species === 'licorne') {
      // Crinière arc-en-ciel sur le haut de la tête
      RAINBOW.forEach((c, i) => {
        const a = Math.PI * (1.12 + i * 0.07);
        ellipse(ctx, cx + Math.cos(a) * headRx * 0.95, headCy + Math.sin(a) * headRy * 0.95, r * 0.15, r * 0.15, c, INK, 1.5);
      });
    }
  }

  if (layer === 'top' && species === 'licorne' && !v.nightcap) {
    // Corne dorée torsadée
    const bx = cx, by = headCy - headRy * 0.72;
    ctx.beginPath();
    ctx.moveTo(bx - r * 0.13, by);
    ctx.lineTo(bx, by - r * 0.72);
    ctx.lineTo(bx + r * 0.13, by);
    ctx.closePath();
    ctx.fillStyle = '#ffd84a';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.strokeStyle = '#e0a92a';
    ctx.lineWidth = 1.5;
    for (let k = 1; k <= 3; k++) {
      const y = by - r * 0.18 * k, w = r * 0.13 * (1 - k * 0.24);
      ctx.beginPath();
      ctx.moveTo(bx - w, y + r * 0.04);
      ctx.lineTo(bx + w, y - r * 0.04);
      ctx.stroke();
    }
  }
}

// Couleur des pattes selon l'espèce (null = couleur du corps)
function pawColor(species, coat) {
  if (species === 'panda') return BLACK_FUR;
  if (species === 'pingouin') return '#ffa63d';
  return coat && coat.paws ? WHITE_FUR : null;
}

function drawFace(ctx, v, cx, g) {
  const { r, headRx, headRy, headCy } = g;
  const sp = v.species;
  const fx = cx + v.facing * 3;
  const er = r * 0.14;
  // La grenouille a les yeux sur le dessus de la tête
  const ey = sp === 'grenouille' ? headCy - headRy * 0.62 : headCy + headRy * 0.02;
  const gap = sp === 'grenouille' ? headRx * 0.48 : headRx * 0.4;
  const mouthY = sp === 'grenouille' ? headCy + headRy * 0.32 : ey + er * 2.1;

  ellipse(ctx, fx - headRx * 0.66, headCy + headRy * 0.02 + er * 1.5, headRx * 0.15, headRy * 0.09, 'rgba(255,110,140,.45)');
  ellipse(ctx, fx + headRx * 0.66, headCy + headRy * 0.02 + er * 1.5, headRx * 0.15, headRy * 0.09, 'rgba(255,110,140,.45)');

  if (sp === 'ours' || sp === 'chien') {
    ellipse(ctx, fx, mouthY - er * 0.2, headRx * 0.3, headRy * 0.24, shade(v.bodyColor, 0.14), INK, 2);
  }
  drawEyes(ctx, v, cx, ey, gap, er);

  // Nez (ou bec, ou narines)
  const ny = headCy + headRy * 0.02 + er * 1.35;
  if (sp === 'pingouin') {
    ctx.beginPath();
    ctx.moveTo(fx - r * 0.1, ny - r * 0.04);
    ctx.lineTo(fx + r * 0.1, ny - r * 0.04);
    ctx.lineTo(fx, ny + r * 0.12);
    ctx.closePath();
    ctx.fillStyle = '#ffa63d';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = INK;
    ctx.stroke();
  } else if (sp === 'koala') {
    ellipse(ctx, fx, ny, r * 0.13, r * 0.16, BLACK_FUR);
    ellipse(ctx, fx - r * 0.04, ny - r * 0.06, r * 0.03, r * 0.04, 'rgba(255,255,255,.6)');
  } else if (sp === 'ours' || sp === 'chien' || sp === 'panda' || sp === 'renard') {
    ellipse(ctx, fx, ny, r * (sp === 'chien' ? 0.1 : 0.08), r * (sp === 'chien' ? 0.07 : 0.055), v.dark && sp !== 'panda' ? '#1c1720' : INK);
  } else if (sp === 'grenouille' || sp === 'dragon') {
    for (const side of [-1, 1]) ellipse(ctx, fx + side * r * 0.06, sp === 'grenouille' ? headCy + headRy * 0.12 : ny, r * 0.025, r * 0.02, INK);
  } else {
    ellipse(ctx, fx, ny, r * 0.055, r * 0.04, '#ff7d96', INK, 1.5);
  }

  if ((sp === 'chat' || sp === 'renard' || sp === 'hamster') && v.mood !== 'dead') {
    // Moustaches
    const len = sp === 'hamster' ? 0.75 : 0.95;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = faceInk(v);
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      for (const dy of [-0.06, 0.08]) {
        ctx.beginPath();
        ctx.moveTo(fx + side * headRx * 0.55, ny + r * dy);
        ctx.lineTo(fx + side * headRx * len, ny + r * dy * 2.2 - r * 0.03);
        ctx.stroke();
      }
    }
  }
  drawMouth(ctx, v, fx, mouthY - er * 0.3, r * (sp === 'grenouille' ? 0.22 : 0.12));
  if (sp === 'hamster' && v.mouth !== 'chomp') {
    // Deux petites dents
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = INK;
    for (const side of [-1, 1]) {
      ctx.fillRect(fx + side * r * 0.035 - r * 0.03, mouthY - er * 0.05, r * 0.06, r * 0.08);
      ctx.strokeRect(fx + side * r * 0.035 - r * 0.03, mouthY - er * 0.05, r * 0.06, r * 0.08);
    }
  }
  if (v.mood === 'sick' && !v.anim) drawThermometer(ctx, fx + r * 0.1, mouthY - er * 0.1, r);
  return mouthY;
}
