#!/usr/bin/env node
// Forge — a tmux kanban for AI coding agents. Zero dependencies.
//
//   forge repo add <path> [--name x] [--verify "npm test"] [--base main]
//   forge repo scan <dir>       その下の git リポジトリをまとめて登録
//   forge add <repo> "タイトル" [-m "詳しい依頼"] [--tier light|standard|heavy] [--files a,b]
//                               [--after 3,4] [--kb] [--agent claude] [--hold] [--priority 1]
//   forge ls                    ボード
//   forge tick                  1回だけ進める（cron 向け）
//   forge watch                 進め続ける（Ctrl-C で止める）
//   forge serve [--port 7777] [--host 127.0.0.1]   Web のボード＋自動で進める
//   forge peek <id> [-n 80]     実行中の画面（tmux）か、ログの最後
//   forge attach <id>           tmux の画面に入る（抜けるのは Ctrl-b d）
//   forge steer <id> "指示"     実行中の作業を止め、指示を足してやり直させる（途中の変更は残る）
//   forge diff <id>             差分
//   forge approve <id>          マージして片づける（人の最終判断）
//   forge reject <id> ["理由"]  理由をつけて差し戻す
//   forge hold <id> / forge go <id>   保留 / 再開
//   forge cancel <id> [--purge]
//   forge agents                どのエージェントが使えるか・今日の残り
//   forge sync <repo>           GitHub の `forge` ラベルの Issue をカードに取り込む
//   forge log [-n 30]           出来事の記録
//   forge mcp                   MCP サーバー（Claude Code をリーダーにする）

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { detectAll } from './lib/agents.mjs';
import * as E from './lib/engine.mjs';
import * as G from './lib/git.mjs';
import { findCard, home, loadConfig, readBoard, readEvents, runsToday } from './lib/store.mjs';
import * as T from './lib/tmux.mjs';

const H = home();
const argv = process.argv.slice(2);
const cmd = argv.shift();

function flags(list) {
  const out = { _: [] };
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = list[i + 1];
      if (next === undefined || next.startsWith('-')) out[key] = true;
      else { out[key] = next; i++; }
    } else if (a === '-m' || a === '-n') {
      out[a.slice(1)] = list[++i];
    } else out._.push(a);
  }
  return out;
}

const COLUMNS = [
  ['backlog', '保留'], ['queued', '待機'], ['running', '実行中'], ['reviewing', '審査中'],
  ['review', '承認待ち'], ['failed', '失敗'], ['done', '完了'],
];
const GROUP = { starting: 'queued', verifying: 'running', 'needs-review': 'reviewing', 'starting-review': 'reviewing', judging: 'reviewing', cancelled: null };
const color = process.stdout.isTTY ? (c, s) => `\x1b[${c}m${s}\x1b[0m` : (_c, s) => s;

