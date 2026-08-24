import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { link, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { verifyLock } from './oracle-lock.mjs'

const script = join(dirname(fileURLToPath(import.meta.url)), 'oracle-lock.mjs')

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

const VALID_CARD = `# Lockable Oracle Card

## Outcome Brief

- Actor and context: 저장 화면을 사용하는 사용자
- Observable success: 저장 결과가 정확히 한 번 반영된다.
- Non-goals: 저장 API 재설계
- Worst regression: 중복 저장 또는 입력 유실
- Reversibility: 변경 commit revert
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
`

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
      { lock, oracle: undefined, sources: [] },
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
      { lock, oracle: undefined, sources: [] },
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
