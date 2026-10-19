import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { sha256 } from './oracle-fs.mjs'
import { assertReadyToLock, markLocked, readStage } from './oracle-stage.mjs'
import { installedBend } from './oracle-test-bend.mjs'

const FIXTURE = fileURLToPath(new URL('../../../test-fixtures/stale-search/', import.meta.url))
const PAGINATION = fileURLToPath(new URL('../../../test-fixtures/pagination/', import.meta.url))
const SCRIPTS = fileURLToPath(new URL('.', import.meta.url))
const { NODE_TEST_CONTEXT: _parent, ...CHILD_ENV } = process.env
const node = (cwd, script, args) =>
  spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd, encoding: 'utf8', env: CHILD_ENV })

/** 패키지 경로의 오라클: 저장소 루트에 Bend 파일, `.ai/oracles/stale-search/`에 패키지(카드는 project-card가 만든다). */
async function repository(t) {
  const root = await mkdtemp(join(tmpdir(), 'oracle-stage-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await cp(FIXTURE, root, { recursive: true })
  const directory = join(root, '.ai', 'oracles', 'stale-search')
  await mkdir(directory, { recursive: true })
  await cp(join(FIXTURE, 'oracle.package.json'), join(directory, 'oracle.package.json'))
  return { root, directory }
}

const stage = (root, directory, command, to) =>
  node(root, 'oracle-stage.mjs', [command, '--dir', directory, ...(to ? ['--to', to] : []), ...(command === 'rewind' ? ['--reason', 'gate-failure'] : [])])
const lock = (root, directory) =>
  node(root, 'oracle-lock.mjs', ['create', '--oracle', join(directory, 'oracle.md'), '--lock', join(directory, 'oracle.lock.json')])

test('authoring iterations stop a third repair and a restart cannot reset the shared budget', async (t) => {
  const { root, directory } = await repository(t)
  assert.equal(stage(root, directory, 'begin').status, 0)
  assert.equal(stage(root, directory, 'advance', 'MODELED').status, 0)
  assert.equal(stage(root, directory, 'rewind', 'DISCOVERING').status, 0)
  // A retried delivery of the same rewind is not another repair.
  assert.equal(stage(root, directory, 'rewind', 'DISCOVERING').status, 0)
  assert.equal(stage(root, directory, 'advance', 'MODELED').status, 0)
  const before = await readFile(join(directory, 'stage.json'))
  const third = stage(root, directory, 'rewind', 'DISCOVERING')
  assert.equal(third.status, 1, 'a third authoring cycle must not start automatically')
  assert.match(third.stderr, /^ITERATION_BUDGET_EXHAUSTED:/)
  assert.deepEqual(await readFile(join(directory, 'stage.json')), before)
  assert.match(stage(root, directory, 'begin').stderr, /^STAGE_EXISTS:/)
  const current = JSON.parse(stage(root, directory, 'status').stdout)
  assert.equal(current.iterations.round, 2)
  assert.equal(current.iterations.limit, 2)
  assert.equal(current.iterations.mode, 'confirm-fixes')
})

test('a rewind names why it walks back, so repeated causes across runs can be counted', async (t) => {
  const { root, directory } = await repository(t)
  const rewind = (...extra) => node(root, 'oracle-stage.mjs', ['rewind', '--dir', directory, '--to', 'DISCOVERING', ...extra])
  assert.equal(stage(root, directory, 'begin').status, 0)
  assert.equal(stage(root, directory, 'advance', 'MODELED').status, 0)
  const before = await readFile(join(directory, 'stage.json'))

  const unexplained = rewind()
  assert.equal(unexplained.status, 2)
  assert.match(unexplained.stderr, /^USAGE: rewind requires --reason review-finding\|gate-failure\|user-answer\|source-change/)
  assert.equal(rewind('--reason', 'tired').status, 2)
  assert.equal(rewind('--reason', 'review-finding', '--note', 'two\nlines').status, 2)
  assert.deepEqual(await readFile(join(directory, 'stage.json')), before, 'a refused rewind spends no round')

  const walked = rewind('--reason', 'review-finding', '--note', 'cold-read: retry after expiry is unmodeled')
  assert.equal(walked.status, 0)
  assert.equal(JSON.parse(walked.stdout).reason, 'review-finding')
  const entry = (await readStage(directory)).history.at(-1)
  assert.equal(entry.evidence, 'rewind')
  assert.equal(entry.reason, 'review-finding')
  assert.equal(entry.note, 'cold-read: retry after expiry is unmodeled')

  // a retried rewind is the same walk back: it keeps the first reason and says so instead of dropping the new one silently
  const retried = rewind('--reason', 'user-answer')
  assert.equal(retried.status, 0)
  assert.equal(JSON.parse(retried.stdout).reason, 'review-finding')
  assert.equal((await readStage(directory)).history.filter((step) => step.evidence === 'rewind').length, 1)
})

test('analyst, mapping, card review and rewind share one repair round instead of multiplying their allowances', async (t) => {
  const { root, directory } = await repository(t)
  assert.equal(stage(root, directory, 'begin').status, 0)
  const input = join(root, 'review-input.md')
  const review = (kind) => node(root, 'oracle-stage.mjs', ['review-input', '--dir', directory, '--kind', kind, '--input', input])
  await writeFile(input, 'approved source v1\n')
  for (const kind of ['model-analyst', 'translation', 'cold-read']) assert.equal(review(kind).status, 0)
  assert.equal(stage(root, directory, 'advance', 'MODELED').status, 0)
  await writeFile(input, 'approved source v2\n')
  for (const kind of ['model-analyst', 'translation', 'cold-read']) {
    const repair = review(kind)
    assert.equal(repair.status, 0, repair.stderr)
    assert.equal(JSON.parse(repair.stdout).iterations.round, 2)
    assert.equal(JSON.parse(repair.stdout).iterations.mode, 'confirm-fixes')
  }
  assert.equal(stage(root, directory, 'rewind', 'DISCOVERING').status, 0)
  assert.equal(stage(root, directory, 'advance', 'MODELED').status, 0)
  await writeFile(input, 'another newly discovered possibility\n')
  const before = await readFile(join(directory, 'stage.json'))
  const rejected = review('translation')
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /^ITERATION_BUDGET_EXHAUSTED:/)
  assert.deepEqual(await readFile(join(directory, 'stage.json')), before)
  assert.equal(JSON.parse(stage(root, directory, 'status').stdout).stage, 'MODELED')
})

test('legacy rewind history is counted on upgrade, never silently reset or rewritten by status', async (t) => {
  const { root, directory } = await repository(t)
  const record = { schemaVersion: 1, stage: 'DISCOVERING', packageSha256: null,
    history: [{ stage: 'DISCOVERING', packageSha256: null, evidence: 'begin' },
      ...Array.from({ length: 8 }, () => ({ stage: 'DISCOVERING', packageSha256: null, evidence: 'rewind' }))] }
  const path = join(directory, 'stage.json')
  const bytes = `${JSON.stringify(record)}\n`
  await writeFile(path, bytes)
  const observed = stage(root, directory, 'status')
  assert.equal(observed.status, 0, observed.stderr)
  assert.equal(JSON.parse(observed.stdout).iterations.round, 9)
  assert.equal(JSON.parse(observed.stdout).iterations.exhausted, true)
  assert.equal(await readFile(path, 'utf8'), bytes)
  const refused = stage(root, directory, 'advance', 'MODELED')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /^ITERATION_BUDGET_EXHAUSTED:/)
  assert.equal(await readFile(path, 'utf8'), bytes)
})

