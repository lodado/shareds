"""Pure harness regression checks, not scheduler acceptance execution."""
import json
from pathlib import Path
import tempfile
import unittest

import smoke


class SmokeTests(unittest.TestCase):
    def test_inventory_supported_majors_and_pnpm_layout(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name, package, version in (
                ("a", "vitest", "2.1.9"), ("b", "vitest", "3.2.4"),
                ("c", "vitest", "4.0.0"), ("d", "vitest", "5.0.0-beta.1"),
                ("e", "jest", "30.0.0"), ("f", "@playwright/test", "1.56.0"),
                ("g", "vitest", "1.6.0"),
            ):
                path = root / name / "node_modules" / package
                path.mkdir(parents=True)
                (path / "package.json").write_text(json.dumps({"version": version}))
            path = root / "store/node_modules/.pnpm/vitest@3.1.0/node_modules/vitest"
            path.mkdir(parents=True)
            (path / "package.json").write_text('{"version":"3.1.0"}')
            installed, complete = smoke.inventory(root)
            self.assertTrue(complete)
            self.assertEqual(set(installed), {"vitest2", "vitest3", "vitest4", "vitest5", "jest", "playwright"})
            self.assertEqual(installed["vitest3"]["version"], "3.2.4")

    def test_inventory_deadline_is_bounded(self):
        with tempfile.TemporaryDirectory() as temporary:
            self.assertEqual(smoke.inventory(Path(temporary), seconds=-1), ({}, False))

    def test_recursive_sanitization_prefers_specific_scratch(self):
        report = {"jobs": [{"output": "/home/user/tmp/fixture /home/user/repo"}], "code": 0}
        self.assertEqual(smoke.sanitize(report, {"/home/user": "$HOME", "/home/user/tmp": "$SCRATCH"}),
                         {"jobs": [{"output": "$SCRATCH/fixture $HOME/repo"}], "code": 0})
        self.assertEqual(report["jobs"][0]["output"], "/home/user/tmp/fixture /home/user/repo")


if __name__ == "__main__":
    unittest.main()
