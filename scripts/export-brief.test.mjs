import assert from 'node:assert/strict';
import test from 'node:test';
import { makeBrief } from './export-brief.mjs';

const digest = {
  schemaVersion: 1,
  generatedAt: '2026-11-14T00:00:00Z',
  news: [{ rank: 2, titleJa: '新モデル', summary: '公開された', url: 'https://example.org/release', publishedAt: '2026-11-13T00:00:00Z' }],
  tools: [{ rank: 1, name: 'example/tool', summary: '便利な道具', url: 'https://github.com/example/tool' }],
};

test('news becomes a source-linked draft brief', () => {
  const out = makeBrief(digest, 'news', 2);
  assert.equal(out.type, 'creative-brief');
  assert.equal(out.status, 'draft');
  assert.equal(out.brief.title, '新モデル');
  assert.deepEqual(out.brief.references, ['https://example.org/release']);
  assert.equal(out.brief.goal, '');
});

test('tools use their own title and reject missing ranks', () => {
  assert.equal(makeBrief(digest, 'tool', 1).brief.title, 'example/tool');
  assert.throws(() => makeBrief(digest, 'tool', 2), /No tool item/);
});

test('rejects malformed digests and source URLs', () => {
  assert.throws(() => makeBrief({}, 'news', 1), /schemaVersion 1/);
  assert.throws(() => makeBrief({ ...digest, news: [{ ...digest.news[0], url: 'javascript:bad' }] }, 'news', 2), /source URL/);
});

