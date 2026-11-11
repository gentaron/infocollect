# InfoCollect

毎朝 **09:00（マレーシア時間 / UTC+8）** に、

1. その日 GitHub で伸びている **AIツール 3件**
2. AI の **新機能・新バージョン中心のニュース**

を自動収集し、日本語で要約して **PWA（インストール可能なWebアプリ）** として配信します。
要約に使う AI は **無料枠のみ**。API キーが 1 つも無くてもルールベース要約で動きます。

さらに **毎日5枠（07:00 / 09:00 / 11:00 / 14:00 / 18:00 MYT）** で、
定時トリガーによって AI がブログ記事を1本ずつ自動執筆し、このリポジトリにコミットしていきます（下記「自動ブログ生成」）。

---

## 構成

```
config/sources.json        収集元（GitHub検索クエリ / RSS / HN / 監視リリース）
scripts/collect.mjs        毎日の収集本体
scripts/lib/               github・feeds・rank・ai・render・util
scripts/blog/generate.mjs  ブログ生成本体（1枠 = 1記事）
scripts/blog/lib/          core（純粋関数）・llm（プロバイダ）・search（任意検索）
prompts/blog/              5枠の執筆ルール（common.md + slot-XXXX.md）
memory/                    生成時に読み込むメモ（PC・環境・ログ）
docs/blog/                 生成された記事とブログ一覧ページ
scripts/kb/                ナレッジベース（ingest / query / 広い網 / 埋め込み）
scripts/mcp/server.mjs     MCP サーバー（stdio・依存ゼロ）
scripts/harness/           AIハーネス（配車 router / 審査 review / Issueカンバン task / status）
scripts/slides/build.mjs   記事やテーマから静的スライドを作る
config/harness.json        tier ごとの配車表と1日の予算
forge/                     手元の AI 開発カンバン（tmux × git worktree × 無料エージェント）
scripts/selftest.mjs       ネットワーク不要の自己テスト
scripts/gen-icons.mjs      PWAアイコン生成（依存パッケージ無し）
scripts/pack.mjs           docs/ を infocollect-pwa.zip に固める
scripts/serve.mjs          ローカル確認用の静的サーバ
docs/                      PWA本体（GitHub Pages の配信ディレクトリ）
  ├─ index.html / app.js / styles.css
  ├─ manifest.webmanifest / sw.js / icons/
  ├─ blog/index.html + blog/index.json + blog/YYYY-MM-DD/*.txt
  ├─ kb/index.html（検索）+ kb/kb-core.js + kb/manifest.json + kb/shards/YYYY-MM.jsonl
  └─ data/latest.json, data/index.json, data/archive/YYYY-MM-DD.json
.github/workflows/daily.yml      Cron（0 1 * * * UTC = 09:00 MYT）
.github/workflows/blog-*.yml     5枠のブログ執筆 Cron（下記）
.github/workflows/pages.yml   GitHub Pages へのデプロイ（任意）
.github/workflows/ci.yml      push / PR ごとの自己テスト
vercel.json                   Vercel 設定（フレームワークなしの静的配信を強制）
index.html                    Vercel 用フォールバック（/ から docs/ へリダイレクト）
```

Node.js 20 以上があれば動きます。**npm install は不要**（依存パッケージゼロ）。

---

## 自動ブログ生成（毎日5枠）

GitHub Actions の cron が、マレーシア時間の各枠に **自動で1本ずつ記事を執筆**し、このリポジトリにコミットします。

| 枠 | MYT | UTC cron | 主に見るもの | 出力 |
| --- | --- | --- | --- | --- |
| 7時枠／AIモデル | 07:00 | `0 23 * * *` | 米国と中国のAIモデル | `docs/blog/YYYY-MM-DD/0700-ai-models.txt` |
| 9時枠／ハーネス | 09:00 | `0 1 * * *` | エージェントの土台・CLI・MCP等 | `docs/blog/YYYY-MM-DD/0900-harness.txt` |
| 11時枠／GitHub | 11:00 | `0 3 * * *` | GitHubで伸びてるAIリポジトリ | `docs/blog/YYYY-MM-DD/1100-github.txt` |
| 14時枠／手法 | 14:00 | `0 6 * * *` | 最新のエンジニアリング手法 | `docs/blog/YYYY-MM-DD/1400-methods.txt` |
| 18時枠／生命とものづくり | 18:00 | `0 10 * * *` | 生命科学・半導体等の最先端勉強 | `docs/blog/YYYY-MM-DD/1800-science.txt` |

