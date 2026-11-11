// The Forge engine. Everything that moves a card lives here.
//
//   queued ──start──▶ running ──exit──▶ verifying ──pass──▶ reviewing ──APPROVE──▶ review ──human──▶ done
//      ▲                  │ timeout / crash      │ fail                │ REJECT          │ reject
//      └──── retry (escalate one rung, avoid the agent that failed, feed the reason back) ┘
//
// `tick()` is idempotent and safe to call from cron, the CLI or the server.
// Only one tick runs at a time (tick.lock); slow work (tests, git) runs
// outside the board lock, with the card claimed first so nobody else
// touches it meanwhile.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { buildCommand, escalate, pick } from './agents.mjs';
import * as G from './git.mjs';
import { FORGE_DIR, event, findCard, home, loadConfig, paths, readBoard, runsToday, slug, update } from './store.mjs';
import * as T from './tmux.mjs';

const ACTIVE = new Set(['running', 'reviewing']);
/** Short-lived states a tick passes through, and where to return if it died there. */
const TRANSIENT = { starting: 'queued', verifying: 'running', 'starting-review': 'needs-review', judging: 'reviewing' };
const EXIT_REASON = { 124: '時間切れ', 125: 'tmux セッションが消えた', 97: 'worktree に入れない' };
const nowIso = () => new Date().toISOString();
const tail = (text, n = 40) => String(text || '').split('\n').slice(-n).join('\n').trim();
const readSafe = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } };

/** One tmux session per attempt: `f12-3run-calc` = card 12, attempt 3, worker. */
export const sessionName = (card, kind, n) => `f${card.id}-${n}${kind}-${slug(card.repo, 12)}`;

// ------------------------------------------------------------------ repos & cards

export function addRepo(h, { dir, name, verify, base }) {
  const top = G.toplevel(path.resolve(dir));
  const repoName = name || path.basename(top);
  let verifyCmd = verify;
  if (verifyCmd === undefined) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(top, 'package.json'), 'utf8'));
      if (pkg.scripts?.test && !/no test specified/.test(pkg.scripts.test)) verifyCmd = 'npm test --silent';
    } catch { /* not a node repo */ }
  }
  const repo = { name: repoName, path: top, base: base || G.currentBranch(top), verify: verifyCmd || '' };
  update(h, (board) => { board.repos[repoName] = repo; });
  event(h, 'repo', { repo: repoName, path: top });
  return repo;
}

export function addCard(h, { repo, title, prompt = '', tier = 'light', deps = [], files = [], kb = false, agent = null, priority = 0, hold = false, issue = null }) {
  if (!title) throw new Error('タイトルが空です');
  return update(h, (board) => {
    if (!board.repos[repo]) throw new Error(`リポジトリ "${repo}" が未登録です（forge repo add <path>）`);
    const config = loadConfig(h);
    if (!config.tiers[tier]) throw new Error(`tier "${tier}" は未定義（${Object.keys(config.tiers).join(' / ')}）`);
    for (const d of deps) if (!findCard(board, d)) throw new Error(`依存先 #${d} がありません`);
    if (issue && board.cards.some((c) => c.repo === repo && c.issue === issue)) return null;
    const id = ++board.seq;
    const card = {
      id, repo, title, prompt, tier, startTier: tier, deps: deps.map(Number), files, kb: !!kb, agent, priority: Number(priority) || 0,
      status: hold ? 'backlog' : 'queued', attempts: [], feedback: '', review: null, summary: '', issue,
      branch: `forge/${id}-${slug(title, 24)}`, worktree: path.join(paths(h).wt, slug(repo, 24), String(id)), base: board.repos[repo].base,
      maxAttempts: config.maxAttempts, createdAt: nowIso(), updatedAt: nowIso(),
    };
    board.cards.push(card);
    event(h, 'add', { id, repo, title, tier });
    return card;
  });
}

function setStatus(card, status, extra = {}) {
  Object.assign(card, extra, { status, updatedAt: nowIso() });
}

// ------------------------------------------------------------------ prompts

function kbContext(card) {
  if (!card.kb) return '';
  const query = path.join(FORGE_DIR, '..', 'scripts', 'kb', 'query.mjs');
  if (!fs.existsSync(query)) return '';
  const res = spawnSync(process.execPath, [query, `${card.title} ${card.prompt}`.slice(0, 300), '--pack', '2500', '--k', '8'], { encoding: 'utf8', timeout: 30000 });
  return res.status === 0 ? res.stdout.trim() : '';
}

