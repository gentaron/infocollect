// Supervisor: the writer (Worker) never ships its own draft unchecked.
//
//   1. lintArticle   deterministic rules — no model, no network, same answer
//                    locally and on CI. Anything a rule can catch is caught here.
//   2. reviewArticle a second model (preferably from a different provider
//                    than the writer) reads the draft against the source
//                    material and returns a verdict as JSON.
//   3. supervise     runs both, asks the writer for at most one revision,
//                    and returns the decision record for the audit trail.
//
// The reviewer is fail-open: if no review model is reachable the lint alone
// decides. A missing reviewer must not stop the daily post.

import { warn } from '../lib/util.mjs';
import { runJson } from './router.mjs';

function bigrams(text) {
  const s = String(text || '').replace(/\s+/g, '');
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

export function titleSimilarity(a, b) {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const g of x) if (y.has(g)) inter++;
  return inter / (x.size + y.size - inter);
}

const BANNED = [
  [/AIとして|言語モデルとして|お手伝いできません|申し訳ありません/, 'ai-voice', 'AI の地の声が混ざっている'],
  [/\[(?:URL|リンク|タイトル|ここに)[^\]]*\]|（ここに[^）]*）|TODO|XXX/, 'placeholder', '埋め忘れのプレースホルダがある'],
  [/```/, 'code-fence', 'コードフェンスが残っている'],
];

/**
 * Deterministic checks. Returns [{ level: 'error'|'warn', code, message }].
 * `recentTitles` is an array of earlier titles (own posts) to catch repeats.
 */
export function lintArticle(article, { minChars = 2500, hardMinChars = 1500, recentTitles = [] } = {}) {
  const issues = [];
  const add = (level, code, message) => issues.push({ level, code, message });
  const text = String(article || '');
  const lines = text.split('\n').map((l) => l.trim());
  const title = lines.find(Boolean) || '';
  const body = text.length;

  if (!title) add('error', 'no-title', 'タイトル行が無い');
  if (title.length > 80) add('warn', 'long-title', `タイトルが長い（${title.length}字）`);
  if (body < hardMinChars) add('error', 'too-short', `本文が短すぎる（${body}字 < ${hardMinChars}字）`);
  else if (body < minChars) add('warn', 'short', `本文が短め（${body}字 < ${minChars}字）`);

  const hashtagLine = lines.find((l) => (l.match(/#[^\s#]+/g) || []).length >= 3);
  if (!hashtagLine) add('error', 'no-hashtags', 'ハッシュタグの行（3個以上）が無い');
  if (!lines.some((l) => /^-{5,}$/.test(l))) add('warn', 'no-divider', '区切り線「-----」が無い');
  if (/^#{1,6}\s/m.test(text) || /\*\*[^*]+\*\*/.test(text) || /^\s*\|.+\|\s*$/m.test(text)) {
    add('warn', 'markdown', 'Markdown 記号が残っている（プレーンテキストのはず）');
  }
  for (const [pattern, code, message] of BANNED) if (pattern.test(text)) add('error', code, message);

  let worst = { score: 0, title: '' };
  for (const earlier of recentTitles) {
    const score = titleSimilarity(title, earlier);
    if (score > worst.score) worst = { score, title: earlier };
  }
  if (worst.score >= 0.6) add('error', 'repeat-title', `過去の記事とタイトルがほぼ同じ:「${worst.title}」`);
  else if (worst.score >= 0.4) add('warn', 'similar-title', `過去の記事とタイトルが近い:「${worst.title}」`);

  // A paragraph the model never finished (cut off mid-sentence by the token limit).
  const prose = lines.filter((l) => l.length > 40 && !l.startsWith('#'));
  const last = prose[prose.length - 1] || '';
  if (last && !/[。！？!?）」』…w笑]$/.test(last)) add('warn', 'cut-off', '最後の段落が途中で切れているかもしれない');

  return issues;
}

const REVIEW_SYSTEM = [
  'あなたは個人ブログの審査役です。書き手とは別の立場で、下書きを資料と突き合わせて点検します。',
  '出力は JSON だけ。前置きもコードフェンスも書かないでください。',
  '形式: {"verdict":"pass"|"revise","issues":["直すべき点を具体的に。最大5個"],"unsupported":["資料に根拠が無いのに断定している固有名詞や数字。最大5個"]}',
  '基準: (1) 資料に無い製品名・バージョン・数値を事実として断定していないか (2) 同じ内容の繰り返しや水増しが無いか (3) 題材が1つに絞れているか (4) 読者が次に何をすればいいか分かるか。',
  '文体の好みや軽い言い回しは指摘しない。重大な問題が無ければ verdict は pass。',
].join('\n');

/** LLM review. Returns { verdict, issues, unsupported, provider, model } or null when unavailable. */
export async function reviewArticle({ article, sources = '', slotLabel = '', writerProvider = null, env = process.env }) {
  try {
    const { data, provider, model } = await runJson({
      tier: 'review',
      task: 'blog-review',
      avoid: writerProvider ? [writerProvider] : [],
      env,
      system: REVIEW_SYSTEM,
      user: [
        `枠: ${slotLabel}`,
        '== 資料（パイプラインが集めたもの。ここに無い断定は要注意） ==',
        String(sources || '（資料なし）').slice(0, 6000),
        '== 下書き ==',
        String(article).slice(0, 9000),
      ].join('\n'),
    });
    return {
      verdict: data?.verdict === 'revise' ? 'revise' : 'pass',
      issues: Array.isArray(data?.issues) ? data.issues.map(String).slice(0, 5) : [],
      unsupported: Array.isArray(data?.unsupported) ? data.unsupported.map(String).slice(0, 5) : [],
      provider,
      model,
    };
  } catch (error) {
    warn(`harness: 審査役を呼べませんでした（lint のみで判定） — ${error.message}`);
    return null;
  }
}

/**
 * Worker/Supervisor loop with at most `maxRevisions` rewrites.
 *   rewrite(feedbackText) → Promise<{ article, provider, model }>
 * Returns { article, provider, model, record } — record is the audit trail.
 */
export async function supervise({
  article, provider, model, sources, slotLabel, recentTitles = [], rewrite, maxRevisions = 1, llmReview = true, env = process.env,
}) {
  const record = { rounds: [], final: 'accepted' };
  let current = { article, provider, model };

  for (let round = 0; ; round++) {
    const lint = lintArticle(current.article, { recentTitles });
    const review = llmReview
      ? await reviewArticle({ article: current.article, sources, slotLabel, writerProvider: current.provider, env })
      : null;
    const errors = lint.filter((i) => i.level === 'error');
    const needsRevision = errors.length > 0 || review?.verdict === 'revise';
    record.rounds.push({
      round,
      writer: `${current.provider}/${current.model}`,
      chars: current.article.length,
      lint,
      review: review && { by: `${review.provider}/${review.model}`, verdict: review.verdict, issues: review.issues, unsupported: review.unsupported },
    });

    if (!needsRevision) break;
    if (round >= maxRevisions || !rewrite) {
      record.final = errors.length ? 'accepted-with-errors' : 'accepted-with-notes';
      break;
    }

    const feedback = [
      '【審査役からの差し戻し】次の点を直して、記事を最初から最後まで書き直してください。構成・口調・長さの決まりは同じです。',
      ...errors.map((i) => `・${i.message}`),
      ...(review?.issues || []).map((i) => `・${i}`),
      ...(review?.unsupported?.length ? [`・根拠の無い断定を消すか「〜らしい」に弱める: ${review.unsupported.join(' / ')}`] : []),
    ].join('\n');
    try {
      const next = await rewrite(feedback);
      // Never trade a usable draft for a shorter broken one.
      const nextErrors = lintArticle(next.article, { recentTitles }).filter((i) => i.level === 'error').length;
      if (nextErrors > errors.length) {
        record.final = 'revision-rejected';
        break;
      }
      current = next;
    } catch (error) {
      warn(`harness: 書き直しに失敗（初稿を採用） — ${error.message}`);
      record.final = 'revision-failed';
      break;
    }
  }
  return { ...current, record };
}
