# Forge — AI開発のカンバン（tmux の上で動く）

AIプログラマーを何人も雇っている状態を、手元の PC だけで作る道具。

- **カンバン**が仕事の管理表
- **tmux** が作業部屋（カードごとに1部屋）
- **エージェント**（Qwen Code / Gemini CLI / OpenCode / Aider / Claude Code）がプログラマー

無料のエージェントに先に働いてもらい、通らなかったときだけ上の段に回す。最後は人が見てマージする。依存パッケージはゼロで、Node 20 以上と tmux と git があれば動く（Linux / macOS / Android の Termux）。

```
カード ──▶ 無料エージェント（light）──テスト×──▶ 一段上（standard）──テスト×──▶ Claude Code（heavy）
                 │テスト○                          │テスト○                         │
                 ▼                                 ▼                                ▼
            Claude Code が審査 ──差し戻し──▶ 指摘を読んでやり直し（試行は最大3回）
                 │OK
                 ▼
            承認待ち ──人が「承認」──▶ 1コミットにまとめて main へ（失敗した試行の残骸は残らない）
```

## 何が賢いか

| 仕組み | 何のため |
| --- | --- |
| **カードごとに git worktree と専用ブランチ** | 何人並べても、互いのファイルを踏まない。本体のチェックアウトは触らない |
| **カードごとの tmux セッション**（専用ソケット `tmux -L forge`） | 実行中の画面をいつでも覗ける・入れる。自分の tmux とは混ざらない |
| **安い順に試して、落ちたら一段上へ** | 無料枠を「使い切る」のではなく、難しいものにだけ上位の力を使う |
| **同じエージェントで二度失敗しない** | 失敗したエージェントは次の試行で後回し |
| **失敗理由を次の試行に渡す** | テストの出力の最後や審査の指摘を、そのままプロンプトに入れる |
| **決定論の検証が先、AIの審査が後** | `npm test` などで落とせるものは機械で落とす。通ったものだけ別のエージェントが審査 |
| **審査役は書き手と別のエージェント** | 同じ癖で見逃すのを防ぐ。審査役がファイルを書き換えても全部捨てる |
| **最終判断は人** | マージは `approve` だけ。本体に未コミットの変更があれば止まる |
| **1カード＝1コミット** | squash で着地するので、履歴にエージェントの試行錯誤が残らない |
| **1日の回数上限** | エージェントごとに。上限に来たら次のエージェントへ |
| **止まったら自動で拾う** | 時間切れ・セッション消失・途中で落ちた処理を、次の tick で検出して続ける |
| **触るファイルを指定できる** | エージェントはそこから読み始める（トークンの節約） |
| **ナレッジベースの資料を添えられる** | `--kb` で InfoCollect の KB から関連資料を予算内で同梱 |

## 入れる

```bash
# Linux
sudo apt install tmux git nodejs
# macOS
brew install tmux git node
# Android (Termux)
pkg install tmux git nodejs
```

```bash
git clone https://github.com/gentaron/infocollect ~/infocollect
alias forge="node ~/infocollect/forge/forge.mjs"
```

エージェントは、入れてあるものだけが使われる（`forge agents` で確認）。どれも無料枠かサブスクで動く。

| エージェント | 役 | 入れ方の例 |
| --- | --- | --- |
| Qwen Code | 無料・ふつうの実装 | `npm i -g @qwen-code/qwen-code` |
| Gemini CLI | 無料・ふつうの実装 | `npm i -g @google/gemini-cli` |
| OpenCode | 無料モデルで小さな修正 | `npm i -g opencode-ai` |
| Aider | OpenRouter の `:free` モデル | `pipx install aider-chat` |
| Claude Code | 上位。難所と審査 | `npm i -g @anthropic-ai/claude-code` |

**権限について**: Claude Code は「編集は自動・シェルはテストと差分確認だけ」で動かす。Gemini CLI と Qwen Code は無人で動かすために `--yolo`（全部自動で許可）で起動するので、**そのカードの worktree の中で任意のコマンドを実行できる**。秘密情報のあるリポジトリや、信用できない依頼文には使わないこと。気になるなら `~/.forge/config.json` で `tiers` から外す。

コマンドの形（フラグ）は各ツールの版で変わることがある。`forge.config.json` の `cmd` は `~/.forge/config.json` で上書きできるので、合わなければそこで直す。

## 使う

```bash
forge repo scan ~/code                    # その下のリポジトリをまとめて登録（package.json に test があれば検証に使う）
forge repo add ~/code/genesisvault --verify "bun run verify"

forge add genesisvault "記事リントの誤検出を直す" \
  -m "content-lint が全角スペースを誤検出する。テストを足して直す" \
  --files src/lib/pipeline/content-lint.ts --tier light

forge serve        # Web のボードを開いて、自動で進める（画面の URL にトークン付き）
```

ブラウザなしなら `forge watch`（進め続ける）か `forge tick`（1回だけ。cron 向け）。

| よく使う | |
| --- | --- |
| `forge ls` | ボード |
| `forge peek 3` | #3 の今の画面かログの最後 |
| `forge attach 3` | #3 の tmux に入る（抜けるのは `Ctrl-b d`） |
| `forge steer 3 "テストも足して"` | 実行中の作業を止め、指示を足してやり直させる（途中の変更は残る。試行回数は減らない） |
| `forge diff 3` / `forge approve 3` / `forge reject 3 "理由"` | 見る／マージ／差し戻し |
| `forge sync infocollect` | GitHub の `forge` ラベルの Issue をカードに取り込む（承認時に Issue を閉じる） |
| `forge log` | 出来事の記録 |

### スマホから

`forge serve --host 0.0.0.0` で同じ Wi-Fi や Tailscale から開ける。画面はスマホ幅で縦に並ぶ。URL のトークンを知っている人はエージェントを動かせるので、共有しないこと。

### Claude Code をリーダーにする

```bash
claude mcp add forge -- node ~/infocollect/forge/forge.mjs mcp
```

Claude Code に「この機能を作って」と頼むと、仕事を小さなカードに割って無料のエージェントに配る（`forge_add_cards`）。進み具合を見て（`forge_board` / `forge_peek` / `forge_diff`）、ダメなら具体的に差し戻す（`forge_send_back` / `forge_steer`）。**マージと取り消しは MCP から呼べない**ので、最後は必ず人が決める。

## 置き場所

```
~/.forge/
  board.json        カードとリポジトリ（今の状態）
  events.jsonl      出来事の記録（追記だけ）。1日の回数上限もここから数える
  config.json       あなたの上書き設定（任意）
  token             Web ボードのトークン
  runs/<id>/        試行ごとのプロンプト・実行スクリプト・ログ・検証ログ
  wt/<repo>/<id>/   カードの worktree
```

`FORGE_HOME` で場所を変えられる。

## テスト

```bash
node forge/test.mjs
```

本物の tmux と、小さな偽エージェント（bash スクリプト）で、次の15項目を確かめる。

- 失敗からの昇格
- 審査役の差し戻しと、そこからのやり直し
- 審査役の書き換えを捨てること
- 1コミットへのまとめ
- 依存関係と並列実行
- 時間切れ
- 「変更なし」を合格にしないこと
- 本体が汚れているときの承認拒否
- 舵取り（steer）
- MCP からの分配
- Web のトークン
- 同時書き込みでカードが消えないこと
