// 「最先端マップ」: AI だけでなく量子・数理物理・バイオ・ニューロ・ワールドモデル
// などの分野ごとに、オープンソース／大手／どっちつかず の3部門で
// その日の動きを集める。
//
// 純粋関数（分類・選別）とネットワーク収集（collectFrontier）を分けてあり、
// 前者は selftest でオフライン検証できる。

import { collectFeeds, collectHackerNews } from './feeds.mjs';
import { collectTrendingRepos } from './github.mjs';
import { DAY_MS, canonicalUrl, fetchWithRetry, log, truncate, warn } from './util.mjs';

export const TIER_ORDER = ['oss', 'hybrid', 'bigtech'];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SPEC_NUM = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|[一二三四五六七八九十])';
const SPEC_BNUM = '(\\d+(?:\\.\\d+)?)';
const SPEC_NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};
const LOOP_PATTERNS = [
  new RegExp(`(?:^|[^a-z0-9])(?:loop[_\\s-]*(?:count|num|n)?|num[_\\s-]*loops?|n[_\\s-]*loops?)\\s*[:=≈~]?\\s*${SPEC_NUM}(?![a-z0-9])`, 'gi'),
  new RegExp(`(?:^|[^a-z0-9])${SPEC_NUM}\\s*(?:passes|times|loops?|回ループ|回繰り返し?)(?![a-z0-9])`, 'gi'),
];
const EFFECTIVE_PATTERNS = [
  new RegExp(`${SPEC_BNUM}\\s*b?\\s*(?:effective\\s+active|active\\s+effective|実効アクティブ)(?:\\s*(?:params|parameters|パラメータ))?`, 'gi'),
  new RegExp(`(?:effective\\s+active|実効アクティブ)\\s*(?:params|parameters|パラメータ)?\\s*(?:of|about|approx\\.?|≈|~|:|=|約)?\\s*${SPEC_BNUM}\\s*b?`, 'gi'),
];
const ACTIVE_PATTERNS = [
  new RegExp(`${SPEC_BNUM}\\s*b\\s+active(?:\\s+(?:params|parameters))?`, 'gi'),
  new RegExp(`active\\s+(?:params|parameters)?\\s*(?:of|about|approx\\.?|≈|~|:|=|約)?\\s*${SPEC_BNUM}\\s*b?`, 'gi'),
  new RegExp(`アクティブパラメータ\\s*(?:約)?\\s*${SPEC_BNUM}`, 'gi'),
];
const TABLE_PATTERN = /params\s*\(b\)\s*activated\s*\/\s*total[\s\S]{0,300}?(\d+(?:\.\d+)?)\s*\/\s*\d+(?:\.\d+)?/i;

function specValue(token) {
  if (/^\d+(?:\.\d+)?$/.test(token)) return Number(token);
  return SPEC_NUMBER_WORDS[token] ?? null;
}

function specText(...parts) {
  return parts
    .map((part) => (Array.isArray(part) ? part.join(' ') : String(part ?? '')))
    .join(' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function firstSpecNumber(text, patterns) {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) return specValue(match[1]);
  }
  return null;
}

function maxSpecNumber(text, patterns) {
  let best = null;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      const value = specValue(match[1]);
      if (value != null && (best == null || value > best)) best = value;
    }
  }
  return best;
}

export function extractLoopSpec(tags, description = '') {
  const text = specText(tags, description);
  const loopCount = firstSpecNumber(text, LOOP_PATTERNS);
  const effective = maxSpecNumber(text, EFFECTIVE_PATTERNS);
  const table = TABLE_PATTERN.exec(text);
  const active = maxSpecNumber(text, ACTIVE_PATTERNS);
  const activeParamsB = effective != null ? Math.round(effective) : table ? specValue(table[1]) : active;
  return { loopCount, activeParamsB };
}

export function formatModelSpec(summary, spec = {}) {
  const base = String(summary || '').trim();
  const parts = [];
  if (spec.loopCount != null) parts.push(`ループ${spec.loopCount}回`);
  if (spec.activeParamsB != null) parts.push(`実効アクティブ${spec.activeParamsB}B`);
  if (!parts.length || parts.every((part) => base.includes(part))) return base;
  const extra = parts.filter((part) => !base.includes(part)).join('・');
  return extra ? `${base}（${extra}）`.trim() : base;
}

