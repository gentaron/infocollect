// Ecosystem kit — pure functions, no I/O. From the registry (ecosystem/registry.json)
// it renders what each repository needs to be "linked":
//
//   ecosystem.json   machine-readable: role, upstream/downstream, hub endpoints
//   AGENTS.md block  what an AI working in this repo must know about its neighbours
//   README block     the same for people, with links
//   .mcp.json        the hub's knowledge base + Forge, merged into existing servers
//
// Every text block lives between markers and is replaced wholesale on rerun,
// so propagation is idempotent and never touches anything outside its markers.

export const BEGIN = '<!-- ecosystem:begin (自動生成: gentaron/infocollect の ecosystem/registry.json から。手で直さない) -->';
export const END = '<!-- ecosystem:end -->';
export const KB_URL = 'https://raw.githubusercontent.com/gentaron/infocollect/HEAD/docs/kb';
export const HUB_PKG = 'github:gentaron/infocollect';

const gh = (owner, name) => `https://github.com/${owner}/${name}`;

/** Case-insensitive lookup (GitHub names are case-insensitive, clone dirs are lowercase). */
export function findRepo(registry, name) {
  const key = String(name).toLowerCase();
  return registry.repos.find((r) => r.name.toLowerCase() === key) || null;
}

/** Who feeds this repo, who it feeds, its island, and what replaced it. */
export function relations(registry, name) {
  const me = findRepo(registry, name);
  if (!me) throw new Error(`registry に ${name} がありません`);
  const live = registry.repos.filter((r) => r.status !== 'archive' && r.name !== me.name);
  const upstream = [];
  for (const flow of me.consumes || []) {
    for (const r of live) if ((r.produces || []).includes(flow)) upstream.push({ repo: r.name, flow });
  }
  const downstream = [];
  for (const flow of me.produces || []) {
    for (const r of live) if ((r.consumes || []).includes(flow)) downstream.push({ repo: r.name, flow });
  }
  const siblings = live.filter((r) => r.group === me.group).map((r) => r.name);
  const predecessors = registry.repos.filter((r) => r.successor === me.name).map((r) => r.name);
  return { me, upstream, downstream, siblings, predecessors, successor: me.successor || null };
}

/** Group upstream/downstream entries by repo: [{repo, flows:[...]}]. */
function byRepo(list) {
  const m = new Map();
  for (const { repo, flow } of list) {
    if (!m.has(repo)) m.set(repo, new Set());
    m.get(repo).add(flow);
  }
  return [...m].map(([repo, flows]) => ({ repo, flows: [...flows] }));
}

export function manifest(registry, name) {
  const { me, upstream, downstream, siblings, predecessors, successor } = relations(registry, name);
  const owner = registry.owner;
  return {
    $schema: 'https://raw.githubusercontent.com/gentaron/infocollect/HEAD/ecosystem/schema.json',
    schema: 1,
    name: me.name,
    group: me.group,
    groupLabel: registry.groups[me.group]?.label || me.group,
    status: me.status,
    role: me.role,
    stack: me.stack || '',
    site: me.site || undefined,
    produces: me.produces || [],
    consumes: me.consumes || [],
    upstream: byRepo(upstream).map((u) => ({ ...u, url: gh(owner, u.repo) })),
    downstream: byRepo(downstream).map((d) => ({ ...d, url: gh(owner, d.repo) })),
    siblings,
    successor: successor || undefined,
    predecessors: predecessors.length ? predecessors : undefined,
    hub: {
      repo: gh(owner, registry.hub),
      map: `${gh(owner, registry.hub)}/blob/HEAD/ecosystem/README.md`,
      kb: KB_URL,
      mcp: ['infocollect-kb', 'forge'],
    },
  };
}

const flowLabel = (registry, flows) => flows.map((f) => registry.flows[f] || f).join('・');
const link = (registry, repo) => `[${repo}](${gh(registry.owner, repo)})`;