記事は記号なしのプレーンテキスト（note等にそのまま貼れる形）で、タイトル＋本文＋ハッシュタグ＋区切り線＋補足で構成されます。
執筆ルールはすべて `prompts/blog/` に宣言的に置いてあるので、**そのファイルを編集するだけで文体や題材の向きを変えられます**（コードは触らなくてよい）。

### 執筆の仕組み

1. `prompts/blog/` の共通ルール＋その枠の指示を読み込む
2. `memory/` のメモ（PC・開発環境・書き手メモ）と `memory/areas/github-trending-blog.md` の題材ログ（重複防止）を読み込む
3. 題材候補を集める: 毎日のダイジェスト（`docs/data/latest.json`）＋ 任意のWeb検索（z-ai SDK / z-ai CLI があれば使う。無くても動く）
4. 設定済みの無料AIプロバイダで記事本文を生成（ダイジェストと同じ Secret を共有）
5. 記事を `docs/blog/` に保存、ログ行を `memory/areas/github-trending-blog.md` に追記、`docs/blog/index.json` を更新
6. コミット＆プッシュ（競合時は rebase リトライ）

### ブログの閲覧

GitHub Pages が有効なら `https://<user>.github.io/infocollect/blog/` で一覧・閲覧できます（`docs/blog/index.html`）。
ローカルなら `npm run serve` の後に `/blog/` を開くだけ（`serve.mjs` が `docs/` を配信します）。

### 手動実行・ローカル実行

```bash
node scripts/blog/generate.mjs --slot 0700                 # 7時枠を1本書く（保存まで）
node scripts/blog/generate.mjs --slot 1800 --no-search     # 検索なしで書く
node scripts/blog/generate.mjs --slot 1100 --dry-run       # 保存せず本文だけ表示
```

Actions タブの「Blog 7時枠（AIモデル）」など → **Run workflow** でもいつでも手動実行できます。

### AIキーの設定

ブログ生成は「記事を書く」ことが目的なのでルールベースへのフォールバックはありません。
ダイジェストと同じ Secret（`GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENROUTER_API_KEY` / `CLOUDFLARE_ACCOUNT_ID`+`CLOUDFLARE_API_TOKEN` / `OPENAI_COMPATIBLE_*`）のいずれかを Settings → Secrets and variables → Actions に入れてください。
記事は長文（4000字程度）のため、無料枠の中では Gemini / Groq / OpenRouter あたりが安定します。

### メモとログの保守

- `memory/areas/github-trending-blog.md` — 扱った題材のログ（スクリプトが自動追記、新しい行が上）。容量が増えたら古い行を `blog-log-archive.md` へ移す。アーカイブも重複チェックに使われる
- `memory/people/humble-bobcat51.md` — 先に走っている書き手の関心・読者層のメモ。ここを埋めると「先回り選定」が効いてくる（記事に名前は出ない）
- `memory/note-titles.txt` — システム導入前の記事タイトルがあれば1行ずつ追記（重複チェック用）

---

## ナレッジベース（RAG）と MCP

毎日集めたものを **捨てずに溜めて、あとから引ける** ようにしてあります。設計の全体は [ARCHITECTURE.md](./ARCHITECTURE.md)。

- `docs/kb/` に月ごとの JSONL で蓄積（ダイジェスト＋arXiv・HF 論文・Reddit・Zenn/Qiita・セキュリティ系などの“広い網”＋自分のブログ）
- 検索は **BM25（日本語は bigram）＋任意のベクトル（RRF で融合）＋新しさ＋多様性**。中身は `docs/kb/kb-core.js` 1枚で、Node とブラウザが同じものを使う
- ブログ5枠は、過去30日の関連資料を **文字数予算の中だけ** 同梱して書く（`--no-kb` で無効）
- **MCP サーバー**で、Claude Code などの AI から直接たたける（`kb_search` / `kb_context` / `kb_get` / `kb_stats` / `digest_latest`）
- PWA の **「検索」**（`/kb/`）は端末の中だけで検索。結果を「AIに渡す形でコピー」できる

