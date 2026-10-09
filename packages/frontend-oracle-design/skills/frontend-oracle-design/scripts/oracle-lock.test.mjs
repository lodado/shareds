import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { link, mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { fullProductFixture } from '../../../test-fixtures/full-product/fixture.mjs'
import { verifyLock } from './oracle-lock.mjs'

const script = join(dirname(fileURLToPath(import.meta.url)), 'oracle-lock.mjs')

async function contractFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'oracle-lock-contract-race-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const oracle = join(directory, 'oracle.md')
  const lock = join(directory, 'oracle.lock.json')
  const stage = join(directory, 'stage.json')
  const card = `${fullProductFixture().render()}\n## Verification Profile\n\n- Profile: contract/v1\n`
  await writeFile(oracle, card)
  const stageScript = new URL('./oracle-stage.mjs', import.meta.url).pathname
  for (const args of [['begin'], ['advance', '--to', 'CHECKED'], ['advance', '--to', 'DRAFTED']]) {
    const result = spawnSync(process.execPath, [stageScript, ...args, '--dir', directory], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  return { directory, oracle, lock, stage, card }
}

for (const mutation of ['card', 'profile', 'stage', 'late-stage']) {
  test(`public create rejects during-operation staged authorization ${mutation} mutation`, async (t) => {
    const { directory, oracle, lock, stage, card } = await contractFixture(t)
    const stageBytes = await readFile(stage)
    const preload = join(directory, 'mutate.mjs')
    const changedCard = mutation === 'card' ? `${card}\n` : card.replace('contract/v1', 'formal-bend/v1')
    const changesStage = mutation === 'stage' || mutation === 'late-stage'
    const mutationScript = changesStage
      ? `const record = JSON.parse(await fs.readFile(${JSON.stringify(stage)}, 'utf8'))\nrecord.stage = 'DISCOVERING'\nawait fs.writeFile(${JSON.stringify(stage)}, JSON.stringify(record))`
      : `await fs.writeFile(${JSON.stringify(oracle)}, ${JSON.stringify(changedCard)})`
    // realpath(oracle.md): readiness -> snapshot. mkdir(directory): after awaited lint/dependency gates.
    const operation = mutation === 'late-stage' ? 'mkdir' : 'realpath'
    const target = mutation === 'late-stage' ? directory : oracle
    await writeFile(preload, `import fs from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
const original = fs.${operation}
let changed = false
fs.${operation} = async function(path, ...args) {
  if (!changed && path === ${JSON.stringify(target)}) {
    changed = true
    ${mutationScript}
  }
  return original.call(this, path, ...args)
}
syncBuiltinESMExports()
`)
    const result = spawnSync(process.execPath, ['--import', preload, script, 'create', '--oracle', oracle, '--lock', lock], { cwd: directory, encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    const expectedCode = { card: 'STAGE_STALE', profile: 'PROFILE_MISMATCH', stage: 'STAGE_CHANGED', 'late-stage': 'STAGE_CHANGED' }[mutation]
    assert.match(result.stderr, new RegExp(`^${expectedCode}:`))
    assert.doesNotMatch(result.stdout, /ORACLE_LOCKED/)
    await assert.rejects(readFile(lock), { code: 'ENOENT' })
    if (!changesStage) {
      assert.deepEqual(await readFile(stage), stageBytes)
      assert.equal(await readFile(oracle, 'utf8'), changedCard)
    } else assert.equal(JSON.parse(await readFile(stage)).stage, 'DISCOVERING')
  })
}

for (const mutation of ['rewind', 'profile', 'pin', 'replacement']) {
  test(`verify rejects during-operation explicit stage ${mutation}`, async (t) => {
    const { oracle, lock, stage } = await contractFixture(t)
    const created = run('create', '--oracle', oracle, '--lock', lock)
    assert.equal(created.status, 0, created.stderr)
    const lockBytes = await readFile(lock)
    const stageBytes = await readFile(stage)
    const replacement = `${stage}.replacement`
    const record = JSON.parse(stageBytes)
    if (mutation === 'rewind') record.stage = 'DISCOVERING'
    if (mutation === 'profile') delete record.verificationProfile
    if (mutation === 'pin') record.cardSha256 = '0'.repeat(64)
    const changedBytes = mutation === 'replacement' ? stageBytes : Buffer.from(JSON.stringify(record))
    await writeFile(replacement, changedBytes)
    let output = ''
    const originalWrite = process.stdout.write
    process.stdout.write = (chunk) => { output += chunk; return true }
    try {
      await assert.rejects(verifyLock({ lock, sources: [] }, {
        beforeFinalUnchangedAssertions: () => rename(replacement, stage),
      }), (error) => error.code === 'STAGE_CHANGED')
    } finally { process.stdout.write = originalWrite }
    assert.doesNotMatch(output, /ORACLE_VERIFIED/)
    assert.deepEqual(await readFile(lock), lockBytes)
    assert.deepEqual(await readFile(stage), changedBytes)
  })
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/** 여덟 계열 전부 제외 — lint가 요구하는 Case space 선언의 최소형. State Model이 없어 판정할 프레임도 없다. */
const EXCLUDED_CASE_SPACE = `
## Case space

| Family      | Dimension | Choices                 |
| ----------- | --------- | ----------------------- |
| Data        | —         | excluded: fixture scope |
| Value       | —         | excluded: fixture scope |
| Async       | —         | excluded: fixture scope |
| Order       | —         | excluded: fixture scope |
| Entry       | —         | excluded: fixture scope |
| Environment | —         | excluded: fixture scope |
| Platform    | —         | excluded: fixture scope |
| Inherited   | —         | excluded: first revision |
`

const VALID_CARD = `# Lockable Oracle Card

## Outcome Brief

- Actor and context: 저장 화면을 사용하는 사용자
- Observable success: 저장 결과가 정확히 한 번 반영된다.
- Non-goals: 저장 API 재설계
- Worst regression: 중복 저장 또는 입력 유실
- Reversibility: 변경 commit revert
- Risk: Medium
- Sources: S1

## Source Registry

| ID | Kind | 관할 | 기준 | 위치·version | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| S1 | product-policy | 저장 정책 | PRD | repo:docs/save.md#v1 | approved |

## User Confirmation

- Status: approved
- Source: user message Q-confirmation

## 결정된 정책

- P1: 저장 중 추가 제출은 무시한다. (출처: S1) (행: O1)

자동 추가 TC: 오류 N/A (출처: S1), 재시도 N/A (출처: S1), 빈 데이터 0건 N/A (출처: S1), 로딩 N/A (출처: S1), out-of-order N/A (출처: S1), 취소 N/A (출처: S1)

## Behavior Contract

| ID | 정책 | Given | When | Then | Never | 부작용(종류×횟수) | BVA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | P1 | pending | 중복 클릭 | pending 유지 | 두 번째 POST | POST×1(총) | 중복 횟수 |
${EXCLUDED_CASE_SPACE}`

function run(...args) {
  const lockIndex = args.indexOf('--lock')
  const cwd = lockIndex >= 0 ? dirname(args[lockIndex + 1]) : undefined
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' })
}

function runFrom(cwd, ...args) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' })
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'oracle-lock-'))
  t.after(() => rm(directory, { recursive: true, force: true }))

  const oracle = join(directory, 'oracle.md')
  const source = 'docs/save.md'
  const sourcePath = join(directory, source)
  const lock = join(directory, 'oracle.lock.json')
  await mkdir(dirname(sourcePath), { recursive: true })
  await writeFile(oracle, VALID_CARD)
  await writeFile(sourcePath, '# Requirement\n')

  return { lock, oracle, source, sourcePath }
}

test('explicit Formal cannot inherit package-less legacy lock bypass', async (t) => {
  const { lock, oracle, source } = await fixture(t)
  await writeFile(oracle, `${VALID_CARD}\n## Verification Profile\n\n- Profile: formal-bend/v1\n`)
  const result = run('create', '--oracle', oracle, '--lock', lock, '--source', source, '--profile', 'formal-bend/v1')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /^STAGE_NO_PACKAGE:/)
  await assert.rejects(readFile(lock), { code: 'ENOENT' })
})

test('legacy lock and card cannot be authorized through requested Contract profile', async (t) => {
  const { lock, oracle, source } = await fixture(t)
  assert.equal(run('create', '--oracle', oracle, '--lock', lock, '--source', source).status, 0)
  const bytes = await readFile(lock)
  const result = run('create', '--oracle', oracle, '--lock', lock, '--source', source, '--profile', 'contract/v1')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /^PROFILE_MISMATCH:/)
  assert.deepEqual(await readFile(lock), bytes)
})

