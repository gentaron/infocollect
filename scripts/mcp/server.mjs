#!/usr/bin/env node
// InfoCollect MCP server (stdio, zero dependencies).
//
// Exposes the knowledge base to any MCP client — Claude Code, Claude Desktop,
// Cursor, Codex, Gemini CLI, a local Ollama agent — so the AI asks the KB
// instead of you pasting links into the chat.
//
//   claude mcp add infocollect -- node /path/to/infocollect/scripts/mcp/server.mjs
//
// With no local checkout (e.g. from another repo), point it at the published copy:
//   INFOCOLLECT_KB_URL=https://raw.githubusercontent.com/gentaron/infocollect/HEAD/docs/kb
//
// Tools: kb_search, kb_context, kb_get, kb_stats, digest_latest.
// Protocol: JSON-RPC 2.0, one message per line on stdin/stdout. Logs → stderr.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

import { makeFilter, openKb } from '../kb/lib/retrieve.mjs';
import { ROOT } from '../kb/lib/store.mjs';

const SERVER = { name: 'infocollect', version: '1.0.0' };
const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const FILTERS = {
  since: { type: 'string', description: 'この日付以降（YYYY-MM-DD）' },
  until: { type: 'string', description: 'この日付以前（YYYY-MM-DD）' },
  source: { type: 'string', description: 'ソース名の部分一致（例: arXiv, Hacker News, r/LocalLLaMA）' },
  type: { type: 'string', enum: ['repo', 'release', 'feed', 'hn', 'paper', 'model', 'community', 'own'], description: '種類' },
  tag: { type: 'string', description: 'タグ完全一致（例: paper, security, ja, tool）' },
};

const TOOLS = [
  {
    name: 'kb_search',
    title: 'ナレッジベース検索',
    description: 'InfoCollect が毎日集めた AI ツール・ニュース・論文・リリース・コミュニティ投稿・過去ブログを検索する。日本語でも英語でも可。BM25（+あればベクトル）のハイブリッド、新しいものほど少し優遇。',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: '検索語' }, k: { type: 'integer', minimum: 1, maximum: 50, default: 10 }, ...FILTERS },
      required: ['query'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'kb_context',
    title: '文脈パック',
    description: '検索結果を、指定した文字数予算に収まる引用付きテキストに詰めて返す。記事やスライドを書く前の下調べとして、そのままプロンプトに入れられる形。',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, budget: { type: 'integer', minimum: 300, maximum: 20000, default: 4000 }, k: { type: 'integer', default: 12 }, ...FILTERS },
      required: ['query'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'kb_get',
    title: '1件取得',
    description: 'kb_search が返した id で、その文書の全フィールドを取得する。',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'kb_stats',
    title: 'ナレッジベースの状態',
    description: '件数・ソース別内訳・期間・ベクトル有無を返す。',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'digest_latest',
    title: '今日のダイジェスト',
    description: '今朝の InfoCollect ダイジェスト（伸びているAIツール3件と、新機能・新バージョン中心のニュース）を返す。',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

let kbPromise = null;
const kb = () => (kbPromise ||= openKb().then((k) => {
  log(`kb ready: ${k.size} docs from ${k.origin} (${k.hybrid ? 'hybrid' : 'bm25'})`);
  return k;
}));

function log(...args) {
  process.stderr.write(`[infocollect-mcp] ${args.join(' ')}\n`);
}

const slim = ({ doc, score }) => ({
  id: doc.id,
  title: doc.titleJa || doc.title,
  url: doc.url,
  source: doc.source,
  type: doc.sourceType,
  date: doc.date,
  score: Number(score.toFixed(4)),
  seen: doc.seen,
  snippet: [doc.summary, doc.body].filter(Boolean).join(' ').slice(0, 280),
  discussion: doc.discussion,
});

async function readLatestDigest() {
  const local = path.join(ROOT, 'docs', 'data', 'latest.json');
  if (!process.env.INFOCOLLECT_KB_URL && fs.existsSync(local)) return JSON.parse(fs.readFileSync(local, 'utf8'));
  const base = (process.env.INFOCOLLECT_KB_URL || 'https://raw.githubusercontent.com/gentaron/infocollect/HEAD/docs/kb').replace(/\/kb\/?$/, '');
  const res = await fetch(`${base}/data/latest.json`);
  if (!res.ok) throw new Error(`latest.json HTTP ${res.status}`);
  return res.json();
}

async function callTool(name, args = {}) {
  const filter = makeFilter({ ...args, sourceType: args.type });
  switch (name) {
    case 'kb_search': {
      const k = await kb();
      const hits = await k.query(String(args.query || ''), { k: Math.min(50, args.k || 10), filter });
      return { results: hits.map(slim), total: k.size, mode: k.hybrid ? 'hybrid' : 'bm25' };
    }
    case 'kb_context': {
      const k = await kb();
      const hits = await k.query(String(args.query || ''), { k: args.k || 12, filter });
      const packed = k.pack(hits, { budget: args.budget || 4000 });
      return { text: packed.text || '（該当なし）', ids: packed.ids, usedChars: packed.used };
    }
    case 'kb_get': {
      const k = await kb();
      const doc = k.byId.get(String(args.id || ''));
      if (!doc) throw new Error(`id が見つかりません: ${args.id}`);
      const { vec, ...rest } = doc;
      return rest;
    }
    case 'kb_stats': {
      const k = await kb();
      const sources = {};
      let min = '9999';
      let max = '0000';
      for (const d of k.byId.values()) {
        sources[d.source] = (sources[d.source] || 0) + 1;
        if (d.date < min) min = d.date;
        if (d.date > max) max = d.date;
      }
      return { total: k.size, from: min, to: max, mode: k.hybrid ? 'hybrid' : 'bm25', origin: k.origin, sources };
    }
    case 'digest_latest': {
      const d = await readLatestDigest();
      return {
        date: d.dateLocal,
        digest: d.digest,
        tools: (d.tools || []).map((t) => ({ name: t.name, url: t.url, headline: t.headline, summary: t.summary, why: t.why })),
        news: (d.news || []).map((n) => ({ title: n.titleJa || n.title, url: n.url, source: n.source, summary: n.summary })),
      };
    }
    default:
      throw Object.assign(new Error(`unknown tool: ${name}`), { code: -32602 });
  }
}

async function handle(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize': {
      const wanted = params?.protocolVersion;
      return {
        protocolVersion: SUPPORTED.includes(wanted) ? wanted : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: 'InfoCollect のナレッジベース。調べ物は kb_search、執筆前の下調べは kb_context、今朝の要点は digest_latest。結果のURLを必ず出典として示すこと。',
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call': {
      try {
        const data = await callTool(params?.name, params?.arguments);
        const text = typeof data.text === 'string' && params?.name === 'kb_context' ? data.text : JSON.stringify(data, null, 2);
        return { content: [{ type: 'text', text }], structuredContent: data, isError: false };
      } catch (error) {
        if (error.code === -32602) throw error;
        return { content: [{ type: 'text', text: `エラー: ${error.message}` }], isError: true };
      }
    }
    default:
      if (id === undefined) return undefined; // notification (e.g. notifications/initialized)
      throw Object.assign(new Error(`method not found: ${method}`), { code: -32601 });
  }
}

function send(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

export function startServer(input = process.stdin) {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
      return;
    }
    try {
      const result = await handle(msg);
      if (msg.id !== undefined && result !== undefined) send({ jsonrpc: '2.0', id: msg.id, result });
    } catch (error) {
      if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: error.code || -32603, message: error.message } });
    }
  });
  return rl;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  log('started (stdio)');
  startServer();
}
