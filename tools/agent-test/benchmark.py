#!/usr/bin/env python3
"""Bounded, stdlib-only real test-runner benchmark. No installs or project edits.

CPU accounting uses wait4 on each owned child. On Unix this includes descendants
whose usage the child collected by waiting, not detached/unwaited descendants.
The process-tree ps samples independently expose live descendant CPU and RSS.
"""
import argparse
import base64
import datetime
import json
import os
from pathlib import Path
import platform
import re
import shutil
import signal
import socket
import statistics
import subprocess
import tempfile
import time

TEST_NAMES = (
    "piiMask", "fieldSchemaAdapter.attachMeta", "fieldSchemaAdapter.bbox",
    "fieldSchemaAdapter.confidence", "fieldSchemaAdapter.maskstate",
    "maskVisibility", "review-utils", "schemaFieldValueType",
)
NODE = "/Users/chungheon/.nvm/versions/node/v26.7.0/bin/node"


def capture(command):
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=3)
        return {"command": command, "exit_code": result.returncode,
                "stdout": result.stdout, "stderr": result.stderr}
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"command": command, "unavailable": str(exc)}


def pressure():
    memory = capture(["sysctl", "-n", "kern.memorystatus_vm_pressure_level"])
    thermal = capture(["pmset", "-g", "therm"])
    level = memory.get("stdout", "").strip()
    text = thermal.get("stdout", "")
    speed = re.search(r"CPU_Speed_Limit\s*=\s*(\d+)", text)
    warning = re.search(r"(?:Thermal|Performance)\w*\s*=\s*([2-9]\d*)", text)
    severe = level == "4" or bool(warning) or bool(speed and int(speed[1]) < 50)
    return {"memory": memory, "thermal": thermal, "severe": severe}


def scheduler_status(root):
    """Query only our isolated scheduler, without retaining commands/env."""
    try:
        with socket.socket(socket.AF_UNIX) as client:
            client.settimeout(1)
            client.connect(str(root / "scheduler.sock"))
            client.sendall(b'{"action":"status"}\n')
            with client.makefile("rb") as stream:
                return json.loads(stream.readline(4 * 1024 * 1024))
    except (OSError, ValueError):
        return {}


def snapshot():
    return {
        "time": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "platform": platform.platform(), "cpu_count": os.cpu_count(),
        "memory": capture(["vm_stat"]),
        "swap": capture(["sysctl", "vm.swapusage"]),
        "hardware": capture(["sysctl", "hw.memsize", "hw.ncpu"]),
        "pressure": pressure(),
        "process_snapshot": "omitted: unrelated process data is not retained",
    }


def process_sample(roots):
    raw = capture(["ps", "-axo", "pid=,ppid=,pcpu=,rss="])
    rows = []
    for line in raw.get("stdout", "").splitlines():
        fields = line.split()
        if len(fields) == 4:
            try:
                rows.append((int(fields[0]), int(fields[1]), float(fields[2]), int(fields[3])))
            except ValueError:
                continue
    selected = set(roots)
    while True:
        children = {pid for pid, parent, _, _ in rows if parent in selected}
        expanded = selected | children
        if expanded == selected:
            break
        selected = expanded
    owned = [row for row in rows if row[0] in selected]
    return {"cpu_percent": sum(row[2] for row in owned),
            "rss_kib": sum(row[3] for row in owned),
            "process_count": len(owned), "processes": owned,
            "sample_error": raw.get("unavailable")}


def reap(job):
    if job["done"]:
        return
    pid, status, usage = os.wait4(job["process"].pid, os.WNOHANG)
    if pid:
        job.update(done=True, exit_code=os.waitstatus_to_exitcode(status),
                   run_s=time.monotonic() - job["started"],
                   cpu_user_s=usage.ru_utime, cpu_system_s=usage.ru_stime)
        job["process"].returncode = job["exit_code"]