test('public model-input uses the same budget and refuses before overwriting output on the third source revision', async (t) => {
  const { root, directory } = await repository(t)
  const output = join(root, 'analyst.md')
  const invoke = () => node(root, 'oracle-adequacy.mjs', ['model-input', '--package', join(directory, 'oracle.package.json'), '--output', output])
  const first = invoke()
  assert.equal(first.status, 0, first.stderr)
  assert.equal(invoke().status, 0, 're-emitting identical inputs is idempotent')
  const source = join(directory, 'oracle.package.json')
  const pkg = JSON.parse(await readFile(source, 'utf8'))
  // Sources-only analyst input excludes author intent and unrelated README sections.
  pkg.sources[0].jurisdiction += ' First approved clarification.'
  await writeFile(source, JSON.stringify(pkg))
  const second = invoke()
  assert.equal(second.status, 0, second.stderr)
  assert.match(second.stdout, /round:2 mode:confirm-fixes/)
  const bytes = await readFile(output)
  pkg.sources[0].jurisdiction += ' Second approved clarification.'
  await writeFile(source, JSON.stringify(pkg))
  const third = invoke()
  assert.equal(third.status, 1)
  assert.match(third.stderr, /^ITERATION_BUDGET_EXHAUSTED:/)
  assert.deepEqual(await readFile(output), bytes)
})

