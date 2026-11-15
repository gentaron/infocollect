import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalog } from './validate-hyperfleet-catalog.mjs';
const file = new URL('../ecosystem/hyperfleet/tool-catalog.json', import.meta.url);
const catalog = JSON.parse(readFileSync(file, 'utf8'));
test('full inventory is valid and source-grounded', () => {
  assert.deepEqual(validateCatalog(catalog), []);
  assert.ok(catalog.toolCount >= 90);
  assert.ok(catalog.tools.some(x=>x.name==='Muse'&&x.reported==='reported_not_used'));
});
test('rejects double installation proposals and incorrect claims about author non-use', () => {
  const fake=structuredClone(catalog);
  fake.tools.push({...fake.tools[0]});
  fake.toolCount++;
  fake.tools[0].source='SELF';
  assert.ok(validateCatalog(fake).some(x=>x.includes('duplicate')));
  assert.ok(validateCatalog(fake).some(x=>x.includes('candidate')));
});
