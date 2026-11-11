// Optional dense embeddings, free tiers only. Without any key the knowledge
// base is BM25-only and still works; with a key it becomes hybrid search.
//
//   KB_EMBED_PROVIDER = cloudflare | gemini | ollama | none   (default: auto)
//
//   cloudflare  CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN
//               @cf/baai/bge-m3 — multilingual, strong on Japanese, free daily allocation
//   gemini      GEMINI_API_KEY — gemini-embedding-001 (free tier), 768 dims
//   ollama      local only: OLLAMA_HOST (default http://localhost:11434),
//               KB_EMBED_MODEL (default bge-m3)
//
// Auto picks cloudflare, then gemini. Ollama is never auto-selected because
// CI has no local server — name it explicitly on your own PC.
//
// The model name is stored next to every vector. Query vectors are only
// compared with document vectors from the same model, so switching provider
// never mixes incompatible spaces (old docs simply fall back to BM25).

import { fetchWithRetry, warn } from '../../lib/util.mjs';

export function pickEmbedder(env = process.env, { dimensions = 768 } = {}) {
  const wanted = (env.KB_EMBED_PROVIDER || '').toLowerCase();
  if (wanted === 'none') return null;
  const cf = env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN;
  if ((wanted === 'cloudflare' || (!wanted && cf)) && cf) {
    const model = env.KB_EMBED_MODEL || '@cf/baai/bge-m3';
    return {
      name: 'cloudflare',
      model,
      batch: 50,
      async embed(texts) {
        const res = await fetchWithRetry(
          `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`,
          {
            method: 'POST',
            headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' },
            body: JSON.stringify({ text: texts }),
          },
          { timeoutMs: 60000 },
        );
        const body = await res.json();
        if (!res.ok || !body?.result?.data) throw new Error(`cloudflare embed HTTP ${res.status}`);
        return body.result.data;
      },
    };
  }
  if ((wanted === 'gemini' || !wanted) && env.GEMINI_API_KEY) {
    const model = env.KB_EMBED_MODEL || 'gemini-embedding-001';
    return {
      name: 'gemini',
      model: `${model}@${dimensions}`,
      batch: 50,
      async embed(texts, { task = 'RETRIEVAL_DOCUMENT' } = {}) {
        const res = await fetchWithRetry(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
            body: JSON.stringify({
              requests: texts.map((text) => ({
                model: `models/${model}`,
                content: { parts: [{ text }] },
                taskType: task,
                outputDimensionality: dimensions,
              })),
            }),
          },
          { timeoutMs: 60000 },
        );
        const body = await res.json();
        if (!res.ok || !Array.isArray(body?.embeddings)) throw new Error(`gemini embed HTTP ${res.status}`);
        return body.embeddings.map((e) => e.values);
      },
    };
  }
  if (wanted === 'ollama') {
    const host = (env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, '');
    const model = env.KB_EMBED_MODEL || 'bge-m3';
    return {
      name: 'ollama',
      model: `ollama:${model}`,
      batch: 32,
      async embed(texts) {
        const res = await fetch(`${host}/api/embed`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, input: texts }),
        });
        const body = await res.json();
        if (!res.ok || !Array.isArray(body?.embeddings)) throw new Error(`ollama embed HTTP ${res.status}`);
        return body.embeddings;
      },
    };
  }
  return null;
}

/** Embed one query string; returns null on any failure (caller falls back to BM25). */
export async function embedQuery(embedder, text) {
  if (!embedder) return null;
  try {
    const [vector] = await embedder.embed([text], { task: 'RETRIEVAL_QUERY' });
    return vector || null;
  } catch (error) {
    warn(`kb: query embedding failed, BM25 only — ${error.message}`);
    return null;
  }
}
