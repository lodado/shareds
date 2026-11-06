"""Run with python3 -m unittest discover -s tools/agent-test -p test_integration.py."""

import copy
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import commands
import hook
import install


class PackageFixture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="agent-test integration ")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.package({"test": "vitest run"})
        self.version(4)

    def package(self, scripts):
        (self.root / "package.json").write_text(json.dumps({"scripts": scripts}))

    def version(self, major):
        location = self.root / "node_modules/vitest"
        location.mkdir(parents=True, exist_ok=True)
        (location / "package.json").write_text(json.dumps({"name": "vitest", "version": f"{major}.0.0", "bin": {"vitest": "vitest.mjs"}}))
        (location / "vitest.mjs").write_text("console.log(JSON.stringify(process.argv.slice(2)))")

    def resolve(self, argv, workers=2):
        return commands.resolve(argv, str(self.root), workers)


class ResolverTests(PackageFixture):
    def test_default_and_all_supported_entry_points(self):
        for argv in ([], ["vitest"], ["npx", "vitest", "run"], ["pnpm", "exec", "vitest"], ["pnpm", "vitest"], ["npm", "test"], ["pnpm", "test"], ["bun", "run", "test"]):
            with self.subTest(argv=argv):
                actual = self.resolve(argv)
                self.assertEqual(actual[1:], [str(self.root / "node_modules/vitest/vitest.mjs"), "run", "--maxWorkers=2"])

    def test_nested_scripts_and_quoted_filters_are_actual_argv(self):
        self.package({"test": "pnpm run unit --", "unit": "vitest run -t 'hello world'"})
        actual = self.resolve(["npm", "test", "--", "src/a test.ts"])
        self.assertEqual(actual[-3:], ["-t", "hello world", "src/a test.ts"])
        result = subprocess.run(actual, cwd=self.root, capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(result.stdout), ["run", "--maxWorkers=2", "-t", "hello world", "src/a test.ts"])

    def test_version_two_three_pool_limits_and_four_no_minworkers(self):
        for major in (2, 3, 4):
            self.version(major)
            result = self.resolve([])
            self.assertEqual("--minWorkers=1" in result, major < 4)
            self.assertEqual("--poolOptions.threads.maxThreads=2" in result, major < 4)
            self.assertEqual("--poolOptions.vmForks.minForks=1" in result, major < 4)
        self.version(1)
        with self.assertRaisesRegex(commands.CommandError, ">=2"):
            self.resolve([])

    def test_rejects_shell_and_unknown_scripts(self):
        for script in ("", "vitest *.test.ts", "vitest #comment", "vitest && echo done", "FOO=1 vitest", "vitest $(touch surprise)", "vitest `touch surprise`", "node custom-runner.js", "npm run test", "vitest | cat", "vitest > results.txt"):
            with self.subTest(script=script):
                self.package({"test": script})
                with self.assertRaises(commands.CommandError):
                    self.resolve(["npm", "test"])
        self.assertEqual((self.root / "surprise").exists(), False)

    def test_rejects_lifecycle_scripts_at_every_level(self):
        for scripts in ({"test": "vitest", "pretest": "echo setup"}, {"test": "pnpm unit", "unit": "vitest", "postunit": "echo done"}):
            self.package(scripts)
            with self.assertRaisesRegex(commands.CommandError, "lifecycle"):
                self.resolve(["npm", "test"])

    def test_rejects_watch_and_worker_override_aliases(self):
        for flag in ("--watch", "-w", "--ui", "--watch=false", "watch", "dev", "--run=false", "--maxWorkers=99", "--max-workers=99", "--minWorkers=5", "--poolOptions.threads.maxThreads=99", "--pool-options.forks.max-forks=99", "--browser", "--unknown-option", "--pool=custom"):
            with self.subTest(flag=flag), self.assertRaises(commands.CommandError):
                self.resolve(["vitest", flag])

    def test_end_of_options_filters_and_regex_remain_literal(self):
        result = self.resolve(["vitest", "-t", "foo|bar (works)", "--", "--watch"])
        self.assertEqual(result[-5:], ["--maxWorkers=2", "-t", "foo|bar (works)", "--", "--watch"])
        self.assertEqual(self.resolve(["vitest", "--run", "src/workers.test.ts", "browser.test.ts"])[-2:], ["src/workers.test.ts", "browser.test.ts"])

    def test_quoted_script_glob_is_literal_and_subdirectory_script_is_rejected(self):
        self.package({"test": "vitest '*.test.ts'"})
        self.assertEqual(self.resolve(["npm", "test"])[-1], "*.test.ts")
        child = self.root / "src"
        child.mkdir()
        with self.assertRaisesRegex(commands.CommandError, "package root"):
            commands.resolve(["npm", "test"], str(child), 1)
        with self.assertRaisesRegex(commands.CommandError, "after --"):
            self.resolve(["npm", "test", "--watch"])

    def test_parent_node_modules_and_bad_inputs(self):
        child = self.root / "packages/demo"
        child.mkdir(parents=True)
        self.assertEqual(commands.resolve([], str(child), 1)[1], str(self.root / "node_modules/vitest/vitest.mjs"))
        for workers in (0, -1, True, "2"):
            with self.assertRaises(commands.CommandError):
                self.resolve([], workers)
        with self.assertRaises(commands.CommandError):
            self.resolve(["npx", "some-other-runner"])
        with patch.object(commands.shutil, "which", return_value=None), self.assertRaisesRegex(commands.CommandError, "Node.js"):
            self.resolve([])


