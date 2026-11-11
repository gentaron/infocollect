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
  // Spaces and datasets: the "try it now" demos and the data behind new models.
  for (const [kind, enabled, path] of [['space', cfg.trendingSpaces, 'spaces'], ['dataset', cfg.trendingDatasets, 'datasets']]) {
    if (!enabled) continue;
    try {
      const list = await getJson(`https://huggingface.co/api/${path}?sort=trendingScore&direction=-1&limit=${cfg.extraLimit || 30}`);
      let n = 0;
      for (const m of Array.isArray(list) ? list : []) {
        if (!m?.id) continue;
        n++;
        out.push({
          title: m.id,
          url: `https://huggingface.co/${path}/${m.id}`,
          source: `HF Trending ${kind === 'space' ? 'Spaces' : 'Datasets'}`,
          sourceType: kind,
          publishedAt: m.lastModified || m.createdAt || null,
          body: [m.sdk, ...(m.tags || []).slice(0, 12)].filter(Boolean).join(' '),
          score: m.trendingScore || m.likes || 0,
          tags: [kind],
        });
      }
      log(`kb hf trending ${path} -> ${n}`);
    } catch (error) {
      warn(`kb hf trending ${path} failed: ${error.message}`);
    }
  }
  return out;
}

/**
 * Young repositories that are climbing fast. The digest's tool picks want
 * 100+ stars and an established repo; most of what gets written about the day a
 * tool appears is days old with a few dozen stars. Key-free search API
 * (10 requests/minute without a token; GITHUB_TOKEN raises it).
 */
export function risingItem(r, now = Date.now()) {
  const ageDays = Math.max(1, (now - Date.parse(r.created_at)) / DAY_MS);
  return {
    title: r.full_name,
    titleJa: r.description ? `${r.full_name} — ${truncate(r.description, 120)}` : undefined,
    url: r.html_url,
    source: 'GitHub Rising',
    sourceType: 'repo',
    publishedAt: r.created_at,
    summary: r.description || undefined,
    body: [r.language, `★${r.stargazers_count}`, `${(r.stargazers_count / ageDays).toFixed(1)}★/日`, ...(r.topics || []).slice(0, 8)].filter(Boolean).join(' '),
    score: r.stargazers_count / ageDays,
    tags: ['tool', 'rising', ...(r.topics || []).slice(0, 6)],
  };
}

async function githubRising(cfg = {}) {
  if (!cfg.queries?.length) return [];
  const out = [];
  const since = new Date(Date.now() - (cfg.createdWithinDays || 14) * DAY_MS).toISOString().slice(0, 10);
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = { accept: 'application/vnd.github+json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const seen = new Set();
  for (const q of cfg.queries) {
    const query = `${q} created:>=${since} stars:>=${cfg.minStars || 20}`;
    try {
      const res = await fetchWithRetry(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${cfg.perQuery || 30}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      for (const r of body.items || []) {
        if (seen.has(r.full_name) || r.fork || r.archived) continue;
        seen.add(r.full_name);
        out.push(risingItem(r));
      }
    } catch (error) {
      warn(`kb github rising "${q}" failed: ${error.message}`);
    }
  }
  log(`kb github rising -> ${out.length}`);
  return out;
}

/**
 * Models that just became callable, with price and context length: the facts a
 * "this new model, explained" post needs, and which ones are free right now.
 */
export function openRouterItem(m) {
  const perM = (x) => Number(x) * 1e6;
  const free = Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0;
  const price = free ? '無料' : `入力 $${perM(m.pricing?.prompt).toFixed(2)} / 出力 $${perM(m.pricing?.completion).toFixed(2)}（100万トークンあたり）`;
  return {
    title: m.name || m.id,
    url: `https://openrouter.ai/${m.id}`,
    source: 'OpenRouter New Models',
    sourceType: 'model',
    publishedAt: new Date(m.created * 1000).toISOString(),
    summary: truncate(stripHtml(m.description || ''), 300),
    body: [`ID ${m.id}`, price, m.context_length ? `文脈 ${Number(m.context_length).toLocaleString('en-US')} トークン` : '', (m.architecture?.input_modalities || []).join('/')].filter(Boolean).join('。'),
    tags: ['model', 'pricing', free ? 'free-tier' : 'paid'],
  };
}

async function openRouter(cfg = {}) {
  if (!cfg.enabled) return [];
  try {
    const body = await getJson('https://openrouter.ai/api/v1/models');
    const since = Date.now() / 1000 - (cfg.newWithinDays || 10) * 86400;
    const out = (body.data || []).filter((m) => m?.id && (m.created || 0) >= since).map(openRouterItem);
    log(`kb openrouter new models -> ${out.length}`);
    return out;
  } catch (error) {
    warn(`kb openrouter failed: ${error.message}`);
    return [];
  }
}

/** CISA's Known Exploited Vulnerabilities: the "actively exploited" fact, straight from the source. */
export function kevItem(v) {
  return {
    title: `${v.cveID} — ${v.vendorProject} ${v.product}: ${v.vulnerabilityName}`,
    url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
    source: 'CISA KEV',
    sourceType: 'security',
    publishedAt: `${v.dateAdded}T00:00:00Z`,
    summary: truncate(v.shortDescription || '', 400),
    body: [`悪用を確認（CISA KEV 追加 ${v.dateAdded}）`, v.knownRansomwareCampaignUse === 'Known' ? 'ランサムウェアでの利用あり' : '', `対応期限 ${v.dueDate}`, v.requiredAction].filter(Boolean).join('。'),
    tags: ['security', 'cve', 'exploited'],
  };
}

async function cisaKev(cfg = {}) {
  if (!cfg.enabled) return [];
  try {
    const body = await getJson('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json');
    const since = new Date(Date.now() - (cfg.addedWithinDays || 7) * DAY_MS).toISOString().slice(0, 10);
    const out = (body.vulnerabilities || []).filter((v) => v.dateAdded >= since).map(kevItem);
    log(`kb cisa kev -> ${out.length}`);
    return out;
  } catch (error) {
    warn(`kb cisa kev failed: ${error.message}`);
    return [];
  }
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
    githubRising(kbConfig.githubRising),
    openRouter(kbConfig.openRouter),
    cisaKev(kbConfig.cisaKev),
  ]);
  return groups.flat().filter((item) => item.title && item.url);
}
