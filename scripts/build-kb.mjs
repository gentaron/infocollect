#!/usr/bin/env node
// Turn the bounded digest archive into static, source-linked JSONL shards.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function clean(text) {
  return String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

export function buildKnowledgeBase(archives) {
  const items = new Map();
  const ordered = [...archives].filter((archive) => /^\d{4}-\d{2}-\d{2}$/.test(archive?.dateLocal || ''))
    .sort((a, b) => b.dateLocal.localeCompare(a.dateLocal));
  for (const archive of ordered) {
    for (const item of archive.news || []) {
      if (typeof item.url !== 'string' || !/^https:\/\/[^\s]+$/.test(item.url) || !item.title) continue;
      if (items.has(item.url)) continue;
      items.set(item.url, {
        title: clean(item.title), titleJa: clean(item.titleJa || item.title),
        summary: clean(item.summary), url: item.url,
        source: clean(item.source || 'News'), date: archive.dateLocal,
        tags: ['collected', ...(Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === 'string') : [])],
      });
    }
    for (const item of archive.tools || []) {
      if (typeof item.url !== 'string' || !/^https:\/\/[^\s]+$/.test(item.url) || !item.name) continue;
      if (items.has(item.url)) continue;
      items.set(item.url, {
        title: clean(item.name), titleJa: clean(item.headline || item.name),
        summary: clean(item.summary || item.description), url: item.url,
        source: 'GitHub', date: archive.dateLocal, tags: ['collected', 'tool'],
      });
    }
  }
  const byMonth = new Map();
  for (const item of items.values()) {
    const month = item.date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(item);
  }
  const shards = [...byMonth].sort(([a], [b]) => a.localeCompare(b)).map(([key, docs]) => {
    docs.sort((a, b) => b.date.localeCompare(a.date) || a.url.localeCompare(b.url));
    return { key, docs };
  });
  return {
    manifest: {
      schemaVersion: 1,
      updatedAt: ordered[0]?.generatedAt || null,
      shards: shards.map(({ key, docs }) => ({ key, count: docs.length })),
    },
    shards,
  };
}

async function main() {
  const archiveDir = path.join(root, 'docs', 'data', 'archive');
  const outDir = path.join(root, 'docs', 'kb');
  const names = (await fs.readdir(archiveDir)).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name));
  const archives = await Promise.all(names.map(async (name) => JSON.parse(await fs.readFile(path.join(archiveDir, name), 'utf8'))));
  const { manifest, shards } = buildKnowledgeBase(archives);
  const shardDir = path.join(outDir, 'shards');
  await fs.mkdir(shardDir, { recursive: true });
  for (const { key, docs } of shards) {
    await fs.writeFile(path.join(shardDir, `${key}.jsonl`), `${docs.map((doc) => JSON.stringify(doc)).join('\n')}\n`, 'utf8');
  }
  const current = new Set(shards.map(({ key }) => `${key}.jsonl`));
  for (const name of await fs.readdir(shardDir)) {
    if (/^\d{4}-\d{2}\.jsonl$/.test(name) && !current.has(name)) await fs.unlink(path.join(shardDir, name));
  }
  await fs.writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Knowledge index: ${itemsCount(manifest)} source-linked items in ${shards.length} shards`);
}

function itemsCount(manifest) { return manifest.shards.reduce((sum, shard) => sum + shard.count, 0); }

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}

