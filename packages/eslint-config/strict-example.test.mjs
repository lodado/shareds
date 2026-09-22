import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const configDir = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const example = path.join(configDir, 'examples/strict')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lodado-strict-example-'))
const consumer = path.join(temp, 'consumer')
fs.cpSync(example, consumer, { recursive: true })
const link = (target, destination) => {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.symlinkSync(target, destination, 'junction')
}
fs.mkdirSync(path.join(consumer, 'node_modules/@lodado'), { recursive: true })
link(configDir, path.join(consumer, 'node_modules/@lodado/eslint-config'))
link(path.dirname(require.resolve('@types/react/package.json', { paths: [configDir] })), path.join(consumer, 'node_modules/@types/react'))

const run = (command, args) => spawnSync(process.execPath, [command, ...args], { cwd: consumer, encoding: 'utf8', timeout: 120000 })
const eslintBin = path.join(path.dirname(require.resolve('eslint/package.json', { paths: [configDir] })), 'bin/eslint.js')
const tscBin = path.join(path.dirname(require.resolve('typescript/package.json', { paths: [configDir] })), 'bin/tsc')

test('shipped strict example passes code lint, architecture CLI and typecheck', () => {
  const lint = run(eslintBin, ['src'])
  assert.equal(lint.status, 0, `${lint.stdout}\n${lint.stderr}`)
  const architecture = run(path.join(configDir, 'strict-cli.mjs'), ['strict-policy.mjs'])
  assert.equal(architecture.status, 0, `${architecture.stdout}\n${architecture.stderr}`)
  assert.match(architecture.stdout, /source files checked/u)
  const typecheck = run(tscBin, ['--noEmit'])
  assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`)
})

after(() => fs.rmSync(temp, { recursive: true, force: true }))
