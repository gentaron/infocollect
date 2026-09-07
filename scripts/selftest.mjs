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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}\n       ${error.message}`);
    process.exitCode = 1;
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

console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
