import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const script = join(dirname(fileURLToPath(import.meta.url)), 'oracle-verify.mjs')

function run(...args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
}

async function directory(t) {
  const created = await mkdtemp(join(tmpdir(), 'oracle-verify-'))
  t.after(() => rm(created, { recursive: true, force: true }))
  return created
}

/** 자동 추가 TC 7종과 출처·Never·부작용을 모두 채운 최소 통과 카드. */
const VALID_CARD = `# Sample Oracle Card

## Source Registry

| ID  | 관할      | 기준 | 위치·version    | 승인 상태 |
| --- | --------- | ---- | --------------- | --------- |
| S1  | 저장 정책 | PRD  | docs/save.md#v3 | approved  |

## 결정된 정책

- 저장 중 추가 제출은 무시한다. (출처: 유저 Q1=A)
- 5xx 실패 시 입력을 유지한다. (출처: docs/save.md#failure-policy)

## Behavior Contract

| ID  | Given         | When              | Then                  | Never             | 부작용(종류×횟수) | BVA           |
| --- | ------------- | ----------------- | --------------------- | ----------------- | ----------------- | ------------- |
| O1  | 유효 입력     | 저장 클릭         | pending 표시          | 응답 전 성공 UI   | POST×1            | 상태: pending |
| O2  | pending       | 중복 클릭         | pending 유지          | 두 번째 POST      | POST×1(총)        | 횟수: 1/2     |
| O3  | pending       | 서버 5xx 오류     | 오류 표시와 입력 유지 | 성공 UI           | 성공 저장×0       | 상태: error   |
| O4  | 오류 상태     | 재시도 제출       | 새 요청 1회           | 중복 저장         | POST×1            | 횟수: 1       |
| O5  | 빈 목록 응답  | 목록 조회         | 0건 안내 표시         | 이전 목록 잔존    | GET×1             | 값: 0건       |
| O6  | 비동기 요청   | 로딩 시작         | loading 표시 후 해제  | 무한 로딩         | GET×1             | 상태: loading |
| O7  | 연속 요청     | out-of-order 응답 | 최신 결과만 남는다    | 늦은 응답이 덮어씀 | GET×2            | 순서: 역전    |
| O8  | 저장 대기 중  | 취소 후 늦은 응답 | 화면을 갱신하지 않는다 | 이탈 후 화면 오염 | 저장×0           | 상태: cancel  |

## Visual Contract

| ID  | 축   | 계약                  | Never     | 출처 | 증거 계층 |
| --- | ---- | --------------------- | --------- | ---- | --------- |
| D1  | copy | 버튼 문구는 "저장"이다 | 다른 문구 | S1   | HARD      |
`

async function cardFile(t, content = VALID_CARD) {
  const path = join(await directory(t), 'oracle.md')
  await writeFile(path, content)
  return path
}

/** 지정한 행 ID의 표 행 하나만 통째로 바꾼 카드 변형. */
function withRow(rowId, replacement) {
  return VALID_CARD.split('\n')
    .map((line) => (line.startsWith(`| ${rowId}  |`) ? replacement : line))
    .join('\n')
}

test('O17: 구조가 완전한 카드는 lint를 통과한다', async (t) => {
  const oracle = await cardFile(t)

  const linted = run('card', '--oracle', oracle)

  assert.equal(linted.status, 0, linted.stderr)
  assert.equal(linted.stdout, 'CARD_LINT_OK 9 rows\n')
})

test('O17: 출처 없는 정책 줄을 위치와 함께 거부한다', async (t) => {
  const oracle = await cardFile(t, VALID_CARD.replace(' (출처: 유저 Q1=A)', ''))

  const linted = run('card', '--oracle', oracle)

  assert.equal(linted.status, 1)
  assert.match(linted.stderr, /^CARD_LINT_FAILED: /)
  assert.match(linted.stderr, /policy-source/)
  assert.match(linted.stderr, /line 11/)
})

test('O17: Never나 부작용이 빈 행을 거부한다', async (t) => {
  const emptyNever = await cardFile(t, withRow('O1', '| O1 | 유효 입력 | 저장 클릭 | pending 표시 |  | POST×1 | 상태 |'))
  const emptySideEffect = await cardFile(
    t,
    withRow('O1', '| O1 | 유효 입력 | 저장 클릭 | pending 표시 | 응답 전 성공 UI | - | 상태 |'),
  )

  const withoutNever = run('card', '--oracle', emptyNever)
  assert.equal(withoutNever.status, 1)
  assert.match(withoutNever.stderr, /empty-never/)
  assert.match(withoutNever.stderr, /O1/)

  const withoutSideEffect = run('card', '--oracle', emptySideEffect)
  assert.equal(withoutSideEffect.status, 1)
  assert.match(withoutSideEffect.stderr, /empty-side-effect/)
  assert.match(withoutSideEffect.stderr, /O1/)
})

