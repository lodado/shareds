import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmod, cp, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
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
const { NODE_TEST_CONTEXT: _parent, ...INHERITED_ENV } = process.env
// 영수증은 테스트마다 따로 둔다 — 다른 테스트나 앞선 실행이 남긴 CHECKED 영수증이 관문을 대신 통과시키지 않게
const CHILD_ENV = { ...INHERITED_ENV, ORACLE_LINT_CACHE: 'off' }
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

test('CHECKED remembers a pass by its exact inputs: a registered source or Bend byte runs the gate again, an unrelated file does not, a failure leaves none', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const receipts = await mkdtemp(join(tmpdir(), 'oracle-checked-receipts-'))
  t.after(() => rm(receipts, { recursive: true, force: true }))
  const walk = async (change, cache = receipts, extra = {}) => {
    const { root, directory } = await repository(t)
    await change?.(root)
    const env = { ...CHILD_ENV, ORACLE_LINT_CACHE: cache, ...extra }
    const run = (...args) => spawnSync(process.execPath, [join(SCRIPTS, 'oracle-stage.mjs'), ...args, '--dir', directory], { cwd: root, encoding: 'utf8', env })
    assert.equal(run('begin').status, 0)
    assert.equal(run('advance', '--to', 'MODELED').status, 0)
    const checked = run('advance', '--to', 'CHECKED')
    return { stderr: checked.stderr, evidence: checked.status === 0 ? JSON.parse(checked.stdout).evidence : null }
  }
  const kept = async () => (await readdir(receipts)).filter((name) => !name.startsWith('.')).length
  const append = (file, text) => async (root) => writeFile(join(root, file), `${await readFile(join(root, file), 'utf8')}${text}`)

  const first = await walk()
  assert.doesNotMatch(first.evidence, /receipt/, first.stderr)
  assert.equal(await kept(), 1)
  // a fresh copy of the same bytes passes on the receipt and keeps the judged evidence
  const again = await walk()
  assert.equal(again.evidence, `${first.evidence}; receipt: these exact inputs passed before`)
  // a file the package does not read is not an input
  assert.match((await walk(append('search-reducer.mts', '\n// unrelated\n'))).evidence, /receipt/)
  // a registered source (S1) and a Bend file the package reads are inputs
  for (const [file, text] of [['README.md', '\n'], ['LAWS.bend', '\n# comment\n']]) {
    const changed = await walk(append(file, text))
    assert.doesNotMatch(changed.evidence ?? 'failed', /receipt|failed/, `${file}: ${changed.stderr}`)
  }
  assert.equal(await kept(), 3)

  // a failing gate leaves no receipt, so the same failing bytes fail again
  const forbid = async (root) => {
    const world = join(root, 'World.bend')
    await writeFile(world, (await readFile(world, 'utf8')).replace('      Race.imp(n, Race.isNew(f))\n', '      Race.imp(n, Bool.not(Race.isNew(f)))\n'))
  }
  for (const attempt of [1, 2]) assert.match((await walk(forbid)).stderr, /^STAGE_GATE: the model has defects the lock would freeze/, `attempt ${attempt}`)
  assert.equal(await kept(), 3)
  // ORACLE_LINT_CACHE=off neither reads nor writes a receipt
  assert.doesNotMatch((await walk(undefined, 'off')).evidence, /receipt/)
  assert.equal(await kept(), 3)

  // a pass the keyed bytes did not earn is never stored: an input replaced while the gate runs …
  const preloads = await mkdtemp(join(tmpdir(), 'oracle-checked-preloads-'))
  t.after(() => rm(preloads, { recursive: true, force: true }))
  const fixed = join(preloads, 'World.fixed.bend')
  await writeFile(fixed, await readFile(join(FIXTURE, 'World.bend'), 'utf8'))
  const swap = join(preloads, 'swap.mjs')
  await writeFile(swap, [
    "import fsp from 'node:fs/promises'",
    "import { syncBuiltinESMExports } from 'node:module'",
    'const original = fsp.readFile',
    'let swapped = false',
    'fsp.readFile = async function (path, ...rest) {',
    "  if (!swapped && String(path).endsWith('/World.bend') && new Error().stack.includes('derivePackage')) {",
    '    swapped = true',
    '    await fsp.writeFile(String(path), await original(process.env.SWAP_TEXT_FILE, "utf8"))',
    '  }',
    '  return original.call(this, path, ...rest)',
    '}',
    'syncBuiltinESMExports()',
  ].join('\n'))
  const swapped = await walk(forbid, receipts, { NODE_OPTIONS: `--import ${swap}`, SWAP_TEXT_FILE: fixed })
  assert.match(swapped.evidence ?? swapped.stderr, /^derive /, 'the gate judged the replaced bytes')
  assert.equal(await kept(), 3)
  assert.match((await walk(forbid)).stderr, /^STAGE_GATE: the model has defects the lock would freeze/)
  // … or adequacy left unjudged by one failed Bend spawn
  const eagain = join(preloads, 'eagain.mjs')
  await writeFile(eagain, [
    "import cp from 'node:child_process'",
    "import { syncBuiltinESMExports } from 'node:module'",
    'const original = cp.spawnSync',
    'let failed = false',
    'cp.spawnSync = function (command, args, options) {',
    "  if (!failed && Array.isArray(args) && args[0] === 'World.bend' && args.includes('-o') && new Error().stack.includes('preLockIssues')) {",
    '    failed = true',
    "    return { pid: 0, output: [], stdout: '', stderr: '', status: null, signal: null, error: Object.assign(new Error('spawnSync EAGAIN'), { code: 'EAGAIN' }) }",
    '  }',
    '  return original.call(this, command, args, options)',
    '}',
    'syncBuiltinESMExports()',
  ].join('\n'))
  const unjudged = await walk(append('search-reducer.mts', '\n// another unrelated edit\n'), join(preloads, 'cache'), { NODE_OPTIONS: `--import ${eagain}` })
  assert.match(unjudged.evidence ?? unjudged.stderr, /adequacy not judged/)
  assert.deepEqual(await readdir(join(preloads, 'cache')).catch(() => []), [])
  // … or a derive whose world count timed out (its digest is not these bytes' digest)
  const worlds = join(preloads, 'worlds.mjs')
  await writeFile(worlds, (await readFile(eagain, 'utf8')).replace("stack.includes('preLockIssues')", "stack.includes('possibleWorlds')"))
  const partial = await walk(undefined, join(preloads, 'cache'), { NODE_OPTIONS: `--import ${worlds}` })
  assert.match(partial.evidence ?? partial.stderr, /^derive /)
  assert.deepEqual(await readdir(join(preloads, 'cache')).catch(() => []), [])
  // … or an input changed and restored while the gate ran: the key matches again, only the file stamps differ
  const restore = join(preloads, 'restore.mjs')
  await writeFile(restore, [
    "import fsp from 'node:fs/promises'",
    "import { syncBuiltinESMExports } from 'node:module'",
    'const original = fsp.readFile',
    'let world = null',
    'let saved = null',
    'fsp.readFile = async function (path, ...rest) {',
    '  const name = String(path)',
    '  const stack = new Error().stack',
    "  if (saved === null && name.endsWith('/World.bend') && stack.includes('derivePackage')) {",
    '    world = name',
    "    saved = await original(name, 'utf8')",
    "    await fsp.writeFile(name, await original(process.env.SWAP_TEXT_FILE, 'utf8'))",
    "  } else if (world && name.endsWith('oracle.package.json') && stack.includes('rememberChecked')) {",
    '    await fsp.writeFile(world, saved)',
    '    world = null',
    '  }',
    '  return original.call(this, path, ...rest)',
    '}',
    'syncBuiltinESMExports()',
  ].join('\n'))
  const restored = await walk(forbid, join(preloads, 'cache'), { NODE_OPTIONS: `--import ${restore}`, SWAP_TEXT_FILE: fixed })
  assert.match(restored.evidence ?? restored.stderr, /^derive /, 'the gate judged the replaced bytes')
  assert.deepEqual(await readdir(join(preloads, 'cache')).catch(() => []), [])
  // … also through a symlinked input, where only the target changes and the link itself does not
  const linked = async (root) => {
    await forbid(root)
    await mkdir(join(root, 'real'))
    await rename(join(root, 'World.bend'), join(root, 'real', 'World.bend'))
    await symlink(join(root, 'real', 'World.bend'), join(root, 'World.bend'))
  }
  const throughLink = await walk(linked, join(preloads, 'cache'), { NODE_OPTIONS: `--import ${restore}`, SWAP_TEXT_FILE: fixed })
  assert.match(throughLink.evidence ?? throughLink.stderr, /^derive /, 'the gate judged the replaced bytes')
  assert.deepEqual(await readdir(join(preloads, 'cache')).catch(() => []), [])
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

test('stage steps record when they happened and how long the gate took; status --brief reads them as one line', async (t) => {
  const { root, directory } = await repository(t)
  assert.equal(stage(root, directory, 'begin').status, 0)
  assert.equal(stage(root, directory, 'advance', 'MODELED').status, 0)
  const [begun, modeled] = (await readStage(directory)).history
  for (const step of [begun, modeled]) assert.ok(Number.isFinite(Date.parse(step.at)), `${step.evidence} records an ISO time`)
  assert.equal(begun.durationMs, undefined, 'begin runs no gate')
  assert.equal(Number.isSafeInteger(modeled.durationMs) && modeled.durationMs >= 0, true, 'advance records its gate time in whole ms')

  const input = join(root, 'sources.md')
  await writeFile(input, 'approved sources\n')
  const review = (...extra) => node(root, 'oracle-stage.mjs', ['review-input', '--dir', directory, '--kind', 'model-analyst', '--input', input, ...extra])
  assert.equal(review('--attempt', 'analyst-1', '--model', 'claude-opus-5-5', '--effort', 'xhigh').status, 0)
  assert.equal(review('--attempt', 'analyst-1').status, 0, 'a transport retry of the same dispatch')
  assert.equal(review('--attempt', 'analyst-2', '--model', 'two\nlines').status, 2)
  const { dispatches } = await readStage(directory)
  assert.deepEqual(dispatches.map(({ at: _at, ...rest }) => rest), [{ kind: 'model-analyst', attempt: 'analyst-1', model: 'claude-opus-5-5', effort: 'xhigh' }],
    'a retry keeps the first dispatch time and a refused one records nothing')

  const brief = () => node(root, 'oracle-stage.mjs', ['status', '--dir', directory, '--brief'])
  const line = brief()
  assert.equal(line.status, 0, line.stderr)
  assert.match(line.stdout, /^stage MODELED 2\/5 · \d+s in stage · authoring round 1\/2 · dispatched: model-analyst \d+s ago · next: CHECKED → DRAFTED → lock\n$/)
  assert.equal(node(root, 'oracle-stage.mjs', ['advance', '--dir', directory, '--to', 'CHECKED', '--brief']).status, 2, '--brief belongs to status')

  const packagePath = join(directory, 'oracle.package.json')
  await writeFile(packagePath, `${await readFile(packagePath, 'utf8')}\n`)
  assert.match(brief().stdout, / · STALE: the recorded bytes changed since this stage — rewind\n$/)
})

test('reflect --timing measures authoring and Delivery lead time from recorded times and lists untimed runs apart', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-reflect-timing-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const minute = (count) => new Date(Date.UTC(2026, 9, 21, 0, count)).toISOString()
  const run = async (id, record, ledger) => {
    const directory = join(root, '.ai', 'oracles', id)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'stage.json'), JSON.stringify(record))
    if (ledger) await writeFile(join(directory, 'runs.jsonl'), `${ledger.map((entry) => JSON.stringify(entry)).join('\n')}\n`)
  }
  await run('checkout', {
    ...walk(
      { stage: 'DISCOVERING', evidence: 'begin', at: minute(0) },
      { stage: 'MODELED', evidence: 'package validate --stage model', at: minute(10), durationMs: 2000 },
      { stage: 'CHECKED', evidence: 'derive', at: minute(30), durationMs: 60000 },
      { stage: 'DISCOVERING', evidence: 'rewind', reason: 'review-finding', at: minute(40) },
      { stage: 'MODELED', evidence: 'package validate --stage model', at: minute(45), durationMs: 1000 },
      { stage: 'CHECKED', evidence: 'derive', at: minute(55), durationMs: 30000 },
      { stage: 'DRAFTED', evidence: 'check-card', at: minute(60), durationMs: 5000 },
      { stage: 'ORACLE_READY', evidence: 'lock', at: minute(70) },
    ),
    dispatches: [{ kind: 'cold-read', attempt: 'cold-1', at: minute(61) }, { kind: 'reverse-impossible', attempt: 'reverse-1', at: minute(61) }],
  }, [
    { type: 'init', state: 'ORACLE_READY', at: minute(72) },
    { type: 'run', runId: 'r-001', label: 'red', commandMs: 30000, wrapperMs: 2000, at: minute(80) },
    { type: 'transition', state: 'VALID_RED', at: minute(81) },
    { type: 'run', runId: 'r-002', label: 'green', commandMs: 90000, wrapperMs: 3000, at: minute(100) },
    { type: 'run', runId: 'r-003', label: 'green', commandMs: 60000, wrapperMs: 3000, at: minute(102) },
    { type: 'transition', state: 'IMPLEMENTED_GREEN', at: minute(103) },
    { type: 'review-round', at: minute(104) },
    { type: 'transition', state: 'REVIEW_VERIFIED', at: minute(130) },
  ])
  await run('legacy', walk({ stage: 'DISCOVERING', evidence: 'begin' }, { stage: 'MODELED', evidence: 'package validate --stage model' }))

  const result = reflect(root, '--root', root, '--timing')
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.deepEqual(report.untimed, ['legacy'], 'a record from before timestamps is listed, never guessed')
  const [checkout] = report.runs
  assert.equal(checkout.run, 'checkout')
  assert.equal(checkout.authoring.ms, 70 * 60_000)
  assert.deepEqual(checkout.authoring.stages, {
    DISCOVERING: { visits: 2, ms: 15 * 60_000, gateMs: 0 },
    MODELED: { visits: 2, ms: 30 * 60_000, gateMs: 3000 },
    CHECKED: { visits: 2, ms: 15 * 60_000, gateMs: 90000 },
    DRAFTED: { visits: 1, ms: 10 * 60_000, gateMs: 5000 },
    ORACLE_READY: { visits: 1, ms: 0, gateMs: 0 },
  })
  assert.equal(checkout.authoring.partial, false)
  assert.deepEqual(checkout.authoring.rewinds, [
    { left: 'CHECKED', furthest: 'CHECKED', to: 'DISCOVERING', reason: 'review-finding', at: minute(40), regainMs: 15 * 60_000 },
  ], 'regain runs from the walk back to the first return to the furthest stage reached before it')
  assert.deepEqual(checkout.delivery.states.map(({ state, ms }) => [state, ms]), [
    ['ORACLE_READY', 9 * 60_000], ['VALID_RED', 22 * 60_000], ['IMPLEMENTED_GREEN', 27 * 60_000], ['REVIEW_VERIFIED', null],
  ])
  assert.equal(checkout.delivery.ms, 58 * 60_000)
  assert.deepEqual(checkout.delivery.runsByLabel, { red: { runs: 1, commandMs: 30000 }, green: { runs: 2, commandMs: 150000 } })
  assert.equal(checkout.delivery.reviewRounds, 1)
  assert.deepEqual(checkout.dispatches, { 'cold-read': 1, 'reverse-impossible': 1 })
  assert.deepEqual(report.totals, {
    authoringMs: 70 * 60_000, partialRuns: [], regainMs: 15 * 60_000, rewinds: 1, deliveryMs: 58 * 60_000, commandMs: 180000, dispatches: 2,
  })
})