function printBoard() {
  const board = readBoard(H);
  if (!Object.keys(board.repos).length) {
    console.log('まだリポジトリがありません。まず: forge repo add <path>');
    return;
  }
  for (const [key, label] of COLUMNS) {
    const cards = board.cards.filter((c) => (GROUP[c.status] === undefined ? c.status : GROUP[c.status]) === key);
    if (!cards.length || (key === 'done' && cards.length > 8 && !process.env.FORGE_ALL)) {
      if (key === 'done' && cards.length) console.log(color('2', `\n${label} ${cards.length} 件（全部見るなら FORGE_ALL=1）`));
      continue;
    }
    console.log(color('1', `\n${label} (${cards.length})`));
    for (const c of cards) {
      const last = c.attempts.at(-1);
      const who = last ? `${last.agent}${c.status === 'running' ? '…' : ''}` : '';
      const extra = c.blocked ? color('33', ` ⏸ ${c.blocked}`) : c.failReason ? color('31', ` ✗ ${c.failReason}`) : c.review?.verdict ? color('36', ` 審査:${c.review.verdict}${c.review.agent ? `(${c.review.agent})` : ''}`) : '';
      console.log(`  #${String(c.id).padEnd(3)} ${c.title}  ${color('2', `[${c.repo} · ${c.tier}${who ? ` · ${who}` : ''} · 試行${c.attempts.filter((a) => a.kind === 'run').length}]`)}${extra}`);
    }
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function reportTick(r) {
  if (r.skipped) return;
  for (const s of r.started) console.log(`▶ #${s.id} を ${s.agent} で開始`);
  for (const id of r.finished) {
    const c = findCard(readBoard(H), id);
    console.log(`■ #${id} → ${c.status}${c.failReason ? `（${c.failReason}）` : ''}`);
  }
  for (const b of r.blocked) console.log(`⏸ #${b.id}: ${b.why}`);
}

async function main() {
  const f = flags(argv);
  switch (cmd) {
    case 'repo': {
      if (f._[0] === 'scan' && f._[1]) {
        const fs = await import('node:fs');
        const root = path.resolve(f._[1]);
        const found = fs.readdirSync(root, { withFileTypes: true })
          .filter((d) => d.isDirectory() && !d.name.startsWith('.') && fs.existsSync(path.join(root, d.name, '.git')))
          .map((d) => path.join(root, d.name));
        for (const dir of found) {
          try {
            const repo = E.addRepo(H, { dir });
            console.log(`登録: ${repo.name}（base ${repo.base} / 検証 ${repo.verify || 'なし'}）`);
          } catch (error) { console.log(`飛ばした: ${dir} — ${error.message}`); }
        }
        if (!found.length) console.log('git リポジトリが見つからなかった');
        break;
      }
      if (f._[0] !== 'add' || !f._[1]) throw new Error('使い方: forge repo add <path> [--name x] [--verify "npm test"] [--base main] / forge repo scan <dir>');
      if (!G.isRepo(path.resolve(f._[1]))) throw new Error(`${f._[1]} は git リポジトリではありません`);
      const repo = E.addRepo(H, { dir: f._[1], name: f.name, verify: f.verify === true ? '' : f.verify, base: f.base });
      console.log(`登録: ${repo.name} → ${repo.path}（base ${repo.base} / 検証 ${repo.verify || 'なし'}）`);
      break;
    }
    case 'add': {
      const [repo, title] = f._;
      if (!repo || !title) throw new Error('使い方: forge add <repo> "タイトル" [-m 依頼] [--tier light|standard|heavy]');
      const card = E.addCard(H, {
        repo, title, prompt: f.m || '', tier: f.tier || 'light',
        files: f.files ? String(f.files).split(',').map((s) => s.trim()).filter(Boolean) : [],
        deps: f.after ? String(f.after).split(',').map(Number).filter(Boolean) : [],
        kb: !!f.kb, agent: f.agent || null, hold: !!f.hold, priority: f.priority,
      });
      console.log(`#${card.id} を追加（${card.status === 'backlog' ? '保留' : '待機'} · tier ${card.tier}）`);
      break;
    }
    case 'ls': case undefined: printBoard(); break;
    case 'tick': reportTick(E.tick(H)); break;
    case 'watch': {
      const every = loadConfig(H).pollSeconds * 1000;
      console.log(`進め続けます（${every / 1000} 秒ごと。Ctrl-C で止まる。実行中のエージェントは止まらない）`);
      for (;;) { reportTick(E.tick(H)); await sleep(every); }
    }
    case 'serve': {
      const { serve } = await import('./lib/server.mjs');
      await serve(H, { port: Number(f.port || 7777), host: f.host || '127.0.0.1' });
      break;
    }
    case 'peek': {
      const r = E.peek(H, f._[0], Number(f.n || 60));
      console.log(color('2', `#${r.card.id} ${r.card.title} — ${r.card.status}${r.attempt ? ` / ${r.attempt.agent} (${r.live ? '画面' : 'ログ'})` : ''}`));
      console.log(r.text);
      break;
    }
    case 'attach': {
      const c = findCard(readBoard(H), f._[0]);
      const s = c?.attempts.at(-1)?.session;
      if (!s || !T.has(s)) throw new Error('入れるセッションがありません（終わったカードは forge peek でログを見られる）');
      spawnSync('tmux', ['-L', T.SOCKET, 'attach', '-t', s], { stdio: 'inherit' });
      break;
    }
    case 'steer': E.steer(H, f._[0], f._.slice(1).join(' ')); console.log('止めて、指示を足して待機列に戻した'); break;
    case 'diff': {
      const board = readBoard(H);
      const c = findCard(board, f._[0]);
      if (!c) throw new Error('カードがありません');
      console.log(G.diffText(board.repos[c.repo].path, c.branch, c.base));
      break;
    }
    case 'approve': console.log(`マージした: ${E.approve(H, f._[0])}`); break;
    case 'reject': E.reject(H, f._[0], f._.slice(1).join(' ')); console.log('差し戻した（次の tick で再開）'); break;
    case 'hold': E.hold(H, f._[0], true); console.log('保留にした'); break;
    case 'go': E.hold(H, f._[0], false); console.log('待機列に戻した'); break;
    case 'cancel': E.cancel(H, f._[0], { purge: !!f.purge }); console.log(f.purge ? '削除した' : '取り消した'); break;
    case 'sync': {
      const ids = E.syncIssues(H, f._[0], { label: f.label || 'forge' });
      console.log(ids.length ? `取り込んだ: ${ids.map((i) => `#${i}`).join(' ')}` : '新しい Issue はなかった');
      break;
    }
    case 'agents': {
      const config = loadConfig(H);
      const used = runsToday(H);
      console.log('エージェント');
      for (const a of detectAll(config)) {
        const p = config.agents[a.id];
        console.log(`  ${a.installed ? '✓' : '·'} ${a.id.padEnd(9)} ${(a.free ? '無料' : '上位').padEnd(3)} 今日 ${used[a.id] || 0}/${p.dailyRuns || '∞'}  ${p.label}`);
      }
      console.log('\ntier ごとの順番（左から試す。✓ だけが実際に使われる）');
      for (const [t, v] of Object.entries(config.tiers)) console.log(`  ${t.padEnd(9)} ${v.agents.join(' → ')}`);
      console.log(`  review    ${config.review.agents.join(' → ')}（${config.review.when}）`);
      break;
    }
    case 'log': for (const e of readEvents(H, { limit: Number(f.n || 30) })) console.log(`${e.t.slice(5, 19).replace('T', ' ')} ${e.type.padEnd(12)} ${e.id ? `#${e.id} ` : ''}${e.agent || e.reason || e.title || e.repo || e.verdict || ''}`); break;
    case 'mcp': {
      const { startMcp } = await import('./lib/mcp.mjs');
      startMcp(H);
      return;
    }
    case 'help': case '-h': case '--help': {
      const src = (await import('node:fs')).readFileSync(new URL(import.meta.url), 'utf8');
      console.log(src.split('\n').filter((l) => l.startsWith('//')).slice(0, 30).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
      break;
    }
    default: throw new Error(`不明なコマンド: ${cmd}（forge help）`);
  }
}

main().catch((error) => {
  console.error(`forge: ${error.message}`);
  process.exit(1);
});
