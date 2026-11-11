#!/usr/bin/env node
// Offline checks for the collector's pure logic. No network, no API keys —
// safe to run in CI on every push.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonLoose } from './lib/ai.mjs';
import { parseFeed } from './lib/feeds.mjs';
import { classify, rankNews } from './lib/rank.mjs';
import { buildDigest, fallbackNewsSummary, fallbackToolSummary, toMarkdown } from './lib/render.mjs';
import { canonicalUrl, dateInZone, stripHtml, timeInZone, truncate } from './lib/util.mjs';
import {
  SLOTS,
  SLOT_ORDER,
  appendLogLine,
  dedupeParagraphs,
  extractLogline,
  sanitizeArticle,
} from './blog/lib/core.mjs';

import { spawnSync } from 'node:child_process';
import { buildIndex, cosine, dequantize, docId, expandQuery, mergeDoc, packContext, parseJsonl, quantize, rrf, search, tokenize } from '../docs/kb/kb-core.js';
import { plain, toDoc } from './kb/ingest.mjs';
import { parseLooseJson, plan } from './harness/router.mjs';
import { providerById } from './harness/providers.mjs';
import { lintArticle, titleSimilarity } from './harness/review.mjs';
import { classify as classifyTask } from './harness/task.mjs';
import { normalizeOutline, outlineFromText, parseArticle, renderDeck } from './slides/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;

const pending = [];
function test(name, fn) {
  const ok = () => { passed++; console.log(`  ok  ${name}`); };
  const fail = (error) => { console.error(`  FAIL ${name}\n       ${error.message}`); process.exitCode = 1; };
  try {
    const result = fn();
    if (result && typeof result.then === 'function') pending.push(result.then(ok, fail));
    else ok();
  } catch (error) {
    fail(error);
  }
}

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title><![CDATA[Ollama v0.7.0 released]]></title><link>https://example.com/a?utm_source=rss</link>
<pubDate>Mon, 01 Sep 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;New feature: tool calling&lt;/p&gt;</description></item>
<item><title>Some old post</title><link>https://example.com/b</link><pubDate>Mon, 01 Jan 2020 10:00:00 GMT</pubDate></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Introducing a new model</title><link rel="alternate" href="https://example.org/x"/>
<published>2026-09-01T09:00:00Z</published><summary>Now available to everyone.</summary></entry></feed>`;

console.log('util');
test('dateInZone uses the requested timezone', () => {
  // 2026-09-01T17:30Z is already 2026-09-02 in Kuala Lumpur (UTC+8).
  assert.equal(dateInZone(new Date('2026-09-01T17:30:00Z'), 'Asia/Kuala_Lumpur'), '2026-09-02');
  assert.equal(dateInZone(new Date('2026-09-01T17:30:00Z'), 'UTC'), '2026-09-01');
});
test('timeInZone renders the scheduled 09:00 local slot', () => {
  assert.equal(timeInZone(new Date('2026-09-02T01:00:00Z'), 'Asia/Kuala_Lumpur'), '2026-09-02 09:00');
});
test('stripHtml and truncate clean feed markup', () => {
  assert.equal(stripHtml('<p>a &amp; <b>b</b></p>'), 'a & b');
  assert.equal(truncate('abcdef', 4), 'abc…');
});
test('canonicalUrl drops tracking params', () => {
  assert.equal(canonicalUrl('https://x.test/p/?utm_source=rss&id=3#top'), 'https://x.test/p/?id=3');
});

console.log('feeds');
test('parseFeed reads RSS items', () => {
  const items = parseFeed(RSS, 'Test');
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Ollama v0.7.0 released');
  assert.equal(items[0].url, 'https://example.com/a');
  assert.equal(items[0].publishedAt, '2026-09-01T10:00:00.000Z');
  assert.match(items[0].body, /tool calling/);
});
test('parseFeed reads Atom entries', () => {
  const items = parseFeed(ATOM, 'Test');
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://example.org/x');
});

console.log('ranking');
test('classify tags versions and features', () => {
  assert.deepEqual(classify({ title: 'Ollama v0.7.0 released', body: 'adds support for tools' }).includes('version'), true);
  assert.equal(classify({ title: 'Startup raises $50M', body: 'funding round' }).includes('business'), true);
});
test('rankNews drops stale items and de-duplicates', () => {
  const now = Date.now();
  const items = [
    { title: 'Introducing Model X v2.0', url: 'https://a.test/1', source: 'OpenAI', sourceType: 'feed', publishedAt: new Date(now - 3600e3).toISOString(), body: 'now available' },
    { title: 'Introducing Model X v2.0', url: 'https://a.test/1?utm_source=x', source: 'Copycat', sourceType: 'feed', publishedAt: new Date(now - 1800e3).toISOString(), body: '' },
    { title: 'Ancient history', url: 'https://a.test/2', source: 'Blog', sourceType: 'feed', publishedAt: new Date(now - 20 * 864e5).toISOString(), body: '' },
    { title: 'A quiet update', url: 'https://a.test/3', source: 'Blog', sourceType: 'feed', publishedAt: new Date(now - 7200e3).toISOString(), body: '' },
  ];
  const ranked = rankNews(items, { sourceWeights: { OpenAI: 18 }, take: 10, maxAgeDays: 3 });
  assert.equal(ranked.length, 2, 'stale and duplicate items removed');
  assert.equal(ranked[0].title, 'Introducing Model X v2.0');
  assert.equal(ranked[0].rank, 1);
});
test('rankNews respects the take limit', () => {
  const items = Array.from({ length: 30 }, (_, i) => ({
    title: `Release ${i}`, url: `https://b.test/${i}`, source: 'Blog', sourceType: 'feed',
    publishedAt: new Date(Date.now() - i * 60e3).toISOString(), body: 'release',
  }));
  assert.equal(rankNews(items, { take: 12 }).length, 12);
});