test('O17: Then·Never의 모호어를 거부한다', async (t) => {
  const oracle = await cardFile(
    t,
    withRow('O1', '| O1 | 유효 입력 | 저장 클릭 | 적절히 표시한다 | 응답 전 성공 UI | POST×1 | 상태 |'),
  )

  const linted = run('card', '--oracle', oracle)

  assert.equal(linted.status, 1)
  assert.match(linted.stderr, /vague-word/)
  assert.match(linted.stderr, /적절히/)
  assert.match(linted.stderr, /O1/)
})

test('O17: 자동 추가 TC가 빠지면 어떤 종류가 없는지 보고한다', async (t) => {
  const withoutOutOfOrder = VALID_CARD.split('\n')
    .filter((line) => !line.includes('out-of-order'))
    .join('\n')
  const oracle = await cardFile(t, withoutOutOfOrder)

  const linted = run('card', '--oracle', oracle)

  assert.equal(linted.status, 1)
  assert.match(linted.stderr, /missing-auto-tc/)
  assert.match(linted.stderr, /out-of-order/)
})

test('O17: D 행의 출처나 증거 계층이 없으면 거부한다', async (t) => {
  const withoutTier = await cardFile(t, withRow('D1', '| D1 | copy | 버튼 문구는 "저장"이다 | 다른 문구 | S1 |  |'))
  const withoutSource = await cardFile(t, withRow('D1', '| D1 | copy | 버튼 문구는 "저장"이다 | 다른 문구 |  | HARD |'))

  const missingTier = run('card', '--oracle', withoutTier)
  assert.equal(missingTier.status, 1)
  assert.match(missingTier.stderr, /visual-evidence-tier/)
  assert.match(missingTier.stderr, /D1/)

  const missingSource = run('card', '--oracle', withoutSource)
  assert.equal(missingSource.status, 1)
  assert.match(missingSource.stderr, /visual-source/)
  assert.match(missingSource.stderr, /D1/)
})

const EVIDENCE_CARD = `# Card

## Behavior Contract

| ID  | Given | When  | Then         | Never       | 부작용(종류×횟수) | BVA       |
| --- | ----- | ----- | ------------ | ----------- | ----------------- | --------- |
| O1  | a     | b     | pending 표시 | 성공 UI     | POST×1            | 상태      |
| O2  | a     | b     | 오류 표시    | 성공 저장   | 저장×0            | 상태      |
| O3  | a     | b     | 재시도 가능  | 중복 저장   | POST×1            | 횟수      |
`

const REPORTED_RUN = JSON.stringify({
  runId: 'r-001',
  exitCode: 0,
  grade: 'reported',
  tests: [
    { name: 'save > pending 표시', status: 'passed' },
    { name: 'save > 실패 후 재시도', status: 'failed' },
  ],
})

async function evidenceFixture(t, rows, { ledger = `${REPORTED_RUN}\n` } = {}) {
  const base = await directory(t)
  const oracle = join(base, 'oracle.md')
  const map = join(base, 'evidence.json')
  const ledgerPath = join(base, 'runs.jsonl')

  await writeFile(oracle, EVIDENCE_CARD)
  await writeFile(map, JSON.stringify({ schemaVersion: 1, rows }))
  await writeFile(ledgerPath, ledger)

  return ['evidence', '--oracle', oracle, '--map', map, '--ledger', ledgerPath, '--run', 'r-001']
}

test('O18: 모든 비-N/A 행이 통과 테스트에 매핑되면 검증을 통과한다', async (t) => {
  const args = await evidenceFixture(t, {
    O1: { kind: 'test', name: 'save > pending 표시' },
    O2: { kind: 'na', reason: '해당 오류 subtype이 이 기능에 없다', source: 'S1' },
    O3: { kind: 'reviewer', finding: 'f-1', role: 'code-reviewer' },
  })

  const verified = run(...args)

  assert.equal(verified.status, 0, verified.stderr)
  assert.equal(verified.stdout, 'EVIDENCE_VERIFIED 3 rows\n')
})

