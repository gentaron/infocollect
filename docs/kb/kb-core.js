// InfoCollect knowledge base — the pure core.
//
// One file, no dependencies, no I/O. It is imported by:
//   - the Node pipeline   (scripts/kb/*.mjs, scripts/blog/generate.mjs)
//   - the MCP server      (scripts/mcp/server.mjs)
//   - the browser         (docs/kb/index.html)
// so the ranking you see in the PWA is exactly the ranking the AI gets.
//
// Retrieval = BM25 (Japanese-aware tokens) + optional dense vectors, fused
// with Reciprocal Rank Fusion, then a mild recency prior. Packing respects a
// character budget so callers hand a model only what fits ("context budget").

export const KB_SCHEMA = 1;

// ---------------------------------------------------------------- tokenizing

const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ]/;
const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'was',
  'be', 'by', 'as', 'at', 'it', 'this', 'that', 'from', 'we', 'you', 'our', 'your', 'its',
  'how', 'what', 'new', 'via', 'into', 'about', 'can', 'will', 'has', 'have', 'not', 'but',
  'する', 'した', 'して', 'こと', 'もの', 'これ', 'それ', 'ため', 'よう', 'です', 'ます',
]);

/**
 * Tokens for BM25. Latin/digit runs become lowercase words (with a light
 * plural strip); CJK runs become character bigrams (and the lone char for a
 * single-char run). Bigrams are the standard dictionary-free trick for
 * Japanese/Chinese search and work well on short tech text.
 */
export function tokenize(text) {
  const out = [];
  const value = String(text || '').normalize('NFKC').toLowerCase();
  let latin = '';
  let cjk = '';
  const flushLatin = () => {
    if (latin.length >= 2 && !STOP.has(latin)) {
      out.push(latin.length > 4 && latin.endsWith('s') && !latin.endsWith('ss') ? latin.slice(0, -1) : latin);
    }
    latin = '';
  };
  const flushCjk = () => {
    if (cjk.length === 1) out.push(cjk);
    for (let i = 0; i < cjk.length - 1; i++) {
      const gram = cjk.slice(i, i + 2);
      if (!STOP.has(gram)) out.push(gram);
    }
    cjk = '';
  };
  for (const ch of value) {
    if (CJK.test(ch)) {
      flushLatin();
      cjk += ch;
    } else if (/[a-z0-9]/.test(ch) || ((ch === '.' || ch === '-' || ch === '_') && latin && /[a-z0-9]$/.test(latin))) {
      flushCjk();
      latin += ch;
    } else {
      flushLatin();
      flushCjk();
    }
  }
  flushLatin();
  flushCjk();
  // "qwen3.5-coder" should match "qwen3.5" and "coder" too.
  const expanded = [];
  for (const token of out) {
    expanded.push(token.replace(/[.\-_]+$/, ''));
    if (/[.\-_]/.test(token)) {
      for (const part of token.split(/[-_]/)) if (part.length >= 2 && part !== token) expanded.push(part);
    }
  }
  return expanded.filter(Boolean);
}

/**
 * Bilingual query expansion. Most of the corpus is English while questions
 * are often Japanese, so common tech words are bridged both ways. Applied to
 * the query only (the index stays raw), which keeps it cheap and explainable.
 */
export const ALIASES = {
  mcp: ['modelcontextprotocol'], modelcontextprotocol: ['mcp'],
  'サーバー': ['server'], 'エージェント': ['agent'], 'モデル': ['model'], '量子化': ['quantization', 'gguf', 'quant'],
  '推論': ['inference'], '検索': ['search', 'retrieval'], '画像': ['image', 'vision'], '動画': ['video'],
  '音声': ['speech', 'audio', 'tts'], 'ローカル': ['local', 'ollama', 'llama.cpp'], '論文': ['paper', 'arxiv'],
  '脆弱性': ['vulnerability', 'cve', 'security'], 'セキュリティ': ['security'], '評価': ['eval', 'benchmark'],
  'ベンチマーク': ['benchmark'], '学習': ['training', 'fine-tuning'], '微調整': ['fine-tuning', 'lora'],
  '記憶': ['memory'], 'メモリ': ['memory'], 'コーディング': ['coding', 'code'], 'ブラウザ': ['browser'],
  'スライド': ['slides', 'presentation'], '自動化': ['automation', 'workflow'], '中国': ['china', 'qwen', 'deepseek'],
  rag: ['retrieval'], llm: ['language model'], gguf: ['quantization'],
};

