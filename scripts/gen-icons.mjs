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
        const dx = Math.max(Math.abs(x + 0.5 - cx) - hx, 0);
        const dy = Math.max(Math.abs(y + 0.5 - cy) - hy, 0);
        const distance = Math.hypot(dx, dy) - radius;
        const coverage = Math.min(1, Math.max(0, 0.5 - distance));
        if (coverage > 0) this.blend(x, y, colorAt(x, y), coverage);
      }
    }
  }

  circle(cx, cy, radius, color) {
    for (let y = Math.floor(cy - radius) - 2; y <= Math.ceil(cy + radius) + 2; y++) {
      for (let x = Math.floor(cx - radius) - 2; x <= Math.ceil(cx + radius) + 2; x++) {
        const coverage = Math.min(1, Math.max(0, 0.5 - (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - radius)));
        if (coverage > 0) this.blend(x, y, color, coverage);
      }
    }
  }

  toPng() {
    return encodePng(this.size, this.size, this.data);
  }
}

const NAVY_TOP = [17, 26, 51];
const NAVY_BOTTOM = [8, 12, 27];
const ACCENT = [110, 168, 255];
const MINT = [124, 224, 192];

function drawIcon(size, { maskable = false } = {}) {
  const canvas = new Canvas(size);
  const backgroundRadius = maskable ? 0 : size * 0.22;
  canvas.roundedRect(0, 0, size, size, backgroundRadius, (_x, y) => {
    const t = y / size;
    return NAVY_TOP.map((value, i) => Math.round(value + (NAVY_BOTTOM[i] - value) * t));
  });

  // Ascending bars: "signal that keeps growing".
  const inset = maskable ? size * 0.28 : size * 0.22;
  const barArea = size - inset * 2;
  const barWidth = barArea * 0.2;
  const gap = (barArea - barWidth * 3) / 2;
  const heights = [0.42, 0.66, 1];
  for (let i = 0; i < 3; i++) {
    const height = barArea * heights[i];
    const x = inset + i * (barWidth + gap);
    const y = inset + barArea - height;
    const color = i === 2 ? MINT : ACCENT;
    canvas.roundedRect(x, y, barWidth, height, barWidth / 2, () => color);
  }

  // Pulse dot above the tallest bar.
  const dotRadius = barWidth * 0.42;
  canvas.circle(inset + 2 * (barWidth + gap) + barWidth / 2, inset - dotRadius * 1.1, dotRadius, MINT);
  return canvas.toPng();
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="InfoCollect">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#111a33"/><stop offset="1" stop-color="#080c1b"/>
  </linearGradient></defs>
  <rect width="64" height="64" rx="14" fill="url(#bg)"/>
  <rect x="14" y="35" width="8" height="15" rx="4" fill="#6ea8ff"/>
  <rect x="28" y="27" width="8" height="23" rx="4" fill="#6ea8ff"/>
  <rect x="42" y="14" width="8" height="36" rx="4" fill="#7ce0c0"/>
  <circle cx="46" cy="8" r="3.4" fill="#7ce0c0"/>
</svg>
`;

fs.mkdirSync(ICON_DIR, { recursive: true });
fs.writeFileSync(path.join(ICON_DIR, 'icon-192.png'), drawIcon(192));
fs.writeFileSync(path.join(ICON_DIR, 'icon-512.png'), drawIcon(512));
fs.writeFileSync(path.join(ICON_DIR, 'maskable-512.png'), drawIcon(512, { maskable: true }));
fs.writeFileSync(path.join(ICON_DIR, 'favicon.svg'), SVG);
console.log('icons written to docs/icons/');
