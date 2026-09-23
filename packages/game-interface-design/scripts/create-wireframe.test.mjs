import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- standalone package contract checks.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { createWireframe } from './create-wireframe.mjs'

const SCRATCH = fileURLToPath(new URL('../.test-tmp/create-wireframe/', import.meta.url))
const STARTER = fileURLToPath(new URL('../skills/threejs-game-wireframe/starter/', import.meta.url))

test.beforeEach(() => {
  rmSync(SCRATCH, { recursive: true, force: true })
  mkdirSync(SCRATCH, { recursive: true })
})
test.after(() => rmSync(SCRATCH, { recursive: true, force: true }))

test('copies the starter into a new directory', () => {
  const dest = createWireframe(path.join(SCRATCH, 'game'))
  for (const file of ['package.json', 'package-lock.json', 'src/pages/play/index.ts', 'steiger.config.ts']) {
    assert.ok(existsSync(path.join(dest, file)), file)
  }
  assert.equal(
    readFileSync(path.join(dest, 'src/pages/play/model/game-session.ts'), 'utf8'),
    readFileSync(path.join(STARTER, 'src/pages/play/model/game-session.ts'), 'utf8'),
  )
})

test('accepts an existing empty directory', () => {
  const dest = path.join(SCRATCH, 'empty')
  mkdirSync(dest)
  createWireframe(dest)
  assert.ok(existsSync(path.join(dest, 'index.html')))
})

test('refuses a non-empty target and leaves it untouched', () => {
  const dest = path.join(SCRATCH, 'taken')
  mkdirSync(dest)
  writeFileSync(path.join(dest, 'index.html'), 'user file')
  assert.throws(() => createWireframe(dest), /refusing to overwrite/)
  assert.equal(readFileSync(path.join(dest, 'index.html'), 'utf8'), 'user file')
  assert.ok(!existsSync(path.join(dest, 'package.json')))
})
