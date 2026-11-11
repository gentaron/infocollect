#!/usr/bin/env node
// One manuscript, many shapes: turn an article (or a topic researched from the
// knowledge base) into a static, print-ready slide deck.
//
//   node scripts/slides/build.mjs --from docs/blog/2026-11-11/0900-harness.txt
//   node scripts/slides/build.mjs --topic "ローカルLLMの量子化" [--slides 8]
//   node scripts/slides/build.mjs --from <file> --no-llm      # rule-based outline only
//
// Output: docs/slides/<slug>.html — one self-contained file, no animation,
// 16:9, readable on a phone, and "print → save as PDF" gives one slide per page.
//
// The outline comes from a free "standard"-tier model through the harness
// router; if no model is reachable a deterministic outline is built from the
// text itself, so the deck step can never fail a pipeline.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { log, warn } from '../lib/util.mjs';
import { runJson } from '../harness/router.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SLIDES_DIR = path.join(ROOT, 'docs', 'slides');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => {
  const v = String(s || '').replace(/\s+/g, ' ').trim();
  return v.length <= n ? v : `${v.slice(0, n - 1)}…`;
};

// ------------------------------------------------------------------ outline

/** Split an article into { title, paragraphs, hashtags } (plain-text blog format). */
export function parseArticle(article) {
  const lines = String(article || '').replace(/\r\n/g, '\n').split('\n');
  const title = (lines.find((l) => l.trim()) || '').trim();
  const rest = lines.slice(lines.findIndex((l) => l.trim()) + 1).join('\n');
  const main = rest.split(/\n-{5,}\n/)[0];
  const paragraphs = [];
  let hashtags = [];
  for (const block of main.split(/\n{2,}/)) {
    const text = block.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const tags = text.match(/#[^\s#]+/g) || [];
    if (tags.length >= 3 && tags.join('').length > text.length * 0.6) hashtags = tags;
    else paragraphs.push(text);
  }
  return { title, paragraphs, hashtags };
}

const firstSentence = (text) => (String(text).match(/^.*?[。！？!?](?=\s|$|[^」』）])/) || [String(text)])[0].trim();

/** Deterministic outline: no model needed. Groups paragraphs evenly into slides. */
export function outlineFromText(article, { maxSlides = 7 } = {}) {
  const { title, paragraphs, hashtags } = parseArticle(article);
  const body = paragraphs.filter((p) => p.length >= 20);
  const count = Math.max(1, Math.min(maxSlides, Math.ceil(body.length / 2)));
  const per = Math.ceil(body.length / count) || 1;
  const slides = [];
  for (let i = 0; i < body.length; i += per) {
    const group = body.slice(i, i + per);
    const lead = firstSentence(group[0]);
    const bullets = [];
    for (const paragraph of group) {
      const sentences = paragraph.match(/[^。！？!?]+[。！？!?]?/g) || [paragraph];
      for (const sentence of sentences) {
        const s = sentence.trim();
        if (s.length >= 12 && s !== lead && bullets.length < 3) bullets.push(clip(s, 64));
      }
    }
    slides.push({ title: clip(lead.replace(/[。！？!?]$/, ''), 30), bullets: bullets.length ? bullets : [clip(group[0], 64)] });
  }
  return {
    title: clip(title, 60),
    subtitle: hashtags.slice(0, 4).join(' '),
    slides,
    takeaway: clip(firstSentence(body[body.length - 1] || title), 80),
    source: 'rules',
  };
}

/** Make whatever the model returned safe to render; null if it is unusable. */
export function normalizeOutline(data, { maxSlides = 9 } = {}) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.slides)) return null;
  const slides = data.slides
    .filter((s) => s && typeof s.title === 'string' && s.title.trim())
    .slice(0, maxSlides)
    .map((s) => ({
      title: clip(s.title, 34),
      bullets: (Array.isArray(s.bullets) ? s.bullets : []).map((b) => clip(b, 72)).filter(Boolean).slice(0, 4),
      note: s.note ? clip(s.note, 90) : undefined,
    }))
    .filter((s) => s.bullets.length);
  if (slides.length < 2) return null;
  return {
    title: clip(data.title || '', 60),
    subtitle: clip(data.subtitle || '', 70),
    slides,
    takeaway: clip(data.takeaway || '', 90),
    source: 'model',
  };
}

