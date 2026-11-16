#!/usr/bin/env python3
"""Free, offline source-linked KB retrieval using the Python stdlib SQLite FTS5.

No API key, embeddings, LLM, GPU, or network access. The index is a local cache,
never a replacement for the original JSONL evidence or its verification.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHARD_RE = re.compile(r"^\d{4}-\d{2}$")


def _read_docs(source: Path):
    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    shards = manifest.get("shards", [])
    if not isinstance(shards, list):
        raise ValueError("manifest.shards must be a list")
    # Newest month first; retain the most recent copy of a URL.
    for shard in sorted(shards, key=lambda item: str(item["key"]), reverse=True):
        key = shard["key"]
        if not isinstance(key, str) or not SHARD_RE.fullmatch(key):
            raise ValueError("unsafe KB shard key")
        path = source / "shards" / f"{key}.jsonl"
        with path.open(encoding="utf-8") as stream:
            for raw in stream:
                if not raw.strip():
                    continue
                doc = json.loads(raw)
                url = doc.get("url", "")
                title = doc.get("titleJa") or doc.get("title")
                if not isinstance(url, str) or not url.startswith("https://"):
                    continue
                if not isinstance(title, str) or not title.strip():
                    continue
                yield {
                    "title": title[:500],
                    "summary": str(doc.get("summary") or "")[:1000],
                    "source": str(doc.get("source") or "")[:160],
                    "url": url,
                    "date": str(doc.get("date") or key)[:20],
                }


def _connect(path: Path):
    con = sqlite3.connect(path)
    con.execute("PRAGMA trusted_schema=OFF")
    return con


def build(source: Path, database: Path) -> int:
    """Build an atomic local FTS index from existing static KB shards."""
    database.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(prefix="kb-fts-", suffix=".sqlite",
                                     dir=database.parent, delete=False) as temporary:
        scratch = Path(temporary.name)
    count = 0
    try:
        con = _connect(scratch)
        try:
            con.execute(
                "CREATE VIRTUAL TABLE documents USING fts5("
                "title, summary, source UNINDEXED, url UNINDEXED, date UNINDEXED, tokenize='trigram')"
            )
            seen = set()
            with con:
                for doc in _read_docs(source):
                    if doc["url"] in seen:
                        continue
                    seen.add(doc["url"])
                    con.execute(
                        "INSERT INTO documents (title,summary,source,url,date) VALUES (?,?,?,?,?)",
                        (doc["title"], doc["summary"], doc["source"], doc["url"], doc["date"]),
                    )
                    count += 1
        finally:
            con.close()
        os.replace(scratch, database)
    finally:
        scratch.unlink(missing_ok=True)
    return count


def search(database: Path, query: str, limit: int = 8) -> list[dict]:
    if not database.is_file():
        raise ValueError("build the local index first")
    if not 1 <= limit <= 50:
        raise ValueError("limit must be between 1 and 50")
    query = query.strip()
    if not query or len(query) > 160:
        raise ValueError("query must be 1-160 characters")
    con = _connect(database)
    try:
        # For short CJK queries FTS5 trigram cannot generate a posting list.
        # A bounded LIKE fallback retains a useful Japanese 1-2 character lookup.
        if len(query) < 3:
            escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            sql = ("SELECT title,summary,source,url,date FROM documents "
                   "WHERE title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' LIMIT ?")
            rows = con.execute(sql, (f"%{escaped}%", f"%{escaped}%", limit)).fetchall()
        else:
            # Quoted phrase: user content never becomes SQL syntax or FTS operators.
            literal = '"' + query.replace('"', '""') + '"'
            sql = ("SELECT title,summary,source,url,date FROM documents "
                   "WHERE documents MATCH ? ORDER BY bm25(documents) LIMIT ?")
            rows = con.execute(sql, (literal, limit)).fetchall()
        return [dict(zip(("title", "summary", "source", "url", "date"), row)) for row in rows]
    finally:
        con.close()


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", type=Path, default=ROOT / "docs" / "kb")
    p.add_argument("--db", type=Path, default=ROOT / ".cache" / "kb.sqlite")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("build")
    find = sub.add_parser("search")
    find.add_argument("query")
    find.add_argument("--limit", type=int, default=8)
    args = p.parse_args()
    if args.cmd == "build":
        print(json.dumps({"indexed": build(args.source, args.db), "db": str(args.db)}))
    else:
        print(json.dumps({"results": search(args.db, args.query, args.limit)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