test('reflect --timing counts overlapping walk-backs once and keeps partly timed histories out of the totals', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-reflect-overlap-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const minute = (count) => new Date(Date.UTC(2026, 9, 21, 0, count)).toISOString()
  const run = async (id, record) => {
    const directory = join(root, '.ai', 'oracles', id)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'stage.json'), JSON.stringify(record))
  }
  // a second walk-back while still recovering from the first: 40→65 and 50→65 share one 25-minute span
  await run('overlap', walk(
    { stage: 'DISCOVERING', evidence: 'begin', at: minute(0) },
    { stage: 'MODELED', evidence: 'package validate --stage model', at: minute(10) },
    { stage: 'CHECKED', evidence: 'derive', at: minute(30) },
    { stage: 'DISCOVERING', evidence: 'rewind', reason: 'gate-failure', at: minute(40) },
    { stage: 'MODELED', evidence: 'package validate --stage model', at: minute(45) },
    { stage: 'DISCOVERING', evidence: 'rewind', reason: 'review-finding', at: minute(50) },
    { stage: 'MODELED', evidence: 'package validate --stage model', at: minute(55) },
    { stage: 'CHECKED', evidence: 'derive', at: minute(65) },
  ))
  // upgraded mid-run: the untimed start still decides how far the run had come before the first timed walk-back
  await run('upgraded', walk(
    { stage: 'DISCOVERING', evidence: 'begin' },
    { stage: 'MODELED', evidence: 'package validate --stage model' },
    { stage: 'CHECKED', evidence: 'derive' },
    { stage: 'DISCOVERING', evidence: 'rewind', reason: 'user-answer', at: minute(100) },
    { stage: 'MODELED', evidence: 'package validate --stage model', at: minute(105) },
    { stage: 'CHECKED', evidence: 'derive', at: minute(120) },
    { stage: 'DRAFTED', evidence: 'check-card', at: minute(125) },
    { stage: 'ORACLE_READY', evidence: 'lock', at: minute(130) },
  ))

  const report = JSON.parse(reflect(root, '--root', root, '--timing').stdout)
  const overlap = report.runs.find((entry) => entry.run === 'overlap').authoring
  assert.deepEqual(overlap.rewinds.map(({ furthest, regainMs }) => [furthest, regainMs]), [['CHECKED', 25 * 60_000], ['CHECKED', 15 * 60_000]])
  assert.equal(overlap.regainMs, 25 * 60_000, 'the overlapping recovery is one span of wall time')

  const upgraded = report.runs.find((entry) => entry.run === 'upgraded').authoring
  assert.equal(upgraded.partial, true)
  assert.equal(upgraded.ms, null, 'the start is unknown, so the authoring time is not invented')
  assert.equal(upgraded.startedAt, null)
  assert.deepEqual(upgraded.rewinds.map(({ left, furthest, regainMs }) => [left, furthest, regainMs]), [['CHECKED', 'CHECKED', 20 * 60_000]])
  assert.deepEqual(report.totals.partialRuns, ['upgraded'])
  assert.equal(report.totals.authoringMs, 0)
  assert.equal(report.totals.regainMs, 45 * 60_000)
})

