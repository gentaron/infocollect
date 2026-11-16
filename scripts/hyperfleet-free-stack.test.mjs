import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildZeroBudgetPlan,specialistNames} from './hyperfleet-free-stack.mjs';
const db=JSON.parse(fs.readFileSync(new URL('../ecosystem/hyperfleet/tool-catalog.json',import.meta.url),'utf8'));
test('every specialist has an offline zero-budget plan',()=>{
  for (const repo of specialistNames){
    const result=buildZeroBudgetPlan(db,repo);
    assert.equal(result.budgetUSD,0);
    assert.equal(result.autoInstall,false);
    assert.ok(result.tools.length>0);
    assert.ok(result.tools.every(x=>['ready','review-candidate','blocked-until-reviewed'].includes(x.status)));
  }
});
test('paid, quota-only and unreviewed models can never be marked ready',()=>{
  const plan=buildZeroBudgetPlan(db,'VAIZ');
  assert.ok(plan.tools.some(x=>x.name==='FFmpeg'&&x.status==='ready'));
  assert.ok(plan.tools.every(x=>x.status!=='ready'||x.repo==='VAIZ'));
  for (const row of plan.tools.filter(x=>x.status==='review-candidate')) {
    assert.equal(row.freeMode,'open-source-self-host-or-review');
    assert.ok(row.officialUrl.startsWith('https://'));
  }
});
test('explicit unknown repo fails instead of changing hub',()=>{
  assert.throws(()=>buildZeroBudgetPlan(db,'omniscient-hub'),/Unknown/);
});
