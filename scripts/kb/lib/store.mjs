// Persistence for the knowledge base: month-sharded JSONL under docs/kb/.
//
//   docs/kb/manifest.json         counts, shard list, sources, embed model
//   docs/kb/shards/YYYY-MM.jsonl  one document per line
//
// Plain files on purpose: they diff well in git, GitHub Pages / Vercel serve
// them as-is (so the PWA and other repos can read them over HTTP), and any
// tool — jq, DuckDB, Python — can read them without this code.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { KB_SCHEMA, parseJsonl, shardOf } from '../../../docs/kb/kb-core.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const KB_DIR = path.join(ROOT, 'docs', 'kb');
const SHARD_DIR = (dir) => path.join(dir, 'shards');

/** Default remote copy, used by the MCP server when no local checkout exists. */
export const DEFAULT_REMOTE = 'https://raw.githubusercontent.com/gentaron/infocollect/HEAD/docs/kb';

/** Load every shard from a local directory. Returns Map<id, doc>. */
export function loadLocal(dir = KB_DIR, { months = Infinity } = {}) {
  const docs = new Map();
  let files = [];
  try {
    files = fs.readdirSync(SHARD_DIR(dir)).filter((f) => f.endsWith('.jsonl')).sort().reverse();
  } catch {
    return docs;
  }
  for (const file of files.slice(0, months)) {
    for (const doc of parseJsonl(fs.readFileSync(path.join(SHARD_DIR(dir), file), 'utf8'))) {
      if (doc?.id) docs.set(doc.id, doc);
    }
  }
  return docs;
}

/** Load from an HTTP base (GitHub raw / Pages / Vercel). */
export async function loadRemote(base = DEFAULT_REMOTE, { months = 6 } = {}) {
  const docs = new Map();
  const res = await fetch(`${base}/manifest.json`);
  if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
  const manifest = await res.json();
  const shards = (manifest.shards || []).map((s) => s.key).sort().reverse().slice(0, months);
  await Promise.all(shards.map(async (key) => {
    const r = await fetch(`${base}/shards/${key}.jsonl`);
    if (!r.ok) return;
    for (const doc of parseJsonl(await r.text())) if (doc?.id) docs.set(doc.id, doc);
  }));
  return docs;
}

/** Write all docs back, grouped by shard, plus the manifest. */
export function saveLocal(docs, dir = KB_DIR, { keepMonths = 24, now = new Date() } = {}) {
  fs.mkdirSync(SHARD_DIR(dir), { recursive: true });
  const groups = new Map();
  for (const doc of docs.values()) {
    const key = doc.shard || shardOf(doc);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(doc);
  }
  const keys = [...groups.keys()].sort().reverse();
  const keep = new Set(keys.filter((k) => k !== 'undated').slice(0, keepMonths));
  if (groups.has('undated')) keep.add('undated');

  for (const file of fs.readdirSync(SHARD_DIR(dir))) {
    if (file.endsWith('.jsonl') && !keep.has(file.replace(/\.jsonl$/, ''))) fs.rmSync(path.join(SHARD_DIR(dir), file));
  }

  const sources = {};
  let vectors = 0;
  const vecModels = {};
  const shardMeta = [];
  for (const key of [...keep].sort()) {
    const list = groups.get(key).sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.id.localeCompare(b.id));
    for (const doc of list) {
      sources[doc.source] = (sources[doc.source] || 0) + 1;
      if (doc.vec) {
        vectors++;
        vecModels[doc.vecModel] = (vecModels[doc.vecModel] || 0) + 1;
      }
    }
    fs.writeFileSync(path.join(SHARD_DIR(dir), `${key}.jsonl`), `${list.map((d) => JSON.stringify(d)).join('\n')}\n`);
    shardMeta.push({ key, count: list.length });
  }

  const manifest = {
    schema: KB_SCHEMA,
    updatedAt: now.toISOString(),
    total: shardMeta.reduce((n, s) => n + s.count, 0),
    shards: shardMeta,
    sources: Object.fromEntries(Object.entries(sources).sort((a, b) => b[1] - a[1])),
    vectors: { count: vectors, models: vecModels },
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