const job = (env, ...args) =>
  spawnSync(process.execPath, [join(SCRIPTS, 'oracle-job.mjs'), ...args], { encoding: 'utf8', env: { ...CHILD_ENV, ...env }, cwd: env.CWD })
const jobId = (started) => started.stdout.match(/^JOB_STARTED (j-\S+) · /)?.[1]
/** 테스트가 풀어 줄 때까지 붙잡혀 있는 명령 — 시간 대신 장벽 파일이 끝을 정한다. */
const heldCommand = (barrier, release, code) => `const fs = require('fs'); console.log('held')
const go = () => { if (fs.existsSync(${JSON.stringify(release)})) process.exit(${code}) }
go(); fs.watch(${JSON.stringify(barrier)}, go)`
const jobDirectory = async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'oracle-jobs-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

test('a long command runs as a job: wait blocks up to its limit, then hands back the log tail and the command\'s own exit code', async (t) => {
  const env = { ORACLE_JOB_DIR: await jobDirectory(t) }
  // the job holds until the test releases a barrier file — the first wait's limit, not a guessed delay, ends it while still running
  const barrier = await jobDirectory(t)
  const release = join(barrier, 'release')
  const held = `const fs = require('fs'); console.log('first')
const go = () => { if (fs.existsSync(${JSON.stringify(release)})) { console.log('last'); process.exit(3) } }
go(); fs.watch(${JSON.stringify(barrier)}, go)`
  const started = job(env, 'start', '--name', 'slow-suite', '--', process.execPath, '-e', held)
  assert.equal(started.status, 0, started.stderr)
  const id = started.stdout.match(/^JOB_STARTED (j-\S+) · /)?.[1]
  assert.match(id ?? '', /^j-\d{8}t\d{6}-[0-9a-f]{6}$/)

  const early = job(env, 'wait', '--job', id, '--max-seconds', '1')
  assert.equal(early.status, 75)
  assert.match(early.stdout, new RegExp(`^JOB_RUNNING ${id} after \\d+s · log .* — run oracle-job\\.mjs wait --job ${id} again\\n$`))

  await writeFile(release, '')
  const done = job(env, 'wait', '--job', id, '--max-seconds', '30')
  assert.equal(done.status, 3, 'wait exits with the command\'s own exit code')
  assert.match(done.stdout, new RegExp(`^first\\nlast\\nJOB_DONE ${id} exit:3 after \\d+s · full log `))
  const record = JSON.parse(job(env, 'status', '--job', id).stdout)
  assert.deepEqual([record.state, record.exitCode, record.name], ['done', 3, 'slow-suite'])
})

