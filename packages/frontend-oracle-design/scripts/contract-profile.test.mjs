import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- scoped package tests use node --test.
import test from 'node:test'
import { stableStringify } from '../skills/frontend-oracle-design/scripts/oracle-fs.mjs'
import { fullProductFixture } from '../test-fixtures/full-product/fixture.mjs'

const moduleUrl = new URL('../skills/frontend-oracle-design/scripts/oracle-profile.mjs', import.meta.url)
const verifier = new URL('../skills/frontend-oracle-design/scripts/oracle-verify.mjs', import.meta.url)
const profileSection = '\n## Verification Profile\n\n- Profile: contract/v1\n'

test('Contract public stage and lock bind approved whole card without a package', () => {
  const root = mkdtempSync(join(tmpdir(), 'oracle-contract-stage-'))
  const directory = join(root, '.ai', 'oracles', 'contract')
  const scanRoot = join(root, 'src')
  mkdirSync(directory, { recursive: true })
  mkdirSync(scanRoot)
  const stage = new URL('../skills/frontend-oracle-design/scripts/oracle-stage.mjs', import.meta.url).pathname
  const lock = new URL('../skills/frontend-oracle-design/scripts/oracle-lock.mjs', import.meta.url).pathname
  const fixture = fullProductFixture()
  for (const record of fixture.records) record.scenario.given = { enabled: false }
  const card = `${fixture.render()}${profileSection}`
  const oracle = join(directory, 'oracle.md')
  const manifest = join(directory, 'oracle.lock.json')
  const loader = `data:text/javascript,${encodeURIComponent("export async function resolve(s,c,n){if(/oracle-(package|model|adequacy|discovery)\\.mjs$|ensure-bend\\.mjs$/.test(s))throw Error('FORMAL_IMPORT_DENIED:'+s);return n(s,c)}")}`
  const run = (script, ...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: `--experimental-loader=${loader}` } })
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
  const advance = (to, ...args) => run(stage, 'advance', '--dir', directory, '--to', to, ...args)
  const create = (...args) => run(lock, 'create', '--oracle', oracle, '--lock', manifest, ...args)
  try {
    writeFileSync(oracle, fixture.render())
    const denied = run(verifier.pathname, 'card', '--oracle', oracle)
    assert.notEqual(denied.status, 0)
    assert.match(denied.stderr, /FORMAL_IMPORT_DENIED/)
    writeFileSync(oracle, card.replace('- Status: approved', '- Status: pending'))
    let result = run(stage, 'begin', '--dir', directory, '--profile', 'contract/v1')
    assert.equal(result.status, 0, result.stderr)
    assert.notEqual(advance('DRAFTED').status, 0)
    assert.notEqual(advance('MODELED').status, 0)
    assert.notEqual(advance('CHECKED').status, 0)
    assert.notEqual(create().status, 0)
    writeFileSync(oracle, card)
    assert.notEqual(advance('CHECKED', '--profile', 'formal-bend/v1').status, 0)
    result = advance('CHECKED')
    assert.equal(result.status, 0, result.stderr)
    const checked = JSON.parse(readFileSync(join(directory, 'stage.json'), 'utf8'))
    assert.equal(checked.cardSha256, digest(card))
    assert.equal(checked.verificationProfile, 'contract/v1')
    writeFileSync(oracle, `${card}\n`)
    assert.notEqual(run(stage, 'rewind', '--dir', directory, '--to', 'CHECKED').status, 0)
    assert.notEqual(advance('DRAFTED').status, 0)
    writeFileSync(oracle, card)
    result = advance('DRAFTED')
    assert.equal(result.status, 0, result.stderr)
    assert.notEqual(advance('ORACLE_READY').status, 0)
    result = create('--profile', 'contract/v1')
    assert.equal(result.status, 0, result.stderr)
    const lockedBytes = readFileSync(manifest)
    assert.equal(JSON.parse(lockedBytes).verificationProfile, 'contract/v1')
    assert.equal(JSON.parse(lockedBytes).oracle.sha256, digest(card))
    assert.equal(JSON.parse(readFileSync(join(directory, 'stage.json'), 'utf8')).stage, 'ORACLE_READY')
    result = create()
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(readFileSync(manifest), lockedBytes)
    result = run(lock, 'verify', '--lock', manifest)
    assert.equal(result.status, 0, result.stderr)
    assert.notEqual(create('--profile', 'formal-bend/v1').status, 0)
    const stagePath = join(directory, 'stage.json')
    const stageBytes = readFileSync(stagePath)
    for (const profile of ['formal-bend/v1', null]) {
      const changed = JSON.parse(stageBytes)
      if (profile) changed.verificationProfile = profile
      else delete changed.verificationProfile
      writeFileSync(stagePath, JSON.stringify(changed))
      assert.notEqual(create().status, 0)
      assert.notEqual(run(lock, 'verify', '--lock', manifest).status, 0)
      assert.deepEqual(readFileSync(manifest), lockedBytes)
    }
    writeFileSync(stagePath, stageBytes)
    const removed = JSON.parse(lockedBytes)
    delete removed.verificationProfile
    writeFileSync(manifest, JSON.stringify(removed))
    assert.notEqual(create().status, 0)
    assert.notEqual(run(lock, 'verify', '--lock', manifest).status, 0)
    writeFileSync(manifest, lockedBytes)
    const runtime = new URL('../skills/frontend-oracle-design/scripts/oracle-run.mjs', import.meta.url).pathname
    const missingLabel = run(runtime, 'init', '--dir', directory, '--lock', manifest, '--scan-root', scanRoot, '--required-label', 'ordinary:reported')
    assert.notEqual(missingLabel.status, 0)
    assert.match(missingLabel.stderr, /CONTRACT_CASES_LABEL_REQUIRED/)
    assert.deepEqual(readFileSync(manifest), lockedBytes)
    const init = (...labels) => run(runtime, 'init', '--dir', directory, '--lock', manifest, '--scan-root', scanRoot, ...labels.flatMap((label) => ['--required-label', label]))
    const missingType = init('contract-cases:reported')
    assert.notEqual(missingType.status, 0)
    assert.match(missingType.stderr, /TYPE_CONTRACT_LABEL_REQUIRED/)
    const missingTemporal = init('contract-cases:reported', 'type-contract:reported')
    assert.notEqual(missingTemporal.status, 0)
    assert.match(missingTemporal.stderr, /FAST_CHECK_LABEL_REQUIRED/)
    assert.equal(existsSync(join(directory, 'run-state.json')), false)
    assert.equal(existsSync(join(directory, 'runs.jsonl')), false)
    assert.deepEqual(readFileSync(manifest), lockedBytes)
    result = init('contract-cases:reported', 'type-contract:reported', 'fast-check:reported')
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /RUN_STATE_INITIALIZED/)
    const statePath = join(directory, 'run-state.json')
    const ledgerPath = join(directory, 'runs.jsonl')
    const stateBytes = readFileSync(statePath)
    const ledgerBytes = readFileSync(ledgerPath)
    assert.equal(JSON.parse(stateBytes).verificationProfile, 'contract/v1')
    assert.equal(run(runtime, 'status', '--dir', directory, '--json').status, 0)
    for (const profile of ['formal-bend/v1', 'contract/v2', null]) {
      const changed = JSON.parse(stateBytes)
      if (profile) changed.verificationProfile = profile
      else delete changed.verificationProfile
      writeFileSync(statePath, JSON.stringify(changed))
      const rejected = run(runtime, 'status', '--dir', directory, '--json')
      assert.notEqual(rejected.status, 0)
      assert.match(rejected.stderr, /PROFILE_(MISMATCH|UNKNOWN)/)
      assert.deepEqual(readFileSync(manifest), lockedBytes)
      assert.deepEqual(readFileSync(ledgerPath), ledgerBytes)
    }
    writeFileSync(statePath, stateBytes)
    for (const artifact of ['card', 'lock']) {
      for (const profile of ['formal-bend/v1', null]) {
        if (artifact === 'card') writeFileSync(oracle, profile ? card.replace('contract/v1', profile) : card.replace(profileSection, ''))
        else {
          const changed = JSON.parse(lockedBytes)
          if (profile) changed.verificationProfile = profile
          else delete changed.verificationProfile
          writeFileSync(manifest, JSON.stringify(changed))
        }
        const rejected = run(runtime, 'status', '--dir', directory, '--json')
        assert.notEqual(rejected.status, 0)
        assert.match(rejected.stderr, /PROFILE_MISMATCH/)
        assert.deepEqual(readFileSync(statePath), stateBytes)
        assert.deepEqual(readFileSync(ledgerPath), ledgerBytes)
        writeFileSync(oracle, card)
        writeFileSync(manifest, lockedBytes)
      }
    }
    assert.equal(run(runtime, 'status', '--dir', directory, '--json').status, 0)
    assert.deepEqual(readFileSync(ledgerPath), ledgerBytes)
    const paused = run(runtime, 'transition', '--dir', directory, '--to', 'NEEDS_DECISION', '--reason', 'isolated replay fixture')
    assert.equal(paused.status, 0, paused.stderr)
    const entries = readFileSync(ledgerPath, 'utf8').trimEnd().split('\n').map((line) => JSON.parse(line))
    const transition = entries.at(-1)
    assert.equal(transition.type, 'transition')
    transition.stateDelta.verificationProfile = 'formal-bend/v1'
    const { digest: _digest, ...unsigned } = transition
    transition.digest = digest(stableStringify(unsigned))
    const tamperedLedger = `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`
    writeFileSync(ledgerPath, tamperedLedger)
    writeFileSync(statePath, stateBytes)
    const replayRejected = run(runtime, 'status', '--dir', directory, '--json')
    assert.notEqual(replayRejected.status, 0)
    assert.match(replayRejected.stderr, /PROFILE_MISMATCH/)
    assert.equal(readFileSync(ledgerPath, 'utf8'), tamperedLedger)
    assert.deepEqual(readFileSync(manifest), lockedBytes)
    assert.deepEqual(readFileSync(statePath), stateBytes)
    writeFileSync(ledgerPath, ledgerBytes)
    writeFileSync(oracle, card.replace('- Source:', '- Changed Source:'))
    assert.notEqual(create().status, 0)
    assert.deepEqual(readFileSync(manifest), lockedBytes)
    writeFileSync(oracle, card.replace(profileSection, ''))
    assert.notEqual(create().status, 0)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('Contract public init requires approved investigated type N/A and Async reporting', () => {
  const root = mkdtempSync(join(tmpdir(), 'oracle-contract-applicability-'))
  const scripts = new URL('../skills/frontend-oracle-design/scripts/', import.meta.url)
  const loader = `data:text/javascript,${encodeURIComponent("export async function resolve(s,c,n){if(/oracle-(package|model|adequacy|discovery)\\.mjs$|ensure-bend\\.mjs$/.test(s))throw Error('FORMAL_IMPORT_DENIED:'+s);return n(s,c)}")}`
  const run = (name, ...args) => spawnSync(process.execPath, [new URL(name, scripts).pathname, ...args], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: `--experimental-loader=${loader}` } })
  try {
    for (const mode of ['investigated', 'uninvestigated', 'unknown-source', 'investigated-em-dash', 'investigated-en-dash', 'investigated-dash', 'investigated-whitespace', 'investigated-tbd', 'reason-tbd', 'reason-dash', 'reason-whitespace', 'async']) {
      const repository = join(root, mode)
      const directory = join(repository, '.ai', 'oracles', 'contract')
      const scanRoot = join(repository, 'src')
      mkdirSync(directory, { recursive: true })
      mkdirSync(scanRoot)
      writeFileSync(join(scanRoot, 'toggle.mjs'), 'export const enabled = false\n')
      const fixture = fullProductFixture()
      for (const record of fixture.records) record.scenario.given = { enabled: false }
      const reason = { 'reason-tbd': 'TBD', 'reason-dash': '—', 'reason-whitespace': '   ' }[mode] ?? 'inspected private JavaScript fixture has no public type boundary.'
      const investigation = { 'investigated-em-dash': ' — ', 'investigated-en-dash': ' – ', 'investigated-dash': ' - ', 'investigated-whitespace': '   ', 'investigated-tbd': ' tBd ' }[mode] ?? 'src/toggle.mjs'
      let card = `${fixture.render()}${profileSection}\n## Type Contract\n\n- Not applicable: ${reason} (source: ${mode === 'unknown-source' ? 'S999' : 'S1'})\n`
      if (mode !== 'uninvestigated') card += `- Investigated: ${investigation}\n`
      if (mode === 'async') card = card.replace('| Async | — | excluded: lifecycle is in ordered events S1 |', '| Order | — | excluded: lifecycle covered by Async fixture S1 |').replace('| Order | ordering |', '| Async | ordering |')
      const oracle = join(directory, 'oracle.md')
      const lock = join(directory, 'oracle.lock.json')
      writeFileSync(oracle, card)
      for (const args of [['begin', '--profile', 'contract/v1'], ['advance', '--to', 'CHECKED'], ['advance', '--to', 'DRAFTED']]) {
        const result = run('oracle-stage.mjs', ...args, '--dir', directory)
        assert.equal(result.status, 0, `${mode}: ${result.stderr}`)
      }
      const locked = run('oracle-lock.mjs', 'create', '--oracle', oracle, '--lock', lock)
      assert.equal(locked.status, 0, `${mode}: ${locked.stderr}`)
      const lockBytes = readFileSync(lock)
      const init = (...labels) => run('oracle-run.mjs', 'init', '--dir', directory, '--lock', lock, '--scan-root', scanRoot, ...labels.flatMap((label) => ['--required-label', label]))
      const labels = ['contract-cases:reported', 'fast-check:reported']
      if (!['investigated', 'async'].includes(mode)) {
        const rejected = init(...labels)
        assert.notEqual(rejected.status, 0)
        assert.match(rejected.stderr, /\bTYPE_CONTRACT_LABEL_REQUIRED\b/)
        assert.equal(existsSync(join(directory, 'run-state.json')), false)
        assert.equal(existsSync(join(directory, 'runs.jsonl')), false)
        assert.deepEqual(readFileSync(lock), lockBytes)
        labels.push('type-contract:reported')
      }
      if (mode === 'async') {
        const rejected = init('contract-cases:reported')
        assert.notEqual(rejected.status, 0)
        assert.match(rejected.stderr, /FAST_CHECK_LABEL_REQUIRED/)
      }
      const initialized = init(...labels)
      assert.equal(initialized.status, 0, `${mode}: ${initialized.stderr}`)
      assert.equal(JSON.parse(readFileSync(join(directory, 'run-state.json'))).verificationProfile, 'contract/v1')
      assert.deepEqual(readFileSync(lock), lockBytes)
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})