export function readmeBlock(registry, name) {
  const m = manifest(registry, name);
  const lines = [BEGIN, '', '## つながり', ''];
  if (m.status === 'archive') {
    lines.push(`このリポジトリは**アーカイブ**（試作・学習用）。${m.successor ? `新しい作業は ${link(registry, m.successor)} で。` : '新しい作業はここではしない。'}`, '');
  } else {
    lines.push(`gentaron のリポジトリ群のうち **${m.groupLabel}** の一つ。${m.role}。`, '');
    if (m.upstream.length) lines.push(`- **受け取る**: ${m.upstream.map((u) => `${link(registry, u.repo)}（${flowLabel(registry, u.flows)}）`).join('、')}`);
    if (m.downstream.length) lines.push(`- **渡す**: ${m.downstream.map((d) => `${link(registry, d.repo)}（${flowLabel(registry, d.flows)}）`).join('、')}`);
    const sib = m.siblings.filter((s) => !m.upstream.some((u) => u.repo === s) && !m.downstream.some((d) => d.repo === s));
    if (sib.length) lines.push(`- **同じ島**: ${sib.map((s) => link(registry, s)).join('、')}`);
    if (m.predecessors?.length) lines.push(`- **前身**: ${m.predecessors.map((p) => link(registry, p)).join('、')}`);
    lines.push('');
  }
  lines.push(`全体の地図 → [ecosystem](${m.hub.map})`, '', END);
  return lines.join('\n');
}

export function agentsBlock(registry, name) {
  const m = manifest(registry, name);
  const up = m.upstream.map((u) => `${u.repo}（${flowLabel(registry, u.flows)}）`).join('、') || 'なし';
  const down = m.downstream.map((d) => `${d.repo}（${flowLabel(registry, d.flows)}）`).join('、') || 'なし';
  return [
    BEGIN,
    '',
    '## エコシステム（このリポジトリの外側）',
    '',
    m.status === 'archive'
      ? `- アーカイブ。新しい機能はここに足さない${m.successor ? `。後継は gentaron/${m.successor}` : ''}。`
      : `- 役割: ${m.role}（${m.groupLabel}）`,
    `- 上流（ここが受け取るもの）: ${up}`,
    `- 下流（ここが渡すもの）: ${down}`,
    '- 渡しているもの（produces）の形を変えるときは、下流のリポジトリ名をコミットメッセージに書き、壊さない移行にする。',
    '- 調べ物は MCP の `infocollect-kb` を先に使う（`kb_search` / `kb_context`。毎日の AI 情報・論文・リリース・過去記事・全リポジトリの役割が入っている）。出典の URL を必ず添える。',
    '- 大きな作業は MCP の `forge` で小さなカードに割り、無料のエージェントに配る（`forge_add_cards`）。マージは人が承認する。',
    '- 進め方: 方向づけ → 作業ループ → 判断の記録 → 更新 → 完了。完了の前に、このリポジトリの検証コマンドが通ることを確かめる。',
    `- 全体の地図: ${m.hub.map}`,
    '',
    END,
  ].join('\n');
}

/** Replace the marked block, or append it (with one blank line) if absent. */
export function upsertBlock(text, block) {
  const src = String(text ?? '');
  const b = src.indexOf(BEGIN.slice(0, 22));
  const e = src.indexOf(END);
  if (b !== -1 && e !== -1 && e > b) return `${src.slice(0, b)}${block}${src.slice(e + END.length)}`;
  const body = src.replace(/\s+$/, '');
  return body ? `${body}\n\n${block}\n` : `${block}\n`;
}

export function mcpServers({ isHub = false } = {}) {
  if (isHub) {
    return {
      'infocollect-kb': { command: 'node', args: ['scripts/mcp/server.mjs'] },
      forge: { command: 'node', args: ['forge/forge.mjs', 'mcp'] },
    };
  }
  return {
    'infocollect-kb': { command: 'npx', args: ['-y', '-p', HUB_PKG, 'infocollect-kb'], env: { INFOCOLLECT_KB_URL: KB_URL } },
    forge: { command: 'npx', args: ['-y', '-p', HUB_PKG, 'forge', 'mcp'] },
  };
}

