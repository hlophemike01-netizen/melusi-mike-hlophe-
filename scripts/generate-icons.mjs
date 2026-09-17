/**
 * Generates the PWA icon set.
 *
 * Writes minimal, valid PNGs with no image library: a solid brand-teal square
 * with a white ring (the "circle" in Mwhite SafeCircle). Replace these with real
 * artwork before launch — they exist so the manifest is valid and the app is
 * installable from a fresh clone.
 */
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BRAND = [31, 123, 120]; // #1f7b78
const WHITE = [255, 255, 255];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function png(size, { maskable }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const centre = (size - 1) / 2;
  // Maskable icons get a smaller mark so it survives a circular crop.
  const outer = size * (maskable ? 0.3 : 0.38);
  const inner = size * (maskable ? 0.2 : 0.26);
  const dot = size * (maskable ? 0.07 : 0.09);

  const raw = Buffer.alloc((size * 3 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0; // filter: none
    offset += 1;
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - centre, y - centre);
      const isRing = distance <= outer && distance >= inner;
      const isDot = distance <= dot;
      const colour = isRing || isDot ? WHITE : BRAND;
      raw[offset] = colour[0];
      raw[offset + 1] = colour[1];
      raw[offset + 2] = colour[2];
      offset += 3;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: false }],
];

for (const [name, size, options] of targets) {
  const buffer = png(size, options);
  writeFileSync(resolve(outDir, name), buffer);
  const digest = createHash('sha256').update(buffer).digest('hex').slice(0, 8);
  console.log(`wrote public/icons/${name} (${size}x${size}, ${buffer.length} bytes, ${digest})`);
}
