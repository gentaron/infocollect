// AI news collection from free sources: RSS/Atom feeds plus the Hacker News
// (Algolia) search API. Both are public and need no API key.

import { DAY_MS, canonicalUrl, fetchWithRetry, log, stripHtml, truncate, warn } from './util.mjs';

/** Minimal RSS/Atom reader — enough for the well-formed feeds we subscribe to. */
export function parseFeed(xml, sourceName) {
  const entries = [];
  const blocks = [
    ...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi),
  ].map((match) => match[0]);

  for (const block of blocks) {
    const title = stripHtml(pick(block, 'title'));
    const link = extractLink(block);
    if (!title || !link) continue;
    const published =
      pick(block, 'published') ||
      pick(block, 'updated') ||
      pick(block, 'pubDate') ||
      pick(block, 'dc:date');
    const summary =
      pick(block, 'description') ||
      pick(block, 'summary') ||
      pick(block, 'content:encoded') ||
      pick(block, 'content');
    const timestamp = published ? Date.parse(stripHtml(published)) : NaN;
    entries.push({
      title,
      url: canonicalUrl(link),
      source: sourceName,
      sourceType: 'feed',
      publishedAt: Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString(),
      body: truncate(stripHtml(summary), 1200),
    });
  }
  return entries;
}

function pick(block, tag) {
  const escaped = tag.replace(/[:]/g, '\\:');
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, 'i'));
  if (!match) return '';
  return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function extractLink(block) {
  const href = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)
    || block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (href) return href[1];
  const inline = pick(block, 'link');
  if (inline) return stripHtml(inline);
  const guid = pick(block, 'guid');
  return /^https?:/i.test(guid) ? guid : '';
}

export async function collectFeeds(feeds) {
  const items = [];
  const failed = [];
  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const res = await fetchWithRetry(feed.url, { headers: { accept: 'application/rss+xml, application/xml, text/xml, */*' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      return { feed, entries: parseFeed(xml, feed.name) };
    }),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      log(`feed ${result.value.feed.name} -> ${result.value.entries.length} entries`);
      items.push(...result.value.entries);
    } else {
      warn(`feed ${feeds[i].name} failed: ${result.reason?.message || result.reason}`);
      failed.push(feeds[i].name);
    }
  }
  return { items, failed };
}

/** Hacker News stories matching AI keywords, ranked by points. */
export async function collectHackerNews(queries, { sinceDays = 2, minPoints = 40, perQuery = 15 } = {}) {
  const since = Math.floor((Date.now() - sinceDays * DAY_MS) / 1000);
  const items = [];
  for (const query of queries) {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&numericFilters=created_at_i>${since},points>${minPoints}&hitsPerPage=${perQuery}`;
    try {
      const res = await fetchWithRetry(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      for (const hit of body.hits || []) {
        const link = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
        items.push({
          title: stripHtml(hit.title || ''),
          url: canonicalUrl(link),
          source: 'Hacker News',
          sourceType: 'hn',
          publishedAt: hit.created_at || null,
          points: hit.points || 0,
          body: truncate(stripHtml(hit.story_text || ''), 600),
          discussion: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        });
      }
    } catch (error) {
      warn(`hacker news query "${query}" failed: ${error.message}`);
    }
  }
  return items;
}
