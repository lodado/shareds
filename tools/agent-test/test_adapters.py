"""Shell-free adapter, hook-scope and installer regression tests, no downloads."""
import fcntl
import json
import os
from pathlib import Path
import shlex
import subprocess
import unittest
from unittest.mock import patch

import commands
import hook
import install
import test_integration as integration


class AdapterTests(integration.PackageFixture):
    def setUp(self):
        super().setUp()
        for package, binary in [('@playwright/test', 'playwright'), ('jest', 'jest')]:
            location = self.root / 'node_modules' / package
            location.mkdir(parents=True)
            (location / 'package.json').write_text(json.dumps({'version': '1.0.0', 'bin': {binary: 'cli.js'}}))
            (location / 'cli.js').write_text("console.log(JSON.stringify({argv:process.argv.slice(2),cwd:process.cwd(),env:process.env.AGENT_ADAPTER_SENTINEL}));process.exit(7)")

    def test_each_entry_point_uses_local_cli_and_managed_workers(self):
        for argv, expected in [
            (['playwright', 'test', 'some test.spec.ts'], ['test', '--workers=2', 'some test.spec.ts']),
            (['npx', 'playwright', 'test'], ['test', '--workers=2']),
            (['pnpm', 'exec', 'playwright', 'test'], ['test', '--workers=2']),
            (['jest', '--ci', '-t', 'a|b'], ['--maxWorkers=2', '--ci', '-t', 'a|b']),
            (['npx', 'jest'], ['--maxWorkers=2']),
            (['pnpm', 'jest'], ['--maxWorkers=2']),
            (['node', '--test', 'a test.mjs'], ['--test', '--test-concurrency=2', 'a test.mjs']),
        ]:
            with self.subTest(argv=argv):
                actual = self.resolve(argv)
                self.assertEqual(actual[1:] if argv[0] == 'node' else actual[2:], expected)

    def test_fixture_exec_preserves_cwd_environment_argv_output_and_exit(self):
        for argv in [['playwright', 'test', '--grep', 'hello world'], ['jest', '--testNamePattern=hello world']]:
            resolved = self.resolve(argv)
            env = {**os.environ, 'AGENT_ADAPTER_SENTINEL': 'untouched'}
            completed = subprocess.run(resolved, cwd=self.root, env=env, capture_output=True, text=True, timeout=10)
            self.assertEqual(completed.returncode, 7)
            self.assertEqual(completed.stderr, '')
            output = json.loads(completed.stdout)
            self.assertEqual(output, {'argv': resolved[2:], 'cwd': str(self.root), 'env': 'untouched'})

    def test_all_runners_reject_worker_conflicts_and_watch_ui(self):
        for prefix, flags in [
            (['playwright', 'test'], ['--workers=99', '-j', '-j99', '--ui', '--ui-port=99', '--debug', '--watch']),
            (['jest'], ['--maxWorkers=99', '--max-workers=99', '-w99', '--watch', '--watchAll=false', '--maxConcurrency=99']),
            (['node', '--test'], ['--test-concurrency=99', '--watch', '--watch-path=src', '--inspect', '--test-isolation=none']),
        ]:
            for flag in flags:
                with self.subTest(prefix=prefix, flag=flag), self.assertRaises(commands.CommandError):
                    self.resolve(prefix + [flag])

    def test_jest_run_in_band_never_conflicts_with_max_workers(self):
        for flag in ['--runInBand', '-i', '--runInBand=true']:
            result = self.resolve(['jest', flag], 1)
            self.assertEqual(result[2:], ['--runInBand'])
            with self.assertRaises(commands.CommandError):
                self.resolve(['jest', flag], 2)
        for flag in ['--runInBand=false', '--runInBand=invalid', '-i=false']:
            with self.assertRaises(commands.CommandError):
                self.resolve(['jest', flag], 1)
        with self.assertRaises(commands.CommandError):
            self.resolve(['jest', '--runInBand', '--maxWorkers=1'], 1)

    def test_jest_detect_open_handles_reserves_one_worker(self):
        for flag in ['--detectOpenHandles', '--detectOpenHandles=true']:
            self.assertEqual(self.resolve(['jest', flag], 1)[2:], ['--runInBand', flag])
            with self.assertRaises(commands.CommandError):
                self.resolve(['jest', flag], 2)
        self.assertEqual(self.resolve(['jest', '--detectOpenHandles=false'], 2)[2:], ['--maxWorkers=2', '--detectOpenHandles=false'])

    def test_unknown_runners_require_explicit_generic_mode(self):
        argv = ['python3', '-c', 'print("hello")', 'two words', ';']
        with self.assertRaises(commands.CommandError):
            self.resolve(argv)
        self.assertEqual(commands.resolve(argv, str(self.root), 2, runner='generic'), argv)
        metadata = commands.runner_metadata(argv, str(self.root), runner='generic')
        self.assertEqual(metadata['runner'], 'generic')
        self.assertEqual(metadata['parallelism_guaranteed'], False)
        self.assertIn('unknown', metadata['limitations'][0])
        for flag in ['--watch', '--ui', '--debug', 'watch']:
            with self.assertRaises(commands.CommandError):
                commands.resolve(['custom', flag], str(self.root), 2, runner='generic')
        with self.assertRaises(commands.CommandError):
            commands.resolve([], str(self.root), 1, runner='generic')

    def test_explicit_runner_must_match_and_metadata_exposes_script_environment_limit(self):
        self.package({'test': 'pnpm run e2e', 'e2e': 'playwright test'})
        result = commands.resolve(['npm', 'test'], str(self.root), 2, runner='playwright')
        self.assertEqual(result[2:], ['test', '--workers=2'])
        metadata = commands.runner_metadata(['npm', 'test'], str(self.root))
        self.assertEqual(metadata['runner'], 'playwright')
        self.assertIn('INIT_CWD', metadata['limitations'][0])
        for runner in ['jest', 'node', 'other']:
            with self.assertRaises(commands.CommandError):
                commands.resolve(['playwright', 'test'], str(self.root), 1, runner=runner)

    def test_generic_scripts_preserve_lifecycle_instead_of_unwrapping(self):
        self.package({'test': 'echo setup && jest', 'pretest': 'echo pre'})
        with self.assertRaises(commands.CommandError):
            self.resolve(['npm', 'test'])
        self.assertEqual(commands.resolve(['npm', 'test'], str(self.root), 1, runner='generic'), ['npm', 'test'])

    def test_missing_local_tools_never_use_npx_or_global(self):
        for name, argv in [('jest', ['npx', 'jest']), ('@playwright/test', ['npx', 'playwright', 'test'])]:
            (self.root / 'node_modules' / name / 'package.json').unlink()
            with self.assertRaisesRegex(commands.CommandError, 'No download'):
                self.resolve(argv)

    def test_vitest_two_through_five_only(self):
        self.version(5)
        self.assertEqual(self.resolve(['vitest'])[2:], ['run', '--maxWorkers=2'])
        self.version(6)
        with self.assertRaises(commands.CommandError):
            self.resolve(['vitest'])

    def test_known_option_values_and_end_of_options_are_literal(self):
        self.assertEqual(self.resolve(['playwright', 'test', '--grep', 'foo|bar', '--', '--ui'])[-4:], ['--grep', 'foo|bar', '--', '--ui'])
        self.assertEqual(self.resolve(['jest', '--config=some file.json', '--', '--watch'])[-3:], ['--config=some file.json', '--', '--watch'])
        self.assertEqual(self.resolve(['jest', '--', '--runInBand'])[2:], ['--maxWorkers=2', '--', '--runInBand'])
        for argv in [['jest', '--config'], ['playwright', 'test', '--grep'], ['node', '--test', '--test-reporter']]:
            with self.assertRaises(commands.CommandError):
                self.resolve(argv)

    def test_node_test_flag_after_program_is_not_reinterpreted(self):
        with self.assertRaises(commands.CommandError):
            self.resolve(['node', 'ordinary-script.js', '--test'])

    def test_playwright_debug_environment_is_rejected_not_changed(self):
        with patch.dict(os.environ, {'PWDEBUG': '1'}):
            with self.assertRaisesRegex(commands.CommandError, 'PWDEBUG'):
                self.resolve(['playwright', 'test'])
            self.assertEqual(os.environ['PWDEBUG'], '1')

    def test_generic_rejects_nested_watch_and_lifecycle_watch(self):
        for scripts in [
            {'test': 'pnpm run unit', 'unit': 'jest --watch'},
            {'test': 'jest', 'pretest': 'vitest --ui'},
            {'test': 'echo setup && playwright test --ui'},
        ]:
            self.package(scripts)
            with self.assertRaises(commands.CommandError):
                commands.resolve(['npm', 'test'], str(self.root), 1, runner='generic')

    def test_actual_node_test_smoke_is_bounded(self):
        test = self.root / 'simple test.mjs'
        test.write_text("import test from 'node:test';import assert from 'node:assert/strict';test('adapter',()=>assert.equal(1+1,2));")
        result = subprocess.run(self.resolve(['node', '--test', str(test)], 1), cwd=self.root, capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('adapter', result.stdout)


class MultiRunnerHookTests(integration.PackageFixture):
    def test_all_runners_nested_lifecycle_and_rtk_detected(self):
        self.package({'test': 'node --test', 'e2e': 'playwright test', 'unit': 'jest', 'check': 'echo ok', 'postcheck': 'pnpm run unit'})
        for command in ['node --test', 'rtk proxy node --test', 'rtk pnpm e2e', 'pnpm unit', 'npm test', 'npm run check', 'npx jest@30', 'node node_modules/jest/bin/jest.js']:
            with self.subTest(command=command):
                self.assertEqual(hook.should_deny(command, str(self.root)), True)

    def test_generic_runners_have_finite_explicit_replacements(self):
        for command in ['rtk pytest tests/', 'python3 -m unittest discover', 'python3 -m pytest tests/', 'bun test', 'cargo test', 'go test ./...']:
            with self.subTest(command=command):
                self.assertTrue(hook.should_deny(command, str(self.root)))
                suggestion = hook._suggestion(command, str(self.root))
                self.assertIn('run --runner generic -- ', suggestion)
                self.assertNotIn('-- rtk', suggestion)
        self.assertNotIn('--runner generic -- pytest --watch', hook._suggestion('pytest --watch', str(self.root)))

    def test_cd_uses_target_package_not_original_package(self):
        child = self.root / 'other repo'
        child.mkdir()
        (child / 'package.json').write_text(json.dumps({'scripts': {'check': 'jest'}}))
        self.package({'check': 'echo fine'})
        command = 'cd ' + shlex.quote(str(child)) + ' && pnpm check'
        self.assertEqual(hook.should_deny(command, str(self.root)), True)

    def test_explicit_scope_roots_and_linked_worktrees(self):
        scope = self.root / 'scope.json'
        scoped = self.root / 'orca'
        worktree = self.root / 'elsewhere' / 'linked'
        scope.write_text(json.dumps({'roots': [str(scoped)], 'worktrees': [str(worktree)]}))
        def event(cwd, command='jest'):
            return {'cwd': str(cwd), 'tool_name': 'Bash', 'tool_input': {'command': command}}
        for cwd in [scoped / 'a', scoped / 'b', worktree / 'src']:
            self.assertEqual(hook.decision(event(cwd), scope)['hookSpecificOutput']['permissionDecision'], 'deny')
        self.assertIsNone(hook.decision(event(self.root / 'outside'), scope))
        self.assertIsNone(hook.decision(event(self.root / 'orca-not'), scope))
        self.assertEqual(hook.decision(event(self.root, 'cd ' + shlex.quote(str(scoped)) + ' && jest'), scope)['hookSpecificOutput']['permissionDecision'], 'deny')

    def test_replacement_is_shell_quoted_not_rtk_or_compound_argv(self):
        suggestion = hook._suggestion("rtk proxy vitest -t 'some test'", str(self.root))
        self.assertEqual(suggestion, "rtk proxy ~/.local/bin/agent-test run -- vitest -t 'some test'")
        suggestion = hook._suggestion('echo setup && jest', str(self.root))
        self.assertNotIn('run -- echo setup', suggestion)
        self.assertIn('--runner generic -- npm test', suggestion)
        self.package({'test': 'echo before && jest', 'pretest': 'echo setup'})
        self.assertIn('--runner generic', hook._suggestion('npm test', str(self.root)))


class InstallerGuardTests(integration.InstallerTests):
    def test_common_module_is_required_before_install(self):
        (self.source / 'common.py').unlink()
        with self.assertRaisesRegex(ValueError, 'common.py'):
            install.install(self.source, self.home)
        self.assertEqual(json.loads(self.settings.read_text()), self.original)
        self.assertEqual((self.home / '.local/bin/agent-test').exists(), False)

    def test_concurrent_settings_edit_is_preserved(self):
        expected = self.settings.read_bytes()
        edited = {**self.original, 'external': True}
        self.settings.write_text(json.dumps(edited))
        with self.assertRaisesRegex(ValueError, 'Concurrent settings edit'):
            install._save_settings(self.settings, {}, expected)
        self.assertEqual(json.loads(self.settings.read_text()), edited)

    def test_concurrent_installer_is_rejected(self):
        root = install._paths(self.home)[0]
        root.mkdir(parents=True)
        with (root / 'install.lock').open('w') as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(ValueError, 'in progress'):
                install.install(self.source, self.home)
        self.assertEqual(json.loads(self.settings.read_text()), self.original)

    def test_settings_cas_failure_rolls_back_fresh_install_and_allows_retry(self):
        save = install._save_settings
        edited = {**self.original, 'external': True}
        def concurrent_edit(path, data, expected):
            path.write_text(json.dumps(edited))
            return save(path, data, expected)
        with patch.object(install, '_save_settings', side_effect=concurrent_edit):
            with self.assertRaisesRegex(ValueError, 'Concurrent settings edit'):
                install.install(self.source, self.home)
        root, app, launcher, _ = install._paths(self.home)
        self.assertFalse(launcher.exists())
        self.assertEqual(list(app.iterdir()), [])
        self.assertFalse((root / 'installation.json').exists())
        self.assertEqual(json.loads(self.settings.read_text()), edited)
        self.assertTrue(install.install(self.source, self.home)['installed'])

    def test_manifest_failure_restores_settings_and_allows_retry(self):
        atomic = install._atomic
        def fail_manifest(path, *args, **kwargs):
            if path.name == 'installation.json':
                raise OSError('manifest write failed')
            return atomic(path, *args, **kwargs)
        with patch.object(install, '_atomic', side_effect=fail_manifest):
            with self.assertRaisesRegex(OSError, 'manifest write failed'):
                install.install(self.source, self.home)
        root, app, launcher, _ = install._paths(self.home)
        self.assertEqual(json.loads(self.settings.read_text()), self.original)
        self.assertFalse(launcher.exists())
        self.assertFalse((root / 'hook-scope.json').exists())
        self.assertEqual(list(app.iterdir()), [])
        self.assertTrue(install.install(self.source, self.home)['installed'])

    def test_rollback_preserves_external_edit(self):
        path = self.home / 'external.txt'
        path.write_text('before')
        with self.assertRaisesRegex(ValueError, 'abort'):
            with install._FileTransaction() as transaction:
                transaction.write(path, 'installed')
                path.write_text('concurrent edit')
                raise ValueError('abort')
        self.assertEqual(path.read_text(), 'concurrent edit')

    def test_failed_upgrade_restores_runtime_and_launcher(self):
        install.install(self.source, self.home)
        _, app, launcher, _ = install._paths(self.home)
        before = {path.name: path.read_bytes() for path in app.iterdir()}
        launcher_before = launcher.read_bytes()
        (self.source / 'commands.py').write_text('# upgraded runtime\n')
        with patch.object(install, '_save_settings', side_effect=ValueError('settings failure')), patch.object(install, '_settings', side_effect=[self.original.copy(), {}]):
            with self.assertRaisesRegex(ValueError, 'settings failure'):
                install.install(self.source, self.home)
        self.assertEqual({path.name: path.read_bytes() for path in app.iterdir()}, before)
        self.assertEqual(launcher.read_bytes(), launcher_before)
        self.assertTrue(install.install(self.source, self.home)['installed'])

    def test_live_default_and_custom_daemon_lock_prevents_runtime_copy(self):
        for custom in [False, True]:
            with self.subTest(custom=custom):
                state = self.home / ('custom-state' if custom else '.local/state/agent-test')
                state.mkdir(parents=True, exist_ok=True, mode=0o700)
                with patch.dict(os.environ, {'AGENT_TEST_HOME': str(state)} if custom else {}, clear=True):
                    with (state / 'daemon.lock').open('a+') as lock:
                        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                        with self.assertRaisesRegex(ValueError, 'daemon is running'):
                            install.install(self.source, self.home)
                self.assertFalse(install._paths(self.home)[1].exists())
        self.assertTrue(install.install(self.source, self.home)['installed'])

    def test_live_daemon_rejects_upgrade_without_modifying_installed_runtime(self):
        install.install(self.source, self.home)
        root, app, launcher, _ = install._paths(self.home)
        paths = [*app.iterdir(), launcher, self.settings, root / 'installation.json']
        before = {path: path.read_bytes() for path in paths}
        (self.source / 'commands.py').write_text('# upgrade must not copy\n')
        state = self.home / '.local/state/agent-test'
        with (state / 'daemon.lock').open('a+') as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(ValueError, 'daemon is running'):
                install.install(self.source, self.home)
        self.assertEqual({path: path.read_bytes() for path in paths}, before)

    def test_scope_config_preserved_on_reinstall_and_uninstall(self):
        first = install.install(self.source, self.home)
        scope = Path(first['hook_scope'])
        self.assertEqual(json.loads(scope.read_text()), {'roots': [str(self.home / 'orca')], 'worktrees': []})
        custom = {'roots': [str(self.home / 'orca')], 'worktrees': [str(self.home / 'linked')]}
        scope.write_text(json.dumps(custom))
        install.install(self.source, self.home)
        install.uninstall(self.home)
        self.assertEqual(json.loads(scope.read_text()), custom)


if __name__ == '__main__':
    unittest.main()
