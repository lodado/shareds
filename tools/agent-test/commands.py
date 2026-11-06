"""Resolve a deliberately small, shell-free local test command language.

resolve(argv, cwd, workers, runner='auto') returns exec argv or raises CommandError.
Package scripts are statically unwrapped, not executed by a package manager.
Consequently npm_* lifecycle variables, INIT_CWD and package-manager PATH
augmentation are NOT supplied. Scripts using expansion or lifecycle hooks are
rejected. Tests/configs depending implicitly on npm environment should use a
separately prepared environment, not rely on this command adapter.
"""

import json
import os
import re
import shlex
import shutil
from pathlib import Path


class CommandError(ValueError):
    """Unsupported or unsafe test command, with an actionable explanation."""


def package_file(cwd):
    for directory in (Path(cwd).resolve(), *Path(cwd).resolve().parents):
        candidate = directory / "package.json"
        if candidate.is_file():
            return candidate
    raise CommandError("No package.json found. Run from your test package directory.")


def scripts_at(cwd):
    data = json.loads(package_file(cwd).read_text())
    scripts = data.get("scripts", {})
    if not isinstance(scripts, dict):
        raise CommandError("package.json scripts must be an object.")
    return scripts


def split_script(script):
    # Reject shell expansion even inside double quotes. Single quoted dollar
    # literals are conservatively rejected too, rather than evaluating a shell.
    if not isinstance(script, str) or any(c in script for c in "$`\n\r"):
        raise CommandError("Script uses shell expansion. Use explicit generic mode to preserve shell/package-manager semantics.")
    quote = None
    escaped = False
    for character in script:
        if escaped:
            escaped = False
        elif character == "\\" and quote != "'":
            escaped = True
        elif character == quote:
            quote = None
        elif not quote and character in "\"'":
            quote = character
        elif not quote and character in "*?[]{}~#":
            raise CommandError("Unquoted shell expansion/comment is unsupported. Quote literal filters or pass direct vitest arguments.")
    lexer = shlex.shlex(script, posix=True, punctuation_chars=";&|<>()")
    lexer.whitespace_split = True
    lexer.commenters = ""
    try:
        tokens = list(lexer)
    except ValueError as exc:
        raise CommandError("Invalid script quoting. Pass direct vitest arguments.") from exc
    if any(token and all(c in ";&|<>()" for c in token) for token in tokens):
        raise CommandError("Compound shell scripts are unsupported by bounded adapters. Use explicit generic mode to preserve the script, or run setup separately.")
    if not tokens:
        raise CommandError("Empty package script cannot be resolved to a test runner.")
    return tokens


def script_invocation(argv):
    """Return (script name, forwarded args) for supported package invocations."""
    if not argv:
        return None
    manager = argv[0]
    if manager not in {"npm", "pnpm", "bun"}:
        return None
    rest = argv[1:]
    if rest and rest[0] in {"run", "run-script"}:
        rest = rest[1:]
    elif manager == "npm" and (not rest or rest[0] != "test"):
        return None
    elif manager == "bun":
        return None
    if not rest or rest[0].startswith("-") or rest[0] in {"exec", "vitest", "playwright", "jest"}:
        return None
    tail = rest[1:]
    if tail[:1] == ["--"]:
        tail = tail[1:]
    return rest[0], tail


def _unwrap_command(argv, cwd, seen=()):
    if not argv:
        return ["vitest"]
    if argv[0] in {"vitest", "playwright", "jest"} or (argv[0] in {"node", "nodejs"} and argv[1:2] == ['--test']):
        return list(argv)
    if argv[0] in {"npx", "pnpm"} and len(argv) > 1 and argv[1] in {"vitest", "playwright", "jest"}:
        return argv[1:]
    if argv[:2] in (["pnpm", "exec"], ["npm", "exec"]) and len(argv) > 2 and argv[2] in {"vitest", "playwright", "jest"}:
        return argv[2:]
    invocation = script_invocation(argv)
    if invocation:
        name, extra = invocation
        if Path(cwd).resolve() != package_file(cwd).parent:
            raise CommandError("Package scripts run from the package root. Change to that directory before running agent-test.")
        if argv[0] == "npm" and extra and "--" not in argv:
            raise CommandError("Forward npm script arguments explicitly after --.")
        scripts = scripts_at(cwd)
        if name not in scripts:
            raise CommandError(f"Unknown package script {name!r}. Pass vitest directly.")
        if name in seen or len(seen) >= 20:
            raise CommandError("Recursive package script detected. Pass vitest directly.")
        if any(scripts.get(prefix + name) for prefix in ("pre", "post")):
            raise CommandError(f"Script {name!r} has pre/post lifecycle hooks. Use --runner generic to preserve the complete lifecycle or run those explicitly around a direct runner invocation.")
        return _unwrap_command(split_script(scripts[name]) + extra, cwd, (*seen, name))
    raise CommandError("Only local Vitest, Playwright test, Jest, node --test or simple scripts routing to them are supported. Use --runner generic explicitly for other commands.")


