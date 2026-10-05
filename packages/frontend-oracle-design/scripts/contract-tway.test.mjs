import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- actual public CLI acceptance boundary.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// Contract default t-way: the shared hand-written card axes (Strength, Touches, E*/PATH*/EMPTY, 50-frame cap,
// eight-family dispositions, mined dimensions) and evidence.json frame/path/sequence gates, no oracle-case tokens.
const scripts = new URL('../skills/frontend-oracle-design/scripts/', import.meta.url)
const fixtureCard = readFileSync(new URL('../test-fixtures/contract-v1/oracle.md', import.meta.url), 'utf8')
const environment = { ...process.env }
delete environment.NODE_TEST_CONTEXT
let cwd
const run = (script, ...args) => spawnSync(process.execPath, [fileURLToPath(new URL(script, scripts)), ...args], { cwd, encoding: 'utf8', env: environment })
const ok = (result) => {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  return result
}

const EXCLUDED = {
  Entry: 'excluded: single entry per approved S1',
  Value: 'excluded: Boolean inputs only per S1',
  Order: 'excluded: exactly one synchronous call per case S1',
  Async: 'excluded: no promises S1',
  Data: 'excluded: no persisted data S1',
  Environment: 'excluded: pure return S1',
  Platform: 'excluded: private Node function S1',
  Inherited: 'excluded: first synthetic revision S1',
}

/** Toggle fixture head (rows O1/O2, P1/P2, approved S1) with a hand-written t-way Case space. */
function tWayCard({ dimensions, strength = 2, risk = 'Medium', touches = false, omit = [] }) {
  const head = fixtureCard.slice(0, fixtureCard.indexOf('## Case space')).replace('- Risk: Medium', `- Risk: ${risk}`)
  const byFamily = new Map(dimensions.map((entry) => [entry.family, entry]))
  const rows = Object.keys(EXCLUDED).filter((family) => !omit.includes(family)).map((family) => {
    const entry = byFamily.get(family)
    const cells = entry ? [family, entry.dimension, entry.choices] : [family, '—', EXCLUDED[family]]
    if (touches) cells.push(entry?.touches ?? '')
    return `| ${cells.join(' | ')} |`
  })
  const header = touches ? '| Family | Dimension | Choices | Touches |\n| --- | --- | --- | --- |' : '| Family | Dimension | Choices |\n| --- | --- | --- |'
  return `${head}## Case space\n\n- Strength: ${strength}\n\n${header}\n${rows.join('\n')}\n`
}

function workspace() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'contract-tway-')))
  const directory = join(root, '.ai/oracles/tway')
  const src = join(root, 'src')
  mkdirSync(directory, { recursive: true })
  mkdirSync(src)
  // S1 is a repo: source — the lock gate needs it as a regular file under the repository root.
  const policy = join(root, 'packages/frontend-oracle-design/test-fixtures/contract-v1/policy.md')
  mkdirSync(join(policy, '..'), { recursive: true })
  copyFileSync(new URL('../test-fixtures/contract-v1/policy.md', import.meta.url), policy)
  spawnSync('/usr/bin/git', ['init', '--quiet', root])
  cwd = root
  return { root, directory, src, oracle: join(directory, 'oracle.md') }
}

/** Disposition every generated ID with the generator's own label so the card is lockable. */
function dispositioned(path, card) {
  writeFileSync(path, card)
  const generated = JSON.parse(ok(run('oracle-frames.mjs', '--oracle', path, '--json')).stdout)
  const lines = [...generated.frames, ...generated.errorFrames, ...generated.paths].map(({ id, label }) => `| ${id} | covered(${label.includes('enabled=true') ? 'O2' : 'O1'}) | ${label} |`)
  writeFileSync(path, `${card}\n## Frame dispositions\n\n| Frame | Disposition | Label |\n| --- | --- | --- |\n${lines.join('\n')}\n`)
  return generated
}

const lintIssues = (path, ...extra) => run('oracle-verify.mjs', 'card', '--oracle', path, ...extra)