console.log('rendering');
const sampleTool = {
  rank: 1, name: 'acme/agent', url: 'https://github.com/acme/agent', description: 'An agent framework',
  stars: 12345, starsDelta: 210, starsPerDay: 210, language: 'Python', topics: ['ai'], pushedAt: '2026-09-01T00:00:00Z',
};
test('fallback summaries never leave empty fields', () => {
  const summary = fallbackToolSummary(sampleTool);
  assert.ok(summary.headline && summary.summary && summary.why);
  assert.match(summary.why, /\+210 スター/);
  assert.ok(fallbackNewsSummary({ title: 'T', body: '' }).summary);
});
test('buildDigest works with and without data', () => {
  assert.match(buildDigest([sampleTool], [{ tags: ['version'] }], '2026-09-02 09:00'), /1 件/);
  assert.match(buildDigest([], [], '2026-09-02 09:00'), /データがありません/);
});
test('toMarkdown renders a full payload', () => {
  const markdown = toMarkdown({
    dateLocal: '2026-09-02', generatedAtLocal: '2026-09-02 09:00', timezone: 'Asia/Kuala_Lumpur',
    digest: 'ダイジェスト', ai: { label: 'test' },
    tools: [{ ...sampleTool, summary: 'まとめ', why: '理由' }],
    news: [{ titleJa: 'ニュース', url: 'https://n.test', source: 'OpenAI', summary: '要点' }],
  });
  assert.match(markdown, /# 2026-09-02 の AI ダイジェスト/);
  assert.match(markdown, /acme\/agent/);
  assert.match(markdown, /ニュース/);
});

console.log('ai');
test('parseJsonLoose handles fenced and noisy output', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"digest":"x"}\n```'), { digest: 'x' });
  assert.deepEqual(parseJsonLoose('前置き {"a":[1,2]} 後書き'), { a: [1, 2] });
  assert.equal(parseJsonLoose('not json at all'), null);
});

console.log('pwa assets');
for (const file of ['docs/index.html', 'docs/app.js', 'docs/sw.js', 'docs/manifest.webmanifest', 'docs/data/latest.json']) {
  test(`${file} exists`, () => assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} missing`));
}
test('manifest declares an installable PWA', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/manifest.webmanifest'), 'utf8'));
  assert.ok(manifest.name && manifest.short_name);
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
  assert.ok(manifest.icons.some((icon) => String(icon.purpose || '').includes('maskable')));
});
test('service worker precaches the app shell', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'docs/sw.js'), 'utf8');
  for (const asset of ['index.html', 'app.js', 'styles.css', 'manifest.webmanifest']) {
    assert.ok(sw.includes(asset), `${asset} not precached`);
  }
});
test('latest.json matches the schema the app expects', () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/data/latest.json'), 'utf8'));
  for (const key of ['schemaVersion', 'generatedAt', 'dateLocal', 'timezone', 'ai', 'digest', 'tools', 'news']) {
    assert.ok(key in data, `latest.json is missing "${key}"`);
  }
  assert.ok(Array.isArray(data.tools) && Array.isArray(data.news));
});

