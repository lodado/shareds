import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// eslint-disable-next-line test/no-import-node-test -- standalone package contract checks.
import test from 'node:test'

import { validateWireframeReport } from './validate-wireframe.mjs'

const EXAMPLE = new URL(
  '../skills/threejs-game-wireframe/examples/stack-greybox/wireframe-report.json',
  import.meta.url,
)
const BASE = JSON.parse(readFileSync(EXAMPLE, 'utf8'))
const report = () => structuredClone(BASE)

test('example report is consistent', () => {
  assert.deepEqual(validateWireframeReport(report()), [])
})

test('accepts an honest layout-only report without a browser', () => {
  const data = report()
  Object.assign(data, { level: 'LAYOUT_ONLY', ecs: 'n/a', ready_to_run: false })
  data.checks.headless = { status: 'N/A', reason: 'no rules at this level' }
  data.checks.browser = { status: 'BLOCKED', reason: 'no WebGL-capable browser in this environment' }
  assert.deepEqual(validateWireframeReport(data), [])
})

const mutations = {
  'greybox without ECS': (d) => (d.ecs = 'optional'),
  'layout with ECS': (d) => Object.assign(d, { level: 'LAYOUT_ONLY' }),
  'greybox without headless tests': (d) => (d.checks.headless = { status: 'N/A', reason: 'skipped' }),
  'greybox with simulated rules': (d) => d.simulated.push('score is a timer'),
  'layout claiming headless rule tests': (d) =>
    Object.assign(d, { level: 'LAYOUT_ONLY', ecs: 'n/a', ready_to_run: false }),
  'PASS without a command': (d) => delete d.checks.build.command,
  'NOT_RUN without a reason': (d) => (d.checks.browser = { status: 'NOT_RUN' }),
  'fun observed without evidence': (d) => (d.checks.fun = { status: 'PASS' }),
  'build after a failed install': (d) =>
    Object.assign(d, { ready_to_run: false, checks: { ...d.checks, install: { status: 'FAIL', command: 'npm ci' } } }),
  'ready without a browser run': (d) => (d.checks.browser = { status: 'BLOCKED', reason: 'no browser' }),
  'unknown status word': (d) => (d.checks.lint.status = 'SKIPPED'),
  'unknown level': (d) => (d.level = 'FULL_GAME'),
}

for (const [name, mutate] of Object.entries(mutations)) {
  test(`rejects ${name}`, () => {
    const data = report()
    mutate(data)
    assert.notDeepEqual(validateWireframeReport(data), [])
  })
}
