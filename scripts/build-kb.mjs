#!/usr/bin/env node
// Turn the bounded digest archive into static, source-linked JSONL shards.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Canonical, public HTTPS evidence links only. Remove tracking while preserving
// meaningful query parameters (e.g. paper ids and release tags).
export function canonicalSourceUrl(value) {
  if (typeof value !== 'string') return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost')
      || /^(?:127|10|0|192\.168|169\.254)\./.test(host)
      || /^172\.(?:1[6-9]|2[0-9]|3[01])\./.test(host)
      || host === '[::1]') return null;
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|mc_)/i.test(key) || /^(?:fbclid|gclid|igshid|ref_src)$/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

function clean(text) {
  return String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

export function buildKnowledgeBase(archives) {
  const items = new Map();
  const ordered = [...archives].filter((archive) => /^\d{4}-\d{2}-\d{2}$/.test(archive?.dateLocal || ''))
    .sort((a, b) => b.dateLocal.localeCompare(a.dateLocal));
  for (const archive of ordered) {
    for (const item of archive.news || []) {
      const evidenceUrl = canonicalSourceUrl(item.url);
      if (!evidenceUrl || !item.title) continue;
      if (items.has(evidenceUrl)) continue;
      items.set(evidenceUrl, {
        title: clean(item.title), titleJa: clean(item.titleJa || item.title),
        summary: clean(item.summary), url: evidenceUrl,
        source: clean(item.source || 'News'), date: archive.dateLocal,
        provenance: { evidence: 'observed-link', collectedAt: archive.generatedAt || null },
        tags: ['collected', ...(Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === 'string') : [])],
      });
    }
    for (const item of archive.tools || []) {
      const evidenceUrl = canonicalSourceUrl(item.url);
      if (!evidenceUrl || !item.name) continue;
      if (items.has(evidenceUrl)) continue;
      items.set(evidenceUrl, {
        title: clean(item.name), titleJa: clean(item.headline || item.name),
        summary: clean(item.summary || item.description), url: evidenceUrl,
        source: 'GitHub', date: archive.dateLocal,
        provenance: { evidence: 'observed-link', collectedAt: archive.generatedAt || null },
        tags: ['collected', 'tool'],
      });
    }
    for (const domain of archive.frontier?.domains || []) {
      for (const item of domain.entries || []) {
        const evidenceUrl = canonicalSourceUrl(item.url);
        if (!evidenceUrl || !item.title || items.has(evidenceUrl)) continue;
        items.set(evidenceUrl, {
          title: clean(item.title), titleJa: clean(item.titleJa || item.title),
          summary: clean(item.summary || item.body), url: evidenceUrl,
          source: clean(item.source || 'Frontier'), date: archive.dateLocal,
          provenance: { evidence: 'observed-link', collectedAt: archive.generatedAt || null },
          tags: ['collected', 'frontier', `domain:${clean(domain.id)}`, `tier:${clean(item.tier)}`, clean(item.kind || 'news')],
        });
      }
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

