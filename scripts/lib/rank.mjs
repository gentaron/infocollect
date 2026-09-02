// Turns the raw pile of feed/HN/release items into a ranked news list that
// leans towards "new feature / new version" announcements.

import { DAY_MS, canonicalUrl, truncate } from './util.mjs';

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
  return tags.length ? [...new Set(tags)] : ['news'];
}

export function rankNews(items, { sourceWeights = {}, take = 12, maxAgeDays = 3 } = {}) {
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
    let score = 0;
    score += Math.max(0, 40 - ageDays * 12); // freshness dominates
    for (const hint of RELEASE_HINTS) if (haystack.includes(hint)) score += 4;
    if (VERSION_PATTERN.test(item.title)) score += 10;
    if (item.sourceType === 'release') score += 14;
    score += sourceWeights[item.source] ?? 0;
    if (item.points) score += Math.min(20, item.points / 12);

    seenUrls.add(url);
    seenTitles.add(titleKey);
    ranked.push({
      ...item,
      url,
      tags: classify(item),
      body: truncate(item.body || '', 700),
      score: Math.round(score * 10) / 10,
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, take).map((item, index) => ({ rank: index + 1, ...item }));
}
