// Web board for Forge. Zero dependencies: node:http + Server-Sent Events.
//
//   forge serve                  → http://127.0.0.1:7777/?t=<token>
//   forge serve --host 0.0.0.0   → reachable from your phone on the same Wi-Fi / Tailscale
//
// Every request needs the token (printed at start, stored in FORGE_HOME/token),
// because this page can start agents on your machine. The server also runs
// the tick loop, so `forge serve` alone keeps the board moving.

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { detectAll } from './agents.mjs';
import * as E from './engine.mjs';
import * as G from './git.mjs';
import { FORGE_DIR, findCard, loadConfig, paths, readBoard, readEvents, runsToday } from './store.mjs';

function token(h) {
  const file = paths(h).token;
  try {
    const t = fs.readFileSync(file, 'utf8').trim();
    if (t.length >= 24) return t;
  } catch { /* first run */ }
  const t = crypto.randomBytes(18).toString('base64url');
  fs.mkdirSync(h, { recursive: true });
  fs.writeFileSync(file, `${t}\n`, { mode: 0o600 });
  return t;
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** What the UI needs, without prompt files or absolute paths of the runs dir. */
export function snapshot(h) {
  const board = readBoard(h);
  const config = loadConfig(h);
  const used = runsToday(h);
  return {
    at: new Date().toISOString(),
    repos: Object.values(board.repos).map(({ name, base, verify }) => ({ name, base, verify })),
    agents: detectAll(config).map((a) => ({ ...a, used: used[a.id] || 0, limit: config.agents[a.id].dailyRuns || null })),
    tiers: Object.keys(config.tiers),
    cards: board.cards.map((c) => ({
      id: c.id, repo: c.repo, title: c.title, prompt: c.prompt, tier: c.tier, startTier: c.startTier, status: c.status,
      deps: c.deps, files: c.files, priority: c.priority, blocked: c.blocked || '', failReason: c.failReason || '',
      summary: c.summary, review: c.review, diff: c.diff || null, issue: c.issue, merged: c.merged || '',
      attempts: c.attempts.map((a) => ({ agent: a.agent, kind: a.kind, tier: a.tier, result: a.result || '', reason: a.reason || '', startedAt: a.startedAt, endedAt: a.endedAt || '' })),
      updatedAt: c.updatedAt,
    })),
    events: readEvents(h, { limit: 40 }).reverse(),
  };
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function readBody(req, limit = 64 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('本文が大きすぎます');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

export function createServer(h, { tickEveryMs = loadConfig(h).pollSeconds * 1000, autoTick = true } = {}) {
  const secret = token(h);
  const ui = fs.readFileSync(path.join(FORGE_DIR, 'ui.html'), 'utf8');
  const clients = new Set();
  let last = '';

  const push = () => {
    const { at, ...rest } = snapshot(h);
    const key = JSON.stringify(rest);
    if (key === last) return; // only push real changes, not the clock
    last = key;
    const data = JSON.stringify({ at, ...rest });
    for (const res of clients) res.write(`data: ${data}\n\n`);
  };

  const actions = {
    add: (b) => E.addCard(h, { repo: b.repo, title: String(b.title || '').trim(), prompt: String(b.prompt || ''), tier: b.tier || 'light', files: b.files || [], deps: b.deps || [], kb: !!b.kb, agent: b.agent || null, hold: !!b.hold }),
    approve: (b) => ({ merged: E.approve(h, b.id) }),
    reject: (b) => E.reject(h, b.id, String(b.note || '')),
    hold: (b) => E.hold(h, b.id, true),
    go: (b) => E.hold(h, b.id, false),
    cancel: (b) => E.cancel(h, b.id, { purge: !!b.purge }),
    steer: (b) => E.steer(h, b.id, String(b.text || '')),
    tick: () => E.tick(h),
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const given = url.searchParams.get('t') || req.headers['x-forge-token'];
    if (!safeEqual(given, secret)) return send(res, 401, '<!doctype html><meta charset=utf-8><title>Forge</title><p>トークンが要ります。<code>forge serve</code> が表示した URL を開いてください。', 'text/html; charset=utf-8');

    try {
      if (req.method === 'GET' && url.pathname === '/') return send(res, 200, ui, 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/api/board') return send(res, 200, snapshot(h));
      if (req.method === 'GET' && url.pathname === '/api/stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`retry: 3000\ndata: ${JSON.stringify(snapshot(h))}\n\n`);
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return undefined;
      }
      const logMatch = url.pathname.match(/^\/api\/cards\/(\d+)\/(log|diff)$/);
      if (req.method === 'GET' && logMatch) {
        if (logMatch[2] === 'log') {
          const p = E.peek(h, logMatch[1], Math.min(400, Number(url.searchParams.get('n') || 120)));
          return send(res, 200, { live: p.live, text: p.text });
        }
        const board = readBoard(h);
        const card = findCard(board, logMatch[1]);
        if (!card) return send(res, 404, { error: 'カードがありません' });
        return send(res, 200, { text: G.diffText(board.repos[card.repo].path, card.branch, card.base, 120000) });
      }
      const act = url.pathname.match(/^\/api\/(\w+)$/);
      if (req.method === 'POST' && act && actions[act[1]]) {
        const out = actions[act[1]](await readBody(req));
        push();
        return send(res, 200, { ok: true, result: out ?? null });
      }
      return send(res, 404, { error: 'not found' });
    } catch (error) {
      return send(res, 400, { error: error.message });
    }
  });

  let timer = null;
  if (autoTick) {
    timer = setInterval(() => {
      try { E.tick(h); } catch (error) { console.error(`tick: ${error.message}`); }
      push();
    }, tickEveryMs);
  }
  const keepAlive = setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000);
  server.on('close', () => { clearInterval(timer); clearInterval(keepAlive); });
  return { server, secret, push };
}

export async function serve(h, { port = 7777, host = '127.0.0.1' } = {}) {
  const { server, secret } = createServer(h);
  await new Promise((resolve) => server.listen(port, host, resolve));
  const shown = host === '0.0.0.0' ? '<このPCのIP>' : host;
  console.log(`Forge のボード: http://${shown}:${server.address().port}/?t=${secret}`);
  if (host !== '127.0.0.1' && host !== 'localhost') console.log('注意: 外から見える場所で開いています。トークンを知っている人はエージェントを動かせます。');
  console.log('止めるには Ctrl-C（実行中のエージェントは tmux の中で走り続け、次に起動したとき拾い直す）');
}
