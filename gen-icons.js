// gen-icons.js — génère icons/icon-192.png et icon-512.png sans dépendance.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const t = [...Buffer.from(type, 'binary')];
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcB = Buffer.alloc(4); crcB.writeUInt32BE(crc32([...t, ...data]));
  return Buffer.concat([len, Buffer.from(t), Buffer.from(data), crcB]);
};

function png(size) {
  const S = size;
  const px = (x, y) => [x, y];
  const inside = (x, y, pad) => {
    const r = S * 0.12;
    const cx = Math.max(pad + r, Math.min(x, S - pad - r));
    const cy = Math.max(pad + r, Math.min(y, S - pad - r));
    return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2 || (x > pad + r && x < S - pad - r) || false;
  };
  // fond arrondi #12131a, bordure arrondie, 3 touches blanches, 1 verte, 1 rouge
  const rows = [];
  const pad = S * 0.06;
  const keyTop = S * 0.28, keyBot = S * 0.88;
  const kx1 = S * 0.16, kx2 = S * 0.38, kx3 = S * 0.60, kx4 = S * 0.82;
  for (let y = 0; y < S; y++) {
    const row = Buffer.alloc(1 + S * 4);
    row[0] = 0;
    for (let x = 0; x < S; x++) {
      const o = 1 + x * 4;
      let r = 0, g = 0, b = 0, a = 0;
      if (inside(x, y, pad)) {
        [r, g, b, a] = [0x12, 0x13, 0x1a, 255];
        if (y > keyTop && y < keyBot) {
          const w = (S - 2 * pad) * 0.13;
          let col = null;
          if (x > kx1 && x < kx1 + w) col = [0xf4, 0xf4, 0xf4];
          else if (x > kx2 && x < kx2 + w) col = [0x4f, 0x7c, 0xff];
          else if (x > kx3 && x < kx3 + w) col = [0x2e, 0xcc, 0x71];
          else if (x > kx4 && x < kx4 + w) col = [0xe7, 0x4c, 0x3c];
          if (col) [r, g, b] = col;
        }
      }
      row[o] = r; row[o + 1] = g; row[o + 2] = b; row[o + 3] = a;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('icons', { recursive: true });
for (const s of [192, 512]) {
  writeFileSync(`icons/icon-${s}.png`, png(s));
  console.log(`icons/icon-${s}.png écrite`);
}
