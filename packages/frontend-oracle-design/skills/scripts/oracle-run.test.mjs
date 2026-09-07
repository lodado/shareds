import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { link, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const script = join(scriptDirectory, 'oracle-run.mjs')
const lockScript = join(scriptDirectory, 'oracle-lock.mjs')
const changeabilityReviewPoint = join(scriptDirectory, '../references/changeability.md')
const checklistReviewPoint = join(scriptDirectory, '../references/review-checklist.md')

const ORACLE = `# Oracle

## Outcome Brief

- Actor and context: 저장 사용자
- Observable success: 저장 상태가 계약대로 표시된다.
- Non-goals: API 재설계
- Worst regression: 중복 저장
- Reversibility: revert
- Sources: S1

## Source Registry

| ID | Kind | 관할 | 기준 | 위치·version | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| S1 | product-policy | 저장 | PRD | user-confirmation | approved |

## User Confirmation

- Status: approved
- Source: user confirmation

## 결정된 정책

- P1: 저장 중 pending을 표시한다. (출처: S1) (행: O1)

## Behavior Contract

| ID | 정책 | Given | When | Then | Never | 부작용(종류×횟수) | BVA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | P1 | 입력 | 저장 | pending | 조기 성공 | POST×1 | 상태: loading |

- N/A: 중복, 오류, 재시도, 빈 데이터, out-of-order, 취소는 이 fixture 범위가 아니다. (출처: S1)
`
const VISUAL_ORACLE = `# Oracle

## Outcome Brief

- Actor and context: 화면 사용자
- Observable success: 시각 관계가 유지된다.
- Non-goals: redesign
- Worst regression: overlap
- Reversibility: revert
- Sources: S1

## Source Registry

| ID | Kind | 관할 | 기준 | 위치·version | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| S1 | product-policy | 디자인 | PRD | user-confirmation | approved |

## User Confirmation

- Status: approved
- Source: user confirmation
- Visual QA authorization: declined

## 결정된 정책

- P1: layout relation을 유지한다. (출처: S1) (행: D1)

## Visual Contract

| ID | 정책 | 축 | 계약 | Never | 출처 | 증거 계층 |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | P1 | layout | relation | overlap | S1 | RELATIONAL |

- N/A: 중복, 오류, 재시도, 빈 데이터, 로딩, out-of-order, 취소는 이 fixture 범위가 아니다. (출처: S1)
`
/** ORACLE에 잠긴 repo 출처 하나를 더한 카드 — SOURCE_CHANGED 드리프트를 만들 수 있는 최소 변형이다. */
const SOURCED_ORACLE = ORACLE.replace(
  '| S1 | product-policy | 저장 | PRD | user-confirmation | approved |',
  '| S1 | product-policy | 저장 | PRD | user-confirmation | approved |\n| S2 | project-constraint | 저장 | 정책 문서 | repo:packages/docs/policy.md#v1 | approved |',
).replace(
  '- P1: 저장 중 pending을 표시한다. (출처: S1) (행: O1)',
  '- P1: 저장 중 pending을 표시한다. (출처: S1, S2) (행: O1)',
)

const MILESTONE_ORACLE = `# Oracle

## Outcome Brief

- Actor and context: 조회 사용자
- Observable success: 목록과 상세가 표시된다.
- Non-goals: API 재설계
- Worst regression: blank
- Reversibility: revert
- Sources: S1

## Source Registry

| ID | Kind | 관할 | 기준 | 위치·version | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| S1 | product-policy | 조회 | PRD | user-confirmation | approved |

## User Confirmation

- Status: approved
- Source: user confirmation

## 결정된 정책

- P1: 목록과 상세를 각각 표시한다. (출처: S1) (행: O1, O2)

## Behavior Contract

| ID | 정책 | Given | When | Then | Never | 부작용(종류×횟수) | BVA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | P1 | list input | load | list shown | blank | GET×1 | state |
| O2 | P1 | detail input | open | detail shown | wrong item | GET×1 | state |

- N/A: 중복, 오류, 재시도, 빈 데이터, 로딩, out-of-order, 취소는 이 fixture 범위가 아니다. (출처: S1)
`
const EVIDENCE = {
  schemaVersion: 1,
  rows: {
    O1: { kind: 'test', name: 'save > pending' },
  },
}

const VISUAL_EVIDENCE = {
  schemaVersion: 1,
  rows: {
    D1: { kind: 'pending', reason: 'visual QA execution is pending', owner: 'frontend-visual-qa' },
  },
}

const MILESTONE_EVIDENCE = {
  schemaVersion: 1,
  rows: {
    O1: { kind: 'test', name: 'list > shown' },
    O2: { kind: 'test', name: 'detail > shown' },
  },
}

const RED_REPORT = {
  testResults: [{ assertionResults: [{ fullName: 'save > pending', status: 'failed' }] }],
}

const GREEN_REPORT = {
  testResults: [{ assertionResults: [{ fullName: 'save > pending', status: 'passed' }] }],
}
const PENDING_REPORT = {
  testResults: [{ assertionResults: [{ fullName: 'save > pending', status: 'pending' }] }],
}

const CLEAR_REVIEW = {
  schemaVersion: 2,
  reviewer: 'code-reviewer',
  reviewerRole: 'code-reviewer',
  reviewerId: 'primary-code-reviewer',
  packetSha256: 'packet-a',
  targetRevision: 'revision-a',
  changeabilityReview: [
    { axis: 'Readability', status: 'PASS', evidence: 'review packet' },
    { axis: 'Predictability', status: 'PASS', evidence: 'review packet' },
    { axis: 'Cohesion', status: 'PASS', evidence: 'review packet' },
    { axis: 'Coupling', status: 'PASS', evidence: 'review packet' },
    { axis: 'Simplicity', status: 'PASS', evidence: 'review packet' },
  ],
  findings: [],
}

/**
 * git hook 안에서 테스트가 돌면 GIT_DIR·GIT_INDEX_FILE 등이 환경에 남아 있어
 * fixture의 `git -C <tmpdir>`가 -C를 무시하고 실제 저장소를 건드린다.
 */
function isolatedEnvironment(environment) {
  // 바깥 `node --test`가 남긴 NODE_TEST_CONTEXT를 물려주면 자식 node --test가
  // test-child 모드로 돌아 exit code와 reporter 출력을 내지 않는다.
  const { NODE_TEST_CONTEXT, ...clean } = process.env

  for (const name of Object.keys(clean)) {
    if (name.startsWith('GIT_')) delete clean[name]
  }

  return { ...clean, ...environment }
}

function run(args, environment) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: isolatedEnvironment(environment),
  })
}

function runAsync(args, environment) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: isolatedEnvironment(environment),
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

async function allLedgerLines(oracleDirectory) {
  try {
    const raw = await readFile(join(oracleDirectory, 'runs.jsonl'), 'utf8')
    return raw.split('\n').filter(Boolean)
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

async function ledgerLines(oracleDirectory) {
  return (await allLedgerLines(oracleDirectory)).filter((line) => JSON.parse(line).type !== 'init')
}

async function state(oracleDirectory) {
  return JSON.parse(await readFile(join(oracleDirectory, 'run-state.json'), 'utf8'))
}

/** 명령이 실제로 실행됐는지 세는 부작용 카운터 — 실행마다 marker 파일에 한 줄을 붙인다. */
function appendMarker(markerPath, exitCode) {
  return ['-e', `require('node:fs').appendFileSync(${JSON.stringify(markerPath)}, 'x\\n'); process.exit(${exitCode})`]
}

/** scan-root 전체의 `상대경로 → sha256` 스냅샷. 부작용 횟수 검증에 쓴다. */
async function snapshotOf(root, prefix = '') {
  const entries = await readdir(join(root, prefix), { withFileTypes: true })
  const digests = {}

  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name

    if (entry.isDirectory()) Object.assign(digests, await snapshotOf(root, path))
    else if (entry.isFile())
      digests[path] = createHash('sha256')
        .update(await readFile(join(root, path)))
        .digest('hex')
  }

  return digests
}

async function markerCount(markerPath) {
  try {
    const raw = await readFile(markerPath, 'utf8')
    return raw.split('\n').filter(Boolean).length
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }
}

async function workspace(
  t,
  {
    risk = 'medium',
    git = false,
    requiredLabels = ['behavior'],
    oracleContent = ORACLE,
    evidence = EVIDENCE,
    harnessFiles = {},
    milestones = [],
    initialFiles = {},
    sourceFiles = {},
    initialize = true,
  } = {},
) {
  const repository = await mkdtemp(join(tmpdir(), 'oracle-run-'))
  const root = join(repository, 'packages')
  await mkdir(root, { recursive: true })
  t.after(() => rm(repository, { recursive: true, force: true }))

  if (git) {
    const initialized = spawnSync('git', ['init', '-q', repository], { encoding: 'utf8', env: isolatedEnvironment() })
    if (initialized.status !== 0) return null
    await writeFile(join(repository, '.gitignore'), 'node_modules/\n')
  }

  const oracleDirectory = join(repository, '.ai', 'oracles', 'sample')
  await mkdir(oracleDirectory, { recursive: true })
  await mkdir(join(root, 'src'), { recursive: true })

  const oracle = join(oracleDirectory, 'oracle.md')
  const lock = join(oracleDirectory, 'oracle.lock.json')
  await writeFile(oracle, oracleContent)
  await writeFile(join(oracleDirectory, 'evidence.json'), JSON.stringify(evidence))
  await writeFile(join(oracleDirectory, 'findings.json'), JSON.stringify(CLEAR_REVIEW))
  await writeFile(join(oracleDirectory, 'implementation-decision.md'), 'Implement the approved change.\n')
  await writeFile(
    join(root, 'oracle-green-fixture.test.mjs'),
    "import test from 'node:test'\ntest('save > pending', () => {})\n",
  )
  for (const [path, content] of Object.entries({ ...initialFiles, ...sourceFiles, ...harnessFiles })) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }

  const lockArgs = ['create', '--oracle', oracle, '--lock', lock]
  // oracle-lock은 --source를 저장소 루트 기준으로 푼다. fixture 파일은 scan root(<repo>/packages) 아래에
  // 쓰이므로 그 접두사를 붙여야 잠긴 경로와 실제 경로가 같아진다.
  for (const path of Object.keys(sourceFiles)) lockArgs.push('--source', `packages/${path}`)
  const locked = spawnSync(process.execPath, [lockScript, ...lockArgs], {
    cwd: root,
    encoding: 'utf8',
    env: isolatedEnvironment(),
  })
  assert.equal(locked.status, 0, locked.stderr)
  const receipt = locked.stdout.trim().match(/^ORACLE_LOCKED sha256:([a-f0-9]{64}) manifest-sha256:([a-f0-9]{64})$/)
  assert.ok(receipt, locked.stdout)
  assert.equal(receipt[1], createHash('sha256').update(oracleContent).digest('hex'))
  assert.equal(
    receipt[2],
    createHash('sha256')
      .update(await readFile(lock))
      .digest('hex'),
  )

  const initArgs = ['init', '--dir', oracleDirectory, '--lock', lock, '--risk', risk, '--scan-root', root]
  for (const label of requiredLabels) initArgs.push('--required-label', label)
  for (const path of Object.keys(harnessFiles)) initArgs.push('--harness-path', path)
  for (const milestone of milestones) initArgs.push('--milestone', milestone)

  if (initialize) {
    const initialized = run(initArgs)
    assert.equal(initialized.status, 0, initialized.stderr)
  }

  return { root, oracleDirectory, oracle, lock, marker: join(root, 'marker.txt') }
}

function strictReviewPacketArgs(oracleDirectory, output) {
  return [
    'review-packet',
    '--dir',
    oracleDirectory,
    '--decision',
    join(oracleDirectory, 'implementation-decision.md'),
    '--review-point',
    checklistReviewPoint,
    '--review-point',
    changeabilityReviewPoint,
    '--output',
    output,
  ]
}

function bindReviewDocument(path, packetSha256, targetRevision) {
  const document = JSON.parse(readFileSync(path, 'utf8'))
  if (document.schemaVersion !== 2) return
  document.packetSha256 = packetSha256
  document.targetRevision = targetRevision
  document.findings = (document.findings ?? []).map((finding) => ({ ...finding, packetSha256, targetRevision }))
  delete document.orchestrationReceipt
  writeFileSync(path, JSON.stringify(document))
}

let reviewSequence = 0

function issueReviewReceipt(oracleDirectory, packetPath, findingsPath, revision) {
  const document = JSON.parse(readFileSync(findingsPath, 'utf8'))
  reviewSequence += 1
  return run([
    'review-receipt',
    '--dir',
    oracleDirectory,
    '--packet',
    packetPath,
    '--revision',
    revision,
    '--findings',
    findingsPath,
    '--role',
    document.reviewerRole,
    '--reviewer',
    document.reviewerId,
    '--task-id',
    `review-${document.reviewerId}-${reviewSequence}`,
  ])
}

function transition(oracleDirectory, to, runId, extra = []) {
  const args = ['transition', '--dir', oracleDirectory, '--to', to, '--run', runId]

  if (to === 'VALID_RED') {
    args.push('--evidence', join(oracleDirectory, 'evidence.json'), '--row', 'O1')
  } else if (to === 'IMPLEMENTED_GREEN' || to === 'REVIEW_VERIFIED') {
    args.push('--evidence', join(oracleDirectory, 'evidence.json'))
  }

  if (to === 'REVIEW_VERIFIED') {
    const findings = join(oracleDirectory, 'findings.json')
    args.push('--findings', findings)
    if (!extra.includes('--packet')) {
      const packetPath = join(oracleDirectory, `review-${runId}.json`)
      const packetResult = run(strictReviewPacketArgs(oracleDirectory, packetPath))
      if (packetResult.status === 0) {
        const packetRaw = readFileSync(packetPath, 'utf8')
        const packet = JSON.parse(packetRaw)
        const revision = packet.targetSnapshot?.worktreeSha256
        const packetSha256 = createHash('sha256').update(packetRaw).digest('hex')
        bindReviewDocument(findings, packetSha256, revision)
        const intersectIndex = extra.indexOf('--intersect')
        if (intersectIndex >= 0) bindReviewDocument(extra[intersectIndex + 1], packetSha256, revision)
        for (const path of [findings, ...(intersectIndex >= 0 ? [extra[intersectIndex + 1]] : [])]) {
          const receipt = issueReviewReceipt(oracleDirectory, packetPath, path, revision)
          if (receipt.status !== 0) return receipt
        }
        args.push('--packet', packetPath, '--revision', revision)
      }
    }
  }

  return run([...args, ...extra])
}

let reportSequence = 0

function redRun(oracleDirectory, { exitCode = 1, report = true, environment } = {}) {
  const args = ['exec', '--dir', oracleDirectory, '--label', 'red']
  if (report) {
    reportSequence += 1
    const reportPath = join(oracleDirectory, `red-report-${reportSequence}.ndjson`)
    const testPath = resolve(oracleDirectory, '../../../packages/oracle-red-fixture.test.mjs')
    const assertion = exitCode === 0 ? '' : "throw new Error('expected RED')"
    writeFileSync(testPath, `import test from 'node:test'\ntest('save > pending', () => { ${assertion} })\n`)
    args.push('--adapter', 'node-test', '--report', reportPath, '--', process.execPath, '--test', testPath)
  } else {
    args.push('--', process.execPath, '-e', `process.exit(${exitCode})`)
  }
  return run(args, environment)
}

test('O1: exec는 명령을 한 번 실행하고 ledger에 한 줄을 남긴다', async (t) => {
  const { root, oracleDirectory, marker } = await workspace(t)
  const before = await snapshotOf(root)

  const executed = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red-1',
    '--',
    process.execPath,
    ...appendMarker(marker, 0),
  ])

  assert.equal(executed.status, 0, executed.stderr)
  assert.match(executed.stdout, /^RUN_RECORDED r-001 exit:0 grade:exit-only commandMs:\d+ wrapperMs:\d+\n$/)
  assert.equal(await markerCount(marker), 1)

  const lines = await ledgerLines(oracleDirectory)
  assert.equal(lines.length, 1)
  assert.equal(JSON.parse((await allLedgerLines(oracleDirectory))[0]).type, 'init')

  const record = JSON.parse(lines[0])
  assert.equal(record.runId, 'r-001')
  assert.equal(record.label, 'red-1')
  assert.equal(record.exitCode, 0)
  assert.equal(record.grade, 'exit-only')
  assert.equal(record.command[0], process.execPath)
  assert.match(record.lockSha256, /^[a-f0-9]{64}$/)
  assert.match(record.lockManifestSha256, /^[a-f0-9]{64}$/)
  assert.equal(record.provenance.targetSnapshot.lockManifestSha256, record.lockManifestSha256)
  assert.match(record.worktreeSha256, /^[a-f0-9]{64}$/)
  assert.match(record.productionSha256, /^[a-f0-9]{64}$/)
  assert.equal(typeof record.env.node, 'string')
  assert.match(record.at, /^\d{4}-\d{2}-\d{2}T/)
  assert.ok(Number.isInteger(record.commandMs) && record.commandMs >= 0)
  assert.ok(Number.isInteger(record.wrapperMs) && record.wrapperMs >= 0)

  // product write×0 — scan root에서는 실행 marker 외 파일이 바뀌지 않는다.
  const changed = Object.entries(await snapshotOf(root)).filter(([path, digest]) => before[path] !== digest)
  assert.deepEqual(changed.map(([path]) => path).sort(), ['marker.txt'])
})

test('O2: lock mismatch면 명령을 실행하지 않고 ORACLE_CHANGED로 멈춘다', async (t) => {
  const { oracleDirectory, oracle, marker } = await workspace(t)
  await writeFile(oracle, '# Tampered Oracle\n')

  const executed = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red-1',
    '--',
    process.execPath,
    ...appendMarker(marker, 0),
  ])

  assert.equal(executed.status, 1)
  assert.match(executed.stderr, /^ORACLE_CHANGED: /)
  assert.equal(await markerCount(marker), 0)
  assert.deepEqual(await ledgerLines(oracleDirectory), [])
})

