# Portable creative brief

InfoCollectの`docs/data/latest.json`から選んだ1件を、他の制作ツールへ渡すためのJSONです。通知サービスやAIキーなしで生成できます。元資料のURLと収集日時を保持し、制作上の判断は空欄にして人が埋められるようにします。

```bash
node scripts/export-brief.mjs --kind news --rank 1 --output brief.json
node scripts/export-brief.mjs --kind tool --rank 1
node --test scripts/export-brief.test.mjs
```

`--output`を省くと標準出力に書きます。既存ファイルは上書きしません。`--input`で別の日のダイジェストを指定できます。

```json
{
  "schemaVersion": 1,
  "type": "creative-brief",
  "status": "draft",
  "source": {
    "app": "infocollect",
    "digestGeneratedAt": "2026-11-14T07:19:50.502Z",
    "kind": "news",
    "rank": 1,
    "url": "https://example.org/article",
    "publishedAt": "2026-11-13T00:00:00Z"
  },
  "brief": {
    "title": "記事のタイトル",
    "context": "収集した要約",
    "goal": "",
    "audience": "",
    "keyPoints": [],
    "references": ["https://example.org/article"]
  }
}
```

これは企画の開始データです。`goal`、`audience`、`keyPoints`を確認・編集してから、スライド・画像・動画側の入力変換を行います。出典本文の正確性や利用条件の確認は別工程です。

