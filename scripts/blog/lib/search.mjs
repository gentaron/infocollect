// Optional web-search layer for the blog pipeline.
//
// The collector is dependency-free by design, and the blog pipeline keeps
// that property: search is a *hint generator*, never a hard requirement.
// Two backends are tried in order, and both are allowed to fail silently:
//   1. z-ai-web-dev-sdk  — if the package happens to be installed locally
//   2. the `z-ai` CLI    — present on some dev machines, never on Actions
// With neither, the pipeline still works using the digest data + model
// knowledge (pass --no-search to skip this layer entirely).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { log, truncate, warn } from '../../lib/util.mjs';

let sdkPromise = null;
let sdkUnavailable = false;

async function searchViaSdk(query, num, recencyDays) {
  if (sdkUnavailable) return [];
  try {
    if (!sdkPromise) sdkPromise = import('z-ai-web-dev-sdk');
    const mod = await sdkPromise;
    const create = mod.default?.create ?? mod.create;
    const zai = await create();
    const results = await zai.functions.invoke('web_search', { query, num, recency_days: recencyDays });
    return Array.isArray(results) ? results : [];
  } catch {
    // Remember the failure without keeping a rejected promise around —
    // an unawaited rejected promise would crash the process at exit.
    sdkUnavailable = true;
    return [];
  }
}

function searchViaCli(query, num, recencyDays) {
  const out = path.join(os.tmpdir(), `infocollect-search-${Date.now()}.json`);
  try {
    const res = spawnSync(
      'z-ai',
      ['function', '-n', 'web_search', '-a', JSON.stringify({ query, num, recency_days: recencyDays }), '-o', out],
      { encoding: 'utf8', timeout: 60000 },
    );
    if (res.error || !fs.existsSync(out)) return [];
    const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  } finally {
    fs.rmSync(out, { force: true });
  }
}

/**
 * Run the slot's search queries and return normalised candidates:
 * { title, url, snippet, host, date }. Best effort — never throws.
 */
export async function searchCandidates(queries, { num = 8, recencyDays = 7 } = {}) {
  const seen = new Set();
  const items = [];

  for (const query of queries) {
    let results = await searchViaSdk(query, num, recencyDays);
    if (!results.length) results = searchViaCli(query, num, recencyDays);
    if (!results.length) {
      warn(`blog: 検索バックエンドが使えず候補を取得できませんでした（query: ${query}）`);
      continue;
    }
    for (const item of results) {
      const url = String(item.url || '').trim();
      const title = String(item.name || item.title || '').trim();
      if (!url || !title || seen.has(url)) continue;
      seen.add(url);
      items.push({
        title,
        url,
        snippet: truncate(item.snippet || '', 220),
        host: item.host_name || (url.startsWith('http') ? new URL(url).host : ''),
        date: item.date || '',
      });
    }
  }

  if (items.length) log(`blog: 検索候補 ${items.length} 件`);
  return items;
}

/** Format digest tools/news + search results as prompt-friendly lines. */
export function formatCandidates({ tools = [], news = [], search = [] }) {
  const lines = [];

  if (tools.length) {
    lines.push('▼ GitHub で伸びているリポジトリ（毎日のダイジェストから）');
    for (const tool of tools) {
      lines.push(`- ${tool.name} / ${tool.url} / ${truncate(tool.description || tool.headline || '', 160)}`);
    }
  }
  if (news.length) {
    lines.push('▼ AIニュース（毎日のダイジェストから）');
    for (const item of news) {
      lines.push(`- ${item.titleJa || item.title} / ${item.url} / ${truncate(item.summary || item.title, 140)}`);
    }
  }
  if (search.length) {
    lines.push('▼ Web検索で拾った候補');
    for (const item of search) {
      lines.push(`- ${item.title} / ${item.url} / ${item.snippet}`);
    }
  }

  return lines.join('\n');
}