test('O3: generic reporter JSON is retained as exit-only and cannot claim trusted reporting', async (t) => {
  const { root, oracleDirectory } = await workspace(t)

  const vitestReport = join(root, 'vitest.json')
  const vitestRun = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red-1',
    '--report',
    vitestReport,
    '--',
    process.execPath,
    '-e',
    `require('node:fs').writeFileSync(${JSON.stringify(vitestReport)}, ${JSON.stringify(
      JSON.stringify({
        testResults: [
          {
            assertionResults: [
              { fullName: 'save > pending 표시', status: 'passed' },
              { fullName: 'save > POST 1회', status: 'failed' },
            ],
          },
        ],
      }),
    )}); process.exit(1)`,
  ])
  assert.equal(vitestRun.status, 0, vitestRun.stderr)
  assert.match(vitestRun.stdout, /^RUN_RECORDED r-001 exit:1 grade:exit-only commandMs:\d+ wrapperMs:\d+\n$/)

  const nodeReport = join(root, 'node-report.ndjson')
  const nodeRun = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'green-1',
    '--report',
    nodeReport,
    '--',
    process.execPath,
    '-e',
    `require('node:fs').writeFileSync(${JSON.stringify(nodeReport)}, ${JSON.stringify(
      [
        JSON.stringify({
          type: 'test:pass',
          data: { name: 'ledger는 한 줄을 남긴다', status: 'passed', test: true },
        }),
        JSON.stringify({
          type: 'test:fail',
          data: { name: 'lock mismatch를 막는다', status: 'failed', test: true },
        }),
        '',
      ].join('\n'),
    )}); process.exit(0)`,
  ])
  assert.equal(nodeRun.status, 1)
  assert.match(nodeRun.stderr, /^REPORT_NONPASSING: /)

  const playwrightReport = join(root, 'playwright.json')
  const playwrightRun = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'green-2',
    '--report',
    playwrightReport,
    '--',
    process.execPath,
    '-e',
    `require('node:fs').writeFileSync(${JSON.stringify(playwrightReport)}, ${JSON.stringify(
      JSON.stringify({
        suites: [
          {
            title: 'hero.style.spec.ts',
            specs: [
              {
                title: '320px 스냅샷',
                ok: true,
                tests: [{ status: 'expected', expectedStatus: 'passed', results: [{ status: 'passed' }] }],
              },
            ],
            suites: [
              {
                title: 'dark',
                specs: [
                  {
                    title: 'contrast',
                    ok: false,
                    tests: [{ status: 'unexpected', expectedStatus: 'passed', results: [{ status: 'failed' }] }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    )}); process.exit(0)`,
  ])
  assert.equal(playwrightRun.status, 1)
  assert.match(playwrightRun.stderr, /^REPORT_NONPASSING: /)

  const [first, second, third] = (await ledgerLines(oracleDirectory)).map((line) => JSON.parse(line))
  assert.deepEqual(first.tests, [
    { name: 'save > pending 표시', status: 'passed' },
    { name: 'save > POST 1회', status: 'failed' },
  ])
  assert.deepEqual(second.tests, [
    { name: 'ledger는 한 줄을 남긴다', status: 'passed' },
    { name: 'lock mismatch를 막는다', status: 'failed' },
  ])
  assert.deepEqual(third.tests, [
    { name: 'hero.style.spec.ts > 320px 스냅샷', status: 'passed' },
    { name: 'hero.style.spec.ts > dark > contrast', status: 'failed' },
  ])
})

test('O3: node-test adapter owns reporter output and records actual test names', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  const target = join(root, 'sample.test.mjs')
  const report = join(root, 'report.ndjson')

  await writeFile(
    target,
    [
      "import assert from 'node:assert/strict'",
      "import test from 'node:test'",
      "test('통과하는 계약', () => assert.equal(1, 1))",
      "test('실패하는 계약', () => assert.equal(1, 2))",
      '',
    ].join('\n'),
  )

  const executed = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red-1',
    '--adapter',
    'node-test',
    '--report',
    report,
    '--',
    process.execPath,
    '--test',
    target,
  ])

  assert.equal(executed.status, 0, executed.stderr)
  assert.match(executed.stdout, /^RUN_RECORDED r-001 exit:1 grade:reported commandMs:\d+ wrapperMs:\d+\n$/)

  const [record] = (await ledgerLines(oracleDirectory))
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.type === 'run')
  assert.deepEqual(record.tests, [
    { name: '통과하는 계약', status: 'passed' },
    { name: '실패하는 계약', status: 'failed' },
  ])
})

test('O2: lock manifest byte changes stop runner operations even when declared hashes are updated', async (t) => {
  const { oracleDirectory, lock, marker } = await workspace(t)
  const manifest = JSON.parse(await readFile(lock, 'utf8'))
  manifest.sources = [...manifest.sources]
  await writeFile(lock, `${JSON.stringify(manifest)}\n`)

  const executed = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red-1',
    '--',
    process.execPath,
    ...appendMarker(marker, 0),
  ])

  assert.equal(executed.status, 1)
  assert.match(executed.stderr, /^LOCK_MANIFEST_CHANGED: /)
  assert.equal(await markerCount(marker), 0)

  const status = run(['status', '--dir', oracleDirectory, '--json'])
  assert.equal(status.status, 0, status.stderr)
  assert.deepEqual(JSON.parse(status.stdout).blockers, ['LOCK_MANIFEST_CHANGED'])
})

test('O3: signal-terminated commands leave a receipt but cannot be used as evidence', async (t) => {
  const { oracleDirectory } = await workspace(t)
  const report = join(oracleDirectory, 'signal-report.json')

  const executed = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red',
    '--report',
    report,
    '--',
    process.execPath,
    '-e',
    `require('node:fs').writeFileSync(${JSON.stringify(report)}, ${JSON.stringify(
      JSON.stringify(RED_REPORT),
    )}); process.kill(process.pid, 'SIGKILL')`,
  ])

  assert.equal(executed.status, 1)
  assert.match(executed.stderr, /^COMMAND_TERMINATED: /)
  const [record] = (await ledgerLines(oracleDirectory)).map(JSON.parse)
  assert.equal(record.runId, 'r-001')
  assert.equal(record.exitCode, null)
  assert.equal(record.signal, 'SIGKILL')
  assert.equal(record.grade, 'exit-only')

  const transitioned = transition(oracleDirectory, 'VALID_RED', 'r-001')
  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^RUN_NOT_RED: /)
})

test('O3: pre-existing reporter artifact must be rewritten by the command', async (t) => {
  const { oracleDirectory } = await workspace(t)
  const report = join(oracleDirectory, 'stale-report.json')
  await writeFile(report, JSON.stringify(GREEN_REPORT))

  const executed = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'behavior',
    '--report',
    report,
    '--',
    process.execPath,
    '-e',
    'process.exit(0)',
  ])

  assert.equal(executed.status, 1)
  assert.match(executed.stderr, /^REPORT_STALE: /)
  const [record] = (await ledgerLines(oracleDirectory)).map(JSON.parse)
  assert.equal(record.reportError.includes('not rewritten'), true)
})

test('O3: exec never deletes a caller-owned pre-existing report file', async (t) => {
  const { oracleDirectory } = await workspace(t)
  const report = join(oracleDirectory, 'caller-owned.json')
  await writeFile(report, JSON.stringify(GREEN_REPORT))

  const executed = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'behavior',
    '--report',
    report,
    '--',
    process.execPath,
    '-e',
    'process.exit(0)',
  ])

  assert.equal(executed.status, 1)
  assert.match(executed.stderr, /^REPORT_STALE: /)
  assert.equal(await readFile(report, 'utf8'), JSON.stringify(GREEN_REPORT))
})

test('O3: generic reporter artifact rewritten during the run remains exit-only', async (t) => {
  const { oracleDirectory } = await workspace(t)
  const report = join(oracleDirectory, 'fresh-report.json')
  await writeFile(report, JSON.stringify(RED_REPORT))

  const executed = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'behavior',
    '--report',
    report,
    '--',
    process.execPath,
    '-e',
    `require('node:fs').writeFileSync(${JSON.stringify(report)}, ${JSON.stringify(
      JSON.stringify(GREEN_REPORT),
    )}); process.exit(0)`,
  ])

  assert.equal(executed.status, 0, executed.stderr)
  assert.match(executed.stdout, /^RUN_RECORDED r-001 exit:0 grade:exit-only commandMs:\d+ wrapperMs:\d+\n$/)
})

test('O3: stale failing reporter cannot forge VALID_RED and still leaves an exec receipt', async (t) => {
  const { oracleDirectory } = await workspace(t)
  await writeFile(join(oracleDirectory, 'red-report.json'), JSON.stringify(RED_REPORT))

  const executed = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red',
    '--report',
    join(oracleDirectory, 'red-report.json'),
    '--',
    process.execPath,
    '-e',
    'process.exit(1)',
  ])
  assert.equal(executed.status, 1)
  assert.match(executed.stderr, /^REPORT_STALE: /)
  const [record] = (await ledgerLines(oracleDirectory)).map(JSON.parse)
  assert.equal(record.exitCode, 1)
  assert.equal(record.grade, 'exit-only')
  assert.equal(record.reportError.includes('not rewritten'), true)
})

test('O3: touching a pre-existing report without changing content is stale', async (t) => {
  const { oracleDirectory } = await workspace(t)
  const report = join(oracleDirectory, 'touch-report.json')
  await writeFile(report, JSON.stringify(GREEN_REPORT))

  const executed = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'behavior',
    '--report',
    report,
    '--',
    process.execPath,
    '-e',
    `const fs = require('node:fs'); fs.utimesSync(${JSON.stringify(report)}, new Date(), new Date()); process.exit(0)`,
  ])

  assert.equal(executed.status, 1)
  assert.match(executed.stderr, /^REPORT_STALE: /)
  const [record] = (await ledgerLines(oracleDirectory)).map(JSON.parse)
  assert.equal(record.grade, 'exit-only')
  assert.equal(record.reportError.includes('not rewritten'), true)
})

test('O3: empty structured reporter is exit-only and cannot become RED or GREEN evidence', async (t) => {
  const { oracleDirectory } = await workspace(t)
  const report = join(oracleDirectory, 'empty-report.json')
  const emptyReport = { testResults: [] }
  const red = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red',
    '--report',
    report,
    '--',
    process.execPath,
    '-e',
    `require('node:fs').writeFileSync(${JSON.stringify(report)}, ${JSON.stringify(
      JSON.stringify(emptyReport),
    )}); process.exit(1)`,
  ])
  assert.equal(red.status, 1)
  assert.match(red.stderr, /^REPORT_EMPTY: /)
  const [redReceipt] = (await ledgerLines(oracleDirectory)).map(JSON.parse)
  assert.equal(redReceipt.grade, 'exit-only')
  assert.equal(redReceipt.reportErrorCode, 'REPORT_EMPTY')

  const redTransition = transition(oracleDirectory, 'VALID_RED', 'r-001')
  assert.equal(redTransition.status, 1)
  assert.match(redTransition.stderr, /^RED_EVIDENCE_UNVERIFIABLE: /)

  const greenWorkspace = await workspace(t)
  const greenReport = join(greenWorkspace.oracleDirectory, 'empty-report.json')
  const green = run([
    'exec',
    '--dir',
    greenWorkspace.oracleDirectory,
    '--label',
    'behavior',
    '--report',
    greenReport,
    '--',
    process.execPath,
    '-e',
    `require('node:fs').writeFileSync(${JSON.stringify(greenReport)}, ${JSON.stringify(
      JSON.stringify(emptyReport),
    )}); process.exit(0)`,
  ])
  assert.equal(green.status, 1)
  assert.match(green.stderr, /^REPORT_EMPTY: /)
  const [greenReceipt] = (await ledgerLines(greenWorkspace.oracleDirectory)).map(JSON.parse)
  assert.equal(greenReceipt.grade, 'exit-only')
  assert.equal(greenReceipt.reportErrorCode, 'REPORT_EMPTY')

  const greenTransition = transition(greenWorkspace.oracleDirectory, 'IMPLEMENTED_GREEN', 'r-001', [
    '--reason',
    'existing implementation already satisfies deterministic rows',
  ])
  assert.equal(greenTransition.status, 1)
  assert.match(greenTransition.stderr, /^RUN_NOT_GREEN: /)
})

test('O4: reporter를 읽거나 파싱할 수 없으면 exit-only로 격하하고 exit code를 보존한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)

  const missingReport = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red-1',
    '--report',
    join(root, 'absent.json'),
    '--',
    process.execPath,
    '-e',
    'process.exit(3)',
  ])
  assert.equal(missingReport.status, 1)
  assert.match(missingReport.stderr, /^REPORT_MISSING: /)

  const unknownShape = join(root, 'unknown.json')
  const unknownReport = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red-2',
    '--report',
    unknownShape,
    '--',
    process.execPath,
    '-e',
    `require('node:fs').writeFileSync(${JSON.stringify(unknownShape)}, ${JSON.stringify(
      JSON.stringify({ totals: { passed: 12 } }),
    )}); process.exit(4)`,
  ])
  assert.equal(unknownReport.status, 0, unknownReport.stderr)
  assert.match(unknownReport.stdout, /^RUN_RECORDED r-002 exit:4 grade:exit-only commandMs:\d+ wrapperMs:\d+\n$/)

  const records = (await ledgerLines(oracleDirectory)).map((line) => JSON.parse(line))
  assert.equal(records[0].tests, null)
  assert.equal(records[1].tests, null)
  assert.equal(records[0].reportError.length > 0, true)
})

test('O5: 테스트 파일만 바뀐 상태의 non-zero run은 VALID_RED로 전이된다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")

  const executed = redRun(oracleDirectory)
  assert.equal(executed.status, 0, executed.stderr)

  const transitioned = transition(oracleDirectory, 'VALID_RED', 'r-001')
  assert.equal(transitioned.status, 0, transitioned.stderr)
  assert.match(transitioned.stdout, /^STATE_VALID_RED run:r-001\n$/)

  const current = await state(oracleDirectory)
  assert.equal(current.state, 'VALID_RED')
  assert.equal(current.history.length, 2)
  assert.equal(Object.keys(current.testFiles).length, 3)
  assert.equal(current.testFiles['src/save.test.mjs'].assertions, 1)
})

test('O6: RED 전에 production 파일이 바뀌면 PRODUCTION_TOUCHED_BEFORE_RED로 거부한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = () => null\n')

  redRun(oracleDirectory)
  const transitioned = transition(oracleDirectory, 'VALID_RED', 'r-001')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^PRODUCTION_TOUCHED_BEFORE_RED: /)
  assert.match(transitioned.stderr, /src\/save\.mjs/)
  assert.doesNotMatch(transitioned.stderr, /src\/save\.test\.mjs/)
  assert.equal((await state(oracleDirectory)).state, 'ORACLE_READY')
})

test('O6: harness-path는 scan root 안의 존재하는 정확한 파일만 받는다', async (t) => {
  const { root, oracleDirectory, lock } = await workspace(t, { initialize: false })
  await mkdir(join(root, 'config'), { recursive: true })
  const base = [
    'init',
    '--dir',
    oracleDirectory,
    '--lock',
    lock,
    '--risk',
    'medium',
    '--scan-root',
    root,
    '--required-label',
    'behavior',
  ]

  for (const path of ['vitest*.ts', 'config', '../outside.ts', 'missing.ts']) {
    const initialized = run([...base, '--harness-path', path])
    assert.equal(initialized.status, 1, path)
    assert.match(initialized.stderr, /^HARNESS_PATH_INVALID: /, path)
  }
})

test('O6: 등록한 harness는 RED 전에 바꿀 수 있고 RED 후 변경은 예산과 새 RED를 요구한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t, {
    harnessFiles: { 'vitest.config.mjs': 'export default { setup: 1 }\n' },
  })
  const harness = join(root, 'vitest.config.mjs')
  await writeFile(harness, 'export default { setup: 2 }\n')
  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")
  redRun(oracleDirectory)
  assert.equal(transition(oracleDirectory, 'VALID_RED', 'r-001').status, 0)

  await writeFile(harness, 'export default { setup: 3 }\n')
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const withoutBudget = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')
  assert.equal(withoutBudget.status, 1)
  assert.match(withoutBudget.stderr, /^HARNESS_BUDGET_REQUIRED: /)

  assert.equal(
    run(['budget', '--dir', oracleDirectory, '--spend', 'harness', '--reason', 'test setup changed']).status,
    0,
  )
  const withoutRed = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')
  assert.equal(withoutRed.status, 1)
  assert.match(withoutRed.stderr, /^HARNESS_RED_REQUIRED: /)

  redRun(oracleDirectory)
  greenRun(oracleDirectory, 'green-3')
  greenRun(oracleDirectory, 'green-4')
  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-006')
  assert.equal(transitioned.status, 0, transitioned.stderr)
})

test('O6: milestone은 알려진 행을 중복 없이 한 번씩만 소유한다', async (t) => {
  const { root, oracleDirectory, lock } = await workspace(t, { initialize: false })
  const base = [
    'init',
    '--dir',
    oracleDirectory,
    '--lock',
    lock,
    '--risk',
    'medium',
    '--scan-root',
    root,
    '--required-label',
    'behavior',
  ]

  for (const definitions of [['bad'], ['one:O99'], ['one:O1', 'two:O1']]) {
    const args = [...base]
    for (const definition of definitions) args.push('--milestone', definition)
    const initialized = run(args)
    assert.equal(initialized.status, 1, definitions.join(' '))
    assert.match(initialized.stderr, /^MILESTONE_INVALID: /)
  }
})

test('O6: signal-terminated milestone reporter cannot satisfy milestone RED', async (t) => {
  const { root, oracleDirectory } = await workspace(t, {
    oracleContent: MILESTONE_ORACLE,
    evidence: MILESTONE_EVIDENCE,
    milestones: ['list:O1', 'detail:O2'],
  })
  await writeFile(join(root, 'src', 'milestones.test.mjs'), "import 'node:assert'\n")
  const listReport = join(oracleDirectory, 'red-list.json')
  const detailReport = join(oracleDirectory, 'red-detail.json')
  const listContent = { testResults: [{ assertionResults: [{ fullName: 'list > shown', status: 'failed' }] }] }
  const detailContent = { testResults: [{ assertionResults: [{ fullName: 'detail > shown', status: 'failed' }] }] }

  const signaled = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red:list',
    '--report',
    listReport,
    '--',
    process.execPath,
    '-e',
    `require('node:fs').writeFileSync(${JSON.stringify(listReport)}, ${JSON.stringify(
      JSON.stringify(listContent),
    )}); process.kill(process.pid, 'SIGKILL')`,
  ])
  assert.equal(signaled.status, 1)
  assert.match(signaled.stderr, /^COMMAND_TERMINATED: /)

  const detail = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red:detail',
    '--report',
    detailReport,
    '--',
    process.execPath,
    '-e',
    `require('node:fs').writeFileSync(${JSON.stringify(detailReport)}, ${JSON.stringify(
      JSON.stringify(detailContent),
    )}); process.exit(1)`,
  ])
  assert.equal(detail.status, 0, detail.stderr)

  const transitioned = transition(oracleDirectory, 'VALID_RED', 'r-002')
  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^MILESTONE_RED_INVALID: /)
})

test('O6: 모든 milestone의 red:<name> reported RED 후에만 전역 VALID_RED로 간다', async (t) => {
  const { root, oracleDirectory } = await workspace(t, {
    oracleContent: MILESTONE_ORACLE,
    evidence: MILESTONE_EVIDENCE,
    milestones: ['list:O1', 'detail:O2'],
  })
  await writeFile(join(root, 'src', 'milestones.test.mjs'), "import 'node:assert'\n")
  for (const [label, name] of [
    ['red:list', 'list > shown'],
    ['red:detail', 'detail > shown'],
  ]) {
    reportSequence += 1
    const report = join(oracleDirectory, `${label.replace(':', '-')}-${reportSequence}.ndjson`)
    const target = join(root, `${label.replace(':', '-')}.test.mjs`)
    await writeFile(
      target,
      `import test from 'node:test'\ntest(${JSON.stringify(name)}, () => { throw new Error('RED') })\n`,
    )
    const executed = run([
      'exec',
      '--dir',
      oracleDirectory,
      '--label',
      label,
      '--adapter',
      'node-test',
      '--report',
      report,
      '--',
      process.execPath,
      '--test',
      target,
    ])
    assert.equal(executed.status, 0, executed.stderr)

    const transitioned = run([
      'transition',
      '--dir',
      oracleDirectory,
      '--to',
      'VALID_RED',
      '--run',
      label === 'red:list' ? 'r-001' : 'r-002',
      '--evidence',
      join(oracleDirectory, 'evidence.json'),
    ])
    if (label === 'red:list') {
      assert.equal(transitioned.status, 1)
      assert.match(transitioned.stderr, /^MILESTONE_RED_MISSING: /)
    } else {
      assert.equal(transitioned.status, 0, transitioned.stderr)
    }
  }

  assert.equal((await state(oracleDirectory)).state, 'VALID_RED')
})

