import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { diagnosticsInRanges, eslintArgs, eslintUnavailable, formatDiagnostics, rejectsWarnIgnored, writtenRanges } from './lint.js'

const FILE = ['a', 'b', 'c', 'd', 'e'].join('\n')

test('writtenRanges locates the edit in the current file', () => {
  assert.deepEqual(writtenRanges({ tool: 'Edit', new_string: 'c\nd' }, FILE), [[3, 4]])
  assert.deepEqual(writtenRanges({ tool: 'Write' }, FILE), [[1, Infinity]])
  assert.deepEqual(
    writtenRanges({ tool: 'MultiEdit', edits: [{ new_string: 'a' }, { new_string: 'e' }] }, FILE),
    [[1, 1], [5, 5]],
  )
})

test('writtenRanges gives up when the edit is not in the file or writes nothing', () => {
  assert.equal(writtenRanges({ tool: 'Edit', new_string: 'zzz' }, FILE), null)
  assert.equal(writtenRanges({ tool: 'Edit', new_string: '' }, FILE), null)
})

const report = (...messages) => JSON.stringify([{ filePath: '/r/a.ts', messages }])

test('diagnostics outside the written lines are dropped', () => {
  const stdout = report(
    { ruleId: 'no-console', severity: 2, message: 'old', line: 1, column: 1 },
    { ruleId: 'eqeqeq', severity: 2, message: 'new', line: 3, column: 5 },
    { ruleId: 'x', severity: 1, message: 'spans in', line: 2, endLine: 3, column: 1 },
  )
  const kept = diagnosticsInRanges(stdout, [[3, 4]])
  assert.deepEqual(kept.map((message) => message.message), ['new', 'spans in'])
})

test('a parse error is kept wherever it is', () => {
  const stdout = report({ ruleId: null, fatal: true, severity: 2, message: 'Unexpected token', line: 99, column: 1 })
  assert.equal(diagnosticsInRanges(stdout, [[1, 2]]).length, 1)
})

test('non-JSON output is reported as null so the caller can tell it from a clean file', () => {
  assert.equal(diagnosticsInRanges('', [[1, 1]]), null)
  assert.equal(diagnosticsInRanges('Oops! Something went wrong', [[1, 1]]), null)
  assert.deepEqual(diagnosticsInRanges('[]', [[1, 1]]), [])
})

test('formatDiagnostics caps the list and names file, position, rule', () => {
  const messages = Array.from({ length: 20 }, (_, i) => ({ ruleId: 'r', severity: 2, message: `m${i}`, line: i + 1, column: 2 }))
  const text = formatDiagnostics('src/a.ts', messages)
  assert.match(text, /found 20 problem\(s\)/)
  assert.match(text, /src\/a\.ts:1:2 error m0 \(r\)/)
  assert.match(text, /\.\.\.and 5 more/)
})

test('eslintUnavailable recognises a project without ESLint', () => {
  assert.equal(eslintUnavailable('npm error could not determine executable to run'), true)
  assert.equal(eslintUnavailable('Oops! Something went wrong! :(\nESLint couldn\'t find an eslint.config.js file'), true)
  assert.equal(eslintUnavailable('TypeError: boom'), false)
})

test('an ESLint 8 ignored-file notice is not a diagnostic, other rule-less messages still are', () => {
  const stdout = report(
    // ESLint 8 reports an explicitly passed ignored file as a severity-1 message with no rule and no line.
    { ruleId: null, fatal: false, severity: 1, message: 'File ignored because of a matching ignore pattern. Use "--no-ignore" to override.' },
    { ruleId: null, severity: 1, message: 'A rule-less warning on the written line', line: 1, column: 1 },
  )
  assert.deepEqual(diagnosticsInRanges(stdout, [[1, 1]]).map((message) => message.message), [
    'A rule-less warning on the written line',
  ])
})

test('rejectsWarnIgnored recognises only ESLint refusing the flat-config ignore flag', () => {
  assert.equal(rejectsWarnIgnored("Invalid option '--warn-ignored' - perhaps you meant '--ignore'?"), true)
  assert.equal(rejectsWarnIgnored("Invalid option '--no-warn-ignored' - perhaps you meant '--no-ignore'?"), true)
  assert.equal(rejectsWarnIgnored("Invalid option '--fix-type'"), false)
  assert.equal(rejectsWarnIgnored(''), false)
})

// A fake npx on PATH prints the folder it ran in and its arguments, so the test sees where ESLint would start.
const runArgs = (args, cwd) => {
  const bin = mkdtempSync(join(tmpdir(), 'lint-guard-bin-'))
  writeFileSync(join(bin, 'npx'), '#!/bin/sh\necho "$PWD|$*"\n', { mode: 0o755 })
  try {
    return execFileSync(args[0], args.slice(1), { cwd, encoding: 'utf8', env: { ...process.env, PATH: bin + ':/usr/bin:/bin' } }).trim()
  } finally {
    rmSync(bin, { recursive: true, force: true })
  }
}

test('eslintArgs starts ESLint in the nearest folder with a flat config, as a package lint script does', () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'lint-guard-repo-')))
  try {
    mkdirSync(join(repo, 'packages/app/src/deep'), { recursive: true })
    mkdirSync(join(repo, 'scripts'), { recursive: true })
    writeFileSync(join(repo, 'packages/app/eslint.config.mjs'), 'export default []\n')
    const file = join(repo, 'packages/app/src/deep/a.ts')
    assert.equal(runArgs(eslintArgs(file), repo), join(repo, 'packages/app') + '|--no-install eslint --format json --no-warn-ignored ' + file)
    // A relative path is resolved against the session folder before the walk.
    assert.equal(runArgs(eslintArgs('packages/app/src/deep/a.ts'), repo), join(repo, 'packages/app') + '|--no-install eslint --format json --no-warn-ignored ' + file)
    // No flat config above the file: ESLint starts where the session is, as before.
    assert.equal(runArgs(eslintArgs(join(repo, 'scripts/b.mjs')), repo), repo + '|--no-install eslint --format json --no-warn-ignored ' + join(repo, 'scripts/b.mjs'))
    // An eslintrc-mode ESLint gets every argument except the flat-config flag.
    assert.equal(runArgs(eslintArgs(join(repo, 'scripts/b.mjs'), { legacy: true }), repo), repo + '|--no-install eslint --format json ' + join(repo, 'scripts/b.mjs'))
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
