import unittest
import importlib.util
from pathlib import Path
module_path = Path(__file__).resolve().parents[1] / "scripts" / "generate-release-notes.py"
spec = importlib.util.spec_from_file_location("generate_release_notes", module_path)
release_notes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release_notes)
collect_entries = release_notes.collect_entries
latest_channel_release = release_notes.latest_channel_release
render_notes = release_notes.render_notes


class ReleaseNotesTests(unittest.TestCase):
    def test_categories_and_legacy_perf_alias(self):
        groups = collect_entries("\n".join([
            "[feature] Add offline library", "[improve] Shorten notifications",
            "[perf] Reduce startup time", "[fix] Correct marker restore",
            "[security] Validate manifest", "[docs] Internal docs",
            "[build-apk] Build beta", "[feature] Add offline library",
        ]))
        self.assertEqual(groups["feature"], ["Add offline library"])
        self.assertEqual(groups["improve"], ["Shorten notifications", "Reduce startup time"])
        self.assertEqual(groups["fix"], ["Correct marker restore"])
        self.assertEqual(groups["security"], ["Validate manifest"])
        self.assertEqual(render_notes(collect_entries("[docs] Internal only")), "")

    def test_channel_baseline_is_isolated(self):
        releases = [
            {"tagName": "v2.0.0", "isPrerelease": False, "publishedAt": "2026-01-01"},
            {"tagName": "v2.1.3", "isPrerelease": True, "publishedAt": "2026-02-01"},
            {"tagName": "v2.1.2", "isPrerelease": True, "publishedAt": "2026-01-30"},
        ]
        self.assertEqual(latest_channel_release(releases, "beta"), "v2.1.3")
        self.assertEqual(latest_channel_release(releases, "stable"), "v2.0.0")

    def test_empty_and_first_release(self):
        self.assertIsNone(latest_channel_release([], "beta"))
        self.assertEqual(render_notes(collect_entries("")), "")

    def test_empty_categories_are_omitted(self):
        notes = render_notes({"feature": ["A"], "improve": [], "fix": ["B"], "security": []})
        self.assertEqual(notes, "Tính năng mới:\n• A\n\nSửa lỗi:\n• B")


if __name__ == "__main__":
    unittest.main()
