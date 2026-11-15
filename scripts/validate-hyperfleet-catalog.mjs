#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const catalog = JSON.parse(readFileSync(resolve(root, 'ecosystem/hyperfleet/tool-catalog.json'), 'utf8'));
export function validateCatalog(v) {
  const errors = [];
  const owners = new Set(['agent-runner','infocollect','IDEAZ','VAIZ','QAIZ','Mathematical-Physics-Lab-','genesisvault','presentationgen','none']);
  const adoptions = new Set(['already','optional','candidate','defer','excluded']);
  const statuses = new Set(Object.keys(v.statusLegend || {}));
  const ids = new Set(), names = new Set();
  if (!Array.isArray(v.tools) || v.tools.length !== v.toolCount) errors.push('tool count mismatch');
  for (const t of v.tools || []) {
    if (ids.has(t.id)) errors.push('duplicate id: '+t.id);
    ids.add(t.id);
    if (names.has(t.name.toLowerCase())) errors.push('duplicate name: '+t.name);
    names.add(t.name.toLowerCase());
    if (!owners.has(t.owner)) errors.push('unknown owner: '+t.name);
    if (!adoptions.has(t.adoption)) errors.push('unknown adoption: '+t.name);
    if (!statuses.has(t.reported)) errors.push('unknown status: '+t.name);
    if (!v.sourceDefinitions?.[t.source]) errors.push('unattributed source: '+t.name);
    if (t.source==='SELF' && t.reported!=='not_confirmed') errors.push('false author claim: '+t.name);
    if (t.reported==='not_confirmed' && t.source!=='SELF') errors.push('candidate source mismatch: '+t.name);
    if (['reported_not_used','reported_removed','reported_stopped'].includes(t.reported) && t.adoption==='already') errors.push('disabled tool marked already: '+t.name);
  }
  return errors;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors=validateCatalog(catalog);
  if(errors.length) { console.error(errors.join('\n'));process.exitCode=1; }
  else console.log('Tool catalog:', catalog.toolCount, 'unique items, ownership/status/provenance checked.');
}
