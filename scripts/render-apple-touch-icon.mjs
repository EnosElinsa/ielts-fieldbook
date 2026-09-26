import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 180;
const NAVY = [0x14, 0x38, 0x48];
const CREAM = [0xfb, 0xf8, 0xf2];

function coversF(x, y) {
  const u = ((x + 0.5) / SIZE) * 32;
  const v = ((y + 0.5) / SIZE) * 32;
  const stem = u >= 9 && u < 13.2 && v >= 6 && v < 26;
  const top = u >= 9 && u < 23 && v >= 6 && v < 10.2;
  const mid = u >= 9 && u < 20 && v >= 14 && v < 18.2;
  return stem || top || mid;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 8 + data.length);
  return out;
}

const raw = Buffer.alloc(SIZE * (1 + SIZE * 3));
for (let y = 0; y < SIZE; y += 1) {
  const row = y * (1 + SIZE * 3);
  raw[row] = 0;
  for (let x = 0; x < SIZE; x += 1) {
    const px = coversF(x, y) ? CREAM : NAVY;
    const i = row + 1 + x * 3;
    raw[i] = px[0];
    raw[i + 1] = px[1];
    raw[i + 2] = px[2];
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(new URL('../public/apple-touch-icon.png', import.meta.url), png);