const matcherCache = new Map();
function matcherFor(keyword) {
  const key = keyword.toLowerCase();
  if (matcherCache.has(key)) return matcherCache.get(key);
  // 英数字だけの短い語（mcp, sae, eeg …）は単語境界で照合して誤爆を防ぐ。
  // 日本語や記号を含む語は部分一致。
  const matcher = /^[a-z0-9 .\-/]+$/.test(key)
    ? (text) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(key)}([^a-z0-9]|$)`).test(text)
    : (text) => text.includes(key);
  matcherCache.set(key, matcher);
  return matcher;
}

/** 何個のキーワードに当たったか（大文字小文字は無視）。 */
export function keywordHits(text, keywords = []) {
  const haystack = String(text || '').toLowerCase();
  let hits = 0;
  for (const keyword of keywords) if (matcherFor(keyword)(haystack)) hits++;
  return hits;
}

function itemText(item) {
  return `${item.title || ''} ${item.body || ''} ${(item.topics || []).join(' ')}`;
}

/**
 * どの分野に入れるかを決める。
 * - 分野専用のソースから来たもの（domainHint）はその分野。ただし
 *   requireKeywords のソース（総合ブログ等）はキーワードが当たったときだけ。
 * - 共有ソース・HN 以外の一般記事は、最もキーワードが当たる分野へ。
 * どこにも当たらなければ null（捨てる）。
 */
export function classifyDomain(item, domains) {
  const text = itemText(item);
  if (item.domainHint) {
    const hinted = domains.find((domain) => domain.id === item.domainHint);
    if (hinted) {
      const hits = keywordHits(text, hinted.keywords);
      if (!item.requireKeywords || hits > 0) return { id: hinted.id, hits };
    }
  }
  let best = null;
  for (const domain of domains) {
    const hits = keywordHits(text, domain.keywords);
    if (hits > 0 && (!best || hits > best.hits)) best = { id: domain.id, hits };
  }
  // 分野専用ソースでもない一般記事は、2語以上当たったときだけ採用する。
  if (best && !item.domainHint && best.hits < 2) return null;
  return best;
}

function ownerOf(name) {
  return String(name || '').split('/')[0].toLowerCase();
}

/**
 * 3部門の判定。
 *   oss     … コミュニティ・大学・個人の公開物
 *   bigtech … 大手の公式発表（クローズド中心）
 *   hybrid  … 大手のオープン公開、研究所・スタートアップ、論文・専門メディア
 */
export function classifyTier(item, config) {
  const bigOrgs = new Set((config.bigOrgs || []).map((org) => org.toLowerCase()));
  const text = `${item.title || ''} ${item.body || ''} ${item.url || ''}`.toLowerCase();
  const open = keywordHits(text, config.openHints || []) > 0 || /github\.com\//.test(item.url || '');
  const big = (config.bigNames || []).some((name) => text.includes(name));

  if (item.kind === 'repo' || item.kind === 'model') {
    return bigOrgs.has(ownerOf(item.title)) ? 'hybrid' : 'oss';
  }
  if (item.tier === 'bigtech') return open ? 'hybrid' : 'bigtech';
  if (item.tier === 'oss' || item.tier === 'hybrid') return item.tier;
  // ソース側に部門が無いもの（HN・旧来のAIニュース）は本文から推定する。
  if (/github\.com\//.test(item.url || '')) {
    return bigOrgs.has(ownerOf(String(item.url).split('github.com/')[1])) ? 'hybrid' : 'oss';
  }
  if (big && open) return 'hybrid';
  if (big) return 'bigtech';
  if (open) return 'oss';
  return 'hybrid';
}

/**
 * スコア上位から n 件取りつつ、各部門から最低 minPerTier 件は入るようにする。
 * 「OSSだけ」「大手だけ」に偏らないための仕掛け。
 */
export function balancedTake(items, n, { minPerTier = 1, maxPerSource = Infinity } = {}) {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const picked = [];
  const perSource = new Map();
  const canTake = (item) => (perSource.get(item.source) || 0) < maxPerSource;
  const take = (item) => {
    picked.push(item);
    perSource.set(item.source, (perSource.get(item.source) || 0) + 1);
  };
  for (const tier of TIER_ORDER) {
    let count = 0;
    for (const item of sorted) {
      if (picked.length >= n || count >= minPerTier) break;
      if (item.tier !== tier || picked.includes(item) || !canTake(item)) continue;
      take(item);
      count++;
    }
  }
  for (const item of sorted) {
    if (picked.length >= n) break;
    if (!picked.includes(item) && canTake(item)) take(item);
  }
  return picked.sort((a, b) => b.score - a.score);
}

function normaliseTitle(title) {
  return String(title || '').toLowerCase().replace(/[^a-z0-9぀-ヿ一-龯]+/g, ' ').trim();
}

/**
 * 収集済みの生アイテムを分野×部門に振り分け、分野ごとの一覧を作る。
 * @param {{news: object[], repos: object[], models: object[]}} raw
 */
export function buildFrontier(raw, config, now = Date.now()) {
  const domains = config.domains || [];
  const limits = { repos: 3, news: 6, models: 3, maxPerSource: 2, ...(config.perDomain || {}) };
  const maxAgeDays = config.maxAgeDays ?? 4;
  const buckets = new Map(domains.map((domain) => [domain.id, { repos: [], models: [], news: [] }]));
  const seenUrls = new Set();
  const seenTitles = new Set();

  const place = (item, list) => {
    const url = canonicalUrl(item.url || '');
    const titleKey = normaliseTitle(item.title);
    if (!item.title || !url || seenUrls.has(url) || (list === 'news' && seenTitles.has(titleKey))) return;
    const domain = classifyDomain(item, domains);
    if (!domain) return;
    seenUrls.add(url);
    seenTitles.add(titleKey);
    buckets.get(domain.id)[list].push({ ...item, url, hits: domain.hits, tier: classifyTier(item, config) });
  };

  for (const item of raw.repos || []) place({ ...item, kind: 'repo' }, 'repos');
  for (const item of raw.models || []) place({ ...item, kind: 'model' }, 'models');
  for (const item of raw.news || []) {
    const published = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
    const ageDays = Number.isNaN(published) ? maxAgeDays : (now - published) / DAY_MS;
    if (ageDays > maxAgeDays || ageDays < -0.5) continue;
    place({ ...item, kind: 'news', ageDays }, 'news');
  }

  return domains.map((domain) => {
    const bucket = buckets.get(domain.id);
    const news = bucket.news.map((item) => ({
      ...item,
      score: round(Math.max(0, 30 - item.ageDays * 8) + (item.weight || 0) + Math.min(15, item.hits * 3)
        + (item.points ? Math.min(20, item.points / 15) : 0)),
    }));
    const repos = bucket.repos.map((item) => ({ ...item, score: round(item.score ?? 0) }));
    const models = bucket.models.map((item) => ({ ...item, score: round(item.score ?? 0) }));
    const picked = {
      repos: balancedTake(repos, limits.repos, { minPerTier: 1 }),
      models: balancedTake(models, limits.models, { minPerTier: 1 }),
      news: balancedTake(news, limits.news, { minPerTier: 1, maxPerSource: limits.maxPerSource }),
    };
    const entries = [...picked.repos, ...picked.models, ...picked.news].map(toEntry);
    const tierCounts = Object.fromEntries(TIER_ORDER.map((tier) => [tier, entries.filter((e) => e.tier === tier).length]));
    return {
      id: domain.id,
      label: domain.label,
      short: domain.short || domain.label,
      digest: '',
      tierCounts,
      candidates: bucket.repos.length + bucket.models.length + bucket.news.length,
      entries,
    };
  });
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function toEntry(item) {
  return {
    kind: item.kind,
    tier: item.tier,
    title: item.title,
    titleJa: '',
    summary: '',
    body: truncate(item.body || '', 600),
    url: item.url,
    source: item.source,
    publishedAt: item.publishedAt || null,
    score: item.score,
    ...(item.discussion ? { discussion: item.discussion } : {}),
    ...(item.kind === 'repo'
      ? { stars: item.stars, starsDelta: item.starsDelta, starsPerDay: item.starsPerDay, language: item.language, license: item.license }
      : {}),
    ...(item.kind === 'model'
      ? {
          likes: item.likes,
          downloads: item.downloads,
          pipeline: item.pipeline || null,
          loopCount: item.loopCount ?? null,
          activeParamsB: item.activeParamsB ?? null,
        }
      : {}),
  };
}

/** ルールベースの日本語要約（AIキーが無いとき）。 */
export function fallbackFrontier(domain, tiers = {}) {
  const label = (tier) => tiers[tier]?.short || tier;
  const entries = domain.entries.map((entry) => ({
    ...entry,
    titleJa: entry.titleJa || entry.title,
    summary: entry.summary || truncate(entry.body || entry.title, 160),
  }));
  const counts = TIER_ORDER.map((tier) => `${label(tier)} ${domain.tierCounts[tier] || 0}件`).join('・');
  const top = entries[0];
  const digest = entries.length
    ? `${counts}。いちばん強いシグナルは「${truncate(top.title, 60)}」（${top.source}）。`
    : '今日はこの分野で拾えた新しい動きがありませんでした。';
  return { ...domain, digest: domain.digest || digest, entries };
}

// ---------------------------------------------------------------------------
// ネットワーク収集
// ---------------------------------------------------------------------------

/** Hugging Face のトレンドモデル（キー不要の公開API）。 */
export async function collectHfTrending(domains, { limit = 100 } = {}) {
  const pipelineToDomain = new Map();
  for (const domain of domains) for (const tag of domain.hfPipelines || []) pipelineToDomain.set(tag, domain.id);
  try {
    const res = await fetchWithRetry(`https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=${limit}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const models = await res.json();
    return (Array.isArray(models) ? models : []).map((model, index) => {
      const spec = extractLoopSpec(model.tags, model.description || model.cardData?.description || '');
      const specNote = formatModelSpec('', spec);
      return {
        title: model.id || model.modelId,
        url: `https://huggingface.co/${model.id || model.modelId}`,
        source: 'Hugging Face Trending',
        body: `${model.pipeline_tag || ''} ${(model.tags || []).slice(0, 12).join(' ')}${specNote ? ` ${specNote}` : ''}`,
        topics: (model.tags || []).slice(0, 12),
        pipeline: model.pipeline_tag || null,
        likes: model.likes ?? null,
        downloads: model.downloads ?? null,
        publishedAt: model.createdAt || null,
        domainHint: pipelineToDomain.get(model.pipeline_tag) || null,
        score: Math.max(1, 100 - index) + Math.min(40, Number(model.trendingScore || 0) / 5),
        loopCount: spec.loopCount,
        activeParamsB: spec.activeParamsB,
      };
    });
  } catch (error) {
    warn(`hugging face trending failed: ${error.message}`);
    return [];
  }
}