const OUTLINE_SYSTEM = [
  'あなたは資料作成の担当です。渡された文章を、静的なビジネス資料（スライド）の骨組みに直します。',
  '出力は JSON だけ。前置きやコードフェンスは書かないでください。',
  '形式: {"title":"表紙タイトル","subtitle":"一行の副題","slides":[{"title":"結論が分かる見出し(30字以内)","bullets":["要点(60字以内)を2〜4個"],"note":"補足(任意・80字以内)"}],"takeaway":"最後に持ち帰る一文"}',
  '決まり: スライドは5〜8枚。1枚に言いたいことは1つ。見出しは名詞止めではなく主張にする。本文に無い数字や固有名詞を足さない。口語の崩しは資料向けに整える。',
].join('\n');

async function outlineViaModel(text, { slides = 7, env = process.env } = {}) {
  const { data, provider, model } = await runJson({
    tier: 'standard',
    task: 'slides-outline',
    env,
    system: OUTLINE_SYSTEM,
    user: `スライドは${slides}枚前後。\n\n== 元の文章 ==\n${String(text).slice(0, 12000)}`,
  });
  const outline = normalizeOutline(data);
  if (!outline) throw new Error('アウトラインの形が不正');
  return { ...outline, source: `${provider}/${model}` };
}

// ------------------------------------------------------------------ render

