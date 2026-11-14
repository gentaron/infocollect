# agent-hub: GitHubだけで管理するツール台帳

[registry.json](registry.json)が現在動かせるツールの一覧。これは `infocollect` 内のフォルダとして始める。各ツールの実装と実行ログは、そのツール自身のリポジトリに置く。PCへのチェックアウトや成果物保存は運用条件にしない。

## Claude / Codex からの使い方

1. GitHubコネクタで `agent-hub/registry.json` を読む。
2. 目的に合うツールの入力契約と実行方法を確認する。
3. 公開してよい企画だけを該当リポジトリでレビューし、対応するリポジトリの制作・テスト用Actionsを実行する。
4. 実行ログとArtifactのURLを読み、結果を人間に提示する。公開は別の判断として扱う。

現行のGitHubコネクタは `workflow_dispatch` を起動できない。VAIZは `briefs/from-infocollect.json` と専用ワークフローの変更をmainへマージした時に下書きActionsが動く。KBは専用再生成ワークフローを持つ。ユーザーの私有データ、秘密鍵、APIキーを公開Issueや企画ファイルに入れない。

## 実行場所の境界

GitHub Actionsは各リポジトリのソフトウェアの制作・テスト・デプロイ・公開に使う。自由入力のシェル、常時稼働エージェント、汎用推論APIやサーバーレスアプリの代用としては設計しない。[GitHubの追加規約](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features)は、GitHub-hosted runnerでのリポジトリと無関係な活動や、Actionsをサーバーレスアプリの一部として使うような過大負荷を制限している。

即時応答が必要な推論・MCPは、既存のスマホMCPまたは別の適切なホスティングへ置く。Actionsの無料枠や実行環境は将来変わり得るので、台帳ではツールごとの成果物と実行ログを基準にする。

## 現時点の検証

- InfoCollect KB: [公開manifest](https://github.com/gentaron/infocollect/blob/claude/github-ai-tools-pwa-77pbbx/docs/kb/manifest.json)。2026-09〜11の3シャード、計468件。
- VAIZ: [InfoCollect企画からの下書き実行](https://github.com/gentaron/VAIZ/actions/runs/43651319742)が成功。公開はしていない。
- presentationgen: [共有企画読込のビルド](https://github.com/gentaron/presentationgen/actions/runs/43651855068)は成功。ブラウザの実操作は未確認。