test('creates and verifies an exact-byte lock', async (t) => {
  const { lock, oracle, source } = await fixture(t)

  const created = run('create', '--oracle', oracle, '--lock', lock, '--source', source)
  assert.equal(created.status, 0, created.stderr)

  const manifest = JSON.parse(await readFile(lock, 'utf8'))
  const firstLock = await readFile(lock, 'utf8')
  assert.equal(manifest.schemaVersion, 1)
  assert.match(manifest.oracle.sha256, /^[a-f0-9]{64}$/)
  assert.equal(manifest.sources.length, 1)
  assert.match(manifest.sources[0].path, /docs\/save\.md$/)

  const recreated = run('create', '--oracle', oracle, '--lock', lock, '--source', source)
  assert.equal(recreated.status, 0, recreated.stderr)
  assert.equal(await readFile(lock, 'utf8'), firstLock)

  const verified = run('verify', '--lock', lock)
  assert.equal(verified.status, 0, verified.stderr)
})

test('rejects changed Oracle and source bytes', async (t) => {
  const { lock, oracle, source, sourcePath } = await fixture(t)
  const created = run('create', '--oracle', oracle, '--lock', lock, '--source', source)
  assert.equal(created.status, 0, created.stderr)

  await writeFile(oracle, VALID_CARD.replace('정확히 한 번 반영된다', '한 번만 반영된다'))
  const changedOracle = run('verify', '--lock', lock)
  assert.equal(changedOracle.status, 1)
  assert.match(changedOracle.stderr, /ORACLE_CHANGED/)

  await writeFile(oracle, VALID_CARD)
  await writeFile(sourcePath, '# Changed Requirement\n')
  const changedSource = run('verify', '--lock', lock)
  assert.equal(changedSource.status, 1)
  assert.match(changedSource.stderr, /SOURCE_CHANGED/)
})