/** Self-contained static deck. No JS required to read or print it. */
export function renderDeck(outline, { date = '', label = '', sourceHref = '' } = {}) {
  const total = outline.slides.length + 2;
  const foot = (n) => `<footer><span>${esc(clip(outline.title, 40))}</span><span>${n} / ${total}</span></footer>`;
  const body = [
    `<section class="s cover"><div class="pad"><p class="kicker">${esc([label, date].filter(Boolean).join(' · '))}</p><h1>${esc(outline.title)}</h1>${outline.subtitle ? `<p class="sub">${esc(outline.subtitle)}</p>` : ''}</div>${foot(1)}</section>`,
    ...outline.slides.map((slide, i) => `<section class="s"><div class="pad"><p class="kicker">${String(i + 1).padStart(2, '0')}</p><h2>${esc(slide.title)}</h2><ul>${slide.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>${slide.note ? `<p class="note">${esc(slide.note)}</p>` : ''}</div>${foot(i + 2)}</section>`),
    `<section class="s close"><div class="pad"><p class="kicker">まとめ</p><h2>${esc(outline.takeaway || outline.title)}</h2>${sourceHref ? `<p class="note"><a href="${esc(sourceHref)}">元の記事を読む</a></p>` : ''}</div>${foot(total)}</section>`,
  ].join('\n');

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(outline.title)}</title>
<style>
  :root { --paper:#fbfaf7; --ink:#17181c; --muted:#6a6d78; --line:#e2dfd6; --accent:#1f4fd8; --desk:#ecebe6; }
  @media (prefers-color-scheme: dark) { :root { --paper:#15171c; --ink:#eceef4; --muted:#9a9eab; --line:#2a2e38; --accent:#8aa9ff; --desk:#0c0d10; } }
  * { box-sizing: border-box; }
  html { background: var(--desk); }
  body { margin: 0; padding: 16px; font-family: "Hiragino Sans", "Noto Sans JP", "Yu Gothic", system-ui, sans-serif; color: var(--ink); -webkit-text-size-adjust: 100%; }
  .deck { max-width: 1120px; margin: 0 auto; display: grid; gap: 16px; }
  .s { container-type: inline-size; aspect-ratio: 16 / 9; background: var(--paper); border: 1px solid var(--line); border-radius: 6px; display: flex; flex-direction: column; overflow: hidden; }
  .pad { flex: 1; padding: 7cqw 8cqw 2cqw; display: flex; flex-direction: column; justify-content: center; min-height: 0; }
  .kicker { margin: 0 0 2.2cqw; font-size: 1.7cqw; letter-spacing: .14em; color: var(--accent); font-weight: 700; font-variant-numeric: tabular-nums; }
  h1 { margin: 0; font-size: 5.4cqw; line-height: 1.28; font-weight: 800; text-wrap: balance; overflow-wrap: anywhere; }
  h2 { margin: 0 0 3cqw; font-size: 3.9cqw; line-height: 1.32; font-weight: 800; text-wrap: balance; overflow-wrap: anywhere; }
  .sub { margin: 3cqw 0 0; font-size: 2.2cqw; color: var(--muted); }
  ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 1.9cqw; }
  li { font-size: 2.5cqw; line-height: 1.5; padding-left: 2.6cqw; position: relative; overflow-wrap: anywhere; }
  li::before { content: ""; position: absolute; left: 0; top: .62em; width: 1.1cqw; height: .28cqw; background: var(--accent); }
  .note { margin: 3cqw 0 0; padding-top: 1.6cqw; border-top: 1px solid var(--line); font-size: 1.8cqw; color: var(--muted); }
  .note a { color: var(--accent); }
  .cover .pad, .close .pad { justify-content: flex-end; padding-bottom: 6cqw; }
  .close h2 { font-size: 4.4cqw; margin: 0; }
  footer { display: flex; justify-content: space-between; gap: 2cqw; padding: 1.6cqw 8cqw 2.4cqw; font-size: 1.35cqw; color: var(--muted); font-variant-numeric: tabular-nums; }
  footer span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media print {
    @page { size: 13.333in 7.5in; margin: 0; }
    html, body { background: #fff; padding: 0; }
    .deck { gap: 0; max-width: none; }
    .s { border: 0; border-radius: 0; width: 13.333in; height: 7.5in; break-after: page; }
  }
</style>
</head>
<body>
<main class="deck">
${body}
</main>
</body>
</html>
`;
}

// ------------------------------------------------------------------ build

function updateIndex(entry) {
  const file = path.join(SLIDES_DIR, 'index.json');
  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { /* first deck */ }
  list = [entry, ...list.filter((e) => e.file !== entry.file)].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.file.localeCompare(a.file));
  fs.writeFileSync(file, `${JSON.stringify(list, null, 2)}\n`);
}

/** Article text → docs/slides/<slug>.html. Returns { file, slides, outline }. */
export async function buildDeckFromArticle({ article, date = '', slug, label = '', llm = true, slides = 7, sourceHref = '', env = process.env }) {
  let outline = null;
  if (llm) {
    try {
      outline = await outlineViaModel(article, { slides, env });
    } catch (error) {
      warn(`slides: モデルでの骨組み作りに失敗（ルールで作ります） — ${error.message}`);
    }
  }
  outline ||= outlineFromText(article, { maxSlides: slides });
  if (!outline.title) outline.title = parseArticle(article).title || slug;

  fs.mkdirSync(SLIDES_DIR, { recursive: true });
  const file = `${slug}.html`;
  fs.writeFileSync(path.join(SLIDES_DIR, file), renderDeck(outline, { date, label, sourceHref }));
  updateIndex({ date, label, title: outline.title, file, slides: outline.slides.length + 2, outline: outline.source });
  return { file, slides: outline.slides.length + 2, outline: outline.source };
}

async function main() {
  const argv = process.argv.slice(2);
  const args = { llm: true, slides: 7 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') args.from = argv[++i];
    else if (argv[i] === '--topic') args.topic = argv[++i];
    else if (argv[i] === '--slides') args.slides = Number(argv[++i]);
    else if (argv[i] === '--no-llm') args.llm = false;
    else if (argv[i] === '--slug') args.slug = argv[++i];
  }
  const today = new Date().toISOString().slice(0, 10);

  if (args.from) {
    const article = fs.readFileSync(path.resolve(args.from), 'utf8');
    const rel = path.relative(path.join(ROOT, 'docs', 'blog'), path.resolve(args.from));
    const inBlog = !rel.startsWith('..');
    const slug = args.slug || (inBlog ? rel.replace(/\.txt$/, '').replace(/[\\/]/g, '-') : path.basename(args.from).replace(/\.[^.]+$/, ''));
    const deck = await buildDeckFromArticle({ article, date: inBlog ? rel.slice(0, 10) : today, slug, llm: args.llm, slides: args.slides, sourceHref: inBlog ? '../blog/' : '' });
    log(`slides: docs/slides/${deck.file}（${deck.slides} 枚 / ${deck.outline}）`);
    return;
  }
  if (args.topic) {
    // Research the topic from the knowledge base, then outline that material.
    const { openKb } = await import('../kb/lib/retrieve.mjs');
    const kb = await openKb();
    const hits = await kb.query(args.topic, { k: 14 });
    if (!hits.length) throw new Error(`ナレッジベースに「${args.topic}」の資料がありません`);
    const material = `${args.topic}\n\n${hits.map(({ doc }) => `${doc.titleJa || doc.title}。${[doc.summary, doc.body].filter(Boolean).join(' ')}`).join('\n\n')}`;
    const slug = args.slug || `${today}-${args.topic.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40)}`;
    const deck = await buildDeckFromArticle({ article: material, date: today, slug, label: 'KB調査', llm: args.llm, slides: args.slides });
    log(`slides: docs/slides/${deck.file}（${deck.slides} 枚 / ${deck.outline} / 資料 ${hits.length} 件）`);
    return;
  }
  console.error('使い方: node scripts/slides/build.mjs --from <記事.txt> | --topic "テーマ" [--slides 7] [--no-llm] [--slug 名前]');
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`slides: 失敗しました — ${error.message}`);
    process.exit(1);
  });
}
