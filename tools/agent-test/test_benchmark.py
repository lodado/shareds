"""Lightweight harness regression tests, never starts real runner workloads."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

import benchmark
import commands
import diagnose


class InventoryTests(unittest.TestCase):
    def test_multiple_runners_and_no_script_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".git").mkdir()
            (root / "package.json").write_text(json.dumps({
                "devDependencies": {"@playwright/test": "1.56.0", "jest": "30"},
                "scripts": {"test": "node --test a.test.js", "unit": "vitest run",
                            "bun": "bun test", "secret": "TOKEN=do-not-export jest"}}))
            (root / "pyproject.toml").write_text('[tool.pytest.ini_options]\ntestpaths = ["tests"]\n')
            (root / ".env").write_text("DO_NOT_READ=private")
            result = diagnose.inventory(root)
            self.assertEqual(result["repositories"], [str(root)])
            self.assertEqual(set(result["packages"][0]["runners"]),
                             {"vitest", "playwright", "jest", "node:test", "bun:test"})
            self.assertEqual(result["python_projects"][0]["declaration_files"], ["pyproject.toml"])
            self.assertNotIn("do-not-export", json.dumps(result))
            self.assertNotIn("DO_NOT_READ", json.dumps(result))

    def test_hoisted_installed_version_and_malformed_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            package = root / "packages/example"
            package.mkdir(parents=True)
            (package / "package.json").write_text('{}')
            installed = root / "node_modules/vitest"
            installed.mkdir(parents=True)
            (installed / "package.json").write_text('{"version":"4.1.9"}')
            result = diagnose.inventory(root)
            self.assertEqual(result["packages"][0]["runners"]["vitest"]["installed"], {"vitest": "4.1.9"})
            (installed / "package.json").write_text('invalid')
            self.assertEqual(diagnose.installed_version(package, "vitest"), None)


class BenchmarkTests(unittest.TestCase):
    def test_runner_worker_flags(self):
        for runner, flag in (("vitest", "--maxWorkers=2"), ("jest", "--maxWorkers=2"),
                             ("playwright", "--workers=2"), ("node", "--test-concurrency=2")):
            with self.subTest(runner=runner):
                argv = benchmark.runner_command(runner, Path('/project'), ['sample.test.js'], Path('/scratch'), Path('/node'), 2)
                self.assertIn(flag, argv)
                self.assertIn('sample.test.js', argv)
                self.assertNotIn(flag, benchmark.runner_command(runner, Path('/project'), ['sample.test.js'], Path('/scratch'), Path('/node'), None))

    def test_scheduler_payload_uses_public_adapter_and_managed_caps(self):
        for runner, flag in (("vitest", "--maxWorkers=2"), ("jest", "--maxWorkers=2"),
                             ("playwright", "--workers=2"), ("node", "--test-concurrency=2")):
            with self.subTest(runner=runner), \
                 patch.object(commands, '_local_vitest', return_value=(Path('/installed/vitest.mjs'), 4)), \
                 patch.object(commands, '_local_cli', return_value='/installed/runner.js'), \
                 patch.object(commands.shutil, 'which', return_value='/installed/node'):
                argv = benchmark.scheduled_command(Path('/agent-test'), runner, ['sample.test.js'], Path('/scratch'), 2)
                payload = argv[argv.index('--') + 1:]
                self.assertEqual(payload[0], 'node' if runner == 'node' else runner)
                self.assertNotIn(flag, payload)
                self.assertNotIn('--import', payload)
                actual = commands.resolve(payload, '/project', 2, runner=runner)
                self.assertIn(flag, actual)
                self.assertEqual(actual.count(flag), 1)
                self.assertIn('sample.test.js', actual)

    def test_encoded_node_prelude_preserves_spaces_and_quotes(self):
        project = Path('/private/path with spaces/quote"root')
        with patch.dict(benchmark.os.environ, {'NODE_OPTIONS': ''}):
            environment = benchmark.vitest_environment(project)
        node = Path(benchmark.NODE)
        if not node.is_file():
            node = Path(benchmark.shutil.which('node') or '')
        self.assertTrue(node.is_file(), 'Node is required to verify the actual NODE_OPTIONS parser')
        # Match Vitest's .mjs entry point. Node's CommonJS -e wrapper itself
        # resets global __dirname to '.', unlike an ESM runner entry point.
        result = subprocess.run([str(node), '--input-type=module', '-e', 'process.stdout.write(globalThis.__dirname)'],
                                env=dict(benchmark.os.environ, **environment), capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, str(project))
        self.assertEqual(set(environment), {'NODE_OPTIONS'})

    def test_default_is_plan_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            test = root / 'sample.test.js'
            test.write_text('')
            result = subprocess.run([sys.executable, str(Path(benchmark.__file__)), '--project', str(root),
                                     '--runner', 'node', '--test', test.name, '--output', str(root / 'out.json')],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            plan = json.loads(result.stdout)
            self.assertEqual(plan['jobs'], [4, 8])
            self.assertEqual(plan['repeats'], 3)
            self.assertFalse((root / 'out.json').exists())

    def test_completed_scheduler_timings_are_separate_and_redacted(self):
        status = {'recent': [{'id': 'owned', 'state': 'succeeded', 'workers': 2,
                              'wait_seconds': 0.3, 'run_seconds': 0.7, 'code': 0,
                              'env': {'SECRET': 'private'}, 'argv': ['private-command']}], 'jobs': []}
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(benchmark, 'pressure', return_value={'severe': False}), \
             patch.object(benchmark, 'scheduler_status', return_value=status):
            root = Path(directory)
            result = benchmark.experiment([sys.executable, '-c', 'pass'], root, 1, 1, root,
                                          time.monotonic() + 5, 0.5, scheduler_home=root)
            self.assertEqual(result['scheduler_job_timings'], [
                {'id': 'owned', 'state': 'succeeded', 'workers': 2,
                 'wait_seconds': 0.3, 'run_seconds': 0.7, 'code': 0}])
            self.assertTrue(result['scheduler_telemetry_available'])
            self.assertNotIn('private-command', json.dumps(result))
            self.assertNotIn('SECRET', json.dumps(result))

    def test_prelaunch_abort_can_save_empty_metrics(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(benchmark, 'pressure', return_value={'severe': True}):
            root = Path(directory)
            result = benchmark.experiment([sys.executable, '-c', 'pass'], root, 1, 1, root,
                                          time.monotonic() + 5, 0.5)
            self.assertEqual(result['abort'], 'severe_pressure_or_thermal')
            self.assertEqual(result['jobs'], [])
            data = {'experiments': [{'name': 'aborted', **result}]}
            benchmark.save(root / 'out.json', data)
            self.assertEqual(data['summary_medians'][0]['client_e2e_s'], 0)
            self.assertIsNone(data['summary_medians'][0]['scheduler_wait_s'])

    def test_owned_child_accounting_discards_output(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(benchmark, 'pressure', return_value={'severe': False}):
            root = Path(directory)
            result = benchmark.experiment([sys.executable, '-c', 'import os; print(os.environ["BENCHMARK_TEST_VALUE"])'],
                                          root, 1, 1, root, time.monotonic() + 5, 0.5,
                                          environment={'BENCHMARK_TEST_VALUE': 'PRIVATE_OUTPUT'})
            self.assertEqual(result['jobs_successful'], 1)
            self.assertEqual(result['exit_failures'], 0)
            self.assertNotIn('PRIVATE_OUTPUT', json.dumps(result))
            self.assertEqual(list(root.iterdir()), [])
            self.assertEqual(result['scheduler_job_timings'], [])


if __name__ == '__main__':
    unittest.main()
