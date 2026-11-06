"""Single-writer FIFO admission server with durable fail-closed recovery."""
import asyncio
import base64
import collections
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import socket
import sys
import time
import uuid

from common import DiagnosticLog, atomic_json, boot_id, config, group_exists, home


class Scheduler:
    def __init__(self, root):
        self.root, self.cfg = root, config(root)
        self.boot = boot_id()
        self.started = time.time()
        self.jobs = {}
        self.queue = collections.deque()
        self.active = {}
        self.history = []
        self.quarantine = []
        self.stopping = False
        self.stop_event = asyncio.Event()
        self.recovery_event = asyncio.Event()
        path = root / "state.json"
        if path.exists():
            old = json.loads(path.read_text())  # corrupt state MUST fail closed
            self.history = old.get("history", [])
            if old["boot"] == self.boot:
                self.quarantine = [j for j in old["active"] if j.get("pid") and group_exists(j["pid"])]
        self.persist()
        if self.quarantine:
            self.recovery_event.set()

    def persist(self):
        cutoff = time.time() - self.cfg["history_days"] * 86400
        self.history = [j for j in self.history if j["ended"] >= cutoff][-self.cfg["history_limit"]:]
        atomic_json(self.root / "state.json", {"boot": self.boot,
                    "active": self.quarantine + [j["public"] for j in self.active.values()],
                    "history": self.history})

    async def emit(self, job, message):
        async with job["write_lock"]:
            job["writer"].write(json.dumps(message).encode() + b"\n")
            await asyncio.wait_for(job["writer"].drain(), 10)

    def admission_blocked(self):
        # Child-exit callbacks can run before execute() drains inherited pipes.
        # Do not let that output-draining window admit another process group.
        return bool(self.quarantine) or any(
            j["public"]["state"] == "quarantined" or
            (j.get("proc") is not None and j["proc"].returncode is not None
             and group_exists(j["proc"].pid)) for j in self.active.values())

    def snapshot(self):
        now = time.time()
        clock = time.monotonic()
        rows = []
        for job in self.jobs.values():
            row = dict(job["public"])
            row["wait_seconds"] = job.get("started_clock", clock) - job["queued_clock"]
            row["run_seconds"] = clock - job["started_clock"] if "started_clock" in job else 0
            rows.append(row)
        waits = sorted(j["wait_seconds"] for j in self.history)
        return {"pid": os.getpid(), "config": self.cfg,
                "used_tokens": sum(j["public"]["tokens"] for j in self.active.values())
                    + sum(j["tokens"] for j in self.quarantine),
                "admission_blocked": self.admission_blocked(),
                "active_runs": len(self.active), "queued": len(self.queue), "jobs": rows,
                "quarantine": self.quarantine, "recent": self.history,
                "mean_wait_seconds": sum(waits) / len(waits) if waits else 0,
                "p95_wait_seconds": waits[max(0, math.ceil(len(waits) * .95) - 1)] if waits else 0,
                "completed_per_second": sum(j["ended"] >= self.started for j in self.history)
                    / max(.001, now - self.started), "metrics_window": "retained history; throughput since daemon start"}

    def cancel(self, job, reason="cancelled"):
        if job["public"]["state"] == "queued":
            self.queue.remove(job)
            self.finish(job, 130, reason)
        else:
            job["reason"] = reason
            control = job.get("control")
            if control:
                control.close()  # EOF is cancellation, without PID signalling

    def finish(self, job, code, reason=None):
        row = job["public"]
        now = time.time()
        clock = time.monotonic()
        row.update(ended=now, code=code, state=reason or ("succeeded" if code == 0 else "failed"),
                   wait_seconds=job.get("started_clock", clock) - job["queued_clock"],
                   run_seconds=clock - job["started_clock"] if "started_clock" in job else 0)
        self.active.pop(row["id"], None)
        self.jobs.pop(row["id"], None)
        self.history.append(dict(row))
        self.persist()
        if not job["done"].done():
            job["done"].set_result(code)

    def dispatch(self):
        if self.stopping or self.admission_blocked():
            return
        while self.queue and len(self.active) < self.cfg["max_runs"]:
            job = self.queue[0]
            row = job["public"]
            used = sum(j["public"]["tokens"] for j in self.active.values())
            if used + row["tokens"] > self.cfg["budget"]:
                break
            if any(j["public"]["worktree"] == row["worktree"] and not (
                    job["request"].get("concurrent_worktree") and
                    j["request"].get("concurrent_worktree")) for j in self.active.values()):
                break
            self.queue.popleft()
            row.update(state="starting", started=time.time())
            job["started_clock"] = time.monotonic()
            self.active[row["id"]] = job
            self.persist()  # spawn intent is durable BEFORE a process can exist
            job["task"] = asyncio.create_task(self.execute(job))

    async def execute(self, job):
        row, request = job["public"], job["request"]
        parent, child = socket.socketpair()
        proc = None
        code = 75
        pumps = []
        result_task = None
        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, str(Path(__file__).with_name("guardian.py")), str(child.fileno()), row["id"],
                pass_fds=(child.fileno(),), start_new_session=True,
                stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            job["proc"] = proc
            child.close()
            row.update(pid=proc.pid, state="running")
            self.persist()  # guardian's GO gate remains closed until this succeeds
            reader, control = await asyncio.open_connection(sock=parent)
            job["control"] = control
            if job.get("reason"):
                control.close()
            else:
                control.write(json.dumps({"argv": request["argv"], "cwd": request["cwd"],
                                          "env": request["env"], "timeout": request["timeout"]}).encode() + b"\n")
                await control.drain()
            await self.emit(job, {"event": "started", **row})

            async def pump(stream, channel):
                try:
                    while data := await stream.read(16384):
                        await self.emit(job, {"event": channel, "data": base64.b64encode(data).decode()})
                except (OSError, ConnectionError, asyncio.TimeoutError):
                    # A non-reading client must not leave a child blocked on a
                    # full output pipe until its potentially long run deadline.
                    self.cancel(job, "output_disconnected")
                    raise

            pumps = [asyncio.create_task(pump(proc.stdout, "stdout")),
                     asyncio.create_task(pump(proc.stderr, "stderr"))]
            # Reading guardian metadata is independent of output backpressure.
            async def outcome():
                line = await reader.readline()
                return json.loads(line) if line else {}
            result_task = asyncio.create_task(outcome())
            result = await result_task
            if not result:
                row["state"] = "quarantined"
                if not job.get("reason"):
                    job["reason"] = "infrastructure_error"
                self.persist()
            # A killed guardian may leave descendants holding output pipes open.
            # Control EOF, not output EOF, is the authoritative lifetime boundary.
            await asyncio.wait_for(asyncio.gather(*pumps), 3)
            await asyncio.wait_for(proc.wait(), 3)
            code = result["code"] if result else 75
            row.update({k: result[k] for k in ("cpu_seconds", "maxrss") if k in result})
            if code == 124:
                job["reason"] = "timeout"
        except (OSError, ValueError, asyncio.TimeoutError, ConnectionError):
            job["reason"] = "infrastructure_error"
        finally:
            child.close()
            if job.get("control"):
                job["control"].close()
            else:
                parent.close()
            for pump_task in pumps:
                if not pump_task.done():
                    pump_task.cancel()
            if result_task and not result_task.done():
                result_task.cancel()
            if proc:
                try:
                    await asyncio.wait_for(proc.wait(), 5)
                except asyncio.TimeoutError:
                    pass  # never release a permit merely because a timer expired
                if group_exists(proc.pid):
                    row["state"] = "quarantined"
                    self.quarantine.append(dict(row))
                    self.recovery_event.set()
            if job.get("reason") in ("cancelled", "client_disconnected", "client_error", "scheduler_stopped"):
                code = 130
            self.finish(job, code, job.get("reason"))
            self.dispatch()

    async def handle(self, reader, writer):
        job = None
        disconnected = None
        try:
            line = await asyncio.wait_for(reader.readline(), 5)
            req = json.loads(line)
            if not isinstance(req, dict):
                raise ValueError("Request must be an object")
            action = req.get("action")
            if action in ("status", "queue"):
                result = self.snapshot()
            elif action == "recover":
                self.quarantine = [j for j in self.quarantine if group_exists(j.get("pid"))]
                self.persist()
                self.dispatch()
                result = self.snapshot()
            elif action == "stop":
                if self.jobs or self.quarantine:
                    raise ValueError("Refusing stop while jobs or quarantined groups exist")
                result = {"stopped": True}
                self.stopping = True
                self.stop_event.set()
            elif action == "cancel":
                target = self.jobs.get(req.get("id"))
                if not target:
                    raise ValueError("Unknown live job")
                self.cancel(target)
                self.dispatch()
                result = {"cancelled": req["id"]}
            elif action == "run":
                if self.stopping or self.admission_blocked():
                    raise ValueError("Recovery blocked: inspect status quarantine; recover only after groups exit")
                if len(self.jobs) >= self.cfg["max_queue"]:
                    raise ValueError("Queue capacity reached")
                cwd = str(Path(req["cwd"]).resolve(strict=True))
                if not Path(cwd).is_dir():
                    raise ValueError("cwd must be a directory")
                for flag in ("allow_duplicate", "concurrent_worktree", "exclusive"):
                    if flag in req and type(req[flag]) is not bool:
                        raise ValueError(flag + " must be a boolean")
                for field in ("project", "worktree"):
                    value = req.get(field, cwd)
                    if not isinstance(value, str) or not value or "\x00" in value or len(value) > 4096:
                        raise ValueError(field + " must be a bounded path string")
                workers = req.get("workers", self.cfg["workers"])
                if type(workers) is not int or not 1 <= workers <= self.cfg["workers"]:
                    raise ValueError("Requested workers exceed configured per-run maximum")
                runner = req.get("runner", "unspecified")
                if runner not in ("unspecified", "vitest", "playwright", "jest", "node", "generic"):
                    raise ValueError("Unknown runner")
                exclusive = runner == "generic" or req.get("exclusive", False)
                baseline = self.cfg["budget"] if exclusive else (
                    self.cfg["workers"] if self.cfg["policy"] == "fixed" else workers)
                tokens = req.get("weight")
                tokens = baseline if tokens is None else tokens
                if type(tokens) is not int or not baseline <= tokens <= self.cfg["budget"]:
                    raise ValueError("Weight must reserve at least the policy baseline and fit the budget")
                if not isinstance(req["argv"], list) or not req["argv"] or not all(isinstance(x, str) and "\x00" not in x for x in req["argv"]):
                    raise ValueError("argv must be a nonempty string array")
                if not isinstance(req["env"], dict) or not all(isinstance(k, str) and isinstance(v, str)
                        and k and "=" not in k and "\x00" not in k + v for k, v in req["env"].items()):
                    raise ValueError("env must map strings to strings")
                timeout = req.get("timeout", self.cfg["timeout"])
                if type(timeout) is not int or not 1 <= timeout <= self.cfg["timeout"]:
                    raise ValueError("Runtime deadline must fit configured timeout")
                req.update(cwd=cwd, timeout=timeout)
                digest = hashlib.sha256(json.dumps([cwd, req["argv"]]).encode()).hexdigest()
                if not req.get("allow_duplicate") and any(j["digest"] == digest for j in self.jobs.values()):
                    raise ValueError("Duplicate live command in worktree; wait for it or use --allow-duplicate")
                row = {"id": uuid.uuid4().hex[:16], "state": "queued", "queued": time.time(),
                       "started": None, "pid": None, "project": req.get("project", cwd),
                       "worktree": str(Path(req.get("worktree", cwd)).resolve()),
                       "runner": runner, "workers": None if runner == "generic" else workers,
                       "tokens": tokens, "exclusive": exclusive,
                       "parallelism_guaranteed": runner not in ("generic", "unspecified")}
                job = {"public": row, "request": req, "digest": digest, "writer": writer,
                       "queued_clock": time.monotonic(),
                       "write_lock": asyncio.Lock(), "done": asyncio.get_running_loop().create_future()}
                self.jobs[row["id"]] = job
                self.queue.append(job)
                await self.emit(job, {"event": "queued", **row})
                self.dispatch()
                disconnected = asyncio.create_task(reader.read(1))
                deadline = asyncio.create_task(asyncio.sleep(self.cfg["queue_timeout"]))
                done, _ = await asyncio.wait([job["done"], disconnected, deadline], return_when=asyncio.FIRST_COMPLETED)
                if disconnected in done and not job["done"].done():
                    self.cancel(job, "client_disconnected")
                elif deadline in done and row["state"] == "queued":
                    self.cancel(job, "queue_timeout")
                deadline.cancel()
                if not job["done"].done():
                    ready, _ = await asyncio.wait([job["done"], disconnected], return_when=asyncio.FIRST_COMPLETED)
                    if disconnected in ready and not job["done"].done():
                        self.cancel(job, "client_disconnected")
                code = await job["done"]
                result = {"event": "exit", "id": row["id"], "code": code}
            else:
                raise ValueError("Unknown action")
            writer.write(json.dumps(result).encode() + b"\n")
            await asyncio.wait_for(writer.drain(), 10)
        except (ValueError, TypeError, KeyError, OSError, RecursionError, asyncio.TimeoutError) as error:
            if job and not job["done"].done():
                self.cancel(job, "client_error")
            try:
                writer.write(json.dumps({"error": str(error), "code": 75}).encode() + b"\n")
                await asyncio.wait_for(writer.drain(), 10)
            except (OSError, ConnectionError, asyncio.TimeoutError):
                pass
        finally:
            if disconnected:
                disconnected.cancel()
            writer.close()
            self.dispatch()


