#!/usr/bin/env node
// Generates the PWA icons. Written by hand with zlib so the repo needs no
// image dependencies; run `npm run icons` after changing the artwork.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = path.join(ROOT, 'docs', 'icons');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

class Canvas {
  constructor(size) {
    this.size = size;
    this.data = Buffer.alloc(size * size * 4);
  }

  blend(x, y, [r, g, b], alpha) {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const i = (y * this.size + x) * 4;
    const a = Math.min(1, alpha);
    const existing = this.data[i + 3] / 255;
    const out = a + existing * (1 - a);
    for (let c = 0; c < 3; c++) {
      const src = [r, g, b][c];
      this.data[i + c] = Math.round((src * a + this.data[i + c] * existing * (1 - a)) / (out || 1));
    }
    this.data[i + 3] = Math.round(out * 255);
  }

  /** Anti-aliased rounded rectangle via a signed distance function. */
  roundedRect(x0, y0, w, h, radius, colorAt) {
    const cx = x0 + w / 2;
    const cy = y0 + h / 2;
    const hx = w / 2 - radius;
    const hy = h / 2 - radius;
    for (let y = Math.floor(y0) - 2; y < Math.ceil(y0 + h) + 2; y++) {
      for (let x = Math.floor(x0) - 2; x < Math.ceil(x0 + w) + 2; x++) {
        const dx = Math.abs(x + 0.5 - cx) - hx;
        const dy = Math.abs(y + 0.5 - cy) - hy;
        const distance = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
        const coverage = Math.min(1, Math.max(0, 0.5 - distance));
        if (coverage > 0) this.blend(x, y, colorAt(x, y), coverage);
      }
    }
  }

  outline(points, width, color) {
    const radius = width / 2;
    const edges = points.map(([x, y], i) => {
      const [nx, ny] = points[(i + 1) % points.length];
      return { x, y, dx: nx - x, dy: ny - y };
    });
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let distance = Infinity;
        for (const edge of edges) {
          const px = x + 0.5 - edge.x;
          const py = y + 0.5 - edge.y;
          const t = Math.max(0, Math.min(1, (px * edge.dx + py * edge.dy) / (edge.dx ** 2 + edge.dy ** 2)));
          distance = Math.min(distance, Math.hypot(px - t * edge.dx, py - t * edge.dy));
        }
        this.blend(x, y, color, radius + 0.5 - distance);
      }
    }
  }

  toPng() {
    return encodePng(this.size, this.size, this.data);
  }
}

const BACKGROUND = [57, 37, 25];
const ACCENT = [255, 187, 117];
const FUNNEL = [[14, 17], [50, 17], [37, 33], [37, 46], [27, 51], [27, 33]];
const hex = (color) => `#${color.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

function drawIcon(size, { maskable = false } = {}) {
  const scale = size / 64;
  const canvas = new Canvas(size);
  canvas.roundedRect(0, 0, size, size, maskable ? 0 : 14 * scale, () => BACKGROUND);
  const markScale = maskable ? 0.76 : 1;
  const points = FUNNEL.map((point) => point.map((coord) => (32 + (coord - 32) * markScale) * scale));
  canvas.outline(points, 6 * scale * markScale, ACCENT);
  return canvas.toPng();
}

function encodeIco(sizes) {
  const directory = Buffer.alloc(6 + sizes.length * 16);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(sizes.length, 4);
  let offset = directory.length;
  const images = sizes.map((size, index) => {
    const png = drawIcon(size);
    const cursor = 6 + index * 16;
    directory[cursor] = directory[cursor + 1] = size;
    directory.writeUInt16LE(1, cursor + 4);
    directory.writeUInt16LE(32, cursor + 6);
    directory.writeUInt32LE(png.length, cursor + 8);
    directory.writeUInt32LE(offset, cursor + 12);
    offset += png.length;
    return png;
  });
  return Buffer.concat([directory, ...images]);
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="InfoCollect">
  <rect width="64" height="64" rx="14" fill="${hex(BACKGROUND)}"/>
  <polygon points="${FUNNEL.map((point) => point.join(',')).join(' ')}" fill="none" stroke="${hex(ACCENT)}" stroke-width="6" stroke-linejoin="round"/>
</svg>
`;

fs.mkdirSync(ICON_DIR, { recursive: true });
fs.writeFileSync(path.join(ICON_DIR, 'favicon.ico'), encodeIco([16, 32, 48]));
fs.writeFileSync(path.join(ICON_DIR, 'apple-touch-icon.png'), drawIcon(180));
fs.writeFileSync(path.join(ICON_DIR, 'icon-192.png'), drawIcon(192));
fs.writeFileSync(path.join(ICON_DIR, 'icon-512.png'), drawIcon(512));
fs.writeFileSync(path.join(ICON_DIR, 'maskable-512.png'), drawIcon(512, { maskable: true }));
fs.writeFileSync(path.join(ICON_DIR, 'favicon.svg'), SVG);
console.log('icons written to docs/icons/');
