// InfoCollect PWA front-end. Reads the JSON produced by the daily collector,
// keeps the last successful payload in localStorage so the app still shows
// something useful offline, and registers the service worker.

const els = {
  updatedAt: document.getElementById('updated-at'),
  timezoneNote: document.getElementById('timezone-note'),
  aiBadge: document.getElementById('ai-badge'),
  digestCard: document.getElementById('digest-card'),
  digestText: document.getElementById('digest-text'),
  tools: document.getElementById('tools'),
  toolsCount: document.getElementById('tools-count'),
  news: document.getElementById('news'),
  newsCount: document.getElementById('news-count'),
  filters: document.getElementById('news-filters'),
  archive: document.getElementById('archive-select'),
  refresh: document.getElementById('refresh-btn'),
  install: document.getElementById('install-btn'),
  offline: document.getElementById('offline-banner'),
  buildNote: document.getElementById('build-note'),
  frontierSection: document.getElementById('frontier-section'),
  frontier: document.getElementById('frontier'),
  frontierCount: document.getElementById('frontier-count'),
  domainFilters: document.getElementById('domain-filters'),
  tierFilters: document.getElementById('tier-filters'),
};

const TIER_ORDER = ['oss', 'hybrid', 'bigtech'];
const KIND_LABELS = { repo: 'GitHub', model: 'HFモデル', news: '記事' };

const CACHE_KEY = 'infocollect:last-payload';
const TAG_LABELS = {
  version: '新バージョン',
  release: 'リリース',
  feature: '新機能',
  model: 'モデル',
  research: '研究',
  business: 'ビジネス',
  news: 'ニュース',
};

