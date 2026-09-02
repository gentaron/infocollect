#!/usr/bin/env node
// Bundles the PWA into docs/infocollect-pwa.zip so the app can be downloaded
// from the browser (the "ZIPで保存" button) and opened from any static server.
// Implemented directly on zlib to keep the repo dependency-free.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = path.join(ROOT, 'docs');
const OUTPUT = path.join(APP_DIR, 'infocollect-pwa.zip');
const EXCLUDE = new Set(['infocollect-pwa.zip', '.DS_Store']);

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

/** MS-DOS date/time as used by the ZIP local header. */
function dosDateTime(date) {
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2))) & 0xffff;
  const day = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
  return { time, day };
}

function walk(dir, prefix = '') {
  const entries = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (EXCLUDE.has(item.name)) continue;
    const relative = prefix ? `${prefix}/${item.name}` : item.name;
    const absolute = path.join(dir, item.name);
    if (item.isDirectory()) entries.push(...walk(absolute, relative));
    else if (item.isFile()) entries.push({ name: relative, path: absolute });
  }
  return entries;
}

const files = walk(APP_DIR);
const localParts = [];
const centralParts = [];
let offset = 0;

for (const file of files) {
  const content = fs.readFileSync(file.path);
  const deflated = zlib.deflateRawSync(content, { level: 9 });
  const useDeflate = deflated.length < content.length;
  const payload = useDeflate ? deflated : content;
  const method = useDeflate ? 8 : 0;
  const nameBuffer = Buffer.from(file.name, 'utf8');
  const crc = crc32(content);
  const { time, day } = dosDateTime(fs.statSync(file.path).mtime);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(day, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBuffer.length, 26);
  localParts.push(local, nameBuffer, payload);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(day, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(payload.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBuffer.length, 28);
  central.writeUInt32LE(0, 38); // external attributes
  central.writeUInt32LE(offset, 42);
  centralParts.push(central, nameBuffer);

  offset += local.length + nameBuffer.length + payload.length;
}

const centralDirectory = Buffer.concat(centralParts);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralDirectory.length, 12);
end.writeUInt32LE(offset, 16);

fs.writeFileSync(OUTPUT, Buffer.concat([...localParts, centralDirectory, end]));
const size = (fs.statSync(OUTPUT).size / 1024).toFixed(1);
console.log(`docs/infocollect-pwa.zip を作成しました (${files.length} ファイル / ${size} KB)`);
