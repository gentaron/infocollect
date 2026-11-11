// The dispatcher. A caller says how heavy the job is (tier) and the router
// picks the cheapest free model that can do it, falling through the route
// table when a provider has no key, has spent today's budget, or just failed.
//
//   const { text, provider, model } = await run({ tier: 'light', system, user, task: 'slides-outline' });
//
// Design rules:
//   - importance decides the model, not "whatever key is set first"
//   - heavy work has a reserved slice of each provider's daily budget, so
//     small jobs can never starve the article that matters
//   - every call is written to an append-only usage ledger (one file per run,
//     so parallel workflows never produce git conflicts)
//   - AI_PROVIDER=<id> still pins everything to one provider, as before

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { dateInZone, warn } from '../lib/util.mjs';
import { PROVIDERS, providerById } from './providers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const USAGE_DIR = path.join(ROOT, 'memory', 'harness', 'usage');
const TZ = 'Asia/Kuala_Lumpur';

let cachedConfig = null;
export function loadConfig(file = path.join(ROOT, 'config', 'harness.json')) {
  if (!cachedConfig) cachedConfig = JSON.parse(fs.readFileSync(file, 'utf8'));
  return cachedConfig;
}

// ------------------------------------------------------------------ ledger

const runId = (env) => String(env.HARNESS_RUN || 'local').replace(/[^a-zA-Z0-9_-]/g, '-');

/** Today's request counts per provider, summed over every run's file. */
export function usageToday({ dir = USAGE_DIR, date = dateInZone(new Date(), TZ) } = {}) {
  const counts = {};
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.startsWith(`${date}.`) && f.endsWith('.jsonl'));
  } catch {
    return counts;
  }
  for (const file of files) {
    for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        const c = (counts[row.provider] ||= { requests: 0, ok: 0, failed: 0, outChars: 0 });
        c.requests++;
        if (row.ok) c.ok++;
        else c.failed++;
        c.outChars += row.outChars || 0;
      } catch { /* skip a broken line */ }
    }
  }
  return counts;
}

function record(row, { dir = USAGE_DIR, env = process.env, keepDays = 30 } = {}) {
  if (env.HARNESS_NO_LEDGER === '1') return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const date = dateInZone(new Date(), TZ);
    fs.appendFileSync(path.join(dir, `${date}.${runId(env)}.jsonl`), `${JSON.stringify(row)}\n`);
    const cutoff = dateInZone(new Date(Date.now() - keepDays * 86400000), TZ);
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.jsonl') && file.slice(0, 10) < cutoff) fs.rmSync(path.join(dir, file));
    }
  } catch (error) {
    warn(`harness: 台帳に書けませんでした（続行） — ${error.message}`);
  }
}

// ------------------------------------------------------------------ planning

/**
 * Pure: turn (tier, env, usage) into the ordered list of attempts.
 * Exported so the selftest can check routing without any network.
 */
export function plan({ tier = 'standard', env = process.env, usage = {}, avoid = [], config = loadConfig() }) {
  const tierConfig = config.tiers[tier];
  if (!tierConfig) throw new Error(`harness: 未知の tier "${tier}"（${Object.keys(config.tiers).join(' / ')}）`);
  const skipped = [];
  const attempts = [];
  const seen = new Set();
  const avoided = [];

  for (const route of tierConfig.routes) {
    const provider = providerById(route.provider);
    if (!provider) continue;
    if (env.AI_PROVIDER && env.AI_PROVIDER !== provider.id) continue;
    if (!provider.detect(env)) {
      skipped.push(`${provider.id}: 鍵なし`);
      continue;
    }
    const model = provider.override(env) || route.model || provider.defaultModel(env);
    const key = `${provider.id}/${model}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const budget = config.dailyBudget?.[provider.id];
    if (budget) {
      const used = usage[provider.id]?.requests || 0;
      const limit = tier === 'heavy' ? budget.requests : budget.requests - (budget.reserve || 0);
      if (used >= limit) {
        skipped.push(`${provider.id}: 今日の予算切れ (${used}/${limit})`);
        continue;
      }
    }
    const attempt = { provider, model, tier };
    if (avoid.includes(provider.id)) avoided.push(attempt);
    else attempts.push(attempt);
  }
  // "avoid" is a preference, not a ban: better the writer's own provider than no review.
  return { attempts: [...attempts, ...avoided], skipped, tierConfig };
}

// ------------------------------------------------------------------ running

const cooling = new Set(); // providers that rate-limited us during this process

export async function run({
  tier = 'standard', system, user, task = '', avoid = [], env = process.env,
  temperature, maxTokens, minChars = 1, usage,
}) {
  const config = loadConfig();
  const { attempts, skipped, tierConfig } = plan({ tier, env, usage: usage || usageToday(), avoid, config });
  const opts = {
    temperature: temperature ?? tierConfig.temperature ?? 0.7,
    maxTokens: maxTokens ?? tierConfig.maxTokens ?? 4096,
  };
  if (!attempts.length) {
    throw new Error([
      `harness: tier "${tier}" に使えるAIがありません。`,
      skipped.length ? `（${skipped.join(' / ')}）` : '',
      'GitHub Actions なら workflow に `permissions: models: read` を足すだけで GitHub Models の無料枠が使えます。',
      'ほかに GEMINI_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY / CLOUDFLARE_ACCOUNT_ID+CLOUDFLARE_API_TOKEN / LOCAL_LLM_MODEL / OPENAI_COMPATIBLE_* のどれかでも動きます。',
    ].join(''));
  }

  const errors = [];
  for (const { provider, model } of attempts) {
    if (cooling.has(provider.id)) continue;
    const started = Date.now();
    const row = { t: new Date().toISOString(), tier, task, provider: provider.id, model, inChars: (system?.length || 0) + (user?.length || 0) };
    try {
      const text = await provider.call({ system, user }, model, env, opts);
      if (!text || text.trim().length < minChars) throw new Error('空の応答が返りました');
      record({ ...row, ok: true, ms: Date.now() - started, outChars: text.length }, { env, keepDays: config.usageKeepDays });
      return { text, provider: provider.id, model, tier, tried: errors.length + 1 };
    } catch (error) {
      record({ ...row, ok: false, ms: Date.now() - started, error: String(error.message).slice(0, 160) }, { env, keepDays: config.usageKeepDays });
      errors.push(`${provider.id}/${model}: ${error.message}`);
      warn(`harness[${tier}]: ${provider.id}/${model} 失敗 → 次へ — ${error.message}`);
      if (error.status === 429 || error.status === 401 || error.status === 403) cooling.add(provider.id);
    }
  }
  throw new Error(`harness: tier "${tier}" の全候補が失敗しました\n  ${errors.join('\n  ')}`);
}

/** Ask for JSON and parse it leniently (models love to wrap it in fences). */
export async function runJson(args) {
  const result = await run(args);
  const data = parseLooseJson(result.text);
  if (data === null) throw new Error(`harness: JSON を解釈できませんでした (${result.provider}/${result.model})`);
  return { ...result, data };
}

export function parseLooseJson(text) {
  const raw = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  for (const candidate of [raw, raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1), raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1)]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch { /* try the next shape */ }
  }
  return null;
}

export { PROVIDERS };
