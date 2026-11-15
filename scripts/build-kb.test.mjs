import assert from 'node:assert/strict';
import test from 'node:test';
import { buildKnowledgeBase, canonicalSourceUrl } from './build-kb.mjs';

test('deduplicates sources and groups documents by month', () => {
  const old = { dateLocal: '2026-10-31', generatedAt: '2026-10-31T01:00:00Z', news: [{ title: 'Old', url: 'https://x.test/a', summary: 'old' }], tools: [] };
  const current = { dateLocal: '2026-11-14', generatedAt: '2026-11-14T01:00:00Z', news: [{ title: 'New', url: 'https://x.test/a', summary: '<b>new</b>' }], tools: [{ name: 'tool', url: 'https://x.test/tool' }] };
  const result = buildKnowledgeBase([old, current]);
  assert.deepEqual(result.manifest.shards, [{ key: '2026-11', count: 2 }]);
  assert.equal(result.shards[0].docs[0].summary, 'new');
  assert.equal(result.shards[0].docs[1].source, 'GitHub');
  assert.equal(result.manifest.updatedAt, '2026-11-14T01:00:00Z');
});

test('drops unsafe or incomplete records', () => {
  const result = buildKnowledgeBase([{ dateLocal: '2026-11-14', news: [{ title: 'X', url: 'javascript:alert(1)' }, { url: 'https://x.test/a' }], tools: [] }]);
  assert.deepEqual(result.manifest.shards, []);
});


test('canonicalizes tracking links without stripping meaningful source parameters', () => {
  assert.equal(canonicalSourceUrl('https://EXAMPLE.org/paper/?utm_source=feed&id=42#abstract'), 'https://example.org/paper?id=42');
  assert.equal(canonicalSourceUrl('https://example.org/paper?id=43'), 'https://example.org/paper?id=43');
});

test('deduplicates tracking variants and preserves source provenance', () => {
  const result = buildKnowledgeBase([{
    dateLocal: '2026-11-15', generatedAt: '2026-11-15T01:00:00Z',
    news: [
      { title: 'Original', url: 'https://example.org/a?utm_source=rss' },
      { title: 'Duplicate', url: 'https://example.org/a#detail' },
    ], tools: [],
  }]);
  assert.equal(result.manifest.shards[0].count, 1);
  assert.equal(result.shards[0].docs[0].url, 'https://example.org/a');
  assert.deepEqual(result.shards[0].docs[0].provenance, {
    evidence: 'observed-link', collectedAt: '2026-11-15T01:00:00Z'
  });
});

test('refuses credentialed or internal network links from untrusted feeds', () => {
  for (const url of [
    'https://user:secret@example.org/a', 'https://localhost/private',
    'https://127.0.0.1:9000/private', 'http://example.org/a',
    'https://192.168.0.2/item', 'javascript:alert(1)',
  ]) {
    assert.equal(canonicalSourceUrl(url), null, url);
  }
});
