# InfoCollect

毎朝 **09:00（マレーシア時間 / UTC+8）** に、

1. その日 GitHub で伸びている **AIツール 3件**
2. AI の **新機能・新バージョン中心のニュース**
3. 量子・数理物理・バイオ・ニューロ・ワールドモデル等 **9分野の最先端マップ**（オープンソース／大手／どっちつかず の3部門）

を自動収集し、日本語で要約して **PWA（インストール可能なWebアプリ）** として配信します。

全体の並び順は **「ゆいまる予測」** が軸です。note の書き手ゆいまる（humble_bobcat51）さんが次に記事にしそうなものを、当日の全候補から予測して先頭に出し、ツール・ニュース・最先端マップもその予測スコアで並べ替えます（下記「ゆいまる予測」）。
要約に使う AI は **無料枠のみ**。API キーが 1 つも無くてもルールベース要約で動きます。

さらに **毎日5枠（07:00 / 09:00 / 11:00 / 14:00 / 18:00 MYT）** で、
定時トリガーによって AI がブログ記事を1本ずつ自動執筆し、このリポジトリにコミットしていきます（下記「自動ブログ生成」）。

---

## 構成

```
config/sources.json        収集元（GitHub検索クエリ / RSS / HN / 監視リリース）
config/yuimaru.json        ゆいまる予測のテーマ・重み・追加検索クエリ
scripts/lib/yuimaru.mjs    ゆいまる予測（採点・学習・既出除外・答え合わせ）
scripts/collect.mjs        毎日の収集本体
scripts/lib/               github・feeds・rank・ai・render・util
scripts/blog/generate.mjs  ブログ生成本体（1枠 = 1記事）
scripts/blog/lib/          core（純粋関数）・llm（プロバイダ）・search（任意検索）
prompts/blog/              5枠の執筆ルール（common.md + slot-XXXX.md）
memory/                    生成時に読み込むメモ（PC・環境・ログ）
docs/blog/                 生成された記事とブログ一覧ページ
scripts/selftest.mjs       ネットワーク不要の自己テスト
scripts/gen-icons.mjs      PWAアイコン生成（依存パッケージ無し）
scripts/pack.mjs           docs/ を infocollect-pwa.zip に固める
scripts/serve.mjs          ローカル確認用の静的サーバ
docs/                      PWA本体（GitHub Pages の配信ディレクトリ）
  ├─ index.html / app.js / styles.css
  ├─ manifest.webmanifest / sw.js / icons/
  ├─ blog/index.html + blog/index.json + blog/YYYY-MM-DD/*.txt
  └─ data/latest.json, data/index.json, data/archive/YYYY-MM-DD.json
.github/workflows/daily.yml      Cron（0 1 * * * UTC = 09:00 MYT）
.github/workflows/blog-*.yml     5枠のブログ執筆 Cron（下記）
.github/workflows/pages.yml   GitHub Pages へのデプロイ（任意）
.github/workflows/ci.yml      push / PR ごとの自己テスト
vercel.json                   Vercel 設定（フレームワークなしの静的配信を強制）
index.html                    Vercel 用フォールバック（/ から docs/ へリダイレクト）
```

Node.js 20 以上があれば動きます。**npm install は不要**（依存パッケージゼロ）。

## ゆいまる予測（次に記事にしそうなものを予測）

`config/yuimaru.json` と `scripts/lib/yuimaru.mjs` が担当します。

1. **候補を集める**：通常の AI 検索に加え、本人が好む領域（Claude Code / Opencode / agent skills / dsh プラグイン / Obsidian / Android / リバースエンジニアリング / ローカルLLM・1-bit・GGUF）を GitHub で追加検索します。ニュース・HFモデル・論文と合わせて数百件が候補になります。
2. **採点（0〜100）**：テーマ別キーワード（直近記事10本から作った初期値）、本人の note RSS から学習した「最近の関心語」（半減期21日で新しい記事ほど重い）、実用ツールらしさ、スターの伸び（対数）、新しさで加点します。論文・企業PR・分野外・まとめリスト系は減点します。
3. **既出を除外**：本人の記事タイトル・本文に名前が出ているものは「記事化済み」として外します。
4. **偏りを防ぐ**：同じテーマ、同じ関心語の候補はそれぞれ最大3件までにします。
5. **答え合わせ**：毎日の予測を `docs/data/yuimaru-history.json` に60日分保存し、その後14日以内に本人の記事に名前が出たら的中として扱います。的中率（予測した件数のうち記事になった割合）と事前予測率（新しい記事のうち事前に予測していた割合）を PWA に表示します。

`yuimaru.json` の `themes` の重みとキーワードを編集すれば、予測の傾向を調整できます。答え合わせの数字を見ながら調整してください。

## 完全無料・オフライン知識検索（SQLite FTS5）