test('refuses to overwrite a changed existing lock', async (t) => {
  const { lock, oracle, source, sourcePath } = await fixture(t)
  const created = run('create', '--oracle', oracle, '--lock', lock, '--source', source)
  assert.equal(created.status, 0, created.stderr)
  const originalLock = await readFile(lock, 'utf8')

  await writeFile(oracle, VALID_CARD.replace('정확히 한 번 반영된다', '한 번만 반영된다'))
  const changedOracle = run('create', '--oracle', oracle, '--lock', lock, '--source', source)
  assert.equal(changedOracle.status, 1)
  assert.match(changedOracle.stderr, /ORACLE_CHANGED/)
  assert.equal(await readFile(lock, 'utf8'), originalLock)

  await writeFile(oracle, VALID_CARD)
  await writeFile(sourcePath, '# Changed Requirement\n')
  const changedSource = run('create', '--oracle', oracle, '--lock', lock, '--source', source)
  assert.equal(changedSource.status, 1)
  assert.match(changedSource.stderr, /SOURCE_CHANGED/)
  assert.equal(await readFile(lock, 'utf8'), originalLock)
})

test('rejects structurally incomplete cards before creating a lock', async (t) => {
  const { lock, oracle, source } = await fixture(t)
  await writeFile(oracle, VALID_CARD.replace(/## Outcome Brief[\s\S]*?## Source Registry/, '## Source Registry'))

  const created = run('create', '--oracle', oracle, '--lock', lock, '--source', source)

  assert.equal(created.status, 1)
  assert.match(created.stderr, /^CARD_LINT_FAILED: /)
  await assert.rejects(readFile(lock, 'utf8'), { code: 'ENOENT' })
})

test('rejects cards whose local Source Registry entries are not locked sources', async (t) => {
  const { lock, oracle, source } = await fixture(t)
  const otherSource = join(dirname(source), 'other.md')
  await writeFile(join(dirname(lock), otherSource), '# Other Requirement\n')

  const created = run('create', '--oracle', oracle, '--lock', lock, '--source', otherSource)

  assert.equal(created.status, 1)
  assert.match(created.stderr, /source-(?:repo-path|lock-missing|lock-unregistered)/)
  assert.match(created.stderr, /docs\/(?:save|other)\.md/)
})

test('requires relative repo sources at lock creation', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'oracle-lock-relative-'))
  t.after(() => rm(directory, { recursive: true, force: true }))

  const oracle = join(directory, 'oracle.md')
  const lock = join(directory, 'oracle.lock.json')
  const source = join(directory, 'docs', 'save.md')
  const otherSource = join(directory, 'docs', 'other.md')
  await mkdir(dirname(source), { recursive: true })
  await writeFile(oracle, VALID_CARD)
  await writeFile(source, '# Requirement\n')
  await writeFile(otherSource, '# Other Requirement\n')

  const missing = runFrom(directory, 'create', '--oracle', 'oracle.md', '--lock', lock)
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /source-(?:repo-path|lock-missing)/)

  const wrong = runFrom(
    directory,
    'create',
    '--oracle',
    'oracle.md',
    '--lock',
    'oracle.lock.json',
    '--source',
    'docs/other.md',
  )
  assert.equal(wrong.status, 1)
  assert.match(wrong.stderr, /source-(?:repo-path|lock-missing|lock-unregistered)/)

  const correct = runFrom(
    directory,
    'create',
    '--oracle',
    'oracle.md',
    '--lock',
    'oracle.lock.json',
    '--source',
    'docs/save.md',
  )
  assert.equal(correct.status, 0, correct.stderr)
})