/** Query tokens plus their aliases (alias tokens are tokenized the same way). */
export function expandQuery(text) {
  const raw = String(text || '').normalize('NFKC').toLowerCase();
  const extra = [];
  for (const [key, values] of Object.entries(ALIASES)) if (raw.includes(key)) extra.push(...values);
  return [...new Set([...tokenize(raw), ...tokenize(extra.join(' '))])];
}

// ---------------------------------------------------------------- documents

/** Text that gets indexed for a document (title counts double). */
export function docText(doc) {
  return [doc.title, doc.title, doc.titleJa, doc.summary, doc.body, (doc.tags || []).join(' '), doc.source]
    .filter(Boolean)
    .join(' ');
}

/** Stable short id from a canonical URL (FNV-1a 64-bit as hex). */
export function docId(url) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const s = String(url || '');
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** Month shard key, e.g. "2026-11". */
export function shardOf(doc) {
  return String(doc.date || doc.publishedAt || doc.collectedAt || '').slice(0, 7) || 'undated';
}

/** Merge a fresh observation into an existing doc without losing history. */
export function mergeDoc(existing, incoming) {
  if (!existing) return { ...incoming, seen: incoming.seen || 1 };
  const tags = [...new Set([...(existing.tags || []), ...(incoming.tags || [])])];
  const longer = (a, b) => (String(b || '').length > String(a || '').length ? b : a);
  return {
    ...existing,
    title: existing.title || incoming.title,
    titleJa: existing.titleJa || incoming.titleJa,
    summary: longer(existing.summary, incoming.summary),
    body: longer(existing.body, incoming.body),
    tags,
    score: Math.max(existing.score || 0, incoming.score || 0),
    seen: (existing.seen || 1) + 1,
    lastSeen: incoming.collectedAt || existing.lastSeen,
    vec: existing.vec || incoming.vec,
  };
}

// ---------------------------------------------------------------- BM25

/** Build an in-memory BM25 index. Fast enough for ~100k short docs. */
export function buildIndex(docs, { k1 = 1.2, b = 0.75 } = {}) {
  const postings = new Map();
  const lengths = new Float64Array(docs.length);
  let total = 0;
  docs.forEach((doc, i) => {
    const tf = new Map();
    for (const token of tokenize(docText(doc))) tf.set(token, (tf.get(token) || 0) + 1);
    let len = 0;
    for (const [token, count] of tf) {
      len += count;
      let list = postings.get(token);
      if (!list) postings.set(token, (list = []));
      list.push(i, count);
    }
    lengths[i] = len;
    total += len;
  });
  return { docs, postings, lengths, avgdl: docs.length ? total / docs.length : 0, k1, b };
}

export function bm25(index, query, limit = 50) {
  const { docs, postings, lengths, avgdl, k1, b } = index;
  const n = docs.length;
  const scores = new Map();
  for (const token of expandQuery(query)) {
    const list = postings.get(token);
    if (!list) continue;
    const df = list.length / 2;
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
    for (let j = 0; j < list.length; j += 2) {
      const i = list[j];
      const tf = list[j + 1];
      const s = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * lengths[i]) / (avgdl || 1))));
      scores.set(i, (scores.get(i) || 0) + s);
    }
  }
  return [...scores.entries()].sort((x, y) => y[1] - x[1]).slice(0, limit).map(([i, score]) => ({ i, score }));
}

// ---------------------------------------------------------------- vectors

/** float[] → int8 base64 (4x smaller, cosine survives almost unchanged). */
export function quantize(vector) {
  let max = 0;
  for (const v of vector) max = Math.max(max, Math.abs(v));
  const scale = max || 1;
  const bytes = new Int8Array(vector.length);
  for (let i = 0; i < vector.length; i++) bytes[i] = Math.round((vector[i] / scale) * 127);
  return toBase64(new Uint8Array(bytes.buffer));
}

export function dequantize(b64) {
  const u8 = fromBase64(b64);
  return new Int8Array(u8.buffer, u8.byteOffset, u8.byteLength);
}

export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function toBase64(u8) {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
  let s = '';
  for (const byte of u8) s += String.fromCharCode(byte);
  return btoa(s);
}

