// Génère assets/icon.png (512x512, taille minimale exigée pour Mac) sans dépendance :
// une petite boule rose avec un visage.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 512;
const K = S / 256; // le dessin est décrit sur une grille de 256
const px = Buffer.alloc(S * S * 4);

function set(x, y, [r, g, b], a = 255) {
  const i = (y * S + x) * 4;
  const k = a / 255;
  px[i] = Math.round(r * k + px[i] * (1 - k));
  px[i + 1] = Math.round(g * k + px[i + 1] * (1 - k));
  px[i + 2] = Math.round(b * k + px[i + 2] * (1 - k));
  px[i + 3] = Math.max(px[i + 3], a);
}

// Ellipse avec un bord adouci
function ellipse(cx, cy, rx, ry, color) {
  cx *= K; cy *= K; rx *= K; ry *= K;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      const edge = (1 - d) * Math.min(rx, ry);
      if (edge > 0) set(x, y, color, Math.round(255 * Math.min(1, edge)));
    }
  }
}

ellipse(128, 140, 112, 100, [70, 40, 60]);
ellipse(128, 140, 106, 94, [255, 170, 195]);
ellipse(100, 100, 30, 18, [255, 215, 228]);
ellipse(92, 140, 15, 21, [40, 25, 40]);
ellipse(164, 140, 15, 21, [40, 25, 40]);
ellipse(97, 132, 5, 6, [255, 255, 255]);
ellipse(169, 132, 5, 6, [255, 255, 255]);
ellipse(66, 172, 16, 9, [255, 120, 150]);
ellipse(190, 172, 16, 9, [255, 120, 150]);
ellipse(128, 176, 14, 10, [40, 25, 40]);
ellipse(128, 172, 14, 8, [255, 170, 195]);

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // profondeur
ihdr[9] = 6; // RGBA

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'assets', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('Icône générée :', out);
