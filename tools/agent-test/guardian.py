"""Own the process-group identity until descendants are stopped.

A private inherited socket gates execution and detects daemon death. No heartbeat
lease is used: time passing alone never makes a running CPU reservation reusable.
"""
import json
import os
import resource
import select
import signal
import socket
import subprocess
import sys
import time


stopping = False


def request_stop(_signum, _frame):
    global stopping
    stopping = True


def peers():
    probe = subprocess.Popen(["ps", "-axo", "pid=,pgid=,stat="], stdout=subprocess.PIPE, text=True)
    output, _ = probe.communicate()
    if probe.returncode:
        raise OSError("Cannot inspect process group")
    return [int(fields[0]) for line in output.splitlines()
            if len(fields := line.split()) == 3 and int(fields[1]) == os.getpgrp()
            and int(fields[0]) not in (os.getpid(), probe.pid) and not fields[2].startswith("Z")]


def report_outcome(control, result):
    usage = resource.getrusage(resource.RUSAGE_CHILDREN)
    try:
        control.sendall(json.dumps({"code": result, "cpu_seconds": usage.ru_utime + usage.ru_stime,
                                    "maxrss": usage.ru_maxrss}).encode() + b"\n")
    except (BrokenPipeError, ConnectionResetError):
        pass


def main():
    control = socket.socket(fileno=int(sys.argv[1]))
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, request_stop)
    # No work can execute before the parent durably records our group ID.
    packet = bytearray()
    while b"\n" not in packet:
        block = control.recv(65536)
        if not block:
            return 75
        packet.extend(block)
        if len(packet) > 2 * 1024 * 1024:
            return 75
    job = json.loads(packet)
    if stopping:
        return 130
    wake_read, wake_write = socket.socketpair()
    wake_read.setblocking(False)
    wake_write.setblocking(False)
    signal.set_wakeup_fd(wake_write.fileno())
    signal.signal(signal.SIGCHLD, lambda _signum, _frame: None)
    child = subprocess.Popen(job["argv"], cwd=job["cwd"], env=job["env"], stdin=subprocess.DEVNULL)
    started = time.monotonic()
    code = child.poll()
    while code is None:
        remaining = max(0, job["timeout"] - (time.monotonic() - started))
        ready, _, _ = select.select([control, wake_read], [], [], remaining)
        if wake_read in ready:
            wake_read.recv(4096)
        if control in ready:
            # Any command, or EOF, means cancel. No payload is interpreted.
            control.recv(1)
            request_stop(0, None)
        if stopping or time.monotonic() - started >= job["timeout"]:
            code = 130 if stopping else 124
            break
        code = child.poll()
    result = code if code >= 0 else 128 - code
    # TERM is handled by us, while descendants receive their ordinary signal.
    # Keep the leader alive throughout escalation, preventing PGID reuse.
    if child.poll() is None or peers():
        os.killpg(os.getpgrp(), signal.SIGTERM)
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            child.poll()
            if not peers():
                break
            select.select([], [], [], 0.1)
        if peers():
            # Kill our own group last. The daemon retains tokens until the
            # entire group disappears, even if we are SIGKILLed externally.
            # Publish the known timeout/cancellation before killing ourselves.
            # This is metadata, not permission to release the reservation.
            report_outcome(control, result)
            os.killpg(os.getpgrp(), signal.SIGKILL)
    child.wait()
    report_outcome(control, result)
    signal.set_wakeup_fd(-1)
    wake_read.close()
    wake_write.close()
    return result


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError) as error:
        print(f"agent-test guardian: {type(error).__name__}", file=sys.stderr)
        sys.exit(75)
