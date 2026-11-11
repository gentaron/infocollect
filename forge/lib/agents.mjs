// Agent profiles and the dispatcher that picks one per run.
//
// Rule of thumb (and the whole point of this file): spend the free agents
// first, keep the subscription agent (Claude Code) for heavy work and for
// reviewing what the free ones wrote. A card escalates up the ladder only
// when its cheaper attempt failed verification.

import { spawnSync } from 'node:child_process';

const whichCache = new Map();
export function installed(bin, env = process.env) {
  if (env.FORGE_AGENTS_ONLY) return env.FORGE_AGENTS_ONLY.split(',').includes(bin);
  if (whichCache.has(bin)) return whichCache.get(bin);
  const ok = spawnSync('bash', ['-lc', `command -v ${bin.replace(/[^a-zA-Z0-9._-]/g, '')}`], { encoding: 'utf8' }).status === 0;
  whichCache.set(bin, ok);
  return ok;
}

/** Fill a profile's command template. `promptFile` is already shell-quoted. */
export function buildCommand(profile, { promptFile, model }) {
  const m = model ?? profile.model ?? '';
  const modelFlag = m ? String(profile.modelFlag || '').replaceAll('{model}', m) : '';
  return String(profile.cmd)
    .replaceAll('{modelFlag}', modelFlag)
    .replaceAll('{model}', m)
    .replaceAll('{prompt}', promptFile)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Pure: choose an agent for `tier`.
 *   usage    { agentId: runsToday }
 *   running  { agentId: runsInFlight }
 *   avoid    agent ids to try last (e.g. the one that just failed this card)
 * Returns { id, profile, skipped[] } or { id: null, skipped[] }.
 */
export function pick(config, tier, { usage = {}, running = {}, avoid = [], pin = null, env = process.env } = {}) {
  const list = pin ? [pin] : (config.tiers[tier]?.agents || []);
  const skipped = [];
  const ok = [];
  for (const id of list) {
    const profile = config.agents[id];
    if (!profile) { skipped.push(`${id}: 設定なし`); continue; }
    if (!installed(profile.bin, env)) { skipped.push(`${id}: 未インストール`); continue; }
    if (profile.dailyRuns && (usage[id] || 0) >= profile.dailyRuns) { skipped.push(`${id}: 今日の上限 ${profile.dailyRuns} 回`); continue; }
    if (profile.maxParallel && (running[id] || 0) >= profile.maxParallel) { skipped.push(`${id}: 同時実行の上限`); continue; }
    ok.push(id);
  }
  const ordered = [...ok.filter((id) => !avoid.includes(id)), ...ok.filter((id) => avoid.includes(id))];
  const id = ordered[0] || null;
  return { id, profile: id ? config.agents[id] : null, skipped };
}

/** Next rung up the ladder, or null at the top. */
export function escalate(config, tier) {
  const i = config.ladder.indexOf(tier);
  return i >= 0 && i < config.ladder.length - 1 ? config.ladder[i + 1] : null;
}

export function detectAll(config, env = process.env) {
  return Object.entries(config.agents).map(([id, p]) => ({ id, label: p.label, bin: p.bin, free: !!p.free, installed: installed(p.bin, env) }));
}