```bash
node scripts/kb/ingest.mjs --backfill          # 既存アーカイブから一気に溜める
node scripts/kb/query.mjs "ローカルLLM 量子化"   # ターミナルから検索
node scripts/kb/query.mjs "MCP" --pack 3000     # AI に渡す文脈ブロックを作る
claude mcp add infocollect-kb -- node scripts/mcp/server.mjs   # Claude Code から使う
```

ベクトルは任意です。`CLOUDFLARE_ACCOUNT_ID`+`CLOUDFLARE_API_TOKEN`（`@cf/baai/bge-m3`）か `GEMINI_API_KEY` があれば自動で使い、無ければ BM25 だけで動きます。自分の PC では `KB_EMBED_PROVIDER=ollama`（既定 `bge-m3`）でローカル埋め込みもできます。

---

## AIハーネス（仕事の重さでモデルを振り分ける）

「鍵が入っている最初の1社だけを使う」のをやめて、**仕事の重さ（tier）で無料モデルを配車**します。配車表は [`config/harness.json`](./config/harness.json) 1枚。

| tier | 何に使うか | 最初に試すもの |
| --- | --- | --- |
| `light` | 分類・見出し・短い要約 | 小さくて速いモデル（Cloudflare / Groq 8B） |
| `standard` | 調査メモ・スライドの骨組み | Groq 70B → GitHub Models → Gemini Flash |
| `heavy` | 4000字級の記事本文 | Gemini 2.5 Flash → Groq → OpenRouter(:free) → GitHub Models |
| `review` | 審査役 | **書き手と別の会社のモデル**を優先 |

- どこかが落ちたら次へ。鍵が無いもの・今日の予算を使い切ったものは飛ばす
- **heavy 用の予約枠**があるので、軽い仕事が記事の分の無料枠を食い潰さない
- 呼び出しは `memory/harness/usage/` の台帳に全部残る（`npm run harness` で残量と配車順が見える）
- **GitHub Models の無料枠**に対応。Actions の `GITHUB_TOKEN` だけで動くので、**Secret を1つも入れなくてもブログが書ける**
- OpenRouter は `:free` 以外のモデルを指定すると止まる（うっかり課金の防止）
- 自分の PC では `LOCAL_LLM_MODEL=qwen3:8b`（Ollama など OpenAI 互換）でローカルLLMも配車に入る

### 書き手と審査役（Worker / Supervisor）

ブログは書いたものをそのまま出しません。

1. **決定論の lint**（モデルなし）: 短すぎ・ハッシュタグ欠落・プレースホルダ残り・AIの地の声・過去記事とタイトルが被る、を機械で落とす
2. **審査役**（別の会社のモデル）: 集めた資料と下書きを突き合わせ、根拠の無い断定や水増しを指摘
3. 問題があれば**1回だけ差し戻し**て書き直し。審査の記録は `memory/harness/runs/` に残る

審査役が呼べない日は lint だけで判定します（`--no-review` で無効化）。

### 同じ原稿からスライド

記事を保存すると、同じ原稿から**静的なスライド**（16:9・アニメーションなし・印刷で1枚1ページのPDF）が `docs/slides/` にできます。PWA の「スライド」から開けます。

```bash
node scripts/slides/build.mjs --from docs/blog/2026-11-11/0900-harness.txt
node scripts/slides/build.mjs --topic "ローカルLLMの量子化"    # ナレッジベースから調べて資料化
node scripts/slides/build.mjs --from <記事.txt> --no-llm       # モデルなし（ルールだけ）でも作れる
```

### Issue がカンバンになる

スマホから Issue を1枚立ててラベルを付けるだけで、無料モデルがナレッジベースを資料にして仕事をし、結果をコメントで返します。

