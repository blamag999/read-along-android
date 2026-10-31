import importlib.util
import unittest
from pathlib import Path

module_path = Path(__file__).resolve().parents[1] / "scripts" / "prune-ota-releases.py"
spec = importlib.util.spec_from_file_location("prune_ota_releases", module_path)
pruner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pruner)


class OtaRetentionTests(unittest.TestCase):
    def test_only_old_apks_in_selected_channel_are_removed(self):
        objects = [
            {"Key": "releases/beta/read-along-v1.3.20-android.apk"},
            {"Key": "releases/beta/read-along-v1.3.23-android.apk"},
            {"Key": "releases/official/read-along-v1.4.0-android.apk"},
            {"Key": "releases/beta/notes.txt"},
            {"Key": "channels/beta/latest.json"},
        ]
        self.assertEqual(
            pruner.stale_apk_keys(
                objects, "releases/beta/", "releases/beta/read-along-v1.3.23-android.apk"
            ),
            ["releases/beta/read-along-v1.3.20-android.apk"],
        )

    def test_refuses_to_prune_when_current_apk_is_missing(self):
        with self.assertRaisesRegex(ValueError, "Current OTA APK is missing"):
            pruner.stale_apk_keys(
                [{"Key": "releases/beta/read-along-v1.3.20-android.apk"}],
                "releases/beta/",
                "releases/beta/read-along-v1.3.23-android.apk",
            )

    def test_keeps_official_and_beta_independent(self):
        objects = [
            {"Key": "releases/beta/read-along-v1.3.23-android.apk"},
            {"Key": "releases/official/read-along-v1.4.0-android.apk"},
        ]
        self.assertEqual(
            pruner.stale_apk_keys(
                objects, "releases/official/", "releases/official/read-along-v1.4.0-android.apk"
            ),
            [],
        )

    def test_rejects_unexpected_channel_or_filename(self):
        self.assertNotIn("preview", pruner.CHANNELS)
        self.assertIsNone(pruner.APK_NAME.fullmatch("read-along-v1.3.23-beta.apk"))
        self.assertIsNotNone(pruner.APK_NAME.fullmatch("read-along-v1.3.23-android.apk"))


if __name__ == "__main__":
    unittest.main()