test('one explicit authoring approval extends exactly one round, never unlocks or grants a blanket waiver', async (t) => {
  const { root, directory } = await repository(t)
  assert.equal(stage(root, directory, 'begin').status, 0)
  assert.equal(stage(root, directory, 'advance', 'MODELED').status, 0)
  assert.equal(stage(root, directory, 'rewind', 'DISCOVERING').status, 0)
  assert.equal(stage(root, directory, 'advance', 'MODELED').status, 0)
  const approval = join(root, 'approval.json')
  const extend = () => node(root, 'oracle-stage.mjs', ['extend', '--dir', directory, '--approval', approval])
  await writeFile(approval, JSON.stringify({ decision: 'do-everything', source: 'conversation: delegated choices' }))
  const rejected = extend()
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /^ITERATION_APPROVAL_REQUIRED:/)
  await writeFile(approval, JSON.stringify({ decision: 'approve-one-more-round', phase: 'authoring', round: 3,
    source: 'conversation: explicit approval of round 3', reason: 'resolve the listed source contradiction' }))
  const granted = extend()
  assert.equal(granted.status, 0, granted.stderr)
  assert.equal(JSON.parse(granted.stdout).iterations.limit, 3)
  assert.equal(stage(root, directory, 'rewind', 'DISCOVERING').status, 0)
  assert.equal(stage(root, directory, 'advance', 'MODELED').status, 0)
  assert.match(stage(root, directory, 'rewind', 'DISCOVERING').stderr, /^ITERATION_BUDGET_EXHAUSTED:/)
  assert.equal(extend().status, 1, 'an old approval cannot buy another round')
})

test('new analyst dispatches spend rounds even with identical source input while transport retries do not', async (t) => {
  const { root, directory } = await repository(t)
  const input = join(root, 'sources.md')
  await writeFile(input, 'unchanged approved sources\n')
  const invoke = (attempt) => node(root, 'oracle-stage.mjs', ['review-input', '--dir', directory,
    '--kind', 'model-analyst', '--input', input, '--attempt', attempt])
  const first = invoke('analyst-task-1')
  assert.equal(first.status, 0, first.stderr)
  assert.equal(JSON.parse(first.stdout).iterations.round, 1)
  assert.equal(JSON.parse(invoke('analyst-task-1').stdout).iterations.round, 1)
  const second = invoke('analyst-task-2')
  assert.equal(second.status, 0, second.stderr)
  assert.equal(JSON.parse(second.stdout).iterations.round, 2)
  const third = invoke('analyst-task-3')
  assert.equal(third.status, 1)
  assert.match(third.stderr, /^ITERATION_BUDGET_EXHAUSTED:/)
})