| ラベル | 仕事 |
| --- | --- |
| `ai:research` | 出典つきの調査メモ |
| `ai:draft` | 記事の下書き |
| `ai:slides` | スライドを作って `docs/slides/` に置く |
| `tier:light` / `tier:standard` / `tier:heavy` | 使うモデルの重さを上書き |

リポジトリの持ち主が開いた Issue だけを処理します（公開リポジトリなので）。

---

## Forge（手元の AI 開発カンバン）

[`forge/`](./forge/) は、tmux の上で AI コーディングエージェントを何体も並べて動かすカンバンです。InfoCollect に限らず、手元のどのリポジトリにも使えます（詳しくは [forge/README.md](./forge/README.md)）。

- カードごとに git worktree と tmux セッションを作り、無料のエージェント（Qwen Code / Gemini CLI / OpenCode / Aider）から先に試す
- テストが落ちたら一段上へ（最後は Claude Code）。通ったものは別のエージェントが審査し、マージは人が承認
- Web のボード（スマホ対応）と MCP サーバー付き。Claude Code をリーダーにして、仕事を割って配らせることができる

上の「Issue がカンバンになる」は**クラウドで調べ物や下書き**をする口、Forge は**手元でコードを書かせる**口です。`forge sync <repo>` で `forge` ラベルの Issue を Forge のカードに取り込めます。

```bash
node forge/forge.mjs repo scan ~/code
node forge/forge.mjs add infocollect "直したいこと" -m "詳しい依頼" --tier light
node forge/forge.mjs serve
```

---

## エコシステム（全リポジトリのつなぎ）

[`ecosystem/registry.json`](./ecosystem/registry.json) が、gentaron の公開リポジトリ全部の台帳です。役割、島（グループ）、何を渡して何を受け取るか、アーカイブの後継を書いてあります。地図は [ecosystem/README.md](./ecosystem/README.md)。

`node scripts/ecosystem/propagate.mjs <repo-dir>...` を実行すると、各リポジトリに次のものが入ります（何度実行しても同じ結果になり、目印の外は触りません）。

- `ecosystem.json`: そのリポジトリの上流・下流・ハブの入口（機械向け）
- README の「つながり」節と AGENTS.md の「エコシステム」節: 人と AI が作業前に読む
- `.mcp.json`: ナレッジベース（`infocollect-kb`）と Forge（`forge`）。`npx -p github:gentaron/infocollect` で起動するので、どのリポジトリで Claude Code を開いても同じ知識と同じカンバンにつながる

ナレッジベースにも台帳が入っているので、`kb_search "スライドを作るリポジトリ"` のように聞けば、どのリポジトリの担当かが返ります。

---

## 使い方

```bash
node scripts/collect.mjs        # 収集して docs/data/ を更新
node scripts/collect.mjs --dry-run --no-ai   # 書き込まずJSONを標準出力へ
node scripts/selftest.mjs       # オフラインの自己テスト
npm run serve                   # http://localhost:8080 で PWA を確認
npm run pack                    # docs/infocollect-pwa.zip を生成
```

### ブラウザから取得する

| 方法 | 手順 |
| --- | --- |
| インストール（推奨） | 公開URLを開き、ヘッダーの **「アプリを追加」**（iOS Safari は共有 →「ホーム画面に追加」） |
| ZIPで保存 | ヘッダーの **「ZIPで保存」** から `infocollect-pwa.zip` をダウンロード |
| Actions から取得 | `Daily AI digest` の実行ページ → Artifacts → `infocollect-pwa` |

ZIP は解凍後、任意の静的サーバ（`npx serve`、`python3 -m http.server` など）で配信すれば
そのまま同じアプリとして動きます。Service Worker の都合で `file://` では動きません。

---

## 公開（GitHub Pages）

1. リポジトリの **Settings → Pages** で Source を **GitHub Actions** にする
2. **Settings → Secrets and variables → Actions → Variables** に `ENABLE_PAGES = true` を追加
3. `docs/` への push で `pages.yml` が走り、`https://<user>.github.io/infocollect/` に公開されます

