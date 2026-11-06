"""Black-box scheduler regressions: python3 tools/agent-test/test_scheduler.py -v.

Every daemon, client and process group belongs to a private temporary home.
Fixtures do no CPU work: marker files are bounded, observable barriers.
"""
import base64
import fcntl
import json
import os
from pathlib import Path
import select
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest


HERE = Path(__file__).resolve().parent
WAIT = 12
BARRIER = """
import os, pathlib, select, sys, time
ready, release = map(pathlib.Path, sys.argv[1:3])
ready.write_text(str(os.getpid()))
deadline = time.monotonic() + 45
while not release.exists():
    if time.monotonic() > deadline:
        raise SystemExit(99)
    select.select([], [], [], .02)
"""


class Connection:
    def __init__(self, path, request):
        self.sock = socket.socket(socket.AF_UNIX)
        self.sock.settimeout(WAIT)
        try:
            self.sock.connect(str(path))
            self.sock.sendall(json.dumps(request).encode() + b"\n")
        except BaseException:
            self.sock.close()
            raise
        self.pending = bytearray()
        self.events = []

    def next(self, timeout=WAIT):
        deadline = time.monotonic() + timeout
        while b"\n" not in self.pending:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise AssertionError(f"Event deadline exceeded: {self.events!r}")
            self.sock.settimeout(remaining)
            data = self.sock.recv(65536)
            if not data:
                raise AssertionError(f"Unexpected socket EOF: {self.events!r}")
            self.pending.extend(data)
        line, _, rest = self.pending.partition(b"\n")
        self.pending = bytearray(rest)
        event = json.loads(line)
        self.events.append(event)
        return event

    def until(self, name, timeout=WAIT):
        deadline = time.monotonic() + timeout
        while True:
            event = self.next(max(.001, deadline - time.monotonic()))
            if event.get("event") == name or "error" in event:
                return event

    def close(self):
        self.sock.close()


