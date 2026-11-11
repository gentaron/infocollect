# infocollect — AI 作業メモ

毎朝の AI 情報収集、ナレッジベース（RAG・MCP）、無料モデルの配車ハーネス、手元の AI 開発カンバン Forge

<!-- ecosystem:begin (自動生成: gentaron/infocollect の ecosystem/registry.json から。手で直さない) -->

## エコシステム（このリポジトリの外側）

- 役割: 毎朝の AI 情報収集、ナレッジベース（RAG・MCP）、無料モデルの配車ハーネス、手元の AI 開発カンバン Forge（ハブ）
- 上流（ここが受け取るもの）: なし
- 下流（ここが渡すもの）: IDEAZ（ナレッジベース）、genesisvault（ナレッジベース）、Gentarog（ナレッジベース）、VAIZ（ナレッジベース・記事）、Mathematical-Physics-Lab-（ナレッジベース）、SAIZ（記事）、genimage（記事）
- 渡しているもの（produces）の形を変えるときは、下流のリポジトリ名をコミットメッセージに書き、壊さない移行にする。
- 調べ物は MCP の `infocollect-kb` を先に使う（`kb_search` / `kb_context`。毎日の AI 情報・論文・リリース・過去記事・全リポジトリの役割が入っている）。出典の URL を必ず添える。
- 大きな作業は MCP の `forge` で小さなカードに割り、無料のエージェントに配る（`forge_add_cards`）。マージは人が承認する。
- 進め方: 方向づけ → 作業ループ → 判断の記録 → 更新 → 完了。完了の前に、このリポジトリの検証コマンドが通ることを確かめる。
- 全体の地図: https://github.com/gentaron/infocollect/blob/HEAD/ecosystem/README.md

<!-- ecosystem:end -->
