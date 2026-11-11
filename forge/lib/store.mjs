// Board state. One JSON file for the current state, one append-only JSONL for
// history, both under FORGE_HOME (default ~/.forge). Writes are atomic
// (write temp + rename) and guarded by a lock file, so the CLI, the web
// server and a cron'd `forge tick` can all touch the board safely.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FORGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function home(env = process.env) {
  return path.resolve(env.FORGE_HOME || path.join(os.homedir(), '.forge'));
}

export const paths = (h) => ({
  home: h,
  board: path.join(h, 'board.json'),
  events: path.join(h, 'events.jsonl'),
  lock: path.join(h, 'board.lock'),
  runs: path.join(h, 'runs'),
  wt: path.join(h, 'wt'),
  config: path.join(h, 'config.json'),
  token: path.join(h, 'token'),
});

// ------------------------------------------------------------------ config

function merge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base?.[k] && typeof base[k] === 'object' ? merge(base[k], v) : v;
  }
  return out;
}

export function loadConfig(h = home()) {
  const base = JSON.parse(fs.readFileSync(path.join(FORGE_DIR, 'forge.config.json'), 'utf8'));
  try {
    return merge(base, JSON.parse(fs.readFileSync(paths(h).config, 'utf8')));
  } catch {
    return base;
  }
}

// ------------------------------------------------------------------ lock

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function withLock(h, fn, { staleMs = 30000, waitMs = 15000 } = {}) {
  const { lock } = paths(h);
  fs.mkdirSync(h, { recursive: true });
  const started = Date.now();
  for (;;) {
    try {
      fs.writeFileSync(lock, `${process.pid}\n`, { flag: 'wx' });
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > staleMs) fs.rmSync(lock, { force: true });
      } catch { /* raced: someone else removed it */ }
      if (Date.now() - started > waitMs) throw new Error('forge: ボードのロックを取れませんでした（別の forge が動いていませんか）');
      sleepSync(40);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

// ------------------------------------------------------------------ board

const EMPTY = () => ({ schema: 1, seq: 0, repos: {}, cards: [] });

export function readBoard(h = home()) {
  try {
    const board = JSON.parse(fs.readFileSync(paths(h).board, 'utf8'));
    return { ...EMPTY(), ...board };
  } catch {
    return EMPTY();
  }
}

function writeBoard(h, board) {
  const file = paths(h).board;
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(board, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

/** Read-modify-write under the lock. `fn(board)` mutates in place and may return a value. */
export function update(h, fn) {
  return withLock(h, () => {
    const board = readBoard(h);
    const result = fn(board);
    writeBoard(h, board);
    return result;
  });
}

export function event(h, type, data = {}) {
  fs.mkdirSync(h, { recursive: true });
  fs.appendFileSync(paths(h).events, `${JSON.stringify({ t: new Date().toISOString(), type, ...data })}\n`);
}

export function readEvents(h, { since = null, limit = 500 } = {}) {
  let text = '';
  try {
    text = fs.readFileSync(paths(h).events, 'utf8');
  } catch {
    return [];
  }
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      const row = JSON.parse(line);
      if (!since || row.t >= since) rows.push(row);
    } catch { /* skip */ }
  }
  return rows.slice(-limit);
}

/** Runs started today (local date) per agent — the daily budget ledger. */
export function runsToday(h, now = new Date()) {
  const day = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const counts = {};
  for (const row of readEvents(h, { limit: 100000 })) {
    if (row.type !== 'run' && row.type !== 'review-start') continue;
    const local = new Date(Date.parse(row.t) - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (local === day) counts[row.agent] = (counts[row.agent] || 0) + 1;
  }
  return counts;
}

export function findCard(board, id) {
  const key = String(id).replace(/^#/, '');
  return board.cards.find((c) => String(c.id) === key) || null;
}

export function slug(text, max = 32) {
  return String(text || '').normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'x';
}