export function workerPrompt(card, repo, { attempt, kb = '' }) {
  return [
    `# 作業カード #${card.id}: ${card.title}`,
    '',
    'あなたはこのリポジトリで1枚のカードだけを担当する開発者です。作業場所は今のディレクトリ（このカード専用の git worktree）。',
    '',
    '## 進め方',
    '1. 方向づけ: まず関係するファイルを読み、何をどこまで変えるかを決める。カードの範囲の外には手を出さない',
    '2. 作業: 小さく変えて、確かめて、また変える',
    `3. 確認: ${repo.verify ? `\`${repo.verify}\` が通ることを自分で確かめる（Forge も最後に同じコマンドで検証する）` : '動作を自分で確かめる'}`,
    '4. git commit はしない（Forge が自動でコミットする）。秘密情報やビルド成果物を足さない',
    '5. 最後に1行だけ `FORGE-SUMMARY: <何をしたかを日本語で一文>` を出力して終わる',
    '',
    '## 依頼',
    card.prompt || card.title,
    ...(card.files?.length ? ['', '## 主に触るファイル（ここから読み始める）', ...card.files.map((f) => `- ${f}`)] : []),
    ...(card.feedback ? ['', `## 前回（試行 ${attempt - 1}）が通らなかった理由。これを直すこと`, card.feedback] : []),
    ...(kb ? ['', '## 参考資料（InfoCollect のナレッジベースから。必要なときだけ使う）', kb] : []),
  ].join('\n');
}

export function reviewPrompt(card, repo, diff, verifyTail) {
  return [
    `# 審査: カード #${card.id}「${card.title}」`,
    '',
    'あなたは審査役です。別のAIが書いた変更を読み、マージしてよいかを判定します。**ファイルは一切編集しないでください。**',
    '',
    '## 依頼内容',
    card.prompt || card.title,
    '',
    `## 自動検証: ${repo.verify ? `\`${repo.verify}\` は通過済み` : '検証コマンドなし'}`,
    verifyTail ? `\n\`\`\`\n${verifyTail}\n\`\`\`` : '',
    '',
    '## 見る点',
    '- 依頼を満たしているか。依頼の外の変更や、関係ないファイルの書き換えが無いか',
    '- バグ・壊れやすい書き方・セキュリティ上の問題（秘密情報の混入、外部入力をそのまま実行など）が無いか',
    '- テストを消したり弱めたりして通していないか',
    '',
    '## 答え方（この形で、最後に必ず）',
    'VERDICT: APPROVE  または  VERDICT: REJECT',
    'その下に、理由を箇条書きで最大5つ。REJECT のときは、直すべき点を具体的に。',
    '',
    '## 差分',
    '```diff',
    diff || '（差分なし）',
    '```',
  ].join('\n');
}

export function parseVerdict(text) {
  const lines = String(text || '').split('\n');
  let idx = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (/VERDICT:\s*(APPROVE|REJECT)/i.test(lines[i])) { idx = i; break; }
  if (idx < 0) return null;
  const verdict = /APPROVE/i.test(lines[idx]) ? 'approve' : 'reject';
  const notes = lines.slice(idx + 1).map((l) => l.trim()).filter((l) => /^[-*・\d]/.test(l)).slice(0, 5).join('\n');
  return { verdict, notes };
}

export function parseSummary(text) {
  const m = String(text || '').match(/FORGE-SUMMARY:\s*(.+)/g);
  return m ? m[m.length - 1].replace(/FORGE-SUMMARY:\s*/, '').trim().slice(0, 200) : '';
}

// ------------------------------------------------------------------ launching

function launch(h, card, repo, kind, agentId, profile, promptText, n) {
  const runsDir = path.join(paths(h).runs, String(card.id));
  fs.mkdirSync(runsDir, { recursive: true });
  const base = path.join(runsDir, `${n}-${kind}-${agentId}`);
  const files = { prompt: `${base}.prompt.md`, script: `${base}.sh`, log: `${base}.log`, exit: `${base}.exit` };
  fs.writeFileSync(files.prompt, `${promptText}\n`);
  fs.rmSync(files.exit, { force: true });
  const cmd = buildCommand(profile, { promptFile: T.sh(files.prompt) });
  fs.writeFileSync(files.script, [
    '#!/usr/bin/env bash',
    `cd ${T.sh(card.worktree)} || exit 97`,
    `echo "▶ forge #${card.id} ${kind} by ${agentId} — $(date '+%F %T')" | tee -a ${T.sh(files.log)}`,
    `( ${cmd} ) < /dev/null 2>&1 | tee -a ${T.sh(files.log)}`,
    'code=${PIPESTATUS[0]}',
    `echo "■ exit $code" | tee -a ${T.sh(files.log)}`,
    `echo "$code" > ${T.sh(files.exit)}`,
    '',
  ].join('\n'));
  const session = T.start(sessionName(card, kind, n), card.worktree, files.script);
  return { agent: agentId, kind, session, ...files, startedAt: nowIso() };
}