test('verify reruns card lint against the manifest oracle and exact source set', async (t) => {
  const { lock, oracle, source } = await fixture(t)
  const created = run('create', '--oracle', oracle, '--lock', lock, '--source', source)
  assert.equal(created.status, 0, created.stderr)

  const directory = dirname(lock)
  const otherOracle = join(directory, 'other-oracle.md')
  const otherSource = join(directory, 'docs', 'other.md')
  await writeFile(otherSource, '# Other Requirement\n')
  await writeFile(otherOracle, VALID_CARD.replace('repo:docs/save.md#v1', 'repo:docs/other.md#v1'))

  const manifest = JSON.parse(await readFile(lock, 'utf8'))
  manifest.oracle = { path: 'other-oracle.md', sha256: sha256(await readFile(otherOracle)) }
  await writeFile(lock, `${JSON.stringify(manifest, null, 2)}\n`)

  const verified = run('verify', '--lock', lock)
  assert.equal(verified.status, 1)
  assert.match(verified.stderr, /source-(?:repo-path|lock-missing|lock-unregistered)/)
  assert.match(verified.stderr, /docs\/(?:save|other)\.md/)
})

// 영수증 디렉터리를 테스트마다 격리한다 — 기본 위치(os tmpdir)를 공유하면 같은 바이트의 다른 테스트가 서로의 영수증을 맞힌다.
async function receiptFixture(t) {
  const receipts = await mkdtemp(join(tmpdir(), 'oracle-lint-receipts-'))
  t.after(() => rm(receipts, { recursive: true, force: true }))
  return receipts
}

const runWith = (env, ...args) => {
  const lockIndex = args.indexOf('--lock')
  return spawnSync(process.execPath, [script, ...args], { cwd: dirname(args[lockIndex + 1]), encoding: 'utf8', env: { ...process.env, ...env } })
}

test('verify records a lint receipt and the next verify of the same bytes skips the lint', async (t) => {
  const { lock, oracle, source } = await fixture(t)
  const receipts = await receiptFixture(t)
  const env = { ORACLE_LINT_CACHE: receipts, ORACLE_TIMING: '1' }
  const created = runWith(env, 'create', '--oracle', oracle, '--lock', lock, '--source', source)
  assert.equal(created.status, 0, created.stderr)

  const first = runWith(env, 'verify', '--lock', lock)
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stderr, /^TIMING card-lint miss \d+ms$/m)
  assert.equal((await readdir(receipts)).length, 1)

  const second = runWith(env, 'verify', '--lock', lock)
  assert.equal(second.status, 0, second.stderr)
  assert.match(second.stderr, /^TIMING card-lint hit \d+ms$/m)
  assert.equal(second.stdout, first.stdout)
})

test('a lint receipt never stands in for bytes it was not issued for', async (t) => {
  const { lock, oracle, source, sourcePath } = await fixture(t)
  const receipts = await receiptFixture(t)
  const env = { ORACLE_LINT_CACHE: receipts, ORACLE_TIMING: '1' }
  assert.equal(runWith(env, 'create', '--oracle', oracle, '--lock', lock, '--source', source).status, 0)
  assert.equal(runWith(env, 'verify', '--lock', lock).status, 0)

  // a changed Oracle or source is rejected by the lock before any receipt is looked up
  await writeFile(sourcePath, '# Changed Requirement\n')
  const changedSource = runWith(env, 'verify', '--lock', lock)
  assert.equal(changedSource.status, 1)
  assert.match(changedSource.stderr, /SOURCE_CHANGED/)
  await writeFile(sourcePath, '# Requirement\n')

  // a lint that fails leaves no receipt: the same lock with the manifest pointed at a card the lint rejects
  const directory = dirname(lock)
  const otherOracle = join(directory, 'other-oracle.md')
  await writeFile(join(directory, 'docs', 'other.md'), '# Other Requirement\n')
  await writeFile(otherOracle, VALID_CARD.replace('repo:docs/save.md#v1', 'repo:docs/other.md#v1'))
  const manifest = JSON.parse(await readFile(lock, 'utf8'))
  manifest.oracle = { path: 'other-oracle.md', sha256: sha256(await readFile(otherOracle)) }
  await writeFile(lock, `${JSON.stringify(manifest, null, 2)}\n`)
  const before = (await readdir(receipts)).length
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rejected = runWith(env, 'verify', '--lock', lock)
    assert.equal(rejected.status, 1)
    assert.match(rejected.stderr, /source-(?:repo-path|lock-missing|lock-unregistered)/)
  }
  assert.equal((await readdir(receipts)).length, before)
})

