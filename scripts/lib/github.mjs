// Discovers the AI repositories that are gaining traction *today*.
//
// GitHub's API has no "trending" endpoint, so we approximate it: every run we
// snapshot the star count of every candidate repo, and the next run turns the
// difference into stars-per-day. On the very first run (no snapshot yet) we
// fall back to the repo's lifetime star average, which is a rougher but
// serviceable proxy.

import { DAY_MS, clamp, fetchWithRetry, log, sleep, warn } from './util.mjs';

const API = 'https://api.github.com';

function headers(token) {
  return {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
}

async function searchRepositories(query, token, perPage = 50) {
  const url = `${API}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perPage}`;
  const res = await fetchWithRetry(url, { headers: headers(token) });
  if (!res.ok) {
    warn(`repo search failed (${res.status}): ${query}`);
    return [];
  }
  const body = await res.json();
  return body.items || [];
}

/** Repos that look like reading lists rather than tools. */
function looksLikeCollection(repo, patterns) {
  const haystack = `${repo.full_name} ${repo.description || ''} ${(repo.topics || []).join(' ')}`.toLowerCase();
  return patterns.some((pattern) => haystack.includes(pattern));
}

/**
 * @returns {Promise<{tools: object[], snapshot: object, candidates: number}>}
 */
export async function collectTrendingRepos(config, previousSnapshot, token) {
  const { queries, excludePatterns, minStars, activeWithinDays, take } = config;
  const candidates = new Map();

  for (const template of queries) {
    const query = template
      .replace('{active}', isoDaysAgo(activeWithinDays))
      .replace('{recent}', isoDaysAgo(config.newRepoWindowDays))
      .replace('{minStars}', String(minStars));
    const items = await searchRepositories(query, token);
    log(`search "${query}" -> ${items.length} repos`);
    for (const repo of items) {
      if (repo.archived || repo.disabled || repo.fork) continue;
      if (looksLikeCollection(repo, excludePatterns)) continue;
      if (!candidates.has(repo.full_name)) candidates.set(repo.full_name, repo);
    }
    // Search API allows 30 req/min authenticated; stay well under it.
    await sleep(1200);
  }

  const now = Date.now();
  const snapshot = {};
  const scored = [];

  for (const repo of candidates.values()) {
    const stars = repo.stargazers_count;
    snapshot[repo.full_name] = { stars, at: new Date(now).toISOString() };

    const previous = previousSnapshot[repo.full_name];
    const ageDays = clamp((now - new Date(repo.created_at)) / DAY_MS, 1, 100000);
    const lifetimeAverage = stars / ageDays;

    let velocity;
    let measured = false;
    let delta = null;
    if (previous) {
      const elapsedDays = (now - new Date(previous.at)) / DAY_MS;
      if (elapsedDays >= 0.2) {
        delta = stars - previous.stars;
        velocity = Math.max(delta, 0) / elapsedDays;
        measured = true;
      }
    }
    if (!measured) {
      // No comparable snapshot yet: discount the lifetime average so measured
      // repos win ties once real data exists.
      velocity = lifetimeAverage * 0.6;
    }

    const daysSincePush = (now - new Date(repo.pushed_at)) / DAY_MS;
    const recency = Math.exp(-daysSincePush / 10);
    const freshness = ageDays <= config.newRepoWindowDays ? 1.25 : 1;
    const score = velocity * (0.6 + 0.4 * recency) * freshness;

    scored.push({
      name: repo.full_name,
      url: repo.html_url,
      homepage: repo.homepage || null,
      description: repo.description || '',
      stars,
      starsDelta: delta,
      starsPerDay: Math.round(velocity * 10) / 10,
      measured,
      forks: repo.forks_count,
      language: repo.language || null,
      topics: (repo.topics || []).slice(0, 8),
      license: repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : null,
      createdAt: repo.created_at,
      pushedAt: repo.pushed_at,
      openIssues: repo.open_issues_count,
      score: Math.round(score * 100) / 100,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const tools = scored.slice(0, take).map((tool, index) => ({ rank: index + 1, ...tool }));
  return { tools, snapshot, candidates: candidates.size };
}

/** Latest releases of the repos we track — the clearest "new version" signal. */
export async function collectReleases(repos, token, sinceDays = 3) {
  const cutoff = Date.now() - sinceDays * DAY_MS;
  const items = [];
  for (const repo of repos) {
    try {
      const res = await fetchWithRetry(`${API}/repos/${repo}/releases?per_page=3`, { headers: headers(token) });
      if (!res.ok) {
        warn(`releases failed for ${repo}: HTTP ${res.status}`);
        continue;
      }
      const releases = await res.json();
      for (const release of releases) {
        if (release.draft || release.prerelease) continue;
        const published = release.published_at ? Date.parse(release.published_at) : 0;
        if (!published || published < cutoff) continue;
        items.push({
          title: `${repo} ${release.tag_name || release.name || ''}`.trim(),
          url: release.html_url,
          source: 'GitHub Releases',
          sourceType: 'release',
          publishedAt: new Date(published).toISOString(),
          body: release.body || '',
        });
      }
    } catch (error) {
      warn(`releases error for ${repo}: ${error.message}`);
    }
    await sleep(200);
  }
  return items;
}
