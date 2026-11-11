// Git plumbing: one worktree + one branch per card, so parallel agents never
// edit the same checkout, and "approve" is just a merge.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function git(cwd, args, { allowFail = false, timeout = 60000 } = {}) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
  if (res.error) throw res.error;
  if (res.status !== 0 && !allowFail) throw new Error(`git ${args.join(' ')} 失敗: ${(res.stderr || res.stdout).trim().slice(0, 400)}`);
  return { ok: res.status === 0, out: (res.stdout || '').trim(), err: (res.stderr || '').trim() };
}

export function isRepo(dir) {
  return git(dir, ['rev-parse', '--show-toplevel'], { allowFail: true }).ok;
}

export function toplevel(dir) {
  return git(dir, ['rev-parse', '--show-toplevel']).out;
}

export function currentBranch(dir) {
  return git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']).out;
}

/** Create (or reuse) the card's worktree on its own branch from `base`. */
export function ensureWorktree(repo, wtPath, branch, base) {
  if (fs.existsSync(path.join(wtPath, '.git'))) return wtPath;
  fs.mkdirSync(path.dirname(wtPath), { recursive: true });
  const exists = git(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { allowFail: true }).ok;
  git(repo, exists ? ['worktree', 'add', wtPath, branch] : ['worktree', 'add', '-b', branch, wtPath, base]);
  return wtPath;
}

export function removeWorktree(repo, wtPath, branch, { deleteBranch = false } = {}) {
  git(repo, ['worktree', 'remove', '--force', wtPath], { allowFail: true });
  git(repo, ['worktree', 'prune'], { allowFail: true });
  if (deleteBranch) git(repo, ['branch', '-D', branch], { allowFail: true });
}

/** Commit whatever the agent left in the worktree. Returns the new sha or null if nothing changed. */
export function commitAll(wt, message) {
  git(wt, ['add', '-A']);
  if (git(wt, ['diff', '--cached', '--quiet'], { allowFail: true }).ok) return null;
  git(wt, ['-c', 'user.name=forge', '-c', 'user.email=forge@localhost', 'commit', '-q', '--no-verify', '-m', message]);
  return git(wt, ['rev-parse', '--short', 'HEAD']).out;
}

/** Changes on the card branch relative to where it forked. */
export function diffStat(repo, branch, base) {
  const mb = git(repo, ['merge-base', base, branch], { allowFail: true }).out || base;
  const stat = git(repo, ['diff', '--shortstat', mb, branch], { allowFail: true }).out;
  const files = git(repo, ['diff', '--name-only', mb, branch], { allowFail: true }).out.split('\n').filter(Boolean);
  return { stat, files, mergeBase: mb };
}

export function diffText(repo, branch, base, maxChars = 60000) {
  const mb = git(repo, ['merge-base', base, branch], { allowFail: true }).out || base;
  const out = git(repo, ['diff', '--stat', '-p', '--no-color', mb, branch], { allowFail: true }).out;
  return out.length > maxChars ? `${out.slice(0, maxChars)}\n… (diff は ${out.length} 文字。先頭だけ)` : out;
}

/**
 * Land the card branch on `base` in the main checkout as ONE commit (squash):
 * failed attempts and agent churn never reach your history. Refuses when the
 * main checkout is dirty or not on `base`, so approving never clobbers
 * uncommitted work.
 */
export function merge(repo, branch, base, message) {
  if (currentBranch(repo) !== base) throw new Error(`本体のチェックアウトが ${base} ではありません（${currentBranch(repo)}）`);
  if (git(repo, ['status', '--porcelain', '--untracked-files=no']).out) throw new Error('本体のチェックアウトに未コミットの変更があります');
  const r = git(repo, ['merge', '--squash', branch], { allowFail: true });
  if (!r.ok) {
    git(repo, ['reset', '-q', '--merge'], { allowFail: true });
    throw new Error(`マージで衝突しました。${branch} を ${base} に追従させてから再承認してください: ${(r.err || r.out).slice(0, 300)}`);
  }
  if (git(repo, ['diff', '--cached', '--quiet'], { allowFail: true }).ok) throw new Error('マージしても変更がありません（すでに取り込み済み？）');
  // Approving is the human's act, so the landed commit uses your git identity when one is set.
  const own = git(repo, ['config', 'user.name'], { allowFail: true }).ok;
  git(repo, [...(own ? [] : ['-c', 'user.name=forge', '-c', 'user.email=forge@localhost']), 'commit', '-q', '--no-verify', '-m', message]);
  return git(repo, ['rev-parse', '--short', 'HEAD']).out;
}