class SchedulerTests(unittest.TestCase):
    def setUp(self):
        # Short system temp paths are required by Darwin's 104-byte sun_path.
        self.temp = tempfile.TemporaryDirectory(prefix="at-")
        self.root = Path(self.temp.name).resolve()
        self.env = {**os.environ, "AGENT_TEST_HOME": str(self.root)}
        self.processes = []
        self.connections = []
        self.groups = set()
        self.group_jobs = {}
        self.serial = 0
        self.log = open(self.root / "daemon.log", "ab")
        self.addCleanup(self.cleanup)
        self.configure()
        self.start_daemon()

    def configure(self, **values):
        (self.root / "config.json").write_text(json.dumps({
            "budget": 4, "workers": 2, "max_runs": 2,
            "policy": "fixed", "timeout": 30, **values}))

    def spawn(self, argv, **kwargs):
        proc = subprocess.Popen(argv, env=self.env, start_new_session=True,
                                stdin=subprocess.DEVNULL, **kwargs)
        self.processes.append(proc)
        return proc

    def start_daemon(self):
        self.daemon = self.spawn([sys.executable, str(HERE / "daemon.py")],
                                 stdout=self.log, stderr=self.log)
        def ready():
            if self.daemon.poll() is not None:
                self.fail((self.root / "daemon.log").read_text())
            try:
                return self.status()["pid"] == self.daemon.pid
            except (OSError, AssertionError):
                return False
        self.wait_for(ready, "daemon readiness")

    def wait_for(self, predicate, description, timeout=WAIT):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            result = predicate()
            if result:
                return result
            select.select([], [], [], .02)
        self.fail(f"Timed out waiting for {description}")

    def connect(self, request):
        conn = Connection(self.root / "scheduler.sock", request)
        self.connections.append(conn)
        return conn

    def rpc(self, action, **kwargs):
        conn = self.connect({"action": action, **kwargs})
        try:
            return conn.next()
        finally:
            conn.close()

    def status(self):
        result = self.rpc("status")
        for row in result.get("jobs", []) + result.get("quarantine", []):
            if row.get("pid"):
                self.groups.add(row["pid"])
                self.group_jobs[row["pid"]] = row["id"]
        return result

    def request(self, argv, cwd=None, **kwargs):
        return {"action": "run", "argv": argv, "cwd": str(cwd or self.root),
                "env": self.env, "concurrent_worktree": True, **kwargs}

    def barrier(self, **kwargs):
        self.serial += 1
        ready = self.root / f"ready-{self.serial}"
        release = self.root / f"release-{self.serial}"
        req = self.request([sys.executable, "-c", BARRIER, str(ready), str(release)], **kwargs)
        conn = self.connect(req)
        queued = conn.next()
        self.assertEqual(queued.get("event"), "queued", queued)
        return {"conn": conn, "id": queued["id"], "ready": ready,
                "release": release, "request": req}

    def started(self, job):
        event = job["conn"].until("started")
        self.assertEqual(event.get("event"), "started", event)
        self.groups.add(event["pid"])
        self.group_jobs[event["pid"]] = event["id"]
        job["pid"] = event["pid"]
        self.wait_for(job["ready"].exists, "fixture ready marker")
        return event

    def finish(self, job, code=0):
        job["release"].touch()
        event = job["conn"].until("exit")
        self.assertEqual(event.get("code"), code, event)
        self.assertEqual(event.get("event"), "exit", event)
        return event

    @staticmethod
    def group_exists(pgid):
        try:
            os.killpg(pgid, 0)
            return True
        except ProcessLookupError:
            return False
        except PermissionError:
            return True

    def kill_group(self, pgid):
        self.assertIn(pgid, self.groups)
        # A remembered number is not authority to signal a reused process group.
        table = subprocess.check_output(["ps", "-axo", "pgid=,command="], text=True)
        members = [parts[1] for line in table.splitlines()
                   if len(parts := line.strip().split(None, 1)) == 2
                   and parts[0] == str(pgid)]
        job_id = self.group_jobs.get(pgid)
        owned = any(str(self.root) in command or
                    (job_id and str(HERE / "guardian.py") in command and job_id in command)
                    for command in members)
        if not owned:
            return
        try:
            os.killpg(pgid, signal.SIGKILL)
        except ProcessLookupError:
            pass

    def cleanup(self):
        for conn in self.connections:
            conn.close()
        # Stop admission before collecting durable group identities. Give the
        # daemon a chance to cancel/reap its own children before escalating.
        daemon = getattr(self, "daemon", None)
        if daemon and daemon.poll() is None:
            daemon.terminate()
            try:
                daemon.wait(timeout=3)
            except subprocess.TimeoutExpired:
                pass
        state = self.root / "state.json"
        if state.exists():
            for row in json.loads(state.read_text()).get("active", []):
                if row.get("pid"):
                    self.groups.add(row["pid"])
                    self.group_jobs[row["pid"]] = row["id"]
        for pgid in self.groups:
            self.kill_group(pgid)
        if daemon and daemon.poll() is None:
            try:
                daemon.wait(timeout=3)
            except subprocess.TimeoutExpired:
                pass
        for proc in reversed(self.processes):
            if proc.poll() is None:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            proc.wait(timeout=WAIT)
            for stream in (proc.stdout, proc.stderr):
                if stream:
                    stream.close()
        self.log.close()
        self.temp.cleanup()

    def restart_idle(self, **config):
        self.assertTrue(self.rpc("stop")["stopped"])
        self.daemon.wait(timeout=WAIT)
        self.configure(**config)
        self.start_daemon()

    def test_fifo_five_requests(self):
        self.check_fifo(5)

    def test_fifo_ten_requests(self):
        self.check_fifo(10)

    def check_fifo(self, count):
        jobs = [self.barrier() for _ in range(count)]
        self.started(jobs[0])
        self.started(jobs[1])
        for index, job in enumerate(jobs):
            status = self.status()
            self.assertLessEqual(status["active_runs"], 2)
            self.assertLessEqual(status["used_tokens"], 4)
            expected = jobs[index:index + 2]
            self.assertEqual({r["id"] for r in status["jobs"] if r["state"] != "queued"},
                             {r["id"] for r in expected})
            for later in jobs[index + 2:]:
                self.assertFalse(later["ready"].exists())
            self.finish(job)
            if index + 2 < count:
                self.started(jobs[index + 2])
        final = self.status()
        self.assertEqual((final["active_runs"], final["used_tokens"], final["queued"]), (0, 0, 0))
        self.assertEqual([r["id"] for r in final["recent"]], [r["id"] for r in jobs])

    def test_weighted_mixed_workers_and_fifo_head(self):
        self.restart_idle(policy="weighted", max_runs=4)
        jobs = [self.barrier(workers=n) for n in (2, 1, 2, 1)]
        self.assertEqual(self.started(jobs[0])["tokens"], 2)
        self.assertEqual(self.started(jobs[1])["tokens"], 1)
        status = self.status()
        self.assertEqual((status["used_tokens"], status["queued"]), (3, 2))
        self.assertFalse(jobs[3]["ready"].exists(), "small request bypassed FIFO head")
        self.finish(jobs[0])
        self.started(jobs[2])
        self.started(jobs[3])
        self.assertEqual(self.status()["used_tokens"], 4)
        for job in jobs[1:]:
            self.finish(job)

    def test_fixed_policy_charges_configured_workers(self):
        jobs = [self.barrier(workers=1) for _ in range(3)]
        for job in jobs[:2]:
            self.assertEqual(self.started(job)["tokens"], 2)
        self.assertEqual(self.status()["used_tokens"], 4)
        self.assertFalse(jobs[2]["ready"].exists())
        self.finish(jobs[0])
        self.started(jobs[2])
        for job in jobs[1:]:
            self.finish(job)

    def test_cwd_env_argv_binary_output_and_exit(self):
        cwd = self.root / "directory with spaces"
        cwd.mkdir()
        script = "import os,sys,json; print(json.dumps([os.getcwd(),os.environ['AT_VALUE'],sys.argv[1:]]),flush=True); os.write(2,b'\\x00\\xffstderr'); sys.exit(7)"
        args = ["space value", "literal;$HOME", "한글"]
        conn = self.connect(self.request([sys.executable, "-c", script, *args], cwd,
                                         env={**self.env, "AT_VALUE": "value with spaces"}))
        self.assertEqual(conn.until("exit")["code"], 7)
        stdout = b"".join(base64.b64decode(e["data"]) for e in conn.events if e.get("event") == "stdout")
        stderr = b"".join(base64.b64decode(e["data"]) for e in conn.events if e.get("event") == "stderr")
        self.assertEqual(json.loads(stdout), [str(cwd), "value with spaces", args])
        self.assertEqual(stderr, b"\x00\xffstderr")
        self.assertEqual(self.status()["recent"][-1]["state"], "failed")

    def test_duplicate_rejection_and_explicit_override(self):
        first = self.barrier()
        self.started(first)
        rejected = self.connect(first["request"]).next()
        self.assertIn("Duplicate", rejected["error"])
        allowed = self.connect({**first["request"], "allow_duplicate": True})
        self.assertEqual(allowed.next()["event"], "queued")
        event = allowed.until("started")
        self.groups.add(event["pid"])
        self.group_jobs[event["pid"]] = event["id"]
        self.finish(first)
        self.assertEqual(allowed.until("exit")["code"], 0)

    def test_same_worktree_serializes(self):
        first = self.barrier(concurrent_worktree=False)
        self.started(first)
        second = self.barrier(concurrent_worktree=False)
        self.assertEqual(self.status()["queued"], 1)
        self.assertFalse(second["ready"].exists())
        self.finish(first)
        self.started(second)
        self.finish(second)

    def test_same_worktree_subdirectories_serialize(self):
        directories = [self.root / name for name in ("package-a", "package-b")]
        for directory in directories:
            directory.mkdir()
        first = self.barrier(cwd=directories[0], worktree=str(self.root), concurrent_worktree=False)
        self.started(first)
        second = self.barrier(cwd=directories[1], worktree=str(self.root), concurrent_worktree=False)
        status = self.status()
        self.assertEqual(status["queued"], 1, status)
        self.assertFalse(second["ready"].exists())
        self.finish(first)
        self.started(second)
        self.finish(second)

    def test_cancel_queued_does_not_launch(self):
        first = self.barrier(concurrent_worktree=False)
        self.started(first)
        second = self.barrier(concurrent_worktree=False)
        self.assertEqual(self.rpc("cancel", id=second["id"])["cancelled"], second["id"])
        self.assertEqual(second["conn"].until("exit")["code"], 130)
        self.finish(first)
        self.assertFalse(second["ready"].exists())
        self.assertEqual(self.status()["used_tokens"], 0)

    def test_cancel_running_releases_only_after_group_exit(self):
        job = self.barrier()
        self.started(job)
        self.rpc("cancel", id=job["id"])
        self.assertEqual(job["conn"].until("exit")["code"], 130)
        self.assertFalse(self.group_exists(job["pid"]))
        self.assertEqual(self.status()["used_tokens"], 0)

    def test_timeout_and_failure_recovery(self):
        job = self.barrier(timeout=1)
        self.started(job)
        self.assertEqual(job["conn"].until("exit")["code"], 124)
        self.assertEqual(self.status()["recent"][-1]["state"], "timeout")
        for argv, expected in (([str(self.root / "missing-executable")], 75),
                               ([sys.executable, "-c", "raise SystemExit(9)"], 9),
                               ([sys.executable, "-c", "pass"], 0)):
            conn = self.connect(self.request(argv))
            self.assertEqual(conn.until("exit")["code"], expected)
            self.assertEqual(self.status()["used_tokens"], 0)

    def test_daemon_sigkill_restart_quarantines_old_groups(self):
        job = self.barrier()
        self.started(job)
        os.kill(job["pid"], signal.SIGSTOP)
        self.daemon.kill()
        self.daemon.wait(timeout=WAIT)
        self.start_daemon()
        status = self.status()
        self.assertEqual([r["pid"] for r in status["quarantine"]], [job["pid"]])
        self.assertEqual(status["used_tokens"], 2, "quarantine must retain the old reservation")
        self.assertTrue(self.rpc("recover")["quarantine"])
        denied = self.connect(self.request([sys.executable, "-c", "pass"])).next()
        self.assertIn("Recovery blocked", denied["error"])
        os.kill(job["pid"], signal.SIGCONT)
        self.wait_for(lambda: not self.group_exists(job["pid"]), "orphan guardian group cleanup")
        self.assertEqual(self.rpc("recover")["quarantine"], [])
        conn = self.connect(self.request([sys.executable, "-c", "pass"]))
        self.assertEqual(conn.until("exit")["code"], 0)

    def test_guardian_sigkill_blocks_admission_without_killing_unrelated(self):
        unrelated = self.spawn([sys.executable, "-c", "import signal; signal.pause()"],
                               stdout=self.log, stderr=self.log)
        job = self.barrier()
        self.started(job)
        os.kill(job["pid"], signal.SIGKILL)
        self.wait_for(lambda: not Path(f"/proc/{job['pid']}").exists() if sys.platform == "linux"
                      else subprocess.run(["ps", "-p", str(job["pid"]), "-o", "stat="],
                                          capture_output=True).returncode != 0,
                      "guardian death")
        self.assertTrue(self.group_exists(job["pid"]), "fixture child must remain")
        conn = self.connect(self.request([sys.executable, "-c", "pass"]))
        event = conn.next()
        self.assertIsNone(unrelated.poll(), "unrelated process was signalled")
        self.assertIn("error", event, f"admitted after guardian death: {event}; status={self.status()}")
        self.kill_group(job["pid"])
        self.wait_for(lambda: not self.group_exists(job["pid"]), "test child cleanup")
        self.assertEqual(self.rpc("recover")["quarantine"], [])
        recovered = self.connect(self.request([sys.executable, "-c", "pass"]))
        self.assertEqual(recovered.until("exit")["code"], 0)
        self.assertIsNone(unrelated.poll())

    def test_stale_lock_and_live_singleton(self):
        first_pid = self.daemon.pid
        second = self.spawn([sys.executable, str(HERE / "daemon.py")], stdout=self.log, stderr=self.log)
        self.assertEqual(second.wait(timeout=WAIT), 0)
        self.assertEqual(self.status()["pid"], first_pid)
        self.daemon.kill()
        self.daemon.wait(timeout=WAIT)
        self.assertTrue((self.root / "daemon.lock").exists())
        self.start_daemon()
        self.assertNotEqual(self.status()["pid"], first_pid)

    def test_normal_leader_exit_cleans_lingering_child(self):
        marker = self.root / "descendant"
        child = "import pathlib,os,signal; pathlib.Path(" + repr(str(marker)) + ").write_text(str(os.getpid())); signal.pause()"
        parent = "import subprocess,sys,pathlib,select,time; subprocess.Popen([sys.executable,'-c'," + repr(child) + "]); p=pathlib.Path(" + repr(str(marker)) + "); deadline=time.monotonic()+5\nwhile not p.exists():\n if time.monotonic()>deadline: raise SystemExit(98)\n select.select([],[],[],.01)\n"
        conn = self.connect(self.request([sys.executable, "-c", parent]))
        started = conn.until("started")
        self.groups.add(started["pid"])
        self.group_jobs[started["pid"]] = started["id"]
        self.assertEqual(conn.until("exit")["code"], 0)
        self.assertTrue(marker.exists())
        self.assertFalse(self.group_exists(started["pid"]))
        self.assertEqual(self.status()["used_tokens"], 0)

    def test_cli_sigint_and_sigterm_cancel_owned_run(self):
        package = self.root / "node_modules" / "vitest"
        package.mkdir(parents=True)
        (package / "package.json").write_text(json.dumps({"version": "4.0.0", "bin": "vitest.js"}))
        (package / "vitest.js").write_text("// Deliberately never executed by fake node.\n")
        binaries = self.root / "bin"
        binaries.mkdir()
        node = binaries / "node"
        node.write_text(f"#!{sys.executable}\nimport os, pathlib, signal\npathlib.Path(os.environ['AT_CLI_READY']).write_text(str(os.getpid()))\nsignal.pause()\n")
        node.chmod(0o700)
        for sig in (signal.SIGINT, signal.SIGTERM):
            with self.subTest(signal=sig):
                marker = self.root / f"cli-{sig}"
                self.env.update(PATH=str(binaries) + os.pathsep + os.environ.get("PATH", ""),
                                AT_CLI_READY=str(marker))
                client = self.spawn([sys.executable, str(HERE / "agent-test"), "run", "--", "vitest", "run"],
                                    cwd=self.root, stdout=self.log, stderr=self.log)
                self.wait_for(marker.exists, "CLI fixture ready")
                status = self.status()
                self.assertEqual(status["active_runs"], 1)
                client.send_signal(sig)
                self.assertEqual(client.wait(timeout=WAIT), 130)
                self.wait_for(lambda: self.status()["active_runs"] == 0, "CLI cancellation")
                self.assertEqual(self.status()["used_tokens"], 0)


    def test_malformed_requests_never_launch_and_keep_daemon_alive(self):
        valid = self.request([sys.executable, "-c", "pass"])
        malformed = [[], None, {}, {"action": "cancel", "id": []}]
        for values in ({"argv": []}, {"argv": [None]}, {"argv": ["bad\x00arg"]},
                       {"env": {"BAD=KEY": "value"}}, {"env": {"OK": "bad\x00value"}},
                       {"workers": True}, {"workers": 0}, {"timeout": False},
                       {"timeout": 0}, {"concurrent_worktree": "yes"},
                       {"allow_duplicate": 1}, {"project": ["not-a-path"]},
                       {"project": "x" * 4097}, {"cwd": str(self.root / "config.json")}):
            malformed.append({**valid, **values})
        for request in malformed:
            with self.subTest(request=request):
                self.assertEqual(self.connect(request).next()["code"], 75)
                status = self.status()
                self.assertEqual((status["active_runs"], status["used_tokens"], status["queued"]), (0, 0, 0))
                self.assertIsNone(self.daemon.poll())

    def test_invalid_json_and_oversized_line_are_bounded_errors(self):
        for payload in (b"{not-json}\n", b"x" * (2 * 1024 * 1024 + 1) + b"\n"):
            with self.subTest(size=len(payload)):
                with socket.socket(socket.AF_UNIX) as conn:
                    conn.settimeout(WAIT)
                    conn.connect(str(self.root / "scheduler.sock"))
                    try:
                        conn.sendall(payload)
                    except BrokenPipeError:
                        pass
                    data = bytearray()
                    while b"\n" not in data:
                        block = conn.recv(65536)
                        self.assertNotEqual(block, b"")
                        data.extend(block)
                    self.assertEqual(json.loads(data.split(b"\n")[0])["code"], 75)
                self.assertEqual(self.status()["used_tokens"], 0)

    def test_client_disconnect_cancels_running_and_queued(self):
        first = self.barrier(concurrent_worktree=False)
        self.started(first)
        second = self.barrier(concurrent_worktree=False)
        second["conn"].close()
        self.wait_for(lambda: self.status()["queued"] == 0, "queued disconnect cancellation")
        self.assertFalse(second["ready"].exists())
        first["conn"].close()
        self.wait_for(lambda: self.status()["used_tokens"] == 0, "running disconnect cleanup")
        self.assertFalse(self.group_exists(first["pid"]))
        self.assertEqual(self.status()["recent"][-1]["state"], "client_disconnected")

    def test_queue_timeout_never_launches_waiting_job(self):
        self.restart_idle(queue_timeout=1)
        first = self.barrier(concurrent_worktree=False)
        self.started(first)
        second = self.barrier(concurrent_worktree=False)
        self.assertEqual(second["conn"].until("exit")["code"], 130)
        self.assertFalse(second["ready"].exists())
        self.assertEqual(self.status()["recent"][-1]["state"], "queue_timeout")
        self.finish(first)

    def test_queued_job_stays_blocked_until_dead_guardian_group_is_gone(self):
        self.restart_idle(max_runs=1)
        first = self.barrier()
        self.started(first)
        second = self.barrier()
        os.kill(first["pid"], signal.SIGKILL)
        self.wait_for(lambda: self.status()["admission_blocked"], "guardian EOF admission barrier")
        self.assertEqual(self.status()["used_tokens"], 2)
        self.assertFalse(second["ready"].exists())
        # Keep inherited stdout/stderr open past execute's drain deadline.
        self.wait_for(lambda: bool(self.status()["quarantine"]), "durable orphan-pipe quarantine")
        self.assertFalse(second["ready"].exists())
        self.assertEqual(self.status()["used_tokens"], 2)
        self.kill_group(first["pid"])
        self.wait_for(lambda: not self.group_exists(first["pid"]), "owned orphan cleanup")
        self.started(second)
        self.assertEqual(self.status()["quarantine"], [])
        self.finish(second)

    def test_restart_recovery_automatically_clears_when_old_group_exits(self):
        first = self.barrier()
        self.started(first)
        os.kill(first["pid"], signal.SIGSTOP)
        self.daemon.kill()
        self.daemon.wait(timeout=WAIT)
        self.start_daemon()
        self.assertTrue(self.status()["admission_blocked"])
        os.kill(first["pid"], signal.SIGCONT)
        self.wait_for(lambda: not self.status()["admission_blocked"], "restart recovery event")
        self.assertFalse(self.group_exists(first["pid"]))
        self.assertEqual(self.status()["used_tokens"], 0)
        conn = self.connect(self.request([sys.executable, "-c", "pass"]))
        self.assertEqual(conn.until("exit")["code"], 0)

    def test_history_limit_bounds_persistent_state(self):
        self.restart_idle(history_limit=2)
        for index in range(4):
            conn = self.connect(self.request([sys.executable, "-c", f"raise SystemExit({index})"]))
            self.assertEqual(conn.until("exit")["code"], index)
        state = json.loads((self.root / "state.json").read_text())
        self.assertEqual([row["code"] for row in state["history"]], [2, 3])
        self.assertEqual(state["active"], [])
        for row in state["history"]:
            self.assertGreaterEqual(row["wait_seconds"], 0)
            self.assertGreaterEqual(row["run_seconds"], 0)

    def test_nonreading_client_output_cancels_without_releasing_live_group(self):
        marker = self.root / "output-ready"
        script = ("import os,pathlib; pathlib.Path(" + repr(str(marker)) + ").write_text(str(os.getpid())); "
                  "data=b'x'*16384\nwhile True: os.write(1,data)\n")
        conn = self.connect(self.request([sys.executable, "-c", script]))
        started = conn.until("started")
        self.groups.add(started["pid"])
        self.group_jobs[started["pid"]] = started["id"]
        self.wait_for(marker.exists, "output fixture ready")
        self.wait_for(lambda: self.status()["used_tokens"] == 0, "bounded output cancellation", timeout=22)
        self.assertFalse(self.group_exists(started["pid"]))
        self.assertEqual(self.status()["recent"][-1]["code"], 75)


    def test_concurrent_config_writers_preserve_independent_changes(self):
        self.assertTrue(self.rpc("stop")["stopped"])
        self.daemon.wait(timeout=WAIT)
        with open(self.root / "startup.lock", "a+") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            clients = [self.spawn([sys.executable, str(HERE / "agent-test"), "config", "--set", value],
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                       for value in ("timeout=17", "queue_timeout=23")]
            fcntl.flock(lock, fcntl.LOCK_UN)
        for client in clients:
            output, error = client.communicate(timeout=WAIT)
            self.assertEqual(client.returncode, 0, error)
            self.assertIn("budget", json.loads(output))
        values = json.loads((self.root / "config.json").read_text())
        self.assertEqual((values["timeout"], values["queue_timeout"]), (17, 23))
        self.start_daemon()
        before = (self.root / "config.json").read_bytes()
        client = self.spawn([sys.executable, str(HERE / "agent-test"), "config", "--set", "timeout=5"],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        _, error = client.communicate(timeout=WAIT)
        self.assertEqual(client.returncode, 75)
        self.assertIn(b"Stop the idle daemon", error)
        self.assertEqual((self.root / "config.json").read_bytes(), before)

    def test_concurrent_cli_startup_keeps_one_daemon(self):
        self.assertTrue(self.rpc("stop")["stopped"])
        self.daemon.wait(timeout=WAIT)
        try:
            clients = [self.spawn([sys.executable, str(HERE / "agent-test"), "status", "--json"],
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE) for _ in range(6)]
            pids = []
            for client in clients:
                output, error = client.communicate(timeout=WAIT)
                self.assertEqual(client.returncode, 0, error)
                pids.append(json.loads(output)["pid"])
            self.assertEqual(len(set(pids)), 1)
            self.assertEqual(self.status()["pid"], pids[0])
        finally:
            try:
                self.rpc("stop")
                self.wait_for(lambda: not (self.root / "scheduler.sock").exists(), "autostart daemon stop")
            except (OSError, AssertionError):
                pass
        self.start_daemon()

    def test_persistent_diagnostics_rotate_during_process_lifetime(self):
        path = self.root / "bounded.log"
        script = ("from common import DiagnosticLog; import sys; "
                  "log=DiagnosticLog(sys.argv[1]); "
                  "[log.write('x'*65536+'\\n') for _ in range(40)]; log.flush()")
        proc = self.spawn([sys.executable, "-c", script, str(path)], cwd=HERE,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        _, error = proc.communicate(timeout=WAIT)
        self.assertEqual(proc.returncode, 0, error)
        self.assertEqual({file.name for file in self.root.glob("bounded.log*")}, {"bounded.log", "bounded.log.1"})
        self.assertLessEqual(path.stat().st_size, 1024 * 1024)
        self.assertLessEqual(path.with_suffix(".log.1").stat().st_size, 1024 * 1024)


    def test_both_jobs_must_opt_into_same_worktree_concurrency(self):
        for first_opt, second_opt in ((False, True), (True, False)):
            with self.subTest(first=first_opt, second=second_opt):
                first = self.barrier(concurrent_worktree=first_opt)
                self.started(first)
                second = self.barrier(concurrent_worktree=second_opt)
                self.assertEqual(self.status()["queued"], 1)
                self.assertFalse(second["ready"].exists())
                self.finish(first)
                self.started(second)
                self.finish(second)

    def test_generic_reserves_full_budget_without_claiming_worker_limit(self):
        first = self.barrier(runner="generic", workers=1)
        row = self.started(first)
        self.assertEqual((row["runner"], row["workers"], row["tokens"], row["exclusive"],
                          row["parallelism_guaranteed"]), ("generic", None, 4, True, False))
        second = self.barrier(workers=1)
        self.assertEqual((self.status()["used_tokens"], self.status()["queued"]), (4, 1))
        self.assertFalse(second["ready"].exists())
        self.finish(first)
        self.started(second)
        self.finish(second)

    def test_weights_only_increase_policy_reservations(self):
        for weight in (0, 1, 5, True, "3"):
            with self.subTest(weight=weight):
                conn = self.connect(self.request([sys.executable, "-c", "pass"], workers=1, weight=weight))
                self.assertEqual(conn.next()["code"], 75)
        first = self.barrier(workers=1, weight=3)
        self.assertEqual(self.started(first)["tokens"], 3)
        second = self.barrier(workers=1)
        self.assertFalse(second["ready"].exists())
        self.assertEqual(self.status()["used_tokens"], 3)
        self.finish(first)
        self.assertEqual(self.started(second)["tokens"], 2)
        self.finish(second)

    def test_cli_generic_is_explicit_and_reports_unknown_parallelism(self):
        command = [sys.executable, "-c", "print('generic-output'); raise SystemExit(7)"]
        for options, expected in (([], 75), (["--runner", "generic", "--workers", "1"], 75),
                                  (["--runner", "generic"], 7)):
            with self.subTest(options=options):
                proc = self.spawn([sys.executable, str(HERE / "agent-test"), "run", *options, "--", *command],
                                  cwd=self.root, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                output, error = proc.communicate(timeout=WAIT)
                self.assertEqual(proc.returncode, expected, error)
                if expected == 7:
                    self.assertEqual(output, b"generic-output\n")
                    self.assertIn(b"runner=generic workers=None tokens=4", error)
                    self.assertIn(b"unknown and cannot be guaranteed", error)
        self.assertEqual(self.status()["used_tokens"], 0)

    def test_timeout_escalates_sigterm_ignoring_child_and_preserves_exit(self):
        marker = self.root / "ignoring-term"
        script = ("import os,pathlib,signal; signal.signal(signal.SIGTERM, signal.SIG_IGN); "
                  "pathlib.Path(" + repr(str(marker)) + ").write_text(str(os.getpid())); signal.pause()")
        conn = self.connect(self.request([sys.executable, "-c", script], timeout=1))
        row = conn.until("started")
        self.groups.add(row["pid"])
        self.group_jobs[row["pid"]] = row["id"]
        self.wait_for(marker.exists, "SIGTERM-ignoring child ready")
        self.assertEqual(conn.until("exit")["code"], 124)
        self.wait_for(lambda: self.status()["used_tokens"] == 0, "escalated group gone")
        self.assertFalse(self.group_exists(row["pid"]))
        self.assertEqual(self.status()["recent"][-1]["state"], "timeout")

    def test_cli_parent_death_cancels_owned_group(self):
        ready = self.root / "parent-owned-ready"
        release = self.root / "parent-owned-release"
        argv = [sys.executable, str(HERE / "agent-test"), "run", "--runner", "generic", "--",
                sys.executable, "-c", BARRIER, str(ready), str(release)]
        script = "import subprocess,signal; subprocess.Popen(" + repr(argv) + "); signal.pause()"
        parent = self.spawn([sys.executable, "-c", script], cwd=self.root, stdout=self.log, stderr=self.log)
        self.wait_for(ready.exists, "parent-owned fixture ready")
        row = self.status()["jobs"][0]
        self.assertEqual(row["runner"], "generic")
        parent.kill()
        parent.wait(timeout=WAIT)
        self.wait_for(lambda: self.status()["used_tokens"] == 0, "parent death cancellation")
        self.assertFalse(self.group_exists(row["pid"]))
        self.assertEqual(self.status()["recent"][-1]["state"], "client_disconnected")
        self.assertFalse(release.exists())


if __name__ == "__main__":
    unittest.main()
