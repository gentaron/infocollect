// Plain-text generation layer for the blog pipeline.
//
// Mirrors scripts/lib/ai.mjs in spirit (same secrets, same free tiers, same
// detection order) but returns raw text instead of JSON, and adds one extra
// last-resort provider: the local `z-ai` CLI, which exists on some dev
// machines but never on GitHub Actions runners.
//
// With no provider configured the caller gets a clear error — a blog post is
// creative output, so unlike the digest there is no rule-based fallback.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fetchWithRetry, truncate, warn } from '../../lib/util.mjs';

const TEMPERATURE = 0.9;
const MAX_TOKENS = 8192;
const TIMEOUT_MS = 240000;

function openAiCompatible(url, apiKey, model, { system, user }, extraHeaders = {}) {
  return fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  }, { timeoutMs: TIMEOUT_MS, retries: 1 });
}

const PROVIDERS = [
  {
    id: 'gemini',
    label: 'Google Gemini (無料枠)',
    detect: (env) => Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY),
    models: (env) => (env.GEMINI_MODEL ? [env.GEMINI_MODEL] : ['gemini-2.5-flash', 'gemini-2.0-flash']),
    async call(prompt, model, env) {
      const key = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
      const res = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${prompt.system}\n\n----\n\n${prompt.user}` }] }],
            generationConfig: { temperature: TEMPERATURE, maxOutputTokens: MAX_TOKENS },
          }),
        },
        { timeoutMs: TIMEOUT_MS, retries: 1 },
      );
      if (!res.ok) throw new Error(`gemini HTTP ${res.status}: ${truncate(await res.text(), 200)}`);
      const body = await res.json();
      return (body.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('');
    },
  },
  {
    id: 'groq',
    label: 'Groq (無料枠)',
    detect: (env) => Boolean(env.GROQ_API_KEY),
    models: (env) => [env.GROQ_MODEL || 'llama-3.3-70b-versatile'],
    async call(prompt, model, env) {
      const res = await openAiCompatible('https://api.groq.com/openai/v1/chat/completions', env.GROQ_API_KEY, model, prompt);
      if (!res.ok) throw new Error(`groq HTTP ${res.status}: ${truncate(await res.text(), 200)}`);
      const body = await res.json();
      return body.choices?.[0]?.message?.content || '';
    },
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (無料モデル)',
    detect: (env) => Boolean(env.OPENROUTER_API_KEY),
    models: (env) => [env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free'],
    async call(prompt, model, env) {
      const res = await openAiCompatible('https://openrouter.ai/api/v1/chat/completions', env.OPENROUTER_API_KEY, model, prompt, {
        'http-referer': 'https://github.com/gentaron/infocollect',
        'x-title': 'infocollect blog',
      });
      if (!res.ok) throw new Error(`openrouter HTTP ${res.status}: ${truncate(await res.text(), 200)}`);
      const body = await res.json();
      return body.choices?.[0]?.message?.content || '';
    },
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare Workers AI (無料枠)',
    detect: (env) => Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN),
    models: (env) => [env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.1-8b-instruct'],
    async call(prompt, model, env) {
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
            temperature: TEMPERATURE,
            max_tokens: MAX_TOKENS,
          }),
        },
        { timeoutMs: TIMEOUT_MS, retries: 1 },
      );
      if (!res.ok) throw new Error(`cloudflare HTTP ${res.status}: ${truncate(await res.text(), 200)}`);
      const body = await res.json();
      return body.result?.response || '';
    },
  },
  {
    id: 'custom',
    label: 'OpenAI互換エンドポイント',
    detect: (env) => Boolean(env.OPENAI_COMPATIBLE_BASE_URL && env.OPENAI_COMPATIBLE_MODEL),
    models: (env) => [env.OPENAI_COMPATIBLE_MODEL],
    async call(prompt, model, env) {
      const url = `${env.OPENAI_COMPATIBLE_BASE_URL.replace(/\/$/, '')}/chat/completions`;
      const res = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(env.OPENAI_COMPATIBLE_API_KEY ? { authorization: `Bearer ${env.OPENAI_COMPATIBLE_API_KEY}` } : {}),
        },
        body: JSON.stringify({
          model,
          temperature: TEMPERATURE,
          max_tokens: MAX_TOKENS,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        }),
      }, { timeoutMs: TIMEOUT_MS, retries: 1 });
      if (!res.ok) throw new Error(`${new URL(url).host} HTTP ${res.status}: ${truncate(await res.text(), 200)}`);
      const body = await res.json();
      return body.choices?.[0]?.message?.content || '';
    },
  },
  {
    id: 'zai-cli',
    label: 'z-ai CLI (ローカル開発用)',
    detect() {
      try {
        const probe = spawnSync('z-ai', ['--help'], { encoding: 'utf8', timeout: 10000 });
        return !probe.error;
      } catch {
        return false;
      }
    },
    models: () => ['default'],
    async call(prompt) {
      const out = path.join(os.tmpdir(), `infocollect-blog-${Date.now()}.json`);
      const res = spawnSync('z-ai', ['chat', '-p', prompt.user, '-s', prompt.system, '-o', out], {
        encoding: 'utf8',
        timeout: TIMEOUT_MS,
        maxBuffer: 32 * 1024 * 1024,
      });
      if (res.error) throw new Error(`z-ai CLI 実行失敗: ${res.error.message}`);
      if (!fs.existsSync(out)) throw new Error(`z-ai CLI が出力ファイルを作らなかった\n${truncate(res.stderr, 300)}`);
      try {
        const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
        const text = parsed?.choices?.[0]?.message?.content
          ?? parsed?.content
          ?? parsed?.response
          ?? parsed?.message?.content
          ?? '';
        if (!text) throw new Error(`z-ai CLI の出力形式を解釈できません: ${truncate(JSON.stringify(parsed), 200)}`);
        return text;
      } finally {
        fs.rmSync(out, { force: true });
      }
    },
  },
];

export function detectProvider(env = process.env) {
  if (env.AI_PROVIDER) {
    const forced = PROVIDERS.find((provider) => provider.id === env.AI_PROVIDER);
    if (forced && forced.detect(env)) return forced;
    if (forced) warn(`AI_PROVIDER=${env.AI_PROVIDER} が指定されましたが認証情報がありません`);
    return null;
  }
  return PROVIDERS.find((provider) => provider.detect(env)) || null;
}

/**
 * Generate one plain-text article. Returns { text, provider, model }.
 * Throws when no provider is configured or every model fails.
 */
export async function generateArticleText(prompt, env = process.env) {
  const provider = detectProvider(env);
  if (!provider) {
    throw new Error([
      'ブログ執筆に使えるAIプロバイダがありません。',
      'GEMINI_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY /',
      'CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN /',
      'OPENAI_COMPATIBLE_BASE_URL + OPENAI_COMPATIBLE_MODEL のいずれかを',
      '環境変数（Actions なら Secrets）に設定してください。',
    ].join(''));
  }

  let lastError;
  for (const model of provider.models(env)) {
    try {
      const text = await provider.call(prompt, model, env);
      if (!text || !text.trim()) throw new Error('空の応答が返りました');
      return { text, provider: provider.id, model };
    } catch (error) {
      lastError = error;
      warn(`blog: ${provider.id}/${model} 失敗 — ${error.message}`);
    }
  }
  throw lastError || new Error(`${provider.id} で記事生成に失敗しました`);
}

export { PROVIDERS };
