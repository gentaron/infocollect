#!/usr/bin/env node
// Ask the knowledge base from the terminal.
//
//   node scripts/kb/query.mjs "Qwen 量子化 ローカル"
//   node scripts/kb/query.mjs "MCP server" --k 5 --since 2026-10-01 --source arxiv
//   node scripts/kb/query.mjs "推論 高速化" --pack 3000      # model-ready context block
//   node scripts/kb/query.mjs "agent" --json

import { openKb, makeFilter } from './lib/retrieve.mjs';

const argv = process.argv.slice(2);
const opts = { k: 8, pack: 0, json: false };
const words = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--k') opts.k = Number(argv[++i]);
  else if (a === '--pack') opts.pack = Number(argv[++i]);
  else if (a === '--since') opts.since = argv[++i];
  else if (a === '--until') opts.until = argv[++i];
  else if (a === '--source') opts.source = argv[++i];
  else if (a === '--type') opts.sourceType = argv[++i];
  else if (a === '--tag') opts.tag = argv[++i];
  else if (a === '--remote') opts.remote = argv[++i];
  else if (a === '--json') opts.json = true;
  else words.push(a);
}
const q = words.join(' ').trim();
if (!q) {
  console.error('使い方: node scripts/kb/query.mjs "検索語" [--k 8] [--since YYYY-MM-DD] [--source 名前] [--type paper|repo|release|hn|community|own] [--pack 文字数] [--json]');
  process.exit(2);
}

const kb = await openKb({ remote: opts.remote });
const hits = await kb.query(q, { k: opts.k, filter: makeFilter(opts) });
console.error(`[kb] ${kb.size} 件から検索（${kb.hybrid ? 'BM25+ベクトル' : 'BM25'}）: ${hits.length} 件ヒット`);

if (opts.pack) {
  console.log(kb.pack(hits, { budget: opts.pack }).text);
} else if (opts.json) {
  console.log(JSON.stringify(hits.map(({ doc, score }) => ({ score: +score.toFixed(4), ...doc, vec: undefined })), null, 2));
} else {
  hits.forEach(({ doc, score }, n) => {
    console.log(`${String(n + 1).padStart(2)}. ${doc.titleJa || doc.title}`);
    console.log(`    ${doc.source} · ${doc.date} · score ${score.toFixed(3)}${doc.seen > 1 ? ` · ${doc.seen}回観測` : ''}`);
    console.log(`    ${doc.url}`);
  });
}