// 영수증 파일 이름만 아는 쪽이 `touch`로 lint를 건너뛰게 할 수 없다 — 내용이 키와 같아야 하고, 심볼릭 링크는 받지 않는다.
test('a planted receipt (empty, wrong content, or a symlink) is not a hit', async (t) => {
  const { lock, oracle, source } = await fixture(t)
  const receipts = await receiptFixture(t)
  const env = { ORACLE_LINT_CACHE: receipts, ORACLE_TIMING: '1' }
  assert.equal(runWith(env, 'create', '--oracle', oracle, '--lock', lock, '--source', source).status, 0)
  assert.equal(runWith(env, 'verify', '--lock', lock).status, 0)
  const [name] = await readdir(receipts)
  const receipt = join(receipts, name)
  assert.equal((await readFile(receipt, 'utf8')).trim(), name)
  const after = async () => runWith(env, 'verify', '--lock', lock).stderr
  assert.match(await after(), /card-lint hit/)

  await writeFile(receipt, '')
  assert.match(await after(), /card-lint miss/)
  assert.equal((await readFile(receipt, 'utf8')).trim(), name)

  await writeFile(receipt, 'something else\n')
  assert.match(await after(), /card-lint miss/)

  await rm(receipt)
  const elsewhere = join(receipts, 'elsewhere')
  await writeFile(elsewhere, `${name}\n`)
  await symlink(elsewhere, receipt)
  assert.match(await after(), /card-lint miss/)
})

test('a receipt issued with Bend installed is not a hit once Bend cannot be found', async (t) => {
  const { lock, oracle, source } = await fixture(t)
  const receipts = await receiptFixture(t)
  const env = { ORACLE_LINT_CACHE: receipts, ORACLE_TIMING: '1' }
  assert.equal(runWith(env, 'create', '--oracle', oracle, '--lock', lock, '--source', source).status, 0)
  assert.equal(runWith(env, 'verify', '--lock', lock).status, 0)
  assert.match(runWith(env, 'verify', '--lock', lock).stderr, /card-lint hit/)
  // no Bend on PATH, none under BEND_HOME or the user cache: the lint decides again instead of trusting the old receipt
  const empty = await mkdtemp(join(tmpdir(), 'oracle-no-bend-'))
  t.after(() => rm(empty, { recursive: true, force: true }))
  const without = runWith({ ...env, PATH: dirname(process.execPath), HOME: empty, BEND_HOME: empty }, 'verify', '--lock', lock)
  assert.match(without.stderr, /card-lint miss/)
})

test('ORACLE_LINT_CACHE=off keeps verify linting every time', async (t) => {
  const { lock, oracle, source } = await fixture(t)
  const env = { ORACLE_LINT_CACHE: 'off', ORACLE_TIMING: '1' }
  assert.equal(runWith(env, 'create', '--oracle', oracle, '--lock', lock, '--source', source).status, 0)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const verified = runWith(env, 'verify', '--lock', lock)
    assert.equal(verified.status, 0, verified.stderr)
    assert.match(verified.stderr, /^TIMING card-lint miss \d+ms$/m)
  }
})

test('rejects an atomic source rename before final verify success', async (t) => {
  const { lock, oracle, source, sourcePath } = await fixture(t)
  const original = `${'# Requirement\n'}${'x'.repeat(8 * 1024 * 1024)}`
  await writeFile(sourcePath, original)
  const created = run('create', '--oracle', oracle, '--lock', lock, '--source', source)
  assert.equal(created.status, 0, created.stderr)

  const replacement = join(dirname(sourcePath), 'save-replacement.md')
  await writeFile(replacement, '# Changed Requirement\n')

  await assert.rejects(
    verifyLock(
      { lock, sources: [] },
      { beforeFinalUnchangedAssertions: () => rename(replacement, sourcePath) },
    ),
    (error) => error.code === 'SOURCE_CHANGED',
  )
})