class HookTests(PackageFixture):
    def deny(self, command):
        return hook.should_deny(command, str(self.root))

    def test_direct_nested_and_compound_invocations_block(self):
        self.package({"test": "pnpm run unit", "unit": "vitest run", "check": "echo before && vitest run"})
        for command in ("vitest", "npx vitest run", "rtk pnpm test", "rtk proxy pnpm exec vitest", "npm test", "pnpm check", "echo before && vitest", "echo before; npm test", "sh -c 'vitest run'", "node node_modules/vitest/vitest.mjs", "pnpm --filter pkg test", "echo $(vitest)", "echo before\nvitest run"):
            with self.subTest(command=command):
                self.assertEqual(self.deny(command), True)

    def test_wrapper_must_cover_entire_command(self):
        for command in ("agent-test run -- vitest", "rtk proxy ~/.local/bin/agent-test run -- npm test"):
            self.assertEqual(self.deny(command), False)
        for command in ("echo agent-test run; vitest", "agent-test run -- vitest; vitest", "agent-test run -- vitest && echo done", "agent-test run -- vitest && npm test", "echo 'agent-test run' && npx vitest", "rtk proxy ~/.local/bin/agent-test run -- vitest $(vitest)"):
            with self.subTest(command=command):
                self.assertEqual(self.deny(command), True)

    def test_echo_grep_and_non_runner_commands_pass(self):
        self.package({"test": "node --test", "lint": "eslint .", "say": "echo vitest"})
        for command in ("echo vitest", "grep vitest package.json", "rg 'vitest run' .", "pnpm lint", "pnpm say", "echo 'npm test'", "git status"):
            with self.subTest(command=command):
                self.assertEqual(self.deny(command), False)

    def test_lifecycle_and_versioned_npx_are_denied(self):
        self.package({"test": "node --test", "pretest": "vitest run"})
        self.assertEqual(self.deny("npm test"), True)
        self.assertEqual(self.deny("npx vitest@4 run"), True)
        for command in ("bash -lc 'vitest run'", "eval 'vitest run'", "nice -n 10 vitest", "xargs vitest", "if true; then vitest; fi"):
            with self.subTest(command=command):
                self.assertEqual(self.deny(command), True)

    def test_fail_safe_and_hook_json_protocol(self):
        (self.root / "package.json").write_text("broken")
        self.assertEqual(self.deny("npm test"), True)
        self.assertEqual(self.deny("git status"), False)
        event = {"tool_name": "Bash", "cwd": str(self.root), "tool_input": {"command": "npx vitest"}}
        scope = self.root / 'scope.json'
        scope.write_text(json.dumps({'roots': [str(self.root)], 'worktrees': []}))
        result = subprocess.run([sys.executable, str(Path(hook.__file__)), '--scope-config', str(scope)], input=json.dumps(event), text=True, capture_output=True, check=True)
        output = json.loads(result.stdout)["hookSpecificOutput"]
        self.assertEqual(output["permissionDecision"], "deny")
        self.assertIn("rtk proxy ~/.local/bin/agent-test run --", output["permissionDecisionReason"])
        self.assertEqual("updatedInput" in output, False)
        event["tool_name"] = "Read"
        self.assertIsNone(hook.decision(event))


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="agent-test install ")
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name) / "home"
        self.source = Path(self.temporary.name) / "source"
        self.source.mkdir()
        for name in ("commands.py", "hook.py", "install.py"):
            shutil.copy2(Path(__file__).parent / name, self.source / name)
        for name in ("daemon.py", "guardian.py", "common.py"):
            (self.source / name).write_text("# fixture\n")
        (self.source / "agent-test").write_text("import json, sys\nprint(json.dumps(sys.argv[1:]))\n")
        self.settings = self.home / ".claude/settings.json"
        self.settings.parent.mkdir(parents=True)
        self.original = {"permissions": {"allow": ["Read"]}, "hooks": {"PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "rtk rewrite"}]}], "Stop": [{"hooks": [{"type": "command", "command": "other"}]}]}}
        self.settings.write_text(json.dumps(self.original))

    def test_install_backup_idempotence_launcher_and_uninstall_preserve_settings(self):
        before = self.settings.read_bytes()
        first = install.install(self.source, self.home)
        self.assertEqual(Path(first["backup"]).read_bytes(), before)
        installed = json.loads(self.settings.read_text())
        self.assertEqual(installed["hooks"]["PreToolUse"][0], self.original["hooks"]["PreToolUse"][0])
        self.assertEqual(install.install(self.source, self.home)["backup"], None)
        self.assertEqual(json.loads(self.settings.read_text()), installed)
        result = subprocess.run([first["launcher"], "two words", "--flag"], capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(result.stdout), ["two words", "--flag"])
        self.assertIn(sys.executable, Path(first["launcher"]).read_text())
        command = installed["hooks"]["PreToolUse"][-1]["hooks"][0]["command"]
        event = {"tool_name": "Bash", 'cwd': str(self.home / 'orca'), "tool_input": {"command": "vitest run"}}
        result = subprocess.run(["/bin/sh", "-c", command], input=json.dumps(event), capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(result.stdout)["hookSpecificOutput"]["permissionDecision"], "deny")
        result = install.uninstall(self.home)
        self.assertEqual(result["launcher_removed"], True)
        self.assertEqual(json.loads(self.settings.read_text()), self.original)
        self.assertEqual(install.uninstall(self.home)["backup"], None)
        self.assertEqual(Path(first["app"]).is_dir(), True)

    def test_refuses_unrelated_launcher_without_settings_change(self):
        launcher = self.home / ".local/bin/agent-test"
        launcher.parent.mkdir(parents=True)
        launcher.write_text("unrelated")
        with self.assertRaisesRegex(ValueError, "unrelated"):
            install.install(self.source, self.home)
        self.assertEqual(launcher.read_text(), "unrelated")
        self.assertEqual(json.loads(self.settings.read_text()), self.original)

    def test_uninstall_keeps_edited_launcher_and_other_hooks_in_own_group(self):
        first = install.install(self.source, self.home)
        Path(first["launcher"]).write_text("user-edited")
        data = json.loads(self.settings.read_text())
        extra = {"type": "command", "command": "echo user-added"}
        data["hooks"]["PreToolUse"][-1]["hooks"].append(extra)
        self.settings.write_text(json.dumps(data))
        self.assertEqual(install.uninstall(self.home)["launcher_removed"], False)
        expected = copy.deepcopy(self.original)
        expected["hooks"]["PreToolUse"].append({"matcher": "Bash", "hooks": [extra]})
        self.assertEqual(json.loads(self.settings.read_text()), expected)
        self.assertEqual(Path(first["launcher"]).read_text(), "user-edited")

    def test_invalid_settings_no_install_and_symlink_not_overwritten(self):
        self.settings.write_text("invalid")
        with self.assertRaises(ValueError):
            install.install(self.source, self.home)
        self.assertEqual((self.home / ".local/bin/agent-test").exists(), False)
        self.settings.unlink()
        other = self.home / "other.json"
        other.write_text("{}")
        self.settings.symlink_to(other)
        with self.assertRaisesRegex(ValueError, "symlink"):
            install.install(self.source, self.home)
        self.assertEqual(other.read_text(), "{}")

    def test_empty_original_settings_are_restored_without_own_containers(self):
        self.settings.write_text("{}")
        install.install(self.source, self.home)
        install.install(self.source, self.home)
        install.uninstall(self.home)
        self.assertEqual(json.loads(self.settings.read_text()), {})


if __name__ == "__main__":
    unittest.main()
