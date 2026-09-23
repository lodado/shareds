import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- standalone package contract checks.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { checkPackage } from './check-contract.mjs'
import { validateReport } from './validate-design.mjs'

// Regression tests of validators, not actual agent behavior or game execution.
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const EXAMPLE = path.join(ROOT, 'skills/reference-driven-game-design/examples/merge-garden')
const BASE = JSON.parse(readFileSync(path.join(EXAMPLE, 'delivery.json'), 'utf8'))

const report = () => structuredClone(BASE)

test('valid example and package integrity', () => {
  assert.deepEqual(validateReport(report(), EXAMPLE), [])
  assert.deepEqual(checkPackage(), [])
})

const mutations = {
  'duplicate ids': (d) => d.rules.push(structuredClone(d.rules[0])),
  'unknown state': (d) => (d.state_machines[0].transitions[0].to = 'missing'),
  'unreachable state': (d) => d.state_machines[0].states.push('unreachable'),
  'unknown initial state': (d) => (d.state_machines[0].initial_state = 'not-a-state'),
  'primary action target': (d) => (d.screens[0].primary_actions[0].transition_ids = ['T-missing']),
  'empty primary actions': (d) => (d.screens[0].primary_actions = []),
  'trace rules': (d) => (d.trace[0].rule_ids = ['R-missing']),
  'trace feedback': (d) => (d.trace[0].feedback_ids = ['F-missing']),
  'evidence reference': (d) => (d.artifacts[0].evidence_ids = ['E-missing']),
  'missing files': (d) => (d.artifacts[0].path = 'not-created.md'),
  'parent escape': (d) => (d.artifacts[0].path = '../secrets'),
  'absolute escape': (d) => (d.artifacts[0].path = '/home/secrets'),
  'stale artifact': (d) => (d.artifacts[0].status = 'stale'),
  'PLAN_ONLY fake Figma': (d) => (d.readiness.figma = 'FIGMA_READY'),
  'requested Figma downgrade': (d) => (d.mode = 'FIGMA'),
  'Figma ready without evidence': (d) => {
    d.mode = 'FIGMA'
    d.readiness.figma = 'FIGMA_READY'
  },
  'acceptance without user': (d) => (d.readiness.user_acceptance = 'accepted'),
  'fun without observation': (d) => (d.readiness.fun = 'observed'),
  'playable without execution': (d) => (d.readiness.playable = 'tested'),
  'experiment fake observation': (d) => (d.experiments[0].status = 'observed'),
  'hidden resume': (d) => (d.interruption_policy.resume_when_hidden = true),
  'missing ad key and decline': (d) => (d.interruption_policy.ads_enabled = true),
  'open plan blocker': (d) =>
    d.issues.push({
      id: 'I-blocker',
      scope: 'planning',
      severity: 'blocking',
      status: 'open',
      description: 'Failure rule undefined',
    }),
  'wrong type': (d) => (d.state_machines = 'not-a-list'),
  'empty plan': (d) => {
    d.rules = []
    d.trace = []
  },
  'untraced rule': (d) => d.rules.push({ id: 'R-untraced', invariant: 'new rule', verification: 'needs test' }),
}

for (const [name, mutate] of Object.entries(mutations)) {
  test(`rejects ${name}`, () => {
    const data = report()
    mutate(data)
    assert.notDeepEqual(validateReport(data, EXAMPLE), [])
  })
}

test('accepts a declared ad contract', () => {
  const data = report()
  Object.assign(data.interruption_policy, {
    ads_enabled: true,
    reward_idempotency_key: 'grantId + runId',
    decline_path: 'result → replay',
    provider_policy: 'Proposal pending actual SDK review; no runtime claim',
  })
  assert.deepEqual(validateReport(data, EXAMPLE), [])
})

test('Figma block stays independent of planning readiness', () => {
  const data = report()
  data.mode = 'FIGMA'
  data.readiness.figma = 'BLOCKED'
  data.issues.push({
    id: 'I-access',
    scope: 'figma',
    severity: 'blocking',
    status: 'open',
    description: 'No authorized Figma target',
  })
  assert.deepEqual(validateReport(data, EXAMPLE), [])
})

test('rejects an artifact symlink escaping the delivery directory', (t) => {
  // Package-local scratch directory, removed after the test.
  const root = path.join(ROOT, '.test-tmp/symlink-escape')
  rmSync(root, { recursive: true, force: true })
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const delivery = path.join(root, 'delivery')
  mkdirSync(delivery, { recursive: true })
  writeFileSync(path.join(root, 'outside.md'), 'outside')
  symlinkSync(path.join(root, 'outside.md'), path.join(delivery, 'escape.md'))
  const data = report()
  data.artifacts[0].path = 'escape.md'
  assert.ok(validateReport(data, delivery).some((e) => e.includes('symlink')))
})

test('CLI validates the example', () => {
  const result = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts/validate-design.mjs'),
    path.join(EXAMPLE, 'delivery.json'),
  ])
  assert.equal(result.status, 0, String(result.stdout) + String(result.stderr))
})

test('behavior rubrics are declared unexecuted', () => {
  const cases = JSON.parse(
    readFileSync(path.join(ROOT, 'skills/reference-driven-game-design/evals/behavior-cases.json'), 'utf8'),
  )
  assert.equal(cases.status, 'not_executed')
  assert.equal(cases.cases.length, 24)
  assert.equal(new Set(cases.cases.map((c) => c.id)).size, 24)
})
