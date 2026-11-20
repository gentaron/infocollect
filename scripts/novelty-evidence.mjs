import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

import { buildKnowledgeBase } from './build-kb.mjs';

const CODE = /(?:source code|reference (?:implementation|code)|code (?:is|are) (?:publicly )?available|implementation (?:is|are) (?:publicly )?available|open[- ]source (?:code|implementation)|参照実装|ソースコード|コードを公開|実装を公開|リポジトリを公開)/i;
const CODE_LINK_CONTEXT = /(?:code|implementation|repository|repo|実装|リポジトリ)/i;
const DIFF = /(?:diff(?:erence)?s?|compared? (?:with|to|against)|modif(?:y|ied|ications?)|changes? (?:from|to|in)|based on|差分|比較して|変更|改変|ベースに)/i;
const CODE_DIFF = /(?:implementation|code|architecture|実装|コード|アーキテクチャ).{0,40}(?:diff|difference|変更|差分)|(?:diff|difference|差分|変更).{0,40}(?:implementation|code|architecture|実装|コード|アーキテクチャ)/i;
const ABLATION = /(?:ablation|ablate|ablated|w\/o\b|without\b|remove(?:d|s)?\b|component (?:analysis|contribution)|アブレーション|消融|削除|寄与|各要素)/i;
const REPRODUCTION = /(?:reproduc|replication|steps? to reproduce|how to reproduce|setup instructions|\bseed\b|\bcheckpoints?\b|hyperparameters?|training details|evaluation protocol|\bREADME\b|requirements\.txt|\bDocker\b|再現|学習手順|ハイパーパラメータ|乱数シード|チェックポイント|設定手順)/i;

export function noveltyEvidence(item = {}) {
  const source = typeof item === 'string' ? { body: item } : item || {};
  const text = [source.title, source.body, source.summary, source.url, (source.tags || []).join(' ')]
    .filter(Boolean).join(' ');
  const codeEvidence = CODE.test(text) || (/github\.com/i.test(text) && CODE_LINK_CONTEXT.test(text));
  const referenceDiff = CODE_DIFF.test(text) || (codeEvidence && DIFF.test(text));
  const ablation = ABLATION.test(text);
  const reproductionSteps = REPRODUCTION.test(text);
  return {
    referenceDiff,
    ablation,
    reproductionSteps,
    reason: [
      referenceDiff ? '参照コード差分あり' : '参照コード差分なし',
      ablation ? 'アブレーションあり' : 'アブレーションなし',
      reproductionSteps ? '再現手順あり' : '再現手順なし',
    ].join('・'),
  };
}

export function testNoveltyEvidence() {
  const full = noveltyEvidence({
    title: 'Open-weight model X',
    body: 'We release the reference implementation on github.com/acme/x. Compared with the earlier code, we modify the attention block. Ablation studies removing the router show its contribution. Steps to reproduce: set seed 42 and follow the README.',
    tags: ['research'],
  });
  assert.deepEqual(full, {
    referenceDiff: true,
    ablation: true,
    reproductionSteps: true,
    reason: '参照コード差分あり・アブレーションあり・再現手順あり',
  });

  const japanese = noveltyEvidence({
    body: '参照実装をGitHubで公開し、既存実装との差分を説明する。アブレーション実験で各要素の寄与を確認した。再現手順として乱数シードとチェックポイントを記載した。',
  });
  assert.equal(japanese.referenceDiff, true);
  assert.equal(japanese.ablation, true);
  assert.equal(japanese.reproductionSteps, true);

  const none = noveltyEvidence({ title: 'Model X achieves SOTA', body: 'We report benchmark results.' });
  assert.deepEqual(none, {
    referenceDiff: false,
    ablation: false,
    reproductionSteps: false,
    reason: '参照コード差分なし・アブレーションなし・再現手順なし',
  });

  const codeOnly = noveltyEvidence({ body: 'The source code is available at github.com/acme/y. Results are reported.' });
  assert.equal(codeOnly.referenceDiff, false);
  assert.equal(codeOnly.ablation, false);
  assert.equal(codeOnly.reproductionSteps, false);

  const release = noveltyEvidence({
    title: 'org/repo v1.0',
    url: 'https://github.com/org/repo/releases/tag/v1.0',
    body: 'Full changelog since the last release.',
  });
  assert.equal(release.referenceDiff, false);

  const kb = buildKnowledgeBase([{
    dateLocal: '2026-01-01',
    generatedAt: '2026-01-01T00:00:00.000Z',
    news: [{ title: 'T', url: 'https://example.com/a', summary: 's', novelty_evidence: full }],
  }]);
  assert.equal('novelty_evidence' in kb.shards[0].docs[0], false);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  testNoveltyEvidence();
  console.log('noveltyEvidence: ok');
}