function claim(h, id, from, to) {
  return update(h, (board) => {
    const card = findCard(board, id);
    if (!card || card.status !== from) return null;
    setStatus(card, to);
    return JSON.parse(JSON.stringify(card));
  });
}

function startWorker(h, card, repo, config, usage, running) {
  const failedAgents = card.attempts.filter((a) => a.kind === 'run' && a.result !== 'pass').map((a) => a.agent);
  const choice = pick(config, card.tier, { usage, running, avoid: failedAgents, pin: card.agent });
  if (!choice.id) return { blocked: choice.skipped.join(' / ') || 'エージェントなし' };
  G.ensureWorktree(repo.path, card.worktree, card.branch, card.base);
  const n = card.attempts.length + 1;
  const attempt = launch(h, card, repo, 'run', choice.id, choice.profile, workerPrompt(card, repo, { attempt: n, kb: kbContext(card) }), n);
  attempt.tier = card.tier;
  update(h, (board) => {
    const c = findCard(board, card.id);
    c.attempts.push(attempt);
    setStatus(c, 'running', { blocked: '' });
  });
  event(h, 'run', { id: card.id, agent: choice.id, tier: card.tier, attempt: n });
  usage[choice.id] = (usage[choice.id] || 0) + 1;
  running[choice.id] = (running[choice.id] || 0) + 1;
  return { started: choice.id };
}

function needsReview(config, profile) {
  const when = config.review?.when || 'free-only';
  return when === 'always' || (when === 'free-only' && profile?.free);
}

// ------------------------------------------------------------------ finishing

function failAttempt(h, id, reason, feedback, config) {
  update(h, (board) => {
    const card = findCard(board, id);
    const last = card.attempts[card.attempts.length - 1];
    if (last) Object.assign(last, { result: last.result || 'fail', reason, endedAt: last.endedAt || nowIso() }); // a reviewer's 'reject' stays 'reject'
    const runs = card.attempts.filter((a) => a.kind === 'run').length;
    if (runs >= card.maxAttempts) {
      setStatus(card, 'failed', { feedback, failReason: reason });
      return;
    }
    const next = escalate(config, card.tier);
    setStatus(card, 'queued', { feedback, tier: next || card.tier, failReason: '' });
  });
  event(h, 'fail', { id, reason });
}

function runVerify(repo, card, config) {
  if (!repo.verify) return { ok: true, out: '（検証コマンドなし）' };
  const res = spawnSync('bash', ['-lc', repo.verify], {
    cwd: card.worktree, encoding: 'utf8', timeout: config.verifyTimeoutMinutes * 60000, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
  });
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  if (res.error?.code === 'ETIMEDOUT') return { ok: false, out: `${tail(out)}\n（検証が ${config.verifyTimeoutMinutes} 分で終わらなかった）` };
  return { ok: res.status === 0, out };
}

function finishWorker(h, card, repo, config) {
  const last = card.attempts[card.attempts.length - 1];
  const code = Number(readSafe(last.exit).trim());
  const log = readSafe(last.log);
  T.kill(last.session);
  const summary = parseSummary(log);
  const sha = G.commitAll(card.worktree, `forge #${card.id}: ${card.title}\n\n試行 ${card.attempts.length} / ${last.agent} / tier ${last.tier}${summary ? `\n${summary}` : ''}`);
  const diff = G.diffStat(repo.path, card.branch, card.base);
  update(h, (board) => Object.assign(findCard(board, card.id).attempts.at(-1), { exitCode: code, commit: sha, endedAt: nowIso() }));

  if (code !== 0) return failAttempt(h, card.id, EXIT_REASON[code] || `エージェントが exit ${code} で終了`, `エージェントの出力の最後:\n${tail(log, 30)}`, config);
  if (!diff.files.length) return failAttempt(h, card.id, '変更なし', '前回は何も変更されませんでした。依頼を満たすようにファイルを実際に編集してください。', config);

  const verify = runVerify(repo, card, config);
  const verifyFile = last.log.replace(/\.log$/, '.verify.log');
  fs.writeFileSync(verifyFile, verify.out);
  if (!verify.ok) return failAttempt(h, card.id, '検証失敗', `\`${repo.verify}\` が失敗しました。出力の最後:\n${tail(verify.out, 40)}`, config);

  update(h, (board) => {
    const c = findCard(board, card.id);
    Object.assign(c.attempts.at(-1), { result: 'pass', verifyLog: verifyFile });
    c.summary = summary || c.summary;
    c.diff = { stat: diff.stat, files: diff.files.slice(0, 50) };
    setStatus(c, needsReview(config, config.agents[last.agent]) ? 'needs-review' : 'review', { feedback: '' });
  });
  event(h, 'pass', { id: card.id, agent: last.agent, files: diff.files.length });
}

