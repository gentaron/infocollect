# InfoCollect を「収集と記憶のハブ」にする設計

小さな道具を何本も作ってきた。収集は IDEAZ と InfoCollect の両方でやっていて、記事は InfoCollect・IDEAZ・Genesis Vault・Gentarog がそれぞれ書いている。
足りなかったのは **集めたものを溜めて、あとから引ける場所** と、**AI がそこを直接たたける口**。
この2つを InfoCollect に置いて、ほかのリポジトリはそこを読むだけにする。

全部、無料枠だけで回る。課金される口はひとつも無い。

---

## 全体像

```
                 ┌──────────────── 集める（毎朝 09:00 MYT, GitHub Actions） ────────────────┐
                 │ GitHub 検索 / Releases   RSS（各社・arXiv・Zenn・Qiita・セキュリティ）     │
                 │ Hacker News   Reddit（LocalLLaMA ほか）   Hugging Face（論文・急上昇モデル）│
                 └───────────────────────────────┬─────────────────────────────────────────┘
                                                 ▼
  scripts/collect.mjs ── 上位だけ ──▶ docs/data/latest.json（今日のダイジェスト / PWA）
                                                 │
  scripts/kb/ingest.mjs ── 全部 ──▶ docs/kb/shards/YYYY-MM.jsonl  ← 溜める（RAG の土台）
                                     docs/kb/manifest.json
                                     （任意）ベクトル: Cloudflare bge-m3 / Gemini embedding の無料枠
                                                 │
                 ┌───────────────────────────────┼──────────────────────────────────┐
                 ▼                               ▼                                  ▼
       ブログ5枠（RAG）                 MCP サーバー（stdio）                 PWA 検索 /kb/
   scripts/blog/generate.mjs        scripts/mcp/server.mjs              docs/kb/index.html
   関連30日分を予算内で同梱         Claude Code / Desktop / Cursor        端末内で BM25
   過去の自分の記事も見せる         から kb_search・kb_context           「AIに渡す形でコピー」
                                                 │
                                                 ▼
                   ほかのリポジトリは raw URL か MCP で読むだけ（下の「つなぎ方」）
```

### 検索の中身（`docs/kb/kb-core.js` 1枚）

- **BM25**。日本語は辞書を使わず文字 bigram、英字は単語。`qwen3.5-coder` は `qwen3.5` と `coder` でも当たる
- **日英の橋渡し**。「サーバー」→ server、「量子化」→ quantization / gguf のように、質問側だけを広げる（索引は生のまま）
- **ベクトル（任意）**。鍵があれば int8 に量子化して保存（4分の1の大きさ）。BM25 と **RRF** で混ぜる。モデル名を文書ごとに持っているので、乗り換えても空間が混ざらない
- **新しさの事前分布**。45日で半分の重み（0 にはしない。古い名作は残る）
- **多様性**。同じ GitHub リポジトリは2件まで。ほぼ同じタイトルは落とす
- **文脈予算**。`packContext` が文字数の上限を絶対に超えない引用付きテキストを作る。AI には必要な分だけ渡す

同じファイルを Node（パイプライン・MCP）とブラウザ（PWA）が読むので、**画面で見えている順位と AI が受け取る順位が同じ**。

---

## 無料枠の内訳

| 何を | どこで | 費用 |
| --- | --- | --- |
| 収集 | 公開 API と RSS（鍵不要） | 0 |
| 保存 | git に JSONL（月ごとのシャード、1年で数十MB） | 0 |
| ベクトル | Cloudflare Workers AI の無料枠（`@cf/baai/bge-m3`、日本語に強い）または Gemini の無料枠 | 0（1日300件まで） |
| 実行 | GitHub Actions（公開リポジトリ） | 0 |
| 配信 | GitHub Pages / Vercel Hobby | 0 |
| 検索 | 利用者の端末内 / 自分の PC の Node | 0 |

鍵が1本も無くても BM25 だけで全部動く。鍵は「あると賢くなる」だけ。

---

## つなぎ方（ほかのリポジトリから）

### 1. MCP（AI に直接使わせる）

```bash
# このリポジトリの中で Claude Code を開けば .mcp.json で自動的に見える
# よそのリポジトリから使うとき:
claude mcp add infocollect -e INFOCOLLECT_KB_URL=https://raw.githubusercontent.com/gentaron/infocollect/HEAD/docs/kb -- node /path/to/infocollect/scripts/mcp/server.mjs
```

