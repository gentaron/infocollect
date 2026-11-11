# 毎日4本書く人の情報源を、InfoCollect に写す

対象: note.com の「ゆいまる」さん（`humble_bobcat51`）。2026-09-17〜11-12 の公開記事 240 本。
投稿のあった日は平均 4.2 本、1 本あたりの本文はおよそ 4,500 字。

本文と埋め込みのリンクをすべて数えた生データは [humble_bobcat51-sources.md](humble_bobcat51-sources.md)
（[JSON](humble_bobcat51-sources.json)）にある。作り直すときは次を実行する。

```bash
node scripts/kb/note-audit.mjs humble_bobcat51
```

ほかの書き手も同じコマンドで調べられる。数えるのは題名・日付・リンク先だけで、本文は保存しない。

## 分かったこと

1. **ネタの起点は3つ**。本文で最初に出てくるリンクは GitHub（48本）、YouTube（31本）、Hugging Face（25本）。ニュースサイトから始まる記事はほとんど無い
2. **GitHub は「出たばかりで小さい」リポジトリ**。同じリポジトリを2本以上の記事で扱ったのは2つだけ（Strata 系）で、ほとんどは毎回違う新顔。
   `storytold` のように、同じ作者の別プロジェクトを続けて紹介する形はある
3. **Hugging Face は大手より派生物**。Qwen や DeepSeek の本体に加えて、量子化版（GGUF / MLX）、検閲解除版、小さな組織の微調整モデルを多く扱う。データセットや Spaces も出てくる
4. **モデル解説の数字は一次情報から取る**。料金・文脈長は OpenRouter や各社の API ドキュメント、性能は artificialanalysis.ai や benchlm.ai、技術の中身は arXiv
5. **脆弱性の記事は「悪用されているか」が軸**（CVSS 9.8・積極的に悪用、など）
6. **記事の種類**: 道具・OSS の紹介 98、モデル解説 78、個人開発日記 34、セキュリティ 16、サッカー 14
7. **投稿の時刻**: 朝（7〜12時）、昼（12時台）、夕方〜夜（17〜22時）の3つの山がある
8. 記事にあるリンクのうち 315 本は転職サイトの PR リンクだった。これは情報源ではないので数えていない

## InfoCollect との対応

| あの人が見ているもの | 前の InfoCollect | 今回の対応（`config/sources.json` の `kb`） |
| --- | --- | --- |
| 作られて数日・星が数十の GitHub リポジトリ | ★100以上・既存リポジトリの道具枠だけ | **`githubRising`**: 作成から14日以内・★20以上を、1日あたりの★の増え方で並べる |
| 同じリポジトリの更新の追跡 | `tools.watchReleases`（12本） | 監査で2本以上の記事に出たリポジトリを追加（Strata、4gbVramStrata） |
| HF の派生モデル・データセット・Spaces | トレンドのモデル上位30件 | **モデル上位60件**、**トレンドの Spaces / データセット**各30件 |
| 新しく呼べるようになったモデルの料金・文脈長・無料枠 | なし | **`openRouter`**: 10日以内に追加されたモデルについて、値段・文脈長・無料かどうか |
| 「悪用されている」脆弱性 | Google Security Blog / Project Zero | **`cisaKev`**（CISA の悪用確認済み一覧）＋ The Hacker News の RSS |
| モデル・論文のまとめ記事 | arXiv / HF Daily Papers | MarkTechPost と Hugging Face Blog の RSS を追加 |
| 日本語の技術記事 | Zenn / Qiita | そのまま |

追加した収集元はすべてキー不要・無料。どれか1つが落ちても、ほかの収集は続く。

## 写せないもの（正直に）

- **X（Twitter）**: 無料で読める公式の API が無い。X で話題になったものは、Hacker News・Reddit・GitHub の星の増え方を通して間接的に拾う
- **YouTube**: 埋め込み動画は多い（69本）が、キー不要で新着を追う手段が無い。チャンネルの RSS は使えるので、追うチャンネルが決まれば `feeds` に足せる
- **artificialanalysis.ai / benchlm.ai**: 機械で読める無料の公開データが無い。性能の数字は、モデルカード（HF）と arXiv から取る
- **書き手の経験**（個人開発日記）: 収集では作れない。InfoCollect の役目は、その日に書ける材料を、出典の URL 付きで揃えるところまで

## 検証

- `node scripts/selftest.mjs`（58項目）: 新しい収集元が作る項目の形と、監査の数え方（PR を除く、note.com 自身と localhost を除く、1記事の中の重複は1と数える）を、ネットワーク無しで確かめる
- 実際の取得は毎日の GitHub Actions で行う。このリポジトリを作業した環境のネットワークでは、note.com 以外に届かなかったため、新しい収集元をここで実際に叩くことはできていない
