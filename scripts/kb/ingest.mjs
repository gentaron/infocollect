#!/usr/bin/env node
// Grow the knowledge base (docs/kb/) from everything this repo sees.
//
//   node scripts/kb/ingest.mjs                 today's digest + blog + wide net + embeddings
//   node scripts/kb/ingest.mjs --backfill      also replay docs/data/archive/*.json
//   node scripts/kb/ingest.mjs --offline       no network at all (digest/blog only, no embeddings)
//   node scripts/kb/ingest.mjs --no-embed      skip the embedding step
//
// Idempotent: a URL is one document forever. Seeing it again bumps `seen`,
// unions tags and keeps the longest summary, so "how often did this come up"
// becomes a signal the retriever can use.

import fs from 'node:fs';
import path from 'node:path';

import { canonicalUrl, dateInZone, log, stripHtml, truncate, warn } from '../lib/util.mjs';
import { docId, docText, mergeDoc, quantize, shardOf } from '../../docs/kb/kb-core.js';
import { pickEmbedder } from './lib/embed.mjs';
import { collectWideNet } from './lib/sources.mjs';
import { KB_DIR, ROOT, loadLocal, saveLocal } from './lib/store.mjs';

const args = new Set(process.argv.slice(2));
const OFFLINE = args.has('--offline');
const BACKFILL = args.has('--backfill');
const NO_EMBED = args.has('--no-embed') || OFFLINE;

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

/** Release notes and READMEs arrive as Markdown; the KB keeps plain prose. */
export function plain(text) {
  return stripHtml(String(text || ''))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')          // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')          // [text](url) → text
    .replace(/(^|\s)#{1,6}\s+/g, '$1')                // headings
    .replace(/\*\*|__|`+/g, '')                       // emphasis, code ticks
    .replace(/\|\s*:?-{3,}:?\s*/g, ' ')                 // table rules
    .replace(/\s*\|\s*/g, ' · ')                      // table cells
    .replace(/(^|\s)[-*+]\s+/g, '$1')                 // bullets
    .replace(/\s+/g, ' ')
    .replace(/^(\s*·\s*)+|(\s*·\s*)+$/g, '')
    .trim();
}

/** Normalise any collector item into a KB document. */
export function toDoc(item, { collectedAt, tz, maxBody = 700 }) {
  const url = item.url && /^https?:/i.test(item.url) ? canonicalUrl(item.url) : String(item.url || '');
  if (!url || !item.title) return null;
  const when = item.publishedAt || item.pushedAt || collectedAt;
  const t = Date.parse(when);
  const doc = {
    id: docId(url),
    url,
    title: truncate(stripHtml(item.title), 200),
    titleJa: item.titleJa && item.titleJa !== item.title ? truncate(item.titleJa, 200) : undefined,
    summary: item.summary ? truncate(plain(item.summary), 400) : undefined,
    body: item.body ? truncate(plain(item.body), maxBody) : undefined,
    source: item.source || 'unknown',
    sourceType: item.sourceType || 'feed',
    tags: [...new Set((item.tags || []).map(String))].slice(0, 12),
    date: dateInZone(Number.isFinite(t) ? new Date(t) : new Date(collectedAt), tz),
    publishedAt: item.publishedAt || undefined,
    collectedAt,
    score: Math.round((item.score || item.points || 0) * 10) / 10 || undefined,
    discussion: item.discussion || undefined,
  };
  for (const key of Object.keys(doc)) if (doc[key] === undefined) delete doc[key];
  return doc;
}

function digestItems(payload) {
  if (!payload) return [];
  const tools = (payload.tools || []).map((tool) => ({
    title: tool.name,
    titleJa: tool.headline && tool.headline !== tool.name ? `${tool.name} — ${tool.headline}` : undefined,
    url: tool.url,
    summary: tool.summary,
    body: [tool.description, tool.why, tool.language, `★${tool.stars}`].filter(Boolean).join(' '),
    source: 'GitHub Trending',
    sourceType: 'repo',
    publishedAt: payload.generatedAt,
    tags: ['tool', ...(tool.topics || []).slice(0, 8)],
    score: tool.starsPerDay || tool.score,
  }));
  return [...tools, ...(payload.news || [])];
}

function blogItems() {
  const index = readJson(path.join(ROOT, 'docs', 'blog', 'index.json'), []);
  const out = [];
  for (const entry of Array.isArray(index) ? index : []) {
    let text = '';
    try {
      text = fs.readFileSync(path.join(ROOT, 'docs', 'blog', entry.file), 'utf8');
    } catch {
      continue;
    }
    const body = text.split('\n').slice(1).join(' ').replace(/\s+/g, ' ').trim();
    out.push({
      title: entry.title,
      // Our own posts get a stable pseudo-URL so they dedupe like everything else.
      url: `https://gentaron.github.io/infocollect/blog/#${entry.file}`,
      body: truncate(body, 1500),
      source: 'InfoCollect Blog',
      sourceType: 'own',
      publishedAt: `${entry.date}T00:00:00+08:00`,
      tags: ['own', entry.label].filter(Boolean),
    });
  }
  return out;
}