test('Contract t-way card generates pairwise frames, not the full product, and reports its strength', () => {
  const w = workspace()
  try {
    const dimensions = [
      { family: 'Entry', dimension: 'enabled', choices: 'false, true', touches: 'P1, P2' },
      { family: 'Value', dimension: 'label', choices: 'empty, short, long', touches: 'P1' },
      { family: 'Environment', dimension: 'viewport', choices: 'narrow, medium, wide', touches: 'P1' },
    ]
    const generated = dispositioned(w.oracle, tWayCard({ dimensions }))
    // 2 × 3 × 3 = 18 raw tuples; pairwise needs at least 3 × 3 = 9 and fewer than the product.
    assert.ok(generated.frames.length >= 9 && generated.frames.length < 18, `pairwise frames: ${generated.frames.length}`)
    ok(lintIssues(w.oracle))
    const summary = JSON.parse(ok(lintIssues(w.oracle, '--case-space')).stdout.trim().split('\n').at(-1))
    assert.deepEqual(
      { coverage: summary.coverage, frames: summary.N_frames, executed: summary.N_executed_unique, status: summary.executionStatus, formal: summary.formalVerification },
      { coverage: 't-way 2', frames: generated.frames.length, executed: null, status: 'not-run', formal: 'not-performed' },
    )

    // Touches scopes obligations: label × viewport share no P*, so only enabled pairs remain.
    const scoped = dispositioned(join(w.directory, 'scoped.md'), tWayCard({ dimensions: dimensions.map((entry) => entry.family === 'Environment' ? { ...entry, touches: 'P2' } : entry), touches: true }))
    assert.ok(scoped.frames.length < generated.frames.length, `Touches must scope frames: ${scoped.frames.length}`)
    ok(lintIssues(join(w.directory, 'scoped.md')))

    // High risk with two combinable dimensions requires Strength 3.
    writeFileSync(w.oracle, readFileSync(w.oracle, 'utf8').replace('- Risk: Medium', '- Risk: High'))
    assert.match(lintIssues(w.oracle).stderr, /case-space-strength: High risk requires Strength: 3/)
    const high = dispositioned(join(w.directory, 'high.md'), tWayCard({ dimensions, strength: 3, risk: 'High' }))
    assert.equal(high.frames.length, 18, 'Strength 3 over three dimensions is every triple')
    const highSummary = JSON.parse(ok(lintIssues(join(w.directory, 'high.md'), '--case-space')).stdout.trim().split('\n').at(-1))
    assert.equal(highSummary.coverage, 't-way 3')

    // More than 50 combinable frames disqualifies the design.
    const wide = dispositioned(join(w.directory, 'wide.md'), tWayCard({ dimensions: [
      { family: 'Entry', dimension: 'enabled', choices: 'false, true' },
      { family: 'Value', dimension: 'label', choices: Array.from({ length: 8 }, (_, index) => `v${index}`).join(', ') },
      { family: 'Environment', dimension: 'viewport', choices: Array.from({ length: 8 }, (_, index) => `w${index}`).join(', ') },
    ] }))
    assert.ok(wide.frames.length > 50)
    assert.match(lintIssues(join(w.directory, 'wide.md')).stderr, /case-space-too-wide: \d+ combinable frames/)
  } finally {
    rmSync(w.root, { recursive: true, force: true })
  }
})

test('Contract t-way lint enforces eight-family dispositions and mined touched-file dimensions', () => {
  const w = workspace()
  try {
    const dimensions = [{ family: 'Entry', dimension: 'enabled', choices: 'false, true' }]
    dispositioned(w.oracle, tWayCard({ dimensions, omit: ['Platform'] }))
    assert.match(lintIssues(w.oracle).stderr, /family-undispositioned: Platform/)

    dispositioned(w.oracle, tWayCard({ dimensions }))
    const touched = join(w.src, 'toggle.mjs')
    writeFileSync(touched, 'export const both = (a, b) => Promise.all([a(), b()])\n')
    assert.match(lintIssues(w.oracle, '--path', touched).stderr, /dimension-candidate-undeclared: Order\/response order/)
    // Citing the touched file in the exclusion reason is the explicit disposition.
    writeFileSync(w.oracle, readFileSync(w.oracle, 'utf8').replace(EXCLUDED.Order, `${EXCLUDED.Order}; inspected ${touched}`))
    ok(lintIssues(w.oracle, '--path', touched))
  } finally {
    rmSync(w.root, { recursive: true, force: true })
  }
})

