// The "wide net" for the knowledge base. Everything here is a public,
// key-free endpoint, and every collector is best effort: one dead source logs
// a warning and the run carries on.

import { parseFeed } from '../../lib/feeds.mjs';
import { DAY_MS, canonicalUrl, fetchWithRetry, log, stripHtml, truncate, warn } from '../../lib/util.mjs';

async function getJson(url) {
  const res = await fetchWithRetry(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function feeds(list = []) {
  const out = [];
  await Promise.all(list.map(async (feed) => {
    try {
      const res = await fetchWithRetry(feed.url, { headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, */*' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const entries = parseFeed(await res.text(), feed.name).slice(0, feed.limit || 30);
      for (const e of entries) out.push({ ...e, tags: feed.tags || [] });
      log(`kb feed ${feed.name} -> ${entries.length}`);
    } catch (error) {
      warn(`kb feed ${feed.name} failed: ${error.message}`);
    }
  }));
  return out;
}

async function huggingFace(cfg = {}) {
  const out = [];
  const limit = cfg.limit || 30;
  if (cfg.dailyPapers) {
    try {
      const papers = await getJson('https://huggingface.co/api/daily_papers');
      for (const p of (Array.isArray(papers) ? papers : []).slice(0, limit)) {
        const paper = p.paper || p;
        if (!paper?.id) continue;
        out.push({
          title: stripHtml(paper.title || p.title || ''),
          url: `https://huggingface.co/papers/${paper.id}`,
          source: 'HF Daily Papers',
          sourceType: 'paper',
          publishedAt: paper.publishedAt || p.publishedAt || null,
          body: truncate(stripHtml(paper.summary || ''), 1200),
          score: paper.upvotes || 0,
          tags: ['paper'],
        });
      }
      log(`kb hf daily papers -> ${out.length}`);
    } catch (error) {
      warn(`kb hf daily papers failed: ${error.message}`);
    }
  }
  if (cfg.trendingModels) {
    try {
      const models = await getJson(`https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=${limit}`);
      let n = 0;
      for (const m of Array.isArray(models) ? models : []) {
        if (!m?.id) continue;
        n++;
        out.push({
          title: m.id,
          url: `https://huggingface.co/${m.id}`,
          source: 'HF Trending Models',
          sourceType: 'model',
          publishedAt: m.lastModified || m.createdAt || null,
          body: [m.pipeline_tag, m.library_name, ...(m.tags || []).slice(0, 12)].filter(Boolean).join(' '),
          score: m.trendingScore || m.likes || 0,
          tags: ['model'],
        });
      }
      log(`kb hf trending models -> ${n}`);
    } catch (error) {
      warn(`kb hf trending models failed: ${error.message}`);
    }
  }
  return out;
}

async function reddit(cfg = {}) {
  const out = [];
  for (const sub of cfg.subs || []) {
    try {
      const body = await getJson(`https://www.reddit.com/r/${encodeURIComponent(sub)}/top.json?t=day&limit=${cfg.limit || 25}`);
      let n = 0;
      for (const { data: p } of body?.data?.children || []) {
        if (!p || p.stickied || (p.score || 0) < (cfg.minScore || 0)) continue;
        n++;
        const permalink = `https://www.reddit.com${p.permalink}`;
        out.push({
          title: stripHtml(p.title || ''),
          url: canonicalUrl(p.is_self || !p.url ? permalink : p.url),
          discussion: permalink,
          source: `r/${sub}`,
          sourceType: 'community',
          publishedAt: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
          body: truncate(stripHtml(p.selftext || ''), 1200),
          score: p.score || 0,
          tags: ['community'],
        });
      }
      log(`kb reddit r/${sub} -> ${n}`);
    } catch (error) {
      warn(`kb reddit r/${sub} failed: ${error.message}`);
    }
  }
  return out;
}

async function hackerNews(cfg = {}) {
  const out = [];
  const since = Math.floor((Date.now() - 2 * DAY_MS) / 1000);
  for (const q of cfg.queries || []) {
    try {
      const body = await getJson(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&numericFilters=created_at_i>${since},points>${cfg.minPoints || 30}&hitsPerPage=20`);
      for (const hit of body.hits || []) {
        const discussion = `https://news.ycombinator.com/item?id=${hit.objectID}`;
        out.push({
          title: stripHtml(hit.title || ''),
          url: canonicalUrl(hit.url || discussion),
          discussion,
          source: 'Hacker News',
          sourceType: 'hn',
          publishedAt: hit.created_at || null,
          body: truncate(stripHtml(hit.story_text || ''), 800),
          score: hit.points || 0,
          tags: ['community'],
        });
      }
    } catch (error) {
      warn(`kb hn "${q}" failed: ${error.message}`);
    }
  }
  log(`kb hn -> ${out.length}`);
  return out;
}

/** Run every configured wide-net collector in parallel. */
export async function collectWideNet(kbConfig = {}) {
  const groups = await Promise.all([
    feeds(kbConfig.feeds),
    huggingFace(kbConfig.huggingFace),
    reddit(kbConfig.reddit),
    hackerNews(kbConfig.hackerNews),
  ]);
  return groups.flat().filter((item) => item.title && item.url);
}
