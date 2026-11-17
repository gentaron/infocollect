// 『ゆいまる予測』: note の書き手（humble_bobcat51）が次に記事にしそうなものを
// 当日の候補（GitHub リポジトリ・HF モデル・ニュース・最先端マップ）から予測する。
//
// 仕組み
//   1. config/yuimaru.json のテーマ別キーワード（直近記事から起こした初期値）で採点
//   2. 本人の新着記事（note RSS）から語を取り出し、新しい記事ほど重く学習して加点
//   3. 本人がもう書いたもの（タイトル・本文に名前が出たもの）は大きく減点
//   4. 実用ツールらしさ・伸び始め・新しさで加点、論文・企業PR・分野外で減点
//   5. 過去の予測と本人の新着記事を突き合わせて「的中率」を記録し、表示する
//
// ネットワークを使うのは fetchAuthorPosts だけ。残りは純粋関数で selftest できる。

import { parseFeed } from './feeds.mjs';
import { DAY_MS, canonicalUrl, fetchWithRetry, truncate, warn } from './util.mjs';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const matchers = new Map();
/**
 * 英数字だけの語は単語単位で、日本語・記号入りは部分一致で照合。
 * 末尾に * を付けた語（quantiz* 等）だけ前方一致。末尾の s（複数形）は許す。
 */