let payload = null;
let activeFilter = 'all';
let activeDomain = 'all';
let activeTier = 'all';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function safeUrl(value) {
  try {
    const url = new URL(value, location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
  } catch {
    return '#';
  }
}

function relativeTime(iso) {
  if (!iso) return '';
  const diffMinutes = (Date.now() - Date.parse(iso)) / 60000;
  if (Number.isNaN(diffMinutes)) return '';
  if (diffMinutes < 60) return `${Math.max(1, Math.round(diffMinutes))}分前`;
  if (diffMinutes < 60 * 24) return `${Math.round(diffMinutes / 60)}時間前`;
  return `${Math.round(diffMinutes / (60 * 24))}日前`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('ja-JP');
}

function renderMeta() {
  els.updatedAt.textContent = `${payload.generatedAtLocal || payload.dateLocal || '-'}`;
  els.timezoneNote.textContent = payload.timezone ? `(${payload.timezone})` : '';
  els.aiBadge.textContent = payload.ai?.enabled ? `要約: ${payload.ai.model}` : '要約: ルールベース';
  els.buildNote.textContent = payload.stats
    ? `候補 ${payload.stats.repoCandidates ?? 0} リポジトリ / ${payload.stats.newsCandidates ?? 0} 記事から選出`
    : '';
  if (payload.digest) {
    els.digestText.textContent = payload.digest;
    els.digestCard.hidden = false;
  } else {
    els.digestCard.hidden = true;
  }
}

function renderTools() {
  const tools = payload.tools || [];
  els.toolsCount.textContent = tools.length ? `${tools.length} 件` : '';
  if (!tools.length) {
    els.tools.innerHTML = '<div class="empty">まだ収集データがありません。毎朝9時（マレーシア時間）の自動実行後に表示されます。</div>';
    return;
  }
  els.tools.innerHTML = tools
    .map((tool) => {
      const growth = tool.starsDelta != null
        ? `<span class="up">+${formatNumber(tool.starsDelta)}</span> スター（前回比）`
        : `約 <span class="up">${formatNumber(tool.starsPerDay)}</span> スター/日`;
      const chips = (tool.topics || []).map((topic) => `<span class="chip">${escapeHtml(topic)}</span>`).join('');
      return `
      <article class="tool-card">
        <div class="tool-top">
          <div class="rank">${escapeHtml(tool.rank)}</div>
          <div>
            <h3 class="tool-title"><a href="${safeUrl(tool.url)}" rel="noopener" target="_blank">${escapeHtml(tool.name)}</a></h3>
            <p class="tool-headline">${escapeHtml(tool.headline || '')}</p>
          </div>
        </div>
        <p class="tool-body">${escapeHtml(tool.summary || tool.description || '')}</p>
        <p class="tool-why">${escapeHtml(tool.why || '')}</p>
        <div class="stat-row">
          <span class="stat">★ <strong>${formatNumber(tool.stars)}</strong></span>
          <span class="stat">${growth}</span>
          ${tool.language ? `<span class="stat">${escapeHtml(tool.language)}</span>` : ''}
          ${tool.license ? `<span class="stat">${escapeHtml(tool.license)}</span>` : ''}
          ${tool.pushedAt ? `<span class="stat">更新 ${relativeTime(tool.pushedAt)}</span>` : ''}
        </div>
        ${chips ? `<div class="chips">${chips}</div>` : ''}
      </article>`;
    })
    .join('');
}

function renderFilters() {
  const counts = new Map([['all', (payload.news || []).length]]);
  for (const item of payload.news || []) {
    for (const tag of item.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  const order = ['all', 'version', 'release', 'feature', 'model', 'research', 'business', 'news'];
  els.filters.innerHTML = order
    .filter((tag) => counts.get(tag))
    .map((tag) => {
      const label = tag === 'all' ? 'すべて' : TAG_LABELS[tag] || tag;
      return `<button class="filter" type="button" data-tag="${tag}" aria-pressed="${tag === activeFilter}">${label} ${counts.get(tag)}</button>`;
    })
    .join('');
}

function renderNews() {
  const all = payload.news || [];
  const items = activeFilter === 'all' ? all : all.filter((item) => (item.tags || []).includes(activeFilter));
  els.newsCount.textContent = all.length ? `${items.length} / ${all.length} 件` : '';
  if (!items.length) {
    els.news.innerHTML = '<li class="empty">該当するニュースがありません。</li>';
    return;
  }
  els.news.innerHTML = items
    .map((item) => {
      const tags = (item.tags || [])
        .map((tag) => `<span class="tag tag-${escapeHtml(tag)}">${escapeHtml(TAG_LABELS[tag] || tag)}</span>`)
        .join(' ');
      const discussion = item.discussion
        ? ` · <a href="${safeUrl(item.discussion)}" rel="noopener" target="_blank">議論</a>`
        : '';
      return `
      <li class="news-item">
        <h3><a href="${safeUrl(item.url)}" rel="noopener" target="_blank">${escapeHtml(item.titleJa || item.title)}</a></h3>
        <div class="news-meta">
          <span>${escapeHtml(item.source || '')}</span>
          <span>${escapeHtml(relativeTime(item.publishedAt))}</span>
          <span>${tags}</span>
        </div>
        <p class="news-summary">${escapeHtml(item.summary || '')}</p>
        ${item.titleJa && item.title && item.titleJa !== item.title
          ? `<div class="news-links">原題: ${escapeHtml(item.title)}${discussion}</div>`
          : discussion ? `<div class="news-links">${discussion.replace(/^ · /, '')}</div>` : ''}
      </li>`;
    })
    .join('');
}

function tierLabel(tier) {
  return payload.frontier?.tiers?.[tier]?.label || tier;
}

function renderFrontierFilters(domains) {
  const total = domains.reduce((sum, domain) => sum + domain.entries.length, 0);
  const domainButtons = [['all', 'すべての分野', total]]
    .concat(domains.map((domain) => [domain.id, domain.short || domain.label.replace(/（.*$/, ''), domain.entries.length]));
  els.domainFilters.innerHTML = domainButtons
    .map(([id, label, count]) =>
      `<button class="filter" type="button" data-domain="${escapeHtml(id)}" aria-pressed="${id === activeDomain}">${escapeHtml(label)} ${count}</button>`)
    .join('');
  const scope = activeDomain === 'all' ? domains : domains.filter((domain) => domain.id === activeDomain);
  const tierCounts = { all: 0 };
  for (const domain of scope) {
    for (const entry of domain.entries) {
      tierCounts.all++;
      tierCounts[entry.tier] = (tierCounts[entry.tier] || 0) + 1;
    }
  }
  els.tierFilters.innerHTML = ['all', ...TIER_ORDER]
    .map((tier) => {
      const label = tier === 'all' ? '全部門' : tierLabel(tier);
      const note = tier === 'all' ? '' : escapeHtml(payload.frontier.tiers?.[tier]?.note || '');
      return `<button class="filter tier-filter tier-${tier}" type="button" data-tier="${tier}" title="${note}" aria-pressed="${tier === activeTier}">${escapeHtml(label)} ${tierCounts[tier] || 0}</button>`;
    })
    .join('');
}

function renderFrontier() {
  const domains = payload.frontier?.domains || [];
  els.frontierSection.hidden = !domains.length;
  if (!domains.length) return;
  renderFrontierFilters(domains);
  const scope = activeDomain === 'all' ? domains : domains.filter((domain) => domain.id === activeDomain);
  let shown = 0;
  els.frontier.innerHTML = scope
    .map((domain) => {
      const entries = domain.entries.filter((entry) => activeTier === 'all' || entry.tier === activeTier);
      shown += entries.length;
      // 「すべての分野」表示では、該当ゼロの分野カードは出さない。
      if (!entries.length && activeDomain === 'all') return '';
      const items = entries
        .map((entry) => {
          const stats = [];
          if (entry.kind === 'repo' && entry.stars != null) stats.push(`★ ${formatNumber(entry.stars)}`);
          if (entry.kind === 'repo' && entry.starsDelta != null) stats.push(`<span class="up">+${formatNumber(entry.starsDelta)}</span>`);
          if (entry.kind === 'model' && entry.likes != null) stats.push(`♥ ${formatNumber(entry.likes)}`);
          if (entry.publishedAt && entry.kind === 'news') stats.push(escapeHtml(relativeTime(entry.publishedAt)));
          const original = entry.titleJa && entry.titleJa !== entry.title
            ? `<div class="news-links">原題: ${escapeHtml(entry.title)}</div>` : '';
          return `
          <li class="news-item frontier-item">
            <h4><a href="${safeUrl(entry.url)}" rel="noopener" target="_blank">${escapeHtml(entry.titleJa || entry.title)}</a></h4>
            <div class="news-meta">
              <span class="tier-badge tier-${escapeHtml(entry.tier)}">${escapeHtml(tierLabel(entry.tier))}</span>
              <span>${escapeHtml([...new Set([KIND_LABELS[entry.kind] || entry.kind, entry.source].filter(Boolean))].join('・'))}</span>
              ${stats.map((stat) => `<span>${stat}</span>`).join('')}
            </div>
            <p class="news-summary">${escapeHtml(entry.summary || '')}</p>
            ${original}
          </li>`;
        })
        .join('');
      return `
      <article class="domain-card">
        <h3>${escapeHtml(domain.label)}</h3>
        ${domain.digest ? `<p class="domain-digest">${escapeHtml(domain.digest)}</p>` : ''}
        ${items ? `<ul class="news-list">${items}</ul>` : '<div class="empty">この部門の動きは今日は拾えませんでした。</div>'}
      </article>`;
    })
    .join('');
  if (!shown) els.frontier.innerHTML = '<div class="empty">この条件に当てはまる動きは今日は拾えませんでした。</div>';
  els.frontierCount.textContent = `${shown} 件`;
}

function render() {
  if (!payload) return;
  renderMeta();
  renderFrontier();
  renderTools();
  renderFilters();
  renderNews();
}

async function loadArchiveList() {
  try {
    const res = await fetch('./data/index.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const index = await res.json();
    const options = ['<option value="latest">最新</option>']
      .concat((index.dates || []).map((date) => `<option value="${escapeHtml(date)}">${escapeHtml(date)}</option>`));
    els.archive.innerHTML = options.join('');
  } catch {
    /* archive list is optional */
  }
}

async function loadData(date = 'latest', { fromUser = false } = {}) {
  const url = date === 'latest' ? './data/latest.json' : `./data/archive/${encodeURIComponent(date)}.json`;
  els.refresh.disabled = true;
  try {
    const res = await fetch(url, { cache: fromUser ? 'reload' : 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload = await res.json();
    if (date === 'latest') {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
      } catch { /* storage may be unavailable */ }
    }
    // Data may have come from the service worker cache; keep the notice up
    // whenever the device itself is offline.
    els.offline.hidden = navigator.onLine;
    render();
  } catch (error) {
    const cached = readCache();
    if (cached) {
      payload = cached;
      els.offline.hidden = false;
      render();
    } else {
      els.tools.innerHTML = `<div class="empty">データを読み込めませんでした（${escapeHtml(error.message)}）。オンラインで再度お試しください。</div>`;
    }
  } finally {
    els.refresh.disabled = false;
  }
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

els.refresh.addEventListener('click', () => loadData(els.archive.value || 'latest', { fromUser: true }));
els.archive.addEventListener('change', () => loadData(els.archive.value));
els.filters.addEventListener('click', (event) => {
  const button = event.target.closest('.filter');
  if (!button) return;
  activeFilter = button.dataset.tag;
  renderFilters();
  renderNews();
});

els.domainFilters.addEventListener('click', (event) => {
  const button = event.target.closest('.filter');
  if (!button) return;
  activeDomain = button.dataset.domain;
  renderFrontier();
});
els.tierFilters.addEventListener('click', (event) => {
  const button = event.target.closest('.filter');
  if (!button) return;
  activeTier = button.dataset.tier;
  renderFrontier();
});

window.addEventListener('online', () => {
  els.offline.hidden = true;
  loadData(els.archive.value || 'latest');
});
window.addEventListener('offline', () => { els.offline.hidden = false; });

// Install prompt (Android/desktop Chromium). iOS uses "ホーム画面に追加".
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  els.install.hidden = false;
});
els.install.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  els.install.hidden = true;
});
window.addEventListener('appinstalled', () => { els.install.hidden = true; });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      // Where supported, let the installed app refresh itself once a day too.
      if ('periodicSync' in registration && navigator.permissions) {
        const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
        if (status.state === 'granted') {
          await registration.periodicSync.register('infocollect-refresh', { minInterval: 12 * 60 * 60 * 1000 });
        }
      }
    } catch { /* offline support is optional */ }
  });
}

// The ZIP bundle only exists on deployments that run `npm run pack`.
fetch('./infocollect-pwa.zip', { method: 'HEAD' })
  .then((res) => { if (!res.ok) document.getElementById('download-btn').hidden = true; })
  .catch(() => { document.getElementById('download-btn').hidden = true; });

const cached = readCache();
if (cached) {
  payload = cached;
  render();
}
if (!navigator.onLine) els.offline.hidden = false;
loadArchiveList();
loadData('latest');