test('request-only Contract begin binds profile before card exists and rejects a later legacy card', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-contract-begin-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, 'contract')
  const started = node(root, 'oracle-stage.mjs', ['begin', '--dir', directory, '--profile', 'contract/v1'])
  assert.equal(started.status, 0, started.stderr)
  const bytes = await readFile(join(directory, 'stage.json'))
  assert.equal(JSON.parse(bytes).verificationProfile, 'contract/v1')
  assert.equal(JSON.parse(bytes).cardSha256, null)
  await writeFile(join(directory, 'oracle.md'), '# Legacy card\n')
  const refused = stage(root, directory, 'advance', 'CHECKED')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /^PROFILE_MISMATCH:/)
  assert.deepEqual(await readFile(join(directory, 'stage.json')), bytes)
})

test('a package oracle cannot be locked without a stage record, before DRAFTED, or on package bytes that changed after it', async (t) => {
  const { root, directory } = await repository(t)

  const missing = lock(root, directory)
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /^STAGE_MISSING: /)

  assert.equal(stage(root, directory, 'begin').status, 0)
  const early = lock(root, directory)
  assert.equal(early.status, 1)
  assert.match(early.stderr, /^STAGE_NOT_DRAFTED: the oracle is at DISCOVERING/)

  assert.equal(stage(root, directory, 'advance', 'MODELED').status, 0)
  const modeled = lock(root, directory)
  assert.match(modeled.stderr, /^STAGE_NOT_DRAFTED: the oracle is at MODELED/)

  // a hand-written card has no package, so it does not pass through the stage machine
  const handWritten = await mkdtemp(join(tmpdir(), 'oracle-stage-hand-'))
  t.after(() => rm(handWritten, { recursive: true, force: true }))
  const plain = join(handWritten, '.ai', 'oracles', 'plain')
  await mkdir(plain, { recursive: true })
  await assertReadyToLock(plain)
})

test('the stage machine moves one step at a time, never writes ORACLE_READY by hand, and refuses a stale or forward rewind', async (t) => {
  const { root, directory } = await repository(t)
  const missing = stage(root, directory, 'advance', 'MODELED')
  assert.match(missing.stderr, /^STAGE_MISSING: /)

  assert.equal(stage(root, directory, 'begin').status, 0)
  assert.match(stage(root, directory, 'begin').stderr, /^STAGE_EXISTS: /)
  assert.match(stage(root, directory, 'advance', 'CHECKED').stderr, /^STAGE_SKIP: DISCOVERING can only advance to MODELED, not CHECKED/)
  assert.match(stage(root, directory, 'advance', 'DRAFTED').stderr, /^STAGE_SKIP: /)
  assert.match(stage(root, directory, 'advance', 'ORACLE_READY').stderr, /^STAGE_LOCK_ONLY: /)

  const modeled = stage(root, directory, 'advance', 'MODELED')
  assert.equal(modeled.status, 0, modeled.stderr)
  assert.equal(JSON.parse(modeled.stdout).stage, 'MODELED')
  assert.equal((await readStage(directory)).stage, 'MODELED')

  // the package changed after MODELED — the record is stale until the oracle walks back and forward again
  const packagePath = join(directory, 'oracle.package.json')
  await writeFile(packagePath, `${await readFile(packagePath, 'utf8')}\n`)
  assert.match(stage(root, directory, 'advance', 'CHECKED').stderr, /^STAGE_STALE: oracle\.package\.json changed after MODELED — rewind --to <stage> --reason <cause>/)
  assert.equal(JSON.parse(stage(root, directory, 'status').stdout).stale, true)

  assert.match(stage(root, directory, 'rewind', 'CHECKED').stderr, /^STAGE_REWIND: /)
  assert.equal(stage(root, directory, 'rewind', 'DISCOVERING').status, 0)
  assert.equal(JSON.parse(stage(root, directory, 'status').stdout).stage, 'DISCOVERING')
  assert.equal(stage(root, directory, 'advance', 'MODELED').status, 0)
})