test('O6: git 레포에서 gitignore된 파일은 production 변경으로 세지 않는다', async (t) => {
  const created = await workspace(t, { git: true })
  if (!created) return t.skip('git 미설치 — git 경로를 판정할 수 없다')
  const { root, oracleDirectory } = created

  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")
  await mkdir(join(root, 'node_modules', 'later'), { recursive: true })
  await writeFile(join(root, 'node_modules', 'later', 'index.js'), 'module.exports = 2\n')

  redRun(oracleDirectory)
  const transitioned = transition(oracleDirectory, 'VALID_RED', 'r-001')

  assert.equal(transitioned.status, 0, transitioned.stderr)
  assert.equal(Object.keys((await state(oracleDirectory)).testFiles).length, 3)
})

test('O6: run-state를 지우고 다시 init해도 기준선과 예산을 되살리지 못한다', async (t) => {
  const { root, oracleDirectory, lock } = await workspace(t)
  run(['exec', '--dir', oracleDirectory, '--label', 'red-1', '--', process.execPath, '-e', 'process.exit(1)'])
  assert.equal(run(['budget', '--dir', oracleDirectory, '--spend', 'product', '--reason', 'r1']).status, 0)

  await rm(join(oracleDirectory, 'run-state.json'))
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = () => null\n')

  const reinitialized = run(['init', '--dir', oracleDirectory, '--lock', lock, '--risk', 'medium', '--scan-root', root])

  assert.equal(reinitialized.status, 1)
  assert.match(reinitialized.stderr, /^RUN_ARTIFACTS_EXIST: /)
  assert.match(reinitialized.stderr, /runs\.jsonl/)
  assert.doesNotMatch(reinitialized.stderr, /remove it/)
})

test('O11: exec 없이 예산만 쓴 뒤 run-state를 지워도 예산을 되살리지 못한다', async (t) => {
  const { root, oracleDirectory, lock } = await workspace(t)
  assert.equal(run(['budget', '--dir', oracleDirectory, '--spend', 'product', '--reason', 'r1']).status, 0)

  await rm(join(oracleDirectory, 'run-state.json'))
  const reinitialized = run(['init', '--dir', oracleDirectory, '--lock', lock, '--risk', 'medium', '--scan-root', root])

  assert.equal(reinitialized.status, 1)
  assert.match(reinitialized.stderr, /^RUN_ARTIFACTS_EXIST: /)
})

test('O11: 예산 기록은 run 번호를 소비하지 않는다', async (t) => {
  const { oracleDirectory } = await workspace(t)
  assert.equal(run(['budget', '--dir', oracleDirectory, '--spend', 'harness', '--reason', 'h1']).status, 0)

  const executed = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red-1',
    '--',
    process.execPath,
    '-e',
    'process.exit(1)',
  ])

  assert.match(executed.stdout, /^RUN_RECORDED r-001 /)
  const entries = (await ledgerLines(oracleDirectory)).map((line) => JSON.parse(line))
  assert.deepEqual(
    entries.map((entry) => entry.type),
    ['budget', 'run'],
  )
})

test('O7: exit 0 run으로는 VALID_RED로 전이하지 못한다', async (t) => {
  const { oracleDirectory } = await workspace(t)
  redRun(oracleDirectory, { exitCode: 0 })

  const transitioned = transition(oracleDirectory, 'VALID_RED', 'r-001')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^RUN_NOT_RED: /)
  assert.equal((await state(oracleDirectory)).state, 'ORACLE_READY')
})

test('O7: reporter와 지정 행의 실패 증거가 없는 non-zero run은 VALID_RED가 아니다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")
  redRun(oracleDirectory, { report: false })

  const transitioned = transition(oracleDirectory, 'VALID_RED', 'r-001')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^RED_EVIDENCE_UNVERIFIABLE: /)
  assert.equal((await state(oracleDirectory)).state, 'ORACLE_READY')
})

async function reachValidRed(oracleDirectory, root) {
  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")
  redRun(oracleDirectory)
  const latest = (await ledgerLines(oracleDirectory)).map(JSON.parse).at(-1).runId
  const transitioned = transition(oracleDirectory, 'VALID_RED', latest)
  assert.equal(transitioned.status, 0, transitioned.stderr)
}

function greenRun(oracleDirectory, label, environment) {
  reportSequence += 1
  const report = join(oracleDirectory, `${label.replaceAll(':', '-')}-report-${reportSequence}.ndjson`)
  const testPath = resolve(oracleDirectory, '../../../packages/oracle-green-fixture.test.mjs')
  return run(
    [
      'exec',
      '--dir',
      oracleDirectory,
      '--label',
      'behavior',
      '--adapter',
      'node-test',
      '--report',
      report,
      '--',
      process.execPath,
      '--test',
      testPath,
    ],
    environment,
  )
}

function reportedLabelRun(oracleDirectory, label) {
  reportSequence += 1
  const report = join(oracleDirectory, `${label}-report-${reportSequence}.ndjson`)
  const testPath = resolve(oracleDirectory, '../../../packages/oracle-green-fixture.test.mjs')
  return run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    label,
    '--adapter',
    'node-test',
    '--report',
    report,
    '--',
    process.execPath,
    '--test',
    testPath,
  ])
}

test('red/green 복합 커맨드는 exec와 전이를 한 호출로 기록한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")

  reportSequence += 1
  const redReport = join(oracleDirectory, `red-report-${reportSequence}.ndjson`)
  const redTest = resolve(oracleDirectory, '../../../packages/oracle-red-fixture.test.mjs')
  writeFileSync(
    redTest,
    "import test from 'node:test'\ntest('save > pending', () => { throw new Error('expected RED') })\n",
  )
  const red = run([
    'red',
    '--dir',
    oracleDirectory,
    '--label',
    'red',
    '--adapter',
    'node-test',
    '--report',
    redReport,
    '--evidence',
    join(oracleDirectory, 'evidence.json'),
    '--row',
    'O1',
    '--',
    process.execPath,
    '--test',
    redTest,
  ])
  assert.equal(red.status, 0, red.stderr)
  assert.match(red.stdout, /RUN_RECORDED r-001 /)
  assert.match(red.stdout, /STATE_VALID_RED run:r-001\n/)
  assert.equal((await state(oracleDirectory)).state, 'VALID_RED')

  greenRun(oracleDirectory, 'green-1')
  reportSequence += 1
  const greenReport = join(oracleDirectory, `green-report-${reportSequence}.ndjson`)
  const greenTest = resolve(oracleDirectory, '../../../packages/oracle-green-fixture.test.mjs')
  const green = run([
    'green',
    '--dir',
    oracleDirectory,
    '--label',
    'behavior',
    '--adapter',
    'node-test',
    '--report',
    greenReport,
    '--evidence',
    join(oracleDirectory, 'evidence.json'),
    '--',
    process.execPath,
    '--test',
    greenTest,
  ])
  assert.equal(green.status, 0, green.stderr)
  assert.match(green.stdout, /RUN_RECORDED r-003 /)
  assert.match(green.stdout, /STATE_IMPLEMENTED_GREEN run:r-003\n/)
  assert.equal((await state(oracleDirectory)).state, 'IMPLEMENTED_GREEN')
})

test('red 복합 커맨드는 통과한 run이면 전이를 거부하고 run은 ledger에 남긴다', async (t) => {
  const { oracleDirectory } = await workspace(t)
  reportSequence += 1
  const report = join(oracleDirectory, `red-report-${reportSequence}.ndjson`)
  const passingTest = resolve(oracleDirectory, '../../../packages/oracle-red-fixture.test.mjs')
  writeFileSync(passingTest, "import test from 'node:test'\ntest('save > pending', () => {})\n")

  const red = run([
    'red',
    '--dir',
    oracleDirectory,
    '--label',
    'red',
    '--adapter',
    'node-test',
    '--report',
    report,
    '--evidence',
    join(oracleDirectory, 'evidence.json'),
    '--row',
    'O1',
    '--',
    process.execPath,
    '--test',
    passingTest,
  ])
  assert.equal(red.status, 1)
  assert.match(red.stderr, /^RUN_NOT_RED: /)
  assert.equal((await state(oracleDirectory)).state, 'ORACLE_READY')
  assert.equal((await ledgerLines(oracleDirectory)).length, 1)
})

test('O8: 연속 통과 횟수를 채운 GREEN 전이는 lock을 재검증하고 통과한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')

  assert.equal(transitioned.status, 0, transitioned.stderr)
  assert.match(transitioned.stdout, /^STATE_IMPLEMENTED_GREEN run:r-003\n$/)
  assert.equal((await state(oracleDirectory)).state, 'IMPLEMENTED_GREEN')
})

test('O18: visual pending은 GREEN에 남기되지만 review 완료를 차단한다', async (t) => {
  const { oracleDirectory } = await workspace(t, {
    risk: 'low',
    oracleContent: VISUAL_ORACLE,
    evidence: VISUAL_EVIDENCE,
  })
  greenRun(oracleDirectory, 'green')

  const green = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-001', [
    '--reason',
    'existing implementation already satisfies deterministic rows',
  ])
  assert.equal(green.status, 0, green.stderr)
  assert.match(green.stdout, /VISUAL_EVIDENCE_PENDING D1/)
  assert.equal((await state(oracleDirectory)).state, 'IMPLEMENTED_GREEN')

  greenRun(oracleDirectory, 'review')
  const review = transition(oracleDirectory, 'REVIEW_VERIFIED', 'r-002')
  assert.equal(review.status, 1)
  assert.match(review.stderr, /^EVIDENCE_PENDING: /)
  assert.equal((await state(oracleDirectory)).state, 'IMPLEMENTED_GREEN')
})

test('O20: review-packet은 lock·source·state·ledger·evidence·diff만 결정론적으로 쓴다', async (t) => {
  const created = await workspace(t, {
    git: true,
    initialFiles: { 'src/save.mjs': 'export const save = 1\n' },
  })
  if (!created) return t.skip('git 미설치로 review diff를 검증할 수 없다')
  const { root, oracleDirectory } = created
  const added = spawnSync('git', ['-C', root, 'add', '.'], { encoding: 'utf8', env: isolatedEnvironment() })
  assert.equal(added.status, 0, added.stderr)
  const committed = spawnSync(
    'git',
    ['-C', root, '-c', 'user.name=Oracle Test', '-c', 'user.email=oracle@example.test', 'commit', '-qm', 'baseline'],
    { encoding: 'utf8', env: isolatedEnvironment() },
  )
  assert.equal(committed.status, 0, committed.stderr)

  await reachValidRed(oracleDirectory, root)
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 2\n')
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')
  assert.equal(transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003').status, 0)

  const first = join(oracleDirectory, 'review-input-a.json')
  const second = join(oracleDirectory, 'review-input-b.json')
  for (const output of [first, second]) {
    const generated = run(strictReviewPacketArgs(oracleDirectory, output))
    assert.equal(generated.status, 0, generated.stderr)
    assert.match(generated.stdout, /^REVIEW_PACKET_WRITTEN /)
  }

  const regenerated = run(strictReviewPacketArgs(oracleDirectory, first))
  assert.equal(regenerated.status, 0, regenerated.stderr)

  const firstBytes = await readFile(first, 'utf8')
  assert.equal(firstBytes, await readFile(second, 'utf8'))
  const packet = JSON.parse(firstBytes)
  assert.equal(packet.schemaVersion, 2)
  assert.equal(packet.lockVerification.exitCode, 0)
  assert.equal(packet.state.state, 'IMPLEMENTED_GREEN')
  assert.equal(packet.ledger.length, 6)
  assert.deepEqual(
    packet.ledger.map((entry) => entry.type ?? 'run'),
    ['init', 'run', 'transition', 'run', 'run', 'transition'],
  )
  assert.equal(packet.targetRevision, packet.targetSnapshot.worktreeSha256)
  assert.deepEqual(packet.evidence, EVIDENCE)
  assert.deepEqual(packet.lockedSources, [])
  assert.deepEqual(packet.implementationDecision, {
    path: 'implementation-decision.md',
    sha256: createHash('sha256').update('Implement the approved change.\n').digest('hex'),
    content: 'Implement the approved change.\n',
  })
  assert.deepEqual(packet.reviewPoints, [
    {
      path: 'review-checklist.md',
      sha256: createHash('sha256')
        .update(await readFile(checklistReviewPoint))
        .digest('hex'),
    },
    {
      path: 'changeability.md',
      sha256: createHash('sha256')
        .update(await readFile(changeabilityReviewPoint))
        .digest('hex'),
    },
  ])
  assert.ok(packet.changedFiles.some((entry) => entry.path === 'src/save.mjs'))
  assert.match(packet.diff, /save\.mjs/)
  assert.deepEqual(packet.pending, [])
  assert.equal('summary' in packet, false)
  assert.equal('conclusion' in packet, false)

  const protectedReport = join(root, 'protected-review.json')
  const hardlinkedOutput = join(oracleDirectory, 'review-hardlink.json')
  await writeFile(protectedReport, 'caller-owned bytes\n')
  await link(protectedReport, hardlinkedOutput)

  const hardlinkResult = run(strictReviewPacketArgs(oracleDirectory, hardlinkedOutput))

  assert.equal(hardlinkResult.status, 1)
  assert.match(hardlinkResult.stderr, /^REVIEW_PACKET_OUTPUT_INVALID: /)
  assert.equal(await readFile(protectedReport, 'utf8'), 'caller-owned bytes\n')

  await writeFile(join(oracleDirectory, 'journal.md'), '# Journal\n')
  const journal = run(strictReviewPacketArgs(oracleDirectory, join(oracleDirectory, 'journal.md')))
  assert.equal(journal.status, 1)
  assert.match(journal.stderr, /^REVIEW_PACKET_OUTPUT_INVALID: /)

  await mkdir(join(oracleDirectory, 'packet-directory'))
  const directoryOutput = run(strictReviewPacketArgs(oracleDirectory, join(oracleDirectory, 'packet-directory')))
  assert.equal(directoryOutput.status, 1)
  assert.match(directoryOutput.stderr, /^REVIEW_PACKET_OUTPUT_INVALID: /)

  const runIdOutput = run(strictReviewPacketArgs(oracleDirectory, join(oracleDirectory, '.run-ids', 'packet.json')))
  assert.equal(runIdOutput.status, 1)
  assert.match(runIdOutput.stderr, /^REVIEW_PACKET_OUTPUT_INVALID: /)

  const outside = run(strictReviewPacketArgs(oracleDirectory, join(root, 'src', 'save.mjs')))
  assert.equal(outside.status, 1)
  assert.match(outside.stderr, /^REVIEW_PACKET_OUTPUT_INVALID: /)
})

test('O7-O8: review-packet은 검증된 implementation decision 원문과 digest를 포함한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')
  assert.equal(transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003').status, 0)
  const decision = join(oracleDirectory, 'implementation-decision.md')
  const content = '# Implementation Decision\n\n- Changeability: Predictability\n'
  await writeFile(decision, content)

  const output = join(oracleDirectory, 'review-input-v2.json')
  const generated = run([
    'review-packet',
    '--dir',
    oracleDirectory,
    '--decision',
    decision,
    '--review-point',
    checklistReviewPoint,
    '--review-point',
    changeabilityReviewPoint,
    '--output',
    output,
  ])

  assert.equal(generated.status, 0, generated.stderr)
  const packet = JSON.parse(await readFile(output, 'utf8'))
  assert.equal(packet.schemaVersion, 2)
  assert.deepEqual(packet.implementationDecision, {
    path: 'implementation-decision.md',
    sha256: createHash('sha256').update(content).digest('hex'),
    content,
  })

  const outside = join(root, 'src', 'decision.md')
  await writeFile(outside, content)
  const escaped = run([
    'review-packet',
    '--dir',
    oracleDirectory,
    '--decision',
    outside,
    '--output',
    join(oracleDirectory, 'escaped.json'),
  ])
  assert.equal(escaped.status, 1)
  assert.match(escaped.stderr, /^IMPLEMENTATION_DECISION_INVALID: /)

  const empty = join(oracleDirectory, 'empty-decision.md')
  await writeFile(empty, ' \n')
  const emptyResult = run([
    'review-packet',
    '--dir',
    oracleDirectory,
    '--decision',
    empty,
    '--output',
    join(oracleDirectory, 'empty.json'),
  ])
  assert.equal(emptyResult.status, 1)
  assert.match(emptyResult.stderr, /^IMPLEMENTATION_DECISION_INVALID: /)

  const linked = join(oracleDirectory, 'linked-decision.md')
  await symlink(decision, linked)
  const linkedResult = run([
    'review-packet',
    '--dir',
    oracleDirectory,
    '--decision',
    linked,
    '--output',
    join(oracleDirectory, 'linked.json'),
  ])
  assert.equal(linkedResult.status, 1)
  assert.match(linkedResult.stderr, /^IMPLEMENTATION_DECISION_INVALID: /)

  const directoryResult = run([
    'review-packet',
    '--dir',
    oracleDirectory,
    '--decision',
    oracleDirectory,
    '--output',
    join(oracleDirectory, 'directory.json'),
  ])
  assert.equal(directoryResult.status, 1)
  assert.match(directoryResult.stderr, /^IMPLEMENTATION_DECISION_INVALID: /)
})

test('O8: evidence manifest나 init에서 선언한 필수 label이 없으면 GREEN을 거부한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t, { requiredLabels: ['behavior', 'lint'] })
  await reachValidRed(oracleDirectory, root)
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const withoutEvidence = run(['transition', '--dir', oracleDirectory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-003'])
  assert.equal(withoutEvidence.status, 1)
  assert.match(withoutEvidence.stderr, /^EVIDENCE_REQUIRED: /)

  const withoutLint = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')
  assert.equal(withoutLint.status, 1)
  assert.match(withoutLint.stderr, /^REQUIRED_RUN_MISSING: /)
  assert.match(withoutLint.stderr, /lint/)

  const lint = reportedLabelRun(oracleDirectory, 'lint')
  assert.equal(lint.status, 0, lint.stderr)
  const lintReceipt = JSON.parse((await ledgerLines(oracleDirectory)).at(-1))
  assert.equal(lintReceipt.label, 'lint')
  assert.equal(lintReceipt.grade, 'reported')
  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')
  assert.equal(transitioned.status, 0, transitioned.stderr)
})

test('O8: GREEN run과 필수 label은 전이 시점 production snapshot과 일치해야 한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t, { requiredLabels: ['behavior', 'lint'] })
  await reachValidRed(oracleDirectory, root)
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 1\n')
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')
  reportedLabelRun(oracleDirectory, 'lint')
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 2\n')

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^SNAPSHOT_STALE: /)
  assert.equal((await state(oracleDirectory)).state, 'VALID_RED')
})

test('O8: required label run이 current snapshot보다 오래되면 GREEN을 거부한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t, { requiredLabels: ['behavior', 'lint'] })
  await reachValidRed(oracleDirectory, root)
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 1\n')
  reportedLabelRun(oracleDirectory, 'lint')
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 2\n')
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-004')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^SNAPSHOT_STALE: /)
  assert.match(transitioned.stderr, /r-002/)
})

test('O9: consecutive GREEN passes must be for the same current worktree snapshot', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 1\n')
  greenRun(oracleDirectory, 'green-1')
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 2\n')
  greenRun(oracleDirectory, 'green-2')

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^FLAKINESS_GATE: /)
  assert.match(transitioned.stderr, /consecutive 1/)
})