async function profiles() { return import(moduleUrl) }
function lint(card, ...args) {
  const directory = mkdtempSync(join(tmpdir(), 'oracle-profile-'))
  try {
    const path = join(directory, 'oracle.md')
    writeFileSync(path, card)
    return spawnSync(process.execPath, [verifier.pathname, 'card', '--oracle', path, ...args], { encoding: 'utf8' })
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

test('closed controller mapping accepts only exact bare and plugin-qualified controllers', async () => {
  const { profileForController } = await profiles()
  for (const [controller, profile] of [['frontend-contract-design', 'contract/v1'], ['frontend-oracle-design', 'formal-bend/v1']]) {
    for (const name of [controller, `frontend-oracle-design:${controller}`]) assert.equal(profileForController(name), profile)
  }
  for (const name of ['other:frontend-contract-design', 'oracle-author', 'contract/v1', ' frontend-contract-design', 'frontend-contract-design:frontend-contract-design']) {
    assert.throws(() => profileForController(name), { code: 'PROFILE_CONTROLLER_UNKNOWN' })
  }
})

test('card profiles are closed, unique and ignore fenced decoys', async () => {
  const { readCardProfile } = await profiles()
  assert.equal(readCardProfile('# Legacy'), null)
  assert.equal(readCardProfile(profileSection), 'contract/v1')
  assert.equal(readCardProfile(profileSection.replace('contract/v1', 'formal-bend/v1')), 'formal-bend/v1')
  assert.equal(readCardProfile(`\`\`\`md\n${profileSection}\n\`\`\`\n`), null)
  for (const text of [profileSection.repeat(2), `${profileSection}- Profile: contract/v1\n`]) assert.throws(() => readCardProfile(text), { code: 'PROFILE_DUPLICATE' })
  for (const value of ['legacy', 'contract/v2', 'other:contract/v1', '']) assert.throws(() => readCardProfile(profileSection.replace('contract/v1', value)), { code: 'PROFILE_UNKNOWN' })
  assert.throws(() => readCardProfile('## Verification Profile\n'), { code: 'PROFILE_REQUIRED' })
})

test('binding permits request-only begin and actual legacy, never mixed authorization', async () => {
  const { resolveProfileBinding } = await profiles()
  assert.throws(() => resolveProfileBinding({ bindings: [] }), { code: 'PROFILE_REQUIRED' })
  assert.deepEqual(resolveProfileBinding({ bindings: [{ artifact: 'lock', profile: null }] }), { kind: 'legacy', profile: null, controller: null })
  for (const [profile, controller] of [['contract/v1', 'frontend-contract-design'], ['formal-bend/v1', 'frontend-oracle-design']]) {
    const expected = { kind: 'explicit', profile, controller }
    assert.deepEqual(resolveProfileBinding({ requestedProfile: profile, bindings: [] }), expected)
    assert.deepEqual(resolveProfileBinding({ bindings: [{ artifact: 'card', profile }, { artifact: 'lock', profile }] }), expected)
    for (const other of [null, undefined, profile === 'contract/v1' ? 'formal-bend/v1' : 'contract/v1']) {
      assert.throws(() => resolveProfileBinding({ requestedProfile: profile, bindings: [{ artifact: 'lock', profile: other }] }), { code: 'PROFILE_MISMATCH' })
      assert.throws(() => resolveProfileBinding({ bindings: [{ artifact: 'card', profile }, { artifact: 'lock', profile: other }] }), { code: 'PROFILE_MISMATCH' })
    }
  }
  for (const value of ['legacy', 'contract/v2', 'other:contract/v1', '', 0, false, null, { toString: () => 'contract/v1' }]) assert.throws(() => resolveProfileBinding({ requestedProfile: value, bindings: [] }), { code: 'PROFILE_UNKNOWN' })
  assert.throws(() => resolveProfileBinding({ bindings: [{ artifact: 'card', profile: 'contract/v2' }] }), { code: 'PROFILE_UNKNOWN' })
})

test('Contract rejects projection remnants and excessive or empty declared products', () => {
  const fixture = fullProductFixture()
  const card = `${fixture.render()}${profileSection}`
  for (const marker of ['<!-- oracle:generated:begin -->', '<!-- oracle:generated:end -->']) {
    const result = lint(`${card}\n${marker}\n`, '--case-space')
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /CONTRACT_FORMAL_FORBIDDEN/)
  }
  const empty = lint(card.replace('next, previous', ''), '--case-space')
  assert.notEqual(empty.status, 0)
  const values = Array.from({ length: 50 }, (_, index) => `value-${index}`).join(', ')
  const oversized = lint(card.replace('next, previous', values).replace('single, duplicate, late', values).replace('fresh, prior', values), '--case-space')
  assert.notEqual(oversized.status, 0)
  assert.match(oversized.stderr, /125000 tuples; limit is 100000/)
})

test('explicit Contract CLI uses generic given without waiving source, revisions or unresolved cells', () => {
  const fixture = fullProductFixture()
  for (const record of fixture.records) record.scenario.given = { enabled: false }
  const card = `${fixture.render()}${profileSection}`
  const valid = lint(card, '--case-space')
  assert.equal(valid.status, 0, valid.stderr)
  assert.equal(JSON.parse(valid.stdout).ready, true)
  const full = lint(card)
  assert.equal(full.status, 0, full.stderr)
  for (const invalid of [
    card.replace('| approved |', '| pending |'),
    card.replace('- Status: approved', '- Status: pending'),
    card.replace('| exact tuple and ordered trace in one reporter case |', '| TBD |'),
  ]) assert.notEqual(lint(invalid).status, 0, 'full card authority and approval gates remain required')
  for (const invalid of [
    card.replaceAll('"sources":["S1"]', '"sources":["S999"]'),
    card.replace('- Dimension revision:', '- Old dimension revision:'),
    card.replace('covered(O1)', 'needs-decision: Q1 choose expectation'),
    `${card}\n## Formal Model\n\n- N/A\n`,
    `${card}\n<!-- oracle-generated:start -->\n`,
    card.replace('Coverage: full-product', 'Coverage: t-way'),
    card.replace('contract/v1', 'contract/v2'),
  ]) assert.notEqual(lint(invalid, '--case-space').status, 0)
  assert.notEqual(lint(fixture.render(), '--case-space').status, 0, 'legacy must retain list schema')
})
