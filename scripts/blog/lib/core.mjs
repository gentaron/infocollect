// Pure helpers for the blog pipeline. No network, no API keys — everything in
// here is safe to unit-test offline from scripts/selftest.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { dateInZone } from '../../lib/util.mjs';

export const BLOG_TZ = 'Asia/Kuala_Lumpur';

/**
 * The five daily slots. Cron times live in .github/workflows/blog-*.yml
 * (Malaysia = UTC+8, no DST, so the mapping never shifts):
 *   0700 MYT = 23:00 UTC (previous day)   1400 MYT = 06:00 UTC
 *   0900 MYT = 01:00 UTC                  1800 MYT = 10:00 UTC
 *   1100 MYT = 03:00 UTC
 */
export const SLOTS = {
  '0700': {
    label: '7時枠／AIモデル',
    fileBase: '0700-ai-models',
    prompt: 'slot-0700.md',
    usesCommon: true,
    logTemplate: '[7時枠／AIモデル] 扱った道具 — 何をするものか一行／拾ったソース／うちのPCで動きそうかどうか',
    queries: [
      'new AI model release OpenAI Anthropic Google this week',
      'open weights model release DeepSeek Qwen Moonshot MiniMax',
    ],
  },
  '0900': {
    label: '9時枠／ハーネス',
    fileBase: '0900-harness',
    prompt: 'slot-0900.md',
    usesCommon: true,
    logTemplate: '[9時枠／ハーネス] 扱った道具 — 何をするものか一行／拾ったソース／うちのPCで動きそうかどうか',
    queries: [
      'AI coding agent CLI tool new release',
      'agent harness MCP sandbox memory evaluation tool release',
    ],
  },
  '1100': {
    label: '11時枠／GitHub',
    fileBase: '1100-github',
    prompt: 'slot-1100.md',
    usesCommon: true,
    logTemplate: '[11時枠／GitHub] 扱った道具 — 何をするものか一行／拾ったソース／うちのPCで動きそうかどうか',
    queries: [
      'GitHub trending AI repositories this week',
      'new GitHub repository LLM agents tools released',
    ],
  },
  '1400': {
    label: '14時枠／手法',
    fileBase: '1400-methods',
    prompt: 'slot-1400.md',
    usesCommon: true,
    logTemplate: '[14時枠／手法] 扱った題材 — 何をするやり方か一行／拾ったソース／うちのPCで試せそうかどうか',
    queries: [
      'arxiv LLM prompting retrieval technique new method',
      'LLM inference compression caching technique released',
    ],
  },
  '1800': {
    label: '18時枠／生命とものづくり',
    fileBase: '1800-science',
    prompt: 'slot-1800.md',
    usesCommon: false,
    logTemplate: '[18時枠／生命とものづくり] 扱った題材 — 何の話か一行／読んだ一次情報／証拠の強さの見立て／重要だと判断したところと、そうでもないと判断したところ',
    queries: [
      'synthetic biology protein design de novo breakthrough',
      'semiconductor packaging aging reprogramming quantum biology news',
    ],
  },
};

/**
 * Explicit slot order. Object.keys(SLOTS) cannot be trusted here: JS hoists
 * integer-like keys ("1100") ahead of non-canonical ones ("0700").
 */
export const SLOT_ORDER = ['0700', '0900', '1100', '1400', '1800'];

export function todayMYT(now = new Date()) {
  return dateInZone(now, BLOG_TZ);
}

/** Jaccard similarity over character bigrams — cheap loop detection. */
function similarity(a, b) {
  if (a === b) return 1;
  const grams = (text) => {
    const set = new Set();
    for (let i = 0; i < text.length - 1; i++) set.add(text.slice(i, i + 2));
    return set;
  };
  const aGrams = grams(a);
  const bGrams = grams(b);
  if (!aGrams.size || !bGrams.size) return 0;
  let overlap = 0;
  for (const gram of aGrams) if (bGrams.has(gram)) overlap++;
  return overlap / (aGrams.size + bGrams.size - overlap);
}

const LOOP_THRESHOLD = 0.75;

/**
 * Models sometimes loop and emit the same paragraph twice, sometimes with a
 * word mutated. Drop every paragraph that exactly repeats an earlier one or
 * is near-identical to it (bigram similarity ≥ 0.75). Short lines (titles,
 * hashtags, dividers) are never touched.
 */