test('changed package bytes walk back to DISCOVERING so neither the MODELED nor the CHECKED gate is skipped', async (t) => {
  const { root, directory } = await repository(t)
  const packagePath = join(directory, 'oracle.package.json')
  assert.equal(stage(root, directory, 'begin').status, 0)
  assert.equal(stage(root, directory, 'advance', 'MODELED').status, 0)
  assert.equal(stage(root, directory, 'advance', 'CHECKED').status, 0)
  const checked = await readStage(directory)

  // a package that no longer passes MODELED must not be recorded as CHECKED by walking back to CHECKED
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  await writeFile(packagePath, JSON.stringify({ ...pkg, sources: [] }))
  for (const target of ['CHECKED', 'MODELED']) {
    const refused = stage(root, directory, 'rewind', target)
    assert.equal(refused.status, 1)
    assert.match(refused.stderr, /^STAGE_STALE: oracle\.package\.json changed after CHECKED — a changed package walks back to DISCOVERING/)
  }
  assert.deepEqual(await readStage(directory), checked, 'a refused rewind writes nothing and spends no round')
  await rm(packagePath)
  assert.match(stage(root, directory, 'rewind', 'CHECKED').stderr, /^STAGE_STALE: oracle\.package\.json changed after CHECKED/)
  await writeFile(packagePath, JSON.stringify({ ...pkg, sources: [] }))
  assert.equal(stage(root, directory, 'rewind', 'DISCOVERING').status, 0)
  assert.match(stage(root, directory, 'advance', 'MODELED').stderr, /^STAGE_GATE: package is not model-complete/)

  // the repaired package walks forward through every gate again (a card-only repair resuming at CHECKED is the DRAFTED test below)
  await writeFile(packagePath, JSON.stringify(pkg))
  assert.equal(stage(root, directory, 'advance', 'MODELED').status, 0)
  const rechecked = stage(root, directory, 'advance', 'CHECKED')
  assert.equal(rechecked.status, 0, rechecked.stderr)
  assert.match(JSON.parse(rechecked.stdout).evidence, /^derive /)
})

test('a package that is not model-complete cannot leave DISCOVERING', async (t) => {
  const { root, directory } = await repository(t)
  const packagePath = join(directory, 'oracle.package.json')
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  pkg.sources = []
  await writeFile(packagePath, JSON.stringify(pkg))
  assert.equal(stage(root, directory, 'begin').status, 0)
  const refused = stage(root, directory, 'advance', 'MODELED')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /^STAGE_GATE: package is not model-complete: .*package-sources/)
  assert.equal((await readStage(directory)).stage, 'DISCOVERING')
})

test('DRAFTED opens the lock gate for the package bytes it was recorded on, and the lock moves the record to ORACLE_READY', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const { root, directory } = await repository(t)
  const project = node(root, 'oracle-package.mjs', [
    'project-card',
    '--package',
    '.ai/oracles/stale-search/oracle.package.json',
    '--out',
    '.ai/oracles/stale-search/oracle.md',
  ])
  assert.equal(project.status, 0, project.stderr)

  assert.equal(stage(root, directory, 'begin').status, 0)
  for (const step of ['MODELED', 'CHECKED', 'DRAFTED']) {
    const advanced = stage(root, directory, 'advance', step)
    assert.equal(advanced.status, 0, `${step}: ${advanced.stderr}`)
  }
  await assertReadyToLock(directory)

  // the card no longer matches what the package generates: DRAFTED cannot be reached again
  await writeFile(join(directory, 'oracle.md'), (await readFile(join(directory, 'oracle.md'), 'utf8')).replace('Search', 'Searches'))
  assert.equal(stage(root, directory, 'rewind', 'CHECKED').status, 0)
  const drifted = stage(root, directory, 'advance', 'DRAFTED')
  assert.equal(drifted.status, 1)
  assert.match(drifted.stderr, /^STAGE_GATE: check-card failed/)

  assert.equal(stage(root, directory, 'rewind', 'CHECKED').status, 0)
  assert.equal(node(root, 'oracle-package.mjs', ['project-card', '--package', '.ai/oracles/stale-search/oracle.package.json', '--out', '.ai/oracles/stale-search/oracle.md']).status, 0)
  assert.equal(stage(root, directory, 'advance', 'DRAFTED').status, 0)
  await markLocked(directory)
  assert.equal((await readStage(directory)).stage, 'ORACLE_READY')
  // an idempotent relock of the same bytes still passes the gate; changed bytes do not
  await assertReadyToLock(directory)
  const packagePath = join(directory, 'oracle.package.json')
  await writeFile(packagePath, `${await readFile(packagePath, 'utf8')}\n`)
  await assert.rejects(() => assertReadyToLock(directory), { code: 'STAGE_STALE' })
})