test('Contract t-way Delivery verifies evidence.json frame/sequence names in a trusted run without oracle-case tokens', () => {
  const w = workspace()
  try {
    const dimensions = [
      { family: 'Entry', dimension: 'enabled', choices: 'false, true' },
      { family: 'Order', dimension: 'calls', choices: 'single, repeated' },
    ]
    const generated = dispositioned(w.oracle, tWayCard({ dimensions }))
    ok(run('oracle-stage.mjs', 'begin', '--dir', w.directory, '--profile', 'contract/v1'))
    for (const to of ['CHECKED', 'DRAFTED']) ok(run('oracle-stage.mjs', 'advance', '--dir', w.directory, '--to', to))
    const lock = join(w.directory, 'oracle.lock.json')
    ok(run('oracle-lock.mjs', 'create', '--oracle', w.oracle, '--lock', lock, '--source', 'packages/frontend-oracle-design/test-fixtures/contract-v1/policy.md', '--profile', 'contract/v1'))
    writeFileSync(join(w.src, 'product.mjs'), 'export const toggle = (enabled) => !enabled\n')
    const frameNames = generated.frames.map(({ id, label }) => `toggle [${id}] ${label}`)
    const names = [...frameNames, 'toggle sequence: repeated calls alternate']
    const testFile = join(w.src, 'product.test.mjs')
    const cases = names.map((name) => `test(${JSON.stringify(name)}, () => assert.equal(toggle(false), true))`).join('\n')
    writeFileSync(testFile, `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { toggle } from './product.mjs'\n${cases}\n`)

    // t-way Order needs no fast-check producer label: the sequence test is the obligation.
    ok(run('oracle-run.mjs', 'init', '--dir', w.directory, '--lock', lock, '--scan-root', w.src, '--required-label', 'contract-cases:reported', '--harness-path', 'product.test.mjs'))
    const status = () => JSON.parse(ok(run('oracle-run.mjs', 'status', '--dir', w.directory, '--json')).stdout).verification
    assert.deepEqual([status().coverage, status().N_executed_unique, status().executionStatus], ['t-way 2', null, 'not-run'])

    const record = (adapter, command, report) => {
      ok(run('oracle-run.mjs', 'exec', '--dir', w.directory, '--label', 'contract-cases:reported', '--adapter', adapter, '--report', join(w.directory, report), '--', ...command))
      return JSON.parse(readFileSync(join(w.directory, 'runs.jsonl'), 'utf8').trim().split('\n').at(-1)).runId
    }
    const nodeRun = record('node-test', [process.execPath, '--test', testFile], 'node.ndjson')
    const rows = { O1: { kind: 'test', name: frameNames[0] }, O2: { kind: 'test', name: frameNames[1] } }
    const frames = Object.fromEntries(generated.frames.map(({ id }, index) => [id, { kind: 'test', name: frameNames[index] }]))
    const sequence = { kind: 'test', name: names.at(-1) }
    const evidence = join(w.directory, 'evidence.json')
    const verify = (map, runId = nodeRun) => {
      writeFileSync(evidence, JSON.stringify({ schemaVersion: 1, ...map }))
      return run('oracle-verify.mjs', 'evidence', '--oracle', w.oracle, '--map', evidence, '--ledger', join(w.directory, 'runs.jsonl'), '--run', runId, '--phase', 'green')
    }

    const [first, ...rest] = generated.frames.map(({ id }) => id)
    assert.match(verify({ rows, frames: Object.fromEntries(rest.map((id) => [id, frames[id]])), sequence }).stderr, /EVIDENCE_MISSING_FRAME: .*/)
    assert.match(verify({ rows, frames: { ...frames, F999: frames[first] }, sequence }).stderr, /EVIDENCE_UNKNOWN_FRAME: .*F999/)
    assert.match(verify({ rows, frames: { ...frames, [first]: { kind: 'test', name: 'never executed' } }, sequence }).stderr, new RegExp(`EVIDENCE_NOT_IN_RUN: ${first}`))
    assert.match(verify({ rows, frames }).stderr, /SEQUENCE_EVIDENCE_MISSING: Order dimension "calls"/)

    const report = JSON.parse(ok(verify({ rows, frames, sequence })).stdout.trim().split('\n').at(-1))
    assert.deepEqual(
      { coverage: report.coverage, executed: report.N_executed_unique, passed: report.N_passed_unique, status: report.executionStatus, formal: report.formalVerification },
      { coverage: 't-way 2', executed: generated.frames.length + 1, passed: generated.frames.length + 1, status: 'executed', formal: 'not-performed' },
    )
    assert.equal(status().N_executed_unique, generated.frames.length + 1)
    const claims = join(w.directory, 'report.md')
    writeFileSync(claims, `Status: ORACLE_READY\nProfile: contract/v1\nCoverage: t-way 2\nExecuted unique: ${generated.frames.length + 1}\nPassed unique: ${generated.frames.length + 1}\nFormal verification: not-performed\n`)
    ok(run('oracle-run.mjs', 'status', '--dir', w.directory, '--check-report', claims))
    writeFileSync(claims, readFileSync(claims, 'utf8').replace('Coverage: t-way 2', 'Coverage: full-product'))
    assert.match(run('oracle-run.mjs', 'status', '--dir', w.directory, '--check-report', claims).stderr, /report requires exactly Coverage: t-way 2/)

    // vitest is the other trusted adapter: a stand-in binary writes the same NDJSON terminals the real reporter emits.
    const bin = join(w.root, 'bin')
    mkdirSync(bin)
    const vitest = join(bin, 'vitest')
    const terminals = names.map((name) => `${JSON.stringify({ type: 'test:pass', data: { name, status: 'passed', test: true, file: testFile } })}\n`).join('')
    writeFileSync(vitest, `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.ORACLE_REPORT_DESTINATION, ${JSON.stringify(terminals)})\n`)
    chmodSync(vitest, 0o755)
    const vitestRun = record('vitest', [vitest, 'run'], 'vitest.ndjson')
    const vitestReport = JSON.parse(ok(verify({ rows, frames, sequence }, vitestRun)).stdout.trim().split('\n').at(-1))
    assert.equal(vitestReport.N_executed_unique, generated.frames.length + 1)
  } finally {
    rmSync(w.root, { recursive: true, force: true })
  }
})
