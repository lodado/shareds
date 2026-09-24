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

  // Every spelling of a time, random or I/O source is reported in pure code.
  const entropy = await lint(root, 'domain/entropy.ts', [
    'import { randomUUID } from "node:crypto"',
    'import axios from "axios"',
    'export const id = (): string => crypto.randomUUID() + randomUUID()',
    'export const now = (): number => performance.now()',
    'export const later = (): number => globalThis.Date.now()',
    'const clock = Date',
    'export const aliased = (): number => clock.now()',
    'export const label = (value: Date): string => value.toLocaleString()',
    'export const load = (): Promise<unknown> => import("node:fs")',
    'export const client = axios',
  ].join('\n'))
  const byLine = (line) => entropy.messages.filter((message) => message.line === line).map((message) => message.ruleId)
  for (const [line, rule] of [[1, 'no-restricted-imports'], [2, 'no-restricted-imports'], [3, 'no-restricted-globals'], [4, 'no-restricted-globals'], [5, 'no-restricted-properties'], [6, 'no-restricted-syntax'], [8, 'no-restricted-syntax'], [9, 'no-restricted-syntax']]) {
    assert.ok(byLine(line).includes(rule), `line ${line}: ${JSON.stringify(entropy.messages)}`)
  }
  const hashing = await lint(root, 'domain/hash.ts', 'import { createHash } from "node:crypto"\nexport const digest = (text: string): string => createHash("sha256").update(text).digest("hex")\n')
  assert.equal(hashing.messages.filter((message) => message.ruleId?.startsWith('no-restricted')).length, 0, JSON.stringify(hashing.messages))

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

test('functional scopes retain base syntax restrictions', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lodado-functional-base-rules-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true }, include: ['**/*.ts'] }))

  const constEnum = await lint(root, 'domain/const-enum.ts', 'const enum Kind { A }\nexport const value = Kind.A\n')
  assert.ok(constEnum.messages.some((message) => message.ruleId === 'no-restricted-syntax' && message.message.includes('const=true')))

  const exportAssignment = await lint(root, 'domain/export-assignment.ts', 'const value = 1\nexport = value\n')
  assert.ok(exportAssignment.messages.some((message) => message.ruleId === 'no-restricted-syntax' && message.message.includes('TSExportAssignment')))
})

test('reducers are not immutable by default, but .pure files remain protected', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lodado-functional-reducers-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true }, include: ['**/*.ts'] }))

  const reducer = await lint(root, 'reducers/value.ts', 'export function reducer(state: { count: number }) { state.count++\n  return state\n}\n')
  assert.equal(reducer.messages.some((message) => message.ruleId === 'functional/immutable-data'), false)

  const pureReducer = await lint(root, 'reducers/value.pure.ts', 'export function reducer(state: { count: number }) { state.count++\n  return state\n}\n')
  assert.ok(pureReducer.messages.some((message) => message.ruleId === 'functional/immutable-data'))
})