test('CHECKED refuses a model the lock would freeze with a defect: a row that no longer implies its goal is named with a counterexample before the lock', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const { root, directory } = await repository(t)
  const world = join(root, 'World.bend')
  const text = await readFile(world, 'utf8')
  // the row now forbids the newer answer being shown, so the rows no longer imply goal G2: the adequacy run label would
  // refute card-implies-goal only after the lock, and a locked model cannot be edited
  const forbidding = text.replace('      Race.imp(n, Race.isNew(f))\n', '      Race.imp(n, Bool.not(Race.isNew(f)))\n')
  assert.notEqual(forbidding, text)
  await writeFile(world, forbidding)
  assert.equal(stage(root, directory, 'begin').status, 0)
  assert.equal(stage(root, directory, 'advance', 'MODELED').status, 0)
  const refused = stage(root, directory, 'advance', 'CHECKED')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /^STAGE_GATE: the model has defects the lock would freeze: adequacy card-implies-goal G2 refuted: \{"arrival"/)
  assert.equal((await readStage(directory)).stage, 'MODELED')

  // fixed in the package's world, the same stage advances and its record says what was judged
  await writeFile(world, text)
  const checked = stage(root, directory, 'advance', 'CHECKED')
  assert.equal(checked.status, 0, checked.stderr)
  assert.match((await readStage(directory)).history.at(-1).evidence, /adequacy found no refuted check or unsatisfiable setting over \d+ worlds/)
})

test('MODELED needs every async cell decided when Async is in a version 2 space — the open cells are asked before the model', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-stage-async-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await cp(PAGINATION, root, { recursive: true })
  const directory = join(root, '.ai', 'oracles', 'pagination')
  await mkdir(directory, { recursive: true })
  const packagePath = join(directory, 'oracle.package.json')
  await cp(join(PAGINATION, 'oracle.package.json'), packagePath)
  assert.equal(stage(root, directory, 'begin').status, 0)

  const refused = stage(root, directory, 'advance', 'MODELED')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /^STAGE_GATE: package is not model-complete: package-async-cells: Async is in the space/)

  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  const cells = (decision, ref) =>
    Object.fromEntries(
      ['late-success-after-cancel', 'late-failure-after-success', 'older-response-after-newer', 'duplicate-completion', 'lost-response', 'retry-while-pending', 'unmount-before-settle'].map(
        (id) => [id, { decision, ref }],
      ),
    )
  pkg.holds = [{ id: 'H1', question: 'does a late page after a filter change show?', blocks: ['load'], status: 'open' }]
  pkg.asyncCells = [{ operation: 'load page', cells: { ...cells('source', 'S1'), 'late-success-after-cancel': { decision: 'question', ref: 'H1' } } }]
  await writeFile(packagePath, JSON.stringify(pkg, null, 2))
  // the package changed after begin, which pinned nothing yet: MODELED runs its gate on the new bytes
  const modeled = stage(root, directory, 'advance', 'MODELED')
  assert.equal(modeled.status, 0, modeled.stderr)
})

