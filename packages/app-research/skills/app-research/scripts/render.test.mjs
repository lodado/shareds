import assert from 'node:assert/strict'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { next } from './next.mjs'
import { render } from './render.mjs'
import { act, anchor, newRun, screen } from './test-helpers.mjs'

const REPORTS = [
  'README.md',
  'app-spec.json',
  'coverage.md',
  'evidence-index.md',
  'features.md',
  'policies.md',
  'sitemap.md',
  'unknowns.md',
  'ux-flow.md',
]

async function renderedRun() {
  const { root, runDir } = await newRun({ app: 'sample', scope: 'all', locale: 'ko-KR', 'target-version': '1.2.3' })
  await anchor(root, runDir, screen('Home', ['Settings', 'Pay now', 'Profile']))
  await act(
    root,
    runDir,
    { action: 'tap', label: 'Settings', id: 'btn-Settings' },
    screen('Settings', ['Notifications']),
  )
  await next(runDir)
  await writeFile(
    join(runDir, 'features.json'),
    JSON.stringify({
      features: [
        {
          id: 'SET-001',
          name: 'Open settings',
          status: 'observed',
          screenIds: ['S-002'],
          transitionIds: ['T-001'],
          evidence: [{ kind: 'observation', ref: 'O-0002' }],
        },
      ],
    }),
  )
  await writeFile(
    join(runDir, 'policies.json'),
    JSON.stringify({
      policies: [
        {
          id: 'POL-001',
          category: 'data',
          statement: 'Settings are available without sign-in.',
          status: 'observed',
          evidence: [{ kind: 'observation', ref: 'O-0002' }],
        },
        {
          id: 'POL-002',
          category: 'billing',
          statement: 'A trial exists.',
          status: 'inferred',
          basis: 'Banner on Home.',
          evidence: [],
        },
        { id: 'POL-003', category: 'usage', statement: 'Daily upload limit.', status: 'unknown', evidence: [] },
      ],
    }),
  )
  return runDir
}

const read = (runDir, name) => readFile(join(runDir, 'report', name), 'utf8')

test('render as a researched run', async () => {
  const runDir = await renderedRun()
  const result = await render(runDir)
  assert.deepEqual((await readdir(result.reportDir)).sort(), REPORTS)
  assert.deepEqual([...result.files].sort(), REPORTS)
  const spec = JSON.parse(await read(runDir, 'app-spec.json'))
  assert.deepEqual(
    {
      screens: spec.screens.length,
      transitions: spec.transitions.length,
      features: spec.features.length,
      policies: spec.policies.length,
      blocked: spec.blocked.length,
    },
    { screens: 2, transitions: 1, features: 1, policies: 3, blocked: 1 },
  )
  assert.equal(spec.run.targetVersion, '1.2.3')
})

test('render as the same run rendered twice', async () => {
  const runDir = await renderedRun()
  await render(runDir)
  const first = await Promise.all(REPORTS.map((name) => read(runDir, name)))
  await render(runDir)
  assert.deepEqual(await Promise.all(REPORTS.map((name) => read(runDir, name))), first)
})

test('render as a flow diagram', async () => {
  const runDir = await renderedRun()
  await render(runDir)
  const flow = await read(runDir, 'ux-flow.md')
  const diagram = flow.split('```mermaid\n')[1].split('\n```')[0].split('\n')
  assert.equal(diagram[0], 'flowchart LR')
  assert.ok(diagram.includes('  S001["S-001 Home"]'))
  assert.ok(diagram.includes('  S001 -->|"tap: Settings"| S002'))
  assert.ok(diagram.includes('  B1["blocked: payment"]:::blocked'))
  assert.ok(diagram.includes('  S001 -.->|"tap: Pay now"| B1'))
  assert.ok(diagram.includes('  classDef blocked stroke-dasharray: 4 3,stroke:#b42318'))
})

test('render as labels with characters that break Mermaid', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, screen('Home "A" [x] (y) | z', ['Go <now> {b}']))
  await act(root, runDir, { action: 'tap', label: 'Go <now> {b}', id: 'btn-Go <now> {b}' }, screen('Next', []))
  await render(runDir)
  const diagram = (await read(runDir, 'ux-flow.md')).split('```mermaid\n')[1].split('\n```')[0]
  for (const line of diagram.split('\n').slice(1)) {
    const quoted = [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1])
    for (const text of quoted) assert.doesNotMatch(text, /[[\]{}()<>|`]/, line)
    assert.equal((line.match(/"/g) ?? []).length % 2, 0, line)
  }
})

test('render as a screen hierarchy', async () => {
  const runDir = await renderedRun()
  await render(runDir)
  assert.equal(
    await read(runDir, 'sitemap.md'),
    '# Sitemap\n\n- S-001 Home (unclassified, depth 0)\n  - S-002 Settings (unclassified, depth 1)\n',
  )
})

test('render as claims split by how well they are known', async () => {
  const runDir = await renderedRun()
  await render(runDir)
  const policies = await read(runDir, 'policies.md')
  const order = ['## Confirmed', '## Inferred (not verified)', '## Unknown'].map((heading) => policies.indexOf(heading))
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  )
  assert.ok(order.every((index) => index >= 0))
  assert.match(policies.split('## Confirmed')[1].split('## Inferred')[0], /POL-001/)
  assert.match(
    policies.split('## Inferred (not verified)')[1].split('## Unknown')[0],
    /POL-002.*basis: Banner on Home\./,
  )
  assert.match(policies.split('## Unknown')[1], /POL-003/)
})

test('render as gaps and coverage', async () => {
  const runDir = await renderedRun()
  await render(runDir)
  const unknowns = await read(runDir, 'unknowns.md')
  assert.match(unknowns, /S-001 tap "Pay now" \(payment\): Complete or skip this purchase or transfer yourself/)
  assert.match(unknowns, /## Discovered but not explored\n\n- S-001 tap "Profile"/)
  assert.match(unknowns, /- POL-003 Daily upload limit\./)
  const coverage = await read(runDir, 'coverage.md')
  assert.match(coverage, /It is not the share of the whole app\./)
  assert.match(
    coverage,
    /- Screens discovered: 2\n- Actions discovered: 4\n- Actions executed: 1\n- Actions blocked: 1\n- Actions discovered but not explored: 2\n- Action budget used: 1 of 60/,
  )
})

test('render as evidence references', async () => {
  const runDir = await renderedRun()
  await render(runDir)
  const index = await read(runDir, 'evidence-index.md')
  assert.match(index, /\| O-0002 \| S-002 \| tap Settings \| ok \| snapshots\/O-0002\.json \| {2}\|/)
  assert.match(await read(runDir, 'features.md'), /## SET-001 Open settings[\s\S]*Evidence: O-0002/)
})

test('render as a run that fails lint', async () => {
  const runDir = await renderedRun()
  await writeFile(
    join(runDir, 'policies.json'),
    JSON.stringify({
      policies: [{ id: 'POL-001', category: 'data', statement: 'x', status: 'observed', evidence: [] }],
    }),
  )
  await assert.rejects(render(runDir), /fails lint \(1 errors\)[\s\S]*CLAIM_UNSUPPORTED POL-001/)
  assert.equal(await stat(join(runDir, 'report')).catch(() => null), null, 'nothing is written for a failing run')
})
