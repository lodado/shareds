import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
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

## Outcome Brief

- Actor and context: 저장 화면을 사용하는 사용자
- Observable success: 저장 결과가 정확히 한 번 반영된다.
- Non-goals: 저장 API 재설계
- Worst regression: 중복 저장 또는 입력 유실
- Reversibility: 변경 commit revert
- Sources: S1

## Source Registry

| ID  | Kind           | 관할      | 기준 | 위치·version    | 승인 상태 |
| --- | -------------- | --------- | ---- | --------------- | --------- |
| S1  | product-policy | 저장 정책 | PRD  | docs/save.md#v3 | approved  |

## User Confirmation

- Status: approved
- Source: user message Q-confirmation

## 결정된 정책

- P1: 저장 중 추가 제출은 무시한다. (출처: 유저 Q1=A) (행: O1, O2)
- P2: 5xx 실패 시 입력을 유지하고 재시도할 수 있다. (출처: docs/save.md#failure-policy) (행: O3, O4)
- P3: 목록 요청의 경계 상태는 최신 화면만 갱신한다. (출처: docs/save.md#list-policy) (행: O5, O6, O7, O8)
- P4: 저장 action의 문구는 "저장"이다. (출처: S1) (행: D1)

## Behavior Contract

| ID  | 정책 | Given         | When              | Then                  | Never             | 부작용(종류×횟수) | BVA           |
| --- | ---- | ------------- | ----------------- | --------------------- | ----------------- | ----------------- | ------------- |
| O1  | P1   | 유효 입력     | 저장 클릭         | pending 표시          | 응답 전 성공 UI   | POST×1            | 상태: pending |
| O2  | P1   | pending       | 중복 클릭         | pending 유지          | 두 번째 POST      | POST×1(총)        | 횟수: 1/2     |
| O3  | P2   | pending       | 서버 5xx 오류     | 오류 표시와 입력 유지 | 성공 UI           | 성공 저장×0       | 상태: error   |
| O4  | P2   | 오류 상태     | 재시도 제출       | 새 요청 1회           | 중복 저장         | POST×1            | 횟수: 1       |
| O5  | P3   | 빈 목록 응답  | 목록 조회         | 0건 안내 표시         | 이전 목록 잔존    | GET×1             | 값: 0건       |
| O6  | P3   | 비동기 요청   | 로딩 시작         | loading 표시 후 해제  | 무한 로딩         | GET×1             | 상태: loading |
| O7  | P3   | 연속 요청     | out-of-order 응답 | 최신 결과만 남는다    | 늦은 응답이 덮어씀 | GET×2            | 순서: 역전    |
| O8  | P3   | 저장 대기 중  | 취소 후 늦은 응답 | 화면을 갱신하지 않는다 | 이탈 후 화면 오염 | 저장×0           | 상태: cancel  |

## Visual Contract

| ID  | 정책 | 축   | 계약                  | Never     | 출처 | 증거 계층 |
| --- | ---- | ---- | --------------------- | --------- | ---- | --------- |
| D1  | P4   | copy | 버튼 문구는 "저장"이다 | 다른 문구 | S1   | HARD      |
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

test('O3: Outcome Brief가 없는 카드를 거부한다', async (t) => {
  const withoutOutcome = VALID_CARD.replace(/## Outcome Brief\n[\s\S]*?- Sources: S1\n\n/, '')

  const linted = run('card', '--oracle', await cardFile(t, withoutOutcome))

  assert.equal(linted.status, 1)
  assert.match(linted.stderr, /outcome-brief/)
})

test('O4: Outcome Brief의 필수 값이 비거나 TBD면 거부한다', async (t) => {
  for (const value of ['', 'TBD']) {
    const card = VALID_CARD.replace(
      '- Observable success: 저장 결과가 정확히 한 번 반영된다.',
      `- Observable success: ${value}`,
    )
    const linted = run('card', '--oracle', await cardFile(t, card))

    assert.equal(linted.status, 1)
    assert.match(linted.stderr, /outcome-field/)
    assert.match(linted.stderr, /Observable success/)
  }
})

test('O5-O6: Source Registry의 Kind 누락과 허용되지 않은 값을 거부한다', async (t) => {
  const withoutKind = VALID_CARD.replace('| ID  | Kind           | 관할', '| ID  | 관할')
    .replace('| --- | -------------- | ---------', '| --- | ---------')
    .replace('| S1  | product-policy | 저장 정책', '| S1  | 저장 정책')
  const invalidKind = VALID_CARD.replace('product-policy', 'visual-preference')

  const missing = run('card', '--oracle', await cardFile(t, withoutKind))
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /source-kind/)

  const invalid = run('card', '--oracle', await cardFile(t, invalidKind))
  assert.equal(invalid.status, 1)
  assert.match(invalid.stderr, /source-kind/)
  assert.match(invalid.stderr, /visual-preference/)
})

test('O17: 새 카드의 사용자 확인 근거가 없으면 lock 전 lint를 거부한다', async (t) => {
  const withoutConfirmation = VALID_CARD.replace(
    '## User Confirmation\n\n- Status: approved\n- Source: user message Q-confirmation\n\n',
    '',
  )
  const draftConfirmation = VALID_CARD.replace('- Status: approved', '- Status: draft')

  const missing = run('card', '--oracle', await cardFile(t, withoutConfirmation))
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /user-confirmation/)

  const draft = run('card', '--oracle', await cardFile(t, draftConfirmation))
  assert.equal(draft.status, 1)
  assert.match(draft.stderr, /user-confirmation-status/)
})

test('O17: 출처 없는 정책 줄을 위치와 함께 거부한다', async (t) => {
  const oracle = await cardFile(t, VALID_CARD.replace(' (출처: 유저 Q1=A)', ''))

  const linted = run('card', '--oracle', oracle)

  assert.equal(linted.status, 1)
  assert.match(linted.stderr, /^CARD_LINT_FAILED: /)
  assert.match(linted.stderr, /policy-source/)
  assert.match(linted.stderr, /policy has no approved source/)
})

test('O17: 정책과 계약 행의 양방향 참조가 어긋나면 거부한다', async (t) => {
  const missingId = VALID_CARD.replace('- P1:', '-')
  const unknownRow = VALID_CARD.replace('(행: O1, O2)', '(행: O1, O99)')
  const unknownPolicy = withRow(
    'O1',
    '| O1 | P9 | 유효 입력 | 저장 클릭 | pending 표시 | 응답 전 성공 UI | POST×1 | 상태 |',
  )
  const asymmetric = withRow(
    'O2',
    '| O2 | P3 | pending | 중복 클릭 | pending 유지 | 두 번째 POST | POST×1(총) | 횟수 |',
  )

  for (const [card, issue] of [
    [missingId, 'policy-id'],
    [unknownRow, 'policy-row-unknown'],
    [unknownPolicy, 'row-policy-unknown'],
    [asymmetric, 'policy-row-asymmetric'],
  ]) {
    const linted = run('card', '--oracle', await cardFile(t, card))
    assert.equal(linted.status, 1)
    assert.match(linted.stderr, new RegExp(issue))
  }
})

test('O17: Never나 부작용이 빈 행을 거부한다', async (t) => {
  const emptyNever = await cardFile(
    t,
    withRow('O1', '| O1 | P1 | 유효 입력 | 저장 클릭 | pending 표시 |  | POST×1 | 상태 |'),
  )
  const emptySideEffect = await cardFile(
    t,
    withRow('O1', '| O1 | P1 | 유효 입력 | 저장 클릭 | pending 표시 | 응답 전 성공 UI | - | 상태 |'),
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

test('O17: O 행의 Then과 D 행의 계약이 비어 있으면 거부한다', async (t) => {
  const emptyThen = await cardFile(
    t,
    withRow('O1', '| O1 | P1 | 유효 입력 | 저장 클릭 |  | 응답 전 성공 UI | POST×1 | 상태 |'),
  )
  const emptyVisualContract = await cardFile(t, withRow('D1', '| D1 | P4 | copy | - | 다른 문구 | S1 | HARD |'))

  const behavior = run('card', '--oracle', emptyThen)
  assert.equal(behavior.status, 1)
  assert.match(behavior.stderr, /empty-then/)
  assert.match(behavior.stderr, /O1/)

  const visual = run('card', '--oracle', emptyVisualContract)
  assert.equal(visual.status, 1)
  assert.match(visual.stderr, /empty-visual-contract/)
  assert.match(visual.stderr, /D1/)
})

test('O17: Then·Never의 모호어를 거부한다', async (t) => {
  const oracle = await cardFile(
    t,
    withRow('O1', '| O1 | P1 | 유효 입력 | 저장 클릭 | 적절히 표시한다 | 응답 전 성공 UI | POST×1 | 상태 |'),
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
  const withoutTier = await cardFile(
    t,
    withRow('D1', '| D1 | P4 | copy | 버튼 문구는 "저장"이다 | 다른 문구 | S1 |  |'),
  )
  const withoutSource = await cardFile(
    t,
    withRow('D1', '| D1 | P4 | copy | 버튼 문구는 "저장"이다 | 다른 문구 |  | HARD |'),
  )

  const missingTier = run('card', '--oracle', withoutTier)
  assert.equal(missingTier.status, 1)
  assert.match(missingTier.stderr, /visual-evidence-tier/)
  assert.match(missingTier.stderr, /D1/)

  const missingSource = run('card', '--oracle', withoutSource)
  assert.equal(missingSource.status, 1)
  assert.match(missingSource.stderr, /visual-source/)
  assert.match(missingSource.stderr, /D1/)
})

test('O17: RELATIONAL 행은 카드 승인에 Visual QA 실행 여부를 요구한다', async (t) => {
  const relational = VALID_CARD.replace(
    '| D1  | P4   | copy | 버튼 문구는 "저장"이다 | 다른 문구 | S1   | HARD',
    '| D1  | P4   | copy | 버튼 문구는 "저장"이다 | 다른 문구 | S1   | RELATIONAL',
  )
  const approved = relational.replace(
    '- Source: user message Q-confirmation',
    '- Source: user message Q-confirmation\n- Visual QA authorization: approved',
  )

  const missing = run('card', '--oracle', await cardFile(t, relational))
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /visual-qa-authorization/)

  const authorized = run('card', '--oracle', await cardFile(t, approved))
  assert.equal(authorized.status, 0, authorized.stderr)
})

test('O17: 중복 행 ID와 존재하지 않는 Source Registry 참조를 거부한다', async (t) => {
  const duplicate = VALID_CARD.replace('| O2  | P1', '| O1  | P1')
  const unknownSource = await cardFile(
    t,
    withRow('D1', '| D1 | P4 | copy | 버튼 문구는 "저장"이다 | 다른 문구 | S9 | HARD |'),
  )

  const duplicateIds = run('card', '--oracle', await cardFile(t, duplicate))
  assert.equal(duplicateIds.status, 1)
  assert.match(duplicateIds.stderr, /duplicate-row/)
  assert.match(duplicateIds.stderr, /O1/)

  const missingSource = run('card', '--oracle', unknownSource)
  assert.equal(missingSource.status, 1)
  assert.match(missingSource.stderr, /unknown-source/)
  assert.match(missingSource.stderr, /S9/)
})

test('O17: 자동 TC 단어가 계약 행 밖에만 있으면 충족으로 보지 않는다', async (t) => {
  const movedToProse = VALID_CARD.replace(
    '| O7  | P3   | 연속 요청     | out-of-order 응답 | 최신 결과만 남는다    | 늦은 응답이 덮어씀 | GET×2            | 순서: 역전    |',
    '| O7  | P3   | 연속 요청     | 응답 도착          | 최신 결과만 남는다    | 늦은 응답이 덮어씀 | GET×2            | 순서 변경     |',
  ).replace('## Behavior Contract', 'out-of-order는 일반 설명에만 등장한다.\n\n## Behavior Contract')

  const linted = run('card', '--oracle', await cardFile(t, movedToProse))

  assert.equal(linted.status, 1)
  assert.match(linted.stderr, /missing-auto-tc/)
  assert.match(linted.stderr, /out-of-order/)
})

const EVIDENCE_CARD = `# Card

## Behavior Contract

| ID  | Given | When  | Then         | Never       | 부작용(종류×횟수) | BVA       |
| --- | ----- | ----- | ------------ | ----------- | ----------------- | --------- |
| O1  | a     | b     | pending 표시 | 성공 UI     | POST×1            | 상태      |
| O2  | a     | b     | 오류 표시    | 성공 저장   | 저장×0            | 상태      |
| O3  | a     | b     | 재시도 가능  | 중복 저장   | POST×1            | 횟수      |
`

const VISUAL_EVIDENCE_CARD = `# Card

## Visual Contract

| ID | 정책 | 축 | 계약 | Never | 출처 | 증거 계층 |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | P1 | layout | relation | overlap | S1 | RELATIONAL |
| D2 | P2 | identity | signature | generic | S1 | JUDGMENT |
| D3 | P3 | copy | exact copy | other copy | S1 | HARD |
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

const REPORTED_RED_RUN = JSON.stringify({
  runId: 'r-001',
  exitCode: 1,
  grade: 'reported',
  tests: [
    { name: 'save > pending 표시', status: 'failed' },
    { name: 'save > 실패 후 재시도', status: 'passed' },
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

test('O18: RED evidence는 지정한 카드 행의 reported test가 실제로 실패해야 한다', async (t) => {
  const rows = {
    O1: { kind: 'test', name: 'save > pending 표시' },
  }
  const args = await evidenceFixture(t, rows, { ledger: `${REPORTED_RED_RUN}\n` })
  const red = run('red', ...args.slice(1), '--row', 'O1')

  assert.equal(red.status, 0, red.stderr)
  assert.equal(red.stdout, 'RED_EVIDENCE_VERIFIED O1 save > pending 표시\n')

  const wrongRow = run('red', ...args.slice(1), '--row', 'O2')
  assert.equal(wrongRow.status, 1)
  assert.match(wrongRow.stderr, /RED_EVIDENCE_MISSING/)
})

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

test('O18: visual evidence owner를 tier별로 강제하고 pending은 GREEN에서만 허용한다', async (t) => {
  const base = await directory(t)
  const oracle = join(base, 'oracle.md')
  const map = join(base, 'evidence.json')
  const ledger = join(base, 'runs.jsonl')

  await writeFile(oracle, VISUAL_EVIDENCE_CARD)
  await writeFile(
    map,
    JSON.stringify({
      schemaVersion: 2,
      rows: {
        D1: { kind: 'pending', reason: 'visual QA 실행 미승인', owner: 'frontend-visual-qa' },
        D2: { kind: 'reviewer', finding: 'd-1', role: 'designer' },
        D3: { kind: 'test', name: 'visual > exact copy' },
      },
    }),
  )
  await writeFile(
    ledger,
    `${JSON.stringify({
      runId: 'r-001',
      exitCode: 0,
      grade: 'reported',
      tests: [{ name: 'visual > exact copy', status: 'passed' }],
    })}\n`,
  )
  const args = ['evidence', '--oracle', oracle, '--map', map, '--ledger', ledger, '--run', 'r-001']

  const green = run(...args, '--phase', 'green')
  assert.equal(green.status, 0, green.stderr)
  assert.match(green.stdout, /VISUAL_EVIDENCE_PENDING D1/)

  const review = run(...args, '--phase', 'review')
  assert.equal(review.status, 1)
  assert.match(review.stderr, /^EVIDENCE_PENDING: /)
})

test('O18: visual artifact는 같은 Oracle과 행의 PASS를 증명해야 한다', async (t) => {
  const base = await directory(t)
  const oracle = join(base, 'oracle.md')
  const map = join(base, 'evidence.json')
  const ledger = join(base, 'runs.jsonl')
  const artifact = join(base, 'visual-evidence.json')
  const oracleSha256 = createHash('sha256').update(VISUAL_EVIDENCE_CARD).digest('hex')

  await writeFile(oracle, VISUAL_EVIDENCE_CARD)
  await writeFile(artifact, JSON.stringify({ schemaVersion: 1, oracleSha256, rows: { D1: 'passed' } }))
  await writeFile(
    map,
    JSON.stringify({
      schemaVersion: 2,
      rows: {
        D1: { kind: 'visual', artifact: 'visual-evidence.json' },
        D2: { kind: 'reviewer', finding: 'd-1', role: 'designer' },
        D3: { kind: 'na', reason: 'copy contract is not part of this fixture', source: 'S1' },
      },
    }),
  )
  await writeFile(ledger, `${JSON.stringify({ runId: 'r-001', exitCode: 0, grade: 'reported', tests: [] })}\n`)

  const verified = run(
    'evidence',
    '--oracle',
    oracle,
    '--map',
    map,
    '--ledger',
    ledger,
    '--run',
    'r-001',
    '--phase',
    'review',
  )
  assert.equal(verified.status, 0, verified.stderr)

  await writeFile(artifact, JSON.stringify({ schemaVersion: 1, oracleSha256: '0'.repeat(64), rows: { D1: 'passed' } }))
  const stale = run(
    'evidence',
    '--oracle',
    oracle,
    '--map',
    map,
    '--ledger',
    ledger,
    '--run',
    'r-001',
    '--phase',
    'review',
  )
  assert.equal(stale.status, 1)
  assert.match(stale.stderr, /^VISUAL_EVIDENCE_INVALID: /)
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
  return findingsDocument(t, { schemaVersion: 1, reviewer: 'code-reviewer', findings }, name)
}

async function findingsDocument(t, document, name = 'findings.json') {
  const path = join(await directory(t), name)
  await writeFile(path, JSON.stringify(document))
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

test('O23: 서로 다른 high finding과 행 없는 high finding은 단독으로도 모두 blocking이다', async (t) => {
  const oracle = await cardFile(t, EVIDENCE_CARD)
  const first = await findingsFile(
    t,
    [
      {
        id: 'f-1',
        row: 'O2',
        classification: 'PRODUCT_DEFECT',
        severity: 'high',
        finding: '오류 메시지가 없다',
        evidence: 'r-003',
        fix: '오류 메시지 추가',
      },
      {
        id: 'f-2',
        classification: 'PRODUCT_DEFECT',
        severity: 'high',
        finding: '전역 권한 검사가 없다',
        evidence: 'src/auth.ts',
        fix: '권한 검사 추가',
      },
    ],
    'first.json',
  )
  const second = await findingsFile(
    t,
    [
      {
        id: 'f-3',
        row: 'O2',
        classification: 'PRODUCT_DEFECT',
        severity: 'high',
        finding: '오류 상태에서 입력이 사라진다',
        evidence: 'r-003',
        fix: '입력 유지',
      },
    ],
    'second.json',
  )

  const checked = run('findings', '--file', first, '--intersect', second, '--oracle', oracle)

  assert.equal(checked.status, 0, checked.stderr)
  assert.match(checked.stdout, /^FINDINGS_OK blocking:3 advisory:0\n/)
  assert.match(checked.stdout, /BLOCKING - PRODUCT_DEFECT 전역 권한 검사가 없다/)
  assert.doesNotMatch(checked.stdout, /DOWNGRADED f-2/)
})

test('O23: review 명령은 blocking finding이 있으면 실패하고 해소되면 통과한다', async (t) => {
  const oracle = await cardFile(t, EVIDENCE_CARD)
  const blocking = await findingsFile(t, [
    {
      id: 'f-1',
      row: 'O2',
      classification: 'PRODUCT_DEFECT',
      severity: 'high',
      finding: '오류 표시가 없다',
      evidence: 'r-003',
      fix: 'error UI 추가',
    },
  ])
  const clear = await findingsFile(t, [], 'clear.json')

  const rejected = run('review', '--file', blocking, '--oracle', oracle)
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /^FINDINGS_BLOCKING: /)

  const accepted = run('review', '--file', clear, '--oracle', oracle)
  assert.equal(accepted.status, 0, accepted.stderr)
  assert.equal(accepted.stdout, 'REVIEW_CLEAR advisory:0\n')
})

test('O8-O10: changeability review v2의 축·상태·근거·finding 연결을 검증하고 v1은 유지한다', async (t) => {
  const oracle = await cardFile(t, EVIDENCE_CARD)
  const findings = [
    {
      id: 'f-1',
      row: 'O2',
      classification: 'PRODUCT_DEFECT',
      severity: 'high',
      finding: '숨은 logging 부작용이 있다',
      evidence: 'src/fetch-balance.ts:8',
      fix: 'event boundary로 logging을 이동한다',
    },
  ]
  const review = [
    { axis: 'Readability', status: 'PASS', evidence: 'src/form.tsx:10-30' },
    { axis: 'Predictability', status: 'FINDING', evidence: 'src/fetch-balance.ts:8', findingId: 'f-1' },
    { axis: 'Cohesion', status: 'N/A', evidence: '변경된 소유 경계가 없다' },
    { axis: 'Coupling', status: 'PASS', evidence: '새 public API가 없다' },
    { axis: 'Simplicity', status: 'PASS', evidence: '기존 platform API를 재사용한다' },
  ]

  const valid = await findingsDocument(
    t,
    { schemaVersion: 2, reviewer: 'code-reviewer', changeabilityReview: review, findings },
    'changeability-valid.json',
  )
  const checked = run('findings', '--file', valid, '--oracle', oracle)
  assert.equal(checked.status, 0, checked.stderr)

  const invalidDocuments = [
    ['missing-axis', review.slice(0, -1)],
    ['duplicate-axis', [...review.slice(0, -1), review[0]]],
    ['unknown-status', review.map((entry, index) => (index === 0 ? { ...entry, status: 'SKIP' } : entry))],
    ['empty-evidence', review.map((entry, index) => (index === 0 ? { ...entry, evidence: '' } : entry))],
    ['unknown-finding', review.map((entry) => (entry.status === 'FINDING' ? { ...entry, findingId: 'f-404' } : entry))],
    ['pass-with-finding', review.map((entry, index) => (index === 0 ? { ...entry, findingId: 'f-1' } : entry))],
  ]

  for (const [name, changeabilityReview] of invalidDocuments) {
    const path = await findingsDocument(
      t,
      { schemaVersion: 2, reviewer: 'code-reviewer', changeabilityReview, findings },
      `${name}.json`,
    )
    const rejected = run('findings', '--file', path, '--oracle', oracle)
    assert.equal(rejected.status, 1, name)
    assert.match(rejected.stderr, /^FINDINGS_INVALID: /, name)
  }

  const legacy = await findingsFile(t, [], 'legacy-v1.json')
  const legacyChecked = run('findings', '--file', legacy, '--oracle', oracle)
  assert.equal(legacyChecked.status, 0, legacyChecked.stderr)
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
  await writeFile(parser, 'export const parse = (iso: string) => new Date(iso).getTime()\n')

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