test('O7: lock lint staging keeps Oracle bytes separate from mirrored sources', async (t) => {
  const { lock: fixtureLock, sourcePath } = await fixture(t)
  const directory = dirname(fixtureLock)
  const candidateDirectory = join(directory, 'candidate')
  const candidate = join(candidateDirectory, 'oracle.md')
  const lock = join(candidateDirectory, 'oracle.lock.json')
  const sourceCard = VALID_CARD.replace('repo:docs/save.md#v1', 'repo:oracle.md#v1')
  const invalidCandidate = sourceCard.replace(/## Outcome Brief[\s\S]*?## Source Registry/, '## Source Registry')

  await mkdir(candidateDirectory)
  await writeFile(candidate, invalidCandidate)
  await writeFile(join(directory, 'oracle.md'), sourceCard)
  await writeFile(sourcePath, '# Requirement\n')

  const created = runFrom(
    directory,
    'create',
    '--oracle',
    'candidate/oracle.md',
    '--lock',
    'candidate/oracle.lock.json',
    '--source',
    'oracle.md',
  )

  assert.notEqual(await readFile(candidate, 'utf8'), await readFile(join(directory, 'oracle.md'), 'utf8'))
  assert.equal(created.status, 1)
  assert.match(created.stderr, /^CARD_LINT_FAILED: /)
  assert.doesNotMatch(created.stdout, /ORACLE_LOCKED/)
  await assert.rejects(readFile(lock, 'utf8'), { code: 'ENOENT' })
})

test('O8: lock rejects out-of-root, symlinked, and hardlinked evidence', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'oracle-lock-boundary-'))
  const outsideDirectory = await mkdtemp(join(tmpdir(), 'oracle-lock-outside-'))
  t.after(() => Promise.all([rm(directory, { recursive: true, force: true }), rm(outsideDirectory, { recursive: true, force: true })]))

  const oracleDirectory = join(directory, '.ai', 'oracles', 'boundary')
  const oracle = join(oracleDirectory, 'oracle.md')
  const lock = join(oracleDirectory, 'oracle.lock.json')
  const source = 'docs/save.md'
  const sourcePath = join(directory, source)
  const outsideOracle = join(outsideDirectory, 'oracle.md')
  await mkdir(oracleDirectory, { recursive: true })
  await mkdir(dirname(sourcePath), { recursive: true })
  await writeFile(oracle, VALID_CARD)
  await writeFile(outsideOracle, VALID_CARD)
  await writeFile(sourcePath, '# Requirement\n')

  const outside = runFrom(
    directory,
    'create',
    '--oracle',
    outsideOracle,
    '--lock',
    lock,
    '--source',
    source,
  )
  assert.equal(outside.status, 1)
  assert.match(outside.stderr, /^ORACLE_PATH_INVALID: /)
  assert.doesNotMatch(outside.stdout, /ORACLE_LOCKED/)
  await assert.rejects(readFile(lock, 'utf8'), { code: 'ENOENT' })

  const oracleAlias = join(oracleDirectory, 'oracle-alias.md')
  await link(oracle, oracleAlias)
  const hardlinkedOracle = runFrom(directory, 'create', '--oracle', oracle, '--lock', lock, '--source', source)
  assert.equal(hardlinkedOracle.status, 1)
  assert.match(hardlinkedOracle.stderr, /^INPUT_UNREADABLE: /)
  await rm(oracleAlias)

  const oracleTarget = join(oracleDirectory, 'oracle-target.md')
  await rename(oracle, oracleTarget)
  await symlink('oracle-target.md', oracle)
  const symlinkedOracle = runFrom(directory, 'create', '--oracle', oracle, '--lock', lock, '--source', source)
  assert.equal(symlinkedOracle.status, 1)
  assert.match(symlinkedOracle.stderr, /^ORACLE_PATH_INVALID: /)
  await rm(oracle)
  await rename(oracleTarget, oracle)

  const sourceAlias = join(directory, 'docs', 'save-alias.md')
  await link(sourcePath, sourceAlias)
  const hardlinkedSource = runFrom(directory, 'create', '--oracle', oracle, '--lock', lock, '--source', source)
  assert.equal(hardlinkedSource.status, 1)
  assert.match(hardlinkedSource.stderr, /^INPUT_UNREADABLE: /)
  await rm(sourceAlias)

  const sourceTarget = join(directory, 'docs', 'save-target.md')
  await rename(sourcePath, sourceTarget)
  await symlink('save-target.md', sourcePath)
  const symlinkedSource = runFrom(directory, 'create', '--oracle', oracle, '--lock', lock, '--source', source)
  assert.equal(symlinkedSource.status, 1)
  assert.match(symlinkedSource.stderr, /^INPUT_UNREADABLE: /)
  await rm(sourcePath)
  await rename(sourceTarget, sourcePath)

  const created = runFrom(directory, 'create', '--oracle', oracle, '--lock', lock, '--source', source)
  assert.equal(created.status, 0, created.stderr)
  const originalManifest = JSON.parse(await readFile(lock, 'utf8'))

  const lockAlias = join(oracleDirectory, 'manifest-alias.json')
  await link(lock, lockAlias)
  const hardlinkedManifest = runFrom(directory, 'verify', '--lock', lock)
  assert.equal(hardlinkedManifest.status, 1)
  assert.match(hardlinkedManifest.stderr, /^LOCK_INVALID: /)
  await rm(lockAlias)

  const manifestTarget = join(oracleDirectory, 'manifest-target.json')
  await rename(lock, manifestTarget)
  await symlink('manifest-target.json', lock)
  const linked = runFrom(directory, 'create', '--oracle', oracle, '--lock', lock, '--source', source)
  assert.equal(linked.status, 1)
  assert.match(linked.stderr, /^LOCK_INVALID: /)
  assert.doesNotMatch(linked.stdout, /ORACLE_LOCKED/)
  await rm(lock)
  await rename(manifestTarget, lock)

  const manifest = structuredClone(originalManifest)
  for (const path of [oracle, '../boundary/oracle.md']) {
    manifest.oracle.path = path
    await writeFile(lock, `${JSON.stringify(manifest, null, 2)}\n`)
    const invalidOraclePath = runFrom(directory, 'verify', '--lock', lock)
    assert.equal(invalidOraclePath.status, 1)
    assert.match(invalidOraclePath.stderr, /^LOCK_INVALID: /)
    assert.doesNotMatch(invalidOraclePath.stdout, /ORACLE_VERIFIED/)
  }

  const absoluteSourceManifest = structuredClone(originalManifest)
  absoluteSourceManifest.sources[0].path = sourcePath
  await writeFile(lock, `${JSON.stringify(absoluteSourceManifest, null, 2)}\n`)
  const absoluteSourcePath = runFrom(directory, 'verify', '--lock', lock)
  assert.equal(absoluteSourcePath.status, 1)
  assert.match(absoluteSourcePath.stderr, /^LOCK_INVALID: /)
  assert.doesNotMatch(absoluteSourcePath.stdout, /ORACLE_VERIFIED/)

  const traversingSourceManifest = structuredClone(originalManifest)
  traversingSourceManifest.sources[0].path = '../../../../docs/save.md'
  await writeFile(lock, `${JSON.stringify(traversingSourceManifest, null, 2)}\n`)
  const traversingSourcePath = runFrom(directory, 'verify', '--lock', lock)
  assert.equal(traversingSourcePath.status, 1)
  assert.match(traversingSourcePath.stderr, /^LOCK_INVALID: /)
  assert.doesNotMatch(traversingSourcePath.stdout, /ORACLE_VERIFIED/)

  await writeFile(lock, `${JSON.stringify(originalManifest, null, 2)}\n`)
  const replacement = join(oracleDirectory, 'replacement.lock.json')
  await writeFile(replacement, `${JSON.stringify(originalManifest)}\n`)

  await assert.rejects(
    verifyLock(
      { lock, sources: [] },
      { beforeFinalUnchangedAssertions: () => rename(replacement, lock) },
    ),
    (error) => error.code === 'LOCK_MANIFEST_CHANGED',
  )
})