function fromBase64(b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

export function dense(index, queryVector, limit = 50, model = null) {
  if (!queryVector) return [];
  const out = [];
  index.docs.forEach((doc, i) => {
    if (!doc.vec || (model && doc.vecModel && doc.vecModel !== model)) return;
    out.push({ i, score: cosine(queryVector, dequantize(doc.vec)) });
  });
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}

// ---------------------------------------------------------------- fusion

/** Reciprocal Rank Fusion: robust to the two scorers living on different scales. */
export function rrf(lists, k = 60) {
  const fused = new Map();
  for (const list of lists) {
    list.forEach((hit, rank) => fused.set(hit.i, (fused.get(hit.i) || 0) + 1 / (k + rank + 1)));
  }
  return [...fused.entries()].sort((a, b) => b[1] - a[1]).map(([i, score]) => ({ i, score }));
}

/**
 * Hybrid search.
 *   query        free text (Japanese or English)
 *   queryVector  optional Float32Array/number[] from the same embedder
 *   halfLifeDays recency prior: a doc this old scores ×0.5 (Infinity = off)
 *   filter       optional (doc) => boolean, e.g. by source or date
 */
export function search(index, query, {
  k = 10, queryVector = null, vecModel = null, halfLifeDays = 45, now = Date.now(), filter = null, perGroup = 2,
} = {}) {
  const lexical = bm25(index, query, 200);
  const semantic = dense(index, queryVector, 200, vecModel);
  const fused = semantic.length ? rrf([lexical, semantic]) : lexical.map((h) => ({ ...h }));
  const results = [];
  for (const hit of fused) {
    const doc = index.docs[hit.i];
    if (filter && !filter(doc)) continue;
    const t = Date.parse(doc.date || doc.publishedAt || doc.collectedAt || '');
    const ageDays = Number.isFinite(t) ? Math.max(0, (now - t) / 86400000) : 365;
    const recency = Number.isFinite(halfLifeDays) ? 0.5 + 0.5 * 2 ** (-ageDays / halfLifeDays) : 1;
    results.push({ doc, score: hit.score * recency, ageDays: Math.round(ageDays) });
  }
  results.sort((a, b) => b.score - a.score);
  return mmr(results, k, perGroup);
}

/** GitHub URLs group by owner/repo so one busy repo cannot flood the results. */
export function groupKey(doc) {
  const m = String(doc.url || '').match(/^https?:\/\/github\.com\/([^/]+\/[^/#?]+)/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Light diversity pass: at most `perGroup` hits per GitHub repo, and skip hits
 * whose title is near-identical to one already kept.
 */
function mmr(results, k, perGroup = 2) {
  const kept = [];
  const sigs = [];
  const groups = new Map();
  for (const r of results) {
    const g = groupKey(r.doc);
    if (g && (groups.get(g) || 0) >= perGroup) continue;
    const sig = new Set(tokenize(r.doc.title || ''));
    if (sigs.some((s) => jaccard(s, sig) >= 0.8)) continue;
    kept.push(r);
    sigs.push(sig);
    if (g) groups.set(g, (groups.get(g) || 0) + 1);
    if (kept.length >= k) break;
  }
  return kept;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// ---------------------------------------------------------------- packing

/**
 * Pack hits into a plain-text context block that never exceeds `budget`
 * characters. Highest-ranked first; each hit gets a compact header with its
 * source and date so the model can cite it. Returns { text, used, ids }.
 */
export function packContext(hits, { budget = 4000, perDoc = 600 } = {}) {
  const parts = [];
  const ids = [];
  let used = 0;
  for (const { doc } of hits) {
    const head = `[${ids.length + 1}] ${doc.titleJa || doc.title}（${doc.source || '?'} / ${String(doc.date || doc.publishedAt || '').slice(0, 10)}）\n${doc.url}`;
    const bodyRaw = [doc.summary, doc.body].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const room = budget - used - head.length - 2;
    if (room < 80) break;
    const body = bodyRaw.length > Math.min(perDoc, room) ? `${bodyRaw.slice(0, Math.min(perDoc, room) - 1)}…` : bodyRaw;
    const block = body ? `${head}\n${body}` : head;
    parts.push(block);
    ids.push(doc.id);
    used += block.length + 2;
  }
  return { text: parts.join('\n\n'), used, ids };
}

/** Parse a JSONL shard, skipping blank or broken lines. */
export function parseJsonl(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch { /* keep going */ }
  }
  return out;
}