/** Merge our servers into an existing .mcp.json without dropping anything the repo already has. */
export function mergeMcp(existingText, servers) {
  let base = {};
  if (existingText && existingText.trim()) {
    try {
      base = JSON.parse(existingText);
    } catch {
      throw new Error('.mcp.json が JSON として読めません（手で直してから再実行）');
    }
  }
  const out = { ...base, mcpServers: { ...(base.mcpServers || {}) } };
  for (const [k, v] of Object.entries(servers)) out.mcpServers[k] = v;
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** Markdown map of everything, for the hub (renders on GitHub without Pages). */
export function mapMarkdown(registry) {
  const lines = [
    '# gentaron のエコシステム',
    '',
    `公開リポジトリ ${registry.repos.length} 本の地図。正本は [registry.json](./registry.json)。各リポジトリの「つながり」節と ecosystem.json はここから生成している（\`node scripts/ecosystem/propagate.mjs\`）。`,
    '',
    '## 流れ',
    '',
    '```mermaid',
    'flowchart LR',
  ];
  const live = registry.repos.filter((r) => r.status !== 'archive');
  const id = (n) => `r_${n.replace(/[^a-zA-Z0-9]/g, '_')}`;
  for (const [g, meta] of Object.entries(registry.groups)) {
    if (g === 'archive') continue;
    const members = live.filter((r) => r.group === g);
    if (!members.length) continue;
    lines.push(`  subgraph g_${g}["${meta.label}"]`);
    for (const r of members) lines.push(`    ${id(r.name)}["${r.name}"]`);
    lines.push('  end');
  }
  const edges = new Set();
  for (const r of live) {
    for (const flow of r.consumes || []) {
      for (const p of live) if ((p.produces || []).includes(flow) && p.name !== r.name) edges.add(`  ${id(p.name)} -->|${registry.flows[flow] || flow}| ${id(r.name)}`);
    }
  }
  lines.push(...[...edges].sort(), '```', '');
  for (const [g, meta] of Object.entries(registry.groups)) {
    const members = registry.repos.filter((r) => r.group === g);
    if (!members.length) continue;
    lines.push(`## ${meta.label}`, '', meta.about, '', '| リポジトリ | 役割 | 受け取る | 渡す |', '| --- | --- | --- | --- |');
    for (const r of members) {
      if (g === 'archive') {
        lines.push(`| [${r.name}](${gh(registry.owner, r.name)}) | ${r.role} | | ${r.successor ? `後継 → [${r.successor}](${gh(registry.owner, r.successor)})` : ''} |`);
      } else {
        const rel = relations(registry, r.name);
        lines.push(`| [${r.name}](${gh(registry.owner, r.name)}) | ${r.role} | ${[...new Set(rel.upstream.map((u) => u.repo))].join(', ')} | ${[...new Set(rel.downstream.map((d) => d.repo))].join(', ')} |`);
      }
    }
    lines.push('');
  }
  lines.push('## 全リポジトリ共通の道具', '', '- **ナレッジベース**（MCP `infocollect-kb`）: 調べ物はまずここ。各リポジトリの役割もここに入っている', '- **Forge**（MCP `forge`）: 大きな作業をカードに割って無料のエージェントへ。マージは人', '- **AGENTS.md の「エコシステム」節**: AI が作業前に読む、そのリポジトリの上流・下流', '');
  return lines.join('\n');
}

/** Pure validation used by the selftest and by propagate before writing anything. */
export function validate(registry) {
  const errors = [];
  const names = new Set();
  for (const r of registry.repos) {
    const k = r.name.toLowerCase();
    if (names.has(k)) errors.push(`重複: ${r.name}`);
    names.add(k);
    if (!registry.groups[r.group]) errors.push(`${r.name}: 未知の group "${r.group}"`);
    for (const f of [...(r.produces || []), ...(r.consumes || [])]) if (!registry.flows[f]) errors.push(`${r.name}: 未知の flow "${f}"`);
    if (r.successor && !names.has(r.successor.toLowerCase()) && !registry.repos.some((x) => x.name === r.successor)) errors.push(`${r.name}: 後継 "${r.successor}" が台帳にない`);
    if (r.status === 'archive' && r.group !== 'archive') errors.push(`${r.name}: archive なのに group が ${r.group}`);
  }
  for (const r of registry.repos) for (const f of r.consumes || []) {
    if (!registry.repos.some((p) => p.status !== 'archive' && (p.produces || []).includes(f))) errors.push(`${r.name}: "${f}" を作るリポジトリがない`);
  }
  return errors;
}
