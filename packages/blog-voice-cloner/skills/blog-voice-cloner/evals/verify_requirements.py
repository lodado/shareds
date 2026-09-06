#!/usr/bin/env python3
"""Record individual observed tests and bounded saved-draft outcomes."""
import io
import json
import re
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]

class RecordedResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.observations = []
    def addSuccess(self, test):
        super().addSuccess(test)
        self.observations.append({"test": test.id(), "observed": "passed"})
    def addFailure(self, test, error):
        super().addFailure(test, error)
        self.observations.append({"test": test.id(), "observed": "failed"})
    def addError(self, test, error):
        super().addError(test, error)
        self.observations.append({"test": test.id(), "observed": "error"})
    def addSkip(self, test, reason):
        super().addSkip(test, reason)
        self.observations.append({"test": test.id(), "observed": "skipped", "reason": reason})

suite = unittest.defaultTestLoader.discover(str(ROOT / "tests"), pattern="test_*.py")
stream = io.StringIO()
result = unittest.TextTestRunner(stream=stream, resultclass=RecordedResult).run(suite)
print(stream.getvalue())
outputs = {}
for name in "ABCDE":
    text = (ROOT / "evals/smoke" / (name + ".md")).read_text()
    outputs[name] = {
        "copied_distinctive_transition": text.count("문제는 여기서부터다."),
        "copied_rhetorical_question": text.count("왜 그럴까?"),
        "question_marks": text.count("?"),
        "ttl_60_literal_present": "60" in text,
        "fictional_biography_marker": any(x in text for x in ["열두 대", "서버 12대", "지난 겨울"]),
    }
mapping = (ROOT / "evals/requirement-map.md").read_text()
referenced_tests = sorted(set(re.findall(r"`(test_[a-zA-Z0-9_]+)`", mapping)))
executed_tests = {item["test"].rsplit(".", 1)[-1] for item in result.observations}
missing = sorted(set(referenced_tests) - executed_tests)
assert not missing, f"Mapped checks did not execute: {missing}"
requirement_ids = sorted(set(int(value) for value in re.findall(r"^\|\s*(\d+)\s*\|", mapping, re.M)))
assert requirement_ids == list(range(1, 21)), requirement_ids
observations = {"mapped_requirement_ids": requirement_ids, "mapped_tests_executed": referenced_tests,
    "mapping_limit": "All sections enumerated, but behavioral evidence remains partial where human or real-author evaluation is absent.",
    "tests_run": result.testsRun, "successful": result.wasSuccessful(),
    "tests": result.observations, "saved_variant_observations": outputs,
    "bounded_improvement": {
        "comparison": "B raw few-shot versus D structured profile plus role example",
        "observed": "Source catchphrase copying decreased in this saved sample. Question frequency also decreased, which is not itself evidence of a better style match. Facts require separate semantic review.",
        "catchphrase_reduction": outputs["B"]["copied_distinctive_transition"] - outputs["D"]["copied_distinctive_transition"],
        "questions_reduction": outputs["B"]["question_marks"] - outputs["D"]["question_marks"],
        "style_preference": "not_run", "human_editing_effort": "not_run",
        "limitations": "Non-randomized saved smoke samples, two generation contexts, no causal or real-author efficacy conclusion."},
    "required_followups": ["Real author corpus and independent held-out evaluation", "Human blinded pairwise preference and actual edit effort"]}
(ROOT / "evals/requirement-observations.json").write_text(json.dumps(observations, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"tests_run": result.testsRun, "successful": result.wasSuccessful(), "saved_variant_observations": outputs}, ensure_ascii=False, indent=2))
sys.exit(0 if result.wasSuccessful() else 1)
