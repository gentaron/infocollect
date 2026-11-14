import assert from 'node:assert/strict';
import test from 'node:test';
import { buildKnowledgeBase } from './build-kb.mjs';

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

