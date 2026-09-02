# InfoCollect

毎朝 **09:00（マレーシア時間 / UTC+8）** に、

1. その日 GitHub で伸びている **AIツール 3件**
2. AI の **新機能・新バージョン中心のニュース**

を自動収集し、日本語で要約して **PWA（インストール可能なWebアプリ）** として配信します。
要約に使う AI は **無料枠のみ**。API キーが 1 つも無くてもルールベース要約で動きます。

---

## 構成

```
config/sources.json        収集元（GitHub検索クエリ / RSS / HN / 監視リリース）
scripts/collect.mjs        毎日の収集本体
scripts/lib/               github・feeds・rank・ai・render・util
scripts/selftest.mjs       ネットワーク不要の自己テスト
scripts/gen-icons.mjs      PWAアイコン生成（依存パッケージ無し）
scripts/pack.mjs           docs/ を infocollect-pwa.zip に固める
scripts/serve.mjs          ローカル確認用の静的サーバ
docs/                      PWA本体（GitHub Pages の配信ディレクトリ）
  ├─ index.html / app.js / styles.css
  ├─ manifest.webmanifest / sw.js / icons/
  └─ data/latest.json, data/index.json, data/archive/YYYY-MM-DD.json
.github/workflows/daily.yml   Cron（0 1 * * * UTC = 09:00 MYT）
.github/workflows/pages.yml   GitHub Pages へのデプロイ（任意）
.github/workflows/ci.yml      push / PR ごとの自己テスト
```

Node.js 20 以上があれば動きます。**npm install は不要**（依存パッケージゼロ）。

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

## Cron（マレーシア時間 9:00）

`.github/workflows/daily.yml`

```yaml
schedule:
  - cron: '0 1 * * *'   # 01:00 UTC = 09:00 Asia/Kuala_Lumpur
```

マレーシアにサマータイムは無いため、通年 9:00 に固定されます。
時刻を変えるときは「希望時刻 − 8時間」を UTC で書いてください（例: 21:00 MYT → `0 13 * * *`）。
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
