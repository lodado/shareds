import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- standalone package contract checks.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// Structural and headless checks that need no install; typecheck, Steiger, build and browser run in a copy.
const STARTER = fileURLToPath(new URL('../skills/threejs-game-wireframe/starter/', import.meta.url))
const SLICE = path.join(STARTER, 'src/pages/play')

test('starter headless ECS tests pass under Node type stripping', () => {
  const result = spawnSync(process.execPath, ['--test', 'src/**/*.test.ts'], { cwd: STARTER, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

test('starter ships without installed or generated output', () => {
  for (const dir of ['node_modules', 'dist', 'test-results', 'playwright-report']) {
    assert.ok(!existsSync(path.join(STARTER, dir)), `${dir} would be copied into every plugin install`)
  }
})

test('starter keeps FSD layers only, with no extra top-level ECS layer', () => {
  assert.deepEqual(readdirSync(path.join(STARTER, 'src')).sort(), ['app', 'pages'])
  assert.deepEqual(readdirSync(path.join(SLICE, 'model')).sort(), ['__test__', 'ecs', 'game-session.ts', 'runtime'])
  assert.equal(readFileSync(path.join(SLICE, 'index.ts'), 'utf8').trim(), "export { mountPlayPage } from './ui/play-page.ts'")
})

test('architecture doc lists systems in the order stepWorld runs them', () => {
  const source = readFileSync(path.join(SLICE, 'model/ecs/step-world.ts'), 'utf8')
  const start = source.indexOf('export function stepWorld(')
  const body = source.slice(start, source.indexOf('\n}\n', start))
  const called = [...body.matchAll(/\b(?<name>[a-z]\w*)\(world,/g)].map((m) => m.groups.name)
  const doc = readFileSync(path.join(SLICE, '__docs__/architecture.md'), 'utf8')
  const documented = [...doc.matchAll(/^\d+\. `(?<name>\w+)`/gm)].map((m) => m.groups.name)
  assert.deepEqual(documented, called)
  assert.equal(called.length, 5)
})