function startReview(h, card, repo, config, usage, running) {
  const worker = card.attempts.filter((a) => a.kind === 'run').at(-1)?.agent;
  const reviewConfig = { ...config, tiers: { ...config.tiers, _review: { agents: config.review.agents } } };
  const choice = pick(reviewConfig, '_review', { usage, running, avoid: [worker] });
  if (!choice.id || choice.id === worker) {
    update(h, (board) => setStatus(findCard(board, card.id), 'review', { review: { agent: null, verdict: 'skipped', notes: choice.id ? '書き手と別の審査役がいないので省略' : `審査役なし（${choice.skipped.join(' / ')}）` } }));
    return;
  }
  const diff = G.diffText(repo.path, card.branch, card.base);
  const verifyTail = tail(readSafe(card.attempts.at(-1).verifyLog), 15);
  const n = card.attempts.length + 1;
  const attempt = launch(h, card, repo, 'review', choice.id, choice.profile, reviewPrompt(card, repo, diff, verifyTail), n);
  update(h, (board) => {
    const c = findCard(board, card.id);
    c.attempts.push(attempt);
    setStatus(c, 'reviewing');
  });
  event(h, 'review-start', { id: card.id, agent: choice.id });
  usage[choice.id] = (usage[choice.id] || 0) + 1;
  running[choice.id] = (running[choice.id] || 0) + 1;
}

function finishReview(h, card, config) {
  const last = card.attempts.at(-1);
  const log = readSafe(last.log);
  T.kill(last.session);
  // The reviewer must not change code. Throw away anything it touched.
  G.git(card.worktree, ['reset', '-q', '--hard'], { allowFail: true });
  G.git(card.worktree, ['clean', '-qfd'], { allowFail: true });
  const parsed = parseVerdict(log);
  const review = { agent: last.agent, verdict: parsed?.verdict || 'unclear', notes: parsed?.notes || tail(log, 12) };
  update(h, (board) => Object.assign(findCard(board, card.id).attempts.at(-1), { result: review.verdict, endedAt: nowIso() }));
  event(h, 'review', { id: card.id, agent: last.agent, verdict: review.verdict });
  if (review.verdict === 'reject') {
    update(h, (board) => { findCard(board, card.id).review = review; });
    return failAttempt(h, card.id, `審査役 ${last.agent} が差し戻し`, `審査役の指摘:\n${review.notes}`, config);
  }
  update(h, (board) => setStatus(findCard(board, card.id), 'review', { review }));
}

// ------------------------------------------------------------------ tick

