#!/usr/bin/env python3
"""Synthetic acceptance fixtures using installed real runners, never project suites.

No downloads, installs, services, or existing project writes. Same-user processes
are trusted: PID/process groups and AGENT_TEST_HOME are not a security sandbox.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time


PACKAGES = {"vitest": "vitest", "jest": "jest", "playwright": "@playwright/test"}


def inventory(root, seconds=20):
    """Bounded local node_modules inventory, including pnpm's package store."""
    found = {}
    deadline = time.monotonic() + seconds
    visited = 0
    for current, dirs, _ in os.walk(root):
        visited += 1
        if time.monotonic() > deadline or visited > 50000:
            return found, False
        dirs[:] = sorted(d for d in dirs if d not in {".git", ".cache", "dist", "build"})
        if "node_modules" not in dirs:
            continue
        modules = Path(current) / "node_modules"
        dirs.remove("node_modules")
        candidates = [modules]
        store = modules / ".pnpm"
        if store.is_dir():
            candidates.extend(p / "node_modules" for p in sorted(store.iterdir())
                              if p.name.startswith(("vitest@", "jest@", "@playwright+test@")))
        for base in candidates:
            for runner, package in PACKAGES.items():
                manifest = base / package / "package.json"
                try:
                    data = json.loads(manifest.read_text())
                    major = int(data["version"].split(".")[0])
                    key = f"vitest{major}" if runner == "vitest" else runner
                    if runner != "vitest" or major in (2, 3, 4, 5):
                        found.setdefault(key, {"runner": runner, "version": data["version"],
                                               "modules": str(base.resolve())})
                except (OSError, ValueError, KeyError):
                    continue
    return found, True


def capture(argv, cwd, env, timeout=8):
    result = subprocess.run(argv, cwd=cwd, env=env, capture_output=True,
                            text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f"command failed ({result.returncode}): {result.stderr[-2000:]}")
    return result.stdout


def fixture(path, kind, installed, env, node):
    path.mkdir()
    capture(["git", "init", "-q", str(path)], path, env)
    capture(["git", "-c", "core.hooksPath=/dev/null", "-c", "user.name=Smoke", "-c", "user.email=smoke@example.invalid",
             "commit", "--allow-empty", "-qm", "synthetic acceptance fixture"], path, env)
    (path / "package.json").write_text('{"private":true}\n')
    if installed:
        # Keep cache/temp directories local, never write through a node_modules root symlink.
        modules = path / "node_modules"
        modules.mkdir()
        for entry in Path(installed["modules"]).iterdir():
            if entry.name not in {".vite", ".vite-temp", ".cache"}:
                (modules / entry.name).symlink_to(entry.resolve(), target_is_directory=entry.is_dir())
    # Each test records observable execution identity, rather than trusting argv.
    witness = """const fs = require('node:fs');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
function witness() {
 assert.equal(2 + 2, 4);
 assert.equal(process.env.SMOKE_VALUE, 'synthetic-only');
 assert.equal(process.cwd(), process.env.SMOKE_CWD);
 const git = (...args) => cp.execFileSync('git', args, {encoding:'utf8'}).trim();
 fs.writeFileSync(process.env.SMOKE_EVIDENCE, JSON.stringify({cwd:process.cwd(),
 worktree:git('rev-parse','--show-toplevel'),
 common:git('rev-parse','--path-format=absolute','--git-common-dir'),
 env:process.env.SMOKE_VALUE, arithmetic:2+2}));
 console.log('SMOKE_IDENTITY_OK');
}
"""
    (path / "witness.cjs").write_text(witness + "module.exports = witness;\n")
    if kind == "vitest":
        (path / "smoke.test.mjs").write_text("import {test} from 'vitest';\nimport witness from './witness.cjs';\ntest('synthetic arithmetic env identity', witness);\n")
        (path / "vitest.config.mjs").write_text("export default {cacheDir:'.smoke-vite-cache',test:{include:['smoke.test.mjs'],environment:'node'}};\n")
        return ["vitest", "run", "--config", "vitest.config.mjs"]
    if kind == "jest":
        (path / "smoke.test.cjs").write_text("test('synthetic arithmetic env identity', require('./witness.cjs'));\n")
        (path / "jest.config.cjs").write_text("module.exports={cacheDirectory:'.smoke-jest-cache',testEnvironment:'node',testMatch:['**/smoke.test.cjs']};\n")
        return ["jest", "--config", "jest.config.cjs"]
    if kind == "playwright":
        (path / "smoke.spec.cjs").write_text("const {test,expect}=require('@playwright/test');\nconst witness=require('./witness.cjs');\ntest('synthetic actual browser',async({page})=>{await page.setContent('<h1>4</h1>');await expect(page.locator('h1')).toHaveText('4');witness();});\n")
        (path / "playwright.config.cjs").write_text("module.exports={testDir:'.',testMatch:'smoke.spec.cjs',reporter:'line',use:{browserName:'chromium',headless:true},timeout:15000};\n")
        return ["playwright", "test", "--config", "playwright.config.cjs"]
    if kind == "node":
        (path / "smoke.test.cjs").write_text("require('node:test')('synthetic arithmetic env identity',require('./witness.cjs'));\n")
        return ["node", "--test", "smoke.test.cjs"]
    (path / "smoke.py").write_text("import json,os,subprocess\nfrom pathlib import Path\nassert 2+2 == 4\nassert os.environ['SMOKE_VALUE']=='synthetic-only'\nassert os.getcwd()==os.environ['SMOKE_CWD']\ndef git(*args): return subprocess.check_output(['git',*args],text=True).strip()\nPath(os.environ['SMOKE_EVIDENCE']).write_text(json.dumps(dict(cwd=os.getcwd(),worktree=git('rev-parse','--show-toplevel'),common=git('rev-parse','--path-format=absolute','--git-common-dir'),env=os.environ['SMOKE_VALUE'],arithmetic=4)))\nprint('SMOKE_IDENTITY_OK',flush=True)\n")
    return [sys.executable, "smoke.py"]