/**
 * 分野別の生データを集める。
 * @param {object} config        config/frontier.json
 * @param {object} options       { previousSnapshot, token, extraNews, excludePatterns }
 */
export async function collectFrontier(config, { previousSnapshot = {}, token = '', extraNews = [], excludePatterns = [] } = {}) {
  const domains = config.domains || [];
  const snapshot = {};
  const repos = [];
  const seenRepos = new Set();

  for (const domain of domains) {
    if (!domain.github?.length) continue;
    const { tools, snapshot: part } = await collectTrendingRepos(
      {
        queries: domain.github,
        excludePatterns,
        minStars: 50,
        activeWithinDays: 14,
        newRepoWindowDays: 120,
        take: (config.perDomain?.repos || 3) * 4,
        pauseMs: 2200, // 本体の検索と合わせても Search API の 30回/分 を超えない
      },
      previousSnapshot,
      token,
    );
    Object.assign(snapshot, part);
    for (const tool of tools) {
      if (seenRepos.has(tool.name)) continue;
      seenRepos.add(tool.name);
      repos.push({
        title: tool.name,
        url: tool.url,
        source: 'GitHub',
        body: tool.description,
        topics: tool.topics,
        stars: tool.stars,
        starsDelta: tool.starsDelta,
        starsPerDay: tool.starsPerDay,
        language: tool.language,
        license: tool.license,
        publishedAt: tool.pushedAt,
        domainHint: domain.id,
        score: tool.score,
      });
    }
  }

  const feedMeta = new Map();
  const feeds = [];
  for (const domain of domains) {
    for (const feed of domain.feeds || []) {
      feedMeta.set(feed.name, { ...feed, domainHint: domain.id });
      feeds.push(feed);
    }
  }
  for (const feed of config.sharedFeeds || []) {
    feedMeta.set(feed.name, { ...feed, domainHint: null });
    feeds.push(feed);
  }

  const hnQueries = domains.flatMap((domain) => (domain.hn || []).map((query) => ({ query, domain: domain.id })));
  const [feedResult, hfModels, ...hnLists] = await Promise.all([
    collectFeeds(feeds),
    collectHfTrending(domains),
    ...hnQueries.map(({ query }) => collectHackerNews([query], { minPoints: 25, perQuery: 8 })),
  ]);

  const news = [];
  for (const item of feedResult.items) {
    const meta = feedMeta.get(item.source) || {};
    news.push({ ...item, tier: meta.tier, weight: meta.weight || 0, domainHint: meta.domainHint, requireKeywords: Boolean(meta.requireKeywords) });
  }
  hnLists.forEach((list, index) => {
    for (const item of list) news.push({ ...item, domainHint: hnQueries[index].domain, requireKeywords: true, weight: 2 });
  });
  for (const item of extraNews) news.push({ ...item, domainHint: null, weight: 3 });

  log(`frontier: repos ${repos.length} / hf models ${hfModels.length} / news ${news.length}`);
  return {
    raw: { repos, models: hfModels, news },
    snapshot,
    feedsFailed: feedResult.failed,
  };
}