export function tick(h = home(), { env = process.env } = {}) {
  const tickLock = path.join(h, 'tick.lock');
  fs.mkdirSync(h, { recursive: true });
  try {
    fs.writeFileSync(tickLock, String(process.pid), { flag: 'wx' });
  } catch {
    try { if (Date.now() - fs.statSync(tickLock).mtimeMs > 15 * 60000) fs.rmSync(tickLock, { force: true }); } catch { /* noop */ }
    return { skipped: true };
  }
  const report = { finished: [], started: [], blocked: [], timedOut: [] };
  try {
    const config = loadConfig(h);

    // 0. Recover cards left mid-transition by a crashed tick.
    update(h, (b) => {
      for (const c of b.cards) {
        if (TRANSIENT[c.status] && Date.now() - Date.parse(c.updatedAt) > 20 * 60000) setStatus(c, TRANSIENT[c.status]);
      }
    });
    let board = readBoard(h);

    // 1. Collect finished / stuck runs.
    for (const card of board.cards.filter((c) => ACTIVE.has(c.status))) {
      const last = card.attempts.at(-1);
      const repo = board.repos[card.repo];
      if (!last || !repo) continue;
      const done = fs.existsSync(last.exit);
      const age = Date.now() - Date.parse(last.startedAt);
      if (!done && age > config.runTimeoutMinutes * 60000) {
        T.kill(last.session);
        fs.writeFileSync(last.exit, '124');
        report.timedOut.push(card.id);
      } else if (!done && !T.has(last.session) && age > 10000) {
        fs.writeFileSync(last.exit, '125'); // the session vanished (reboot, killed by hand)
      } else if (!done) {
        continue;
      }
      if (card.status === 'running') {
        const claimed = claim(h, card.id, 'running', 'verifying');
        if (claimed) { finishWorker(h, claimed, repo, config); report.finished.push(card.id); }
      } else {
        const claimed = claim(h, card.id, 'reviewing', 'judging');
        if (claimed) { finishReview(h, claimed, config); report.finished.push(card.id); }
      }
    }

    // 2. Start reviews and new runs, within the parallel budget.
    board = readBoard(h);
    const usage = runsToday(h);
    const running = {};
    for (const c of board.cards.filter((x) => ACTIVE.has(x.status))) {
      const a = c.attempts.at(-1)?.agent;
      if (a) running[a] = (running[a] || 0) + 1;
    }
    let slots = config.maxParallel - board.cards.filter((c) => ACTIVE.has(c.status)).length;
    const doneIds = new Set(board.cards.filter((c) => c.status === 'done').map((c) => c.id));
    const order = (a, b) => b.priority - a.priority || a.id - b.id;

    for (const card of board.cards.filter((c) => c.status === 'needs-review').sort(order)) {
      if (slots <= 0) break;
      const claimed = claim(h, card.id, 'needs-review', 'starting-review');
      if (!claimed) continue;
      try {
        startReview(h, claimed, board.repos[card.repo], config, usage, running);
        if (readBoard(h).cards.find((c) => c.id === card.id)?.status === 'reviewing') slots--;
      } catch (error) {
        update(h, (b) => setStatus(findCard(b, card.id), 'review', { review: { agent: null, verdict: 'error', notes: error.message } }));
      }
    }
    for (const card of board.cards.filter((c) => c.status === 'queued').sort(order)) {
      if (slots <= 0) break;
      if (!card.deps.every((d) => doneIds.has(d))) continue;
      const claimed = claim(h, card.id, 'queued', 'starting');
      if (!claimed) continue;
      try {
        const r = startWorker(h, claimed, board.repos[card.repo], config, usage, running);
        if (r.started) { slots--; report.started.push({ id: card.id, agent: r.started }); }
        else {
          update(h, (b) => setStatus(findCard(b, card.id), 'queued', { blocked: r.blocked }));
          report.blocked.push({ id: card.id, why: r.blocked });
        }
      } catch (error) {
        update(h, (b) => setStatus(findCard(b, card.id), 'failed', { failReason: `起動できません: ${error.message}` }));
        event(h, 'error', { id: card.id, message: error.message });
      }
    }
    return report;
  } finally {
    fs.rmSync(tickLock, { force: true });
  }
}

// ------------------------------------------------------------------ human actions

export function approve(h, id, { env = process.env } = {}) {
  const board = readBoard(h);
  const card = findCard(board, id);
  if (!card) throw new Error(`#${id} がありません`);
  if (card.status !== 'review') throw new Error(`#${id} は承認待ちではありません（${card.status}）`);
  const repo = board.repos[card.repo];
  const agents = [...new Set(card.attempts.filter((a) => a.result === 'pass' || a.kind === 'review').map((a) => `${a.kind === 'review' ? '審査' : '実装'} ${a.agent}`))].join(' / ');
  const body = [card.summary, card.prompt && card.prompt !== card.title ? `依頼: ${card.prompt.slice(0, 400)}` : '', `Forge #${card.id} · ${agents} · 試行 ${card.attempts.filter((a) => a.kind === 'run').length}`].filter(Boolean).join('\n\n');
  const sha = G.merge(repo.path, card.branch, card.base, `${card.title}\n\n${body}`);
  G.removeWorktree(repo.path, card.worktree, card.branch, { deleteBranch: true });
  update(h, (b) => setStatus(findCard(b, id), 'done', { merged: sha }));
  event(h, 'approve', { id: card.id, merged: sha });
  if (card.issue) {
    spawnSync('gh', ['issue', 'close', String(card.issue), '--comment', `Forge #${card.id} で対応して ${card.base} にマージした（${sha}）。${card.summary ? `\n\n${card.summary}` : ''}`], { cwd: repo.path, encoding: 'utf8', timeout: 30000 });
  }
  return sha;
}