test('a single job argument is one shell line; bad ids, limits past the host cap and a shared job directory are refused', async (t) => {
  const directory = await jobDirectory(t)
  const env = { ORACLE_JOB_DIR: directory }
  const started = job(env, 'start', '--', 'echo hello && exit 4')
  assert.equal(started.status, 0, started.stderr)
  const id = started.stdout.match(/^JOB_STARTED (j-\S+) · /)?.[1]
  const done = job(env, 'wait', '--job', id, '--max-seconds', '30')
  assert.equal(done.status, 4)
  assert.match(done.stdout, /^hello\nJOB_DONE /)

  assert.equal(job(env, 'wait', '--job', 'nope').status, 2)
  const unknown = job(env, 'wait', '--job', 'j-20260101t000000-abcdef')
  assert.equal(unknown.status, 1)
  assert.match(unknown.stderr, /^JOB_UNKNOWN: /)
  assert.equal(job(env, 'wait', '--job', id, '--max-seconds', '600').status, 2, 'a wait past a 10-minute host limit would lose its own result')
  assert.equal(job(env, 'start').status, 2, 'start needs a command after --')

  await chmod(directory, 0o777)
  const shared = job(env, 'start', '--', 'true')
  assert.equal(shared.status, 1)
  assert.match(shared.stderr, /^JOB_DIR_UNSAFE: /)
})