test('rejects an invalid lock manifest', async (t) => {
  const { lock } = await fixture(t)
  await writeFile(lock, '{invalid')

  const verified = run('verify', '--lock', lock)
  assert.equal(verified.status, 1)
  assert.match(verified.stderr, /LOCK_INVALID/)
})

test('dep: --dep은 설치 버전을 manifest.dependencies에 고정하고 verify는 드리프트와 무관하게 통과한다', async (t) => {
  const { lock, oracle, source, sourcePath } = await fixture(t)
  const packageJson = join(dirname(sourcePath), '..', 'node_modules', 'pkg-a', 'package.json')
  await mkdir(dirname(packageJson), { recursive: true })
  await writeFile(packageJson, JSON.stringify({ name: 'pkg-a', version: '1.2.3' }))

  const created = run('create', '--oracle', oracle, '--lock', lock, '--source', source, '--dep', 'pkg-a')
  assert.equal(created.status, 0, created.stderr)

  const manifest = JSON.parse(await readFile(lock, 'utf8'))
  assert.deepEqual(manifest.dependencies, [{ name: 'pkg-a', version: '1.2.3' }])

  // dep 버전 드리프트는 verify(바이트 안정성)의 실패 사유가 아니다 — 감지는 oracle-verify sources 소관.
  await writeFile(packageJson, JSON.stringify({ name: 'pkg-a', version: '2.0.0' }))
  const verified = run('verify', '--lock', lock)
  assert.equal(verified.status, 0, verified.stderr)
})