外部LLM、GPU、埋め込みAPIを使わず、収集済みの `docs/kb/shards/*.jsonl` をPython標準ライブラリのSQLite FTS5（三文字検索）で検索できます。検索結果は記事タイトル・出典URL・日付・抜粋を返します。公開KBからの取得時に未検証の事実を「検証済み」に格上げしません。

```bash
node scripts/build-kb.mjs
python3 scripts/kb-fts.py build
python3 scripts/kb-fts.py search "量子幾何"
python3 scripts/kb-fts.py search "OpenCode" --limit 5
python3 scripts/test_kb_fts.py
```

ローカルの `.cache/kb.sqlite` は一時索引で、GitHubへコミットしません。CIが実データから索引を再構築・検索し、独立したテストも実行します。SQLiteのFTS5/trigramを備えるPython 3環境が必要です。

---

## 最先端マップ（分野別 × オープンソース／大手／どっちつかず）

毎日の収集で、AI だけでなく次の **9分野** も一緒に集め、PWA の「最先端マップ」と `latest.md` に日本語でまとめます。

| 分野ID | 分野 |
| --- | --- |
| `ai-models` | 基盤モデル（LLM・マルチモーダル） |
| `ai-agents` | エージェント・開発ハーネス（MCP・コーディングAI） |
| `ai-interp` | 解釈可能性・安全性・ステアリング |
| `world-models` | ワールドモデル・フィジカルAI・ロボティクス |
| `quantum` | 量子コンピュータ・量子情報 |
| `math-physics` | 数理物理・理論物理・AI×数学 |
| `bio` | バイオ・合成生物学・AI創薬 |
| `neuro` | ニューロサイエンス・BCI・ニューロモジュレーション |
| `hardware` | 半導体・AIチップ・新素材 |

各アイテムは3部門に振り分けます。

- **オープンソース** … コミュニティ・大学・個人の公開物（GitHub の一般リポジトリ、HF の個人モデル等）
- **大手** … 巨大テック・国家級ラボの公式発表（クローズド中心）
- **どっちつかず** … 大手のオープンウェイト／OSS（`google-deepmind/…` 等）、研究所・スタートアップ、arXiv / bioRxiv、学術誌・専門メディア。大手の発表でも「open-source」「open weights」等を含めばここ

ソースは arXiv・bioRxiv・専門メディア・各社ブログ・Hacker News（分野別の検索語）・GitHub（分野別トピック）・Hugging Face Trending。
1分野あたり GitHub 3件・HFモデル 3件・記事 6件まで、**各部門から最低1件は入る**ように選びます（偏り防止）。同じソースからは1分野2件まで。

- 設定: `config/frontier.json`（分野・キーワード・フィード・部門・大手組織リストを宣言的に編集）
- 実装: `scripts/lib/frontier.mjs`（分類・選別は純粋関数で selftest 済み）
- 要約: AIキーがあれば分野ごとに1回ずつ日本語要約（無料枠のため4秒間隔）、無ければルールベース
- 出力: `docs/data/latest.json` の `frontier` フィールド（`schemaVersion` は 1 のまま、追加のみ）
- ブログ: 各枠の題材候補に関連分野の最先端マップが混ざります（例: 18時枠 = バイオ・ニューロ・量子・半導体・数理物理）
- 手で調べた現在地の地図: [`docs/FRONTIER.md`](docs/FRONTIER.md)

```bash
node scripts/collect.mjs --dry-run --no-ai --no-frontier   # 最先端マップを省いて従来どおり
```

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

## 制作ツールへ渡す企画ファイル

収集したニュースやツールを1件選び、出典付きの`creative-brief` JSONとして書き出せます。AIキーや通知サービスは不要です。

```bash
npm run export:brief -- --kind news --rank 1 --output brief.json
npm run test:brief
```

出力形式、上書き防止、`--input`での過去データ指定は[docs/BRIEF.md](docs/BRIEF.md)を参照してください。書き出した時点では`draft`で、目的・対象読者・要点を確認してから他の制作ツールへ渡します。

## 出典付きナレッジの静的エクスポート

`npm run kb:build`で直近60日の`docs/data/archive/*.json`を読み、`docs/kb/manifest.json`と月別の`docs/kb/shards/YYYY-MM.jsonl`を生成します。重複URLは最新の収集記録を残します。毎日の収集ワークフローもこれを更新・コミットします。`VAIZ`はこの静的ファイルを読み、動画企画に関連する資料候補を参照できます。

```bash
npm run kb:test
npm run kb:build
```

各行には見出し、要約、URL、出典、収集日を含みます。**収集した要約は検証済みの事実ではありません。** 数字・固有名詞を動画で使う前に原文を確認してください。ビルドはAPIキー不要で、元のアーカイブが消えた月のシャードは一覧から外します。