test('a job that cannot spawn or exits at once still records its exit, and a command\'s own 75 never reads as still running', async (t) => {
  const env = { ORACLE_JOB_DIR: await jobDirectory(t) }
  const missing = job(env, 'start', '--', 'no-such-command-oracle-job', 'x')
  assert.equal(missing.status, 0, missing.stderr)
  const failed = job(env, 'wait', '--job', jobId(missing), '--max-seconds', '30')
  assert.equal(failed.status, 127)
  assert.match(failed.stdout, /JOB_DONE j-\S+ exit:127 \(spawn failed: [^)]+\) after \d+s/)

  // many quick jobs at once: each exit is recorded even when the command ends before the supervisor writes its pid
  const quick = Array.from({ length: 8 }, (_, index) => [index, jobId(job(env, 'start', '--', `exit ${index + 2}`))])
  for (const [index, id] of quick) assert.equal(job(env, 'wait', '--job', id, '--max-seconds', '30').status, index + 2)

  const ambiguous = job(env, 'wait', '--job', jobId(job(env, 'start', '--', 'exit 75')), '--max-seconds', '30')
  assert.equal(ambiguous.status, 1)
  assert.match(ambiguous.stdout, /JOB_DONE j-\S+ exit:75 \(reported as 1: 75 means still running\)/)

  const nowhere = job(env, 'start', '--cwd', join(env.ORACLE_JOB_DIR, 'missing'), '--', 'true')
  assert.equal(nowhere.status, 2)
  assert.doesNotMatch(nowhere.stdout, /JOB_STARTED/)
})

