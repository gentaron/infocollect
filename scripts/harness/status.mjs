#!/usr/bin/env node
// What would the harness do right now, and how much of today's free budget is left?
//
//   node scripts/harness/status.mjs

import { loadConfig, plan, usageToday } from './router.mjs';

const config = loadConfig();
const usage = usageToday();

console.log('今日の使用量（無料枠の予算）');
for (const [id, budget] of Object.entries(config.dailyBudget)) {
  if (id.startsWith('_')) continue;
  const used = usage[id]?.requests || 0;
  const failed = usage[id]?.failed || 0;
  console.log(`  ${id.padEnd(11)} ${String(used).padStart(4)} / ${budget.requests}  （heavy 用に ${budget.reserve} 回を確保${failed ? `・失敗 ${failed}` : ''}）`);
}

console.log('\nいま各 tier が選ぶ順番');
for (const tier of Object.keys(config.tiers)) {
  const { attempts, skipped } = plan({ tier, usage });
  console.log(`  ${tier.padEnd(9)} ${attempts.length ? attempts.map((a) => `${a.provider.id}/${a.model}`).join(' → ') : '（使えるものなし）'}`);
  if (!attempts.length && skipped.length) console.log(`            ${skipped.join(' / ')}`);
}
