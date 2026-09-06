"""Installed-skill contract checks, independent of repository location."""
import json
from pathlib import Path
import re
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]

class SkillContractTests(unittest.TestCase):
    def test_entry_and_progressive_references(self):
        text = (ROOT / "SKILL.md").read_text()
        self.assertTrue(text.startswith("---\nname: blog-voice-cloner\n"))
        self.assertIn("description: Use when", text)
        self.assertLess(len(text.split()), 850)
        for name in re.findall(r"references/[a-z-]+\.md", text):
            self.assertTrue((ROOT / name).is_file(), name)

    def test_templates_do_not_invent_profiles(self):
        profile = json.loads((ROOT / "references/style-profile.json").read_text())
        self.assertEqual(profile["status"], "uninitialized")
        self.assertEqual(profile["global_rules"], [])
        self.assertEqual(profile["genre_rules"], {})
        for name in ["style-profile.md", "style-metrics.json", "examples.md", "negative-examples.md", "evidence.md"]:
            self.assertTrue((ROOT / "references" / name).is_file())

    def test_cli_help_outside_repository(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            for name in ["analyze_style.py", "validate_style.py", "manage_voice.py"]:
                result = subprocess.run([sys.executable, str(ROOT / "scripts" / name), "--help"], cwd=directory, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("usage:", result.stdout)

    def test_semantic_and_correction_boundaries_present(self):
        text = (ROOT / "references/writing-workflow.md").read_text()
        for field in ["content_preservation", "style_match", "over_imitation", "source_leakage", "generic_ai_signals", "USER_OVERRIDES", "FACT_CORRECTION"]:
            self.assertIn(field, text)

if __name__ == "__main__":
    unittest.main()
