#!/usr/bin/env node
// What does a prolific note.com writer actually read?
//
//   node scripts/kb/note-audit.mjs <creator> [--pages 40] [--out docs/research]
//
// Reads the creator's public notes through note.com's public JSON (no key),
// pulls every outbound link out of each body and embed, and counts which
// domains, GitHub owners and Hugging Face orgs the posts are built on, what
// kinds of posts they are, and when they go out. PR / affiliate links are
// reported separately so they do not pass for sources.
//
// The output is evidence for tuning config/sources.json, not a copy of anyone's
// writing: only titles, dates and link targets are kept.

import fs from 'node:fs';
import path from 'node:path';

const API = 'https://note.com/api';
const AD_HOSTS = [/green-japan\.com$/, /amzn\.to$/, /amazon\.co\.jp$/, /a8\.net$/, /moshimo\.com$/, /valuecommerce\.com$/, /rakuten\.co\.jp$/];
const SELF = /(^|\.)note\.com$|st-note\.com$|^localhost$|^\d+\.\d+\.\d+\.\d+$/;

export const KINDS = [
  ['diary', /日記|個人開発/],
  ['security', /CVE|脆弱|穴|悪用|セキュリティ|ゼロデイ|パッチ/],
  ['off-topic', /サッカー|代表|W杯|ワールドカップ|野球/],
  ['model', /\d+(\.\d+)?B\b|モデル|LLM|Gemini|Claude|GPT|Qwen|DeepSeek|MoE|Llama|Mistral/],
  ['tool', /./],
];

export function kindOf(title) {
  return KINDS.find(([, re]) => re.test(title))[0];
}

/** Outbound links of one note (body hrefs + embeds), unescaped, note.com itself removed. */
export function linksOf(note) {
  const body = note.body || '';
  const hrefs = [...body.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  const embeds = (note.embedded_contents || []).map((e) => e.url).filter(Boolean);
  return [...hrefs, ...embeds].filter((u) => {
    try {
      return !SELF.test(new URL(u).hostname);
    } catch {
      return false;
    }
  });
}

const host = (u) => new URL(u).hostname.toLowerCase().replace(/^www\./, '');
const bump = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n);

/** Pure analysis over fetched notes: [{name, created_at|publishAt, body, embedded_contents}]. */
export function analyze(notes, { tz = 'Asia/Tokyo' } = {}) {
  const domains = new Map(); // posts citing each domain (once per post)
  const firstCited = new Map();
  const owners = new Map();
  const repos = new Map(); // owner/name -> posts citing it
  const ads = new Map();
  const kinds = new Map();
  const hours = new Map();
  const days = new Map();
  let noLink = 0;
  let embedsVideo = 0;
  for (const note of notes) {
    const when = note.publishAt || note.created_at;
    if (when) {
      bump(days, String(when).slice(0, 10));
      const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(when)));
      bump(hours, h);
    }
    bump(kinds, kindOf(note.name || ''));
    const links = linksOf(note);
    if ((note.embedded_contents || []).some((e) => /youtu/.test(e.url || ''))) embedsVideo++;
    const hostsHere = new Set();
    const reposHere = new Set();
    let first = null;
    for (const u of links) {
      const h = host(u);
      if (AD_HOSTS.some((re) => re.test(h))) {
        bump(ads, h);
        continue;
      }
      if (!first) first = h;
      hostsHere.add(h);
      const parts = new URL(u).pathname.split('/').filter(Boolean);
      if (h === 'github.com' && parts.length >= 2) {
        bump(owners, `github.com/${parts[0]}`);
        reposHere.add(`${parts[0]}/${parts[1].replace(/\.git$/, '')}`);
      }
      if (h === 'huggingface.co' && parts.length >= 2 && !['blog', 'docs', 'papers'].includes(parts[0])) bump(owners, `huggingface.co/${parts[0] === 'datasets' || parts[0] === 'spaces' ? `${parts[0]}/${parts[1]}` : parts[0]}`);
      if ((h === 'x.com' || h === 'twitter.com') && parts.length >= 1) bump(owners, `x.com/${parts[0]}`);
    }
    for (const h of hostsHere) bump(domains, h);
    for (const r of reposHere) bump(repos, r);
    if (first) bump(firstCited, first);
    else noLink++;
  }
  const dayCounts = [...days.values()];
  return {
    posts: notes.length,
    span: dayCounts.length ? { from: [...days.keys()].sort()[0], to: [...days.keys()].sort().at(-1), activeDays: days.size, perActiveDay: +(notes.length / days.size).toFixed(2) } : null,
    kinds: Object.fromEntries(top(kinds, 10)),
    hoursLocal: Object.fromEntries([...hours].sort((a, b) => a[0] - b[0])),
    domains: top(domains, 40),
    firstCited: top(firstCited, 15),
    owners: top(owners, 40),
    adsExcluded: top(ads, 10),
    // Repos written about more than once: the writer follows their updates. Candidates for tools.watchReleases.
    followedRepos: top(repos, 200).filter(([, n]) => n >= 2),
    postsWithoutLinks: noLink,
    postsWithVideoEmbed: embedsVideo,
  };
}

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'infocollect-source-audit' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchNotes(creator, { pages = 40, delayMs = 300, log = () => {} } = {}) {
  const list = [];
  for (let page = 1; page <= pages; page++) {
    const { data } = await getJson(`${API}/v2/creators/${encodeURIComponent(creator)}/contents?kind=note&page=${page}`);
    list.push(...(data.contents || []));
    if (data.isLastPage) break;
    await sleep(delayMs);
  }
  log(`${creator}: ${list.length} notes listed`);
  const notes = [];
  for (const item of list) {
    try {
      const { data } = await getJson(`${API}/v3/notes/${item.key}`);
      notes.push({ name: data.name, key: data.key, publishAt: item.publishAt, body: data.body, embedded_contents: data.embedded_contents });
    } catch (error) {
      log(`skip ${item.key}: ${error.message}`);
    }
    await sleep(delayMs);
  }
  return notes;
}

