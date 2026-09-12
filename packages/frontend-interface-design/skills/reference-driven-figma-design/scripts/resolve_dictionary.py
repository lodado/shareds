"""Locate and verify local-only taxonomy data. Never fetch or execute reference content."""

import argparse
import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def resolve_dictionary(candidates, files):
    checked = set()
    for candidate in candidates:
        root = Path(candidate).expanduser().resolve()
        if root in checked:
            continue
        checked.add(root)
        if not root.is_dir():
            continue
        try:
            for entry in files:
                name = entry["name"]
                if Path(name).name != name or not name.endswith(".md"):
                    raise ValueError("unsafe manifest filename")
                path = (root / name).resolve()
                if not path.is_relative_to(root):
                    raise ValueError("reference file escapes the snapshot")
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                if digest != entry["sha256"]:
                    raise ValueError(f"checksum mismatch: {name}")
        except (OSError, ValueError) as error:
            # A corrupt existing source is not silently bypassed by another candidate.
            return {"status": "HOLD", "reason": str(error), "path": str(root)}
        return {"status": "READY", "path": str(root), "files": [entry["name"] for entry in files]}
    return {"status": "HOLD", "reason": "No verified local dictionary found; reference text is not bundled."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", help="Use this local snapshot only; do not silently fall back.")
    args = parser.parse_args()
    explicit = args.path or os.environ.get("FIGMA_DESIGN_DICTIONARY")
    codex_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    candidates = [explicit] if explicit else [
        ROOT / "references/dictionary",
        codex_home / "skills/reference-driven-figma-design/references/dictionary",
        Path.home() / ".agents/skills/frontend-interface-design/references/dictionary",
    ]
    manifest = json.loads((ROOT / "references/dictionary-sources.json").read_text())
    result = resolve_dictionary(candidates, manifest["files"])
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "READY" else 1


if __name__ == "__main__":
    raise SystemExit(main())