test('a stuck job stops at its time limit or on cancel, and a relative job directory still finds its records', async (t) => {
  const env = { ORACLE_JOB_DIR: await jobDirectory(t) }
  const barrier = await jobDirectory(t)
  const release = join(barrier, 'never')

  const limited = job(env, 'start', '--timeout-seconds', '1', '--', process.execPath, '-e', heldCommand(barrier, release, 0))
  const stopped = job(env, 'wait', '--job', jobId(limited), '--max-seconds', '60')
  assert.equal(stopped.status, 1)
  assert.match(stopped.stdout, /^held\nJOB_DONE j-\S+ exit:signal SIGTERM \(timed out after 1s\)/)

  const stuck = job(env, 'start', '--', process.execPath, '-e', heldCommand(barrier, release, 0))
  assert.equal(job(env, 'wait', '--job', jobId(stuck), '--max-seconds', '1').status, 75)
  const cancelled = job(env, 'cancel', '--job', jobId(stuck))
  assert.equal(cancelled.status, 0, cancelled.stderr)
  assert.match(cancelled.stdout, /^JOB_CANCELLED j-\S+\n$/)
  assert.match(job(env, 'wait', '--job', jobId(stuck), '--max-seconds', '30').stdout, /JOB_DONE j-\S+ exit:signal SIGTERM/)

  const base = await jobDirectory(t)
  const elsewhere = await jobDirectory(t)
  const relative = { ORACLE_JOB_DIR: 'jobs-relative', CWD: base }
  const started = job(relative, 'start', '--cwd', elsewhere, '--', 'exit 6')
  assert.equal(started.status, 0, started.stderr)
  assert.equal(job(relative, 'wait', '--job', jobId(started), '--max-seconds', '30').status, 6)
  // the start resolved the relative directory against its own cwd (realpath: macOS /var is /private/var)
  assert.equal(JSON.parse(job(relative, 'status', '--job', jobId(started)).stdout).log, join(await realpath(base), 'jobs-relative', `${jobId(started)}.log`))
})