def _local_vitest(cwd):
    base = Path(cwd).resolve()
    for directory in (base, *base.parents):
        package = directory / "node_modules" / "vitest" / "package.json"
        if package.is_file():
            data = json.loads(package.read_text())
            match = re.match(r"^(\d+)\.", str(data.get("version", "")))
            if not match or not 2 <= int(match[1]) <= 5:
                raise CommandError("Supported local Vitest versions are >=2 and <6. Extend the adapter after checking newer worker-limit semantics.")
            binary = data.get("bin", {}).get("vitest") if isinstance(data.get("bin"), dict) else data.get("bin")
            if not isinstance(binary, str):
                raise CommandError("Installed vitest package has no CLI bin entry.")
            cli = (package.parent / binary).resolve()
            if not cli.is_file() or not cli.is_relative_to(package.parent.resolve()):
                raise CommandError("Installed vitest CLI is missing or outside its package.")
            return cli, int(match[1])
    raise CommandError("Local Vitest is not installed. Install project dependencies first (no npx download is performed).")


_VALUE_FLAGS = {"-t", "--testNamePattern", "--test-name-pattern", "-c", "--config", "--root", "--dir", "--project", "--reporter", "--outputFile", "--output-file", "--environment", "--testTimeout", "--test-timeout", "--hookTimeout", "--hook-timeout", "--retry", "--exclude", "--sequence.seed", "--shard", "--pool", "--bail", "--configLoader", "--attachmentsDir"}
_BOOL_FLAGS = {"--coverage", "--no-coverage", "--silent", "--globals", "--no-globals", "--passWithNoTests", "--pass-with-no-tests", "--no-isolate", "--isolate", "--no-file-parallelism", "--fileParallelism", "--file-parallelism", "--disableConsoleIntercept", "--hideSkippedTests", "--logHeapUsage", "--update", "-u", "--allowOnly", "--no-color", "--color", "--no-cache", "--cache"}


def _arguments(args):
    args = list(args)
    if args[:1] == ["run"]:
        args.pop(0)
    result = []
    i = 0
    while i < len(args):
        token = args[i]
        if token == "--":
            # Preserve end-of-options but install managed flags before it.
            return result + args[i:]
        key, equal, value = token.partition("=")
        normalized = re.sub(r"[-.]", "", key).lower()
        if token in {"--run", "--run=true"}:
            i += 1
            continue
        if token in {"watch", "dev", "bench", "related", "list"} or key in {"-w", "--watch", "--ui", "--api", "--run"} or (token.startswith("-") and any(word in normalized for word in ("workers", "pooloptions", "maxthreads", "minthreads", "maxforks", "minforks", "maxconcurrency", "browser"))):
            raise CommandError(f"{token!r} is not allowed. agent-test owns run mode and worker limits.")
        if key in _VALUE_FLAGS:
            if not equal:
                i += 1
                if i >= len(args) or args[i].startswith("--"):
                    raise CommandError(f"{key} needs a value.")
                value = args[i]
            if key == "--pool" and value not in {"threads", "forks", "vmThreads", "vmForks"}:
                raise CommandError("Custom pools cannot enforce worker limits.")
            result.extend([key, value])
        elif key in _BOOL_FLAGS:
            if equal and value not in {"true", "false"}:
                raise CommandError(f"{key} expects true or false.")
            result.append(token)
        elif token.startswith("-"):
            raise CommandError(f"Unsupported Vitest option {token!r}. Use supported filters/options or extend the adapter explicitly.")
        else:
            if token in {";", "&&", "||", "|", ">", "<"}:
                raise CommandError("Shell operators cannot be passed as test filters.")
            result.append(token)
        i += 1
    return result


def resolve(argv: list[str], cwd: str, workers: int, runner='auto') -> list[str]:
    """Return shell-free local-runner argv with managed worker limits."""
    if isinstance(workers, bool) or not isinstance(workers, int) or workers < 1:
        raise CommandError("workers must be a positive integer.")
    if not isinstance(argv, list) or any(not isinstance(arg, str) or "\0" in arg for arg in argv):
        raise CommandError("argv must be a list of NUL-free strings.")
    metadata = runner_metadata(argv, cwd, runner)
    selected = metadata['runner']
    if selected == 'generic':
        _reject_generic_interactive(argv, cwd)
        if not argv:
            raise CommandError("Generic mode requires a command after --.")
        return list(argv)
    command = _unwrap_command(argv, cwd)
    if selected != 'vitest':
        return _resolve_other(command, cwd, workers, selected)
    args = _arguments(command[1:])
    cli, major = _local_vitest(cwd)
    node = shutil.which("node")
    if not node:
        raise CommandError("Node.js is not on PATH.")
    limits = [f"--maxWorkers={workers}"]
    if major < 4:
        limits.append("--minWorkers=1")
        # Vitest 2/3 poolOptions take precedence over max/minWorkers.
        for pool, kind in (("threads", "Threads"), ("vmThreads", "Threads"), ("forks", "Forks"), ("vmForks", "Forks")):
            limits.extend([f"--poolOptions.{pool}.max{kind}={workers}", f"--poolOptions.{pool}.min{kind}=1"])
    return [node, str(cli), "run", *limits, *args]