def terminate_owned(jobs):
    if not jobs:
        return
    # Every root was launched start_new_session=True. Never signal external PIDs.
    for job in jobs:
        if not job["done"]:
            try:
                os.killpg(job["process"].pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    time.sleep(0.2)
    for job in jobs:
        reap(job)
        if not job["done"]:
            try:
                os.killpg(job["process"].pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


def experiment(command, project, concurrency, copies, scratch, deadline, interval,
               environment=None, scheduler_home=None, max_rss_kib=8 * 1024 * 1024):
    start = time.monotonic()
    jobs, samples, checks = [], [], []
    abort = None
    next_sample = next_pressure = start
    try:
        while len(jobs) < copies or any(not j["done"] for j in jobs):
            now = time.monotonic()
            if now >= deadline:
                abort = "overall_budget"
            if any(not j["done"] and now - j["started"] >= 55 for j in jobs):
                abort = "job_timeout_55s"
            if now >= next_pressure:
                check = pressure()
                checks.append({"elapsed_s": now - start, **check})
                next_pressure = now + 5
                if check["severe"]:
                    abort = "severe_pressure_or_thermal"
            if abort:
                terminate_owned(jobs)
            while not abort and len(jobs) < copies and sum(not j["done"] for j in jobs) < concurrency:
                index = len(jobs)
                job_command = command(index) if callable(command) else command
                env = dict(os.environ, CI="1", NO_COLOR="1", **(environment or {}))
                env["PATH"] = str(Path(NODE).parent) + os.pathsep + env.get("PATH", "")
                # Tests can print credentials. No raw output is ever persisted.
                proc = subprocess.Popen(job_command, cwd=project, stdout=subprocess.DEVNULL,
                                        stderr=subprocess.DEVNULL, env=env, start_new_session=True)
                jobs.append({"process": proc, "started": time.monotonic(),
                             "wait_s": time.monotonic() - start,
                             "done": False, "index": index, "command": job_command})
            if now >= next_sample:
                roots = [j["process"].pid for j in jobs if not j["done"]]
                if scheduler_home:
                    state = scheduler_status(scheduler_home)
                    roots.extend(row["pid"] for row in state.get("jobs", []) if isinstance(row.get("pid"), int))
                sample = process_sample(roots)
                samples.append({"elapsed_s": time.monotonic() - start, **sample})
                if sample["rss_kib"] > max_rss_kib:
                    abort = "owned_tree_rss_limit"
                next_sample = time.monotonic() + interval
            for job in jobs:
                reap(job)
            if abort and all(j["done"] for j in jobs):
                break
            time.sleep(0.025)
    finally:
        terminate_owned([j for j in jobs if not j["done"]])
        for job in jobs:
            if not job["done"]:
                _, status, usage = os.wait4(job["process"].pid, 0)
                code = os.waitstatus_to_exitcode(status)
                job.update(done=True, exit_code=code,
                           run_s=time.monotonic() - job["started"],
                           cpu_user_s=usage.ru_utime, cpu_system_s=usage.ru_stime)
                job["process"].returncode = code
    wall = time.monotonic() - start
    exported = [{k: v for k, v in j.items() if k not in ("process", "started", "done")} for j in jobs]
    successes = sum(j.get("exit_code") == 0 for j in jobs)
    timing = scheduler_status(scheduler_home) if scheduler_home else {}
    queue_rows = [{key: row.get(key) for key in ("id", "state", "workers", "wait_seconds", "run_seconds", "code")}
                  for row in [*timing.get("recent", []), *timing.get("jobs", [])]]
    return {"command": "per-job commands recorded below", "wall_s": wall,
            "scheduler_telemetry_available": bool(timing) if scheduler_home else None,
            "scheduler_job_timings": queue_rows, "jobs": exported,
            "jobs_requested": copies, "jobs_successful": successes,
            "exit_failures": sum(j.get("exit_code") != 0 for j in jobs),
            "jobs_per_second": successes / wall,
            "cpu_user_system_s": sum(j.get("cpu_user_s", 0) + j.get("cpu_system_s", 0) for j in jobs),
            "sampled_max_tree_rss_kib": max((s["rss_kib"] for s in samples), default=0),
            "sampled_max_tree_cpu_percent": max((s["cpu_percent"] for s in samples), default=0),
            "samples": samples, "pressure_checks": checks, "abort": abort}


def summarize(data):
    groups = {}
    for row in data["experiments"]:
        groups.setdefault(row["name"], []).append(row)
    return [{"name": name, "repeats": len(rows),
             **{key: statistics.median(row[key] for row in rows) for key in
                ("wall_s", "cpu_user_system_s", "sampled_max_tree_rss_kib",
                 "sampled_max_tree_cpu_percent", "jobs_per_second")},
             "client_e2e_s": statistics.median(values) if (values := [job["run_s"] for row in rows for job in row["jobs"] if "run_s" in job]) else 0,
             "scheduler_wait_s": statistics.median(values) if (values := [job["wait_seconds"] for row in rows for job in row.get("scheduler_job_timings", []) if isinstance(job.get("wait_seconds"), (int, float))]) else None,
             "scheduler_run_s": statistics.median(values) if (values := [job["run_seconds"] for row in rows for job in row.get("scheduler_job_timings", []) if isinstance(job.get("run_seconds"), (int, float))]) else None,
             "exit_failures": sum(row["exit_failures"] for row in rows),
             "aborts": [row["abort"] for row in rows if row["abort"]]}
            for name, rows in groups.items()]


def save(output, data):
    data["summary_medians"] = summarize(data)
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_suffix(output.suffix + ".partial")
    temp.write_text(json.dumps(data, indent=2) + "\n")
    temp.replace(output)
    lines = ["# Agent test benchmark", "", "All RSS/CPU maxima below are sampled, not true peaks.", "",
             "| Case | n | wall s | CPU s | RSS MiB | jobs/s | client e2e s | scheduler wait/run s | failures |",
             "|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for row in data["summary_medians"]:
        queue = "n/a" if row["scheduler_wait_s"] is None or row["scheduler_run_s"] is None else f"{row['scheduler_wait_s']:.3f}/{row['scheduler_run_s']:.3f}"
        lines.append(f"| {row['name']} | {row['repeats']} | {row['wall_s']:.3f} | {row['cpu_user_system_s']:.3f} | {row['sampled_max_tree_rss_kib']/1024:.1f} | {row['jobs_per_second']:.3f} | {row['client_e2e_s']:.3f} | {queue} | {row['exit_failures']} |")
    if data.get("scheduler"):
        lines.extend(["", "Scheduler CPU seconds are client wait4 only, not workload CPU. RSS samples include daemon-owned job process trees obtained through the private status socket. Scheduler queue/run timing is recorded separately from client end-to-end durations."])
    lines.extend(["", "Known confound (reported before run): unrelated next-server PID 57791, >100% CPU, about 6 GiB RSS, swap about 7.7 GiB. See timestamped snapshots for observations.",
                  "", "wait4 CPU includes child usage plus waited descendants; detached/unwaited descendants are not guaranteed. ps CPU is the OS reported lifetime-average percentage, not interval utilization. Queue wait is harness submission-to-launch time; scheduler internal timing is separate.",
                  "", "Equal workload within each job-count comparison. Cases rotate per repeat to reduce fixed-order bias. No claim of isolated background load.",
                  "", f"Stop reason: {data.get('stop_reason', 'none')}"])
    output.with_suffix(".md").write_text("\n".join(lines) + "\n")


def runner_command(runner, project, tests, scratch, node, workers):
    """Build explicit local commands. No package-manager download fallback."""
    caps = [] if workers is None else [f"--maxWorkers={workers}"]
    if runner == "vitest":
        return [str(node), str(project / "node_modules/vitest/vitest.mjs"),
                "run", *tests, "--no-cache", "--configLoader=runner",
                f"--attachmentsDir={scratch / 'attachments'}", "--reporter=dot", *caps]
    if runner == "jest":
        return [str(node), str(project / "node_modules/jest/bin/jest.js"), "--runTestsByPath",
                *tests, "--no-cache", *caps]
    if runner == "playwright":
        return [str(node), str(project / "node_modules/@playwright/test/cli.js"), "test", *tests,
                f"--output={scratch / 'playwright'}", "--reporter=line",
                *([] if workers is None else [f"--workers={workers}"])]
    if runner == "node":
        return [str(node), "--test", *([] if workers is None else [f"--test-concurrency={workers}"]), *tests]
    raise ValueError(f"Unknown runner: {runner}")


def vitest_environment(project):
    """Preserve runner-mode config's __dirname without shell quoting or argv escapes."""
    source = "globalThis.__dirname=" + json.dumps(str(project))
    encoded = base64.b64encode(source.encode()).decode("ascii")
    option = "--import=data:text/javascript;base64," + encoded
    return {"NODE_OPTIONS": (os.environ.get("NODE_OPTIONS", "") + " " + option).strip()}


def scheduled_command(scheduler, runner, tests, scratch, workers):
    """Use the adapter's public language, leaving managed caps to agent-test."""
    if runner == "vitest":
        public = ["vitest", "run", *tests, "--no-cache", "--configLoader=runner",
                  f"--attachmentsDir={scratch / 'attachments'}", "--reporter=dot"]
    elif runner == "playwright":
        public = ["playwright", "test", *tests, f"--output={scratch / 'playwright'}", "--reporter=line"]
    elif runner == "jest":
        public = ["jest", "--runTestsByPath", *tests, "--no-cache"]
    elif runner == "node":
        public = ["node", "--test", *tests]
    else:
        raise ValueError(f"Unknown runner: {runner}")
    return [str(scheduler), "run", "--runner", runner, "--workers", str(workers),
            "--timeout", "40", "--allow-duplicate", "--concurrent-worktree", "--", *public]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--scheduler", type=Path)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--jobs", type=int, nargs="+", choices=(4, 8), default=[4, 8])
    parser.add_argument("--budget", type=int, choices=(4, 6), default=4)
    parser.add_argument("--runner", choices=("vitest", "playwright", "jest", "node"), default="vitest")
    parser.add_argument("--test", action="append", dest="tests")
    parser.add_argument("--execute", action="store_true", help="Explicit benchmark authorization, otherwise print plan only")
    parser.add_argument("--sample-interval", type=float, choices=(0.5, 1.0), default=0.5)
    args = parser.parse_args()
    if args.repeats != 3:
        parser.error("--repeats must be 3 for reproducible comparisons")
    project = args.project.resolve(strict=True)
    node = Path(NODE) if Path(NODE).is_file() else Path(shutil.which("node") or "")
    tests = args.tests or [f"src/entities/document/lib/{name}.test.ts" for name in TEST_NAMES]
    if args.runner != "vitest" and not args.tests:
        parser.error("non-Vitest runners require explicit --test paths")
    for path in [*(project / test for test in tests)]:
        if not path.is_file():
            parser.error(f"required file missing: {path}")
    if args.scheduler and (not args.scheduler.is_absolute() or not args.scheduler.is_file()):
        parser.error("--scheduler must be an existing absolute executable path")
    plan = {"runner": args.runner, "jobs": args.jobs, "repeats": args.repeats,
            "cases": ["default", "workers-only2"] + (["global-fixed4-2-2", f"weighted-budget{args.budget}-mixed1-2"] if args.scheduler else []),
            "tests": tests, "authorization": "--execute required after coordinator start signal"}
    if args.scheduler:
        # Resolve the exact public payload before any direct workload starts.
        # This is read-only: adapters inspect local metadata but launch nothing.
        from commands import CommandError, resolve
        try:
            for workers in (1, 2):
                wrapped = scheduled_command(args.scheduler, args.runner, tests, args.output.parent.resolve(), workers)
                resolve(wrapped[wrapped.index("--") + 1:], str(project), workers, runner=args.runner)
        except (CommandError, OSError, ValueError) as error:
            parser.error(f"scheduler adapter preflight failed: {error}")
    if not args.execute:
        print(json.dumps(plan, indent=2))
        return 0
    scratch_root = Path(os.environ.get("JCODE_SCRATCH_DIR", str(Path.home() / ".cache/agent-test-benchmark")))
    scratch_root.mkdir(parents=True, exist_ok=True)
    scratch = Path(tempfile.mkdtemp(prefix="agent-test-benchmark-", dir=scratch_root))
    cases = ["default", "workers-only2"]
    if args.scheduler:
        cases += ["global-fixed4-2-2", f"weighted-budget{args.budget}-mixed1-2"]
    data = {"schema_version": 3, "project": str(project), "fixed_tests": tests,
            "runner": args.runner, "plan": plan,
            "scheduler": str(args.scheduler) if args.scheduler else None,
            "cpu_rss_scope": "per-experiment accounting_scope",
            "jobs_per_experiment": args.jobs, "sample_interval_s": args.sample_interval,
            "scratch": str(scratch), "environment_before": snapshot(),
            "node": capture([str(node), "--version"]),
            "experiments": [], "accounting": __doc__}
    deadline = time.monotonic() + 600
    for repeat in range(args.repeats):
        rotated = cases[repeat % len(cases):] + cases[:repeat % len(cases)]
        for copies in args.jobs:
            for case in rotated:
                name = f"jobs{copies}-{case}"
                scheduled = case.startswith(("global-", "weighted-"))
                run_dir = scratch / f"{name}-{repeat}"
                run_dir.mkdir()
                isolated = None
                env = vitest_environment(project) if args.runner == "vitest" else {}
                if scheduled:
                    # macOS Unix socket paths must stay short. This directory is
                    # private and never shares the user's production scheduler.
                    isolated = Path(tempfile.mkdtemp(prefix="atb-", dir="/private/tmp"))
                    env["AGENT_TEST_HOME"] = str(isolated)
                    cfg = {"budget": args.budget if case.startswith("weighted") else 4,
                           "workers": 2, "max_runs": copies if case.startswith("weighted") else 2,
                           "policy": "weighted" if case.startswith("weighted") else "fixed",
                           "timeout": 40, "queue_timeout": 50}
                    (isolated / "config.json").write_text(json.dumps(cfg))
                def command(index):
                    workers = None if case == "default" else (1 + index % 2 if case.startswith("weighted") else 2)
                    if scheduled:
                        return scheduled_command(args.scheduler, args.runner, tests, scratch, workers)
                    return runner_command(args.runner, project, tests, scratch, node, workers)
                cleanup = None
                try:
                    result = experiment(command, project, copies, copies, run_dir,
                                        deadline, args.sample_interval, env, isolated)
                finally:
                    if isolated:
                        # Disconnected clients trigger guardian cancellation. Wait
                        # briefly for the isolated daemon to reap those groups.
                        until = time.monotonic() + 5
                        while time.monotonic() < until:
                            remaining = scheduler_status(isolated)
                            if not remaining.get("jobs") and not remaining.get("quarantine"):
                                break
                            time.sleep(0.1)
                        try:
                            cleanup = subprocess.run([str(args.scheduler), "stop", "--json"],
                                                     env=dict(os.environ, **env), stdout=subprocess.DEVNULL,
                                                     stderr=subprocess.DEVNULL, timeout=10).returncode
                        except subprocess.TimeoutExpired:
                            cleanup = "stop_timeout"
                result["scheduler_cleanup_exit"] = cleanup
                if scheduled and cleanup != 0:
                    result["abort"] = result["abort"] or "isolated_scheduler_cleanup_failed"
                result["accounting_scope"] = "client_wait4_cpu_plus_job_tree_rss" if scheduled else "direct_wait4_cpu_and_tree_rss"
                data["experiments"].append({"name": name, "repeat": repeat + 1, **result})
                print(f"{name} repeat={repeat + 1} wall={result['wall_s']:.3f}s failures={result['exit_failures']} abort={result['abort']}", flush=True)
                if result["abort"] or result["exit_failures"]:
                    data["stop_reason"] = result["abort"] or "test_failure"
                save(args.output, data)
                if data.get("stop_reason"):
                    break
            if data.get("stop_reason"):
                break
        if data.get("stop_reason"):
            break
    data["environment_after"] = snapshot()
    save(args.output, data)
    return 1 if data.get("stop_reason") else 0


if __name__ == "__main__":
    raise SystemExit(main())
