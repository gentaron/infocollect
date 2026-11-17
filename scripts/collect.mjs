#!/usr/bin/env node
// Daily collector: picks the AI repos gaining traction today, gathers AI
// product/version news, summarises everything in Japanese with a free-tier
// model, and writes the JSON the PWA reads.
//
//   node scripts/collect.mjs [--dry-run] [--no-ai]

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { summarise, summariseFrontier } from './lib/ai.mjs';
import { collectFeeds, collectHackerNews } from './lib/feeds.mjs';
import { collectFrontier, buildFrontier, fallbackFrontier } from './lib/frontier.mjs';
import { collectReleases, collectTrendingRepos } from './lib/github.mjs';
import { rankNews } from './lib/rank.mjs';
import { buildDigest, fallbackNewsSummary, fallbackToolSummary, toMarkdown } from './lib/render.mjs';
import { dateInZone, log, timeInZone, warn } from './lib/util.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'docs', 'data');
const ARCHIVE_DIR = path.join(DATA_DIR, 'archive');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'stars.json');
const KEEP_ARCHIVE_DAYS = 60;

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const NO_AI = args.has('--no-ai');
const NO_FRONTIER = args.has('--no-frontier');

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main() {
  const config = await readJson(path.join(ROOT, 'config', 'sources.json'), null);
  if (!config) throw new Error('config/sources.json を読み込めませんでした');

  const now = new Date();
  const timezone = config.timezone || 'Asia/Kuala_Lumpur';
  const dateLocal = dateInZone(now, timezone);
  const generatedAtLocal = timeInZone(now, timezone);
  log(`収集開始 ${generatedAtLocal} (${timezone})`);

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (!token) warn('GITHUB_TOKEN 未設定 — 匿名アクセスのため検索が制限される場合があります');

  const previousSnapshot = await readJson(SNAPSHOT_FILE, {});
  const { tools, snapshot, candidates } = await collectTrendingRepos(config.tools, previousSnapshot, token);
  log(`候補 ${candidates} 件 → 上位 ${tools.length} 件を採用`);

  const [feedResult, hnItems, releaseItems] = await Promise.all([
    collectFeeds(config.news.feeds),
    collectHackerNews(config.news.hackerNewsQueries),
    collectReleases(config.tools.watchReleases, token),
  ]);

  const sourceWeights = { ...(config.news.sourceWeights || {}) };
  for (const feed of config.news.feeds) if (feed.weight) sourceWeights[feed.name] = feed.weight;

  const news = rankNews([...feedResult.items, ...hnItems, ...releaseItems], {
    sourceWeights,
    take: config.news.take,
    maxAgeDays: config.news.maxAgeDays,
  });
  log(`ニュース候補 ${feedResult.items.length + hnItems.length + releaseItems.length} 件 → 上位 ${news.length} 件`);

  // 分野別「最先端マップ」（量子・数理物理・バイオ・ニューロ・ワールドモデル …）
  const frontierConfig = NO_FRONTIER ? null : await readJson(path.join(ROOT, 'config', 'frontier.json'), null);
  let frontier = null;
  let frontierSnapshot = {};
  if (frontierConfig) {
    try {
      const collected = await collectFrontier(frontierConfig, {
        previousSnapshot,
        token,
        extraNews: [...feedResult.items, ...hnItems, ...releaseItems],
        excludePatterns: config.tools.excludePatterns,
      });
      frontierSnapshot = collected.snapshot;
      const domains = buildFrontier(collected.raw, frontierConfig, now.getTime());
      const fromAi = NO_AI ? new Map() : await summariseFrontier(domains, process.env);
      frontier = {
        tiers: frontierConfig.tiers,
        domains: domains.map((domain) => {
          const ai = fromAi.get(domain.id);
          const merged = {
            ...domain,
            digest: ai?.digest || '',
            entries: domain.entries.map((entry, index) => ({
              ...entry,
              titleJa: ai?.items.get(index + 1)?.titleJa?.trim() || '',
              summary: ai?.items.get(index + 1)?.summary?.trim() || '',
            })),
          };
          return fallbackFrontier(merged, frontierConfig.tiers);
        }),
        stats: {
          candidates: collected.raw.repos.length + collected.raw.models.length + collected.raw.news.length,
          feedsFailed: collected.feedsFailed,
        },
      };
      log(`最先端マップ: ${frontier.domains.length} 分野 / ${frontier.domains.reduce((n, d) => n + d.entries.length, 0)} 件`);
    } catch (error) {
      warn(`最先端マップの収集に失敗（本体は続行）: ${error.message}`);
    }
  }

  const summary = NO_AI ? null : await summarise(tools, news, process.env);
  const ai = summary
    ? { enabled: true, provider: summary.provider, model: summary.model, label: `${summary.providerLabel} / ${summary.model}` }
    : { enabled: false, provider: null, model: null, label: 'ルールベース要約（AIキー未設定）' };

  const decoratedTools = tools.map((tool, index) => {
    const fromAi = summary?.tools.get(index + 1);
    const fallback = fallbackToolSummary(tool);
    return {
      ...tool,
      headline: fromAi?.headline?.trim() || fallback.headline,
      summary: fromAi?.summary?.trim() || fallback.summary,
      why: fromAi?.why?.trim() || fallback.why,
    };
  });

  const decoratedNews = news.map((item, index) => {
    const fromAi = summary?.news.get(index + 1);
    const fallback = fallbackNewsSummary(item);
    return {
      rank: item.rank,
      title: item.title,
      titleJa: fromAi?.titleJa?.trim() || fallback.titleJa,
      summary: fromAi?.summary?.trim() || fallback.summary,
      url: item.url,
      discussion: item.discussion || null,
      source: item.source,
      sourceType: item.sourceType,
      publishedAt: item.publishedAt,
      tags: item.tags,
      score: item.score,
    };
  });

  const payload = {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    generatedAtLocal,
    dateLocal,
    timezone,
    ai,
    digest: summary?.digest || buildDigest(decoratedTools, decoratedNews, generatedAtLocal),
    tools: decoratedTools,
    news: decoratedNews,
    frontier,
    stats: {
      repoCandidates: candidates,
      newsCandidates: feedResult.items.length + hnItems.length + releaseItems.length,
      feedsFailed: feedResult.failed,
    },
  };

  if (DRY_RUN) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  await writeJson(path.join(DATA_DIR, 'latest.json'), payload);
  await writeJson(path.join(ARCHIVE_DIR, `${dateLocal}.json`), payload);
  await writeJson(SNAPSHOT_FILE, { ...frontierSnapshot, ...snapshot });
  await fs.writeFile(path.join(DATA_DIR, 'latest.md'), toMarkdown(payload), 'utf8');

  // Keep the archive index small and bounded.
  const files = (await fs.readdir(ARCHIVE_DIR)).filter((name) => name.endsWith('.json')).sort().reverse();
  for (const stale of files.slice(KEEP_ARCHIVE_DAYS)) {
    await fs.rm(path.join(ARCHIVE_DIR, stale));
  }
  const kept = files.slice(0, KEEP_ARCHIVE_DAYS);
  await writeJson(path.join(DATA_DIR, 'index.json'), {
    updatedAt: now.toISOString(),
    timezone,
    dates: kept.map((name) => name.replace(/\.json$/, '')),
  });

  log(`書き出し完了: docs/data/latest.json ほか (${decoratedTools.length} tools / ${decoratedNews.length} news)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