test('a forged DRAFTED record skips no gate: the lock still lints the card against the package', async (t) => {
  const { root, directory } = await repository(t)
  // a host without the hook can write stage.json by hand; the lock re-runs card lint, which regenerates the card from
  // the package and checks the cross-check decisions, so the forgery buys nothing
  const bytes = await readFile(join(directory, 'oracle.package.json'))
  await writeFile(join(directory, 'stage.json'), JSON.stringify({ schemaVersion: 1, stage: 'DRAFTED', packageSha256: sha256(bytes), history: [] }))
  await cp(join(FIXTURE, 'oracle.md'), join(directory, 'oracle.md'))
  const locked = lock(root, directory)
  assert.equal(locked.status, 1)
  assert.doesNotMatch(locked.stderr, /^STAGE_/)
  assert.match(locked.stderr, /^CARD_LINT_FAILED: /)
})

const reflect = (cwd, ...args) => node(cwd, 'oracle-reflect.mjs', args)
const walk = (...steps) => ({
  schemaVersion: 1,
  stage: steps.at(-1).stage,
  packageSha256: null,
  history: steps.map((step) => ({ packageSha256: null, ...step })),
})

/** 종결된 run 셋과 읽을 수 없는 run 하나 — reflect는 손으로 쓴 기록도 읽기만 한다. */
async function reflectedRuns(t) {
  const root = await mkdtemp(join(tmpdir(), 'oracle-reflect-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const run = async (id, record, ledger) => {
    const directory = join(root, '.ai', 'oracles', id)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'stage.json'), typeof record === 'string' ? record : JSON.stringify(record))
    if (ledger) await writeFile(join(directory, 'runs.jsonl'), `${ledger.map((entry) => JSON.stringify(entry)).join('\n')}\n`)
  }
  await run('checkout', walk(
    { stage: 'DISCOVERING', evidence: 'begin' },
    { stage: 'MODELED', evidence: 'package validate --stage model' },
    { stage: 'CHECKED', evidence: 'derive' },
    { stage: 'DISCOVERING', evidence: 'rewind', reason: 'review-finding', note: 'retry after session expiry is unmodeled' },
    { stage: 'MODELED', evidence: 'package validate --stage model' },
  ), [
    { type: 'budget', budget: 'harness', reason: 'fixture lacked an auth cookie' },
    { type: 'budget', budget: 'harness', reason: 'fixture lacked an auth cookie', duplicate: true },
    { type: 'transition', state: 'FAIL', reason: 'abandoned' },
  ])
  await run('pagination', walk(
    { stage: 'DISCOVERING', evidence: 'begin' },
    { stage: 'MODELED', evidence: 'package validate --stage model' },
    { stage: 'MODELED', evidence: 'rewind', reason: 'review-finding', note: 'empty page after delete is unmodeled' },
    { stage: 'DISCOVERING', evidence: 'rewind', reason: 'user-answer' },
  ), [{ type: 'budget', budget: 'harness', reason: 'dev server port taken' }])
  await run('legacy', walk(
    { stage: 'DISCOVERING', evidence: 'begin' },
    { stage: 'MODELED', evidence: 'package validate --stage model' },
    { stage: 'DISCOVERING', evidence: 'rewind' },
  ))
  await run('broken', '{ not json')
  return root
}

