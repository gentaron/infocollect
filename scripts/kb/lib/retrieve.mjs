// One retriever for every Node caller (CLI, blog generator, MCP server).
// Loads the KB once, builds the BM25 index once, and embeds the query only
// when an embedder is configured AND the KB holds vectors from that model.

import fs from 'node:fs';
import path from 'node:path';

import { buildIndex, packContext, search } from '../../../docs/kb/kb-core.js';
import { embedQuery, pickEmbedder } from './embed.mjs';
import { DEFAULT_REMOTE, KB_DIR, loadLocal, loadRemote } from './store.mjs';

export async function openKb({ dir = KB_DIR, remote = process.env.INFOCOLLECT_KB_URL, months, env = process.env } = {}) {
  let docs;
  let origin;
  if (!remote && fs.existsSync(path.join(dir, 'manifest.json'))) {
    docs = loadLocal(dir, { months: months ?? Infinity });
    origin = dir;
  } else {
    origin = remote || DEFAULT_REMOTE;
    docs = await loadRemote(origin, { months: months ?? 6 });
  }
  const list = [...docs.values()];
  const index = buildIndex(list);
  const vecModels = new Set(list.filter((d) => d.vecModel).map((d) => d.vecModel));
  const embedder = pickEmbedder(env);
  const useVectors = Boolean(embedder && vecModels.has(embedder.model));

  return {
    origin,
    size: list.length,
    index,
    byId: docs,
    hybrid: useVectors,
    async query(text, opts = {}) {
      const queryVector = useVectors ? await embedQuery(embedder, text) : null;
      return search(index, text, { ...opts, queryVector, vecModel: useVectors ? embedder.model : null });
    },
    pack: packContext,
  };
}

/** Filter builder shared by CLI flags and MCP tool arguments. */
export function makeFilter({ source, sourceType, since, until, tag } = {}) {
  if (!source && !sourceType && !since && !until && !tag) return null;
  const src = source ? String(source).toLowerCase() : null;
  return (doc) =>
    (!src || String(doc.source).toLowerCase().includes(src))
    && (!sourceType || doc.sourceType === sourceType)
    && (!since || String(doc.date) >= since)
    && (!until || String(doc.date) <= until)
    && (!tag || (doc.tags || []).includes(tag));
}
