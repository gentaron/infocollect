// Forge as an MCP server, so the top agent (Claude Code) can act as the lead:
// split a job into cards, hand them to the free agents, read their output,
// send work back with notes — while merging stays a human decision.
//
//   claude mcp add forge -- node /path/to/infocollect/forge/forge.mjs mcp
//
// Deliberately NOT exposed: approve (merge) and cancel. Those are yours.

import readline from 'node:readline';

import * as E from './engine.mjs';
import * as G from './git.mjs';
import { findCard, loadConfig, readBoard } from './store.mjs';
import { snapshot } from './server.mjs';

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const TOOLS = [
  {
    name: 'forge_board',
    description: 'Forge のボード（全リポジトリのカード、状態、使ったエージェント、失敗理由、審査結果）と、使えるエージェント・今日の残り回数を返す。',
    inputSchema: { type: 'object', properties: { repo: { type: 'string', description: 'このリポジトリのカードだけ' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'forge_add_cards',
    description: [
      '作業をカードにして、無料のエージェントに配る。大きな仕事は、1枚で完結する小さなカードに割ってから渡すこと。',
      'tier: light=定型・小修正（無料の小さいモデル）/ standard=ふつうの実装 / heavy=難所（上位エージェント）。迷ったら light。落ちたら Forge が自動で一段上げる。',
      'after に先行カードの番号を入れると、それが完了してから始まる（ブランチは先行の結果を含まない点に注意。依存する変更は1枚にまとめるのが安全）。',
      'files に主に触るファイルを書くと、エージェントはそこから読み始める（トークンの節約）。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: '登録済みのリポジトリ名' },
        cards: {
          type: 'array', minItems: 1, maxItems: 12,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              prompt: { type: 'string', description: '何を、どこまで、完成の条件。具体的なほど安いエージェントで通る' },
              tier: { type: 'string', enum: ['light', 'standard', 'heavy'], default: 'light' },
              files: { type: 'array', items: { type: 'string' } },
              after: { type: 'array', items: { type: ['integer', 'string'] }, description: '先に終わっているべきカード番号。同じ呼び出しで作るカードは "@1" のように 1 始まりの位置でも指せる' },
              kb: { type: 'boolean', description: 'InfoCollect のナレッジベースから資料を添える' },
            },
            required: ['title', 'prompt'],
          },
        },
      },
      required: ['repo', 'cards'],
    },
  },
  {
    name: 'forge_peek',
    description: 'カードの今の画面（実行中なら tmux の画面、終わっていればログの最後）を返す。',
    inputSchema: { type: 'object', properties: { id: { type: 'integer' }, lines: { type: 'integer', default: 80 } }, required: ['id'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'forge_diff',
    description: 'カードのブランチの差分を返す（審査用）。',
    inputSchema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'forge_send_back',
    description: '承認待ち・失敗のカードを、直してほしい点をつけて差し戻す。エージェントは指摘を読んでやり直す。マージ（承認）は人がするのでここではできない。',
    inputSchema: { type: 'object', properties: { id: { type: 'integer' }, note: { type: 'string' } }, required: ['id', 'note'] },
  },
  {
    name: 'forge_steer',
    description: '実行中のカードを止めて、指示を足してやり直させる（途中の変更は worktree に残る。試行回数は減らない）。方向がずれていると forge_peek で分かったときに使う。',
    inputSchema: { type: 'object', properties: { id: { type: 'integer' }, text: { type: 'string' } }, required: ['id', 'text'] },
  },
  {
    name: 'forge_tick',
    description: 'ボードを1回進める（終わったものを検証・審査し、空きがあれば次を始める）。forge serve / watch が動いていれば不要。',
    inputSchema: { type: 'object', properties: {} },
  },
];

function call(h, name, a = {}) {
  switch (name) {
    case 'forge_board': {
      const s = snapshot(h);
      const cards = s.cards.filter((c) => !a.repo || c.repo === a.repo).map(({ prompt, ...c }) => ({ ...c, prompt: prompt.slice(0, 200) }));
      return { repos: s.repos, agents: s.agents, cards };
    }
    case 'forge_add_cards': {
      const made = [];
      for (const c of a.cards || []) {
        const deps = (c.after || []).map((d) => {
          const m = String(d).match(/^@(\d+)$/);
          return m ? made[Number(m[1]) - 1] : Number(d);
        }).filter(Boolean);
        const card = E.addCard(h, { repo: a.repo, title: c.title, prompt: c.prompt, tier: c.tier || 'light', files: c.files || [], deps, kb: !!c.kb });
        made.push(card.id);
      }
      return { created: made, hint: 'forge serve か forge watch が動いていれば自動で始まる。動いていなければ forge_tick を呼ぶ。' };
    }
    case 'forge_peek': return E.peek(h, a.id, Math.min(400, a.lines || 80));
    case 'forge_diff': {
      const board = readBoard(h);
      const card = findCard(board, a.id);
      if (!card) throw new Error(`#${a.id} がありません`);
      return { text: G.diffText(board.repos[card.repo].path, card.branch, card.base) };
    }
    case 'forge_send_back': E.reject(h, a.id, a.note); return { ok: true };
    case 'forge_steer': E.steer(h, a.id, a.text); return { ok: true };
    case 'forge_tick': return E.tick(h);
    default: throw Object.assign(new Error(`unknown tool ${name}`), { code: -32602 });
  }
}

export function startMcp(h, input = process.stdin, output = process.stdout) {
  const send = (o) => output.write(`${JSON.stringify(o)}\n`);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
    const { id, method, params } = msg;
    try {
      let result;
      if (method === 'initialize') {
        result = {
          protocolVersion: VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'forge', version: '1.0.0' },
          instructions: `あなたは開発リーダー。大きな仕事は forge_add_cards で小さなカードに割って無料のエージェントに配り、forge_board / forge_peek / forge_diff で進み具合と出来を確かめ、ダメなら forge_send_back で具体的に差し戻す。マージは人が承認する。tier は ${Object.keys(loadConfig(h).tiers).join(' / ')}。`,
        };
      } else if (method === 'ping') result = {};
      else if (method === 'tools/list') result = { tools: TOOLS };
      else if (method === 'tools/call') {
        try {
          const data = call(h, params?.name, params?.arguments);
          const text = typeof data?.text === 'string' ? data.text : JSON.stringify(data, null, 2);
          result = { content: [{ type: 'text', text }], structuredContent: data, isError: false };
        } catch (error) {
          if (error.code === -32602) throw error;
          result = { content: [{ type: 'text', text: `エラー: ${error.message}` }], isError: true };
        }
      } else if (id === undefined) return undefined;
      else throw Object.assign(new Error(`method not found: ${method}`), { code: -32601 });
      if (id !== undefined) send({ jsonrpc: '2.0', id, result });
    } catch (error) {
      if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: error.code || -32603, message: error.message } });
    }
    return undefined;
  });
  return rl;
}