def runner_metadata(argv, cwd, runner='auto'):
    """Describe the adapter without launching anything or mutating argv/env."""
    if runner not in {'auto', 'vitest', 'playwright', 'jest', 'node', 'generic'}:
        raise CommandError(f"Unknown runner {runner!r}.")
    if not isinstance(argv, list) or any(not isinstance(arg, str) or '\0' in arg for arg in argv):
        raise CommandError('argv must be a list of NUL-free strings.')
    limitations = []
    if runner == 'generic':
        selected = 'generic'
        limitations.append('Generic commands reserve the full scheduler budget exclusively. Internal process/thread parallelism is unknown and cannot be guaranteed.')
    else:
        command = _unwrap_command(argv, cwd)
        selected = 'node' if command[0] in {'node', 'nodejs'} else command[0]
        if runner != 'auto' and runner != selected:
            raise CommandError(f"Command selects {selected}, not requested runner {runner}.")
        if script_invocation(argv):
            limitations.append('Package scripts are statically unwrapped, not run by a package manager: npm_* lifecycle variables, INIT_CWD and node_modules/.bin PATH augmentation are not supplied. Implicit dependencies on those variables are unsupported. Use explicit generic mode to preserve package-manager lifecycle semantics.')
        limitations.append('Worker limits bound runner-managed file workers, not arbitrary threads, subprocesses, test.concurrent callbacks or programs started by tests/configuration.')
    return {'runner': selected, 'parallelism_guaranteed': selected != 'generic', 'limitations': limitations}


def _reject_interactive(args):
    for token in args:
        key = token.partition('=')[0]
        normalized = key.replace('-', '').lower()
        if normalized in {'watch', 'watchall', 'watchpath', 'ui', 'uimode', 'debug', 'inspect', 'inspectbrk'} or token in {'watch', 'dev', '-w'}:
            raise CommandError(f'{token!r} is interactive/watch mode and is not allowed in the normal queue.')


def _reject_generic_interactive(argv, cwd, seen=()):
    _reject_interactive(argv)
    invocation = script_invocation(argv)
    if not invocation:
        return
    name, _ = invocation
    scripts = scripts_at(cwd)
    if name in seen or len(seen) >= 20:
        raise CommandError('Recursive package script cannot be checked for finite queue mode.')
    for key in ('pre' + name, name, 'post' + name):
        script = scripts.get(key)
        if script:
            # Inspect compound scripts for obvious interactive flags without
            # executing or rewriting them. Dynamic expansion is unknowable.
            try:
                tokens = shlex.split(script)
            except ValueError as exc:
                raise CommandError('Invalid script quoting.') from exc
            _reject_generic_interactive(tokens, cwd, (*seen, name))


def _local_cli(cwd, packages, binary):
    base = Path(cwd).resolve()
    for directory in (base, *base.parents):
        for name in packages:
            package = directory / 'node_modules' / name / 'package.json'
            if not package.is_file():
                continue
            data = json.loads(package.read_text())
            entry = data.get('bin')
            entry = entry.get(binary) if isinstance(entry, dict) else entry
            if not isinstance(entry, str):
                raise CommandError(f'Installed {name} package has no {binary} CLI bin entry.')
            cli = (package.parent / entry).resolve()
            if not cli.is_file() or not cli.is_relative_to(package.parent.resolve()):
                raise CommandError(f'Installed {name} CLI is missing or outside its package.')
            return str(cli)
    raise CommandError(f'Local {binary} is not installed. Install project dependencies first. No download is performed.')