test('O19: run 결과에 없거나 통과하지 않은 테스트 이름을 거부한다', async (t) => {
  const missingName = await evidenceFixture(t, {
    O1: { kind: 'test', name: 'save > 존재하지 않는 이름' },
    O2: { kind: 'na', reason: '사유', source: 'S1' },
    O3: { kind: 'na', reason: '사유', source: 'S1' },
  })
  const failedName = await evidenceFixture(t, {
    O1: { kind: 'test', name: 'save > 실패 후 재시도' },
    O2: { kind: 'na', reason: '사유', source: 'S1' },
    O3: { kind: 'na', reason: '사유', source: 'S1' },
  })

  const absent = run(...missingName)
  assert.equal(absent.status, 1)
  assert.match(absent.stderr, /^EVIDENCE_NOT_IN_RUN: /)
  assert.match(absent.stderr, /O1/)
  assert.match(absent.stderr, /존재하지 않는 이름/)

  const failing = run(...failedName)
  assert.equal(failing.status, 1)
  assert.match(failing.stderr, /^EVIDENCE_NOT_IN_RUN: /)
  assert.match(failing.stderr, /failed/)
})

test('O20: grade가 exit-only인 run으로는 테스트 증거를 검증하지 않는다', async (t) => {
  const args = await evidenceFixture(
    t,
    {
      O1: { kind: 'test', name: 'save > pending 표시' },
      O2: { kind: 'na', reason: '사유', source: 'S1' },
      O3: { kind: 'na', reason: '사유', source: 'S1' },
    },
    { ledger: `${JSON.stringify({ runId: 'r-001', exitCode: 0, grade: 'exit-only', tests: null })}\n` },
  )

  const verified = run(...args)

  assert.equal(verified.status, 1)
  assert.match(verified.stderr, /^EVIDENCE_UNVERIFIABLE: /)
  assert.match(verified.stderr, /r-001/)
})

test('O21: 카드에 없는 행 인용과 비-N/A 행 누락을 각각 거부한다', async (t) => {
  const unknownRow = await evidenceFixture(t, {
    O1: { kind: 'na', reason: '사유', source: 'S1' },
    O2: { kind: 'na', reason: '사유', source: 'S1' },
    O3: { kind: 'na', reason: '사유', source: 'S1' },
    O9: { kind: 'na', reason: '사유', source: 'S1' },
  })
  const missingRow = await evidenceFixture(t, {
    O1: { kind: 'na', reason: '사유', source: 'S1' },
    O2: { kind: 'na', reason: '사유', source: 'S1' },
  })
  const missingSource = await evidenceFixture(t, {
    O1: { kind: 'na', reason: '사유' },
    O2: { kind: 'na', reason: '사유', source: 'S1' },
    O3: { kind: 'na', reason: '사유', source: 'S1' },
  })

  const unknown = run(...unknownRow)
  assert.equal(unknown.status, 1)
  assert.match(unknown.stderr, /^EVIDENCE_UNKNOWN_ROW: /)
  assert.match(unknown.stderr, /O9/)

  const missing = run(...missingRow)
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /^EVIDENCE_MISSING_ROW: /)
  assert.match(missing.stderr, /O3/)

  const invalid = run(...missingSource)
  assert.equal(invalid.status, 1)
  assert.match(invalid.stderr, /^EVIDENCE_INVALID: /)
  assert.match(invalid.stderr, /O1/)
})

async function findingsFile(t, findings, name = 'findings.json') {
  const path = join(await directory(t), name)
  await writeFile(path, JSON.stringify({ schemaVersion: 1, reviewer: 'code-reviewer', findings }))
  return path
}

test('O22: finding 스키마를 검증하고 행 인용이 없으면 NON_ORACLE_OPINION으로 강등한다', async (t) => {
  const oracle = await cardFile(t, EVIDENCE_CARD)

  const valid = await findingsFile(t, [
    {
      id: 'f-1',
      row: 'O2',
      classification: 'PRODUCT_DEFECT',
      severity: 'high',
      finding: '오류 표시가 없다',
      evidence: 'r-003',
      fix: 'error UI 추가',
    },
    {
      id: 'f-2',
      classification: 'PRODUCT_DEFECT',
      severity: 'low',
      finding: '변수명이 마음에 들지 않는다',
      evidence: '없음',
      fix: 'rename',
    },
  ])
  const checked = run('findings', '--file', valid, '--oracle', oracle)
  assert.equal(checked.status, 0, checked.stderr)
  assert.equal(checked.stdout, 'FINDINGS_OK blocking:1 advisory:1\nDOWNGRADED f-2 NON_ORACLE_OPINION\n')

  const unknownClassification = await findingsFile(t, [
    { id: 'f-1', row: 'O1', classification: 'STYLE_NIT', severity: 'low', finding: 'x', evidence: 'y', fix: 'z' },
  ])
  const rejected = run('findings', '--file', unknownClassification, '--oracle', oracle)
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /^FINDINGS_INVALID: /)
  assert.match(rejected.stderr, /STYLE_NIT/)

  const unknownRow = await findingsFile(t, [
    { id: 'f-1', row: 'O9', classification: 'POLICY_GAP', severity: 'high', finding: 'x', evidence: 'y', fix: 'z' },
  ])
  const rejectedRow = run('findings', '--file', unknownRow, '--oracle', oracle)
  assert.equal(rejectedRow.status, 1)
  assert.match(rejectedRow.stderr, /^FINDINGS_INVALID: /)
  assert.match(rejectedRow.stderr, /O9/)

  const missingSeverity = await findingsFile(t, [
    { id: 'f-1', row: 'O1', classification: 'POLICY_GAP', finding: 'x', evidence: 'y', fix: 'z' },
  ])
  const rejectedSeverity = run('findings', '--file', missingSeverity, '--oracle', oracle)
  assert.equal(rejectedSeverity.status, 1)
  assert.match(rejectedSeverity.stderr, /severity/)
})

