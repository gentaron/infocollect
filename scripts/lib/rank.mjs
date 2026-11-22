// Turns the raw pile of feed/HN/release items into a ranked news list that
// leans towards "new feature / new version" announcements.

import { DAY_MS, canonicalUrl, truncate } from './util.mjs';

export const DEFAULT_CATEGORY_KEYWORDS = {
  paper: ['paper', 'arxiv', 'benchmark', 'ablation', 'dataset', 'evaluation', '論文', '評価', 'データセット'],
  model: ['model', 'llm', 'weights', 'checkpoint', 'fine tuning', 'モデル', '重み'],
  tool: ['tool', 'library', 'sdk', 'cli', 'framework', 'plugin', 'release', 'open source', 'ツール', 'ライブラリ', 'プラグイン', '公開'],
};

const CATEGORY_BY_TAG = {
  paper: 'paper',
  research: 'paper',
  model: 'model',
  tool: 'tool',
  version: 'tool',
  release: 'tool',
  feature: 'tool',
};
const CATEGORY_ORDER = ['paper', 'model', 'tool'];

const RELEASE_HINTS = [
  'release', 'released', 'launch', 'launches', 'launched', 'introducing', 'announc',
  'now available', 'general availability', ' ga ', 'preview', 'update', 'updated',
  'new model', 'new feature', 'ships', 'shipping', 'rolls out', 'rollout',
  'open source', 'open-sources', 'version', 'リリース', '公開', '提供開始', '新機能', '新バージョン',
];

const VERSION_PATTERN = /\bv?\d+(\.\d+){1,2}\b/;

function normaliseTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9぀-ヿ一-龯]+/g, ' ')
    .trim();
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function downstreamUtility(candidate, categoryKeywords = []) {
  const tags = Array.isArray(candidate?.tags) ? candidate.tags : [candidate?.tags].filter(Boolean);
  const fields = [
    [normaliseTitle(candidate?.title), 0.5],
    [normaliseTitle(candidate?.summary || candidate?.body), 0.3],
    [normaliseTitle(tags.join(' ')), 0.2],
  ];
  const keywords = (Array.isArray(categoryKeywords) ? categoryKeywords : [])
    .map(normaliseTitle)
    .filter(Boolean);
  if (!keywords.length) return 0;
  let total = 0;
  for (const keyword of keywords) {
    let hit = 0;
    for (const [text, weight] of fields) if (text.includes(keyword)) hit += weight;
    total += Math.min(1, hit);
  }
  return round(total / keywords.length, 3);
}

function keywordsFor(tags, categoryKeywords) {
  if (Array.isArray(categoryKeywords)) return categoryKeywords;
  const map = { ...DEFAULT_CATEGORY_KEYWORDS, ...(categoryKeywords || {}) };
  for (const category of CATEGORY_ORDER) {
    if (tags.some((tag) => CATEGORY_BY_TAG[tag] === category)) return map[category] || [];
  }
  return [];
}

export function classify(item) {
  const haystack = `${item.title} ${item.body || ''}`.toLowerCase();
  const tags = [];
  if (item.sourceType === 'release' || VERSION_PATTERN.test(item.title)) tags.push('version');
  if (/release|launch|introduc|announc|now available|general availability|リリース|提供開始/.test(haystack)) {
    if (!tags.includes('version')) tags.push('release');
  }
  if (/feature|capability|support for|adds |新機能|対応/.test(haystack)) tags.push('feature');
  if (/model|llm|gpt|claude|gemini|llama|mistral|qwen/.test(haystack)) tags.push('model');
  if (/fund|raise|acquisition|valuation|ipo|買収|資金調達/.test(haystack)) tags.push('business');
  if (/paper|research|benchmark|arxiv|論文/.test(haystack)) tags.push('research');
  if (/\bmqtt\b|mosquitto/.test(haystack)) tags.push('mqtt');
  return tags.length ? [...new Set(tags)] : ['news'];
}

export function rankNews(items, {
  sourceWeights = {},
  take = 12,
  maxAgeDays = 3,
  categoryKeywords = DEFAULT_CATEGORY_KEYWORDS,
  utilityWeight = 6,
} = {}) {
  const now = Date.now();
  const seenUrls = new Set();
  const seenTitles = new Set();
  const ranked = [];

  for (const item of items) {
    if (!item.title || !item.url) continue;
    const url = canonicalUrl(item.url);
    const titleKey = normaliseTitle(item.title);
    if (seenUrls.has(url) || seenTitles.has(titleKey)) continue;

    const published = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
    const ageDays = Number.isNaN(published) ? maxAgeDays : (now - published) / DAY_MS;
    if (ageDays > maxAgeDays || ageDays < -0.5) continue;

    const haystack = `${item.title} ${item.body || ''}`.toLowerCase();
    const tags = classify(item);
    const utility = downstreamUtility(
      { title: item.title, summary: item.body, tags },
      keywordsFor(tags, categoryKeywords),
    );
    let score = 0;
    score += Math.max(0, 40 - ageDays * 12); // freshness dominates
    for (const hint of RELEASE_HINTS) if (haystack.includes(hint)) score += 4;
    if (VERSION_PATTERN.test(item.title)) score += 10;
    if (item.sourceType === 'release') score += 14;
    score += sourceWeights[item.source] ?? 0;
    if (item.points) score += Math.min(20, item.points / 12);
    score += utilityWeight * utility;

    seenUrls.add(url);
    seenTitles.add(titleKey);
    ranked.push({
      ...item,
      url,
      tags,
      body: truncate(item.body || '', 700),
      utilityScore: utility,
      score: round(score, 1),
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, take).map((item, index) => ({ rank: index + 1, ...item }));
}