def sanitize(value, replacements):
    if isinstance(value, str):
        for original, label in sorted(replacements.items(), key=lambda item: -len(item[0])):
            value = value.replace(original, label)
        return value
    if isinstance(value, list):
        return [sanitize(item, replacements) for item in value]
    if isinstance(value, dict):
        return {key: sanitize(item, replacements) for key, item in value.items()}
    return value


def execute(args):
    cli_path = shutil.which(args.cli) if os.sep not in args.cli else str(Path(args.cli).expanduser().resolve())
    node = shutil.which("node")
    if not cli_path or not node:
        return {"status": "blocked", "reason": "public CLI and Node are required"}
    # Repository source CLI may intentionally lack its installed executable bit.
    cli = [cli_path] if os.access(cli_path, os.X_OK) else [sys.executable, cli_path]
    installed, complete = inventory(Path(args.search_root).expanduser())
    report = {"scope": "synthetic fixtures with real installed runner/browser, NOT existing project suites",
              "trust_boundary": "same-user processes trusted, not a security sandbox",
              "inventory_complete": complete, "config": {"budget": 4, "workers": 2, "max_runs": 2},
              "jobs": [], "samples": [], "blocked": [], "violations": []}
    for key in ("vitest2", "vitest3", "vitest4", "vitest5", "jest", "playwright"):
        if key not in installed:
            report["blocked"].append({"runner": key, "reason": "not found in bounded installed inventory"})
    with tempfile.TemporaryDirectory(prefix="agent-smoke-") as temporary:
        root = Path(temporary).resolve()
        home = root / "state"
        home.mkdir(mode=0o700)
        env = dict(os.environ, AGENT_TEST_HOME=str(home), CI="1", NO_COLOR="1",
                   PYTHONDONTWRITEBYTECODE="1")
        replacements = {str(root): "$SCRATCH", str(Path.home()): "$HOME"}
        jobs = []
        try:
            capture([*cli, "config", "--set", "budget=4", "workers=2", "max_runs=2", "timeout=40", "--json"], root, env)
            cases = [(key, row["runner"], row) for key, row in sorted(installed.items())]
            cases.extend([("node", "node", None), ("generic", "generic", None)])
            prepared = []
            for index, (name, runner, row) in enumerate(cases):
                cwd = root / name
                command = fixture(cwd, runner, row, env, node)
                if runner == "node":
                    linked = root / "linked-node"
                    capture(["git", "-C", str(cwd), "worktree", "add", "--detach", str(linked)], root, env)
                    for file in ("package.json", "witness.cjs", "smoke.test.cjs"):
                        shutil.copy2(cwd / file, linked / file)
                    cwd = linked
                evidence = root / f"evidence-{index}.json"
                job_env = dict(env, SMOKE_VALUE="synthetic-only", SMOKE_CWD=str(cwd), SMOKE_EVIDENCE=str(evidence))
                log_path = root / f"output-{index}.log"
                prepared.append({"name": name, "runner": runner, "version": row["version"] if row else None,
                                 "log": log_path, "evidence": evidence, "cwd": cwd, "env": job_env,
                                 "command": command,
                                 "common": capture(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd, env).strip()})
            # Submit together after setup, so fixture creation cannot serialize the run.
            for job in prepared:
                with job["log"].open("wb") as output:
                    worker_flags = [] if job["runner"] == "generic" else ["--workers", "1"]
                    process = subprocess.Popen([*cli, "run", "--runner", job["runner"], *worker_flags, "--timeout", "40", "--", *job["command"]],
                                               cwd=job["cwd"], env=job["env"], stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
                jobs.append({**job, "process": process})
            deadline = time.monotonic() + args.timeout
            while any(job["process"].poll() is None for job in jobs):
                if time.monotonic() >= deadline:
                    raise TimeoutError("bounded acceptance deadline exceeded")
                status = json.loads(capture([*cli, "status", "--json"], root, env))
                sample = {key: status.get(key) for key in ("used_tokens", "active_runs", "queued")}
                report["samples"].append(sample)
                if not isinstance(sample["used_tokens"], int) or not 0 <= sample["used_tokens"] <= 4:
                    report["violations"].append("token budget invalid")
                if not isinstance(sample["active_runs"], int) or not 0 <= sample["active_runs"] <= 2:
                    report["violations"].append("active run limit invalid")
                time.sleep(.1)
            report["observed_max_tokens"] = max((s["used_tokens"] or 0 for s in report["samples"]), default=0)
            report["observed_max_active"] = max((s["active_runs"] or 0 for s in report["samples"]), default=0)
            report["observed_queue"] = any((s["queued"] or 0) > 0 for s in report["samples"])
            report["concurrency_observed"] = report["observed_max_active"] == 2
            for job in jobs:
                output = job["log"].read_text(errors="replace")
                evidence = json.loads(job["evidence"].read_text()) if job["evidence"].exists() else None
                identity = evidence == {"cwd": str(job["cwd"]), "worktree": str(job["cwd"]),
                                        "common": job["common"], "env": "synthetic-only", "arithmetic": 4}
                blocked_browser = job["runner"] == "playwright" and ("Executable doesn't exist" in output or "browserType.launch: Executable" in output)
                state = "blocked" if blocked_browser else "pass" if job["process"].returncode == 0 and identity and "SMOKE_IDENTITY_OK" in output else "fail"
                report["jobs"].append({"name": job["name"], "runner": job["runner"], "version": job["version"],
                                       "status": state, "exit_code": job["process"].returncode,
                                       "identity_verified": identity, "linked_worktree": job["cwd"].name == "linked-node",
                                       "evidence": evidence, "output_tail": output[-12000:], "output_truncated": len(output) > 12000})
            status = json.loads(capture([*cli, "status", "--json"], root, env))
            if status.get("active_runs") != 0 or status.get("used_tokens") != 0 or status.get("queued") != 0:
                report["violations"].append("scheduler not idle after completion")
        except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired, TimeoutError, InterruptedError) as exc:
            report["error"] = str(exc)
        finally:
            # A second interrupt must not bypass owned-process cleanup.
            for sig in (signal.SIGINT, signal.SIGTERM):
                signal.signal(sig, signal.SIG_IGN)
            # Cancel only jobs in our private scheduler home, never a user's daemon.
            for job in jobs:
                if job["process"].poll() is None:
                    try:
                        os.killpg(job["process"].pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
            for job in jobs:
                try:
                    job["process"].wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(job["process"].pid, signal.SIGKILL)
                    job["process"].wait(timeout=5)
            try:
                status = json.loads(capture([*cli, "status", "--json"], root, env))
                for job in status.get("jobs", []):
                    if job.get("state") in ("queued", "running", "starting", "cancelling"):
                        capture([*cli, "cancel", job["id"], "--json"], root, env)
                for _ in range(30):
                    status = json.loads(capture([*cli, "status", "--json"], root, env))
                    if not status.get("active_runs") and not status.get("queued"):
                        break
                    time.sleep(.1)
                capture([*cli, "stop", "--json"], root, env)
                report["cleanup"] = "private scheduler stopped; owned temporary resources removed"
            except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
                report["cleanup_error"] = str(exc)
        report["status"] = "fail" if report.get("error") or report.get("cleanup_error") or report["violations"] or any(j["status"] == "fail" for j in report["jobs"]) else "blocked" if report["blocked"] or any(j["status"] == "blocked" for j in report["jobs"]) else "pass"
        return sanitize(report, replacements)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cli", default="agent-test", help="installed public CLI, not an internal daemon API")
    parser.add_argument("--search-root", default="~/orca")
    parser.add_argument("--timeout", type=int, default=90)
    args = parser.parse_args()
    if not 10 <= args.timeout <= 180:
        parser.error("timeout must be between 10 and 180 seconds")
    def interrupted(signum, _frame):
        raise InterruptedError(f"received signal {signum}")
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, interrupted)
    try:
        report = execute(args)
    except (OSError, InterruptedError) as exc:
        report = {"status": "fail", "error": type(exc).__name__}
    print(json.dumps(report, indent=2))
    return {"pass": 0, "blocked": 2, "fail": 1}[report["status"]]


if __name__ == "__main__":
    sys.exit(main())
