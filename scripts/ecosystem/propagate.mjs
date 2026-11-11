#!/usr/bin/env node
// Link repositories into the ecosystem. Idempotent: run it as often as you like.
//
//   node scripts/ecosystem/propagate.mjs ~/code/IDEAZ ~/code/genesisvault ...   # write the link files
//   node scripts/ecosystem/propagate.mjs --scan ~/code                         # every git repo under a folder
//   node scripts/ecosystem/propagate.mjs --check ~/code/IDEAZ                   # exit 1 if out of date
//   node scripts/ecosystem/propagate.mjs --map                                 # rebuild ecosystem/README.md here
//
// Writes, per repository: ecosystem.json, the "つながり" block in README.md,
// the "エコシステム" block in AGENTS.md (or CLAUDE.md), CLAUDE.md → @AGENTS.md
// when there is no CLAUDE.md, and merges the hub's MCP servers into .mcp.json.
// Nothing outside the marked blocks is ever modified.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { agentsBlock, findRepo, manifest, mapMarkdown, mcpServers, mergeMcp, readmeBlock, upsertBlock, validate } from './kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadRegistry(file = path.join(ROOT, 'ecosystem', 'registry.json')) {
  const registry = JSON.parse(fs.readFileSync(file, 'utf8'));
  const errors = validate(registry);
  if (errors.length) throw new Error(`registry が不正:\n  ${errors.join('\n  ')}`);
  return registry;
}

/** owner/name from the origin URL (https or ssh), falling back to the folder name. */
export function repoName(dir) {
  const r = spawnSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8' });
  const m = (r.stdout || '').trim().match(/[/:]([^/:]+)\/([^/]+?)(?:\.git)?$/);
  return m ? m[2] : path.basename(path.resolve(dir));
}

const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };

function sameJson(a, b) {
  try {
    const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
    return JSON.stringify(canon(JSON.parse(a))) === JSON.stringify(canon(JSON.parse(b)));
  } catch {
    return false;
  }
}

/** Compute the new contents for every file we own. Pure apart from reading. */
export function plan(registry, dir, name = repoName(dir)) {
  const me = findRepo(registry, name);
  if (!me) return { name, skipped: '台帳にない（registry.json に足すと対象になる）', files: [] };
  const isHub = me.name === registry.hub;
  const files = [];
  const want = (file, next) => {
    const full = path.join(dir, file);
    const prev = read(full);
    if (prev === next) return;
    // Repos run their own formatters (Biome, Prettier). For JSON, only the
    // content matters, so a reformatted file is not "out of date".
    if (prev !== null && file.endsWith('.json') && sameJson(prev, next)) return;
    files.push({ file, full, next, created: prev === null });
  };

  want('ecosystem.json', `${JSON.stringify(manifest(registry, me.name), null, 2)}\n`);

  const readme = read(path.join(dir, 'README.md'));
  want('README.md', upsertBlock(readme ?? `# ${me.name}\n\n${me.role}\n`, readmeBlock(registry, me.name)));

  const agents = read(path.join(dir, 'AGENTS.md'));
  const claude = read(path.join(dir, 'CLAUDE.md'));
  const block = agentsBlock(registry, me.name);
  if (agents !== null || claude === null) {
    want('AGENTS.md', upsertBlock(agents ?? `# ${me.name} — AI 作業メモ\n\n${me.role}\n`, block));
    if (claude === null) want('CLAUDE.md', '@AGENTS.md\n');
    else if (!/@AGENTS\.md/.test(claude)) want('CLAUDE.md', upsertBlock(claude, block));
  } else {
    want('CLAUDE.md', upsertBlock(claude, block));
  }

  want('.mcp.json', mergeMcp(read(path.join(dir, '.mcp.json')), mcpServers({ isHub })));
  return { name: me.name, files };
}

export function apply(p) {
  for (const f of p.files) fs.writeFileSync(f.full, f.next);
  return p.files.length;
}

function main() {
  const argv = process.argv.slice(2);
  const registry = loadRegistry();
  if (argv.includes('--map')) {
    fs.writeFileSync(path.join(ROOT, 'ecosystem', 'README.md'), `${mapMarkdown(registry)}`);
    console.log(`ecosystem/README.md を更新（${registry.repos.length} 本）`);
    return;
  }
  const check = argv.includes('--check');
  let dirs = argv.filter((a) => !a.startsWith('--'));
  const scan = argv.indexOf('--scan');
  if (scan !== -1) {
    const root = path.resolve(argv[scan + 1]);
    dirs = fs.readdirSync(root).map((d) => path.join(root, d)).filter((d) => fs.existsSync(path.join(d, '.git')));
  }
  if (!dirs.length) {
    console.error('使い方: propagate.mjs <repo-dir>... | --scan <dir> | --check <repo-dir> | --map');
    process.exit(2);
  }
  let stale = 0;
  for (const dir of dirs) {
    const p = plan(registry, dir);
    if (p.skipped) { console.log(`- ${p.name}: ${p.skipped}`); continue; }
    if (!p.files.length) { console.log(`✓ ${p.name}: 最新`); continue; }
    stale++;
    if (check) { console.log(`✗ ${p.name}: 古い（${p.files.map((f) => f.file).join(', ')}）`); continue; }
    apply(p);
    console.log(`↻ ${p.name}: ${p.files.map((f) => `${f.file}${f.created ? '（新規）' : ''}`).join(', ')}`);
  }
  if (check && stale) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`propagate: ${error.message}`);
    process.exit(1);
  }
}