test('O23: 2-sample 교집합만 완료를 차단하고 한쪽 finding은 advisory로 남긴다', async (t) => {
  const oracle = await cardFile(t, EVIDENCE_CARD)
  const shared = {
    id: 'f-1',
    row: 'O2',
    classification: 'PRODUCT_DEFECT',
    severity: 'high',
    finding: '오류 표시 없음',
    evidence: 'r-003',
    fix: 'error UI',
  }
  const first = await findingsFile(t, [shared], 'first.json')
  const second = await findingsFile(
    t,
    [
      { ...shared, id: 'f-9' },
      {
        id: 'f-2',
        row: 'O3',
        classification: 'EVIDENCE_GAP',
        severity: 'medium',
        finding: '재시도 증거 없음',
        evidence: 'r-003',
        fix: '테스트 추가',
      },
    ],
    'second.json',
  )

  const intersected = run('findings', '--file', first, '--intersect', second, '--oracle', oracle)

  assert.equal(intersected.status, 0, intersected.stderr)
  assert.match(intersected.stdout, /^FINDINGS_OK blocking:1 advisory:1\n/)
  assert.match(intersected.stdout, /BLOCKING O2 PRODUCT_DEFECT/)
  assert.match(intersected.stdout, /ADVISORY O3 EVIDENCE_GAP/)
})

test('O24: 비결정 API를 파일·줄과 함께 보고한다', async (t) => {
  const path = join(await directory(t), 'clock.ts')
  await writeFile(path, 'export const now = () => Date.now()\nexport const id = () => crypto.randomUUID()\n')

  const scanned = run('scan', '--path', path)

  assert.equal(scanned.status, 1)
  assert.match(scanned.stderr, /^NONDETERMINISM_FOUND: /)
  assert.match(scanned.stderr, /clock\.ts:1/)
  assert.match(scanned.stderr, /Date\.now/)
  assert.match(scanned.stderr, /clock\.ts:2/)
  assert.match(scanned.stderr, /crypto\.randomUUID/)
})

test('O24: 인자 없는 new Date()는 검출하고 인자가 있는 new Date(값)은 검출하지 않는다', async (t) => {
  const base = await directory(t)
  const clock = join(base, 'clock.ts')
  const parser = join(base, 'parser.ts')
  await writeFile(clock, 'export const stamp = () => new Date().getTime()\n')
  await writeFile(parser, "export const parse = (iso: string) => new Date(iso).getTime()\n")

  const detected = run('scan', '--path', clock)
  assert.equal(detected.status, 1)
  assert.match(detected.stderr, /clock\.ts:1/)
  assert.match(detected.stderr, /new Date\(\)/)

  const deterministic = run('scan', '--path', parser)
  assert.equal(deterministic.status, 0, deterministic.stderr)
})

test('O25: 같은 줄이나 앞 줄의 면제 주석이 있으면 통과한다', async (t) => {
  const path = join(await directory(t), 'clock.ts')
  await writeFile(
    path,
    [
      'export const now = () => Date.now() // oracle:nondeterminism 서버 시각 주입 전 임시 seam',
      '// oracle:nondeterminism 승인된 randomness',
      'export const id = () => crypto.randomUUID()',
      '',
    ].join('\n'),
  )

  const scanned = run('scan', '--path', path)

  assert.equal(scanned.status, 0, scanned.stderr)
  assert.equal(scanned.stdout, 'SCAN_OK 1 files\n')
})
