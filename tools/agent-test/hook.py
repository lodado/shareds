"""Claude PreToolUse Bash guard. Deny instead of rewriting to avoid RTK races.

main() reads a hook JSON event on stdin and emits a permissionDecision deny
only for unscheduled supported test runners in configured roots/worktrees.
This is an accidental-bypass guard, not a sandbox:
arbitrary programs can dynamically start test processes outside shell analysis.
"""

import json
import re
import shlex
import sys
from pathlib import Path

from commands import CommandError, resolve, script_invocation, scripts_at, split_script


_OPERATORS = set(";&|<>()\n\r")
_TEST_LOOKING = re.compile(r"\b(?:vitest|playwright|jest|pytest|unittest)\b|\b(?:cargo|go|bun)\s+test\b|\bnode(?:js)?\b[^\n;&|]*--test\b|\b(?:npm|pnpm|bun)\b[^\n;&|]*\btest(?:\b|:)", re.I)


_HEREDOC = re.compile(r"<<(-?)[ \t]*(['\"])([A-Za-z_][A-Za-z_0-9]*)\2")
_COMMAND_START = re.compile(r"(?:^|\$\(|[;&|(`])[ \t]*")
# Programs that only read a heredoc as text: a PR body or a commit message says cargo test, it does not run it.
_DATA_SINKS = {"cat", "git", "gh"}


def _strip_data_heredocs(command):
    """Drop the body of a quoted heredoc that a text-only program reads.

    A quoted delimiter (<<'EOF') makes the body literal: nothing in it expands or runs. It is removed from the analysis only
    when its reader is a data sink and nothing else follows the marker on its line (a pipe to a shell, a second command);
    a missing terminator or any other reader (bash, python, ...) leaves the command as it was, so those stay denied."""
    pos = 0
    while True:
        marker = _HEREDOC.search(command, pos)
        if not marker:
            return command
        line_start = command.rfind("\n", 0, marker.start()) + 1
        line_end = command.find("\n", marker.end())
        if line_end == -1:
            return command
        pos = marker.end()
        if command[marker.end():line_end].strip(" \t)\"'"):
            continue
        before = command[line_start:marker.start()]
        starts = list(_COMMAND_START.finditer(before))
        word = re.match(r"[A-Za-z0-9_./~-]+", before[starts[-1].end():]) if starts else None
        if not word or Path(word.group()).name not in _DATA_SINKS:
            continue
        body_start = line_end + 1
        offset = body_start
        for line in command[body_start:].split("\n"):
            if (line.strip("\t") if marker.group(1) else line) == marker.group(3):
                command = command[:body_start] + command[offset:]
                pos = body_start + len(line)
                break
            offset += len(line) + 1
        # no terminator line: leave the command unchanged and keep looking after the marker


def _tokens(command):
    lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|<>()\n\r")
    lexer.whitespace = " \t"
    lexer.whitespace_split = True
    lexer.commenters = ""
    return list(lexer)


def _operator(token):
    return bool(token) and all(c in _OPERATORS for c in token)


def _strip_prefix(tokens):
    tokens = list(tokens)
    while tokens and re.match(r"^[A-Za-z_][A-Za-z_0-9]*=", tokens[0]):
        tokens.pop(0)
    if tokens and Path(tokens[0]).name == "rtk":
        tokens = tokens[1:]
        if tokens[:1] in (["proxy"], ["rewrite"]):
            tokens = tokens[1:]
    if tokens and tokens[0] in {"env", "command", "exec"}:
        tokens = tokens[1:]
        while tokens and (tokens[0].startswith("-") or re.match(r"^[A-Za-z_][A-Za-z_0-9]*=", tokens[0])):
            tokens.pop(0)
    return tokens


def _wrapped(tokens, command):
    if any(_operator(token) for token in tokens) or any(c in command for c in "$`\n\r"):
        return False
    # Assignments are not accepted as an exemption: e.g. PATH could replace
    # a bare executable, or NODE_OPTIONS could launch another program.
    if tokens[:2] == ["rtk", "proxy"]:
        tokens = tokens[2:]
    allowed = {"agent-test", "~/.local/bin/agent-test", str(Path.home() / ".local/bin/agent-test")}
    return len(tokens) >= 2 and tokens[0] in allowed and tokens[1] == "run"