_PLAYWRIGHT_VALUES = {'-c', '--config', '-g', '--grep', '-G', '--grep-invert', '--project', '--reporter', '--output', '--retries', '--repeat-each', '--timeout', '--global-timeout', '--max-failures', '--shard', '--test-list', '--test-list-invert', '--update-snapshots', '--update-source-method'}
_PLAYWRIGHT_BOOLS = {'--forbid-only', '--fully-parallel', '--headed', '--ignore-snapshots', '--list', '--no-deps', '--pass-with-no-tests', '--quiet', '--last-failed', '--fail-on-flaky-tests'}
_JEST_VALUES = {'--config', '-c', '--testNamePattern', '-t', '--testPathPattern', '--testPathPatterns', '--testPathIgnorePatterns', '--runTestsByPath', '--reporters', '--outputFile', '--testEnvironment', '--env', '--testTimeout', '--bail', '--shard', '--selectProjects', '--seed', '--coverageDirectory', '--coverageReporters', '--collectCoverageFrom'}
_JEST_BOOLS = {'--ci', '--coverage', '--collectCoverage', '--silent', '--verbose', '--json', '--passWithNoTests', '--updateSnapshot', '-u', '--no-cache', '--cache', '--detectOpenHandles', '--forceExit', '--listTests', '--onlyChanged', '-o', '--findRelatedTests', '--runTestsByPath', '--randomize', '--showSeed', '--no-coverage', '--no-watch', '--no-watchAll'}
_NODE_VALUES = {'--test-name-pattern', '--test-skip-pattern', '--test-reporter', '--test-reporter-destination', '--test-shard', '--test-timeout', '--test-coverage-include', '--test-coverage-exclude', '--test-coverage-lines', '--test-coverage-functions', '--test-coverage-branches'}
_NODE_BOOLS = {'--experimental-test-coverage', '--test-only', '--test-force-exit', '--test-update-snapshots', '--experimental-test-snapshots', '--enable-source-maps', '--no-warnings'}


def _bounded_arguments(args, values, booleans, runner):
    """Allow known options only, so worker aliases cannot escape the limit."""
    result = []
    i = 0
    while i < len(args):
        token = args[i]
        if token == '--':
            return result + args[i:]
        _reject_interactive([token])
        key, equal, value = token.partition('=')
        if key in booleans:
            if equal and value not in {'true', 'false'}:
                raise CommandError(f'{key} expects true or false.')
            result.append(token)
        elif key in values:
            result.append(token)
            if not equal:
                i += 1
                if i >= len(args) or args[i].startswith('-'):
                    raise CommandError(f'{key} needs a value.')
                result.append(args[i])
        elif token.startswith('-'):
            raise CommandError(f'Unsupported or scheduler-owned {runner} option {token!r}. Remove worker overrides/watch flags or use explicit generic mode for unsupported finite commands.')
        else:
            if token in {';', '&&', '||', '|', '>', '<'}:
                raise CommandError('Shell operators cannot be passed as test filters.')
            result.append(token)
        i += 1
    return result


def _resolve_other(command, cwd, workers, runner):
    node = shutil.which('node')
    if not node:
        raise CommandError('Node.js is not on PATH.')
    args = command[1:]
    if runner == 'node':
        # Node stops option parsing at the first filename. Keep managed limits
        # ahead of every user argument and reject unmanaged runtime switches.
        args = list(args)
        args.remove('--test')
        args = _bounded_arguments(args, _NODE_VALUES, _NODE_BOOLS, runner)
        return [node, '--test', f'--test-concurrency={workers}', *args]
    if runner == 'playwright':
        if os.environ.get('PWDEBUG') not in {None, '', '0'}:
            raise CommandError('PWDEBUG enables interactive Playwright debugging. Unset it before using the normal queue.')
        if args[:1] != ['test']:
            raise CommandError('Only playwright test is supported, not browser install/codegen/server commands.')
        args = _bounded_arguments(args[1:], _PLAYWRIGHT_VALUES, _PLAYWRIGHT_BOOLS, runner)
        cli = _local_cli(cwd, ['@playwright/test', 'playwright'], 'playwright')
        return [node, cli, 'test', f'--workers={workers}', *args]
    # runInBand conflicts with maxWorkers in Jest. Accept it only when the
    # reservation is one worker, and never emit both flags.
    args = _bounded_arguments(args, _JEST_VALUES, _JEST_BOOLS | {'--runInBand', '-i'}, runner)
    boundary = args.index('--') if '--' in args else len(args)
    options, literal = args[:boundary], args[boundary:]
    explicit_in_band = any(arg.partition('=')[0] in {'--runInBand', '-i'} for arg in options)
    detects_handles = any(arg in {'--detectOpenHandles', '--detectOpenHandles=true'} for arg in options)
    in_band = explicit_in_band or detects_handles
    if in_band:
        if workers != 1 or any(arg not in {'--runInBand', '--runInBand=true', '-i', '-i=true'} for arg in options if arg.partition('=')[0] in {'--runInBand', '-i'}):
            raise CommandError('Jest runInBand requires --workers 1 and cannot be false.')
        options = [arg for arg in options if arg.partition('=')[0] not in {'--runInBand', '-i'}]
    args = options + literal
    cli = _local_cli(cwd, ['jest', 'jest-cli'], 'jest')
    return [node, cli, '--runInBand' if in_band else f'--maxWorkers={workers}', *args]
