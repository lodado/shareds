import assert from 'node:assert/strict'
import { test } from 'node:test'

import { diagnosticsInRanges, eslintUnavailable, formatDiagnostics, writtenRanges } from './lint.js'

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