console.log('blog');
test('SLOTS cover the five MYT slots in order', () => {
  assert.deepEqual(Object.keys(SLOTS).sort(), SLOT_ORDER.slice().sort());
  assert.deepEqual(SLOT_ORDER, ['0700', '0900', '1100', '1400', '1800']);
});
test('prompt files exist for every slot plus the common rules', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'prompts/blog/common.md')), 'common.md missing');
  for (const slot of Object.values(SLOTS)) {
    assert.ok(fs.existsSync(path.join(ROOT, 'prompts/blog', slot.prompt)), `${slot.prompt} missing`);
  }
});
test('sanitizeArticle strips markdown but keeps hashtags and minus numbers', () => {
  const out = sanitizeArticle('# タイトル\n\nこれは**強調**です。\n- 箇条書き\n-40%の表示\n末尾 #AI #LLM');
  assert.equal(out.startsWith('タイトル'), true);
  assert.ok(!out.includes('**'));
  assert.ok(!out.includes('- 箇条書き'));
  assert.ok(out.includes('-40%'));
  assert.ok(out.includes('#AI #LLM'));
});
test('dedupeParagraphs drops looped paragraphs but keeps short lines', () => {
  const sample = 'タイトル\n\nこの段落は同じ内容を二回繰り返してモデルがループしたときのものです。\n\n#AI #LLM\n\nこの段落は同じ内容を二回繰り返してモデルがループしたときのものです。\n\n-----\n補足です。';
  const out = dedupeParagraphs(sample);
  assert.equal(out.split('この段落は同じ内容').length - 1, 1, 'repeated paragraph removed');
  assert.ok(out.includes('#AI #LLM'));
  assert.ok(out.includes('-----'));
  assert.ok(out.startsWith('タイトル'));
});
test('dedupeParagraphs catches loops with a single mutated word', () => {
  const sample = 'そう考えると、Astraのようなモデルは、特に初心者エンジニアにとってはすごく助かる存在かもしれません。難しい部分をAIがカバーしてくれるので、より創造的な部分に集中できるようになるんですよね。逆に、ベテランエンジニアにとっては、面倒な定型作業から解放されて、より高度な設計に時間を使えるようになるかもしれません。\n\nそう考えると、Astraのようなモデルは、特に初心者エンジニアにとってはすごく助かる存在かもしれません。難しい部分をAIがカバーしてくれるので、より創造的な部分に集中できるようになるんですよね。逆に、ベテランエngineerにとっては、面倒な定型作業から解放されて、より高度な設計に時間を使えるようになるかもしれません。';
  const out = dedupeParagraphs(sample);
  assert.equal(out.split('そう考えると、Astraのようなモデルは').length - 1, 1, 'mutated loop removed');
});
test('extractLogline splits the machine block off the article', () => {
  const sample = 'タイトル行\n\n本文です。\n-----\n補足\n===LOGLINE===\n2026-09-07 [7時枠／AIモデル] 何か — するもの／A／B';
  const { article, logline } = extractLogline(sample);
  assert.match(article, /補足/);
  assert.equal(logline, '2026-09-07 [7時枠／AIモデル] 何か — するもの／A／B');
});
test('extractLogline survives a missing block', () => {
  const { article, logline } = extractLogline('本文だけ');
  assert.equal(article, '本文だけ');
  assert.equal(logline, null);
});
test('appendLogLine inserts newest-first under the marker', () => {
  const tmp = fs.mkdtempSync(path.join(path.join(ROOT, 'docs'), 'tmp-selftest-'));
  try {
    const file = path.join(tmp, 'log.md');
    appendLogLine(file, '2026-09-07 [7時枠／AIモデル] A — B／C／D');
    appendLogLine(file, '2026-09-07 [9時枠／ハーネス] E — F／G／H');
    const text = fs.readFileSync(file, 'utf8');
    const posA = text.indexOf('A — B');
    const posE = text.indexOf('E — F');
    assert.ok(posA > -1 && posE > -1);
    assert.ok(posE < posA, 'newest line should sit above the older one');
    assert.match(text, /## 扱った題材のログ/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('blog viewer and memory scaffolds exist', () => {
  for (const file of [
    'docs/blog/index.html',
    'memory/topics/pc-setup.md',
    'memory/topics/dev-environment.md',
    'memory/people/humble-bobcat51.md',
    'memory/areas/github-trending-blog.md',
    'memory/areas/blog-log-archive.md',
    'memory/note-titles.txt',
    'scripts/blog/generate.mjs',
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} missing`);
  }
});
test('every slot has a scheduled workflow with the right cron', () => {
  const crons = { '0700': '0 23 * * *', '0900': '0 1 * * *', '1100': '0 3 * * *', '1400': '0 6 * * *', '1800': '0 10 * * *' };
  for (const [slotId, cron] of Object.entries(crons)) {
    const file = path.join(ROOT, `.github/workflows/blog-${slotId}.yml`);
    assert.ok(fs.existsSync(file), `blog-${slotId}.yml missing`);
    const yaml = fs.readFileSync(file, 'utf8');
    assert.ok(yaml.includes(`'${cron}'`), `blog-${slotId}.yml should schedule '${cron}' (MYT ${slotId.slice(0, 2)}:00)`);
    assert.ok(yaml.includes(`--slot ${slotId}`), `blog-${slotId}.yml should run --slot ${slotId}`);
  }
});

// ---------------------------------------------------------------- knowledge base
test('kb tokenize: latin words + CJK bigrams + dotted names', () => {
  const t = tokenize('Qwen3.5-Coder をローカルで推論する');
  for (const want of ['qwen3.5-coder', 'qwen3.5', 'coder', 'ロー', 'ーカ', '推論']) assert.ok(t.includes(want), `missing ${want} in ${t}`);
});
test('kb expandQuery bridges Japanese questions to English docs', () => {
  const t = expandQuery('MCP サーバー');
  assert.ok(t.includes('modelcontextprotocol') && t.includes('server'));
});
test('kb search ranks relevant first, caps one repo, honours filters', () => {
  const now = Date.parse('2026-11-11T00:00:00Z');
  const docs = [
    { id: 'a', title: 'ollama/ollama v1', url: 'https://github.com/ollama/ollama/releases/tag/v1', body: 'local inference', date: '2026-11-10', sourceType: 'release' },
    { id: 'b', title: 'ollama/ollama v2', url: 'https://github.com/ollama/ollama/releases/tag/v2', body: 'local inference', date: '2026-11-09', sourceType: 'release' },
    { id: 'c', title: 'ollama/ollama v3', url: 'https://github.com/ollama/ollama/releases/tag/v3', body: 'local inference', date: '2026-11-08', sourceType: 'release' },
    { id: 'd', title: 'Speculative decoding for local inference', url: 'https://arxiv.org/abs/1', body: 'inference speedup', date: '2026-11-01', sourceType: 'paper' },
    { id: 'e', title: 'Cooking pasta', url: 'https://example.com/p', body: 'tomato', date: '2026-11-10', sourceType: 'feed' },
  ];
  const index = buildIndex(docs);
  const hits = search(index, 'ローカル 推論', { k: 10, now });
  const ids = hits.map((h) => h.doc.id);
  assert.ok(!ids.includes('e'), 'irrelevant doc must not match');
  assert.equal(ids.filter((id) => 'abc'.includes(id)).length, 2, 'one GitHub repo is capped at 2 hits');
  assert.ok(ids.includes('d'));
  const papers = search(index, 'inference', { now, filter: (d) => d.sourceType === 'paper' });
  assert.deepEqual(papers.map((h) => h.doc.id), ['d']);
});
test('kb quantize keeps cosine and RRF fuses two rankings', () => {
  const a = [0.1, -0.4, 0.9, 0.05];
  const b = [0.12, -0.38, 0.88, 0.0];
  const qa = dequantize(quantize(a));
  assert.ok(Math.abs(cosine(qa, b) - cosine(a, b)) < 0.01);
  const fused = rrf([[{ i: 1 }, { i: 2 }], [{ i: 2 }, { i: 3 }]]);
  assert.equal(fused[0].i, 2, 'item ranked by both lists wins');
});
test('kb packContext never exceeds its budget and numbers sources', () => {
  const docs = Array.from({ length: 20 }, (_, n) => ({ doc: { id: String(n), title: `doc ${n}`, url: `https://x/${n}`, source: 's', date: '2026-11-01', body: 'x'.repeat(900) } }));
  const { text, used, ids } = packContext(docs, { budget: 1500 });
  assert.ok(text.length <= 1500 && used <= 1500 + 2, `packed ${text.length}`);
  assert.ok(text.startsWith('[1] doc 0') && ids.length >= 2);
});
test('kb docs: stable ids, merge counts sightings, markdown stripped', () => {
  assert.equal(docId('https://a.example/x'), docId('https://a.example/x'));
  assert.notEqual(docId('https://a.example/x'), docId('https://a.example/y'));
  const merged = mergeDoc({ id: 'x', title: 't', tags: ['a'], summary: 'short', seen: 1 }, { id: 'x', title: 't', tags: ['b'], summary: 'a longer one' });
  assert.equal(merged.seen, 2);
  assert.deepEqual(merged.tags, ['a', 'b']);
  assert.equal(merged.summary, 'a longer one');
  assert.equal(plain('## New **fast** [docs](https://x) and `code`'), 'New fast docs and code');
  const doc = toDoc({ title: 'T', url: 'https://ex.com/a?utm_source=x', body: '# hi', publishedAt: '2026-11-10T20:00:00Z' }, { collectedAt: '2026-11-11T00:00:00Z', tz: 'Asia/Kuala_Lumpur' });
  assert.equal(doc.url, 'https://ex.com/a');
  assert.equal(doc.date, '2026-11-11', 'date is local (MYT)');
  assert.equal(doc.body, 'hi');
});
test('kb committed shards parse and match the manifest', () => {
  const dir = path.join(ROOT, 'docs', 'kb');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  let total = 0;
  for (const { key, count } of manifest.shards) {
    const docs = parseJsonl(fs.readFileSync(path.join(dir, 'shards', `${key}.jsonl`), 'utf8'));
    assert.equal(docs.length, count, `shard ${key}`);
    total += count;
  }
  assert.equal(total, manifest.total);
});
test('mcp server: initialize, tools/list, kb_search round-trip', () => {
  const lines = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'selftest', version: '0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'kb_search', arguments: { query: 'release', k: 3 } } },
    { jsonrpc: '2.0', id: 4, method: 'nope' },
  ].map((m) => JSON.stringify(m)).join('\n');
  const env = { ...process.env, KB_EMBED_PROVIDER: 'none' };
  delete env.INFOCOLLECT_KB_URL;
  const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'mcp', 'server.mjs')], { input: `${lines}\n`, encoding: 'utf8', timeout: 20000, env });
  const out = Object.fromEntries(res.stdout.trim().split('\n').map((l) => JSON.parse(l)).map((m) => [m.id, m]));
  assert.equal(out[1].result.protocolVersion, '2025-06-18');
  assert.deepEqual(out[2].result.tools.map((t) => t.name).sort(), ['digest_latest', 'kb_context', 'kb_get', 'kb_search', 'kb_stats']);
  assert.equal(out[3].result.isError, false);
  assert.ok(out[3].result.structuredContent.results.length > 0);
  assert.equal(out[4].error.code, -32601);
});

