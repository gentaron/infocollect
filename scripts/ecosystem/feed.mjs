// gentaron.feed/1 — the one shape every repository uses to tell the network
// what it just produced. The hub's KB pulls each registry entry's `feed` URL
// every day, so a verified result in one repository becomes searchable
// (kb_search / kb_context) from every other repository.
//
//   {
//     "schema": "gentaron.feed/1",
//     "repo": "Mathematical-Physics-Lab-",
//     "generatedAt": "2026-11-11T00:00:00Z",
//     "items": [
//       { "id": "cosmohedron-n6", "title": "...", "url": "https://...", "date": "2026-11-11",
//         "kind": "research", "summary": "...", "tags": ["..."], "evidence": "verified" }
//     ]
//   }
//
// `evidence` says how far the item may be trusted: verified (checked by a
// deterministic test), observed (a measurement, not a claim), draft (not checked).

export const FEED_SCHEMA = 'gentaron.feed/1';
const EVIDENCE = new Set(['verified', 'observed', 'draft']);

/** Return a list of problems; empty means the feed can be ingested. */
export function validateFeed(feed) {
  const errors = [];
  if (!feed || typeof feed !== 'object') return ['feed is not an object'];
  if (feed.schema !== FEED_SCHEMA) errors.push(`schema must be ${FEED_SCHEMA}`);
  if (!feed.repo) errors.push('repo is missing');
  if (!Array.isArray(feed.items)) return [...errors, 'items must be an array'];
  feed.items.forEach((item, i) => {
    if (!item?.title) errors.push(`items[${i}].title is missing`);
    if (!/^https:\/\//.test(item?.url || '')) errors.push(`items[${i}].url must be https`);
    if (item?.evidence && !EVIDENCE.has(item.evidence)) errors.push(`items[${i}].evidence must be one of ${[...EVIDENCE].join(', ')}`);
  });
  return errors;
}

/** Turn a feed into KB collector items. Invalid items are dropped, not guessed at. */
export function feedItems(feed, { maxItems = 50 } = {}) {
  if (validateFeed({ ...feed, items: [] }).length) return [];
  return (feed.items || [])
    .filter((item) => item?.title && /^https:\/\//.test(item.url || ''))
    .slice(0, maxItems)
    .map((item) => ({
      title: `${feed.repo}: ${item.title}`,
      url: item.url,
      summary: item.summary,
      body: [item.body, item.evidence ? `証拠: ${item.evidence}` : ''].filter(Boolean).join(' '),
      source: `Network · ${feed.repo}`,
      sourceType: 'own',
      publishedAt: item.date ? `${String(item.date).slice(0, 10)}T00:00:00Z` : feed.generatedAt,
      tags: ['network', feed.repo, item.kind, item.evidence, ...(item.tags || [])].filter(Boolean),
    }));
}

/** Fetch every registry feed. One dead feed logs and the rest carry on. */
export async function collectNetwork(registry, { fetchImpl = fetch, log = () => {}, warn = () => {} } = {}) {
  const out = [];
  const status = [];
  await Promise.all((registry.repos || []).filter((r) => r.feed && r.status !== 'archive').map(async (r) => {
    try {
      const res = await fetchImpl(r.feed, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const feed = await res.json();
      // A broken envelope refuses the whole feed; a broken item only drops that item.
      const fatal = validateFeed({ ...feed, items: Array.isArray(feed?.items) ? [] : feed?.items });
      if (fatal.length) throw new Error(fatal.slice(0, 3).join('; '));
      const items = feedItems(feed);
      out.push(...items);
      status.push({ repo: r.name, ok: true, items: items.length, generatedAt: feed.generatedAt || null });
      log(`kb network ${r.name} -> ${items.length}`);
    } catch (error) {
      status.push({ repo: r.name, ok: false, error: error.message });
      warn(`kb network ${r.name} failed: ${error.message}`);
    }
  }));
  return { items: out, status: status.sort((a, b) => a.repo.localeCompare(b.repo)) };
}
