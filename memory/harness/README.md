# memory/harness

AIハーネスの記録。人が読むための場所で、手で消しても壊れない。

- `usage/YYYY-MM-DD.<run>.jsonl` — どの仕事（tier）でどのモデルを何回呼んだかの台帳。1日の無料枠の予算管理に使う。30日で自動的に消える
- `runs/YYYY-MM-DD-<枠>.json` — ブログ1本ごとの審査記録（lint の指摘・審査役の判定・差し戻しの有無）
- `tasks/<Issue番号>.md` — Issue カンバンで処理した仕事の結果