| ツール | 使いどころ |
| --- | --- |
| `kb_search` | 調べ物。期間・ソース・種類・タグで絞れる |
| `kb_context` | 書く前の下調べ。文字数予算つきの引用ブロックがそのまま返る |
| `kb_get` | 1件の全フィールド |
| `kb_stats` | 件数・期間・ソース内訳 |
| `digest_latest` | 今朝のダイジェスト |

### 2. raw URL（パイプラインから読む）

Genesis Vault が IDEAZ の `memory/` を raw で取り寄せているのと同じやり方。

```
https://raw.githubusercontent.com/gentaron/infocollect/HEAD/docs/kb/manifest.json
https://raw.githubusercontent.com/gentaron/infocollect/HEAD/docs/kb/shards/2026-11.jsonl
```

`kb-core.js` も同じ場所にあるので、Bun / Node / Deno / Workers からそのまま `import` できる。

### リポジトリごとの寄せ方（次の段）

| リポジトリ | 今 | 寄せた後 |
| --- | --- | --- |
| **IDEAZ** | 毎朝 HN / Reddit / HF / GitHub / arXiv を自前で収穫 | 収穫は InfoCollect の KB を読むだけにする。IDEAZ は「選ぶ・型に埋める」に専念。既出判定も KB の `own` 文書で取れる |
| **Genesis Vault** | 12体が「外を見る」段で AI の話題を集める | 1段目を `kb_context` 相当（raw の JSONL + `kb-core.js`）に差し替え。Clef の審査は今のまま |
| **Gentarog** | 毎日の自動投稿 | 題材候補を KB から取る |
| **QAIZ / hazerader** | 相場・大気の独自データ | 将来、同じ JSONL 形式で日次の要約を KB に流すと、記事側から「今日の相場」「今日の空気」も引ける |

収集を1か所にまとめると、同じ API を何本ものリポジトリが毎朝たたく無駄が消えて、レート制限にも当たりにくくなる。

---

## 長い作業のときの約束（AI 向け）

`方向づけ → 作業ループ → 判断記録 → 更新 → 完了` の流れで動く。

1. **方向づけ**: `kb_stats` で手元の知識の範囲を確かめる。足りない話題は先に言う
2. **作業ループ**: `kb_search` で当たりをつけ、`kb_context` で予算内の資料だけを持つ。一次情報（GitHub・論文・公式）の URL があるものを優先
3. **判断記録**: 採用・不採用の理由を残す（ブログ枠なら LOGLINE、Genesis Vault なら selection-runs）
4. **更新**: 書いた記事は次の取り込みで KB に `own` として入る。次回の重複回避に効く
5. **完了**: `node scripts/selftest.mjs` が通ることを確かめる

---

## AIハーネス（`scripts/harness/`）

```
依頼（ブログ枠 / Issue カード / スライド）
        │  tier = light | standard | heavy | review
        ▼
  router.mjs ── config/harness.json の配車表を上から
        │        鍵なし・予算切れ・直前に失敗 は飛ばす／heavy 用の予約枠を守る
        ▼
  Worker（書き手）── 下書き
        ▼
  review.mjs ── ① 決定論 lint  ② 別会社モデルの審査役（JSON で判定）
        │        問題あり → 1回だけ差し戻し
        ▼
  保存 ＋ 台帳（usage/）＋ 審査記録（runs/）──▶ 同じ原稿からスライド（docs/slides/）
```

- **重要度でモデルを決める。** 軽い仕事は小さなモデル、記事本文だけ一番強い無料モデル。無料枠を「使い切る」のではなく「大事な仕事に残す」
- **上位に Claude を置く。** 設計や最終判断は Claude Code（MCP で KB を引ける）、量をこなす下働きは無料モデル。Issue カンバンがその受け渡し口
- **人が最後に見る。** 審査記録と台帳は全部 `memory/harness/` に平文で残るので、何が起きたかを後から短時間で確かめられる

---

## まだやっていないこと

- 動画・音声の生成はここには入れていない。スライドと同じく「原稿 → 別の形」の口として足すのが筋
- 本文の全文取得（ページを開いて読む）はしていない。今はフィードと API が返す要約まで
- ベクトルは無料枠を守るため1日300件まで。過去分はゆっくり埋まる
- 毎朝のダイジェスト要約（`scripts/lib/ai.mjs`）はまだ旧来の「最初の1社」方式。ルールベースの代替があるので後回しにした
