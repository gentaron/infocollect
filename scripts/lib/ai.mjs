// Summarisation layer. Every provider below has a usable free tier, and the
// whole layer is optional: with no API key at all the collector falls back to
// deterministic, rule-based summaries so the daily run never breaks.

import { fetchWithRetry, log, truncate, warn } from './util.mjs';

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
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, responseMimeType: 'application/json', maxOutputTokens: 4096 },
          }),
        },
        { timeoutMs: 90000 },
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
    call: (prompt, model, env) =>
      openAiCompatible('https://api.groq.com/openai/v1/chat/completions', env.GROQ_API_KEY, model, prompt),
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (無料モデル)',
    detect: (env) => Boolean(env.OPENROUTER_API_KEY),
    models: (env) => [env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free'],
    call: (prompt, model, env) =>
      openAiCompatible('https://openrouter.ai/api/v1/chat/completions', env.OPENROUTER_API_KEY, model, prompt, {
        'http-referer': 'https://github.com/gentaron/infocollect',
        'x-title': 'infocollect',
      }),
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
          body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 4096 }),
        },
        { timeoutMs: 90000 },
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
    call: (prompt, model, env) =>
      openAiCompatible(
        `${env.OPENAI_COMPATIBLE_BASE_URL.replace(/\/$/, '')}/chat/completions`,
        env.OPENAI_COMPATIBLE_API_KEY || '',
        model,
        prompt,
      ),
  },
];

async function openAiCompatible(url, apiKey, model, prompt, extraHeaders = {}) {
  const res = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    },
    { timeoutMs: 90000 },
  );
  if (!res.ok) throw new Error(`${new URL(url).host} HTTP ${res.status}: ${truncate(await res.text(), 200)}`);
  const body = await res.json();
  return body.choices?.[0]?.message?.content || '';
}

export function detectProvider(env = process.env) {
  if (env.AI_PROVIDER) {
    const forced = PROVIDERS.find((provider) => provider.id === env.AI_PROVIDER);
    if (forced && forced.detect(env)) return forced;
    if (forced) warn(`AI_PROVIDER=${env.AI_PROVIDER} が指定されましたが認証情報がありません`);
    return null;
  }
  return PROVIDERS.find((provider) => provider.detect(env)) || null;
}

/** Pull the first JSON object out of a model response (handles ```json fences). */
export function parseJsonLoose(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function buildPrompt(tools, news) {
  const toolLines = tools.map((tool, index) =>
    [
      `[tool ${index + 1}] ${tool.name}`,
      `stars: ${tool.stars} (直近の伸び: ${tool.starsDelta ?? '不明'} / 推定 ${tool.starsPerDay}/日)`,
      `language: ${tool.language || '不明'} / topics: ${tool.topics.join(', ') || 'なし'}`,
      `description: ${tool.description || '(説明なし)'}`,
    ].join('\n'),
  );

  const newsLines = news.map((item, index) =>
    [
      `[news ${index + 1}] ${item.title}`,
      `source: ${item.source} / published: ${item.publishedAt || '不明'}`,
      `body: ${truncate(item.body || '', 500)}`,
    ].join('\n'),
  );

  return `あなたは日本語で書く技術ニュース編集者です。以下の一次データだけを根拠に、JSONを1つ返してください。

# 厳守事項
- データに書かれていない事実を追加しない（推測・誇張・数値の捏造は禁止）。
- 日本語で簡潔に。専門用語はそのままでよい。
- 出力はJSONのみ。前置きやコードフェンスは書かない。

# ツール候補
${toolLines.join('\n\n')}

# ニュース候補
${newsLines.join('\n\n')}

# 出力するJSONの形
{
  "digest": "本日全体の要点を日本語120〜200字で",
  "tools": [
    { "index": 1, "headline": "20字程度の日本語見出し", "summary": "何ができるツールかを日本語80〜140字で", "why": "なぜ今伸びているのかを日本語40〜80字で" }
  ],
  "news": [
    { "index": 1, "titleJa": "日本語タイトル", "summary": "新機能・新バージョンの要点を日本語60〜120字で" }
  ]
}
"index" は上記の候補番号に必ず対応させ、全ての候補を1件ずつ含めてください。`;
}

/**
 * Ask the detected free-tier model to write the Japanese summaries.
 * Returns { provider, model, digest, tools: Map, news: Map } or null.
 */
export async function summarise(tools, news, env = process.env) {
  const provider = detectProvider(env);
  if (!provider) {
    log('AIプロバイダの認証情報なし → ルールベース要約にフォールバック');
    return null;
  }

  const prompt = buildPrompt(tools, news);
  for (const model of provider.models(env)) {
    try {
      log(`要約中: ${provider.id} / ${model}`);
      const raw = await provider.call(prompt, model, env);
      const parsed = parseJsonLoose(raw);
      if (!parsed) throw new Error('モデル出力をJSONとして解釈できませんでした');
      return {
        provider: provider.id,
        providerLabel: provider.label,
        model,
        digest: typeof parsed.digest === 'string' ? parsed.digest.trim() : '',
        tools: indexBy(parsed.tools),
        news: indexBy(parsed.news),
      };
    } catch (error) {
      warn(`${provider.id}/${model} 失敗: ${error.message}`);
    }
  }
  return null;
}

function indexBy(list) {
  const map = new Map();
  if (!Array.isArray(list)) return map;
  for (const entry of list) {
    const index = Number(entry?.index);
    if (Number.isInteger(index) && index > 0) map.set(index, entry);
  }
  return map;
}

export { PROVIDERS };
