"""Shared local state. No third-party dependencies."""
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import subprocess
import tempfile


class DiagnosticLog:
    """Bound diagnostics, never test output, to two 1 MiB files."""

    def __init__(self, path):
        self.handler = RotatingFileHandler(path, maxBytes=1024 * 1024,
                                           backupCount=1, encoding="utf-8")

    def write(self, text):
        if text.strip():
            # Bound individual records as well as rotation between records.
            record = logging.LogRecord("agent-test", logging.ERROR, "", 0,
                                       text[-65536:].rstrip("\n"), (), None)
            self.handler.emit(record)
        return len(text)

    def flush(self):
        self.handler.flush()


def home():
    root = Path(os.environ.get("AGENT_TEST_HOME", Path.home() / ".local/state/agent-test"))
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if root.is_symlink() or root.stat().st_uid != os.getuid() or root.stat().st_mode & 0o077:
        raise ValueError("AGENT_TEST_HOME must be owned by you, mode 0700, not a symlink")
    return root.resolve()


def atomic_json(path, data):
    fd, name = tempfile.mkstemp(dir=path.parent, prefix=".write-")
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(data, stream, separators=(",", ":"))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def topology():
    cores = os.cpu_count() or 1
    try:
        perf = int(subprocess.check_output(["sysctl", "-n", "hw.perflevel0.physicalcpu"], stderr=subprocess.DEVNULL))
    except (OSError, ValueError, subprocess.CalledProcessError):
        perf = max(1, cores // 2)
    return {"logical_cores": cores, "performance_cores": perf}


def config(root):
    machine = topology()
    budget = max(1, min(machine["performance_cores"], machine["logical_cores"] - 1))
    defaults = {"budget": budget, "workers": min(2, budget), "max_runs": max(1, budget // 2),
                "policy": "fixed", "timeout": 900, "queue_timeout": 3600,
                "max_queue": 256, "history_limit": 500, "history_days": 7}
    path = root / "config.json"
    values = {**defaults, **(json.loads(path.read_text()) if path.exists() else {})}
    if set(values) != set(defaults):
        raise ValueError("Unknown configuration key")
    for key in defaults.keys() - {"policy"}:
        if type(values[key]) is not int or not 1 <= values[key] <= 100000:
            raise ValueError(f"{key} must be a positive bounded integer")
    if values["workers"] > values["budget"] or values["policy"] not in ("fixed", "weighted"):
        raise ValueError("workers must fit budget; policy must be fixed or weighted")
    return values


def boot_id():
    if os.uname().sysname == "Darwin":
        return subprocess.check_output(["sysctl", "-n", "kern.boottime"], text=True).strip()
    return Path("/proc/sys/kernel/random/boot_id").read_text().strip()


def group_exists(pgid):
    if not pgid or pgid <= 1:
        return True  # ambiguous intent is quarantined, never guessed away
    try:
        os.killpg(pgid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
