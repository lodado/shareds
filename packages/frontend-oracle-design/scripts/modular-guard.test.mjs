import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- plugin contracts run through node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { fullProductFixture } from '../test-fixtures/full-product/fixture.mjs'

const pluginDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const nestedScript = join(pluginDirectory, 'skills/frontend-oracle-design/scripts/oracle-guard-hook.mjs')
// Exercise the same public hook before and after the structural relocation.
const script = existsSync(nestedScript) ? nestedScript : join(pluginDirectory, 'skills/scripts/oracle-guard-hook.mjs')
const controllers = ['frontend-oracle-design', 'frontend-contract-design']
const specialists = ['oracle-intake', 'oracle-author', 'oracle-implement', 'oracle-review']
const roles = [...controllers, ...specialists]
test('six exact skill names retain all 24 activation combinations', () => {
  assert.equal(roles.length * 2 * 2, 24)
})

async function runWrite(t, skill, via, entryType) {
  const root = await mkdtemp(join(tmpdir(), 'oracle-role-guard-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const transcriptPath = join(root, 'session.jsonl')
  const entry = via === 'slash'
    ? { type: entryType ?? 'user', message: { content: `<command-name>/${skill}</command-name>` } }
    : { type: entryType ?? 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] } }
  await writeFile(transcriptPath, `${JSON.stringify({ ...entry, timestamp: '2026-10-04T12:00:00.000Z' })}\n`)
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd: root,
      transcript_path: transcriptPath,
      tool_name: 'Write',
      tool_input: { file_path: join(root, 'src/save.test.ts'), content: 'test("save", () => {})' },
    }),
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, '', 'the tested payload must be judgeable, not a fail-open diagnostic')
  return result.stdout.trim() ? JSON.parse(result.stdout).hookSpecificOutput : null
}

for (const role of roles) {
  for (const via of ['tool', 'slash']) {
    for (const name of [role, `frontend-oracle-design:${role}`]) {
      test(`${via} activation of ${name} preserves the pre-lock test gate`, async (t) => {
        const decision = await runWrite(t, name, via)
        assert.equal(decision?.permissionDecision, 'deny', 'a specialist must not bypass TEST_BEFORE_LOCK')
        assert.match(decision.permissionDecisionReason, /^TEST_BEFORE_LOCK:/)
      })
    }
  }
}

for (const name of ['frontend-oracle-designer', 'frontend-oracle-design-notes', 'oracle-authoring', 'other:oracle-author']) {
  for (const via of ['tool', 'slash']) {
    test(`${via} activation of unrelated ${name} does not activate Oracle`, async (t) => {
      assert.equal(await runWrite(t, name, via), null)
    })
  }
}

test('a tool result quoting a specialist slash command does not activate Oracle', async (t) => {
  assert.equal(await runWrite(t, 'oracle-author', 'slash', 'tool'), null)
})

const activationEntry = (skill) => ({ type: 'assistant', timestamp: '2026-10-04T12:00:00.000Z', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] } })

