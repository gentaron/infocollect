// Presentation helpers: the wording used when no AI summary is available, and
// the Markdown rendering of a day's payload.

import { truncate } from './util.mjs';

export function fallbackToolSummary(tool) {
  const growth =
    tool.starsDelta != null
      ? `前回計測から +${tool.starsDelta} スター`
      : `平均 ${tool.starsPerDay} スター/日ペース`;
  return {
    headline: tool.name.split('/')[1] || tool.name,
    summary: truncate(tool.description || '説明が登録されていないリポジトリです。', 160),
    why: `${growth}。${tool.language ? `${tool.language} 製。` : ''}最終更新 ${String(tool.pushedAt).slice(0, 10)}。`,
  };
}

export function fallbackNewsSummary(item) {
  return {
    titleJa: item.title,
    summary: truncate(item.body || item.title, 160),
  };
}

export function buildDigest(tools, news, localTime, prediction = null) {
  if (!tools.length && !news.length) {
    return `${localTime} 時点で収集できたデータがありませんでした。ネットワークまたは各ソースの状態を確認してください。`;
  }
  const toolNames = tools.map((tool) => tool.name).join('、');
  const releaseCount = news.filter((item) => item.tags?.includes('version') || item.tags?.includes('release')).length;
  const top = prediction?.picks?.slice(0, 3).map((pick) => pick.name).join('、');
  const lead = top ? `ゆいまるが次に取り上げそうなのは ${top}。` : '';
  return `${localTime} 時点の収集結果です。${lead}GitHub で伸びている AI ツールは ${toolNames || '該当なし'} の ${tools.length} 件。AI ニュースは ${news.length} 件を収集し、うち ${releaseCount} 件が新バージョン・新機能の発表でした。`;
}

export function toMarkdown(payload) {
  const lines = [`# ${payload.dateLocal} の AI ダイジェスト`, '', payload.digest, ''];
  lines.push(...yuimaruMarkdown(payload.yuimaru));
  lines.push('## 注目の GitHub AI ツール', '');
  for (const tool of payload.tools) {
    lines.push(`### ${tool.rank}. [${tool.name}](${tool.url}) — ★${Number(tool.stars).toLocaleString('en-US')}`);
    lines.push('');
    lines.push(tool.summary);
    lines.push('');
    lines.push(`- 伸び: ${tool.starsDelta != null ? `+${tool.starsDelta} スター` : `約 ${tool.starsPerDay} スター/日`}`);
    lines.push(`- 選定理由: ${tool.why}`);
    lines.push('');
  }
  if (!payload.tools.length) lines.push('_該当なし_', '');
  lines.push('## AI ニュース（新機能・新バージョン中心）', '');
  for (const item of payload.news) {
    lines.push(`- [${item.titleJa}](${item.url}) — ${item.source}｜${item.summary}`);
  }
  if (!payload.news.length) lines.push('_該当なし_');
  lines.push(...frontierMarkdown(payload.frontier));
  lines.push('', `_生成: ${payload.generatedAtLocal} (${payload.timezone}) / 要約: ${payload.ai.label}_`);
  return `${lines.join('\n')}\n`;
}

const KIND_JA = { repo: 'GitHub', model: 'HFモデル', news: '記事' };

/** 分野別「最先端マップ」を Markdown に。frontier が無い日は何も出さない。 */
export function frontierMarkdown(frontier) {
  if (!frontier?.domains?.length) return [];
  const tiers = frontier.tiers || {};
  const lines = ['', '## 最先端マップ（分野別 × オープンソース／大手／どっちつかず）', ''];
  for (const domain of frontier.domains) {
    lines.push(`### ${domain.label}`, '');
    if (domain.digest) lines.push(domain.digest, '');
    for (const tier of ['oss', 'hybrid', 'bigtech']) {
      const entries = domain.entries.filter((entry) => entry.tier === tier);
      if (!entries.length) continue;
      lines.push(`**${tiers[tier]?.label || tier}**`, '');
      for (const entry of entries) {
        const extra = entry.kind === 'repo' && entry.stars != null ? ` ★${Number(entry.stars).toLocaleString('en-US')}` : '';
        lines.push(`- [${entry.titleJa || entry.title}](${entry.url}) — ${KIND_JA[entry.kind] || entry.kind}・${entry.source}${extra}｜${entry.summary}`);
      }
      lines.push('');
    }
    if (!domain.entries.length) lines.push('_今日は該当なし_', '');
  }
  return lines;
}

/** 『ゆいまる予測』を Markdown に。予測が無い日は何も出さない。 */
export function yuimaruMarkdown(y) {
  if (!y?.picks?.length) return [];
  const lines = ['## ゆいまるが次に書きそうなもの（予測）', ''];
  for (const pick of y.picks) {
    const stars = pick.stars != null ? ` ★${Number(pick.stars).toLocaleString('en-US')}` : '';
    lines.push(`${pick.rank}. [${pick.name}](${pick.url}) — 予測 ${pick.score}${stars}｜${(pick.reasons || []).join(' / ')}`);
  }
  const e = y.evaluation;
  if (e?.predicted) {
    lines.push('', `_答え合わせ: 過去 ${e.days} 日で ${e.predicted} 件予測 → ${e.hits.length} 件が記事化（的中率 ${e.precision}%・ゆいまるの新記事のうち事前予測済み ${e.recall ?? '-'}%）_`);
  }
  lines.push('');
  return lines;
}