function matches(text, keyword) {
  const key = keyword.toLowerCase();
  let fn = matchers.get(key);
  if (!fn) {
    const stem = key.endsWith('*');
    const word = stem ? key.slice(0, -1) : key;
    if (/^[a-z0-9 .\-/+]+$/.test(word)) {
      const tail = stem ? '' : '(?:e?s)?(?![a-z0-9])';
      const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(word)}${tail}`);
      fn = (t) => re.test(t);
    } else {
      fn = (t) => t.includes(word);
    }
    matchers.set(key, fn);
  }
  return fn(text);
}

export function hitKeywords(text, keywords = []) {
  const haystack = String(text || '').toLowerCase();
  return keywords.filter((keyword) => matches(haystack, keyword));
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are', 'was', 'into', 'have', 'has', 'not', 'but',
  'all', 'any', 'can', 'its', 'our', 'out', 'use', 'using', 'used', 'how', 'what', 'why', 'new', 'one', 'more', 'about',
  'tool', 'tools', 'model', 'models', 'make', 'made', 'like', 'just', 'will', 'also', 'here', 'there', 'when', 'than',
  'https', 'http', 'www', 'com', 'note', 'github', 'thorough', 'explanation', 'bonus', 'era', 'personal', 'development',
  'next', 'generation', 'code', 'llm', 'web', 'bit', 'flash', 'saving', 'desperate', 'documentation', 'incredible', 'working', 'outdated', 'written', 'perhaps', 'glimpse', 'budget', 'common', 'sense', 'controlling', 'quite', 'fond', 'seems', 'entering', 'interesting', 'investigation', 'implementation', 'example', 'asking', 'help', 'impressions', 'after', 'day', 'plus', 'official', 'practices', 'tired', 'heavy', 'follows', 'hierarchy', 'unlocking', 'full', 'potential', 'devices', 'eradicating', 'identity', 'monster', 'delivers', 'features', 'performance', 'class', 'choice', 'let', 'have',
  'すること', 'について', 'ている', 'できる', 'ツール', 'モデル', 'エンジニア', 'とは',
]);

/** 記事タイトルから学習に使う語を取り出す（英数字語・カタカナ語）。 */
export function extractTerms(text) {
  const lower = String(text || '').toLowerCase();
  const terms = new Set();
  for (const m of lower.matchAll(/[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*/g)) {
    const word = m[0].replace(/[.-]+$/, '');
    if (word.length >= 3 && !STOPWORDS.has(word) && !/^\d/.test(word)) terms.add(word);
  }
  for (const m of String(text || '').matchAll(/[ァ-ヴー]{3,}/g)) {
    if (!STOPWORDS.has(m[0])) terms.add(m[0]);
  }
  return [...terms];
}

function ageDays(iso, now) {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : Math.max(0, (now - t) / DAY_MS);
}

/**
 * 本人の記事から「いま関心が向いている語」を学習する。
 * 新しい記事ほど重い（半減期 halfLifeDays）。日付不明の記事は中くらいの古さとして扱う。
 */
export function learnTerms(posts, { halfLifeDays = 21, now = Date.now() } = {}) {
  const weights = new Map();
  for (const post of posts) {
    const age = ageDays(post.publishedAt || post.date, now) ?? halfLifeDays;
    const decay = Math.pow(0.5, age / halfLifeDays);
    for (const term of extractTerms(post.title)) {
      weights.set(term, (weights.get(term) || 0) + decay);
    }
  }
  return weights;
}

/** 候補の「名前」として扱う文字列（repo 名・その短縮形）。既出判定に使う。 */
export function candidateNames(candidate) {
  const names = new Set();
  const title = String(candidate.name || candidate.title || '');
  if (/^[\w.-]+\/[\w.-]+$/.test(title)) {
    const short = title.split('/')[1];
    names.add(title.toLowerCase());
    if (short.length >= 3) names.add(short.toLowerCase());
    // org/repo-name → "repo name" 表記ゆれも拾う
    if (short.includes('-')) names.add(short.toLowerCase().replace(/-/g, ' '));
  }
  return [...names];
}

/** 本人がもう書いたか（名前が記事のタイトル・本文に出ているか）。 */
export function alreadyCovered(candidate, posts) {
  const names = candidateNames(candidate).filter((name) => name.length >= 3);
  if (!names.length) return null;
  for (const post of posts) {
    const text = `${post.title} ${post.body || ''}`.toLowerCase();
    for (const name of names) {
      if (matches(text, name) && (name.length >= 5 || matches(String(post.title).toLowerCase(), name))) {
        return { title: post.title, url: post.url || null };
      }
    }
  }
  return null;
}

function candidateText(c) {
  return `${c.name || c.title || ''} ${c.description || c.body || ''} ${(c.topics || []).join(' ')}`.toLowerCase();
}

/**
 * 1候補を採点する。返り値の score は 0〜100、reasons は日本語の短い理由。
 * @param {object} c 正規化済み候補 { kind, name/title, description/body, topics, source, url, stars, starsPerDay, createdAt, publishedAt, tier }
 */
export function scoreCandidate(c, profile, { learned = new Map(), posts = [], now = Date.now(), velocityRef = 500 } = {}) {
  const text = candidateText(c);
  const reasons = [];
  let raw = 0;

  // 1. テーマ一致（いちばん効く。上位2テーマまで足す）
  const themeHits = [];
  for (const theme of profile.themes) {
    const hits = hitKeywords(text, theme.keywords);
    if (hits.length) themeHits.push({ theme, hits, value: theme.weight * Math.min(1.6, 0.7 + 0.3 * hits.length) });
  }
  themeHits.sort((a, b) => b.value - a.value);
  const topThemes = themeHits.slice(0, 2);
  topThemes.forEach((t, i) => {
    raw += i === 0 ? t.value : t.value * 0.5;
  });
  if (topThemes[0]) reasons.push(`${topThemes[0].theme.label}（${topThemes[0].hits.slice(0, 3).map((k) => k.replace(/\*$/, '')).join('・')}）`);

  // 2. 本人の最近の関心語（RSS から学習）
  const { maxTermBonus = 18, perTermWeight = 6 } = profile.learning || {};
  let termBonus = 0;
  const termHits = [];
  for (const [term, weight] of learned) {
    if (matches(text, term)) {
      termBonus += weight * perTermWeight;
      termHits.push([term, weight]);
    }
  }
  termHits.sort((a, b) => b[1] - a[1]);
  const learnedHits = termHits.map(([term]) => term);
  termBonus = Math.min(maxTermBonus, termBonus);
  if (termBonus >= 3) {
    raw += termBonus;
    reasons.push(`最近の記事と地続き（${learnedHits.slice(0, 3).join('・')}）`);
  }

  // 3. 実用ツールらしさ・日本語
  const { boosts = {}, penalties = {} } = profile;
  if (c.kind === 'repo' && hitKeywords(text, boosts.practical?.keywords).length) {
    raw += boosts.practical.weight;
    reasons.push('すぐ試せる実用ツール');
  }
  if (hitKeywords(text, boosts.japanese?.keywords).length) raw += boosts.japanese.weight;
  if (c.kind === 'repo' && (c.license || c.tier === 'oss')) raw += boosts.oss?.weight || 0;

  // 4. 伸び始め・新しさ（スター速度は対数で効かせ、巨大リポジトリだけが勝たないように）
  if (c.starsPerDay != null && c.starsPerDay > 0) {
    const rising = Math.min(1, Math.log10(1 + c.starsPerDay) / Math.log10(1 + velocityRef));
    raw += (boosts.rising?.weight || 0) * rising;
    if (rising > 0.6) reasons.push(`急上昇中（約${Math.round(c.starsPerDay)}★/日）`);
  }
  const age = ageDays(c.createdAt || c.publishedAt, now);
  if (age != null && age <= 45) {
    raw += (boosts.fresh?.weight || 0) * (1 - age / 45);
    if (age <= 14 && c.kind !== 'news') reasons.push('出たばかり');
  }

  // 5. 減点
  const src = String(c.source || '');
  if ((penalties.paper?.sources || []).some((s) => src.includes(s))) raw -= penalties.paper.weight;
  if (hitKeywords(text, penalties.corporate?.keywords).length) raw -= penalties.corporate.weight;
  if (hitKeywords(text, penalties.offtopic?.keywords).length && !topThemes.length) raw -= penalties.offtopic.weight;
  else if (hitKeywords(text, penalties.offtopic?.keywords).length) raw -= penalties.offtopic.weight / 2;
  if (hitKeywords(text, penalties.collection?.keywords).length) raw -= penalties.collection.weight;
  if (hitKeywords(text, penalties.uncensored?.keywords).length) raw -= penalties.uncensored.weight;

  const covered = alreadyCovered(c, posts);
  if (covered) {
    raw -= penalties.covered?.weight || 60;
    reasons.unshift('既に記事化済み');
  }

  // 0〜100 に丸める（素点 70 前後で 90 点台になるよう緩いシグモイド）
  const score = Math.round(100 / (1 + Math.exp(-(raw - 40) / 14)));
  return {
    score,
    raw: Math.round(raw * 10) / 10,
    theme: topThemes[0]?.theme.id || null,
    themeLabel: topThemes[0]?.theme.label || null,
    focusTerm: termBonus >= 3 ? learnedHits[0] : null,
    reasons,
    covered,
  };
}

/** 収集済みデータを予測用の共通形に揃える。 */
export function poolFromPayload({ repos = [], news = [], frontier = null }) {
  const pool = [];
  const seen = new Set();
  const push = (c) => {
    const key = canonicalUrl(c.url || '') || c.name;
    if (!key || seen.has(key)) return;
    seen.add(key);
    pool.push(c);
  };
  for (const r of repos) {
    push({ kind: 'repo', name: r.name, url: r.url, description: r.description, topics: r.topics, stars: r.stars,
      starsPerDay: r.starsPerDay, createdAt: r.createdAt, pushedAt: r.pushedAt, license: r.license, language: r.language, source: 'GitHub' });
  }
  for (const d of frontier?.domains || []) {
    for (const e of d.entries || []) {
      push({ kind: e.kind, name: e.title, url: e.url, description: e.body || e.summary, topics: e.topics || [], stars: e.stars ?? null,
        starsPerDay: e.starsPerDay ?? null, createdAt: e.createdAt || null, publishedAt: e.publishedAt || null, source: e.source, tier: e.tier, domain: d.id });
    }
  }
  for (const n of news) {
    push({ kind: 'news', name: n.title, url: n.url, description: n.body || n.summary, topics: n.tags || [], publishedAt: n.publishedAt, source: n.source });
  }
  return pool;
}

/**
 * 予測本体。テーマが偏りすぎないよう maxPerTheme で頭打ちにし、既出は除外する。
 */
export function predict(pool, profile, { posts = [], now = Date.now(), take, includeCovered = false } = {}) {
  const learned = learnTerms(posts, { halfLifeDays: profile.learning?.halfLifeDays, now });
  const velocities = pool.map((c) => c.starsPerDay || 0).filter((v) => v > 0).sort((a, b) => a - b);
  const velocityRef = velocities.length ? velocities[Math.floor(velocities.length * 0.9)] || 500 : 500;
  const scored = pool.map((c) => ({ ...c, ...scoreCandidate(c, profile, { learned, posts, now, velocityRef }) }));
  scored.sort((a, b) => b.raw - a.raw);

  const limit = take ?? profile.take ?? 10;
  const perTheme = new Map();
  const picks = [];
  for (const c of scored) {
    if (picks.length >= limit) break;
    if (c.covered && !includeCovered) continue;
    if (!c.theme) continue;
    // テーマごと・「最近の記事と地続き」の主語ごとに頭打ちにして、一つの話題で埋まらないようにする
    const cap = profile.maxPerTheme ?? 3;
    const n = perTheme.get(c.theme) || 0;
    const focusKey = c.focusTerm ? `term:${c.focusTerm}` : null;
    const m = focusKey ? perTheme.get(focusKey) || 0 : 0;
    if (n >= cap || m >= cap) continue;
    perTheme.set(c.theme, n + 1);
    if (focusKey) perTheme.set(focusKey, m + 1);
    picks.push(c);
  }
  return {
    picks: picks.map((c, i) => ({
      rank: i + 1,
      kind: c.kind,
      name: c.name,
      url: c.url,
      description: truncate(c.description || '', 240),
      source: c.source,
      stars: c.stars ?? null,
      starsPerDay: c.starsPerDay ?? null,
      score: c.score,
      theme: c.theme,
      themeLabel: c.themeLabel,
      reasons: c.reasons,
    })),
    scored,
    learnedTerms: [...learned.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([term, w]) => ({ term, weight: Math.round(w * 100) / 100 })),
    covered: scored.filter((c) => c.covered).map((c) => ({ name: c.name, url: c.url, post: c.covered })),
  };
}

/**
 * 過去の予測（日付ごと）と本人の記事を突き合わせ、的中を数える。
 * 的中 = 予測した日より後に公開された記事に、その候補の名前が出た。
 * recall 側 = 本人の新しい記事のうち、事前に予測リストに入っていたものの割合。
 */
export function evaluate(history, posts, { windowDays = 14 } = {}) {
  const hits = [];
  let predicted = 0;
  for (const day of history) {
    const dayStart = Date.parse(`${day.date}T00:00:00Z`);
    for (const pick of day.picks || []) {
      predicted++;
      const later = posts.filter((p) => {
        const t = Date.parse(p.publishedAt || '');
        return !Number.isNaN(t) && t >= dayStart && t - dayStart <= windowDays * DAY_MS;
      });
      const covered = alreadyCovered(pick, later);
      if (covered) hits.push({ date: day.date, name: pick.name, rank: pick.rank, post: covered });
    }
  }
  const firstDay = history.length ? Math.min(...history.map((d) => Date.parse(`${d.date}T00:00:00Z`))) : Infinity;
  const evaluablePosts = posts.filter((p) => Date.parse(p.publishedAt || '') >= firstDay);
  const caught = evaluablePosts.filter((p) => hits.some((h) => h.post.title === p.title));
  const uniqueHits = new Map(hits.map((h) => [h.name, h]));
  return {
    days: history.length,
    predicted,
    hits: [...uniqueHits.values()].sort((a, b) => b.date.localeCompare(a.date)),
    precision: predicted ? Math.round((uniqueHits.size / predicted) * 1000) / 10 : null,
    postsSince: evaluablePosts.length,
    recall: evaluablePosts.length ? Math.round((caught.length / evaluablePosts.length) * 1000) / 10 : null,
  };
}

/** 本人の note RSS を取ってくる。取れなければ空配列（予測は seedPosts だけで続行）。 */
export async function fetchAuthorPosts(rssUrl) {
  if (!rssUrl) return [];
  try {
    const res = await fetchWithRetry(rssUrl, { headers: { accept: 'application/rss+xml, application/xml, */*' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseFeed(await res.text(), 'note').map((p) => ({ title: p.title, url: p.url, publishedAt: p.publishedAt, body: p.body }));
  } catch (error) {
    warn(`note RSS の取得に失敗（seedPosts で続行）: ${error.message}`);
    return [];
  }
}

/** RSS の記事と seedPosts を合わせる（同じタイトルは RSS 側を優先）。 */
export function mergePosts(rssPosts, seedPosts = []) {
  const byTitle = new Map();
  for (const p of seedPosts) byTitle.set(p.title, { title: p.title, url: p.url || null, publishedAt: p.date ? `${p.date}T00:00:00Z` : null, body: '' });
  for (const p of rssPosts) byTitle.set(p.title, p);
  return [...byTitle.values()];
}

/**
 * 「GitHubで伸びているAIツール」をゆいまる目線で選び直す。
 * 伸び（スター速度の順位）35% ＋ 予測スコア 65%。既に記事化済みのものは外す。
 */
export function rerankTools(repos, scoreByUrl, take = 3) {
  const byVelocity = [...repos].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const n = Math.max(1, byVelocity.length - 1);
  const velocityRank = new Map(byVelocity.map((repo, i) => [repo.name, 1 - i / n]));
  return repos
    .map((repo) => {
      const y = scoreByUrl.get(repo.url);
      return { repo, y, blend: 0.65 * ((y?.score ?? 0) / 100) + 0.35 * (velocityRank.get(repo.name) ?? 0) };
    })
    .filter(({ y }) => !y?.covered)
    .sort((a, b) => b.blend - a.blend)
    .slice(0, take)
    .map(({ repo, y }, index) => ({
      ...repo,
      rank: index + 1,
      yuimaruScore: y?.score ?? null,
      yuimaruReasons: y?.reasons ?? [],
    }));
}

/** ニュースは元の順位点に予測スコアを足して並べ直す（新機能・新バージョン中心は維持）。 */
export function rerankNews(items, scoreByUrl, take = 12) {
  return items
    .map((item) => {
      const y = scoreByUrl.get(item.url);
      return { ...item, yuimaruScore: y?.score ?? null, combined: (item.score ?? 0) + 0.4 * (y?.score ?? 0) };
    })
    .sort((a, b) => b.combined - a.combined)
    .slice(0, take)
    .map(({ combined, ...item }, index) => ({ ...item, rank: index + 1 }));
}
