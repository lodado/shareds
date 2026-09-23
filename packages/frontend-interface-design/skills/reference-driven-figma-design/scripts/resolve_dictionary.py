"""Locate and verify local-only taxonomy data. Never fetch or execute reference content."""

import argparse
import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# One shared snapshot for every host and plugin version; nothing is copied into installs.
DEFAULT_PATH = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local/share") / "vibe-dictionary"


def resolve_dictionary(root, files):
    root = Path(root).expanduser().resolve()
    if not root.is_dir():
        return {
            "status": "HOLD",
            "reason": "No local dictionary; reference text is not bundled. Place the snapshot here or set FIGMA_DESIGN_DICTIONARY.",
            "path": str(root),
        }
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
        return {"status": "HOLD", "reason": str(error), "path": str(root)}
    return {"status": "READY", "path": str(root), "files": [entry["name"] for entry in files]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", help="Use this local snapshot instead of the shared default.")
    args = parser.parse_args()
    root = args.path or os.environ.get("FIGMA_DESIGN_DICTIONARY") or DEFAULT_PATH
    manifest = json.loads((ROOT / "references/dictionary-sources.json").read_text())
    result = resolve_dictionary(root, manifest["files"])
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "READY" else 1


if __name__ == "__main__":
    raise SystemExit(main())
