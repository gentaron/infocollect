// tmux on a private socket (`tmux -L forge`), so Forge never touches your own
// sessions and `tmux -L forge ls` shows exactly what Forge is running.
// Every call is a short synchronous spawn: no daemons, no node-pty, works the
// same on Linux, macOS and Termux.

import { spawnSync } from 'node:child_process';

export const SOCKET = process.env.FORGE_TMUX_SOCKET || 'forge';

function tmux(args, { input } = {}) {
  const res = spawnSync('tmux', ['-L', SOCKET, ...args], { encoding: 'utf8', input, timeout: 15000 });
  if (res.error) throw new Error(`tmux を起動できません: ${res.error.message}（tmux を入れてください: apt/brew/pkg install tmux）`);
  return { ok: res.status === 0, out: res.stdout || '', err: res.stderr || '' };
}

export function available() {
  try {
    return spawnSync('tmux', ['-V'], { encoding: 'utf8' }).status === 0;
  } catch {
    return false;
  }
}

/** Single-quote for bash. */
export const sh = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

export function has(name) {
  return tmux(['has-session', '-t', `=${name}`]).ok;
}

/**
 * Start a detached session running `script` (a file path) with bash.
 * remain-on-exit keeps the pane after the agent finishes, so you can still
 * attach and read the end of a run.
 */
export function start(name, cwd, script, { width = 220, height = 50 } = {}) {
  if (has(name)) kill(name);
  const r = tmux(['new-session', '-d', '-s', name, '-x', String(width), '-y', String(height), '-c', cwd, `bash ${sh(script)}`]);
  if (!r.ok) throw new Error(`tmux new-session 失敗: ${r.err.trim()}`);
  tmux(['set-option', '-t', `=${name}`, 'remain-on-exit', 'on']);
  return name;
}

export function kill(name) {
  return tmux(['kill-session', '-t', `=${name}`]).ok;
}

/** Last `lines` lines of what is on the pane right now (TUI-friendly). */
export function capture(name, lines = 60) {
  const r = tmux(['capture-pane', '-p', '-J', '-t', `=${name}:`, '-S', `-${lines}`]);
  return r.ok ? r.out.replace(/\s+$/, '') : '';
}

/** Type into a running agent (follow-up instructions to an interactive CLI). */
export function send(name, text, { enter = true } = {}) {
  const r = tmux(['send-keys', '-t', `=${name}:`, '-l', text]);
  if (enter) tmux(['send-keys', '-t', `=${name}:`, 'Enter']);
  return r.ok;
}

export function list() {
  // Not a tab: tmux 3.4 rewrites control characters in -F output.
  const r = tmux(['list-sessions', '-F', '#{session_name}|#{session_created}|#{pane_dead}']);
  if (!r.ok) return [];
  return r.out.trim().split('\n').filter(Boolean).map((line) => {
    const [name, created, dead] = line.split('|');
    return { name, created: Number(created) * 1000, dead: dead === '1' };
  });
}

export const attachCommand = (name) => `tmux -L ${SOCKET} attach -t ${name}`;