test('O9: exit 0 reports with any failed test cannot satisfy GREEN', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  const report = join(oracleDirectory, 'green-report.json')
  const mixedReport = {
    testResults: [
      {
        assertionResults: [
          { fullName: 'save > pending', status: 'passed' },
          { fullName: 'save > duplicate guard', status: 'failed' },
        ],
      },
    ],
  }
  const command = [
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'behavior',
    '--report',
    report,
    '--',
    process.execPath,
    '-e',
    `require('node:fs').writeFileSync(${JSON.stringify(report)}, ${JSON.stringify(
      JSON.stringify(mixedReport),
    )}); process.exit(0)`,
  ]
  const reported = run(command)
  assert.equal(reported.status, 1)
  assert.match(reported.stderr, /^REPORT_NONPASSING: /)
  const [receipt] = (await ledgerLines(oracleDirectory)).map(JSON.parse).slice(-1)
  assert.deepEqual(receipt.tests, [
    { name: 'save > pending', status: 'passed' },
    { name: 'save > duplicate guard', status: 'failed' },
  ])

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-002')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^RUN_NOT_GREEN: /)
  assert.equal((await state(oracleDirectory)).state, 'VALID_RED')
})

test('O9: exit 0 reports with pending tests cannot satisfy GREEN', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  const report = join(oracleDirectory, 'pending-report.json')
  const command = [
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'behavior',
    '--report',
    report,
    '--',
    process.execPath,
    '-e',
    `require('node:fs').writeFileSync(${JSON.stringify(report)}, ${JSON.stringify(
      JSON.stringify(PENDING_REPORT),
    )}); process.exit(0)`,
  ]

  const reported = run(command)
  assert.equal(reported.status, 1)
  assert.match(reported.stderr, /^REPORT_NONPASSING: /)
  const [receipt] = (await ledgerLines(oracleDirectory)).map(JSON.parse).slice(-1)
  assert.deepEqual(receipt.tests, [{ name: 'save > pending', status: 'pending' }])

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-002')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^RUN_NOT_GREEN: /)
  assert.equal((await state(oracleDirectory)).state, 'VALID_RED')
})

test('O9: bundled node reporter marks skip and todo as non-passing evidence', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  const reporter = join(scriptDirectory, 'oracle-node-reporter.mjs')
  const target = join(root, 'skip-todo.test.mjs')
  const report = join(root, 'skip-todo.ndjson')

  await writeFile(
    target,
    [
      "import assert from 'node:assert/strict'",
      "import test from 'node:test'",
      "test.skip('skipped contract', () => assert.equal(1, 1))",
      "test.todo('todo contract')",
      "test('real pass', () => assert.equal(1, 1))",
      '',
    ].join('\n'),
  )

  const command = [
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'behavior',
    '--report',
    report,
    '--',
    process.execPath,
    '--test',
    `--test-reporter=${reporter}`,
    `--test-reporter-destination=${report}`,
    target,
  ]
  const reported = run(command)
  assert.equal(reported.status, 1)
  assert.match(reported.stderr, /^REPORT_NONPASSING: /)

  const [record] = (await ledgerLines(oracleDirectory)).map(JSON.parse).slice(-1)
  assert.deepEqual(record.tests, [
    { name: 'skipped contract', status: 'skipped' },
    { name: 'todo contract', status: 'todo' },
    { name: 'real pass', status: 'passed' },
  ])

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-002')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^RUN_NOT_GREEN: /)
})

test('O9: exit-only PASS cannot count toward the consecutive GREEN gate', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  const report = join(oracleDirectory, 'green-report.json')
  await writeFile(report, JSON.stringify(GREEN_REPORT))
  const command = [
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'behavior',
    '--report',
    report,
    '--',
    process.execPath,
    '-e',
    `if (process.env.WRITE_REPORT === '1') require('node:fs').writeFileSync(${JSON.stringify(
      report,
    )}, JSON.stringify({ ...${JSON.stringify(GREEN_REPORT)}, runNonce: process.env.WRITE_REPORT })); process.exit(0)`,
  ]

  const stale = run(command, { WRITE_REPORT: '0' })
  assert.equal(stale.status, 1)
  assert.match(stale.stderr, /^REPORT_STALE: /)
  const reported = run(command, { WRITE_REPORT: '1' })
  assert.equal(reported.status, 0, reported.stderr)

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')
  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^EVIDENCE_UNVERIFIABLE: /)
})

test('O8: test-only worktree byte changes after GREEN run make selected run stale', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')
  await writeFile(
    join(root, 'src', 'save.test.mjs'),
    "import assert from 'node:assert'\nassert.equal(1, 1)\n// changed after pass\n",
  )

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^SNAPSHOT_STALE: /)
  assert.match(transitioned.stderr, /worktree/)
})

test('O8: GREEN 전이 직전 lock mismatch면 ORACLE_CHANGED로 멈춘다', async (t) => {
  const { root, oracleDirectory, oracle } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')
  await writeFile(oracle, '# Tampered Oracle\n')

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^ORACLE_CHANGED: /)
  assert.equal((await state(oracleDirectory)).state, 'VALID_RED')
})

test('O9: 연속 통과가 risk 필요 횟수보다 적으면 FLAKINESS_GATE로 거부한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  greenRun(oracleDirectory, 'green-1')

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-002')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^FLAKINESS_GATE: /)
  assert.match(transitioned.stderr, /required 2/)
  assert.match(transitioned.stderr, /consecutive 1/)
  assert.equal((await state(oracleDirectory)).state, 'VALID_RED')
})

test('O9: High risk는 연속 통과 3회를 요구한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t, { risk: 'high' })
  await reachValidRed(oracleDirectory, root)
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const blocked = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')
  assert.equal(blocked.status, 1)
  assert.match(blocked.stderr, /required 3/)

  greenRun(oracleDirectory, 'green-3')
  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-004')
  assert.equal(transitioned.status, 0, transitioned.stderr)
})

test('O10: .test-d.ts와 .test-d.tsx는 production 변경으로 세지 않는다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(join(root, 'src', 'api.test-d.ts'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")
  await writeFile(join(root, 'src', 'view.test-d.tsx'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")
  redRun(oracleDirectory)

  const transitioned = transition(oracleDirectory, 'VALID_RED', 'r-001')

  assert.equal(transitioned.status, 0, transitioned.stderr)
  const testFiles = Object.keys((await state(oracleDirectory)).testFiles)
  assert.ok(testFiles.includes('src/api.test-d.ts'))
  assert.ok(testFiles.includes('src/view.test-d.tsx'))
})

test('O10: assertion이 줄면 TEST_WEAKENED로 GREEN을 거부한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(
    join(root, 'src', 'save.test.mjs'),
    "import assert from 'node:assert'\nassert.equal(1, 1)\nassert.equal(2, 2)\n",
  )
  redRun(oracleDirectory)
  assert.equal(transition(oracleDirectory, 'VALID_RED', 'r-001').status, 0)

  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^TEST_WEAKENED: /)
  assert.match(transitioned.stderr, /src\/save\.test\.mjs/)
  assert.match(transitioned.stderr, /assertions 2 → 1/)
  assert.equal((await state(oracleDirectory)).state, 'VALID_RED')
})

test('O10: assertion 수는 같아도 기대값 리터럴을 바꾸면 TEST_WEAKENED로 GREEN을 거부한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(
    join(root, 'src', 'save.test.mjs'),
    "import assert from 'node:assert'\nassert.equal(posts, 1)\nassert.equal(status, 'pending')\n",
  )
  redRun(oracleDirectory)
  assert.equal(transition(oracleDirectory, 'VALID_RED', 'r-001').status, 0)

  await writeFile(
    join(root, 'src', 'save.test.mjs'),
    "import assert from 'node:assert'\nassert.equal(posts, 2)\nassert.equal(status, 'pending')\n",
  )
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^TEST_WEAKENED: /)
  assert.match(transitioned.stderr, /expected literal 1 1 → 0/)
  assert.equal((await state(oracleDirectory)).state, 'VALID_RED')
})

test('O10: 금지 토큰이 새로 들어오면 TEST_WEAKENED로 GREEN을 거부한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)

  await writeFile(
    join(root, 'src', 'save.test.mjs'),
    "import assert from 'node:assert'\nassert.equal(1, 1)\ntest.skip('later', () => {})\n",
  )
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^TEST_WEAKENED: /)
  assert.match(transitioned.stderr, /test\.skip/)
})

test('O10: screenshot 허용치를 올리면 TEST_WEAKENED로 GREEN을 거부한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(
    join(root, 'src', 'hero.style.test.ts'),
    "import assert from 'node:assert'\nassert.equal(1, 1)\n// maxDiffPixels: 0\n",
  )
  redRun(oracleDirectory)
  assert.equal(transition(oracleDirectory, 'VALID_RED', 'r-001').status, 0)

  await writeFile(
    join(root, 'src', 'hero.style.test.ts'),
    "import assert from 'node:assert'\nassert.equal(1, 1)\n// maxDiffPixels: 0\n// maxDiffPixelRatio: 0.2\n",
  )
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /maxDiffPixelRatio/)
})

test('O10: 토큰 수를 늘리지 않고 screenshot 허용치 값만 올려도 TEST_WEAKENED로 거부한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(
    join(root, 'src', 'hero.style.test.ts'),
    "import assert from 'node:assert'\nassert.equal(1, 1)\nawait expectScreenshot({ maxDiffPixels: 10 })\n",
  )
  redRun(oracleDirectory)
  assert.equal(transition(oracleDirectory, 'VALID_RED', 'r-001').status, 0)

  // 토큰 수는 그대로 1회, 값만 상향한다.
  await writeFile(
    join(root, 'src', 'hero.style.test.ts'),
    "import assert from 'node:assert'\nassert.equal(1, 1)\nawait expectScreenshot({ maxDiffPixels: 99999 })\n",
  )
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^TEST_WEAKENED: /)
  assert.match(transitioned.stderr, /maxDiffPixels 10 → 99999/)
  assert.equal((await state(oracleDirectory)).state, 'VALID_RED')
})

test('O10: 허용치를 낮추거나 유지하면 GREEN을 막지 않는다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(
    join(root, 'src', 'hero.style.test.ts'),
    "import assert from 'node:assert'\nassert.equal(1, 1)\nawait expectScreenshot({ maxDiffPixels: 10 })\n",
  )
  redRun(oracleDirectory)
  assert.equal(transition(oracleDirectory, 'VALID_RED', 'r-001').status, 0)

  await writeFile(
    join(root, 'src', 'hero.style.test.ts'),
    "import assert from 'node:assert'\nassert.equal(1, 1)\nawait expectScreenshot({ maxDiffPixels: 0 })\n",
  )
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const withoutBudget = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')
  assert.equal(withoutBudget.status, 1)
  assert.match(withoutBudget.stderr, /^HARNESS_BUDGET_REQUIRED: /)

  const spent = run(['budget', '--dir', oracleDirectory, '--spend', 'harness', '--reason', 'frozen test bytes changed'])
  assert.equal(spent.status, 0, spent.stderr)
  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^EVIDENCE_STALE: /)
  assert.equal((await state(oracleDirectory)).state, 'VALID_RED')
})

test('O10: PATH·시퀀스 증거 매핑도 VALID_RED 시점에 얼린다', async (t) => {
  const { root, oracleDirectory } = await workspace(t, {
    evidence: {
      ...EVIDENCE,
      paths: { PATH1: { kind: 'test', name: 'save > path' } },
      frames: { F1: { kind: 'test', name: 'save > frame' } },
      sequence: { kind: 'test', name: 'save > sequence' },
    },
  })
  await reachValidRed(oracleDirectory, root)

  const evidencePath = join(oracleDirectory, 'evidence.json')
  const frozen = JSON.parse(await readFile(evidencePath, 'utf8'))
  await writeFile(
    evidencePath,
    JSON.stringify({ ...frozen, paths: { PATH1: { kind: 'test', name: 'save > swapped' } } }),
  )
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const swappedPath = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')
  assert.equal(swappedPath.status, 1)
  assert.match(swappedPath.stderr, /^HARNESS_BUDGET_REQUIRED: /)

  await writeFile(evidencePath, JSON.stringify({ ...frozen, sequence: { kind: 'test', name: 'save > other' } }))
  const swappedSequence = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')
  assert.equal(swappedSequence.status, 1)
  assert.match(swappedSequence.stderr, /^HARNESS_BUDGET_REQUIRED: /)

  await writeFile(evidencePath, JSON.stringify({ ...frozen, frames: { F1: { kind: 'test', name: 'save > swapped frame' } } }))
  const swappedFrame = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')
  assert.equal(swappedFrame.status, 1)
  assert.match(swappedFrame.stderr, /^HARNESS_BUDGET_REQUIRED: /)
  assert.equal((await state(oracleDirectory)).state, 'VALID_RED')
})

test('O10: RED에 기록된 테스트 파일이 사라지면 TEST_WEAKENED로 GREEN을 거부한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)

  await rm(join(root, 'src', 'save.test.mjs'))
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^TEST_WEAKENED: /)
  assert.match(transitioned.stderr, /deleted/)
})

test('O11: 예산은 distinct 변경 digest 한도까지만 사용되고 초과 요청은 BUDGET_EXHAUSTED로 거부한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)

  for (const round of [1, 2, 3]) {
    await writeFile(join(root, 'src', 'save.mjs'), `export const save = ${round}\n`)
    const spent = run(['budget', '--dir', oracleDirectory, '--spend', 'product', '--reason', `round-${round}`])
    assert.equal(spent.status, 0, spent.stderr)
    assert.equal(spent.stdout, `BUDGET_SPENT product ${round}/3\n`)
  }

  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 4\n')
  const exhausted = run(['budget', '--dir', oracleDirectory, '--spend', 'product', '--reason', 'round-4'])

  assert.equal(exhausted.status, 1)
  assert.match(exhausted.stderr, /^BUDGET_EXHAUSTED: /)
  assert.equal((await state(oracleDirectory)).budgets.product.spent, 3)
  assert.equal((await state(oracleDirectory)).budgets.harness.spent, 0)
})

test('status --json reports current state, blockers, budgets, and orphaned reservations', async (t) => {
  const { oracleDirectory } = await workspace(t)
  await mkdir(join(oracleDirectory, '.run-ids'), { recursive: true })
  await writeFile(join(oracleDirectory, '.run-ids', 'r-777'), JSON.stringify({ runId: 'r-777', state: 'started' }))

  const checked = run(['status', '--dir', oracleDirectory, '--json'])

  assert.equal(checked.status, 0, checked.stderr)
  const status = JSON.parse(checked.stdout)
  assert.equal(status.currentState, 'ORACLE_READY')
  assert.equal(status.lockStatus.status, 'valid')
  assert.deepEqual(status.orphanedRun, ['r-777'])
  assert.deepEqual(status.remainingBudgets.product, { spent: 0, limit: 3, remaining: 3 })
  assert.ok(status.nextLegalActions.includes('VALID_RED'))
})

test('status --json nextActions is an execution packet: per transition, what is satisfied, what is missing, which run to cite', async (t) => {
  const { root, oracleDirectory } = await workspace(t, { risk: 'high' })

  const before = JSON.parse(run(['status', '--dir', oracleDirectory, '--json']).stdout)
  assert.deepEqual(
    before.nextActions.map((action) => action.to),
    before.nextLegalActions,
  )
  const redBefore = before.nextActions.find((action) => action.to === 'VALID_RED')
  assert.equal(redBefore.ready, false)
  assert.deepEqual(redBefore.blockers, ['NO_FRESH_RED_RUN'])
  assert.deepEqual(redBefore.requires, ['--run', '--evidence', '--row'])
  assert.deepEqual(redBefore.candidateRuns, [])
  assert.deepEqual(redBefore.readNodes, ['delivery-ledger', 'delivery-red'])
  assert.match(redBefore.example, /transition --dir .* --to VALID_RED --run <runId> --evidence <evidence> --row <row>/)
  const decision = before.nextActions.find((action) => action.to === 'NEEDS_DECISION')
  assert.equal(decision.ready, true)
  assert.deepEqual(decision.requires, ['--reason'])

  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")
  assert.equal(redRun(oracleDirectory).status, 0)

  const after = JSON.parse(run(['status', '--dir', oracleDirectory, '--json']).stdout)
  const redAfter = after.nextActions.find((action) => action.to === 'VALID_RED')
  assert.equal(redAfter.ready, true)
  assert.deepEqual(redAfter.candidateRuns, ['r-001'])
  assert.match(redAfter.example, /--run r-001 /)
  const greenAfter = after.nextActions.find((action) => action.to === 'IMPLEMENTED_GREEN')
  assert.equal(greenAfter.ready, false)
  assert.deepEqual(greenAfter.blockers, ['NO_FRESH_GREEN_RUN'])

  // 패킷은 판정이 아니다: ready=true여도 transition은 같은 검사를 다시 한다.
  assert.equal(transition(oracleDirectory, 'VALID_RED', 'r-001').status, 0)
  const red = JSON.parse(run(['status', '--dir', oracleDirectory, '--json']).stdout)
  const review = red.nextActions.find((action) => action.to === 'IMPLEMENTED_GREEN')
  assert.deepEqual(review.readNodes, ['delivery-ledger', 'delivery-implementation-decision', 'delivery-green-review'])
  const refresh = red.nextActions.find((action) => action.to === 'VALID_RED')
  assert.ok(refresh.blockers.includes('HARNESS_BUDGET_REQUIRED'))
})

test('nextActions mirrors what transition actually accepts: escape stays open, resume needs --run, review needs the packet', async (t) => {
  const { root, oracleDirectory } = await workspace(t, { risk: 'high' })

  // 증거가 비어 있어도 NEEDS_DECISION·FAIL은 잠기지 않는다 — 증거가 없을 때 쓰는 탈출 전이다.
  await writeFile(join(oracleDirectory, 'evidence.json'), JSON.stringify({ schemaVersion: 1, rows: {} }))
  const empty = JSON.parse(run(['status', '--dir', oracleDirectory, '--json']).stdout)
  assert.ok(empty.blockers.includes('EVIDENCE_MISSING_ROWS'))
  for (const escape of ['NEEDS_DECISION', 'FAIL']) {
    const action = empty.nextActions.find((entry) => entry.to === escape)
    assert.equal(action.ready, true, escape)
    assert.deepEqual(action.requires, ['--reason'], escape)
  }
  // ORACLE_READY에서 GREEN으로 곧장 가는 것은 VALID_RED 생략이므로 --reason이 함께 필요하다.
  const skipGreen = empty.nextActions.find((entry) => entry.to === 'IMPLEMENTED_GREEN')
  assert.deepEqual(skipGreen.requires, ['--run', '--evidence', '--reason'])

  // 실제로 탈출한 뒤의 재개 패킷: transition은 --reason이 아니라 --run을 요구한다.
  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")
  assert.equal(redRun(oracleDirectory).status, 0)
  assert.equal(
    run(['transition', '--dir', oracleDirectory, '--to', 'NEEDS_DECISION', '--reason', 'policy gap']).status,
    0,
  )
  const paused = JSON.parse(run(['status', '--dir', oracleDirectory, '--json']).stdout)
  const resume = paused.nextActions.find((entry) => entry.to === 'ORACLE_READY')
  assert.deepEqual(resume.requires, ['--run'])
  assert.deepEqual(resume.candidateRuns, ['r-001'])
  assert.match(resume.example, /--run r-001$/)

  // 패킷이 안내한 그대로가 실제 transition에서도 통한다.
  assert.equal(run(['transition', '--dir', oracleDirectory, '--to', 'ORACLE_READY', '--run', 'r-001']).status, 0)
})