async def serve():
    root = home()
    lock = open(root / "daemon.lock", "a+")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return 0
    sys.stderr = DiagnosticLog(root / "daemon.log")
    scheduler = Scheduler(root)
    path = root / "scheduler.sock"
    if path.exists():
        path.unlink()  # only the flock owner may replace a stale socket
    server = await asyncio.start_unix_server(scheduler.handle, path=str(path), limit=2 * 1024 * 1024)
    os.chmod(path, 0o600)
    stop = scheduler.stop_event
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        loop.add_signal_handler(sig, stop.set)
    async def recover_groups():
        while True:
            await scheduler.recovery_event.wait()
            while scheduler.quarantine:
                await asyncio.sleep(2)
                remaining = [j for j in scheduler.quarantine if group_exists(j.get("pid"))]
                if len(remaining) != len(scheduler.quarantine):
                    scheduler.quarantine = remaining
                    scheduler.persist()
                    scheduler.dispatch()
            scheduler.recovery_event.clear()

    recovery = asyncio.create_task(recover_groups())
    async with server:
        await stop.wait()
    recovery.cancel()
    scheduler.stopping = True
    for job in list(scheduler.jobs.values()):
        scheduler.cancel(job, "scheduler_stopped")
    await asyncio.gather(*(j["done"] for j in list(scheduler.jobs.values())))
    path.unlink(missing_ok=True)
    lock.close()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(serve()))
    except (OSError, ValueError, KeyError) as error:
        print(f"agent-test daemon: {error}", file=sys.stderr)
        sys.exit(75)