async function embedMissing(docs, embedder, maxNew) {
  const todo = [...docs.values()]
    .filter((d) => !d.vec || d.vecModel !== embedder.model)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, maxNew);
  let done = 0;
  for (let i = 0; i < todo.length; i += embedder.batch) {
    const batch = todo.slice(i, i + embedder.batch);
    try {
      const vectors = await embedder.embed(batch.map((d) => truncate(docText(d), 2000)));
      batch.forEach((doc, j) => {
        if (!vectors[j]) return;
        doc.vec = quantize(vectors[j]);
        doc.vecModel = embedder.model;
        done++;
      });
    } catch (error) {
      warn(`kb: embedding batch failed (${error.message}) — stopping, BM25 still covers these docs`);
      break;
    }
  }
  return done;
}

async function main() {
  const config = readJson(path.join(ROOT, 'config', 'sources.json'), {});
  const kbConfig = config.kb || {};
  const tz = config.timezone || 'Asia/Kuala_Lumpur';
  const collectedAt = new Date().toISOString();
  const opts = { collectedAt, tz, maxBody: kbConfig.maxBodyChars || 700 };

  const docs = loadLocal(KB_DIR);
  const before = docs.size;
  log(`kb: 既存 ${before} 件を読み込み`);

  const items = [];
  items.push(...digestItems(readJson(path.join(ROOT, 'docs', 'data', 'latest.json'), null)));
  if (BACKFILL) {
    const dir = path.join(ROOT, 'docs', 'data', 'archive');
    for (const file of fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : []) {
      const payload = readJson(path.join(dir, file), null);
      const at = payload?.generatedAt || `${file.slice(0, 10)}T01:00:00Z`;
      for (const item of digestItems(payload)) items.push({ ...item, _collectedAt: at });
    }
  }
  items.push(...blogItems());
  if (!OFFLINE) items.push(...(await collectWideNet(kbConfig)));

  let added = 0;
  for (const item of items) {
    const doc = toDoc(item, { ...opts, collectedAt: item._collectedAt || collectedAt });
    if (!doc) continue;
    const existing = docs.get(doc.id);
    if (!existing) {
      doc.shard = shardOf(doc);
      added++;
    }
    docs.set(doc.id, mergeDoc(existing, doc));
  }
  log(`kb: 観測 ${items.length} 件 → 新規 ${added} 件（合計 ${docs.size}）`);

  if (!NO_EMBED) {
    const embedder = pickEmbedder(process.env, { dimensions: kbConfig.embed?.dimensions || 768 });
    if (embedder) {
      const n = await embedMissing(docs, embedder, kbConfig.embed?.maxNewPerRun || 300);
      log(`kb: 埋め込み ${n} 件 (${embedder.name} / ${embedder.model})`);
    } else {
      log('kb: 埋め込みキー無し — BM25 のみで運用（それでも検索は動く）');
    }
  }

  const manifest = saveLocal(docs, KB_DIR, { keepMonths: kbConfig.keepMonths || 24 });
  log(`kb: 書き出し完了 docs/kb/ — ${manifest.total} 件 / ${manifest.shards.length} シャード / ベクトル ${manifest.vectors.count}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