`ENABLE_PAGES` が未設定の間は Pages ワークフローは何もしません（失敗表示になりません）。
Pages の Source を「Deploy from a branch → /docs」にしても配信できますが、
その場合 ZIP はビルドされないため「ZIPで保存」ボタンは自動的に隠れます。

---

## 公開（Vercel）

リポジトリを Vercel にインポートすれば、追加設定なしで配信されます。

- `vercel.json` がフレームワークを「Other（静的）」に固定するため、ビルドは走らずリポジトリ直下がそのまま配信されます
- ルートの `index.html` が「/」へのアクセスを PWA 本体（`docs/`）へ自動リダイレクトします
- ビルドが不要な分、確実に配信されます（Vercel 側で Build Command / Output Directory / Root Directory を設定する必要はありません。設定済みなら空にしてください）

「ZIPで保存」ボタンは Vercel 配信では自動的に隠れます（ZIP は GitHub Pages ワークフローや `npm run pack` で生成されるため）。

うまく表示されないときは:

1. Vercel ダッシュボード → 該当プロジェクト → **Deployments** で最新のデプロイを確認
2. 最新デプロイが Production になっていない場合は、デプロイの「⋯」メニューから **Promote to Production** を実行
3. **Settings → General → Build & Output Settings** の Build Command / Output Directory / Root Directory に上書き設定が入っていないか確認（入っていれば空にする）

---

## Cron（マレーシア時間）

`daily.yml`（ダイジェスト収集）:

```yaml
schedule:
  - cron: '0 1 * * *'   # 01:00 UTC = 09:00 Asia/Kuala_Lumpur
```

ブログ5枠（`blog-0700.yml` 〜 `blog-1800.yml`）:

```yaml
- cron: '0 23 * * *'  # 07:00 MYT（前日のUTC 23時）
- cron: '0 1 * * *'   # 09:00 MYT
- cron: '0 3 * * *'   # 11:00 MYT
- cron: '0 6 * * *'   # 14:00 MYT
- cron: '0 10 * * *'  # 18:00 MYT
```

マレーシアにサマータイムは無いため、通年で時刻は固定です。時刻を変えるときは「希望時刻 − 8時間」を UTC で書いてください（例: 21:00 MYT → `0 13 * * *`）。
GitHub の共有 Cron は混雑時に数分〜十数分遅れることがあります。すぐ試すときは
Actions タブから **Run workflow**（`workflow_dispatch`）で手動実行できます。

---

## 無料AIの設定（任意）

**Settings → Secrets and variables → Actions → Secrets** に、使いたいものを 1 つだけ入れれば有効になります。

