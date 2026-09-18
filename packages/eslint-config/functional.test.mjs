/* eslint-disable test/no-import-node-test -- package preset tests run with Node's built-in test runner. */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ESLint } from 'eslint'

import functional from './functional.mjs'
import base from './index.mjs'

const lint = async (root, file, code) => {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      ...base,
      ...functional,
      {
        files: ['**/*.{ts,tsx,mts,cts}'],
        languageOptions: { parserOptions: { project: path.join(root, 'tsconfig.json'), tsconfigRootDir: root } },
      },
    ],
  })
  await mkdir(path.dirname(path.join(root, file)), { recursive: true })
  await writeFile(path.join(root, file), code)
  return (await eslint.lintFiles([file]))[0]
}

test('functional preset reports mutation and side effects only in pure scopes', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lodado-functional-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' },
    include: ['**/*.ts', '**/*.tsx'],
  }))

  const result = await lint(root, 'domain/value.ts', [
    'import fs from "fs"',
    'export function value(items: readonly number[]) {',
    '  const state = { count: items.length }',
    '  state.count = 1',
    '  fetch("/api")',
    '  globalThis.fetch("/api")',
    '  Date()',
    '  new Date("2020-01-01")',
    '  Math.random()',
    '  return items',
    '}',
  ].join('\n'))
  assert.equal(result.messages.some((message) => message.fatal), false, JSON.stringify(result.messages))
  const rules = result.messages.map((message) => message.ruleId)
  assert.ok(rules.includes('functional/immutable-data'))
  assert.ok(rules.includes('no-restricted-globals'))
  assert.ok(rules.includes('no-restricted-properties'))
  assert.ok(result.messages.some((message) => message.ruleId === 'no-restricted-imports'))
  assert.equal(result.messages.filter((message) => message.ruleId === 'no-restricted-syntax').length, 1)

  const ui = await lint(root, 'components/Widget.tsx', 'export function Widget() { window.localStorage.setItem("x", "y"); return null }\n')
  assert.equal(ui.messages.some((message) => message.ruleId === 'no-restricted-globals'), false)
  assert.equal(ui.messages.some((message) => message.ruleId === 'no-restricted-properties'), false)
})

test('functional preset excludes test files', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lodado-functional-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true }, include: ['**/*.ts'] }))
  const result = await lint(root, 'domain/value.test.ts', 'export const value = { count: 0 }; value.count++\n')
  assert.equal(result.messages.some((message) => message.ruleId === 'functional/immutable-data'), false)
})
