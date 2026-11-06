"""Opt-in per-user install/uninstall. Never called automatically on import.

install(source_dir=None, home=None) and uninstall(home=None) return a summary
mapping. Stable app copies remain after uninstall for audit/recovery. Only the
exact managed hook and unchanged managed launcher are removed. Settings are
backed up before every mutation. No daemon start/stop is performed here.
"""

import argparse
import fcntl
import functools
import hashlib
import json
import os
import shlex
import sys
import tempfile
from pathlib import Path


MARKER = "# agent-test managed launcher v1"
_UNSET = object()


def _snapshot(path):
    if path.is_symlink():
        raise ValueError(f'Refusing to replace symlink: {path}')
    return path.read_bytes() if path.exists() else None


def _locked(function):
    @functools.wraps(function)
    def transaction(*args, **kwargs):
        # Both public entry points accept home, but at different positions.
        home = kwargs.get('home', args[1] if function.__name__ == 'install' and len(args) > 1 else args[0] if function.__name__ == 'uninstall' and args else None)
        root = _paths(home)[0]
        root.mkdir(parents=True, exist_ok=True)
        fd = os.open(root / 'install.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        runtime_fds = []
        try:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise ValueError('Another agent-test install/uninstall is in progress. Retry when it completes.') from exc
            if function.__name__ == 'install':
                user_home = Path(home).expanduser().resolve() if home else Path.home()
                states = {user_home / '.local/state/agent-test'}
                if os.environ.get('AGENT_TEST_HOME'):
                    states.add(Path(os.environ['AGENT_TEST_HOME']).expanduser().absolute())
                for state in sorted(states):
                    state.mkdir(parents=True, exist_ok=True, mode=0o700)
                    if state.is_symlink() or state.stat().st_uid != os.getuid() or state.stat().st_mode & 0o077:
                        raise ValueError(f'Unsafe daemon state directory: {state}')
                    runtime_fd = os.open(state / 'daemon.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
                    runtime_fds.append(runtime_fd)
                    try:
                        fcntl.flock(runtime_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except BlockingIOError as exc:
                        raise ValueError('A daemon is running. Drain and stop it before installing or upgrading agent-test.') from exc
            return function(*args, **kwargs)
        finally:
            for runtime_fd in runtime_fds:
                os.close(runtime_fd)
            os.close(fd)
    return transaction


def _paths(home):
    home = Path(home).expanduser().resolve() if home else Path.home()
    root = home / ".local/share/agent-test"
    return root, root / "app", home / ".local/bin/agent-test", home / ".claude/settings.json"


def _read_json(path, default):
    if path.is_symlink():
        raise ValueError(f"Refusing to replace symlink: {path}")
    return json.loads(path.read_text()) if path.exists() else default


def _atomic(path, content, mode=0o600, expected=_UNSET):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".agent-test-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, mode)
        if expected is not _UNSET and _snapshot(path) != expected:
            raise ValueError(f'Concurrent settings edit detected. No overwrite performed: {path}')
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _settings(path):
    data = _read_json(path, {})
    if not isinstance(data, dict) or not isinstance(data.get("hooks", {}), dict):
        raise ValueError("settings.json must contain an object and hooks must be an object.")
    groups = data.get("hooks", {}).get("PreToolUse", [])
    if not isinstance(groups, list) or any(not isinstance(g, dict) or not isinstance(g.get("hooks", []), list) for g in groups):
        raise ValueError("settings.json PreToolUse hook groups have an invalid shape.")
    return data


def _save_settings(path, data, expected):
    if _snapshot(path) != expected:
        raise ValueError(f'Concurrent settings edit detected. No overwrite performed: {path}')
    backup = None
    if path.exists():
        fd, backup = tempfile.mkstemp(prefix="settings.json.agent-test-backup-", dir=path.parent)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(expected)
    mode = path.stat().st_mode & 0o777 if path.exists() else 0o600
    _atomic(path, json.dumps(data, indent=2) + "\n", mode, expected=expected)
    return backup


def _remove_hook(data, owned):
    groups = data.get("hooks", {}).get("PreToolUse", [])
    changed = False
    result = []
    for group in groups:
        hooks = group.get("hooks", [])
        remaining = [hook for hook in hooks if hook != owned]
        if remaining != hooks:
            changed = True
            # Retain metadata/other hooks, remove only our otherwise empty group.
            if remaining or set(group) - {"matcher", "hooks"}:
                result.append({**group, "hooks": remaining})
        else:
            result.append(group)
    if changed:
        data["hooks"]["PreToolUse"] = result
    return changed


class _FileTransaction:
    """Rollback only our exact writes, never a concurrent editor's contents.

    This is exception recovery, not a durable journal. SIGKILL, process crashes
    and power loss during installation can leave partial files requiring manual
    recovery. Drain and stop daemons before installation. The lock guard covers
    the default state directory and this process's explicit AGENT_TEST_HOME,
    not custom state directories configured only in other shells.
    """

    def __init__(self):
        self.writes = []

    def __enter__(self):
        return self

    def remember(self, path, content):
        before = _snapshot(path)
        mode = path.stat().st_mode & 0o777 if before is not None else 0o600
        return (path, before, mode, content.encode())

    def write(self, path, content, mode=0o600, expected=_UNSET):
        entry = self.remember(path, content)
        _atomic(path, content, mode, expected=entry[1] if expected is _UNSET else expected)
        self.writes.append(entry)

    def settings(self, path, data, expected):
        entry = self.remember(path, json.dumps(data, indent=2) + '\n')
        backup = _save_settings(path, data, expected)
        self.writes.append(entry)
        return backup

    def __exit__(self, kind, error, traceback):
        if kind is not None:
            for path, before, mode, written in reversed(self.writes):
                if _snapshot(path) != written:
                    continue
                if before is None:
                    path.unlink()
                else:
                    _atomic(path, before.decode(), mode, expected=written)
        return False


@_locked
def install(source_dir=None, home=None):
    source = Path(source_dir or Path(__file__).parent).resolve()
    root, app, launcher, settings = _paths(home)
    manifest_path = root / "installation.json"
    manifest = _read_json(manifest_path, {})
    expected = _snapshot(settings)
    data = _settings(settings)
    had_hooks = manifest.get("had_hooks", "hooks" in data)
    had_pretooluse = manifest.get("had_pretooluse", "PreToolUse" in data.get("hooks", {}))
    if launcher.is_symlink():
        raise ValueError(f"Refusing unrelated symlink launcher: {launcher}")
    launcher_expected = _snapshot(launcher)
    if launcher.exists() and (not manifest or hashlib.sha256(launcher.read_bytes()).hexdigest() != manifest.get("launcher_sha256")):
        raise ValueError(f"Refusing to overwrite an unrelated or modified launcher: {launcher}")
    required = ["agent-test", "commands.py", "hook.py", "install.py", "daemon.py", "guardian.py", "common.py"]
    missing = [name for name in required if not (source / name).is_file()]
    if missing:
        raise ValueError("Incomplete source app: " + ", ".join(missing))
    if app.exists() and not manifest and any(app.iterdir()):
        raise ValueError(f"Refusing an unowned existing app directory: {app}")
    if app.is_symlink():
        raise ValueError(f"Refusing symlink app directory: {app}")
    scope = root / 'hook-scope.json'
    if scope.exists():
        scope_data = _read_json(scope, {})
        if not isinstance(scope_data, dict) or set(scope_data) - {'roots', 'worktrees'} or any(not isinstance(scope_data.get(k, []), list) or any(not isinstance(p, str) or not p for p in scope_data.get(k, [])) for k in ('roots', 'worktrees')):
            raise ValueError('Invalid hook-scope.json roots/worktrees configuration')
    else:
        scope_data = {'roots': [str(Path(home).expanduser().resolve() / 'orca' if home else Path.home() / 'orca')], 'worktrees': []}
    hook = {"type": "command", "command": shlex.join([sys.executable, str(app / "hook.py"), '--scope-config', str(scope)]) + " # agent-test-managed-hook-v1", "timeout": 10}
    launcher_text = "#!/bin/sh\n" + MARKER + "\nexec " + shlex.join([sys.executable, str(app / "agent-test")]) + ' "$@"\n'
    if manifest.get("hook"):
        _remove_hook(data, manifest["hook"])
    groups = data.setdefault("hooks", {}).setdefault("PreToolUse", [])
    if not any(hook in group.get("hooks", []) for group in groups):
        groups.append({"matcher": "Bash", "hooks": [hook]})
    with _FileTransaction() as transaction:
        app.mkdir(parents=True, exist_ok=True)
        # Copy only runtime modules, never tests, logs or benchmark results.
        for path in source.iterdir():
            if path.name == 'agent-test' or (path.suffix == '.py' and not path.name.startswith('test_')):
                destination = app / path.name
                if path.resolve() != destination.resolve():
                    transaction.write(destination, path.read_text(), 0o700 if path.name == 'agent-test' else 0o600)
        if _snapshot(settings) != expected:
            raise ValueError(f'Concurrent settings edit detected. No overwrite performed: {settings}')
        transaction.write(launcher, launcher_text, 0o700, expected=launcher_expected)
        backup = transaction.settings(settings, data, expected) if data != _settings(settings) else None
        if not scope.exists():
            transaction.write(scope, json.dumps(scope_data, indent=2) + '\n', expected=None)
        transaction.write(manifest_path, json.dumps({'hook': hook, 'launcher_sha256': hashlib.sha256(launcher_text.encode()).hexdigest(), 'had_hooks': had_hooks, 'had_pretooluse': had_pretooluse}, indent=2) + '\n')
    return {"installed": True, "launcher": str(launcher), "app": str(app), "backup": backup, 'hook_scope': str(scope)}


@_locked
def uninstall(home=None):
    root, app, launcher, settings = _paths(home)
    manifest = _read_json(root / "installation.json", {})
    if not manifest:
        return {"uninstalled": False, "backup": None, "launcher_removed": False}
    expected = _snapshot(settings)
    data = _settings(settings)
    changed = _remove_hook(data, manifest.get("hook"))
    if changed and not data["hooks"]["PreToolUse"] and not manifest.get("had_pretooluse", True):
        del data["hooks"]["PreToolUse"]
        if not data["hooks"] and not manifest.get("had_hooks", True):
            del data["hooks"]
    backup = _save_settings(settings, data, expected) if changed else None
    removed = False
    if launcher.is_file() and not launcher.is_symlink() and hashlib.sha256(launcher.read_bytes()).hexdigest() == manifest.get("launcher_sha256"):
        launcher.unlink()
        removed = True
    return {"uninstalled": True, "backup": backup, "launcher_removed": removed, "retained_app": str(app)}


def main(argv=None):
    parser = argparse.ArgumentParser(description="Install or remove the agent-test launcher and Claude hook")
    parser.add_argument("action", choices=["install", "uninstall"])
    args = parser.parse_args(argv)
    print(json.dumps(install() if args.action == "install" else uninstall()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
