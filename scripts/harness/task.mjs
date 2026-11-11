#!/usr/bin/env node
// Kanban worker. A GitHub Issue is a card; its labels say what to do and how
// much model it deserves. Open an issue from your phone, get the result back
// as a comment — free models do the legwork, the knowledge base supplies the
// sources, and nothing here needs a paid key.
//
//   labels   ai:research (default) | ai:draft | ai:slides
//            tier:light | tier:standard | tier:heavy   (optional override)
//
//   TASK_TITLE="Qwen4 の量子化事情" TASK_BODY="..." TASK_LABELS="ai:research" \
//     node scripts/harness/task.mjs --out result.md
//
// The workflow (.github/workflows/ai-task.yml) only runs this for issues
// opened by the repository owner.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { log, warn } from '../lib/util.mjs';
import { openKb } from '../kb/lib/retrieve.mjs';
import { buildDeckFromArticle } from '../slides/build.mjs';
import { run } from './router.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const KINDS = {
  research: {
    tier: 'standard',
    label: '調査メモ',
    system: [
      'あなたは調査担当です。与えられた資料だけを根拠に、依頼に答える調査メモを日本語で書きます。',
      '構成: 最初に結論を3行以内 → 分かったこと（箇条書き、各項目の末尾に [番号] で出典） → まだ分からないこと・資料に無いこと → 次に確かめるとよいこと。',
      '資料に無いことは書かない。推測は「推測:」と明示する。資料が依頼と噛み合わないときは、正直にそう書く。',
    ].join('\n'),
  },
  draft: {
    tier: 'heavy',
    label: '記事の下書き',
    system: [
      'あなたは個人ブロガーの下書き担当です。与えられた資料を根拠に、依頼のテーマで note 向けの記事の下書きを日本語で書きます。',
      '構成: 1行目タイトル → 本文2000〜3000字（見出し記号や箇条書きを使わず、ふつうの文章と改行だけ） → ハッシュタグ5個前後の行。',
      '資料に無い製品名・数値を事実として断定しない。出典は文末に [番号] で示す。',
    ].join('\n'),
  },
  slides: { tier: 'standard', label: 'スライド' },
};

/** Pure: labels → { kind, tier }. */
export function classify(labels = []) {
  const set = labels.map((l) => String(l).trim().toLowerCase());
  const kind = set.includes('ai:slides') ? 'slides' : set.includes('ai:draft') ? 'draft' : 'research';
  const tierLabel = set.find((l) => /^tier:(light|standard|heavy)$/.test(l));
  return { kind, tier: tierLabel ? tierLabel.slice(5) : KINDS[kind].tier };
}

export async function runTask({ title, body = '', labels = [], number = '', env = process.env }) {
  const { kind, tier } = classify(labels);
  const question = [title, body].filter(Boolean).join('\n').trim();
  if (!question) throw new Error('依頼文が空です');

  const kb = await openKb({ env });
  const hits = await kb.query(question.slice(0, 400), { k: 14 });
  const packed = kb.pack(hits, { budget: 7000, perDoc: 480 });
  const sourceList = hits.slice(0, packed.ids.length).map(({ doc }, i) => `[${i + 1}] [${doc.titleJa || doc.title}](${doc.url}) — ${doc.source} / ${doc.date}`).join('\n');
  log(`task: ${kind} / tier ${tier} / KB ${kb.size} 件中 ${packed.ids.length} 件を資料に`);

  const head = `### ${KINDS[kind].label}: ${title}`;
  if (!packed.ids.length) {
    return { kind, tier, markdown: `${head}\n\nナレッジベースに関連する資料が見つからなかった。言い換えるか、数日ためてからもう一度試してみて。` };
  }

  if (kind === 'slides') {
    const material = `${title}\n\n${hits.map(({ doc }) => `${doc.titleJa || doc.title}。${[doc.summary, doc.body].filter(Boolean).join(' ')}`).join('\n\n')}`;
    const slug = `task-${number || Date.now()}`;
    const deck = await buildDeckFromArticle({ article: material, date: new Date().toISOString().slice(0, 10), slug, label: 'カンバン', env });
    return {
      kind,
      tier,
      markdown: `${head}\n\n\`docs/slides/${deck.file}\` に ${deck.slides} 枚のスライドを作った（骨組み: ${deck.outline}）。公開後は \`/slides/${deck.file}\` で開ける。印刷すると1枚1ページのPDFになる。\n\n<details><summary>使った資料 ${packed.ids.length} 件</summary>\n\n${sourceList}\n\n</details>`,
    };
  }

  try {
    const { text, provider, model } = await run({
      tier,
      task: `task-${kind}`,
      env,
      system: KINDS[kind].system,
      user: `== 依頼 ==\n${question}\n\n== 資料（番号で引用する） ==\n${packed.text}`,
      minChars: 40,
    });
    const cited = /\[\d+\]/.test(text);
    return {
      kind,
      tier,
      provider,
      model,
      markdown: [
        head,
        '',
        text.trim(),
        '',
        cited ? '' : '> 注意: 本文に出典番号が付いていない。下の資料と照らして確かめて。',
        `<details><summary>使った資料 ${packed.ids.length} 件</summary>\n\n${sourceList}\n\n</details>`,
        '',
        `<sub>${provider}/${model} · tier ${tier} · 資料は InfoCollect のナレッジベース</sub>`,
      ].filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n'),
    };
  } catch (error) {
    warn(`task: モデルを使えませんでした — ${error.message}`);
    return {
      kind,
      tier,
      markdown: `${head}\n\n今は使えるモデルが無かったので、関連する資料だけ返すね。\n\n${sourceList}`,
    };
  }
}

async function main() {
  const outIndex = process.argv.indexOf('--out');
  const out = outIndex > -1 ? process.argv[outIndex + 1] : null;
  const env = process.env;
  const result = await runTask({
    title: env.TASK_TITLE || '',
    body: env.TASK_BODY || '',
    labels: String(env.TASK_LABELS || '').split(',').filter(Boolean),
    number: env.TASK_NUMBER || '',
  });
  if (env.TASK_NUMBER) {
    const dir = path.join(ROOT, 'memory', 'harness', 'tasks');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${String(env.TASK_NUMBER).replace(/\D/g, '')}.md`), `${result.markdown}\n`);
  }
  if (out) fs.writeFileSync(out, `${result.markdown}\n`);
  else process.stdout.write(`${result.markdown}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`task: 失敗しました — ${error.message}`);
    process.exit(1);
  });
}
