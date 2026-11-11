// Every model endpoint the harness can talk to. All free tiers; all optional.
// A provider is { id, label, detect(env), defaultModel(env), call(prompt, model, env, opts) }
// where prompt = { system, user } and opts = { temperature, maxTokens }.
//
// The env-level model override (GEMINI_MODEL, GROQ_MODEL, …) always wins over
// the route table, so a repo variable can pin a model without touching code.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fetchWithRetry, truncate } from '../lib/util.mjs';

const TIMEOUT_MS = 240000;

class ProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function chatCompletions(url, apiKey, model, prompt, opts, extraHeaders = {}) {
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    }),
  }, { timeoutMs: TIMEOUT_MS, retries: 0 });
  if (!res.ok) throw new ProviderError(`${new URL(url).host} HTTP ${res.status}: ${truncate(await res.text(), 200)}`, res.status);
  const body = await res.json();
  return body.choices?.[0]?.message?.content || '';
}

export const PROVIDERS = [
  {
    id: 'gemini',
    label: 'Google Gemini (無料枠)',
    detect: (env) => Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY),
    override: (env) => env.GEMINI_MODEL,
    defaultModel: () => 'gemini-2.5-flash',
    async call(prompt, model, env, opts) {
      const res = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY || env.GOOGLE_API_KEY },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${prompt.system}\n\n----\n\n${prompt.user}` }] }],
            generationConfig: { temperature: opts.temperature, maxOutputTokens: opts.maxTokens },
          }),
        },
        { timeoutMs: TIMEOUT_MS, retries: 0 },
      );
      if (!res.ok) throw new ProviderError(`gemini HTTP ${res.status}: ${truncate(await res.text(), 200)}`, res.status);
      const body = await res.json();
      return (body.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('');
    },
  },
  {
    id: 'groq',
    label: 'Groq (無料枠)',
    detect: (env) => Boolean(env.GROQ_API_KEY),
    override: (env) => env.GROQ_MODEL,
    defaultModel: () => 'llama-3.3-70b-versatile',
    call: (prompt, model, env, opts) =>
      chatCompletions('https://api.groq.com/openai/v1/chat/completions', env.GROQ_API_KEY, model, prompt, opts),
  },
  {
    // Free with the token every Actions run already has (needs `models: read`).
    // Zero sign-up: this is what makes the pipeline work with no secrets at all.
    id: 'github',
    label: 'GitHub Models (無料枠)',
    detect: (env) => Boolean((env.GITHUB_TOKEN || env.GH_TOKEN) && env.HARNESS_GITHUB_MODELS !== 'off'),
    override: (env) => env.GITHUB_MODELS_MODEL,
    defaultModel: () => 'openai/gpt-4o-mini',
    call: (prompt, model, env, opts) =>
      chatCompletions('https://models.github.ai/inference/chat/completions', env.GITHUB_TOKEN || env.GH_TOKEN, model, prompt,
        { ...opts, maxTokens: Math.min(opts.maxTokens, 4000) }),
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (無料モデルのみ)',
    detect: (env) => Boolean(env.OPENROUTER_API_KEY),
    override: (env) => env.OPENROUTER_MODEL,
    defaultModel: () => 'meta-llama/llama-3.3-70b-instruct:free',
    async call(prompt, model, env, opts) {
      // Guard rail: OpenRouter bills anything that is not a ":free" model.
      if (!/:free$/.test(model) && env.OPENROUTER_ALLOW_PAID !== '1') {
        throw new ProviderError(`openrouter: "${model}" は :free ではないので止めました（課金防止。許可するなら OPENROUTER_ALLOW_PAID=1）`, 0);
      }
      return chatCompletions('https://openrouter.ai/api/v1/chat/completions', env.OPENROUTER_API_KEY, model, prompt, opts, {
        'http-referer': 'https://github.com/gentaron/infocollect',
        'x-title': 'infocollect',
      });
    },
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare Workers AI (無料枠)',
    detect: (env) => Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN),
    override: (env) => env.CLOUDFLARE_MODEL,
    defaultModel: () => '@cf/meta/llama-3.1-8b-instruct',
    async call(prompt, model, env, opts) {
      const res = await fetchWithRetry(
        `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
            temperature: opts.temperature,
            max_tokens: opts.maxTokens,
          }),
        },
        { timeoutMs: TIMEOUT_MS, retries: 0 },
      );
      if (!res.ok) throw new ProviderError(`cloudflare HTTP ${res.status}: ${truncate(await res.text(), 200)}`, res.status);
      const body = await res.json();
      return body.result?.response || '';
    },
  },
  {
    // Your own PC: Ollama / llama.cpp server / LM Studio / vLLM — anything
    // that speaks /v1/chat/completions. Never auto-detected on CI.
    id: 'local',
    label: 'ローカルLLM (Ollama など)',
    detect: (env) => Boolean(env.LOCAL_LLM_MODEL),
    override: (env) => env.LOCAL_LLM_MODEL,
    defaultModel: (env) => env.LOCAL_LLM_MODEL,
    call: (prompt, model, env, opts) =>
      chatCompletions(`${(env.LOCAL_LLM_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, '')}/chat/completions`, env.LOCAL_LLM_API_KEY || '', model, prompt, opts),
  },
  {
    id: 'custom',
    label: 'OpenAI互換エンドポイント',
    detect: (env) => Boolean(env.OPENAI_COMPATIBLE_BASE_URL && env.OPENAI_COMPATIBLE_MODEL),
    override: (env) => env.OPENAI_COMPATIBLE_MODEL,
    defaultModel: (env) => env.OPENAI_COMPATIBLE_MODEL,
    call: (prompt, model, env, opts) =>
      chatCompletions(`${env.OPENAI_COMPATIBLE_BASE_URL.replace(/\/$/, '')}/chat/completions`, env.OPENAI_COMPATIBLE_API_KEY || '', model, prompt, opts),
  },
  {
    id: 'zai-cli',
    label: 'z-ai CLI (ローカル開発用)',
    detect(env) {
      if (env.HARNESS_NO_CLI === '1') return false;
      try {
        return !spawnSync('z-ai', ['--help'], { encoding: 'utf8', timeout: 10000 }).error;
      } catch {
        return false;
      }
    },
    override: () => null,
    defaultModel: () => 'default',
    async call(prompt) {
      const out = path.join(os.tmpdir(), `infocollect-harness-${Date.now()}.json`);
      const res = spawnSync('z-ai', ['chat', '-p', prompt.user, '-s', prompt.system, '-o', out], {
        encoding: 'utf8',
        timeout: TIMEOUT_MS,
        maxBuffer: 32 * 1024 * 1024,
      });
      if (res.error) throw new ProviderError(`z-ai CLI 実行失敗: ${res.error.message}`, 0);
      if (!fs.existsSync(out)) throw new ProviderError(`z-ai CLI が出力ファイルを作らなかった\n${truncate(res.stderr, 300)}`, 0);
      try {
        const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
        const text = parsed?.choices?.[0]?.message?.content ?? parsed?.content ?? parsed?.response ?? parsed?.message?.content ?? '';
        if (!text) throw new ProviderError(`z-ai CLI の出力形式を解釈できません: ${truncate(JSON.stringify(parsed), 200)}`, 0);
        return text;
      } finally {
        fs.rmSync(out, { force: true });
      }
    },
  },
];

export const providerById = (id) => PROVIDERS.find((p) => p.id === id) || null;