test('nextActions review candidates only cite runs recorded after IMPLEMENTED_GREEN, newest first', async (t) => {
  const { root, oracleDirectory } = await workspace(t, { risk: 'low' })
  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")
  assert.equal(redRun(oracleDirectory).status, 0)
  assert.equal(transition(oracleDirectory, 'VALID_RED', 'r-001').status, 0)
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = () => true\n')
  assert.equal(greenRun(oracleDirectory, 'behavior').status, 0, 'green run')
  assert.equal(transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-002').status, 0)

  const before = JSON.parse(run(['status', '--dir', oracleDirectory, '--json']).stdout)
  const reviewBefore = before.nextActions.find((entry) => entry.to === 'REVIEW_VERIFIED')
  // r-002는 GREEN 이전의 run이므로 리뷰 인용 후보가 아니다 (REVIEW_RERUN_REQUIRED와 같은 규칙).
  assert.deepEqual(reviewBefore.candidateRuns, [])
  assert.ok(reviewBefore.blockers.includes('NO_FRESH_GREEN_RUN'))
  assert.deepEqual(reviewBefore.requires, ['--run', '--evidence', '--findings', '--packet', '--revision'])

  assert.equal(greenRun(oracleDirectory, 'behavior').status, 0)
  const after = JSON.parse(run(['status', '--dir', oracleDirectory, '--json']).stdout)
  const reviewAfter = after.nextActions.find((entry) => entry.to === 'REVIEW_VERIFIED')
  assert.deepEqual(reviewAfter.candidateRuns, ['r-003'])
  assert.match(reviewAfter.example, /--run r-003 /)
})

test('O11: budget spend is counted once per distinct current change digest', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 1\n')

  assert.equal(run(['budget', '--dir', oracleDirectory, '--spend', 'product', '--reason', 'round-1']).status, 0)
  const repeated = run(['budget', '--dir', oracleDirectory, '--spend', 'product', '--reason', 'same digest'])
  assert.equal(repeated.status, 0, repeated.stderr)
  assert.match(repeated.stdout, /^BUDGET_SPENT product 1\/3\n$/)
  assert.equal((await state(oracleDirectory)).budgets.product.spent, 1)

  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 2\n')
  assert.equal(run(['budget', '--dir', oracleDirectory, '--spend', 'product', '--reason', 'round-2']).status, 0)
  assert.equal((await state(oracleDirectory)).budgets.product.spent, 2)
})

test('status --json reports evidence gaps and reporter receipt issues', async (t) => {
  const { oracleDirectory } = await workspace(t)
  await writeFile(join(oracleDirectory, 'evidence.json'), JSON.stringify({ schemaVersion: 1, rows: {} }))
  await writeFile(join(oracleDirectory, 'green-report.json'), JSON.stringify(GREEN_REPORT))
  run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'behavior',
    '--report',
    join(oracleDirectory, 'green-report.json'),
    '--',
    process.execPath,
    '-e',
    'process.exit(0)',
  ])

  const checked = run(['status', '--dir', oracleDirectory, '--json'])

  assert.equal(checked.status, 0, checked.stderr)
  const status = JSON.parse(checked.stdout)
  assert.deepEqual(status.evidenceStatus.missingRows, ['O1'])
  assert.ok(status.blockers.includes('EVIDENCE_MISSING_ROWS'))
  assert.equal(status.runIssues[0].runId, 'r-001')
  assert.equal(status.runIssues[0].reportErrorCode, 'REPORT_STALE')
  assert.match(status.runIssues[0].reportError, /not rewritten|not written/)
})

test('O11: policy와 implicit harness budget은 stable digest별로만 spend된다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)

  assert.equal(run(['budget', '--dir', oracleDirectory, '--spend', 'policy', '--reason', 'same revision']).status, 0)
  assert.equal(
    run(['budget', '--dir', oracleDirectory, '--spend', 'policy', '--reason', 'same revision again']).status,
    0,
  )
  assert.equal((await state(oracleDirectory)).budgets.policy.spent, 1)

  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")
  assert.equal(
    run(['budget', '--dir', oracleDirectory, '--spend', 'harness', '--reason', 'test harness changed']).status,
    0,
  )
  assert.equal(
    run(['budget', '--dir', oracleDirectory, '--spend', 'harness', '--reason', 'same harness again']).status,
    0,
  )
  assert.equal((await state(oracleDirectory)).budgets.harness.spent, 1)

  await writeFile(
    join(root, 'src', 'save.test.mjs'),
    "import assert from 'node:assert'\nassert.equal(1, 1)\nassert.equal(2, 2)\n",
  )
  assert.equal(
    run(['budget', '--dir', oracleDirectory, '--spend', 'harness', '--reason', 'next harness digest']).status,
    0,
  )
  assert.equal((await state(oracleDirectory)).budgets.harness.spent, 2)
})

test('O12: RED와 GREEN의 env fingerprint가 다르면 전이는 통과하되 ENV_DRIFT를 남긴다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")
  redRun(oracleDirectory, { environment: { TZ: 'UTC' } })
  assert.equal(transition(oracleDirectory, 'VALID_RED', 'r-001').status, 0)

  greenRun(oracleDirectory, 'green-1', { TZ: 'Asia/Seoul' })
  greenRun(oracleDirectory, 'green-2', { TZ: 'Asia/Seoul' })

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003')

  assert.equal(transitioned.status, 0, transitioned.stderr)
  assert.match(transitioned.stdout, /ENV_DRIFT/)
  assert.match(transitioned.stdout, /Asia\/Seoul/)
  assert.equal((await state(oracleDirectory)).envDrift.length, 1)
})

test('O13: 허용되지 않는 전이는 TRANSITION_NOT_ALLOWED로 거부한다', async (t) => {
  const { oracleDirectory } = await workspace(t)
  run(['exec', '--dir', oracleDirectory, '--label', 'green-1', '--', process.execPath, '-e', 'process.exit(0)'])

  const skipped = run(['transition', '--dir', oracleDirectory, '--to', 'REVIEW_VERIFIED', '--run', 'r-001'])

  assert.equal(skipped.status, 1)
  assert.match(skipped.stderr, /^TRANSITION_NOT_ALLOWED: /)
  assert.match(skipped.stderr, /ORACLE_READY/)
  assert.equal((await state(oracleDirectory)).state, 'ORACLE_READY')
})

test('O14: ledger에 없는 runId를 인용하면 RUN_NOT_FOUND로 거부한다', async (t) => {
  const { oracleDirectory } = await workspace(t)

  const transitioned = transition(oracleDirectory, 'VALID_RED', 'r-009')

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^RUN_NOT_FOUND: /)
  assert.equal((await state(oracleDirectory)).state, 'ORACLE_READY')
})

test('O15: exec 두 번은 ledger 두 줄이며 첫 줄은 그대로 유지된다', async (t) => {
  const { oracleDirectory } = await workspace(t)

  run(['exec', '--dir', oracleDirectory, '--label', 'red-1', '--', process.execPath, '-e', 'process.exit(1)'])
  const [afterFirst] = await ledgerLines(oracleDirectory)
  run(['exec', '--dir', oracleDirectory, '--label', 'red-2', '--', process.execPath, '-e', 'process.exit(1)'])

  const lines = await ledgerLines(oracleDirectory)
  assert.equal(lines.length, 2)
  assert.equal(lines[0], afterFirst)
  assert.equal(JSON.parse(lines[1]).runId, 'r-002')
})

test('O16: production 변경이 없으면 사유와 함께 RED 없이 GREEN으로 전이한다', async (t) => {
  const { oracleDirectory } = await workspace(t)
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const withoutReason = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-002')
  assert.equal(withoutReason.status, 1)
  assert.match(withoutReason.stderr, /^MISSING_REASON: /)

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-002', [
    '--reason',
    '기존 구현이 카드를 이미 충족함',
  ])

  assert.equal(transitioned.status, 0, transitioned.stderr)
  const current = await state(oracleDirectory)
  assert.equal(current.state, 'IMPLEMENTED_GREEN')
  assert.equal(current.history.at(-1).reason, '기존 구현이 카드를 이미 충족함')
})

test('O1: 병렬 exec는 서로 다른 runId를 예약한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await Promise.all(
    Array.from({ length: 3000 }, (_, index) => writeFile(join(root, 'src', `fixture-${index}.txt`), `${index}`)),
  )

  const command = (label) => ['exec', '--dir', oracleDirectory, '--label', label, '--', process.execPath, '-e', '']
  const results = await Promise.all([runAsync(command('behavior')), runAsync(command('lint'))])

  for (const result of results) assert.equal(result.status, 0, result.stderr)
  const records = (await ledgerLines(oracleDirectory)).map(JSON.parse)
  assert.deepEqual(records.map(({ runId }) => runId).sort(), ['r-001', 'r-002'])
})

test('O16: production이 바뀐 상태에서는 RED 없이 GREEN으로 갈 수 없다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = () => null\n')
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const transitioned = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-002', [
    '--reason',
    '기존 구현이 카드를 이미 충족함',
  ])

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^PRODUCTION_TOUCHED_BEFORE_RED: /)
  assert.equal((await state(oracleDirectory)).state, 'ORACLE_READY')
})