def _routes(tokens, cwd, seen=()):
    tokens = _strip_prefix(tokens)
    if not tokens:
        return False
    while tokens and tokens[0] in {"if", "then", "elif", "do", "!", "time"}:
        tokens.pop(0)
    if not tokens:
        return False
    program = Path(tokens[0]).name
    if program == "agent-test" and tokens[1:2] == ["run"]:
        # A genuinely whole-command wrapper returned before segment analysis.
        # Reaching here means a compound command or an untrusted wrapper path.
        return True
    if program in {'pytest', 'py.test'} or (program in {'python', 'python3'} and tokens[1:3] in (['-m', 'pytest'], ['-m', 'unittest'])):
        return True
    if program in {'cargo', 'go', 'bun'} and tokens[1:2] == ['test']:
        return True
    if program in {"vitest", "vitest.mjs", "playwright", "jest", "jest.js"}:
        return True
    if program in {"node", "nodejs"} and any(t.partition('=')[0] == '--test' for t in tokens[1:]):
        return True
    if program in {"node", "nodejs", "npx", "pnpm", "npm", "bun"} and any(re.fullmatch(r"(?:vitest|playwright|jest)(?:@[^/]+)?|vitest\.mjs|jest\.js", Path(t).name) for t in tokens[1:]):
        return True
    if program in {"sh", "bash", "zsh"}:
        for index, token in enumerate(tokens[1:], 1):
            if token.startswith("-") and "c" in token:
                return index + 1 < len(tokens) and _scan(tokens[index + 1], cwd, seen)
    if program in {"eval", "xargs", "nohup", "timeout", "nice", "sudo"}:
        if _TEST_LOOKING.search(" ".join(tokens[1:])):
            return True
    if program in {"node", "nodejs", "python", "python3"} and _TEST_LOOKING.search(" ".join(tokens[1:])):
        return True
    normalized = [program, *tokens[1:]]
    invocation = script_invocation(normalized)
    if invocation:
        name, _ = invocation
        scripts = scripts_at(cwd)
        if name in seen:
            return bool(_TEST_LOOKING.search(name))
        for prefix in ("pre", "post"):
            lifecycle = scripts.get(prefix + name)
            if lifecycle and _scan(lifecycle, cwd, (*seen, name)):
                return True
        script = scripts.get(name, "")
        if not isinstance(script, str):
            raise ValueError("Malformed package script")
        if script:
            return _scan(script, cwd, (*seen, name))
    # Package-manager option placement is not safe to guess. A test-looking
    # invocation is blocked rather than silently missing --filter/--prefix.
    if program in {"npm", "pnpm", "bun"} and any(t.startswith("-") for t in tokens[1:]):
        return any(t == "test" or t.startswith("test:") for t in tokens[1:])
    return False


_STRING_RUNNERS = {"sh", "bash", "zsh", "eval", "xargs", "nohup", "timeout", "nice", "sudo"}


def _substitutions(command):
    """Text inside each $(...) and `...`; an unclosed one runs to the end of the command."""
    found = []
    for opening in re.finditer(r"\$\(", command):
        depth, end = 1, opening.end()
        while end < len(command) and depth:
            depth += {"(": 1, ")": -1}.get(command[end], 0)
            end += 1
        found.append(command[opening.end():end])
    found.extend(command.split("`")[1::2])
    return found


def _dynamic_program(tokens):
    """True when a segment's program, or the string a shell/eval runs, comes from a variable."""
    tokens = _strip_prefix(tokens)
    while tokens and tokens[0] in {"if", "then", "elif", "do", "!", "time"}:
        tokens.pop(0)
    if not tokens:
        return False
    if "$" in tokens[0]:
        return True
    return Path(tokens[0]).name in _STRING_RUNNERS and any("$" in token for token in tokens[1:])


