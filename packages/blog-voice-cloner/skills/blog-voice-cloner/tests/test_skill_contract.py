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

    def test_contextual_korean_analysis_and_title_are_routed(self):
        # Instruction coverage only, not proof that a model reproduces a voice.
        analysis = (ROOT / "references/analysis-guide.md").read_text()
        self.assertIn("language-ko.md", analysis)
        self.assertIn("title_craft", analysis)
        korean = ROOT / "references/language-ko.md"
        self.assertTrue(korean.is_file())
        text = korean.read_text()
        for field in ["register_switch", "reader_distance", "connective_endings", "evidence", "insufficient_evidence"]:
            self.assertIn(field, text)

    def test_run_voice_brief_has_action_and_semantic_boundary(self):
        workflow = (ROOT / "references/writing-workflow.md").read_text()
        self.assertIn("voice-brief.md", workflow)
        brief = ROOT / "references/voice-brief.md"
        self.assertTrue(brief.is_file())
        for field in ["rule_id", "trigger", "action", "evidence", "semantic_boundary", "not_applicable"]:
            self.assertIn(field, brief.read_text())

    def test_target_voice_review_does_not_equal_generic_cleanup(self):
        workflow = (ROOT / "references/writing-workflow.md").read_text()
        for field in ["target_voice_match", "major_style_gap", "partial_match", "two", "human_review_pending"]:
            self.assertIn(field, workflow)

    def test_contrastive_failures_are_not_author_evidence(self):
        brief = ROOT / "references/voice-brief.md"
        self.assertTrue(brief.is_file())
        text = brief.read_text()
        for field in ["derived_contrast", "not author evidence", "PROFILE", "HELD-OUT"]:
            self.assertIn(field, text)

    def test_benchmark_has_wrong_author_control_and_separate_key(self):
        text = (ROOT / "references/evaluation.md").read_text()
        for field in ["wrong-author", "same-topic", "private/key.json", "human_review_pending"]:
            self.assertIn(field, text)

if __name__ == "__main__":
    unittest.main()
