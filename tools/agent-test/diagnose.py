"""Read-only test-runner inventory. Never reads environment files or executes scripts."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import time

SKIP = {"node_modules", ".git", ".next", "dist", "build", ".cache", ".turbo", ".venv", "venv", "vendor", "target", "__pycache__"}
RUNNERS = {
    "vitest": ("vitest",), "playwright": ("@playwright/test", "playwright"),
    "jest": ("jest", "jest-cli"), "mocha": ("mocha",), "ava": ("ava",),
    "tap": ("tap",), "cypress": ("cypress",),
}
PATTERNS = {name: re.compile(r"(?<![\w-])" + name + r"(?:\s|$)") for name in RUNNERS}
PATTERNS.update({"node:test": re.compile(r"\bnode\b[^;&|]*\s--test(?:[=\s]|$)"),
                 "bun:test": re.compile(r"\bbun\s+test(?:\s|$)"),
                 "pytest": re.compile(r"\bpytest(?:\s|$)")})


def capture(argv):
    try:
        result = subprocess.run(argv, text=True, capture_output=True, timeout=10)
        return {"code": result.returncode, "output": result.stdout.strip(), "error": result.stderr.strip()}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"error": str(error)}


def read_json(path):
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def installed_version(path, dependency):
    # Resolve hoisted dependencies without importing or executing any package.
    for parent in (path, *path.parents):
        version = read_json(parent / "node_modules" / dependency / "package.json").get("version")
        if isinstance(version, str) and re.fullmatch(r"[0-9][\w.+-]{0,99}", version):
            return version
    return None


def inventory(root):
    repos, packages, python_projects = [], [], []
    for directory, dirs, files in os.walk(root):
        path = Path(directory)
        dirs[:] = sorted(name for name in dirs if name not in SKIP and not name.startswith("."))
        if (path / ".git").exists():
            repos.append(str(path))
        if "package.json" in files:
            data = read_json(path / "package.json")
            raw_scripts = data.get("scripts", {})
            scripts = {k: v for k, v in raw_scripts.items() if isinstance(v, str)} if isinstance(raw_scripts, dict) else {}
            dependencies = {}
            for field in ("dependencies", "devDependencies", "optionalDependencies"):
                values = data.get(field, {})
                if isinstance(values, dict):
                    dependencies.update(values)
            runners = {}
            for name, pattern in PATTERNS.items():
                matches = [key for key, value in scripts.items() if pattern.search(value)]
                declared = {dep: (spec if isinstance(spec, str) and re.fullmatch(r"[\w.^~*+<>=| /-]{1,100}", spec)
                                  else "non-version declaration omitted")
                            for dep in RUNNERS.get(name, ()) if dep in dependencies for spec in [dependencies[dep]]}
                installed = {dep: version for dep in RUNNERS.get(name, ()) if (version := installed_version(path, dep))}
                if matches or declared or installed:
                    runners[name] = {"declared": declared, "installed": installed, "script_names": matches}
            if runners:
                # Script bodies can embed credentials. Record runner identification and
                # script names, never arbitrary shell text or config contents.
                manager = data.get("packageManager")
                if not isinstance(manager, str) or not re.fullmatch(r"(?:npm|pnpm|yarn|bun)@[\w.+-]{1,120}", manager):
                    manager = None
                packages.append({"path": str(path), "package_manager": manager,
                                 "runners": runners, "test_script_names": [k for k in scripts if k.startswith("test")],
                                 "config_files": sorted(p.name for p in path.iterdir() if p.is_file() and
                                     any(p.name.startswith(prefix) for prefix in ("vitest.config.", "playwright.config.", "jest.config.", "bunfig.")))})
        manifests = [name for name in ("pyproject.toml", "pytest.ini", "setup.cfg", "requirements.txt", "requirements-dev.txt", "tox.ini") if name in files]
        evidence = []
        for name in manifests:
            try:
                text = (path / name).read_text()
            except (OSError, UnicodeError):
                continue
            if re.search(r"(?i)\bpytest\b", text):
                evidence.append(name)
        if evidence:
            versions = []
            for site in (path / ".venv/lib").glob("python*/site-packages/pytest-*.dist-info"):
                versions.append(site.name.removeprefix("pytest-").removesuffix(".dist-info"))
            python_projects.append({"path": str(path), "runner": "pytest", "declaration_files": evidence,
                                    "installed_versions": sorted(versions)})
    return {"repositories": sorted(repos), "packages": packages, "python_projects": python_projects,
            "runner_package_counts": {name: sum(name in p["runners"] for p in packages) for name in PATTERNS},
            "limitations": ["Only manifests, known config filenames and installed package metadata inspected.",
                            "Scripts are identified but never executed, shell bodies omitted to avoid embedded secrets.",
                            "Python installations outside repository .venv and undeclared custom runners are not inferred."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.home() / "orca")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    info = {"schema_version": 2, "captured_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "inventory": inventory(args.root)}
    for name, argv in {
        "topology": ["sysctl", "hw.model", "hw.ncpu", "hw.physicalcpu", "hw.logicalcpu", "hw.memsize"],
        "swap": ["sysctl", "vm.swapusage"], "memory": ["memory_pressure", "-Q"],
        "vm": ["vm_stat"], "thermal": ["pmset", "-g", "therm"]}.items():
        info[name] = capture(argv)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(info, indent=2) + "\n")
    print(json.dumps({"repositories": len(info["inventory"]["repositories"]),
                      "packages": len(info["inventory"]["packages"]),
                      "python_projects": len(info["inventory"]["python_projects"]),
                      "runners": info["inventory"]["runner_package_counts"]}, indent=2))


if __name__ == "__main__":
    main()