def _scan(command, cwd, seen=()):
    """Classify a Bash string without executing it or its package scripts."""
    if not isinstance(command, str):
        return False
    try:
        tokens = _tokens(command)
        if _wrapped(tokens, command):
            return False
        # Substitution can execute even in echo/grep arguments. Quoted literal
        # substitutions are conservatively denied when they mention tests.
        if any(_TEST_LOOKING.search(inner) for inner in _substitutions(command)):
            return True
        # A program chosen at run time ($R run, eval $CMD) cannot be read here:
        # it is denied whenever the command mentions a test runner anywhere.
        mentions_tests = bool(_TEST_LOOKING.search(command))
        segment = []
        for token in [*tokens, ";"]:
            if _operator(token):
                if mentions_tests and _dynamic_program(segment):
                    return True
                if _routes(segment, cwd, seen):
                    return True
                target = _cd_target(segment, cwd)
                if target is not None:
                    cwd = str(target)
                segment = []
            else:
                segment.append(token)
        return False
    except Exception:
        # Parsing, I/O or malformed package data cannot turn test commands into
        # an allow. Ordinary non-test shell commands remain unaffected.
        return bool(_TEST_LOOKING.search(command))


def should_deny(command, cwd):
    """Public classifier. Exceptions fail closed only for test-looking input."""
    return _scan(_strip_data_heredocs(command), cwd)


def _cd_target(tokens, cwd):
    if len(tokens) == 2 and tokens[0] == 'cd' and not any(c in tokens[1] for c in '$`') and tokens[1] != '-':
        target = Path(tokens[1]).expanduser()
        return (Path(cwd) / target).resolve()
    return None


def _in_scope(cwd, scope_config=None):
    path = Path(scope_config) if scope_config else Path.home() / '.local/share/agent-test/hook-scope.json'
    data = json.loads(path.read_text()) if path.exists() else {'roots': [str(Path.home() / 'orca')], 'worktrees': []}
    if not isinstance(data, dict) or set(data) - {'roots', 'worktrees'}:
        raise ValueError('Invalid hook scope config')
    roots, worktrees = data.get('roots', []), data.get('worktrees', [])
    if not isinstance(roots, list) or not isinstance(worktrees, list) or any(not isinstance(p, str) or not p for p in [*roots, *worktrees]):
        raise ValueError('Hook scope roots/worktrees must be nonempty path strings')
    target = Path(cwd).expanduser().resolve()
    return any(target.is_relative_to(Path(root).expanduser().resolve()) for root in [*roots, *worktrees])


def _scoped_command(command, cwd, scope_config):
    if _in_scope(cwd, scope_config):
        return True
    segment = []
    for token in [*_tokens(command), ';']:
        if _operator(token):
            target = _cd_target(segment, cwd)
            if target is not None:
                cwd = str(target)
                if _in_scope(cwd, scope_config):
                    return True
            segment = []
        else:
            segment.append(token)
    return False


def _suggestion(command, cwd):
    """Never place RTK or a compound shell expression after the argv boundary."""
    try:
        tokens = split_script(command)
        if tokens[:1] == ['rtk']:
            tokens = tokens[1:]
            if tokens[:1] in (['proxy'], ['rewrite']):
                tokens = tokens[1:]
        try:
            resolve(tokens, cwd, 1)
        except CommandError:
            if script_invocation(tokens) or _routes(tokens, cwd):
                resolve(tokens, cwd, 1, runner='generic')
                return 'rtk proxy ~/.local/bin/agent-test run --runner generic -- ' + shlex.join(tokens)
            raise
        return 'rtk proxy ~/.local/bin/agent-test run -- ' + shlex.join(tokens)
    except (CommandError, OSError, ValueError):
        return 'Run setup/cd separately, then use a direct runner invocation, for example: rtk proxy ~/.local/bin/agent-test run -- vitest run. For lifecycle/compound scripts use: rtk proxy ~/.local/bin/agent-test run --runner generic -- npm test'


def decision(event, scope_config=None):
    if event.get("tool_name", "Bash") != "Bash":
        return None
    command = _strip_data_heredocs(event.get("tool_input", {}).get("command", ""))
    cwd = event.get("cwd") or str(Path.cwd())
    if not _scoped_command(command, cwd, scope_config):
        return None
    if not should_deny(command, cwd):
        return None
    suggestion = _suggestion(command, cwd)
    return {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "Direct test execution bypasses the global test scheduler. Use: " + suggestion}}


def main():
    raw = sys.stdin.read()
    try:
        event = json.loads(raw)
        scope_config = sys.argv[2] if len(sys.argv) == 3 and sys.argv[1] == '--scope-config' else None
        result = decision(event, scope_config)
    except Exception:
        result = None
        if _TEST_LOOKING.search(raw):
            result = {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "Could not safely inspect test command. Use rtk proxy ~/.local/bin/agent-test run -- vitest run."}}
    if result:
        print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