test('O17: REVIEW_VERIFIED rejects a review packet from a different lock manifest identity', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 1\n')
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')
  assert.equal(transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003').status, 0)
  greenRun(oracleDirectory, 'review')

  const packetPath = join(oracleDirectory, 'cross-oracle-review.json')
  const packetResult = run(strictReviewPacketArgs(oracleDirectory, packetPath))
  assert.equal(packetResult.status, 0, packetResult.stderr)
  const packet = JSON.parse(await readFile(packetPath, 'utf8'))
  packet.state.lockManifestSha256 = '0'.repeat(64)
  packet.targetSnapshot.lockManifestSha256 = '0'.repeat(64)
  await writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`)
  const packetRaw = await readFile(packetPath, 'utf8')
  const packetSha256 = createHash('sha256').update(packetRaw).digest('hex')
  bindReviewDocument(join(oracleDirectory, 'findings.json'), packetSha256, packet.targetRevision)

  const reviewed = transition(oracleDirectory, 'REVIEW_VERIFIED', 'r-004', [
    '--packet',
    packetPath,
    '--revision',
    packet.targetRevision,
  ])

  assert.equal(reviewed.status, 1)
  assert.match(reviewed.stderr, /^REVIEW_PACKET_STALE: /)
})

test('O17: REVIEW_VERIFIED rejects a packet that predates the current review snapshot', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 1\n')
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')
  assert.equal(transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003').status, 0)

  const packet = join(oracleDirectory, 'stale-review.json')
  const packetResult = run(strictReviewPacketArgs(oracleDirectory, packet))
  assert.equal(packetResult.status, 0, packetResult.stderr)
  const packetRaw = readFileSync(packet, 'utf8')
  const packetSha256 = createHash('sha256').update(packetRaw).digest('hex')
  const packetJson = JSON.parse(packetRaw)
  const greenEntry = [...packetJson.state.history].reverse().find((entry) => entry.state === 'IMPLEMENTED_GREEN')
  const greenRunRecord = packetJson.ledger.find((entry) => entry.runId === greenEntry.runId)
  const revision = packetJson.targetSnapshot?.worktreeSha256 ?? greenRunRecord.worktreeSha256
  writeFileSync(
    join(oracleDirectory, 'findings.json'),
    JSON.stringify({ ...CLEAR_REVIEW, packetSha256, targetRevision: revision }),
  )

  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 2\n')
  greenRun(oracleDirectory, 'review')
  const reviewed = transition(oracleDirectory, 'REVIEW_VERIFIED', 'r-004', ['--packet', packet, '--revision', revision])

  assert.equal(reviewed.status, 1)
  assert.match(reviewed.stderr, /^REVIEW_PACKET_STALE: /)
  assert.equal((await state(oracleDirectory)).state, 'IMPLEMENTED_GREEN')
})

// blocking finding을 고치면 worktree가 바뀐다. 그때 인증을 영구히 막으면 리뷰 반영 자체가 불가능해지므로,
// 게이트는 "GREEN 이후 변경 금지"가 아니라 "변경된 리비전에서 필수 라벨이 실제로 다시 통과했는가"다.
test('O17: a tracked change after GREEN certifies only once the required label re-passes at that revision', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 1\n')
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')
  assert.equal(transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003').status, 0)

  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 2\n')
  greenRun(oracleDirectory, 'review')

  const packetPath = join(oracleDirectory, 'review-current.json')
  const packetResult = run(strictReviewPacketArgs(oracleDirectory, packetPath))
  assert.equal(packetResult.status, 0, packetResult.stderr)
  const packetRaw = readFileSync(packetPath, 'utf8')
  const packet = JSON.parse(packetRaw)
  const packetSha256 = createHash('sha256').update(packetRaw).digest('hex')
  assert.equal(packet.targetRevision, packet.targetSnapshot.worktreeSha256)
  assert.notEqual(packet.targetRevision, packet.ledger.find((entry) => entry.runId === 'r-003').worktreeSha256)
  const findings = join(oracleDirectory, 'findings.json')
  bindReviewDocument(findings, packetSha256, packet.targetRevision)
  const receipt = issueReviewReceipt(oracleDirectory, packetPath, findings, packet.targetRevision)
  assert.equal(receipt.status, 0, receipt.stderr)

  const reviewed = transition(oracleDirectory, 'REVIEW_VERIFIED', 'r-004', [
    '--packet',
    packetPath,
    '--revision',
    packet.targetRevision,
  ])

  assert.equal(reviewed.status, 0, reviewed.stderr)
  assert.equal((await state(oracleDirectory)).state, 'REVIEW_VERIFIED')
})

test('O17: a tracked change after GREEN cannot certify on the pre-change run alone', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 1\n')
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')
  assert.equal(transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003').status, 0)

  // GREEN 이후 재실행까지 마쳐 REVIEW_RERUN_REQUIRED 를 만족시킨 뒤, 스냅샷 게이트만 남긴다
  greenRun(oracleDirectory, 'review')
  const packetPath = join(oracleDirectory, 'review-prechange.json')
  const packetResult = run(strictReviewPacketArgs(oracleDirectory, packetPath))
  assert.equal(packetResult.status, 0, packetResult.stderr)
  const packetRaw = readFileSync(packetPath, 'utf8')
  const packet = JSON.parse(packetRaw)
  const packetSha256 = createHash('sha256').update(packetRaw).digest('hex')
  const findings = join(oracleDirectory, 'findings.json')
  bindReviewDocument(findings, packetSha256, packet.targetRevision)
  assert.equal(issueReviewReceipt(oracleDirectory, packetPath, findings, packet.targetRevision).status, 0)

  // 패킷·영수증을 다 만든 뒤 production을 바꾸면, 인용 run 은 그 리비전의 증거가 아니다
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 2\n')
  const reviewed = transition(oracleDirectory, 'REVIEW_VERIFIED', 'r-004', [
    '--packet',
    packetPath,
    '--revision',
    packet.targetRevision,
  ])

  assert.equal(reviewed.status, 1)
  assert.match(reviewed.stderr, /^(SNAPSHOT_STALE|REVIEW_RUN_STALE|REVIEW_PACKET_STALE|REVIEW_RERUN_REQUIRED): /)
  assert.equal((await state(oracleDirectory)).state, 'IMPLEMENTED_GREEN')
})

test('O17: REVIEW_VERIFIED는 clear findings와 GREEN 이후 인용 run 재실행을 요구한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')
  assert.equal(transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003').status, 0)

  const withoutRerun = transition(oracleDirectory, 'REVIEW_VERIFIED', 'r-003')
  assert.equal(withoutRerun.status, 1)
  assert.match(withoutRerun.stderr, /^REVIEW_RERUN_REQUIRED: /)

  await writeFile(
    join(oracleDirectory, 'findings.json'),
    JSON.stringify({
      ...CLEAR_REVIEW,
      findings: [
        {
          id: 'f-1',
          row: 'O1',
          classification: 'PRODUCT_DEFECT',
          severity: 'high',
          finding: 'pending이 표시되지 않는다',
          evidence: 'r-003',
          fix: 'pending UI 추가',
          packetSha256: CLEAR_REVIEW.packetSha256,
          targetRevision: CLEAR_REVIEW.targetRevision,
        },
      ],
    }),
  )
  greenRun(oracleDirectory, 'review')
  const blocked = transition(oracleDirectory, 'REVIEW_VERIFIED', 'r-004')
  assert.equal(blocked.status, 1)
  assert.match(blocked.stderr, /^FINDINGS_BLOCKING: /)

  await writeFile(join(oracleDirectory, 'findings.json'), JSON.stringify(CLEAR_REVIEW))
  const verified = transition(oracleDirectory, 'REVIEW_VERIFIED', 'r-004')
  assert.equal(verified.status, 0, verified.stderr)
  assert.equal((await state(oracleDirectory)).state, 'REVIEW_VERIFIED')
})

test('O17: bytes가 그대로인 필수 label은 GREEN 이전 run을 재사용하고, 바뀌면 다시 요구한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t, { requiredLabels: ['behavior', 'lint'] })
  await reachValidRed(oracleDirectory, root)
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')
  reportedLabelRun(oracleDirectory, 'lint')
  assert.equal(transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003').status, 0)

  await writeFile(join(oracleDirectory, 'findings.json'), JSON.stringify(CLEAR_REVIEW))
  greenRun(oracleDirectory, 'review')

  // lint는 GREEN 이전 run(r-004)뿐이지만 lock·worktree·production·harness digest가 그대로라 재사용된다
  const verified = transition(oracleDirectory, 'REVIEW_VERIFIED', 'r-005')
  assert.equal(verified.status, 0, verified.stderr)
  assert.equal((await state(oracleDirectory)).state, 'REVIEW_VERIFIED')
})

test('O17: production이 바뀌면 재사용하던 필수 label run이 stale로 막힌다', async (t) => {
  const { root, oracleDirectory } = await workspace(t, { requiredLabels: ['behavior', 'lint'] })
  await reachValidRed(oracleDirectory, root)
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')
  reportedLabelRun(oracleDirectory, 'lint')
  assert.equal(transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003').status, 0)

  await writeFile(join(oracleDirectory, 'findings.json'), JSON.stringify(CLEAR_REVIEW))
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 3\n')
  greenRun(oracleDirectory, 'review')

  const blocked = transition(oracleDirectory, 'REVIEW_VERIFIED', 'r-005')
  assert.equal(blocked.status, 1)
  assert.match(blocked.stderr, /^SNAPSHOT_STALE: /)
  assert.match(blocked.stderr, /r-004/)
  assert.equal((await state(oracleDirectory)).state, 'IMPLEMENTED_GREEN')
})

test('O17: High risk REVIEW_VERIFIED는 GREEN 이후 mutation kill 증거를 요구한다', async (t) => {
  const source = 'src/save.mjs'
  const original = 'export const guarded = true\n'
  const { root, oracleDirectory } = await workspace(t, {
    risk: 'high',
    initialFiles: { [source]: original },
  })
  await reachValidRed(oracleDirectory, root)
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')
  greenRun(oracleDirectory, 'green-3')
  assert.equal(transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-004').status, 0)

  redRun(oracleDirectory)
  greenRun(oracleDirectory, 'review')
  const secondFindings = join(oracleDirectory, 'findings-second.json')
  await writeFile(
    secondFindings,
    JSON.stringify({
      ...CLEAR_REVIEW,
      reviewer: 'second-code-reviewer',
      reviewerId: 'second-code-reviewer',
      packetSha256: 'packet-b',
    }),
  )

  const missing = transition(oracleDirectory, 'REVIEW_VERIFIED', 'r-006', ['--intersect', secondFindings])
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /^MUTATION_EVIDENCE_REQUIRED: /)

  const unchanged = transition(oracleDirectory, 'REVIEW_VERIFIED', 'r-006', [
    '--intersect',
    secondFindings,
    '--mutation-run',
    'r-005',
    '--mutation-row',
    'O1',
  ])
  assert.equal(unchanged.status, 1)
  assert.match(unchanged.stderr, /^MUTATION_EVIDENCE_INVALID: /)

  await writeFile(join(root, source), 'export const guarded = false\n')
  redRun(oracleDirectory)
  await writeFile(join(root, source), original)
  greenRun(oracleDirectory, 'review-restored')
  // High은 블라인드 행↔테스트 매핑도 요구한다 — 여기서는 mutation 게이트를 보려고 그 결속을 갖춰 둔다
  const blind = blindMappingEvidence(oracleDirectory, () => ({ 'save > pending': ['O1'] }))
  assert.equal(blind.receipt.status, 0, blind.receipt.stderr)
  const verified = transition(oracleDirectory, 'REVIEW_VERIFIED', 'r-008', [
    '--intersect',
    secondFindings,
    '--mutation-run',
    'r-007',
    '--mutation-row',
    'O1',
    ...blind.args,
  ])
  assert.equal(verified.status, 0, verified.stderr)
  const current = await state(oracleDirectory)
  assert.equal(current.history.at(-1).mutationRunId, 'r-007')
  assert.equal(current.history.at(-1).mutationRow, 'O1')
})

test('review-packet은 리뷰 포인트를 본문 없이 path·digest 링크로만 기록한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')
  assert.equal(transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003').status, 0)
  const criteria = changeabilityReviewPoint
  const content = await readFile(criteria)

  const output = join(oracleDirectory, 'review-input-points.json')
  const generated = run(strictReviewPacketArgs(oracleDirectory, output))

  assert.equal(generated.status, 0, generated.stderr)
  const packet = JSON.parse(await readFile(output, 'utf8'))
  assert.deepEqual(packet.reviewPoints, [
    {
      path: 'review-checklist.md',
      sha256: createHash('sha256')
        .update(await readFile(checklistReviewPoint))
        .digest('hex'),
    },
    { path: 'changeability.md', sha256: createHash('sha256').update(content).digest('hex') },
  ])
  assert.equal(
    packet.reviewPoints.some((point) => 'content' in point),
    false,
  )

  // `항상` 리뷰 포인트가 빠진 packet은 만들어지지 않는다
  const withoutChecklist = run([
    'review-packet',
    '--dir',
    oracleDirectory,
    '--decision',
    join(oracleDirectory, 'implementation-decision.md'),
    '--review-point',
    criteria,
    '--output',
    join(oracleDirectory, 'without-checklist.json'),
  ])
  assert.equal(withoutChecklist.status, 1)
  assert.match(withoutChecklist.stderr, /^REVIEW_POINTS_REQUIRED: .*review-checklist\.md/)

  const missing = run([
    'review-packet',
    '--dir',
    oracleDirectory,
    '--decision',
    join(oracleDirectory, 'implementation-decision.md'),
    '--review-point',
    join(root, 'absent.md'),
    '--output',
    join(oracleDirectory, 'missing.json'),
  ])
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /^REVIEW_POINT_INVALID: /)

  const empty = join(oracleDirectory, 'references', 'empty-criteria.md')
  await mkdir(dirname(empty), { recursive: true })
  await writeFile(empty, ' \n')
  const emptyResult = run([
    'review-packet',
    '--dir',
    oracleDirectory,
    '--decision',
    join(oracleDirectory, 'implementation-decision.md'),
    '--review-point',
    empty,
    '--output',
    join(oracleDirectory, 'empty-points.json'),
  ])
  assert.equal(emptyResult.status, 1)
  assert.match(emptyResult.stderr, /^REVIEW_POINT_INVALID: /)

  const duplicate = run([
    'review-packet',
    '--dir',
    oracleDirectory,
    '--decision',
    join(oracleDirectory, 'implementation-decision.md'),
    '--review-point',
    criteria,
    '--review-point',
    criteria,
    '--output',
    join(oracleDirectory, 'duplicate-points.json'),
  ])
  assert.equal(duplicate.status, 1)
  assert.match(duplicate.stderr, /^REVIEW_POINT_INVALID: /)

  const without = run([
    'review-packet',
    '--dir',
    oracleDirectory,
    '--decision',
    join(oracleDirectory, 'implementation-decision.md'),
    '--output',
    join(oracleDirectory, 'no-points.json'),
  ])
  assert.equal(without.status, 1)
  assert.match(without.stderr, /^REVIEW_POINTS_REQUIRED: /)
})

test('O1: reporters reject Playwright skipped/flaky specs and Node empty suites', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  const report = join(oracleDirectory, 'playwright.json')
  const playwright = {
    suites: [
      {
        title: 'save',
        specs: [
          { title: 'skipped', ok: true, tests: [{ status: 'skipped' }] },
          { title: 'flaky', ok: true, tests: [{ status: 'flaky' }] },
        ],
      },
    ],
  }

  const skippedAndFlaky = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'behavior:reported',
    '--report',
    report,
    '--',
    process.execPath,
    '-e',
    `require('node:fs').writeFileSync(${JSON.stringify(report)}, JSON.stringify(${JSON.stringify(playwright)}))`,
  ])
  assert.equal(skippedAndFlaky.status, 1)
  assert.match(skippedAndFlaky.stderr, /^REPORT_NONPASSING: /)
  const playwrightReceipts = (await ledgerLines(oracleDirectory)).map(JSON.parse)
  assert.equal(playwrightReceipts.length, 1)
  const [playwrightReceipt] = playwrightReceipts
  assert.equal(playwrightReceipt.grade, 'exit-only')
  assert.equal(playwrightReceipt.exitCode, 0)
  assert.equal(playwrightReceipt.reportErrorCode, 'REPORT_NONPASSING')
  assert.match(playwrightReceipt.reportError, /skipped|flaky/i)

  const passingReport = join(oracleDirectory, 'playwright-passing.json')
  const passingPlaywright = {
    suites: [
      {
        title: 'save',
        specs: [
          {
            title: 'persists pending state',
            ok: true,
            tests: [{ status: 'expected', expectedStatus: 'passed', results: [{ status: 'passed' }] }],
          },
        ],
      },
    ],
  }
  const passing = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'behavior:reported',
    '--report',
    passingReport,
    '--',
    process.execPath,
    '-e',
    `require('node:fs').writeFileSync(${JSON.stringify(passingReport)}, JSON.stringify(${JSON.stringify(
      passingPlaywright,
    )}))`,
  ])
  assert.equal(passing.status, 0, passing.stderr)
  const passingReceipt = JSON.parse((await ledgerLines(oracleDirectory)).at(-1))
  assert.deepEqual(passingReceipt.tests, [{ name: 'save > persists pending state', status: 'passed' }])

  const reporter = join(scriptDirectory, 'oracle-node-reporter.mjs')
  const emptySuiteTarget = join(root, 'empty-suite.test.mjs')
  const emptyNodeReport = join(root, 'node-empty.ndjson')
  await writeFile(
    emptySuiteTarget,
    ["import { describe } from 'node:test'", "describe('empty suite', () => {})", ''].join('\n'),
  )
  const emptySuite = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'behavior:reported',
    '--report',
    emptyNodeReport,
    '--',
    process.execPath,
    '--test',
    `--test-reporter=${reporter}`,
    `--test-reporter-destination=${emptyNodeReport}`,
    emptySuiteTarget,
  ])
  assert.equal(emptySuite.status, 1)
  assert.match(emptySuite.stderr, /^REPORT_EMPTY: /)
  const receipts = (await ledgerLines(oracleDirectory)).map(JSON.parse)
  assert.equal(receipts.length, 3)
  const [firstReceipt, secondReceipt, emptyReceipt] = receipts
  assert.equal(firstReceipt.runId, playwrightReceipt.runId)
  assert.equal(secondReceipt.runId, passingReceipt.runId)
  assert.equal(emptyReceipt.grade, 'exit-only')
  assert.equal(emptyReceipt.exitCode, 0)
  assert.equal(emptyReceipt.reportErrorCode, 'REPORT_EMPTY')
  assert.match(emptyReceipt.reportError, /no tests/i)
})

test('O2: required labels distinguish reported tests from exit-code commands', async (t) => {
  const { oracleDirectory } = await workspace(t, { requiredLabels: ['behavior:reported', 'lint:exit'] })
  const behavior = reportedLabelRun(oracleDirectory, 'behavior:reported')
  assert.equal(behavior.status, 0, behavior.stderr)
  const lint = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'lint:exit',
    '--',
    process.execPath,
    '-e',
    'process.exit(0)',
  ])
  assert.equal(lint.status, 0, lint.stderr)
  assert.equal(JSON.parse((await ledgerLines(oracleDirectory))[1]).grade, 'exit-only')

  const failedLint = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'lint:exit',
    '--',
    process.execPath,
    '-e',
    'process.exit(1)',
  ])
  assert.equal(failedLint.status, 0, failedLint.stderr)
  const failed = JSON.parse((await ledgerLines(oracleDirectory)).at(-1))
  assert.equal(failed.exitCode, 1)
  assert.equal(failed.grade, 'exit-only')
  const signaledLint = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'lint:exit',
    '--',
    process.execPath,
    '-e',
    "process.kill(process.pid, 'SIGTERM')",
  ])
  assert.equal(signaledLint.status, 1)
  assert.match(signaledLint.stderr, /^COMMAND_TERMINATED: /)
  const signaled = JSON.parse((await ledgerLines(oracleDirectory)).at(-1))
  assert.equal(signaled.exitCode, null)
  assert.equal(signaled.signal, 'SIGTERM')
  const green = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-001', ['--reason', 'existing behavior is green'])
  assert.equal(green.status, 1)
  assert.match(green.stderr, /^REQUIRED_LABEL_GRADE: .*lint:exit/)
})

test('O3: RED evidence mapping and test bytes remain bound through GREEN', async (t) => {
  const { root, oracleDirectory } = await workspace(t, {
    harnessFiles: { 'src/save.test.mjs': "import test from 'node:test'\ntest('save', () => {})\n" },
  })
  const red = redRun(oracleDirectory)
  assert.equal(red.status, 0, red.stderr)
  assert.equal(transition(oracleDirectory, 'VALID_RED', 'r-001').status, 0)

  await writeFile(
    join(oracleDirectory, 'evidence.json'),
    JSON.stringify({ schemaVersion: 1, rows: { O1: { kind: 'test', name: 'other test' } } }),
  )
  await writeFile(join(root, 'src', 'save.test.mjs'), "import test from 'node:test'\ntest('rewritten', () => {})\n")
  greenRun(oracleDirectory, 'behavior')
  const withoutBudget = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-002')
  assert.equal(withoutBudget.status, 1)
  assert.match(withoutBudget.stderr, /^HARNESS_BUDGET_REQUIRED: /)

  const budget = run([
    'budget',
    '--dir',
    oracleDirectory,
    '--spend',
    'harness',
    '--reason',
    'mapped test bytes changed',
  ])
  assert.equal(budget.status, 0, budget.stderr)
  const green = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-002')

  assert.equal(green.status, 1)
  assert.match(green.stderr, /^EVIDENCE_STALE: /)
  assert.equal((await state(oracleDirectory)).state, 'VALID_RED')
  assert.equal((await state(oracleDirectory)).budgets.harness.spent, 1)
})

test('O4: reporter destinations cannot alias protected Oracle artifacts', async (t) => {
  const { oracleDirectory } = await workspace(t)
  const protectedState = join(oracleDirectory, 'run-state.json')
  const direct = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'behavior',
    '--report',
    protectedState,
    '--',
    process.execPath,
    '-e',
    'process.exit(0)',
  ])
  assert.equal(direct.status, 1)
  assert.match(direct.stderr, /^REPORT_PATH_PROTECTED: /)
  assert.deepEqual(await ledgerLines(oracleDirectory), [])

  const alias = join(oracleDirectory, 'state-alias.json')
  try {
    await link(protectedState, alias)
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EOPNOTSUPP') return
    throw error
  }
  const hardlink = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'behavior',
    '--report',
    alias,
    '--',
    process.execPath,
    '-e',
    'process.exit(0)',
  ])
  assert.equal(hardlink.status, 1)
  assert.match(hardlink.stderr, /^REPORT_PATH_PROTECTED: /)
  assert.deepEqual(await ledgerLines(oracleDirectory), [])

  const symbolicAlias = join(oracleDirectory, 'state-symbolic-alias.json')
  try {
    await symlink(protectedState, symbolicAlias)
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EOPNOTSUPP') return
    throw error
  }
  const symbolic = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'behavior',
    '--report',
    symbolicAlias,
    '--',
    process.execPath,
    '-e',
    'process.exit(0)',
  ])
  assert.equal(symbolic.status, 1)
  assert.match(symbolic.stderr, /^REPORT_PATH_PROTECTED: /)
  assert.deepEqual(await ledgerLines(oracleDirectory), [])
})

test('O5: init rejects Oracle directories that overlap the production scan root', async (t) => {
  const fixture = await workspace(t, { initialize: false })
  await mkdir(join(fixture.root, 'src', 'production-oracle'), { recursive: true })
  const result = run([
    'init',
    '--dir',
    join(fixture.root, 'src', 'production-oracle'),
    '--lock',
    fixture.lock,
    '--risk',
    'medium',
    '--scan-root',
    fixture.root,
    '--required-label',
    'behavior:reported',
  ])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /^ORACLE_DIR_OVERLAP: /)
  await assert.rejects(readFile(join(fixture.root, 'src', 'production-oracle', 'run-state.json')))
})

test('O6: concurrent transition and budget writes preserve both state changes', async (t) => {
  const { oracleDirectory } = await workspace(t)
  const runnerSource = await readFile(script, 'utf8')
  assert.match(
    runnerSource,
    /async function transition\(options\) \{[\s\S]*?await withDirectoryLock\(directory, 'state', async \(\) => \{/,
  )
  assert.match(
    runnerSource,
    /async function spendBudget\(options\) \{[\s\S]*?await withDirectoryLock\(directory, 'state', async \(\) => \{/,
  )

  const spent = run(['budget', '--dir', oracleDirectory, '--spend', 'policy', '--reason', 'bounded policy change'])
  assert.equal(spent.status, 0, spent.stderr)
  const transitioned = run([
    'transition',
    '--dir',
    oracleDirectory,
    '--to',
    'NEEDS_DECISION',
    '--reason',
    'bounded decision',
  ])
  assert.equal(transitioned.status, 0, transitioned.stderr)
  const current = await state(oracleDirectory)
  assert.equal(current.state, 'NEEDS_DECISION')
  assert.equal(current.budgets.policy.spent, 1)
  assert.equal(current.history.at(-1).state, 'NEEDS_DECISION')
  assert.deepEqual(
    (await ledgerLines(oracleDirectory)).map((line) => JSON.parse(line).type),
    ['budget', 'transition'],
  )
})

test('O11: review packets require post-GREEN state decision and canonical review points', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  const output = join(oracleDirectory, 'packet.json')
  const preGreen = run(['review-packet', '--dir', oracleDirectory, '--output', output])
  assert.equal(preGreen.status, 1)
  assert.match(preGreen.stderr, /^REVIEW_PACKET_STATE: /)

  await reachValidRed(oracleDirectory, root)
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')
  assert.equal(transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003').status, 0)

  const decision = join(oracleDirectory, 'implementation-decision.md')
  await writeFile(decision, 'Implement the approved change.\n')
  const point = changeabilityReviewPoint
  const missingDecision = run(['review-packet', '--dir', oracleDirectory, '--review-point', point, '--output', output])
  assert.equal(missingDecision.status, 1)
  assert.match(missingDecision.stderr, /^IMPLEMENTATION_DECISION_REQUIRED: /)
  const missingPoint = run(['review-packet', '--dir', oracleDirectory, '--decision', decision, '--output', output])
  assert.equal(missingPoint.status, 1)
  assert.match(missingPoint.stderr, /^REVIEW_POINTS_REQUIRED: /)
})

test('O16: state events form a replayable digest chain without lost budget history', async (t) => {
  const { oracleDirectory } = await workspace(t)
  const recorded = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'lint:exit',
    '--',
    process.execPath,
    '-e',
    'process.exit(0)',
  ])
  assert.equal(recorded.status, 0, recorded.stderr)
  const spent = run(['budget', '--dir', oracleDirectory, '--spend', 'policy', '--reason', 'recorded policy change'])
  assert.equal(spent.status, 0, spent.stderr)
  const transitioned = run([
    'transition',
    '--dir',
    oracleDirectory,
    '--to',
    'NEEDS_DECISION',
    '--reason',
    'recorded state decision',
  ])
  assert.equal(transitioned.status, 0, transitioned.stderr)
  const events = (await allLedgerLines(oracleDirectory)).map((line) => JSON.parse(line))
  assert.deepEqual(
    events.map((event) => event.type),
    ['init', 'run', 'budget', 'transition'],
  )
  assert.equal(events[0].previousDigest, '0'.repeat(64))
  for (let index = 0; index < events.length; index += 1) {
    assert.match(events[index].digest, /^[a-f0-9]{64}$/)
    if (index > 0) assert.equal(events[index].previousDigest, events[index - 1].digest)
  }

  const resumed = run(['status', '--dir', oracleDirectory, '--json'])
  assert.equal(resumed.status, 0, resumed.stderr)
  const report = JSON.parse(resumed.stdout)
  assert.equal(report.remainingBudgets.policy.spent, 1)
  assert.equal(report.currentState, 'NEEDS_DECISION')
  assert.equal(report.ledgerStatus.headDigest, events.at(-1).digest)
})

test('a rejection prints the next legal action after the code line', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-next-'))
  t.after(() => rm(root, { recursive: true, force: true }))

  // 코드 줄은 그대로 첫 줄 — 기존 `^CODE: ` 단언이 깨지지 않는다
  const rejected = run(['status', '--dir', join(root, 'not-an-oracle'), '--json'])
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /^STATE_INVALID: /)
  assert.match(rejected.stderr, /\nnext: run `init` if this oracle never entered Delivery/)

  // 인수 오류에는 처방이 없다 — 상태 조회 안내가 오해를 낳는다
  const usage = run(['no-such-command'])
  assert.equal(usage.status, 2)
  assert.match(usage.stderr, /^USAGE: /)
  assert.doesNotMatch(usage.stderr, /\nnext: /)
})

test('status --changed-files lists only the paths changed since the init baseline, one per line', async (t) => {
  const { root, oracleDirectory } = await workspace(t, { initialFiles: { 'src/list.ts': 'export const a = 1\n' } })

  const before = run(['status', '--dir', oracleDirectory, '--changed-files'])
  assert.equal(before.status, 0, before.stderr)
  assert.equal(before.stdout, '')

  await writeFile(join(root, 'src/list.ts'), 'export const a = 2\n')
  await writeFile(join(root, 'src/new.test.ts'), "import test from 'node:test'\ntest('x', () => {})\n")

  const after = run(['status', '--dir', oracleDirectory, '--changed-files'])
  assert.equal(after.status, 0, after.stderr)
  // 레포의 related-tests 도구에 그대로 넘길 수 있는 순수 경로 목록 — 정렬, 스캔 루트 기준 상대 경로
  assert.equal(after.stdout, 'src/list.ts\nsrc/new.test.ts\n')
})

test('card drift blocks progress but still records a FAIL·NEEDS_DECISION stop with the observed drift', async (t) => {
  const { root, oracleDirectory, oracle } = await workspace(t, {
    risk: 'low',
    oracleContent: SOURCED_ORACLE,
    sourceFiles: { 'docs/policy.md': 'approved policy v1\n' },
  })
  await reachValidRed(oracleDirectory, root)
  const trusted = await state(oracleDirectory)
  const lockedOracle = trusted.lockSha256
  const lockedManifest = trusted.lockManifestSha256

  // 잠긴 카드가 바뀌었다 — 성공 진행은 계속 거부한다
  await writeFile(oracle, `${SOURCED_ORACLE}\n<!-- edited after the lock -->\n`)
  const green = transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-001')
  assert.equal(green.status, 1)
  assert.match(green.stderr, /^ORACLE_CHANGED: /)
  assert.equal((await state(oracleDirectory)).state, 'VALID_RED')

  // 그러나 멈춤은 기록할 수 있어야 한다 — 그러지 않으면 드리프트 처방(NEEDS_DECISION으로 복귀)이 도달 불가능하다
  const stopped = run([
    'transition',
    '--dir',
    oracleDirectory,
    '--to',
    'NEEDS_DECISION',
    '--reason',
    'locked card drifted; stopping to re-confirm',
  ])
  assert.equal(stopped.status, 0, stopped.stderr)
  assert.match(stopped.stdout, /^STATE_NEEDS_DECISION run:none\n/)
  assert.match(stopped.stdout, /\nLOCK_UNVERIFIED ORACLE_CHANGED\n/)

  const paused = await state(oracleDirectory)
  assert.equal(paused.state, 'NEEDS_DECISION')
  const entry = paused.history.at(-1)
  assert.equal(entry.reason, 'locked card drifted; stopping to re-confirm')
  assert.equal(entry.runId, null)
  // 마지막으로 신뢰된 revision은 보존된다 — 드리프트한 바이트로 덮어쓰지 않는다
  assert.equal(paused.lockSha256, lockedOracle)
  assert.equal(paused.lockManifestSha256, lockedManifest)
  // 멈춤 원인은 기대값·관측값·실제 오류를 함께 남긴다
  assert.equal(entry.lockStop.code, 'ORACLE_CHANGED')
  assert.equal(entry.lockStop.expectedManifestSha256, lockedManifest)
  assert.match(entry.lockStop.message, /oracle\.md no longer matches the lock/)
  assert.equal(entry.lockStop.priorState, 'VALID_RED')
  // 기대값은 마지막으로 신뢰된 revision, 관측값은 지금 실제로 읽히는 바이트다 — 둘 다 사실로 남긴다
  assert.equal(entry.lockStop.expectedOracleSha256, lockedOracle)
  assert.match(entry.lockStop.observedManifestSha256, /^[a-f0-9]{64}$/)
  assert.equal(entry.lockStop.observedManifestSha256, lockedManifest) // manifest는 아직 그대로다
  const driftedCard = createHash('sha256')
    .update(await readFile(oracle))
    .digest('hex')
  assert.equal(entry.lockStop.observedOracleSha256, driftedCard)
  assert.notEqual(entry.lockStop.observedOracleSha256, entry.lockStop.expectedOracleSha256)
  const events = (await allLedgerLines(oracleDirectory)).map((line) => JSON.parse(line))
  const recorded = events.at(-1)
  assert.equal(recorded.type, 'transition')
  assert.equal(recorded.state, 'NEEDS_DECISION')
  assert.equal(recorded.evidenceRunId, null) // 없는 exec runId를 지어내지 않는다
  assert.deepEqual(recorded.lockStop, entry.lockStop)
  assert.equal(recorded.previousDigest, events.at(-2).digest)

  // 멈춤을 기록했다고 재개 권한이 생기지는 않는다 — 드리프트가 남은 채로 ORACLE_READY 재개는 거부된다
  const resumedWhileDrifted = run(['transition', '--dir', oracleDirectory, '--to', 'ORACLE_READY', '--run', 'r-001'])
  assert.equal(resumedWhileDrifted.status, 1)
  assert.match(resumedWhileDrifted.stderr, /^ORACLE_CHANGED: /)
  assert.equal((await state(oracleDirectory)).state, 'NEEDS_DECISION')
  // 자동 relock도 없다 — lock manifest 바이트는 그대로다
  assert.equal(
    createHash('sha256')
      .update(await readFile(join(oracleDirectory, 'oracle.lock.json')))
      .digest('hex'),
    lockedManifest,
  )

  // 반복 호출도 같은 방식으로 안전하다: 두 번째 멈춤은 새 항목을 덧붙일 뿐 앞선 기록을 고치지 않는다
  const beforeRepeat = (await allLedgerLines(oracleDirectory)).length
  const again = run([
    'transition',
    '--dir',
    oracleDirectory,
    '--to',
    'FAIL',
    '--reason',
    'still drifted; reporting the real failure',
  ])
  assert.equal(again.status, 0, again.stderr)
  const failed = await state(oracleDirectory)
  assert.equal(failed.state, 'FAIL')
  assert.equal(failed.lockSha256, lockedOracle)
  assert.equal(failed.history.at(-1).lockStop.code, 'ORACLE_CHANGED')
  assert.equal(failed.history.at(-1).lockStop.priorState, 'NEEDS_DECISION')
  const afterRepeat = (await allLedgerLines(oracleDirectory)).map((line) => JSON.parse(line))
  assert.equal(afterRepeat.length, beforeRepeat + 1)
  assert.deepEqual(afterRepeat.at(-2), recorded) // 앞선 기록은 한 바이트도 바뀌지 않는다
  assert.equal(afterRepeat.at(-1).previousDigest, recorded.digest)

  // FAIL은 종착이다 — 멈춤 기록이 상태표를 넓히지도 않는다
  const resumed = run(['transition', '--dir', oracleDirectory, '--to', 'ORACLE_READY', '--run', 'r-001'])
  assert.equal(resumed.status, 1)
  assert.match(resumed.stderr, /^TRANSITION_NOT_ALLOWED: /)
})

test('source and manifest drift record their own stop cause, and a corrupt ledger fails closed without repair', async (t) => {
  const { root, oracleDirectory } = await workspace(t, {
    risk: 'low',
    oracleContent: SOURCED_ORACLE,
    sourceFiles: { 'docs/policy.md': 'approved policy v1\n' },
  })
  await reachValidRed(oracleDirectory, root)

  await writeFile(join(root, 'docs/policy.md'), 'approved policy v2\n')
  const stopped = run([
    'transition',
    '--dir',
    oracleDirectory,
    '--to',
    'NEEDS_DECISION',
    '--reason',
    'source drifted under the lock',
  ])
  assert.equal(stopped.status, 0, stopped.stderr)
  assert.match(stopped.stdout, /\nLOCK_UNVERIFIED SOURCE_CHANGED\n/)
  const sourceStop = (await state(oracleDirectory)).history.at(-1).lockStop
  assert.equal(sourceStop.code, 'SOURCE_CHANGED')
  assert.match(sourceStop.message, /policy\.md no longer matches the lock/)
  // 카드도 manifest도 그대로이므로 관측값은 기대값과 같다 — 드리프트한 것은 잠긴 출처다
  assert.equal(sourceStop.observedOracleSha256, sourceStop.expectedOracleSha256)
  assert.equal(sourceStop.observedManifestSha256, sourceStop.expectedManifestSha256)
  assert.equal(sourceStop.manifestTrusted, true)
  // 어떤 잠긴 출처가 어떻게 어긋났는지도 기대값·관측값으로 남는다
  const drifted = sourceStop.observedSources.find((entry) => entry.path.endsWith('docs/policy.md'))
  assert.ok(drifted, JSON.stringify(sourceStop.observedSources))
  assert.equal(
    drifted.observedSha256,
    createHash('sha256')
      .update(await readFile(join(root, 'docs/policy.md')))
      .digest('hex'),
  )
  assert.notEqual(drifted.observedSha256, drifted.expectedSha256)

  // manifest 바이트 드리프트도 같은 방식으로 멈춤을 기록한다
  const manifestFixture = await workspace(t, {
    risk: 'low',
    oracleContent: SOURCED_ORACLE,
    sourceFiles: { 'docs/policy.md': 'approved policy v1\n' },
  })
  await reachValidRed(manifestFixture.oracleDirectory, manifestFixture.root)
  const expectedManifest = (await state(manifestFixture.oracleDirectory)).lockManifestSha256
  const manifest = JSON.parse(await readFile(manifestFixture.lock, 'utf8'))
  await writeFile(manifestFixture.lock, `${JSON.stringify(manifest)}\n`) // 선언된 digest는 그대로, 바이트만 다르다
  const progress = transition(manifestFixture.oracleDirectory, 'IMPLEMENTED_GREEN', 'r-001')
  assert.equal(progress.status, 1)
  assert.match(progress.stderr, /^LOCK_MANIFEST_CHANGED: /)
  const manifestStopped = run([
    'transition',
    '--dir',
    manifestFixture.oracleDirectory,
    '--to',
    'FAIL',
    '--reason',
    'lock manifest bytes drifted',
  ])
  assert.equal(manifestStopped.status, 0, manifestStopped.stderr)
  assert.match(manifestStopped.stdout, /\nLOCK_UNVERIFIED LOCK_MANIFEST_CHANGED\n/)
  const manifestStop = (await state(manifestFixture.oracleDirectory)).history.at(-1).lockStop
  assert.equal(manifestStop.code, 'LOCK_MANIFEST_CHANGED')
  assert.equal(manifestStop.expectedManifestSha256, expectedManifest)
  assert.match(manifestStop.observedManifestSha256, /^[a-f0-9]{64}$/)
  assert.notEqual(manifestStop.observedManifestSha256, expectedManifest)
  assert.equal((await state(manifestFixture.oracleDirectory)).lockManifestSha256, expectedManifest)
  // manifest 자체가 드리프트했으면 그 안의 포인터는 신뢰 입력이 아니다 — 따라가지 않고 unavailable로 남긴다
  assert.equal(manifestStop.manifestTrusted, false)
  assert.equal(manifestStop.observedOracleSha256, null)
  assert.deepEqual(manifestStop.observedSources, [])

  // 원장이 손상되면 멈춤조차 기록하지 않는다 — 실행 정체성을 신뢰할 수 없으면 fail closed다
  const ledger = join(oracleDirectory, 'runs.jsonl')
  const before = await readFile(ledger, 'utf8')
  const lines = before.split('\n').filter(Boolean)
  const tampered = JSON.parse(lines.at(-1))
  tampered.reason = 'rewritten after the fact'
  await writeFile(ledger, `${[...lines.slice(0, -1), JSON.stringify(tampered)].join('\n')}\n`)
  const corrupt = run([
    'transition',
    '--dir',
    oracleDirectory,
    '--to',
    'FAIL',
    '--reason',
    'stop on a corrupt ledger',
  ])
  assert.equal(corrupt.status, 1)
  assert.match(corrupt.stderr, /^LEDGER_INVALID: /)
  // 원장은 고쳐지지도, 덮어써지지도 않는다
  const after = await readFile(ledger, 'utf8')
  assert.equal(after.split('\n').filter(Boolean).length, lines.length)
  assert.equal(JSON.parse(after.split('\n').filter(Boolean).at(-1)).reason, 'rewritten after the fact')
})

test('an interrupted stop write is recovered from the ledger without losing or duplicating the stop cause', async (t) => {
  const { root, oracleDirectory, oracle } = await workspace(t, { risk: 'low' })
  await reachValidRed(oracleDirectory, root)
  const statePath = join(oracleDirectory, 'run-state.json')
  // 멈춤 직전의 run-state 바이트 — ledger는 기록됐지만 state 쓰기가 끊긴 상황을 이 바이트로 재현한다
  const beforeStopState = await readFile(statePath, 'utf8')

  await writeFile(oracle, `${ORACLE}\n<!-- edited after the lock -->\n`)
  const stopped = run([
    'transition',
    '--dir',
    oracleDirectory,
    '--to',
    'NEEDS_DECISION',
    '--reason',
    'card drifted; stopping',
  ])
  assert.equal(stopped.status, 0, stopped.stderr)
  const committed = (await allLedgerLines(oracleDirectory)).map((line) => JSON.parse(line))
  const stopEvent = committed.at(-1)
  assert.equal(stopEvent.state, 'NEEDS_DECISION')
  assert.equal(stopEvent.lockStop.code, 'ORACLE_CHANGED')

  // ledger 기록과 state 쓰기 사이에서 끊긴 것처럼 run-state만 되돌린다 (ledger는 손대지 않는다)
  await writeFile(statePath, beforeStopState)

  // status는 원장으로부터 멈춤을 복구해 보여준다 — 기록이 사라지지 않는다
  const recovered = run(['status', '--dir', oracleDirectory, '--json'])
  assert.equal(recovered.status, 0, recovered.stderr)
  const report = JSON.parse(recovered.stdout)
  assert.equal(report.currentState, 'NEEDS_DECISION')
  assert.equal(report.ledgerStatus.headDigest, stopEvent.digest)
  assert.equal(report.lockStatus.code, 'ORACLE_CHANGED')

  // 복구 이후의 합법적인 멈춤도 원장 위에서 이어진다 — 앞선 원인은 그대로 남고 중복 기록도 없다
  const next = run(['transition', '--dir', oracleDirectory, '--to', 'FAIL', '--reason', 'still drifted'])
  assert.equal(next.status, 0, next.stderr)
  const after = (await allLedgerLines(oracleDirectory)).map((line) => JSON.parse(line))
  assert.equal(after.length, committed.length + 1)
  assert.deepEqual(after.slice(0, committed.length), committed) // 잃지도 고치지도 않는다
  assert.equal(after.at(-1).previousDigest, stopEvent.digest)
  const replayed = await state(oracleDirectory)
  assert.equal(replayed.state, 'FAIL')
  const stops = replayed.history.filter((entry) => entry.state === 'NEEDS_DECISION')
  assert.equal(stops.length, 1) // 복구가 같은 멈춤을 두 번 만들지 않는다
  assert.equal(stops[0].reason, 'card drifted; stopping')
  assert.equal(stops.at(-1).lockStop.code, 'ORACLE_CHANGED')

  // 같은 목적지로의 재시도는 기존 관례대로 거부되고 이벤트를 남기지 않는다
  const repeated = run(['transition', '--dir', oracleDirectory, '--to', 'FAIL', '--reason', 'same target again'])
  assert.equal(repeated.status, 1)
  assert.match(repeated.stderr, /^TRANSITION_NOT_ALLOWED: /)
  assert.equal((await allLedgerLines(oracleDirectory)).length, after.length)
})

test('a stop observation never follows a drifted manifest pointer out of the repository or through a symlink', async (t) => {
  const outside = await mkdtemp(join(tmpdir(), 'oracle-outside-'))
  t.after(() => rm(outside, { recursive: true, force: true }))
  const secret = join(outside, 'secret.md')
  await writeFile(secret, 'secret bytes the stop record must never claim as an observation\n')
  const secretDigest = createHash('sha256')
    .update(await readFile(secret))
    .digest('hex')

  // 1) manifest가 저장소 밖을 가리키도록 조작한다 — manifest 바이트가 바뀌므로 신뢰 대상이 아니다
  const escaping = await workspace(t, { risk: 'low' })
  await reachValidRed(escaping.oracleDirectory, escaping.root)
  const escapingManifest = JSON.parse(await readFile(escaping.lock, 'utf8'))
  escapingManifest.oracle.path = relative(dirname(escaping.lock), secret)
  await writeFile(escaping.lock, `${JSON.stringify(escapingManifest)}\n`)
  const escaped = run([
    'transition',
    '--dir',
    escaping.oracleDirectory,
    '--to',
    'FAIL',
    '--reason',
    'manifest points outside the repository',
  ])
  assert.equal(escaped.status, 0, escaped.stderr)
  const escapedStop = (await state(escaping.oracleDirectory)).history.at(-1).lockStop
  assert.equal(escapedStop.manifestTrusted, false)
  assert.equal(escapedStop.observedOracleSha256, null)
  assert.notEqual(escapedStop.observedOracleSha256, secretDigest)

  // 2) 잠긴 카드 경로 자체가 심볼릭 링크로 바뀌어도 링크를 따라가 다른 파일을 사실로 적지 않는다
  const linked = await workspace(t, { risk: 'low' })
  await reachValidRed(linked.oracleDirectory, linked.root)
  const cardPath = join(linked.oracleDirectory, 'oracle.md')
  await rm(cardPath)
  await symlink(secret, cardPath)
  const linkedStop = run([
    'transition',
    '--dir',
    linked.oracleDirectory,
    '--to',
    'FAIL',
    '--reason',
    'locked card replaced by a symlink',
  ])
  assert.equal(linkedStop.status, 0, linkedStop.stderr)
  const symlinkStop = (await state(linked.oracleDirectory)).history.at(-1).lockStop
  // manifest는 그대로이므로 포인터는 따를 수 있지만, 링크는 스냅샷 규칙이 거부한다
  assert.equal(symlinkStop.manifestTrusted, true)
  assert.equal(symlinkStop.observedOracleSha256, null)
  assert.notEqual(symlinkStop.observedOracleSha256, secretDigest)
})

/**
 * High 런의 모든 게이트를 실제로 통과시킨 뒤 REVIEW_VERIFIED 직전에 세우는 fixture.
 * 블라인드 매핑 하나만 남겨 두고 나머지는 전부 유효하다.
 */
async function highRiskReviewReady(t) {
  const source = 'src/save.mjs'
  const original = 'export const guarded = true\n'
  const { root, oracleDirectory, oracle, lock } = await workspace(t, {
    risk: 'high',
    initialFiles: { [source]: original },
  })
  await reachValidRed(oracleDirectory, root)
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')
  greenRun(oracleDirectory, 'green-3')
  assert.equal(transition(oracleDirectory, 'IMPLEMENTED_GREEN', 'r-004').status, 0)

  // GREEN 이후 mutation kill 증거 — 가드를 지우면 실패하고, 정확히 복원한 뒤 다시 통과한다
  await writeFile(join(root, source), 'export const guarded = false\n')
  redRun(oracleDirectory)
  await writeFile(join(root, source), original)
  greenRun(oracleDirectory, 'review')

  const second = join(oracleDirectory, 'findings-second.json')
  await writeFile(
    second,
    JSON.stringify({ ...CLEAR_REVIEW, reviewer: 'second-code-reviewer', reviewerId: 'second-code-reviewer' }),
  )
  return {
    root,
    oracleDirectory,
    oracle,
    lock,
    reviewRunId: 'r-006',
    extra: ['--intersect', second, '--mutation-run', 'r-005', '--mutation-row', 'O1'],
  }
}

test('REVIEW_VERIFIED requires the blind row↔test mapping — omitting the option cannot bypass it', async (t) => {
  const fixture = await highRiskReviewReady(t)

  // 다른 모든 게이트가 유효한 High 런에서, 블라인드 매핑 옵션을 그냥 빼면 통과해서는 안 된다
  const omitted = transition(fixture.oracleDirectory, 'REVIEW_VERIFIED', fixture.reviewRunId, fixture.extra)
  assert.equal(omitted.status, 1, omitted.stdout)
  assert.match(omitted.stderr, /^BLIND_MAP_REQUIRED: /)
  assert.equal((await state(fixture.oracleDirectory)).state, 'IMPLEMENTED_GREEN')
})

/** blind-input을 만들고, 그것만 읽은 리뷰어의 매핑을 원장 영수증으로 기록한다. */
function blindMappingEvidence(oracleDirectory, mapping, { reviewer = 'blind-reader', taskId = 'blind-1' } = {}) {
  const input = join(oracleDirectory, 'blind-input.json')
  const derived = run(['blind-input', '--dir', oracleDirectory, '--output', input])
  if (derived.status !== 0) return { derived, args: [] }
  const document = JSON.parse(readFileSync(input, 'utf8'))
  const map = join(oracleDirectory, 'blind-map.json')
  writeFileSync(map, JSON.stringify(mapping(document)))
  const receipt = run([
    'review-receipt',
    '--dir',
    oracleDirectory,
    '--packet',
    input,
    '--revision',
    document.targetRevision,
    '--findings',
    map,
    '--role',
    'blind-mapper',
    '--reviewer',
    reviewer,
    '--task-id',
    taskId,
  ])
  return { derived, receipt, input, map, document, args: ['--blind-input', input, '--blind-map', map] }
}

test('the blind mapping input carries only contract rows and frozen test sources, never the mapping', async (t) => {
  const fixture = await highRiskReviewReady(t)
  const output = join(fixture.oracleDirectory, 'blind-input.json')
  const derived = run(['blind-input', '--dir', fixture.oracleDirectory, '--output', output])
  assert.equal(derived.status, 0, derived.stderr)
  assert.match(derived.stdout, /^BLIND_INPUT_WRITTEN blind-input\.json required:true revision:[a-f0-9]{64}\n$/)

  const document = JSON.parse(await readFile(output, 'utf8'))
  const serialized = JSON.stringify(document)
  // 리뷰어가 읽는 것은 계약 행과 테스트 원문뿐이다
  assert.ok(document.contractRows.some((row) => row.startsWith('| O1 ')), serialized)
  assert.ok(document.testSources.length > 0)
  for (const source of document.testSources) {
    assert.match(source.sha256, /^[a-f0-9]{64}$/)
    assert.equal(
      createHash('sha256').update(source.content).digest('hex'),
      source.sha256,
    )
  }
  // 매핑·구현 결정·다른 리뷰 판정은 들어 있지 않다
  for (const leaked of ['rows', 'evidence', 'implementationDecision', 'findings', 'reviewPoints', 'diff']) {
    assert.equal(document[leaked], undefined, leaked)
  }
  // 테스트 이름은 테스트 원문에 당연히 있다 — 블라인드 리뷰어는 그것을 읽고 행을 추론해야 한다.
  // 없어야 하는 것은 "그 이름이 어느 행에 매핑됐는가"다: 행 ID는 계약 행 줄에만, 테스트 이름은 소스에만 있고
  // 둘을 잇는 문장은 어디에도 없다.
  const testNames = document.testSources.map((source) => source.content).join('\n')
  assert.match(testNames, /save > pending/)
  for (const source of document.testSources) {
    assert.doesNotMatch(source.content, /\bO1\b/, source.path) // 테스트 소스가 행 ID를 알려주지 않는다
  }
  assert.equal(document.blindMappingRequired, true)
  assert.equal(document.applicability, undefined) // 사유는 매핑에서 파생된 힌트라 입력에 넣지 않는다
  // 매핑은 digest로만 묶인다
  assert.match(document.evidenceMappingSha256, /^[a-f0-9]{64}$/)
  assert.equal(
    document.evidenceMappingSha256,
    createHash('sha256')
      .update(await readFile(join(fixture.oracleDirectory, 'evidence.json')))
      .digest('hex'),
  )

  // 검증 입력을 덮어쓰는 산출물 경로는 거부된다
  for (const [name, path] of [
    ['oracle', join(fixture.oracleDirectory, 'oracle.md')],
    ['lock', join(fixture.oracleDirectory, 'oracle.lock.json')],
    ['state', join(fixture.oracleDirectory, 'run-state.json')],
    ['ledger', join(fixture.oracleDirectory, 'runs.jsonl')],
    ['evidence', join(fixture.oracleDirectory, 'evidence.json')],
  ]) {
    const rejected = run(['blind-input', '--dir', fixture.oracleDirectory, '--output', path])
    assert.equal(rejected.status, 1, name)
    assert.match(rejected.stderr, /^BLIND_INPUT_INVALID: /, name)
  }
  // 심볼릭 링크 부모를 통해 디렉터리 밖으로 새는 산출물도 거부된다
  const outside = await mkdtemp(join(tmpdir(), 'oracle-blind-out-'))
  t.after(() => rm(outside, { recursive: true, force: true }))
  await symlink(outside, join(fixture.oracleDirectory, 'escape'))
  const escaped = run([
    'blind-input',
    '--dir',
    fixture.oracleDirectory,
    '--output',
    join(fixture.oracleDirectory, 'escape', 'blind.json'),
  ])
  assert.equal(escaped.status, 1)
  assert.match(escaped.stderr, /^BLIND_INPUT_INVALID: /)
})

test('a bound blind mapping that agrees with the evidence completes REVIEW_VERIFIED and is recorded', async (t) => {
  const fixture = await highRiskReviewReady(t)
  const blind = blindMappingEvidence(fixture.oracleDirectory, () => ({ 'save > pending': ['O1'] }))
  assert.equal(blind.derived.status, 0, blind.derived.stderr)
  assert.equal(blind.receipt.status, 0, blind.receipt.stderr)
  assert.match(blind.receipt.stdout, /^BLIND_MAP_RECEIPT [a-f0-9]{64} digest:[a-f0-9]{64}\n$/)

  const verified = transition(fixture.oracleDirectory, 'REVIEW_VERIFIED', fixture.reviewRunId, [
    ...fixture.extra,
    ...blind.args,
  ])
  assert.equal(verified.status, 0, verified.stderr)
  const current = await state(fixture.oracleDirectory)
  assert.equal(current.state, 'REVIEW_VERIFIED')
  const entry = current.history.at(-1)
  assert.equal(entry.blindMapping.required, true)
  assert.equal(entry.blindMapping.reviewerId, 'blind-reader')
  assert.equal(entry.blindMapping.taskId, 'blind-1')
  assert.match(entry.blindMapping.mapSha256, /^[a-f0-9]{64}$/)
  const recorded = (await allLedgerLines(fixture.oracleDirectory)).map((line) => JSON.parse(line)).at(-1)
  assert.deepEqual(recorded.blindMapping, entry.blindMapping)
})

test('a disputed blind mapping blocks REVIEW_VERIFIED instead of certifying the evidence mapping', async (t) => {
  const fixture = await highRiskReviewReady(t)
  const blind = blindMappingEvidence(fixture.oracleDirectory, () => ({ 'save > pending': ['O9'] }))
  assert.equal(blind.receipt.status, 0, blind.receipt.stderr)

  const disputed = transition(fixture.oracleDirectory, 'REVIEW_VERIFIED', fixture.reviewRunId, [
    ...fixture.extra,
    ...blind.args,
  ])
  assert.equal(disputed.status, 1)
  assert.match(disputed.stderr, /^EVIDENCE_MAPPING_DISPUTED: /)
  assert.equal((await state(fixture.oracleDirectory)).state, 'IMPLEMENTED_GREEN')
})

test('a blind mapping bound to the wrong revision, stale tests, a changed mapping, or another receipt is rejected', async (t) => {
  const evidencePathOf = (oracleDirectory) => join(oracleDirectory, 'evidence.json')

  // 잘못된 리비전 — 다른 리비전에서 파생된 입력은 이 승인 대상의 반증이 아니다
  const wrongRevision = await highRiskReviewReady(t)
  const staleInput = blindMappingEvidence(wrongRevision.oracleDirectory, () => ({ 'save > pending': ['O1'] }))
  assert.equal(staleInput.receipt.status, 0, staleInput.receipt.stderr)
  const tampered = JSON.parse(await readFile(staleInput.input, 'utf8'))
  tampered.targetRevision = 'f'.repeat(64)
  await writeFile(staleInput.input, JSON.stringify(tampered))
  const rejectedRevision = transition(
    wrongRevision.oracleDirectory,
    'REVIEW_VERIFIED',
    wrongRevision.reviewRunId,
    [...wrongRevision.extra, ...staleInput.args],
  )
  assert.equal(rejectedRevision.status, 1)
  assert.match(rejectedRevision.stderr, /^BLIND_INPUT_STALE: /)

  // 낡은 테스트 — 블라인드로 읽은 테스트 바이트가 지금 바이트와 다르면 그 읽기는 만료다
  const staleTests = await highRiskReviewReady(t)
  const staleBlind = blindMappingEvidence(staleTests.oracleDirectory, () => ({ 'save > pending': ['O1'] }))
  assert.equal(staleBlind.receipt.status, 0, staleBlind.receipt.stderr)
  const readTest = staleBlind.document.testSources[0].path
  await writeFile(join(staleTests.root, readTest), `${await readFile(join(staleTests.root, readTest), 'utf8')}\n// touched\n`)
  const rejectedTests = transition(staleTests.oracleDirectory, 'REVIEW_VERIFIED', staleTests.reviewRunId, [
    ...staleTests.extra,
    ...staleBlind.args,
  ])
  assert.equal(rejectedTests.status, 1)
  assert.notEqual(rejectedTests.status, 0)
  assert.match(rejectedTests.stderr, /^(BLIND_INPUT_STALE|REVIEW_RUN_STALE|SNAPSHOT_STALE): /)

  // 바뀐 매핑 — 블라인드 읽기 이후 매핑이 바뀌면 그 읽기는 새 매핑을 반증하지 못한다
  const changedMapping = await highRiskReviewReady(t)
  const changedBlind = blindMappingEvidence(changedMapping.oracleDirectory, () => ({ 'save > pending': ['O1'] }))
  assert.equal(changedBlind.receipt.status, 0, changedBlind.receipt.stderr)
  const evidence = JSON.parse(await readFile(evidencePathOf(changedMapping.oracleDirectory), 'utf8'))
  await writeFile(
    evidencePathOf(changedMapping.oracleDirectory),
    `${JSON.stringify(evidence)}\n`, // 같은 내용, 다른 바이트 — 매핑 digest 결속을 확인한다
  )
  const rejectedMapping = transition(
    changedMapping.oracleDirectory,
    'REVIEW_VERIFIED',
    changedMapping.reviewRunId,
    [...changedMapping.extra, ...changedBlind.args],
  )
  assert.equal(rejectedMapping.status, 1)
  assert.match(rejectedMapping.stderr, /^BLIND_MAP_STALE: /)

  // 잘못된 영수증 — 영수증이 없거나, 이 입력·이 매핑을 가리키지 않으면 거절한다
  const wrongReceipt = await highRiskReviewReady(t)
  const unreceipted = run([
    'blind-input',
    '--dir',
    wrongReceipt.oracleDirectory,
    '--output',
    join(wrongReceipt.oracleDirectory, 'blind-input.json'),
  ])
  assert.equal(unreceipted.status, 0, unreceipted.stderr)
  const bareMap = join(wrongReceipt.oracleDirectory, 'blind-map.json')
  await writeFile(bareMap, JSON.stringify({ 'save > pending': ['O1'] }))
  const rejectedReceipt = transition(wrongReceipt.oracleDirectory, 'REVIEW_VERIFIED', wrongReceipt.reviewRunId, [
    ...wrongReceipt.extra,
    '--blind-input',
    join(wrongReceipt.oracleDirectory, 'blind-input.json'),
    '--blind-map',
    bareMap,
  ])
  assert.equal(rejectedReceipt.status, 1)
  assert.match(rejectedReceipt.stderr, /^BLIND_MAP_RECEIPT_INVALID: /)

  // 영수증을 받은 뒤 매핑 바이트를 바꿔치기해도 같은 영수증으로 통과할 수 없다
  const swapped = await highRiskReviewReady(t)
  const swappedBlind = blindMappingEvidence(swapped.oracleDirectory, () => ({ 'save > pending': ['O1'] }))
  assert.equal(swappedBlind.receipt.status, 0, swappedBlind.receipt.stderr)
  await writeFile(swappedBlind.map, JSON.stringify({ 'save > pending': ['O1'], extra: ['O1'] }))
  const rejectedSwap = transition(swapped.oracleDirectory, 'REVIEW_VERIFIED', swapped.reviewRunId, [
    ...swapped.extra,
    ...swappedBlind.args,
  ])
  assert.equal(rejectedSwap.status, 1)
  assert.match(rejectedSwap.stderr, /^BLIND_MAP_RECEIPT_INVALID: /)
})

