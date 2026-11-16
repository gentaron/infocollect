"""Offline regressions for FTS5 indexing: URL evidence and injection resistance."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).with_name("kb-fts.py")
spec = importlib.util.spec_from_file_location("kb_fts", MODULE)
kb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kb)


class OfflineKnowledgeSearchTest(unittest.TestCase):
    def test_japanese_trigram_and_short_search_and_dedup(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "source"
            (root / "shards").mkdir(parents=True)
            (root / "manifest.json").write_text(json.dumps({
                "shards": [{"key": "2026-10"}, {"key": "2026-11"}]
            }), encoding="utf-8")
            october = [{"titleJa": "量子幾何の古い記事", "summary": "旧知見",
                        "url": "https://example.org/q", "source": "Lab", "date": "2026-10-01"}]
            november = [
                {"titleJa": "量子幾何とCosmohedron", "summary": "厳密な再現研究",
                 "url": "https://example.org/q", "source": "Lab", "date": "2026-11-01"},
                {"titleJa": "OpenCode 無料運用", "summary": "専門ワーカー",
                 "url": "https://example.org/dev", "source": "GitHub", "date": "2026-11-01"},
                {"titleJa": "危険なURL", "url": "javascript:alert(1)"},
            ]
            for month, items in [("2026-10", october), ("2026-11", november)]:
                (root / "shards" / f"{month}.jsonl").write_text(
                    "".join(json.dumps(item, ensure_ascii=False) + "\\n" for item in items),
                    encoding="utf-8",
                )
            db = Path(tmp) / "kb.sqlite"
            self.assertEqual(kb.build(root, db), 2)
            q = kb.search(db, "量子幾何")
            self.assertEqual([x["url"] for x in q], ["https://example.org/q"])
            self.assertEqual(q[0]["date"], "2026-11-01")
            self.assertEqual(len(kb.search(db, "OpenCode")), 1)
            self.assertEqual(len(kb.search(db, "量子")), 1)
            self.assertEqual(kb.search(db, "' OR 1=1 --"), [])

    def test_refuses_unsafe_shard_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "source"
            root.mkdir()
            (root / "manifest.json").write_text(
                '{"shards":[{"key":"../../private"}]}', encoding="utf-8"
            )
            with self.assertRaises(ValueError):
                kb.build(root, Path(tmp) / "out.sqlite")


if __name__ == "__main__":
    unittest.main()
