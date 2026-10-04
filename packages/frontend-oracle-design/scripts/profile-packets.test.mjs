import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- scoped public CLI regressions.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadGraph } from '../skills/frontend-oracle-design/scripts/generate-reference-bundles.mjs'
import { routeReferences } from '../skills/frontend-oracle-design/scripts/oracle-reference-route.mjs'
import { parseWorkerSubmission } from '../skills/frontend-oracle-design/scripts/oracle-worker.mjs'
import { fullProductFixture } from '../test-fixtures/full-product/fixture.mjs'

const scripts = new URL('../skills/frontend-oracle-design/scripts/', import.meta.url)
const loader = `data:text/javascript,${encodeURIComponent("export async function resolve(s,c,n){if(/oracle-(package|model|adequacy|discovery)\\.mjs$|ensure-bend\\.mjs$/.test(s))throw Error('FORMAL_IMPORT_DENIED:'+s);return n(s,c)}")}`

test('Contract public guidance worker and review artifacts bind identity and selected physical dependency closure without Formal imports', () => {
  const root = mkdtempSync(join(tmpdir(), 'oracle-profile-packets-'))
  const directory = join(root, '.ai', 'oracles', 'contract')
  const scanRoot = join(root, 'src')
  mkdirSync(directory, { recursive: true })
  mkdirSync(scanRoot)
  const environment = { ...process.env, NODE_OPTIONS: `--experimental-loader=${loader}` }
  delete environment.NODE_TEST_CONTEXT
  const run = (script, ...args) => spawnSync(process.execPath, [new URL(script, scripts).pathname, ...args], {
    encoding: 'utf8', env: environment,
  })
  const ok = (result) => { assert.equal(result.status, 0, result.stderr); return result }
  try {
    const oracle = join(directory, 'oracle.md')
    const lock = join(directory, 'oracle.lock.json')
    const fixture = fullProductFixture()
    const names = fixture.records.map((record) => {
      const identity = { id: record.frame, scenario: record.scenario.id, tuple: record.tuple, dimensionRevision: fixture.generated.dimensionRevision, constraintRevision: fixture.generated.constraintRevision }
      return `case [${record.frame}] oracle-case:${Buffer.from(JSON.stringify(identity)).toString('base64url')}`
    })
    // S1/P1/O1 concerns this synthetic ordered-event product, not real pagination policy.
    writeFileSync(join(scanRoot, 'save.mjs'), 'export const pending = false\nexport const trace = events => [...events].reverse()\n')
    mkdirSync(join(root, 'node_modules'))
    for (const [name, location] of [['typescript', 'typescript@5.9.3'], ['fast-check', 'fast-check@4.10.2'], ['type-fest', 'type-fest@4.41.0']]) {
      symlinkSync(fileURLToPath(new URL(`../../../node_modules/.pnpm/${location}/node_modules/${name}`, import.meta.url)), join(root, 'node_modules', name))
    }
    writeFileSync(join(scanRoot, 'save.d.mts'), 'export const pending: boolean\nexport function trace(events: readonly string[]): string[]\n')
    writeFileSync(join(scanRoot, 'positive.mts'), "import type {IsEqual} from 'type-fest'\nimport {pending, trace} from './save.mjs'\nconst result: IsEqual<ReturnType<typeof trace>,string[]> = true\nconst state: IsEqual<typeof pending,boolean> = true\ntrace(['start:next:A','complete:A'])\n")
    writeFileSync(join(scanRoot, 'negative.mts'), "import type {IsEqual} from 'type-fest'\nimport {trace} from './save.mjs'\nconst result: IsEqual<ReturnType<typeof trace>,number[]> = true\ntrace([123])\n")
    writeFileSync(join(scanRoot, 'property.mjs'), `import fc from 'fast-check'\nimport {pending, trace} from './save.mjs'\nconst scenarios = ${JSON.stringify(fixture.records.map(({ scenario }) => scenario.when))}\nexport const domain = 'S1/P1/O1 next/previous × single/duplicate/late × fresh/prior ordered event traces'\nexport const seed = 42\nexport const numRuns = 40\nexport const property = fc.property(fc.constantFrom(...scenarios), events => pending === true && JSON.stringify(trace(events)) === JSON.stringify(events))\n`)
    const witnessPath = join(scanRoot, 'witness.test.mjs')
    writeFileSync(witnessPath, `import test from 'node:test'\ntest('O1 compiler consumer',t=>t.diagnostic('oracle-contract/v1 '+JSON.stringify({name:'O1 compiler consumer',kind:'type-contract',positive:'positive.mts',negative:'negative.mts'})))\ntest('O1 ordered trace property',t=>t.diagnostic('oracle-contract/v1 '+JSON.stringify({name:'O1 ordered trace property',kind:'fast-check',module:'property.mjs'})))\n`)
    const testPath = join(scanRoot, 'save.test.mjs')
    const cases = fixture.records.map((record, index) => `test(${JSON.stringify(names[index])},()=>{assert.equal(pending,true);assert.deepEqual(trace(${JSON.stringify(record.scenario.when)}),${JSON.stringify(record.scenario.when)})})\n`).join('')
    writeFileSync(testPath, `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport {pending,trace} from './save.mjs'\ntest('save > pending',()=>{assert.equal(pending,true);for(const events of ${JSON.stringify(fixture.records.map(({ scenario }) => scenario.when))})assert.deepEqual(trace(events),events)})\n${cases}`)
    writeFileSync(oracle, `${fixture.render()}\n## Verification Profile\n\n- Profile: contract/v1\n`)
    ok(run('oracle-stage.mjs', 'begin', '--dir', directory, '--profile', 'contract/v1'))
    for (const to of ['CHECKED', 'DRAFTED']) ok(run('oracle-stage.mjs', 'advance', '--dir', directory, '--to', to))
    ok(run('oracle-lock.mjs', 'create', '--oracle', oracle, '--lock', lock))
    ok(run('oracle-run.mjs', 'init', '--dir', directory, '--lock', lock, '--scan-root', scanRoot,
      ...['save.test.mjs', 'save.d.mts', 'positive.mts', 'negative.mts', 'property.mjs', 'witness.test.mjs'].flatMap((path) => ['--harness-path', path]),
      ...['contract-cases:reported', 'type-contract:reported', 'fast-check:reported'].flatMap((label) => ['--required-label', label])))
    const before = ['run-state.json', 'runs.jsonl'].map((file) => readFileSync(join(directory, file)))
    const guide = JSON.parse(ok(run('oracle-run.mjs', 'guide', '--dir', directory, '--to', 'VALID_RED', '--json')).stdout)
    assert.equal(guide.verificationProfile, 'contract/v1')
    assert.equal(guide.controller, 'frontend-contract-design')
    assert.ok(guide.action.reads.agent.some(({ path }) => path === 'references/contract/red.md'))
    assert.equal([...guide.action.reads.agent, ...guide.action.reads.reviewer].some(({ path }) => /-formal\.md$|mandatory-verification|bend-cross/.test(path)), false)
    for (const [index, file] of ['run-state.json', 'runs.jsonl'].entries()) assert.deepEqual(readFileSync(join(directory, file)), before[index])
    const evidence = { schemaVersion: 1, rows: { O1: { kind: 'test', name: 'save > pending' } },
      frames: Object.fromEntries(fixture.records.map((record, index) => [record.frame, { kind: 'test', name: names[index], tuple: record.tuple, scenario: record.scenario.id, dimensionRevision: fixture.generated.dimensionRevision, constraintRevision: fixture.generated.constraintRevision }])),
      sequence: { kind: 'test', name: 'save > pending' },
    }
    writeFileSync(join(directory, 'evidence.json'), JSON.stringify(evidence))
    ok(run('oracle-run.mjs', 'exec', '--dir', directory, '--label', 'contract-cases:reported', '--adapter', 'node-test', '--report', join(directory, 'red.ndjson'), '--', process.execPath, '--test', testPath))
    assert.equal(JSON.parse(readFileSync(join(directory, 'runs.jsonl'), 'utf8').trim().split('\n').at(-1)).exitCode, 1)
    for (const label of ['type-contract:reported', 'fast-check:reported']) {
      // RED records failing product observations only. Producer passes are required below for GREEN.
      ok(run('oracle-run.mjs', 'exec', '--dir', directory, '--label', label, '--adapter', 'node-test', '--report', join(directory, `red-${label.split(':')[0]}.ndjson`), '--', process.execPath, '--test', testPath))
    }
    ok(run('oracle-run.mjs', 'transition', '--dir', directory, '--to', 'VALID_RED', '--run', 'r-001', '--evidence', join(directory, 'evidence.json'), '--row', 'O1'))
    const skill = join(directory, 'test-skill')
    mkdirSync(join(skill, 'references'), { recursive: true })
    writeFileSync(join(skill, 'SKILL.md'), '---\nname: test\n---\nSynthetic transport skill.\n')
    writeFileSync(join(skill, 'references', 'bva.md'), 'Synthetic boundary.\n')
    const task = join(directory, 'task.json')
    writeFileSync(task, JSON.stringify({ taskId: 'pending', goal: 'Implement O1', rows: ['O1'], writablePaths: ['save.mjs'], referenceNodes: [], testSkill: join(skill, 'SKILL.md'), replaySafeLabels: ['contract-cases:reported', 'type-contract:reported', 'fast-check:reported'] }))
    const issued = ok(run('oracle-run.mjs', 'worker-packet', '--dir', directory, '--task', task))
    const packetPath = issued.stdout.trim().replace('WORKER_PACKET ', '')
    const packet = JSON.parse(readFileSync(packetPath, 'utf8'))
    assert.equal(packet.verificationProfile, 'contract/v1')
    assert.equal(packet.controller, 'frontend-contract-design')
    assert.ok(packet.references.some(({ id, path }) => id === 'delivery-red' && path.endsWith('/references/contract/red.md')))
    assert.equal(packet.references.some(({ path }) => /-formal\.md$|mandatory-verification|bend-cross/.test(path)), false)
    const stateBefore = readFileSync(join(directory, 'run-state.json'))
    const ledgerBefore = readFileSync(join(directory, 'runs.jsonl'))
    const reservationPath = join(directory, '.run-ids', packet.attemptId)
    const reservation = JSON.parse(readFileSync(reservationPath, 'utf8'))
    for (const change of [({ verificationProfile: _profile, ...rest }) => rest, (value) => ({ ...value, verificationProfile: 'formal-bend/v1' }), (value) => ({ ...value, controller: 'frontend-oracle-design' })]) {
      const bytes = JSON.stringify(change(packet))
      writeFileSync(packetPath, bytes)
      writeFileSync(reservationPath, JSON.stringify({ ...reservation, packetSha256: createHash('sha256').update(bytes).digest('hex') }))
      const rejected = run('oracle-run.mjs', 'worker-run', '--dir', directory, '--packet', packetPath, '--max-budget-usd', '0.1')
      assert.equal(rejected.status, 1)
      assert.match(rejected.stderr, /PROFILE_MISMATCH/)
      assert.deepEqual(readFileSync(join(directory, 'run-state.json')), stateBefore)
      assert.deepEqual(readFileSync(join(directory, 'runs.jsonl')), ledgerBefore)
    }
    for (const references of [packet.references.filter(({ id }) => id !== 'role-implement'), packet.references.map((entry, index) => index === 0 ? { ...entry, content: `${entry.content}\nTAMPERED` } : entry)]) {
      const bytes = JSON.stringify({ ...packet, references })
      writeFileSync(packetPath, bytes)
      writeFileSync(reservationPath, JSON.stringify({ ...reservation, packetSha256: createHash('sha256').update(bytes).digest('hex') }))
      const rejected = run('oracle-run.mjs', 'worker-run', '--dir', directory, '--packet', packetPath, '--max-budget-usd', '0.1')
      assert.equal(rejected.status, 1)
      assert.match(rejected.stderr, /WORKER_INPUT_STALE/)
      assert.deepEqual(readFileSync(join(directory, 'run-state.json')), stateBefore)
      assert.deepEqual(readFileSync(join(directory, 'runs.jsonl')), ledgerBefore)
    }
    for (const reference of ['role-controller', 'role-reporting', 'role-review', 'controller-entry-formal']) {
      const taskDocument = JSON.parse(readFileSync(task, 'utf8'))
      writeFileSync(task, JSON.stringify({ ...taskDocument, referenceNodes: [reference] }))
      const rejected = run('oracle-run.mjs', 'worker-packet', '--dir', directory, '--task', task)
      assert.equal(rejected.status, 1, reference)
      assert.equal(rejected.stdout.includes('WORKER_PACKET '), false)
      assert.deepEqual(readFileSync(join(directory, 'run-state.json')), stateBefore)
      assert.deepEqual(readFileSync(join(directory, 'runs.jsonl')), ledgerBefore)
    }
    writeFileSync(join(scanRoot, 'save.mjs'), 'export const pending = true\nexport const trace = events => [...events]\n')
    let greenRun
    for (let pass = 0; pass < 2; pass += 1) {
      for (const label of ['contract-cases:reported', 'type-contract:reported', 'fast-check:reported']) {
        const result = ok(run('oracle-run.mjs', 'exec', '--dir', directory, '--label', label, '--adapter', 'node-test', '--report', join(directory, `green-${pass}-${label.split(':')[0]}.ndjson`), '--', process.execPath, '--test', label === 'contract-cases:reported' ? testPath : witnessPath))
        if (label === 'contract-cases:reported') greenRun = result.stdout.match(/RUN_RECORDED (r-\d+)/)[1]
        else {
          const events = readFileSync(join(directory, `green-${pass}-${label.split(':')[0]}.ndjson`), 'utf8').trim().split('\n').map(JSON.parse)
          const compiler = events.find(({ data }) => data.name === 'O1 compiler consumer').data.contractEvidence
          assert.equal(compiler.positive.exitCode, 0)
          assert.notEqual(compiler.negative.exitCode, 0)
          assert.match(compiler.negative.diagnostics, /TS2322|TS2345/)
          const property = events.find(({ data }) => data.name === 'O1 ordered trace property').data.contractEvidence
          assert.equal(property.numRuns, 40)
          assert.equal(property.seed, 42)
          assert.equal(property.failed, false)
          assert.ok(property.sourceSha256)
        }
      }
    }
    ok(run('oracle-run.mjs', 'transition', '--dir', directory, '--to', 'IMPLEMENTED_GREEN', '--run', greenRun, '--evidence', join(directory, 'evidence.json')))
    const decision = join(directory, 'implementation-decision.md')
    writeFileSync(decision, 'Synthetic packet fixture: preserve the approved O1 boundary.\n')
    const reviewPath = join(directory, 'review-packet.json')
    ok(run('oracle-run.mjs', 'review-packet', '--dir', directory, '--output', reviewPath, '--decision', decision, ...['changeability.md', 'review-checklist.md', 'subagent-review.md'].flatMap((point) => ['--review-point', new URL(`../references/${point}`, scripts).pathname])))
    const review = JSON.parse(readFileSync(reviewPath, 'utf8'))
    assert.equal(review.verificationProfile, 'contract/v1')
    assert.equal(review.controller, 'frontend-contract-design')
    assert.ok(review.references.some(({ id }) => id === 'role-review'))
    assert.equal(review.references.some(({ id, path }) => /^role-(?:controller|reporting)/.test(id) || /-formal\.md$|mandatory-verification|bend-cross/.test(path)), false)
    const findingsPath = join(directory, 'findings.json')
    const findings = { schemaVersion: 2, reviewerRole: 'code-reviewer', reviewerId: 'synthetic-reviewer', verificationProfile: 'contract/v1', controller: 'frontend-contract-design',
      changeabilityReview: ['Readability', 'Predictability', 'Cohesion', 'Coupling', 'Simplicity'].map((axis) => ({ axis, status: 'PASS', evidence: 'Synthetic transport fixture only, not independent judgment' })), findings: [] }
    const receipt = () => run('oracle-run.mjs', 'review-receipt', '--dir', directory, '--packet', reviewPath, '--findings', findingsPath, '--revision', review.targetRevision, '--role', findings.reviewerRole, '--reviewer', findings.reviewerId, '--task-id', 'synthetic-review-task')
    const reviewState = readFileSync(join(directory, 'run-state.json'))
    const reviewLedger = readFileSync(join(directory, 'runs.jsonl'))
    for (const references of [undefined, review.references.map((entry, index) => index === 0 ? { ...entry, sha256: '0'.repeat(64) } : entry)]) {
      writeFileSync(reviewPath, JSON.stringify({ ...review, references }))
      writeFileSync(findingsPath, JSON.stringify(findings))
      const rejected = receipt()
      assert.equal(rejected.status, 1)
      assert.match(rejected.stderr, /REVIEW_PACKET_STALE/)
      assert.deepEqual(readFileSync(join(directory, 'run-state.json')), reviewState)
      assert.deepEqual(readFileSync(join(directory, 'runs.jsonl')), reviewLedger)
    }
    for (const target of ['packet', 'findings']) {
      for (const change of [({ verificationProfile: _profile, ...rest }) => rest, (value) => ({ ...value, verificationProfile: 'formal-bend/v1' }), (value) => ({ ...value, controller: 'frontend-oracle-design' })]) {
        writeFileSync(reviewPath, JSON.stringify(target === 'packet' ? change(review) : review))
        writeFileSync(findingsPath, JSON.stringify(target === 'findings' ? change(findings) : findings))
        const rejected = receipt()
        assert.equal(rejected.status, 1)
        assert.match(rejected.stderr, /PROFILE_MISMATCH/)
        assert.deepEqual(readFileSync(join(directory, 'run-state.json')), reviewState)
        assert.deepEqual(readFileSync(join(directory, 'runs.jsonl')), reviewLedger)
      }
    }
    writeFileSync(reviewPath, JSON.stringify(review))
    writeFileSync(findingsPath, JSON.stringify(findings))
    ok(receipt())
    const accepted = JSON.parse(readFileSync(findingsPath, 'utf8'))
    assert.equal(accepted.orchestrationReceipt.verificationProfile, 'contract/v1')
    assert.equal(accepted.orchestrationReceipt.controller, 'frontend-contract-design')
    const event = JSON.parse(readFileSync(join(directory, 'runs.jsonl'), 'utf8').trim().split('\n').at(-1))
    assert.equal(event.verificationProfile, 'contract/v1')
    assert.equal(event.controller, 'frontend-contract-design')
    const verify = () => run('oracle-verify.mjs', 'review', '--oracle', oracle, '--file', findingsPath, '--packet', reviewPath, '--revision', review.targetRevision, '--map', join(directory, 'evidence.json'), '--ledger', join(directory, 'runs.jsonl'))
    ok(verify())
    for (const change of [({ verificationProfile: _profile, ...rest }) => rest, (value) => ({ ...value, controller: 'frontend-oracle-design' })]) {
      writeFileSync(reviewPath, JSON.stringify(change(review)))
      const rejected = verify()
      assert.equal(rejected.status, 1)
      assert.match(rejected.stderr, /PROFILE_MISMATCH/)
    }


  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('current router supplies eight fresh specialist profile closures through its existing two-argument API', async () => {
  const graph = await loadGraph()
  for (const profile of ['contract/v1', 'formal-bend/v1']) {
    for (const role of ['role-intake', 'role-author', 'role-implement', 'role-review']) {
      const route = routeReferences(graph, { profile, point: 'scope-decision', facts: { architectureBoundaryChange: false, backendBoundaryChange: false, performanceClaim: false }, include: [role] })
      const nodes = [...route.agent, ...route.reviewer, ...route.external]
      const ids = new Set(nodes.map(({ id }) => id))
      assert.ok(ids.has(role), `${profile}/${role}`)
      assert.equal(nodes.some(({ id }) => /^role-(?:controller|reporting)(?:-formal)?$/.test(id)), false)
      for (const node of nodes) {
        assert.ok(readFileSync(new URL(`../skills/frontend-oracle-design/${node.path}`, import.meta.url)).length > 0)
        for (const requirement of node.requires) assert.ok(ids.has(requirement), `${profile}/${role}: missing fresh ${requirement}`)
        if (profile === 'contract/v1') assert.equal(/-formal\.md$|mandatory-verification|bend-cross/.test(node.path), false, node.path)
      }
    }
  }
})

test('worker transport rejects both recursive controllers and preserves exact successful specialist activation', () => {
  const packet = { taskId: 'task', attemptId: 'r-001' }
  const events = ['test', 'frontend-oracle-design:oracle-implement'].flatMap((skill, index) => [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: `s${index}`, name: 'Skill', input: { skill } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: `s${index}`, content: 'Synthetic successful tool result' }] } },
  ])
  const result = { type: 'result', subtype: 'success', session_id: 'synthetic-transport', structured_output: { ...packet, implementationDecision: 'Scoped change', unresolved: [], blockers: [], handoff: 'No judgment claim' } }
  const transcript = (entries) => [...entries, result].map((event) => JSON.stringify(event)).join('\n')
  assert.equal(parseWorkerSubmission(transcript(events), packet).sessionId, 'synthetic-transport')
  for (const controller of ['frontend-oracle-design', 'frontend-contract-design', 'frontend-oracle-design:frontend-oracle-design', 'frontend-oracle-design:frontend-contract-design']) {
    const recursion = { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'recursive', name: 'Skill', input: { skill: controller } }] } }
    assert.throws(() => parseWorkerSubmission(transcript([...events, recursion]), packet), /WORKER_RECURSION_FORBIDDEN/)
  }
})
