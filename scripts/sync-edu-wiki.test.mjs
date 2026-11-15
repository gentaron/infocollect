import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEduIndex } from './sync-edu-wiki.mjs';

const payload = {
  schemaVersion: 1, kind: 'fictional-wiki-index', source: 'gentaron/edu',
  entries: [
    { id: 'z', name: 'ゼータ', nameEn: null, category: 'character', url: '/wiki/z', description: 'not exported' },
    { id: 'a', name: 'アルファ', nameEn: 'Alpha', category: 'place', url: '/wiki/a' },
  ],
};

test('keeps a sorted fictional index and strips unapproved fields', () => {
  const index = normalizeEduIndex(payload);
  assert.deepEqual(index.entries.map((entry) => entry.id), ['a', 'z']);
  assert.equal(index.entries[1].description, undefined);
  assert.equal(index.kind, 'fictional-wiki-index');
});

test('rejects a wrong source, unsafe link, or duplicate id', () => {
  assert.throws(() => normalizeEduIndex({ ...payload, source: 'assetlog' }));
  assert.throws(() => normalizeEduIndex({ ...payload, entries: [{ ...payload.entries[0], url: 'https://elsewhere.test' }] }));
  assert.throws(() => normalizeEduIndex({ ...payload, entries: [payload.entries[0], payload.entries[0]] }));
});
