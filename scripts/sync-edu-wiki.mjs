#!/usr/bin/env node
// Mirror only public EDU wiki discovery metadata into a separate fiction index.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_URL = 'https://edu.gentaron.com/api/integrations/wiki-index';

export function normalizeEduIndex(payload) {
  if (payload?.schemaVersion !== 1 || payload.kind !== 'fictional-wiki-index' || payload.source !== 'gentaron/edu' || !Array.isArray(payload.entries) || payload.entries.length === 0 || payload.entries.length > 5000) {
    throw new Error('Invalid EDU wiki index envelope');
  }
  const seen = new Set();
  const entries = payload.entries.map((entry) => {
    if (!entry || typeof entry.id !== 'string' || !entry.id || typeof entry.name !== 'string' || !entry.name || typeof entry.category !== 'string' || !entry.category || (entry.nameEn !== null && typeof entry.nameEn !== 'string') || entry.url !== `/wiki/${encodeURIComponent(entry.id)}` || entry.id.length > 200 || entry.name.length > 200 || entry.category.length > 100 || (entry.nameEn?.length ?? 0) > 200 || seen.has(entry.id)) {
      throw new Error('Invalid or duplicate EDU wiki entry');
    }
    seen.add(entry.id);
    return { id: entry.id, name: entry.name, nameEn: entry.nameEn, category: entry.category, url: entry.url };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return { schemaVersion: 1, kind: 'fictional-wiki-index', source: 'gentaron/edu', entries };
}

async function main() {
  const url = process.env.EDU_WIKI_INDEX_URL || DEFAULT_URL;
  let index;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    index = normalizeEduIndex(await response.json());
  } catch (error) {
    console.warn(`EDU wiki index unavailable; keeping last committed snapshot: ${error.message}`);
    return;
  }
  const target = path.join(ROOT, 'docs', 'kb', 'fiction', 'edu.json');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  console.log(`EDU wiki index: ${index.entries.length} public links`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
