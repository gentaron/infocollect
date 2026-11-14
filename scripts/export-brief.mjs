#!/usr/bin/env node
// Export one researched item as a portable, reviewable creative brief.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function makeBrief(payload, kind, rank) {
  if (payload?.schemaVersion !== 1 || !Array.isArray(payload.tools) || !Array.isArray(payload.news)) {
    throw new Error('Input must be an InfoCollect schemaVersion 1 digest');
  }
  if (!['news', 'tool'].includes(kind) || !Number.isSafeInteger(rank) || rank < 1) {
    throw new Error('Select --kind news|tool and a positive --rank');
  }
  const list = kind === 'news' ? payload.news : payload.tools;
  const item = list.find((entry) => entry.rank === rank);
  if (!item) throw new Error(`No ${kind} item with rank ${rank}`);
  if (typeof item.url !== 'string' || !/^https?:\/\//.test(item.url)) {
    throw new Error('Selected item has no valid source URL');
  }
  const title = kind === 'news' ? (item.titleJa || item.title) : (item.headline || item.name);
  if (typeof title !== 'string' || !title.trim()) throw new Error('Selected item has no title');
  return {
    schemaVersion: 1,
    type: 'creative-brief',
    status: 'draft',
    source: {
      app: 'infocollect',
      digestGeneratedAt: payload.generatedAt,
      kind,
      rank,
      url: item.url,
      publishedAt: item.publishedAt || null,
    },
    brief: {
      title: title.trim(),
      context: String(item.summary || item.description || '').trim(),
      goal: '',
      audience: '',
      keyPoints: [],
      references: [item.url],
    },
  };
}

function main(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!['--input', '--kind', '--rank', '--output'].includes(key) || !argv[i + 1]) {
      throw new Error('Usage: node scripts/export-brief.mjs --kind news|tool --rank N [--input path] [--output path]');
    }
    args.set(key, argv[i + 1]);
  }
  const input = path.resolve(args.get('--input') || 'docs/data/latest.json');
  const brief = makeBrief(JSON.parse(fs.readFileSync(input, 'utf8')), args.get('--kind'), Number(args.get('--rank')));
  const output = `${JSON.stringify(brief, null, 2)}\n`;
  if (args.has('--output')) {
    fs.writeFileSync(path.resolve(args.get('--output')), output, { flag: 'wx' });
  } else {
    process.stdout.write(output);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

