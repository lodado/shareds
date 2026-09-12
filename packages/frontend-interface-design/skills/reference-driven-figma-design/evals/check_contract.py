"""Static skill contract checks, not proof of agent or Figma execution quality."""

import hashlib
import json
import re
import runpy
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def check():
    cases = json.loads((ROOT / "evals/behavior-cases.json").read_text())["cases"]
    assert len({case["id"] for case in cases}) == len(cases), "duplicate case IDs"
    for case in cases:
        assert all(case.get(key) for key in ("id", "prompt", "expected_invariants", "forbidden")), case
    guide = ROOT / "references/taxonomy-reference-workflow.md"
    assert guide.is_file(), "missing taxonomy-to-reference workflow"
    main = (ROOT / "SKILL.md").read_text()
    assert "references/taxonomy-reference-workflow.md" in main, "unreachable mandatory workflow"
    contract = guide.read_text()
    for heading in (
        "## 1. 사전 해석과 무결성",
        "## 2. 키워드를 검색 의도로 변환",
        "## 3. 화면 근거와 컴포넌트 출처를 분리",
        "## 4. 능동적인 응용의 범위",
        "## 5. 비교 파일럿과 완료 게이트",
    ):
        assert heading in contract, heading
    for filename in ("research-selection.md", "figma-composition.md", "critique-refinement.md", "delivery-contract.md"):
        assert "taxonomy-reference-workflow.md" in (ROOT / "references" / filename).read_text(), filename
    # Publish only fingerprints/provenance; third-party source text stays local-only.
    manifest = json.loads((ROOT / "references/dictionary-sources.json").read_text())
    entries = manifest["files"]
    assert manifest["source_index"] == "https://vibedesignlab.net/dictionary"
    assert "Local use only" in manifest["usage"]
    assert len({entry["name"] for entry in entries}) == len(entries) == 13
    for entry in entries:
        assert Path(entry["name"]).name == entry["name"]
        assert re.fullmatch(r"[a-f0-9]{64}", entry["sha256"])
    assert sum(entry["name"].endswith("taxonomy.md") for entry in entries) == 8
    resolve = runpy.run_path(str(ROOT / "scripts/resolve_dictionary.py"))["resolve_dictionary"]
    with tempfile.TemporaryDirectory() as directory:
        base = Path(directory)
        good = base / "good"
        good.mkdir()
        data = b"Synthetic taxonomy fixture, not third-party source text."
        (good / "sample.md").write_bytes(data)
        files = [{"name": "sample.md", "sha256": hashlib.sha256(data).hexdigest()}]
        assert resolve([base / "missing"], files)["status"] == "HOLD"
        assert resolve([base / "missing", good], files)["status"] == "READY"
        bad = base / "bad"
        bad.mkdir()
        (bad / "sample.md").write_bytes(b"tampered")
        assert resolve([bad, good], files)["status"] == "HOLD", "do not bypass corruption"
        assert resolve([good], [{**files[0], "name": "../sample.md"}])["status"] == "HOLD"
        (bad / "sample.md").unlink()
        (bad / "sample.md").symlink_to(good / "sample.md")
        assert resolve([bad], files)["status"] == "HOLD", "reject file escape"
    # Verify local Markdown destinations in the authored workflow; imported docs remain unchanged.
    authored = [ROOT / "SKILL.md", guide] + [ROOT / "references" / name for name in (
        "component-source-gate.md", "research-selection.md", "figma-composition.md",
        "critique-refinement.md", "delivery-contract.md",
    )]
    for path in authored:
        for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", path.read_text()):
            if re.match(r"[a-zA-Z][a-zA-Z0-9+.-]*:", target) or target.startswith("#"):
                continue
            destination = target.split("#", 1)[0]
            assert (path.parent / destination).exists(), (path, target)
    print(f"PASS: {len(cases)} fixture records, workflow links, {len(entries)} source fingerprints, 5 resolver checks")
    print("Static checks only; behavioral evaluation and real Figma verification are separate.")


if __name__ == "__main__":
    check()