// ---------------------------------------------------------------- harness
const NOCLI = { HARNESS_NO_CLI: '1' };
test('harness plan: no keys → nothing; GitHub token alone is enough', () => {
  assert.equal(plan({ tier: 'heavy', env: { ...NOCLI } }).attempts.length, 0);
  const p = plan({ tier: 'standard', env: { ...NOCLI, GITHUB_TOKEN: 'x' } });
  assert.deepEqual(p.attempts.map((a) => a.provider.id), ['github']);
});
test('harness plan: importance decides the model', () => {
  const env = { ...NOCLI, GEMINI_API_KEY: 'k', GROQ_API_KEY: 'k', CLOUDFLARE_ACCOUNT_ID: 'a', CLOUDFLARE_API_TOKEN: 't' };
  const first = (tier) => { const a = plan({ tier, env }).attempts[0]; return `${a.provider.id}/${a.model}`; };
  assert.equal(first('heavy'), 'gemini/gemini-2.5-flash');
  assert.equal(first('light'), 'cloudflare/@cf/meta/llama-3.1-8b-instruct');
  assert.equal(first('standard'), 'groq/llama-3.3-70b-versatile');
});
test('harness plan: light work cannot eat the budget reserved for heavy work', () => {
  const env = { ...NOCLI, GEMINI_API_KEY: 'k' };
  const usage = { gemini: { requests: 160 } }; // budget 180, reserve 30 → light limit 150
  assert.equal(plan({ tier: 'light', env, usage }).attempts.length, 0);
  assert.ok(plan({ tier: 'heavy', env, usage }).attempts.length > 0);
  assert.equal(plan({ tier: 'heavy', env, usage: { gemini: { requests: 180 } } }).attempts.length, 0);
});
test('harness plan: reviewer prefers another provider, AI_PROVIDER pins, env model overrides', () => {
  const env = { ...NOCLI, GEMINI_API_KEY: 'k', GROQ_API_KEY: 'k' };
  const ids = plan({ tier: 'review', env, avoid: ['groq'] }).attempts.map((a) => a.provider.id);
  assert.equal(ids[0], 'gemini');
  assert.equal(ids[ids.length - 1], 'groq', 'avoided provider stays as last resort');
  assert.deepEqual([...new Set(plan({ tier: 'heavy', env: { ...env, AI_PROVIDER: 'groq' } }).attempts.map((a) => a.provider.id))], ['groq']);
  assert.equal(plan({ tier: 'heavy', env: { ...env, GEMINI_MODEL: 'gemini-x' } }).attempts[0].model, 'gemini-x');
});
test('harness: OpenRouter refuses non-free models unless explicitly allowed', async () => {
  await assert.rejects(() => providerById('openrouter').call({ system: '', user: '' }, 'openai/gpt-5', { OPENROUTER_API_KEY: 'k' }, {}), /:free/);
});
test('harness parseLooseJson survives code fences and chatter', () => {
  assert.deepEqual(parseLooseJson('```json\n{"verdict":"pass"}\n```'), { verdict: 'pass' });
  assert.deepEqual(parseLooseJson('はい、こちらです: {"a":[1,2]} 以上です'), { a: [1, 2] });
  assert.equal(parseLooseJson('no json here'), null);
});
test('supervisor lint: accepts a clean post, rejects stubs, repeats and placeholders', () => {
  const para = (n) => `これは${n}番目の段落で、それぞれ違う内容をちゃんと書いているという体裁の文章だよ。`.repeat(8);
  const good = ['新しいローカル推論サーバーを試した話', ...Array.from({ length: 12 }, (_, i) => para(i)), '#AI #ローカルLLM #推論 #個人開発', '-----', '補足だよ。'].join('\n\n');
  assert.deepEqual(lintArticle(good).filter((i) => i.level === 'error'), []);
  const codes = (text, opts) => lintArticle(text, opts).map((i) => i.code);
  assert.ok(codes('短い').includes('too-short'));
  assert.ok(codes(good.replace('#AI #ローカルLLM #推論 #個人開発', '')).includes('no-hashtags'));
  assert.ok(codes(good, { recentTitles: ['新しいローカル推論サーバーを試した話'] }).includes('repeat-title'));
  assert.ok(codes(`${good}\n\n詳しくは [URL] を見てね。`).includes('placeholder'));
  assert.ok(titleSimilarity('Qwen4 を試した', '今日の晩ごはん') < 0.2);
});
test('kanban: labels decide the kind and the model tier', () => {
  assert.deepEqual(classifyTask(['ai:research']), { kind: 'research', tier: 'standard' });
  assert.deepEqual(classifyTask(['ai:draft']), { kind: 'draft', tier: 'heavy' });
  assert.deepEqual(classifyTask(['AI:Slides', 'tier:light']), { kind: 'slides', tier: 'light' });
  assert.deepEqual(classifyTask([]), { kind: 'research', tier: 'standard' });
});
test('ai-task workflow only serves the repository owner and passes issue text as data', () => {
  const yaml = fs.readFileSync(path.join(ROOT, '.github/workflows/ai-task.yml'), 'utf8');
  assert.ok(yaml.includes("author_association == 'OWNER'"));
  assert.ok(yaml.includes('models: read'));
  const runBlocks = yaml.split('\n').filter((l) => /^\s+(run:|gh |git |node )/.test(l)).join('\n');
  assert.ok(!/issue\.(title|body)/.test(runBlocks), 'issue text must never be interpolated into a shell line');
});