function markdown(creator, r) {
  const rows = (pairs) => pairs.map(([k, n]) => `| ${k} | ${n} |`).join('\n');
  return `# ${creator} はどこを見て書いているか

note.com の公開記事 ${r.posts} 本（${r.span?.from} 〜 ${r.span?.to}、投稿のあった日は 1 日あたり ${r.span?.perActiveDay} 本）の本文と埋め込みから、外へのリンクを全部数えた。
\`node scripts/kb/note-audit.mjs ${creator}\` で作り直せる。

## 記事の種類（題名から機械的に分類）

${Object.entries(r.kinds).map(([k, n]) => `- ${k}: ${n}`).join('\n')}

## 引用しているドメイン（何本の記事が使ったか）

| ドメイン | 記事数 |
| --- | --- |
${rows(r.domains.slice(0, 25))}

## 本文で最初に出てくるリンク（ネタの起点）

| ドメイン | 記事数 |
| --- | --- |
${rows(r.firstCited)}

## よく出てくる GitHub の持ち主・Hugging Face の組織・X のアカウント

| 先 | 回数 |
| --- | --- |
${rows(r.owners.slice(0, 25))}

## 何度も追いかけているリポジトリ（2本以上の記事）

${r.followedRepos.map(([k, n]) => `- ${k}（${n}）`).join('\n') || 'なし'}

## 数えなかったもの

- 広告・PR のリンク: ${r.adsExcluded.map(([h, n]) => `${h}（${n}）`).join('、') || 'なし'}
- 外部リンクの無い記事: ${r.postsWithoutLinks} 本 / 動画を埋め込んだ記事: ${r.postsWithVideoEmbed} 本

## 投稿の時刻（現地時間）

${Object.entries(r.hoursLocal).map(([h, n]) => `${h}時 ${n}`).join(' · ')}
`;
}

async function main() {
  const args = process.argv.slice(2);
  const creator = args.find((a) => !a.startsWith('--'));
  if (!creator) {
    console.error('usage: node scripts/kb/note-audit.mjs <creator> [--pages 40] [--out docs/research]');
    process.exit(2);
  }
  const opt = (name, dflt) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const out = opt('out', 'docs/research');
  const notes = await fetchNotes(creator, { pages: Number(opt('pages', 40)), log: (m) => console.error(m) });
  const report = { creator, checkedAt: new Date().toISOString(), ...analyze(notes) };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `${creator}-sources.json`), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(out, `${creator}-sources.md`), markdown(creator, report));
  console.log(`${out}/${creator}-sources.{json,md}: ${report.posts} posts, ${report.domains.length} domains`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