test('reflect counts walk-back causes across runs and proposes only the ones that recur', async (t) => {
  const root = await reflectedRuns(t)
  const result = reflect(root, '--root', root)
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)

  assert.equal(report.runs, 3)
  assert.deepEqual(report.skipped.map((entry) => entry.run), ['broken'])
  assert.equal(report.rewinds.total, 4)
  assert.equal(report.rewinds.unrecorded, 1, 'a rewind from before 0.101 has no reason and is not guessed')
  assert.deepEqual(report.rewinds.byReason, { 'review-finding': 2, 'user-answer': 1 })
  assert.deepEqual(report.rewinds.byWalk, { 'CHECKED→DISCOVERING': 1, 'MODELED→MODELED': 1, 'MODELED→DISCOVERING': 2 })
  assert.deepEqual(report.budgets, { harness: 2 }, 'a duplicate spend is not a second correction')
  assert.deepEqual(report.stops, { FAIL: 1 })

  // review findings and harness corrections each recur in two runs; the user answer sent back one run only
  assert.deepEqual(report.candidates.map((candidate) => candidate.signal), ['rewind:review-finding', 'budget:harness'])
  const [finding, harness] = report.candidates
  assert.deepEqual(finding.runs, ['checkout', 'pagination'])
  assert.deepEqual(finding.notes, ['retry after session expiry is unmodeled', 'empty page after delete is unmodeled'])
  assert.match(finding.suggest, /pre-lock/)
  assert.equal(finding.applied, false)
  assert.deepEqual(harness.notes, ['fixture lacked an auth cookie', 'dev server port taken'])
})

test('reflect lowers the recurrence bar on request and writes nothing into the runs', async (t) => {
  const root = await reflectedRuns(t)
  const stageBefore = await readFile(join(root, '.ai', 'oracles', 'checkout', 'stage.json'))
  const report = JSON.parse(reflect(root, '--root', root, '--min-runs', '1').stdout)
  assert.deepEqual(report.candidates.map((candidate) => candidate.signal), ['rewind:review-finding', 'budget:harness', 'rewind:user-answer'])
  assert.deepEqual(await readFile(join(root, '.ai', 'oracles', 'checkout', 'stage.json')), stageBefore)
})

test('a torn or non-object ledger line costs only that ledger, never the run\'s rewinds or the whole report', async (t) => {
  const root = await reflectedRuns(t)
  const ledger = (id) => join(root, '.ai', 'oracles', id, 'runs.jsonl')
  await writeFile(ledger('checkout'), `${await readFile(ledger('checkout'), 'utf8')}{"type":"bud`)
  await writeFile(ledger('pagination'), 'null\n')
  const result = reflect(root, '--root', root)
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.runs, 3)
  assert.deepEqual(report.rewinds.byReason, { 'review-finding': 2, 'user-answer': 1 })
  assert.deepEqual(report.budgets, {})
  assert.deepEqual(report.skipped.map((entry) => entry.run), ['broken', 'checkout', 'pagination'])
  assert.match(report.skipped.find((entry) => entry.run === 'pagination').error, /^runs\.jsonl: /)
  assert.deepEqual(report.candidates.map((candidate) => candidate.signal), ['rewind:review-finding'])
})

test('reflect points each budget kind at the place that owns its fix', async (t) => {
  const root = await reflectedRuns(t)
  for (const id of ['checkout', 'pagination'])
    await writeFile(join(root, '.ai', 'oracles', id, 'runs.jsonl'), `${JSON.stringify({ type: 'budget', budget: 'policy', reason: 'refund window unsourced' })}\n`)
  const report = JSON.parse(reflect(root, '--root', root).stdout)
  const policy = report.candidates.find((candidate) => candidate.signal === 'budget:policy')
  assert.doesNotMatch(policy.suggest, /harness/)
  assert.match(policy.suggest, /before lock/)
})

test('reflect refuses a root without oracle runs and a bad bar instead of reporting zero', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-reflect-empty-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const empty = reflect(root, '--root', root)
  assert.equal(empty.status, 1)
  assert.match(empty.stderr, /^REFLECT_NO_RUNS: /)
  assert.equal(reflect(root, '--root', root, '--min-runs', '0').status, 2)
  assert.equal(reflect(root, '--unknown', 'x').status, 2)
})