// ---------------------------------------------------------------- slides
test('slides: rule-based outline from a plain-text post, rendered as a static deck', () => {
  const article = ['小さなモデルを回す話', ...Array.from({ length: 8 }, (_, i) => `${i}つめの要点はこれ。理由はこうで、うちのPCでも動いた。次に試すのはここだよ。`), '#AI #LLM #メモ #個人開発', '-----', '補足'].join('\n\n');
  const parsed = parseArticle(article);
  assert.equal(parsed.title, '小さなモデルを回す話');
  assert.equal(parsed.paragraphs.length, 8);
  assert.equal(parsed.hashtags.length, 4);
  const outline = outlineFromText(article, { maxSlides: 5 });
  assert.ok(outline.slides.length >= 2 && outline.slides.length <= 5);
  assert.ok(outline.slides.every((s) => s.title && s.bullets.length >= 1 && s.bullets.length <= 3));
  const html = renderDeck({ ...outline, title: '<b>x</b>' }, { date: '2026-11-11' });
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;') && !html.includes('<b>x</b>'), 'titles are escaped');
  assert.equal((html.match(/<section class="s/g) || []).length, outline.slides.length + 2);
  assert.ok(html.includes('@media print') && !html.includes('<script'), 'static and printable');
});
test('slides: model outlines are validated before rendering', () => {
  assert.equal(normalizeOutline({ slides: 'nope' }), null);
  assert.equal(normalizeOutline({ slides: [{ title: 'only one', bullets: ['a'] }] }), null);
  const ok = normalizeOutline({ title: 't', slides: [{ title: 'a', bullets: ['1', '2', '3', '4', '5'] }, { title: 'b', bullets: ['1'] }, { title: '', bullets: ['x'] }] });
  assert.equal(ok.slides.length, 2);
  assert.equal(ok.slides[0].bullets.length, 4);
});

await Promise.all(pending);
console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