| プロバイダ | Secret | 既定モデル（`vars` で変更可） |
| --- | --- | --- |
| Google Gemini | `GEMINI_API_KEY` | `gemini-2.5-flash` →失敗時 `gemini-2.0-flash` |
| Groq | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| OpenRouter | `OPENROUTER_API_KEY` | `meta-llama/llama-3.3-70b-instruct:free` |
| Cloudflare Workers AI | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` | `@cf/meta/llama-3.1-8b-instruct` |
| OpenAI互換の任意API | `OPENAI_COMPATIBLE_BASE_URL` / `OPENAI_COMPATIBLE_API_KEY` / `OPENAI_COMPATIBLE_MODEL` | 指定値 |

- 複数入れた場合は上の表の順で採用。`AI_PROVIDER`（変数）で明示指定もできます。
- どれも無い／API が落ちている場合は自動でルールベース要約に切り替わり、収集自体は成功します。
- 各社の無料枠には日次・分次のレート上限があります。1日1回の実行なら通常は上限内です。

---

## ツールの選び方（ランキング根拠）

GitHub には「トレンド」API が無いため、次の方法で近似しています。

1. `config/sources.json` の検索クエリ（`topic:ai`, `topic:llm`, `topic:mcp` など）で候補を収集
2. 毎回すべての候補のスター数を `docs/data/stars.json` に記録
3. 翌日の実行で **前回との差分 ÷ 経過日数 = スター増加ペース** を算出
4. `スコア = 増加ペース × (0.6 + 0.4 × 更新の新しさ) × 新規リポジトリ補正(1.25)`
5. 上位 3 件を採用（`take` で変更可）

初回実行だけは比較対象が無いため、生涯平均（スター数 ÷ 経過日数）を 0.6 倍した値を使います。
**2日目以降から本来の「その日の伸び」になります。**
`awesome-`・`roadmap`・`course` などのまとめ系リポジトリは `excludePatterns` で除外しています。

## ニュースの選び方

- ソース: 主要ベンダーの公式ブログ RSS、技術メディア、Hacker News（Algolia API）、
  監視対象リポジトリの GitHub Releases（`watchReleases`）
- 3日以内の記事のみを対象に、URL とタイトルで重複排除
- `release` / `launch` / `introducing` / `v1.2.3` のようなリリース語・バージョン表記に加点し、
  公式ソースを優先。上位 12 件を `version` / `feature` / `model` などのタグ付きで採用
- アプリ側のフィルタで「新バージョンだけ」「新機能だけ」に絞り込めます

収集元・件数・重み付けはすべて `config/sources.json` を編集するだけで変えられます。

---

## データ形式

`docs/data/latest.json`（当日分）と `docs/data/archive/YYYY-MM-DD.json`（最大60日分）は同じ形です。

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-09-02T01:00:12.000Z",
  "generatedAtLocal": "2026-09-02 09:00",
  "dateLocal": "2026-09-02",
  "timezone": "Asia/Kuala_Lumpur",
  "ai": { "enabled": true, "provider": "gemini", "model": "…", "label": "…" },
  "digest": "本日全体のまとめ",
  "tools": [{ "rank": 1, "name": "owner/repo", "url": "…", "headline": "…",
              "summary": "…", "why": "…", "stars": 0, "starsDelta": 0,
              "starsPerDay": 0, "language": "…", "topics": [], "pushedAt": "…" }],
  "news":  [{ "rank": 1, "title": "…", "titleJa": "…", "summary": "…", "url": "…",
              "source": "…", "publishedAt": "…", "tags": ["version", "feature"] }],
  "stats": { "repoCandidates": 0, "newsCandidates": 0, "feedsFailed": [] }
}
```

人が読む用に `docs/data/latest.md`（Markdown 版ダイジェスト）も同時に出力されます。

---

## トラブルシューティング

| 症状 | 対処 |
| --- | --- |
| ツールが 0 件 | 初回は候補が集まらないことがあります。Actions のログで `repo search failed` を確認（403 ならレート制限） |
| `starsDelta` が `null` のまま | 比較用スナップショットが 1 回分しかありません。翌日の実行で埋まります |
| ニュースが少ない | `config/sources.json` の `maxAgeDays` を増やすか、フィードを追加。`stats.feedsFailed` に落ちたソースが出ます |
| 要約が英語のまま | AI キーが未設定でルールベース動作中です（バッジが「要約: ルールベース」になります） |
| アプリが古いまま | ヘッダーの「更新」を押す。Service Worker はデータを常にネットワーク優先で取りに行きます |

## ライセンス

MIT

<!-- ecosystem:begin (自動生成: gentaron/infocollect の ecosystem/registry.json から。手で直さない) -->

## つながり

gentaron のリポジトリ群のうち **ハブ** の一つ。毎朝の AI 情報収集、ナレッジベース（RAG・MCP）、無料モデルの配車ハーネス、手元の AI 開発カンバン Forge。

- **渡す**: [IDEAZ](https://github.com/gentaron/IDEAZ)（ナレッジベース）、[genesisvault](https://github.com/gentaron/genesisvault)（ナレッジベース）、[Gentarog](https://github.com/gentaron/Gentarog)（ナレッジベース）、[VAIZ](https://github.com/gentaron/VAIZ)（ナレッジベース・記事）、[Mathematical-Physics-Lab-](https://github.com/gentaron/Mathematical-Physics-Lab-)（ナレッジベース）、[SAIZ](https://github.com/gentaron/SAIZ)（記事）、[genimage](https://github.com/gentaron/genimage)（記事）

全体の地図 → [ecosystem](https://github.com/gentaron/infocollect/blob/HEAD/ecosystem/README.md)

<!-- ecosystem:end -->