export function reject(h, id, note = '') {
  return update(h, (board) => {
    const card = findCard(board, id);
    if (!card) throw new Error(`#${id} がありません`);
    if (!['review', 'failed'].includes(card.status)) throw new Error(`#${id} は差し戻せる状態ではありません（${card.status}）`);
    card.maxAttempts = Math.max(card.maxAttempts, card.attempts.filter((a) => a.kind === 'run').length + 1);
    setStatus(card, 'queued', { feedback: note ? `人からの指摘:\n${note}` : card.feedback, failReason: '' });
    event(h, 'reject', { id: card.id, note });
    return card;
  });
}

export function hold(h, id, on = true) {
  return update(h, (board) => {
    const card = findCard(board, id);
    if (!card) throw new Error(`#${id} がありません`);
    if (on && card.status !== 'queued') throw new Error('待機列のカードだけ保留にできます');
    if (!on && card.status !== 'backlog') throw new Error('保留中のカードではありません');
    setStatus(card, on ? 'backlog' : 'queued');
    return card;
  });
}

export function cancel(h, id, { purge = false } = {}) {
  const board = readBoard(h);
  const card = findCard(board, id);
  if (!card) throw new Error(`#${id} がありません`);
  for (const a of card.attempts) T.kill(a.session);
  const repo = board.repos[card.repo];
  if (repo && fs.existsSync(card.worktree)) G.removeWorktree(repo.path, card.worktree, card.branch, { deleteBranch: true });
  update(h, (b) => {
    if (purge) b.cards = b.cards.filter((c) => c.id !== card.id);
    else setStatus(findCard(b, id), 'cancelled');
  });
  event(h, purge ? 'delete' : 'cancel', { id: card.id });
}

export function peek(h, id, lines = 60) {
  const card = findCard(readBoard(h), id);
  if (!card) throw new Error(`#${id} がありません`);
  const last = card.attempts.at(-1);
  if (!last) return { card, text: '（まだ実行していない）' };
  const live = ACTIVE.has(card.status) && T.has(last.session) ? T.capture(last.session, lines) : '';
  return { card, attempt: last, live: !!live, text: live || tail(readSafe(last.log), lines) };
}

/**
 * Steer a running card: stop the current run (its partial edits stay in the
 * worktree), add your note to the brief, and start again. Agents run headless
 * with stdin closed so nothing can hang on a prompt — this is how you talk to
 * them mid-run. Does not count against the attempt budget.
 */
export function steer(h, id, text) {
  if (!String(text || '').trim()) throw new Error('指示が空です');
  const card = findCard(readBoard(h), id);
  if (!card || card.status !== 'running') throw new Error(`#${id} は実行中ではありません`);
  T.kill(card.attempts.at(-1).session);
  update(h, (board) => {
    const c = findCard(board, id);
    Object.assign(c.attempts.at(-1), { result: 'steered', reason: '人が方向を変えた', endedAt: nowIso() });
    c.maxAttempts += 1;
    const note = `人からの追加指示（前の実行は途中で止めた。作業の途中経過はこの worktree に残っている）:\n${text.trim()}`;
    setStatus(c, 'queued', { feedback: c.feedback ? `${c.feedback}\n\n${note}` : note });
  });
  event(h, 'steer', { id: card.id, text: text.slice(0, 200) });
}

/** Import GitHub issues labelled `forge` as cards (needs the gh CLI). */
export function syncIssues(h, repoName, { label = 'forge', tier = 'light' } = {}) {
  const repo = readBoard(h).repos[repoName];
  if (!repo) throw new Error(`リポジトリ "${repoName}" が未登録です`);
  const res = spawnSync('gh', ['issue', 'list', '--label', label, '--state', 'open', '--json', 'number,title,body,labels', '--limit', '50'], { cwd: repo.path, encoding: 'utf8', timeout: 30000 });
  if (res.status !== 0) throw new Error(`gh issue list 失敗: ${(res.stderr || '').trim().slice(0, 200)}`);
  const added = [];
  for (const issue of JSON.parse(res.stdout || '[]')) {
    const tierLabel = (issue.labels || []).map((l) => l.name).find((n) => /^tier:(light|standard|heavy)$/.test(n));
    const card = addCard(h, { repo: repoName, title: issue.title, prompt: issue.body || issue.title, tier: tierLabel ? tierLabel.slice(5) : tier, issue: issue.number });
    if (card) added.push(card.id);
  }
  return added;
}