test('the blind mapping reviewer cannot be a reviewer who already read the packet', async (t) => {
  const fixture = await highRiskReviewReady(t)
  const blind = blindMappingEvidence(fixture.oracleDirectory, () => ({ 'save > pending': ['O1'] }), {
    reviewer: CLEAR_REVIEW.reviewerId, // 판정 리뷰어는 이미 evidence.json이 담긴 패킷을 읽었다
    taskId: 'blind-same-reviewer',
  })
  assert.equal(blind.receipt.status, 0, blind.receipt.stderr)

  const rejected = transition(fixture.oracleDirectory, 'REVIEW_VERIFIED', fixture.reviewRunId, [
    ...fixture.extra,
    ...blind.args,
  ])
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /^BLIND_MAP_RECEIPT_INVALID: /)
  assert.match(rejected.stderr, /never saw evidence\.json/)
})

test('blind mapping applicability follows risk and the mapping shape: Medium N:1 applies, Medium 1:1 and Low do not', async (t) => {
  // Medium 1:1 — 한 행이 자기 테스트를 가지므로 블라인드 매핑은 요구되지 않는다
  const oneToOne = await workspace(t, { risk: 'medium' })
  await reachValidRed(oneToOne.oracleDirectory, oneToOne.root)
  greenRun(oneToOne.oracleDirectory, 'green-1')
  greenRun(oneToOne.oracleDirectory, 'green-2')
  assert.equal(transition(oneToOne.oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003').status, 0)
  greenRun(oneToOne.oracleDirectory, 'review')
  const verified = transition(oneToOne.oracleDirectory, 'REVIEW_VERIFIED', 'r-004')
  assert.equal(verified.status, 0, verified.stderr)
  assert.equal((await state(oneToOne.oracleDirectory)).state, 'REVIEW_VERIFIED')
  // 해당 없음도 기록된다 — "요구되지 않았다"가 "확인하지 않았다"와 구분된다
  assert.equal((await state(oneToOne.oracleDirectory)).history.at(-1).blindMapping.required, false)
  assert.deepEqual((await state(oneToOne.oracleDirectory)).history.at(-1).blindMapping.shared, [])

  // Medium N:1 — 두 행이 한 테스트를 공유하면 그 테스트가 정말 두 행을 다 강제하는지 블라인드로 확인한다
  const shared = await workspace(t, {
    risk: 'medium',
    oracleContent: MILESTONE_ORACLE,
    evidence: {
      schemaVersion: 1,
      rows: { O1: { kind: 'test', name: 'save > pending' }, O2: { kind: 'test', name: 'save > pending' } },
    },
  })
  await reachValidRed(shared.oracleDirectory, shared.root)
  greenRun(shared.oracleDirectory, 'green-1')
  greenRun(shared.oracleDirectory, 'green-2')
  assert.equal(transition(shared.oracleDirectory, 'IMPLEMENTED_GREEN', 'r-003').status, 0)
  greenRun(shared.oracleDirectory, 'review')
  const required = transition(shared.oracleDirectory, 'REVIEW_VERIFIED', 'r-004')
  assert.equal(required.status, 1, required.stdout)
  assert.match(required.stderr, /^BLIND_MAP_REQUIRED: /)
  assert.match(required.stderr, /rows sharing one test/)

  const blind = blindMappingEvidence(shared.oracleDirectory, () => ({ 'save > pending': ['O1', 'O2'] }))
  assert.equal(blind.receipt.status, 0, blind.receipt.stderr)
  const cleared = transition(shared.oracleDirectory, 'REVIEW_VERIFIED', 'r-004', blind.args)
  assert.equal(cleared.status, 0, cleared.stderr)
  assert.equal((await state(shared.oracleDirectory)).history.at(-1).blindMapping.required, true)

  // Low — 블라인드 매핑은 Low 경로를 건드리지 않는다
  const low = await workspace(t, { risk: 'low' })
  await reachValidRed(low.oracleDirectory, low.root)
  greenRun(low.oracleDirectory, 'green-1')
  assert.equal(transition(low.oracleDirectory, 'IMPLEMENTED_GREEN', 'r-002').status, 0)
  greenRun(low.oracleDirectory, 'review')
  const lowVerified = transition(low.oracleDirectory, 'REVIEW_VERIFIED', 'r-003')
  assert.equal(lowVerified.status, 0, lowVerified.stderr)
  assert.equal((await state(low.oracleDirectory)).history.at(-1).blindMapping.required, false)
})

test('status --json explains the same final blind-mapping gate the transition enforces', async (t) => {
  const fixture = await highRiskReviewReady(t)
  const report = JSON.parse(run(['status', '--dir', fixture.oracleDirectory, '--json']).stdout)
  const review = report.nextActions.find((action) => action.to === 'REVIEW_VERIFIED')
  assert.ok(review.requires.includes('--blind-input'), review.requires.join(' '))
  assert.ok(review.requires.includes('--blind-map'), review.requires.join(' '))
  assert.ok(review.blockers.includes('BLIND_MAP_REQUIRED'), review.blockers.join(' '))
  assert.equal(review.blindMapping.required, true)
  assert.match(review.blindMapping.reason, /high-risk review always runs the blind mapping/)
  assert.match(review.example, /--blind-input <blind-input> --blind-map <blind-map>/)

  // 실제로 결속을 만들면 같은 게이트가 해소된 것으로 보고한다
  const blind = blindMappingEvidence(fixture.oracleDirectory, () => ({ 'save > pending': ['O1'] }))
  assert.equal(blind.receipt.status, 0, blind.receipt.stderr)
  const after = JSON.parse(run(['status', '--dir', fixture.oracleDirectory, '--json']).stdout)
  const reviewAfter = after.nextActions.find((action) => action.to === 'REVIEW_VERIFIED')
  assert.ok(!reviewAfter.blockers.includes('BLIND_MAP_REQUIRED'), reviewAfter.blockers.join(' '))
})

test('legacy runs without blind-mapping evidence are still readable but cannot be certified as verified', async (t) => {
  const fixture = await highRiskReviewReady(t)
  // 이 원장에는 blind-mapper 영수증이 없다 — 새 증거가 없는 예전 진행 상태다
  const legacyLedger = (await allLedgerLines(fixture.oracleDirectory)).map((line) => JSON.parse(line))
  assert.ok(!legacyLedger.some((entry) => entry.role === 'blind-mapper'))

  // 읽기는 된다: status가 실패하지 않고 상태와 다음 행동을 그대로 설명한다
  const report = run(['status', '--dir', fixture.oracleDirectory, '--json'])
  assert.equal(report.status, 0, report.stderr)
  const parsed = JSON.parse(report.stdout)
  assert.equal(parsed.currentState, 'IMPLEMENTED_GREEN')
  assert.equal(parsed.evidenceStatus.status, 'verified')
  // 그러나 인증은 안 된다 — 빠진 증거가 면제로 읽히지 않는다
  assert.ok(
    parsed.nextActions.find((action) => action.to === 'REVIEW_VERIFIED').blockers.includes('BLIND_MAP_REQUIRED'),
  )
  const attempted = transition(fixture.oracleDirectory, 'REVIEW_VERIFIED', fixture.reviewRunId, fixture.extra)
  assert.equal(attempted.status, 1)
  assert.match(attempted.stderr, /^BLIND_MAP_REQUIRED: /)
  assert.equal((await state(fixture.oracleDirectory)).state, 'IMPLEMENTED_GREEN')
})