const WITNESS_DEVIATIONS = `
## Deviations

| Policy | Type         | Disposition |
| ------ | ------------ | ----------- |
| P1     | not-provided | covered(O1) |
| P1     | static       | impossible: 저장 버튼은 pending 동안 비활성이다 — code(src/save.ts#L2-L3) |
`

async function witnessFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'oracle-lock-witness-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, '.ai', 'oracles', 'x')
  await mkdir(directory, { recursive: true })
  await mkdir(join(root, 'docs'), { recursive: true })
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(directory, 'oracle.md'), VALID_CARD + WITNESS_DEVIATIONS)
  await writeFile(join(root, 'docs', 'save.md'), '# Requirement\n')
  await writeFile(join(root, 'src', 'save.ts'), 'a\nb\nc\nd\n')
  return { root, oracle: join(directory, 'oracle.md'), lock: join(directory, 'oracle.lock.json') }
}

test('witness: a card whose impossible cell cites code() locks, and the manifest pins the witnessed block', async (t) => {
  const { root, oracle, lock } = await witnessFixture(t)

  // 평문 lint가 통과한 카드는 lock도 통과해야 한다 — 스냅샷이 witness를 못 찾던 결함의 회귀 테스트
  const created = run('create', '--oracle', oracle, '--lock', lock, '--source', 'docs/save.md')
  assert.equal(created.status, 0, created.stderr)
  const manifest = JSON.parse(await readFile(lock, 'utf8'))
  assert.deepEqual(manifest.witnesses, [{ ref: 'src/save.ts#L2-L3', path: 'src/save.ts', lines: 2, sha256: sha256('b\nc') }])

  // verify는 살아 있는 production 바이트로 witness를 다시 풀지 않는다 — 구현 중 파일이 줄어도 exec가 막히지 않는다
  await writeFile(join(root, 'src', 'save.ts'), 'a\n')
  const verified = run('verify', '--lock', lock)
  assert.equal(verified.status, 0, verified.stderr)

  // 카드가 인용한 witness와 manifest가 어긋나면 잠금 자체가 무효다
  await writeFile(lock, `${JSON.stringify({ ...manifest, witnesses: [] }, null, 2)}\n`)
  const tampered = run('verify', '--lock', lock)
  assert.equal(tampered.status, 1)
  assert.match(tampered.stderr, /^LOCK_INVALID: .*witness/)
})

test('witness: a missing witness file still fails the lock lint', async (t) => {
  const { root, oracle, lock } = await witnessFixture(t)
  await rm(join(root, 'src', 'save.ts'))

  const created = run('create', '--oracle', oracle, '--lock', lock, '--source', 'docs/save.md')
  assert.equal(created.status, 1)
  assert.match(created.stderr, /impossible-witness-invalid: P1 × static: code\(src\/save\.ts\) does not exist/)
})

test('dep: 미설치 패키지는 DEP_UNRESOLVED, 다른 dep 집합의 재생성은 SOURCE_CHANGED다', async (t) => {
  const { lock, oracle, source, sourcePath } = await fixture(t)

  const missing = run('create', '--oracle', oracle, '--lock', lock, '--source', source, '--dep', 'pkg-none')
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /DEP_UNRESOLVED/)

  const packageJson = join(dirname(sourcePath), '..', 'node_modules', 'pkg-a', 'package.json')
  await mkdir(dirname(packageJson), { recursive: true })
  await writeFile(packageJson, JSON.stringify({ name: 'pkg-a', version: '1.2.3' }))
  const created = run('create', '--oracle', oracle, '--lock', lock, '--source', source, '--dep', 'pkg-a')
  assert.equal(created.status, 0, created.stderr)

  const recreated = run('create', '--oracle', oracle, '--lock', lock, '--source', source)
  assert.equal(recreated.status, 1)
  assert.match(recreated.stderr, /SOURCE_CHANGED/)
})