async function contextFixture(t, profile = 'contract/v1') {
  const root = await mkdtemp(join(tmpdir(), 'oracle-profile-guard-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, '.ai/oracles/contract')
  await mkdir(directory, { recursive: true })
  const fixture = fullProductFixture()
  if (profile === 'contract/v1') for (const record of fixture.records) record.scenario.given = { enabled: false }
  const card = `${fixture.render()}\n## Verification Profile\n\n- Profile: ${profile}\n`
  const oracle = join(directory, 'oracle.md')
  const lock = join(directory, 'oracle.lock.json')
  await writeFile(oracle, card)
  const cli = (name, ...args) => {
    const result = spawnSync(process.execPath, [join(dirname(script), name), ...args], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  if (profile === 'contract/v1') {
    cli('oracle-stage.mjs', 'begin', '--dir', directory, '--profile', profile)
    for (const to of ['CHECKED', 'DRAFTED']) cli('oracle-stage.mjs', 'advance', '--dir', directory, '--to', to)
  } else {
    // Prepared stage fixture exercises the lock/guard boundary, not execution of Formal proof.
    const bytes = '{}\n'
    await writeFile(join(directory, 'oracle.package.json'), bytes)
    await writeFile(join(directory, 'stage.json'), JSON.stringify({ schemaVersion: 1, stage: 'DRAFTED', verificationProfile: profile,
      packageSha256: createHash('sha256').update(bytes).digest('hex'), history: [] }))
  }
  cli('oracle-lock.mjs', 'create', '--oracle', oracle, '--lock', lock)
  const ledger = join(directory, 'runs.jsonl')
  await writeFile(ledger, '')
  const check = async (skills, file = 'src/save.test.ts', options = {}) => {
    const transcript = join(root, 'session.jsonl')
    await writeFile(transcript, `${skills.map((skill) => JSON.stringify(activationEntry(skill))).join('\n')}\n`)
    const result = spawnSync(process.execPath, [script], { ...options, encoding: 'utf8', input: JSON.stringify({
      hook_event_name: 'PreToolUse', cwd: root, transcript_path: transcript,
      tool_name: 'Write', tool_input: { file_path: join(root, file), content: 'test("save", () => {})' },
    }) })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stderr, '')
    return result.stdout.trim() ? JSON.parse(result.stdout).hookSpecificOutput : null
  }
  return { directory, oracle, lock, ledger, card, check }
}

test('prepared Formal context lock admits only its fixed Formal controller, never Contract', async (t) => {
  const fixture = await contextFixture(t, 'formal-bend/v1')
  const bytes = await readFile(fixture.lock)
  for (const skill of ['frontend-oracle-design', 'frontend-oracle-design:frontend-oracle-design', ...specialists]) assert.equal(await fixture.check([skill]), null, skill)
  for (const skill of ['frontend-contract-design', 'frontend-oracle-design:frontend-contract-design']) assert.equal((await fixture.check([skill]))?.permissionDecision, 'deny', skill)
  assert.deepEqual(await readFile(fixture.lock), bytes)
  assert.equal(await readFile(fixture.ledger, 'utf8'), '')
})

test('real approved Contract card/stage/lock resolves shared roles without selecting or falling back', async (t) => {
  const fixture = await contextFixture(t)
  const locked = await readFile(fixture.lock)
  for (const skill of ['frontend-contract-design', 'frontend-oracle-design:frontend-contract-design', ...specialists]) {
    assert.equal(await fixture.check([skill]), null, skill)
  }
  const formal = await fixture.check(['frontend-oracle-design'])
  assert.equal(formal?.permissionDecision, 'deny')
  assert.match(formal.permissionDecisionReason, /frontend-oracle-design profile/)
  assert.equal((await fixture.check(controllers))?.permissionDecision, 'deny')
  assert.deepEqual(await readFile(fixture.lock), locked)
  assert.equal(await readFile(fixture.ledger, 'utf8'), '')
})

test('profile mismatch/removal, changed approved bytes and legacy artifacts never become Contract authority', async (t) => {
  const fixture = await contextFixture(t)
  const stagePath = join(fixture.directory, 'stage.json')
  const originals = new Map(await Promise.all([fixture.oracle, fixture.lock, stagePath].map(async (path) => [path, await readFile(path, 'utf8')])))
  const mutations = [
    [fixture.oracle, fixture.card.replace('contract/v1', 'formal-bend/v1')],
    [fixture.oracle, fixture.card.replace(/\n## Verification Profile[\s\S]*$/, '')],
    [fixture.oracle, `${fixture.card}\nchanged approved bytes\n`],
    ...[fixture.lock, stagePath].flatMap((path) => ['formal-bend/v1', null].map((profile) => {
      const record = JSON.parse(originals.get(path))
      if (profile) record.verificationProfile = profile
      else delete record.verificationProfile
      return [path, JSON.stringify(record)]
    })),
  ]
  for (const [path, bytes] of mutations) {
    await writeFile(path, bytes)
    const beforeLock = await readFile(fixture.lock)
    for (const skill of ['frontend-contract-design', 'oracle-author']) assert.equal((await fixture.check([skill]))?.permissionDecision, 'deny', `${path}: ${skill}`)
    assert.deepEqual(await readFile(fixture.lock), beforeLock)
    assert.equal(await readFile(fixture.ledger, 'utf8'), '')
    await writeFile(path, originals.get(path))
  }
  await writeFile(fixture.oracle, '# Legacy\n')
  await writeFile(fixture.lock, '{}\n')
  await writeFile(stagePath, '{}\n')
  for (const skill of ['frontend-contract-design', ...specialists]) assert.equal((await fixture.check([skill]))?.permissionDecision, 'deny')
})

test('Contract hook verifies the real approved lock with Formal loaders denied', async (t) => {
  const fixture = await contextFixture(t)
  const loader = `data:text/javascript,${encodeURIComponent("export async function resolve(s,c,n){if(/oracle-(package|model|adequacy|discovery)\\.mjs$|ensure-bend\\.mjs$/.test(s))throw Error('FORMAL_IMPORT_DENIED:'+s);return n(s,c)}")}`
  const env = { ...process.env, NODE_OPTIONS: `--experimental-loader=${loader} --disable-warning=ExperimentalWarning` }
  assert.equal(await fixture.check(['frontend-contract-design'], 'src/save.test.ts', { env }), null)
})

test('profile-bound production writes retain RED prerequisites and reject state removal/mismatch without ledger changes', async (t) => {
  const fixture = await contextFixture(t)
  const statePath = join(fixture.directory, 'run-state.json')
  const record = { state: 'ORACLE_READY', scanRoot: '../../../src', verificationProfile: 'contract/v1' }
  await writeFile(statePath, JSON.stringify(record))
  assert.match((await fixture.check(['frontend-contract-design'], 'src/save.ts')).permissionDecisionReason, /^PRODUCTION_TOUCHED_BEFORE_RED:/)
  assert.equal((await fixture.check(['frontend-oracle-design'], 'src/save.ts'))?.permissionDecision, 'deny')
  for (const profile of ['formal-bend/v1', null]) {
    const changed = { ...record, state: 'VALID_RED' }
    if (profile) changed.verificationProfile = profile
    else delete changed.verificationProfile
    await writeFile(statePath, JSON.stringify(changed))
    const lockBytes = await readFile(fixture.lock)
    assert.match((await fixture.check(['frontend-contract-design'], 'src/save.ts')).permissionDecisionReason, /^PROFILE_LOCK_REQUIRED:/)
    assert.equal(await readFile(fixture.ledger, 'utf8'), '')
    assert.deepEqual(await readFile(fixture.lock), lockBytes)
  }
})

test('shared prelock context guides the resolved Contract controller while keeping tests blocked', async (t) => {
  const fixture = await contextFixture(t)
  await rm(fixture.lock)
  const decision = await fixture.check(['oracle-author'])
  assert.equal(decision.permissionDecision, 'deny')
  assert.match(decision.permissionDecisionReason, /frontend-contract-design profile, whole card and Space/)
  assert.doesNotMatch(decision.permissionDecisionReason, /Bend|package/)
  assert.equal(await readFile(fixture.ledger, 'utf8'), '')
})

test('Contract prelock guidance needs its card and Space, never a Bend package', async (t) => {
  const decision = await runWrite(t, 'frontend-contract-design', 'tool')
  assert.match(decision.permissionDecisionReason, /frontend-contract-design profile, whole card and Space/)
  assert.doesNotMatch(decision.permissionDecisionReason, /Bend|package/)
  const unresolved = await runWrite(t, 'oracle-author', 'tool')
  assert.match(unresolved.permissionDecisionReason, /controller profile first/)
})
