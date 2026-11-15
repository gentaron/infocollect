# リポジトリ間の受け渡し

[registry.json](registry.json) は公開可能な入出力の地図です。各リポジトリの `ecosystem.json` の参照先になる [schema.json](schema.json) もここに置きます。

| 経路 | 渡す結果 | 状態 |
|---|---|---|
| genesisvault → VAIZ | 公開記事 → 動画企画 | 宣言済み。実行経路は未検証 |
| infocollect → genesisvault | 出典付き KB → 執筆文脈 | 宣言済み。実行時の読込は未検証 |
| edu → infocollect | 公開Wikiのリンク索引 → 架空世界専用 `docs/kb/fiction/edu.json` | 実測済み。552件を専用索引に保存 |
| infocollect → edu | 出典付き KB → 調査補助 | 宣言済み。MCP の実行は未検証 |

`implemented` はコードの受け渡し口を確認した状態、`declared` はリポジトリの構成に記されている状態、`planned` はまだコードがない状態です。実行成功まで検証していない経路を稼働中と見なしません。

Assetlog は単独運用です。自動受け渡し網に入れず、個人資産のデータを公開 KB、記事、企画へ流しません。EDU の架空世界の設定と現実の市場・ニュースも出典種別で分離します。

[agent-hub のツール台帳](../agent-hub/registry.json) は具体的な実行入口を記録します。PC へのチェックアウトや成果物保存は運用条件ではありません。


## 専門ツールの調査・導入候補（実行ハブではない）

[ユイマル関連記事＋追加候補 188件の台帳](hyperfleet/TOOLS.md) と [機械可読JSON](hyperfleet/tool-catalog.json) を置く。これは情報収集系の**調査成果**で、ハブ `agent-runner` に追加処理は載せない。本人の現役使用・古い利用・未使用・追加候補を別ステータスで保持。CIで出典と所属を検査し、どのツールもここから自動インストールはしない。