export function dedupeParagraphs(text) {
  const paragraphs = String(text || '').split(/\n{2,}/);
  const kept = [];
  const keptKeys = [];
  for (const paragraph of paragraphs) {
    const key = paragraph.replace(/\s+/g, '').trim();
    if (key.length >= 30) {
      let isLoop = false;
      for (const previous of keptKeys) {
        if (previous === key || similarity(previous, key) >= LOOP_THRESHOLD) {
          isLoop = true;
          break;
        }
      }
      if (isLoop) continue;
      keptKeys.push(key);
    }
    const trimmed = paragraph.trim();
    if (trimmed) kept.push(trimmed);
  }
  return kept.join('\n\n');
}

/**
 * The article must be plain text: no markdown headings, bullets, emphasis or
 * tables. Hashtags ("#AI") must survive — they carry no space after the hash,
 * so the heading pattern cannot touch them. A "-40%" token also survives
 * because bullet stripping requires whitespace after the dash.
 */
export function sanitizeArticle(text) {
  let out = String(text || '').replace(/\r\n/g, '\n').trim();
  out = out.replace(/^\s*```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/i, ''); // stray code fence
  out = out.replace(/\*\*/g, '');                                            // **emphasis**
  out = out.replace(/^#{1,6}[ \t]+/gm, '');                                  // heading rows
  out = out.replace(/^[ \t]*[-•●*][ \t]+/gm, '');                            // bullet rows
  out = out.replace(/^[ \t]*\|.*\|[ \t]*$/gm, (line) =>                      // table rows → prose
    line.replace(/\|/g, ' ').replace(/[ \t]{2,}/g, ' ').trim());
  return out.trim();
}

/**
 * Split the trailing machine block off the model output.
 * Returns { article, logline } — logline is null when the model forgot it.
 */
export function extractLogline(text) {
  const raw = String(text || '');
  const marker = '===LOGLINE===';
  const index = raw.lastIndexOf(marker);
  if (index === -1) return { article: raw.trim(), logline: null };
  const article = raw.slice(0, index).trim();
  const logline = raw.slice(index + marker.length)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { article, logline: logline || null };
}

export function extractTitle(article) {
  const first = String(article || '').split('\n').map((line) => line.trim()).find(Boolean);
  return first || '';
}

export function buildSystemPrompt() {
  return [
    'あなたは日本で、自分の非力なPCとクラウドの無料枠だけを頼りにAIを追いかけている個人のブロガーです。一人称は「私」か「うち」で、女の子が友達にしゃべってるみたいな軽い口調を最後まで守ってください。',
    '与えられたルールとメモと候補をすべて読み、指定された枠のブログ記事を1本だけ書いてください。',
    'ルールは一つも省略できません。出力はプレーンテキストのみ。コードフェンス、前置き、後書きは一切書かないでください。',
    '記事の構成は必ずこの順で: 1行目タイトル → 本文（3500〜4500字、記号なし） → ハッシュタグ5個前後の行 → 「-----」の行 → 補足（あれば） → 最後に ===LOGLINE=== とログ行の2行。ハッシュタグとログ行を省略したら失敗とみなします。',
  ].join('\n');
}

function clip(text, max) {
  const value = String(text || '').trim();
  if (!value) return '（なし）';
  return value.length <= max ? value : `${value.slice(0, max)}\n（以下、古い分は省略）`;
}

/**
 * Assemble the full user prompt for one slot run.
 * All inputs are already-read strings (empty string = file missing).
 */
export function buildUserPrompt({
  date, slot, common = '', slotPrompt = '', pcSetup = '', devEnvironment = '',
  writerNote = '', log = '', archive = '', noteTitles = '', recentTitles = '',
  todayTitles = '', candidates = '',
}) {
  const blocks = [];

  blocks.push(`今日の日付: ${date}（マレーシア時間）`);
  blocks.push(`この枠: ${slot.label}`);

  if (slot.usesCommon && common.trim()) {
    blocks.push(`== 共通ルール（厳守） ==\n${common.trim()}`);
  }
  if (slotPrompt.trim()) {
    blocks.push(`== この枠の指示（厳守） ==\n${slotPrompt.trim()}`);
  }

  const memory = [
    pcSetup.trim() ? `【自分のPCについてのメモ】\n${pcSetup.trim()}` : '',
    devEnvironment.trim() ? `【開発環境についてのメモ】\n${devEnvironment.trim()}` : '',
    writerNote.trim() ? `【書き手メモ（先に走っている書き手の関心。名前は絶対に記事に出さない）】\n${writerNote.trim()}` : '',
  ].filter(Boolean).join('\n\n');
  if (memory) blocks.push(`== 手元のメモ ==\n${memory}`);

  const history = [
    log.trim() || archive.trim()
      ? `【扱った題材のログ（この中の題材は二度と使わない。アーカイブも含む）】\n${clip(log, 9000)}\n${archive.trim() ? `\n【ログのアーカイブ（これも二度と使わない）】\n${clip(archive, 4000)}` : ''}`
      : '【扱った題材のログ】（まだ空。好きな題材でよい）',
    recentTitles.trim() ? `【最近の自分の記事タイトル（重複チェック用）】\n${recentTitles.trim()}` : '',
    noteTitles.trim() ? `【それ以前の記事タイトル】\n${clip(noteTitles, 2000)}` : '',
    todayTitles.trim() ? `【本日の他の枠ですでに書いた記事】\n${todayTitles.trim()}` : '',
  ].filter(Boolean).join('\n\n');
  blocks.push(`== 履歴 ==\n${history}`);

  blocks.push(`== 題材候補（パイプラインが集めたヒント。ここから選んでもいいし、この流れで自分の知識から新鮮なものを選んでもいい。候補のURLを羅列して終わる記事にはしない） ==\n${candidates.trim() || '（候補を取得できなかった。自分の知識のなかで最新のものから選ぶ）'}`);

  blocks.push([
    '== 出力の形式（自動実行用の約束） ==',
    '作るのはテキストだけ。コードフェンスで囲まず、記事の本文だけを返答する（保存はパイプラインが行う）。',
    '1行目はタイトル。記号なしのただの一行。',
    '本文はふつうの文章と改行だけで書く。見出し記号・箇条書き・強調記号・表は使わない。',
    '本文の全体量はおよそ3500〜4500字。短くまとめて終わらせない。中身が足りないときは、その道具の仕組みの中身、使い心地の想像、手元のPCではどうなのかを具体的に膨らませる。',
    '本文の最後に、ハッシュタグを5個前後つけた行を必ず入れる（例: #AI #LLM のような形。この行にも見出し記号は使わない）。',
    'そのあとに「-----」だけの行を1行引く。補足があればその下だけに書く。なければ区切り線だけ。',
    '参照したソースは記事本文には一覧化しない（本文中で触れるなら名前だけ）。URLは最後のログ行の中に書く。',
    '最後に、ログ記録用として、次の2行を正確につける（これは記事の一部ではない。「—」以降の各「／」区切りの項目を実際の内容で埋める）:',
    '===LOGLINE===',
    `${date} ${slot.logTemplate}`,
  ].join('\n'));

  return blocks.join('\n\n');
}

/**
 * Rebuild docs/blog/index.json by scanning docs/blog/YYYY-MM-DD/*.txt.
 * Returns the index array.
 */
export function rebuildIndex(docsDir, slots = SLOTS) {
  const blogDir = path.join(docsDir, 'blog');
  const entries = [];
  let dirs = [];
  try {
    dirs = fs.readdirSync(blogDir).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort().reverse();
  } catch {
    dirs = [];
  }
  for (const dir of dirs) {
    const dayDir = path.join(blogDir, dir);
    let files = [];
    try {
      files = fs.readdirSync(dayDir).filter((name) => name.endsWith('.txt')).sort();
    } catch {
      continue;
    }
    for (const file of files) {
      const full = path.join(dayDir, file);
      let raw = '';
      try {
        raw = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      const title = extractTitle(raw);
      const slotId = file.slice(0, 4);
      entries.push({
        date: dir,
        slot: slotId,
        label: slots[slotId]?.label || slotId,
        title,
        file: `${dir}/${file}`,
        chars: raw.length,
      });
    }
  }
  const outDir = path.join(docsDir, 'blog');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.json'), `${JSON.stringify(entries, null, 2)}\n`);
  return entries;
}

/**
 * Append one log line to memory/areas/github-trending-blog.md, newest first,
 * under the「扱った題材のログ」marker (created when missing).
 */
export function appendLogLine(memoryFile, logline) {
  const marker = '## 扱った題材のログ';
  let existing = '';
  try {
    existing = fs.readFileSync(memoryFile, 'utf8');
  } catch {
    existing = [
      '# github-trending-blog',
      '',
      'ブログ生成システム（scripts/blog）が読み書きする題材ログ。',
      '',
      marker,
      '',
      '（新しい行を上に追加。容量が上限に近づいたら古い行を blog-log-archive.md へ移す）',
    ].join('\n');
  }

  if (!existing.includes(marker)) {
    existing = `${existing.replace(/\s*$/, '\n')}\n\n${marker}\n`;
  }

  const lines = existing.split('\n');
  const markerIndex = lines.findIndex((line) => line.trim() === marker);
  lines.splice(markerIndex + 1, 0, '', logline);
  fs.mkdirSync(path.dirname(memoryFile), { recursive: true });
  fs.writeFileSync(memoryFile, `${lines.join('\n').replace(/\s*$/, '\n')}`);
}
