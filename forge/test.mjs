#!/usr/bin/env node
// Forge tests. Pure logic always runs; the end-to-end part drives real tmux
// sessions with tiny fake agents (bash scripts) in a temporary repo, and is
// skipped when tmux is missing.
//
//   node forge/test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-test-'));
process.env.FORGE_HOME = path.join(tmp, 'home');
process.env.FORGE_TMUX_SOCKET = `forge-test-${process.pid}`;
process.env.PATH = `${path.join(tmp, 'bin')}:${process.env.PATH}`;

const { buildCommand, escalate, pick } = await import('./lib/agents.mjs');
const E = await import('./lib/engine.mjs');
const S = await import('./lib/store.mjs');
const T = await import('./lib/tmux.mjs');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failed++;
    console.error(`  FAIL ${name}\n       ${error.stack?.split('\n').slice(0, 3).join('\n       ')}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = process.env.FORGE_HOME;

// ------------------------------------------------------------------ pure

const CONFIG = {
  ladder: ['light', 'standard', 'heavy'],
  tiers: { light: { agents: ['a', 'b'] }, standard: { agents: ['b', 'c'] }, heavy: { agents: ['c'] } },
  agents: {
    a: { bin: 'sh', free: true, dailyRuns: 2, cmd: 'a {prompt}' },
    b: { bin: 'sh', free: true, dailyRuns: 5, cmd: 'b {modelFlag} {prompt}', modelFlag: '-m {model}', model: 'tiny' },
    c: { bin: 'definitely-not-installed-xyz', free: false, cmd: 'c {prompt}' },
  },
};

await test('pick: first installed agent within budget; avoid is a preference', () => {
  assert.equal(pick(CONFIG, 'light').id, 'a');
  assert.equal(pick(CONFIG, 'light', { usage: { a: 2 } }).id, 'b', 'daily budget skips a');
  assert.equal(pick(CONFIG, 'light', { avoid: ['a'] }).id, 'b');
  assert.equal(pick(CONFIG, 'heavy').id, null, 'uninstalled agent is never picked');
  assert.match(pick(CONFIG, 'heavy').skipped.join(), /未インストール/);
  assert.equal(pick(CONFIG, 'light', { avoid: ['a', 'b'] }).id, 'a', 'all avoided → still runs something');
});

await test('escalate climbs one rung and stops at the top', () => {
  assert.equal(escalate(CONFIG, 'light'), 'standard');
  assert.equal(escalate(CONFIG, 'standard'), 'heavy');
  assert.equal(escalate(CONFIG, 'heavy'), null);
});

await test('buildCommand fills model flags only when a model is set', () => {
  assert.equal(buildCommand(CONFIG.agents.b, { promptFile: "'/p f'" }), "b -m tiny '/p f'");
  assert.equal(buildCommand({ ...CONFIG.agents.b, model: '' }, { promptFile: "'/p'" }), "b '/p'");
});

await test('shell quoting survives quotes and $()', () => {
  const r = spawnSync('bash', ['-c', `printf %s ${T.sh(`it's $(whoami) "x"`)}`], { encoding: 'utf8' });
  assert.equal(r.stdout, `it's $(whoami) "x"`);
});

await test('verdict and summary parsing take the last marker', () => {
  assert.deepEqual(E.parseVerdict('blah\nVERDICT: REJECT\n- テストが無い\n- 名前が変\nおわり'), { verdict: 'reject', notes: '- テストが無い\n- 名前が変' });
  assert.equal(E.parseVerdict('VERDICT: REJECT\n...\nVERDICT: APPROVE').verdict, 'approve');
  assert.equal(E.parseVerdict('no verdict here'), null);
  assert.equal(E.parseSummary('FORGE-SUMMARY: a\nFORGE-SUMMARY: 直した'), '直した');
});

await test('worker prompt carries the protocol, files and the last failure', () => {
  const p = E.workerPrompt({ id: 7, title: 't', prompt: 'do x', files: ['src/a.js'], feedback: 'tests failed: boom' }, { verify: 'npm test' }, { attempt: 2 });
  for (const want of ['方向づけ', 'npm test', 'src/a.js', 'tests failed: boom', 'FORGE-SUMMARY', 'git commit はしない']) assert.ok(p.includes(want), want);
});

// ------------------------------------------------------------------ end to end

if (!T.available()) {
  console.log('  skip end-to-end (tmux がない)');
} else {
  const bin = path.join(tmp, 'bin');
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(repo);
  const run = (cwd, cmd) => { const r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); return r.stdout.trim(); };
  run(repo, `git init -q -b main && printf '{"scripts":{"test":"node test.js"}}' > package.json
    echo 'module.exports=(a,b)=>a-b;' > add.js
    echo 'if(require("./add")(2,3)!==5){console.error("add(2,3) wrong");process.exit(1)}' > test.js
    git add -A && git -c user.name=t -c user.email=t@t commit -qm init`);
  const agent = (name, body) => { fs.writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body}\n`); fs.chmodSync(path.join(bin, name), 0o755); };
  agent('fx-cheap', 'sleep 0.3; echo "// tried" >> add.js; echo "FORGE-SUMMARY: 試した"');
  agent('fx-good', 'grep -q "通らなかった理由" "$1" && echo SAW_FEEDBACK; grep -q "審査役の指摘" "$1" && echo SAW_REVIEW; sleep 0.3; echo "module.exports=(a,b)=>a+b;" > add.js; echo "// v$RANDOM" >> add.js; echo "FORGE-SUMMARY: 直した"');
  agent('fx-hang', 'sleep 600');
  agent('fx-noop', 'echo nothing to do');
  // Reviewer rejects the first time it sees a card, approves the second time.
  agent('fx-rev', `f="${tmp}/rev-$(basename "$(pwd)")"; echo rogue > rogue.txt; if [ -e "$f" ]; then echo "VERDICT: APPROVE"; echo "- ok"; else touch "$f"; echo "VERDICT: REJECT"; echo "- テストを足して"; fi`);
  fs.mkdirSync(H, { recursive: true });
  fs.writeFileSync(path.join(H, 'config.json'), JSON.stringify({
    maxParallel: 3, runTimeoutMinutes: 0.05,
    tiers: { light: { agents: ['cheap'] }, standard: { agents: ['good'] }, heavy: { agents: ['good'] }, slow: { agents: ['hang'] }, noop: { agents: ['noop'] } },
    review: { when: 'free-only', agents: ['rev'] },
    agents: Object.fromEntries([['cheap', true], ['good', true], ['hang', true], ['noop', true], ['rev', false]].map(([id, free]) => [id, { label: id, bin: `fx-${id}`, free, dailyRuns: 50, cmd: `fx-${id} {prompt}` }])),
  }));

  async function until(pred, ms = 20000) {
    const t0 = Date.now();
    for (;;) {
      E.tick(H);
      const board = S.readBoard(H);
      if (pred(board)) return board;
      if (Date.now() - t0 > ms) throw new Error(`timeout: ${JSON.stringify(board.cards.map((c) => [c.id, c.status, c.failReason]))}`);
      await sleep(250);
    }
  }
  const card = (b, id) => S.findCard(b, id);

  await test('e2e: cheap fails tests → escalates → fixed → reviewer rejects → redone → approved → squash-merged', async () => {
    E.addRepo(H, { dir: repo, name: 'calc' });
    const c = E.addCard(H, { repo: 'calc', title: 'add を直す', prompt: 'add を足し算に', files: ['add.js'] });
    const b = await until((x) => card(x, c.id).status === 'review', 30000);
    const done = card(b, c.id);
    const kinds = done.attempts.map((a) => `${a.kind}:${a.agent}:${a.result}`);
    assert.deepEqual(kinds, ['run:cheap:fail', 'run:good:pass', 'review:rev:reject', 'run:good:pass', 'review:rev:approve']);
    assert.equal(done.tier, 'heavy', 'escalated twice (test fail, then reviewer reject)');
    assert.equal(done.attempts[0].reason, '検証失敗');
    const logs = fs.readdirSync(path.join(H, 'runs', String(c.id)));
    assert.match(fs.readFileSync(path.join(H, 'runs', String(c.id), logs.find((f) => f.startsWith('2-run') && f.endsWith('.log'))), 'utf8'), /SAW_FEEDBACK/);
    assert.match(fs.readFileSync(path.join(H, 'runs', String(c.id), logs.find((f) => f.startsWith('4-run') && f.endsWith('.log'))), 'utf8'), /SAW_REVIEW/);
    assert.ok(!fs.existsSync(path.join(done.worktree, 'rogue.txt')), "reviewer's edits are discarded");
    const before = Number(run(repo, 'git rev-list --count HEAD'));
    E.approve(H, c.id);
    assert.equal(Number(run(repo, 'git rev-list --count HEAD')), before + 1, 'squash: one commit lands on main');
    assert.equal(run(repo, 'node test.js && echo pass'), 'pass');
    assert.match(run(repo, 'git log -1 --format=%B'), /Forge #1/);
    assert.ok(!fs.existsSync(done.worktree), 'worktree removed');
    assert.equal(run(repo, `git branch --list '${done.branch}'`), '', 'branch removed');
  });

  await test('e2e: dependencies wait, parallel cards run in their own worktrees', async () => {
    const a = E.addCard(H, { repo: 'calc', title: 'A', prompt: 'x', tier: 'standard' });
    const z = E.addCard(H, { repo: 'calc', title: 'Z', prompt: 'x', tier: 'standard', deps: [a.id] });
    E.tick(H);
    let b = S.readBoard(H);
    assert.ok(['running', 'verifying', 'needs-review', 'reviewing'].includes(card(b, a.id).status));
    assert.equal(card(b, z.id).status, 'queued', 'Z waits for A');
    assert.notEqual(card(b, a.id).worktree, card(b, z.id).worktree);
    b = await until((x) => card(x, a.id).status === 'review', 30000);
    E.approve(H, a.id);
    await until((x) => !['queued'].includes(card(x, z.id).status), 10000);
  });

  await test('e2e: a hung agent times out and the card fails over', async () => {
    const c = E.addCard(H, { repo: 'calc', title: '止まる', prompt: 'x', tier: 'slow' });
    const b = await until((x) => card(x, c.id).attempts.some((a) => a.result === 'fail'), 15000);
    assert.equal(card(b, c.id).attempts[0].reason, '時間切れ');
    assert.ok(!T.has(card(b, c.id).attempts[0].session), 'tmux session killed');
    assert.ok(T.list().every((x) => x.name !== card(b, c.id).attempts[0].session && Number.isFinite(x.created)), 'list() parses');
    E.cancel(H, c.id);
  });

  await test('e2e: steering stops the run, keeps partial work, re-briefs, costs no attempt', async () => {
    agent('fx-slowfix', 'grep -q "人からの追加指示" "$1" && { echo "module.exports=(a,b)=>a+b;" > add.js; echo STEERED_OK; exit 0; }; echo "// partial" >> add.js; sleep 30');
    const cfg = JSON.parse(fs.readFileSync(path.join(H, 'config.json'), 'utf8'));
    cfg.tiers.steer = { agents: ['slowfix'] };
    cfg.agents.slowfix = { label: 'slowfix', bin: 'fx-slowfix', free: false, dailyRuns: 50, cmd: 'fx-slowfix {prompt}' };
    fs.writeFileSync(path.join(H, 'config.json'), JSON.stringify(cfg));
    const c = E.addCard(H, { repo: 'calc', title: '舵取り', prompt: 'x', tier: 'steer' });
    await until((x) => card(x, c.id).status === 'running');
    const wt = card(S.readBoard(H), c.id).worktree;
    for (let i = 0; i < 20 && !fs.readFileSync(path.join(wt, 'add.js'), 'utf8').includes('partial'); i++) await sleep(100);
    E.steer(H, c.id, '足し算にして終わって');
    assert.equal(card(S.readBoard(H), c.id).status, 'queued');
    const b = await until((x) => card(x, c.id).status === 'review', 15000);
    const k = card(b, c.id);
    assert.deepEqual(k.attempts.filter((a) => a.kind === 'run').map((a) => a.result), ['steered', 'pass']);
    assert.equal(k.tier, 'steer', 'steering does not escalate');
    assert.equal(k.maxAttempts, 4, 'steering refunds the attempt');
    assert.throws(() => E.steer(H, c.id, 'x'), /実行中ではありません/);
    E.cancel(H, c.id, { purge: true });
  });

  await test('e2e: an agent that changes nothing does not pass', async () => {
    const c = E.addCard(H, { repo: 'calc', title: '何もしない', prompt: 'x', tier: 'noop' });
    const b = await until((x) => card(x, c.id).attempts.length >= 1 && card(x, c.id).attempts[0].result === 'fail', 15000);
    assert.equal(card(b, c.id).attempts[0].reason, '変更なし');
    E.cancel(H, c.id, { purge: true });
    assert.equal(S.findCard(S.readBoard(H), c.id), null);
  });

  await test('e2e: approve refuses a dirty main checkout', async () => {
    const c = E.addCard(H, { repo: 'calc', title: 'dirty', prompt: 'x', tier: 'standard' });
    await until((x) => card(x, c.id).status === 'review', 30000);
    fs.appendFileSync(path.join(repo, 'test.js'), '\n// local edit\n');
    assert.throws(() => E.approve(H, c.id), /未コミット/);
    run(repo, 'git checkout -- test.js');
    E.approve(H, c.id);
  });

  await test('mcp: the lead can split work into dependent cards but cannot merge', async () => {
    const { startMcp } = await import('./lib/mcp.mjs');
    const input = new PassThrough();
    const output = new PassThrough();
    const replies = [];
    output.on('data', (d) => String(d).split('\n').filter(Boolean).forEach((l) => replies.push(JSON.parse(l))));
    startMcp(H, input, output);
    const rpc = (id, method, params) => input.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    rpc(1, 'initialize', { protocolVersion: '2025-06-18' });
    rpc(2, 'tools/list');
    rpc(3, 'tools/call', { name: 'forge_add_cards', arguments: { repo: 'calc', cards: [{ title: 'schema', prompt: 'p' }, { title: 'api', prompt: 'p', after: ['@1'] }] } });
    rpc(4, 'tools/call', { name: 'forge_approve', arguments: { id: 1 } });
    await sleep(300);
    const by = Object.fromEntries(replies.map((r) => [r.id, r]));
    const names = by[2].result.tools.map((t) => t.name);
    assert.ok(names.includes('forge_add_cards') && names.includes('forge_steer') && !names.includes('forge_approve') && !names.some((n) => /cancel|merge/.test(n)));
    const [first, second] = by[3].result.structuredContent.created;
    assert.deepEqual(S.findCard(S.readBoard(H), second).deps, [first], '"@1" resolves to the card made in the same call');
    assert.equal(by[4].error.code, -32602);
    for (const id of [first, second]) E.cancel(H, id, { purge: true });
  });

  await test('server: token required; board and actions over HTTP', async () => {
    const { createServer } = await import('./lib/server.mjs');
    const { server, secret } = createServer(H, { autoTick: false });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      assert.equal((await fetch(`${base}/api/board`)).status, 401);
      assert.equal((await fetch(`${base}/api/board?t=wrong-${secret}`)).status, 401);
      const board = await (await fetch(`${base}/api/board?t=${secret}`)).json();
      assert.ok(board.cards.length >= 1 && board.repos[0].name === 'calc');
      assert.ok(!JSON.stringify(board).includes(H), 'no local paths leak to the page');
      const add = await fetch(`${base}/api/add?t=${secret}`, { method: 'POST', body: JSON.stringify({ repo: 'calc', title: 'from web', hold: true }) });
      const id = (await add.json()).result.id;
      assert.equal(S.findCard(S.readBoard(H), id).status, 'backlog');
      const bad = await fetch(`${base}/api/approve?t=${secret}`, { method: 'POST', body: JSON.stringify({ id }) });
      assert.equal(bad.status, 400, 'cannot approve a card that is not awaiting review');
      assert.equal((await fetch(`${base}/?t=${secret}`)).headers.get('content-type'), 'text/html; charset=utf-8');
    } finally {
      server.close();
    }
  });

  await test('store: concurrent writers never lose a card', async () => {
    const script = `import('${path.join(path.dirname(new URL(import.meta.url).pathname), 'lib', 'engine.mjs')}').then((E) => { for (let i = 0; i < 15; i++) E.addCard(process.env.FORGE_HOME, { repo: 'calc', title: 'p' + process.argv[1] + '-' + i, hold: true }); });`;
    const before = S.readBoard(H).cards.length;
    const { spawn } = await import('node:child_process');
    await Promise.all([1, 2, 3, 4].map((n) => new Promise((resolve) => {
      const p = spawn(process.execPath, ['--input-type=module', '-e', script, String(n)], { env: process.env, stdio: ['ignore', 'ignore', 'inherit'] });
      p.on('exit', resolve);
    })));
    const board = S.readBoard(H);
    assert.equal(board.cards.length, before + 60);
    assert.equal(new Set(board.cards.map((c) => c.id)).size, board.cards.length, 'ids unique');
  });

  spawnSync('tmux', ['-L', process.env.FORGE_TMUX_SOCKET, 'kill-server']);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
