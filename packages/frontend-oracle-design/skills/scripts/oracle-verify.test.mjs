import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { stableStringify } from './oracle-fs.mjs'

const script = join(dirname(fileURLToPath(import.meta.url)), 'oracle-verify.mjs')

function run(...args) {
  const command = [...args]
  if (command[0] === 'review' && !command.includes('--ledger')) {
    const oracleIndex = command.indexOf('--oracle')
    if (oracleIndex >= 0) command.push('--ledger', join(dirname(command[oracleIndex + 1]), 'runs.jsonl'))
  }
  return spawnSync(process.execPath, [script, ...command], { encoding: 'utf8' })
}

function runFrom(cwd, ...args) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' })
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
| S1  | product-policy | 저장 정책 | PRD  | repo:docs/save.md#v3 | approved  |

## User Confirmation

- Status: approved
- Source: user message Q-confirmation

## 결정된 정책

- P1: 저장 중 추가 제출은 무시한다. (출처: S1) (행: O1, O2)
- P2: 5xx 실패 시 입력을 유지하고 재시도할 수 있다. (출처: S1) (행: O3, O4)
- P3: 목록 요청의 경계 상태는 최신 화면만 갱신한다. (출처: S1) (행: O5, O6, O7, O8)
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

## State Model

- States: idle, pending, error, done
- Events: SUBMIT, DUPLICATE_SUBMIT, ERROR_5XX, RETRY, RESPONSE_OK, LATE_RESPONSE, CANCEL

| From    | Event            | To      | 행             |
| ------- | ---------------- | ------- | -------------- |
| idle    | SUBMIT           | pending | O1             |
| pending | DUPLICATE_SUBMIT | pending | O2             |
| pending | ERROR_5XX        | error   | O3             |
| error   | RETRY            | pending | O4             |
| pending | RESPONSE_OK      | done    | O5, O6, O7     |
| pending | CANCEL           | idle    | O8             |
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

test('영어 schema token으로 쓴 카드도 같은 lint를 통과한다', async (t) => {
  // 문서가 영어 예시를 가르치므로 검증기도 영어 카드를 받아야 한다 — 한국어 카드는 그대로 통과한다.
  const englishCard = VALID_CARD.replace(
    '| ID  | Kind           | 관할      | 기준 | 위치·version    | 승인 상태 |',
    '| ID  | Kind           | Jurisdiction | 기준 | Location·version | Approval status |',
  )
    .replace('## 결정된 정책', '## Decided policies')
    .replaceAll('(출처: S1)', '(source: S1)')
    .replaceAll('(행: ', '(rows: ')
    .replace('| 부작용(종류×횟수) | BVA           |', '| Side effects      | BVA           |')
    .replace(
      '| 계약                  | Never     | 출처 | 증거 계층 |',
      '| 계약                  | Never     | 출처 | Evidence tier |',
    )

  const linted = run('card', '--oracle', await cardFile(t, englishCard))

  assert.equal(linted.status, 0, linted.stderr)
  assert.equal(linted.stdout, 'CARD_LINT_OK 9 rows\n')
})

test('evidence-scaffold는 카드의 모든 행을 증거 계층에 맞는 kind로 비워 둔 manifest를 만든다', async (t) => {
  const oracle = await cardFile(t)

  const scaffolded = run('evidence-scaffold', '--oracle', oracle)

  assert.equal(scaffolded.status, 0, scaffolded.stderr)
  const manifest = JSON.parse(scaffolded.stdout)
  assert.equal(manifest.schemaVersion, 1)

  // 행 집합이 카드와 정확히 같아야 evidence의 MISSING_ROW·UNKNOWN_ROW 왕복이 사라진다
  assert.deepEqual(Object.keys(manifest.rows), ['O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8', 'D1'])
  assert.deepEqual(manifest.rows.O1.kind, 'test')
  // D1은 HARD라 test owner다 — RELATIONAL·JUDGMENT면 visual·designer reviewer로 나온다
  assert.deepEqual(manifest.rows.D1.kind, 'test')

  const relational = await cardFile(
    t,
    VALID_CARD.replace(
      '| D1  | P4   | copy | 버튼 문구는 "저장"이다 | 다른 문구 | S1   | HARD      |',
      '| D1  | P4   | copy | 버튼 문구는 "저장"이다 | 다른 문구 | S1   | RELATIONAL |',
    ),
  )
  const visual = JSON.parse(run('evidence-scaffold', '--oracle', relational).stdout)
  assert.equal(visual.rows.D1.kind, 'visual')
})

test('evidence-scaffold는 계약 행이 없으면 빈 manifest를 만들지 않는다', async (t) => {
  const oracle = await cardFile(t, '# Oracle\n\n계약 행이 없다.\n')

  const scaffolded = run('evidence-scaffold', '--oracle', oracle)

  assert.equal(scaffolded.status, 1)
  assert.match(scaffolded.stderr, /^EVIDENCE_SCAFFOLD_EMPTY: /)
})

test('O17: escaped pipe와 fenced 예시 표는 계약 열이나 행으로 오인하지 않는다', async (t) => {
  const card = `${VALID_CARD.replace(
    '| D1  | P4   | copy | 버튼 문구는 "저장"이다 | 다른 문구 | S1   | HARD      |',
    '| D1  | P4   | copy | 버튼 문구는 "저장" \\| "Save"다 | 다른 문구 | S1   | HARD      |',
  )}\n\n\`\`\`markdown\n| ID | 정책 | Given | When | Then | Never | 부작용(종류×횟수) | BVA |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| O99 | P999 | example | example | example | example | GET×1 | example |\n\`\`\`\n`

  const linted = run('card', '--oracle', await cardFile(t, card))

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

test('O5-O6: Source Registry foreign keys, approval, and implementation-only sources are enforced', async (t) => {
  const duplicateSource = VALID_CARD.replace(
    '| S1  | product-policy | 저장 정책 | PRD  | repo:docs/save.md#v3 | approved  |',
    '| S1  | product-policy | 저장 정책 | PRD  | repo:docs/save.md#v3 | approved  |\n| S1  | product-policy | 중복 | PRD | docs/dup.md | approved |',
  )
  const unapproved = VALID_CARD.replace(
    '| S1  | product-policy | 저장 정책 | PRD  | repo:docs/save.md#v3 | approved  |',
    '| S1  | product-policy | 저장 정책 | PRD  | repo:docs/save.md#v3 | draft |',
  )
  const unapprovedVisualSource = VALID_CARD.replace(
    '| S1  | product-policy | 저장 정책 | PRD  | repo:docs/save.md#v3 | approved  |',
    '| S1  | product-policy | 저장 정책 | PRD  | repo:docs/save.md#v3 | approved  |\n| S2  | product-policy | 시각 계약 | Figma | file/page/frame/version | draft |',
  ).replace(
    '| D1  | P4   | copy | 버튼 문구는 "저장"이다 | 다른 문구 | S1   | HARD      |',
    '| D1  | P4   | copy | 버튼 문구는 "저장"이다 | 다른 문구 | S2   | HARD      |',
  )
  const unknownPolicySource = VALID_CARD.replace('(출처: S1) (행: O3, O4)', '(출처: S9) (행: O3, O4)')
  const implementationOnly = VALID_CARD.replace(
    '| S1  | product-policy | 저장 정책 | PRD  | repo:docs/save.md#v3 | approved  |',
    '| S1  | implementation-reference | 저장 구현 | 코드 | src/save.ts | approved  |',
  ).replace('(출처: S1)', '(출처: S1)')

  for (const [card, issue] of [
    [duplicateSource, 'duplicate-source'],
    [unapproved, 'policy-source-unapproved'],
    [unapprovedVisualSource, 'source-unapproved'],
    [unknownPolicySource, 'policy-source-unknown'],
    [implementationOnly, 'policy-source-implementation'],
  ]) {
    const linted = run('card', '--oracle', await cardFile(t, card))
    assert.equal(linted.status, 1, issue)
    assert.match(linted.stderr, new RegExp(issue))
  }
})

test('O5-O6: user confirmation policy source must be an exact confirmation FK', async (t) => {
  const exact = VALID_CARD.replace('(출처: S1)', '(출처: user message Q-confirmation)')
  const guessed = VALID_CARD.replace('(출처: S1)', '(출처: 사용자 추정)')

  const accepted = run('card', '--oracle', await cardFile(t, exact))
  assert.equal(accepted.status, 0, accepted.stderr)

  const rejected = run('card', '--oracle', await cardFile(t, guessed))
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /policy-source-unregistered/)
})

test('O5-O6: implementation-reference may support but not solely authorize policy', async (t) => {
  const withImplementationSource = VALID_CARD.replace(
    '| S1  | product-policy | 저장 정책 | PRD  | repo:docs/save.md#v3 | approved  |',
    '| S1  | product-policy | 저장 정책 | PRD  | repo:docs/save.md#v3 | approved  |\n| S2  | implementation-reference | 저장 구현 | Code | src/save.ts | N/A (출처: S1) |',
  )
  const paired = withImplementationSource.replace(
    '- P1: 저장 중 추가 제출은 무시한다. (출처: S1)',
    '- P1: 저장 중 추가 제출은 무시한다. (출처: S1, S2)',
  )
  const sole = withImplementationSource.replace(
    '- P1: 저장 중 추가 제출은 무시한다. (출처: S1)',
    '- P1: 저장 중 추가 제출은 무시한다. (출처: S2)',
  )

  const accepted = run('card', '--oracle', await cardFile(t, paired))
  assert.equal(accepted.status, 0, accepted.stderr)

  const rejected = run('card', '--oracle', await cardFile(t, sole))
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /policy-source-implementation-reference/)
})

test('O5-O6: local Source Registry paths with anchors must be covered by --source', async (t) => {
  const base = await directory(t)
  const oracle = join(base, 'oracle.md')
  const source = 'package.json'
  await writeFile(oracle, VALID_CARD.replace('repo:docs/save.md#v3', 'repo:package.json#v3'))

  const covered = run('card', '--oracle', oracle, '--source', source)
  assert.equal(covered.status, 0, covered.stderr)

  const missing = run('card', '--oracle', oracle, '--source', 'packages/frontend-oracle-design/package.json')
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /source-lock-missing/)

  const extra = run('card', '--oracle', oracle, '--source', source, '--source', 'skills/README.md')
  assert.equal(extra.status, 1)
  assert.match(extra.stderr, /source-lock-unregistered/)
})

test('O5-O6: repo: Source Registry path traversal is rejected even when supplied as --source', async (t) => {
  const traversal = VALID_CARD.replace('repo:docs/save.md#v3', 'repo:../outside.md#v1')
  const linted = run('card', '--oracle', await cardFile(t, traversal), '--source', '../outside.md')

  assert.equal(linted.status, 1)
  assert.match(linted.stderr, /source-repo-path/)
})

test('O5-O6: repo: Source Registry symlink escaping repository is rejected', async (t) => {
  const base = await directory(t)
  const outside = await directory(t)
  const link = join(base, 'docs', 'oracle-source-link.md')
  const card = VALID_CARD.replace('repo:docs/save.md#v3', 'repo:docs/oracle-source-link.md#v1')
  await writeFile(join(outside, 'secret.md'), 'outside')
  await mkdir(dirname(link), { recursive: true })
  await symlink(join(outside, 'secret.md'), link)

  const oracle = join(base, 'oracle.md')
  await writeFile(oracle, card)
  const linted = runFrom(base, 'card', '--oracle', oracle, '--source', link)

  assert.equal(linted.status, 1)
  assert.match(linted.stderr, /source-repo-path/)
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
  const oracle = await cardFile(t, VALID_CARD.replace(' (출처: S1)', ''))

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

test('state-model: 섹션은 선택이다 — async 행이 있어도 없으면 그냥 통과한다', async (t) => {
  const withoutStateModel = VALID_CARD.slice(0, VALID_CARD.indexOf('## State Model'))

  const linted = run('card', '--oracle', await cardFile(t, withoutStateModel))

  assert.equal(linted.status, 0, linted.stderr)
})

test('state-model: 전이가 카드 행을 인용하지 않거나 없는 행을 인용하면 실패한다', async (t) => {
  const unlinked = VALID_CARD.replace(
    '| idle    | SUBMIT           | pending | O1             |',
    '| idle    | SUBMIT           | pending | -              |',
  )
  const unknown = VALID_CARD.replace(
    '| idle    | SUBMIT           | pending | O1             |',
    '| idle    | SUBMIT           | pending | O99            |',
  )

  const missingCite = run('card', '--oracle', await cardFile(t, unlinked))
  assert.equal(missingCite.status, 1)
  assert.match(missingCite.stderr, /state-model-row-unlinked/)

  const unknownCite = run('card', '--oracle', await cardFile(t, unknown))
  assert.equal(unknownCite.status, 1)
  assert.match(unknownCite.stderr, /state-model-row-unknown/)
  assert.match(unknownCite.stderr, /O99/)
})

test('state-model: States·Events가 비어 있거나 전이표가 없으면 실패한다', async (t) => {
  const emptyStates = VALID_CARD.replace('- States: idle, pending, error, done', '- States: TBD')
  const noTable = VALID_CARD.replace(/\| From[\s\S]*?\| pending \| CANCEL[^\n]*\n/, '')

  const states = run('card', '--oracle', await cardFile(t, emptyStates))
  assert.equal(states.status, 1)
  assert.match(states.stderr, /state-model-field: State Model must list concrete States/)

  const table = run('card', '--oracle', await cardFile(t, noTable))
  assert.equal(table.status, 1)
  assert.match(table.stderr, /state-model-transitions/)
})

test('state-model: async 토큰이 없는 카드는 State Model 없이 통과한다', async (t) => {
  const syncCard = `# Static Card

## Outcome Brief

- Actor and context: 안내 문구를 읽는 사용자
- Observable success: 안내 문구가 표시된다.
- Non-goals: 문구 재작성
- Worst regression: 문구 누락
- Reversibility: 변경 commit revert
- Sources: S1

## Source Registry

| ID  | Kind           | 관할      | 기준 | 위치·version    | 승인 상태 |
| --- | -------------- | --------- | ---- | --------------- | --------- |
| S1  | product-policy | 안내 정책 | PRD  | docs/info.md#v1 | approved  |

## User Confirmation

- Status: approved
- Source: user message Q-confirmation

## 결정된 정책

- P1: 안내 문구를 항상 표시한다. (출처: S1) (행: O1)

자동 추가 TC: 중복 N/A (출처: S1), 오류 N/A (출처: S1), 재시도 N/A (출처: S1),
빈 데이터 0건 N/A (출처: S1), 로딩 N/A (출처: S1), out-of-order N/A (출처: S1),
취소 N/A (출처: S1)

## Behavior Contract

| ID  | 정책 | Given     | When      | Then           | Never     | 부작용(종류×횟수) | BVA       |
| --- | ---- | --------- | --------- | -------------- | --------- | ----------------- | --------- |
| O1  | P1   | 화면 진입 | 렌더 완료 | 안내 문구 표시 | 문구 누락 | 요청×0            | 값: 문구  |
`

  const linted = run('card', '--oracle', await cardFile(t, syncCard))

  assert.equal(linted.status, 0, linted.stderr)
})

const EVIDENCE_CARD = `# Card

## Source Registry

| ID | Kind | 관할 | 기준 | 위치·version | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| S1 | product-policy | evidence fixture | test | repo:docs/evidence.md#v1 | approved |
| S2 | implementation-reference | evidence fixture | test | repo:docs/evidence-impl.md#v1 | draft |

## Behavior Contract

| ID  | Given | When  | Then         | Never       | 부작용(종류×횟수) | BVA       |
| --- | ----- | ----- | ------------ | ----------- | ----------------- | --------- |
| O1  | a     | b     | pending 표시 | 성공 UI     | POST×1            | 상태      |
| O2  | a     | b     | N/A (출처: S1) | 성공 저장 | 저장×0            | 상태      |
| O3  | a     | b     | N/A (출처: S1) | 중복 저장 | POST×1            | 횟수      |
`

const VISUAL_EVIDENCE_CARD = `# Card

## Source Registry

| ID | Kind | 관할 | 기준 | 위치·version | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| S1 | product-policy | visual | PRD | repo:docs/visual.md#v1 | approved |
| S2 | implementation-reference | visual fixture | browser note | repo:docs/visual-impl.md#v1 | draft |

## Visual Contract

| ID | 정책 | 축 | 계약 | Never | 출처 | 증거 계층 |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | P1 | layout | relation | overlap | S1 | RELATIONAL |
| D2 | P2 | identity | signature | generic | S1 | JUDGMENT |
| D3 | P3 | copy | N/A (출처: S1) | other copy | S1 | HARD |

## User Confirmation

- Visual QA authorization: approved
`

const REPORTED_RUN = JSON.stringify({
  runId: 'r-001',
  exitCode: 0,
  grade: 'reported',
  tests: [{ name: 'save > pending 표시', status: 'passed' }],
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

function chainedLedger(raw, oracleSha256) {
  let previousDigest = '0'.repeat(64)
  const records = raw
    .trim()
    .split('\n')
    .map((line, index) => {
      const parsed = JSON.parse(line)
      const record = {
        schemaVersion: 3,
        type: 'run',
        label: `fixture-${index}`,
        command: ['node', '--test'],
        signal: null,
        tests: [],
        oracleSha256,
        adapter: 'node-test',
        worktreeSha256: 'a'.repeat(64),
        ...parsed,
        previousDigest,
      }
      record.digest = createHash('sha256').update(stableStringify(record)).digest('hex')
      previousDigest = record.digest
      return JSON.stringify(record)
    })
    .join('\n')
  return `${records}\n`
}

async function evidenceFixture(t, rows, { ledger = `${REPORTED_RUN}\n` } = {}) {
  const base = await directory(t)
  const oracle = join(base, 'oracle.md')
  const map = join(base, 'evidence.json')
  const ledgerPath = join(base, 'runs.jsonl')

  await writeFile(oracle, EVIDENCE_CARD)
  await writeFile(map, JSON.stringify({ schemaVersion: 1, rows }))
  await writeFile(ledgerPath, chainedLedger(ledger, createHash('sha256').update(EVIDENCE_CARD).digest('hex')))

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

test('O18: RED evidence rejects signal or null exitCode even with failed reporter test', async (t) => {
  const args = await evidenceFixture(
    t,
    { O1: { kind: 'test', name: 'save > pending 표시' } },
    {
      ledger: `${JSON.stringify({
        runId: 'r-001',
        exitCode: null,
        signal: 'SIGTERM',
        grade: 'reported',
        tests: [{ name: 'save > pending 표시', status: 'failed' }],
      })}\n`,
    },
  )
  const red = run('red', ...args.slice(1), '--row', 'O1')

  assert.equal(red.status, 1)
  assert.match(red.stderr, /^RED_EVIDENCE_UNVERIFIABLE: /)
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

test('O18: N/A evidence requires an explicit row N/A and approved source', async (t) => {
  const activeRow = await evidenceFixture(t, {
    O1: { kind: 'na', reason: 'active row bypass', source: 'S1' },
    O2: { kind: 'na', reason: 'fixture N/A', source: 'S1' },
    O3: { kind: 'na', reason: 'fixture N/A', source: 'S1' },
  })
  const unknownSource = await evidenceFixture(t, {
    O1: { kind: 'test', name: 'save > pending 표시' },
    O2: { kind: 'na', reason: 'fixture N/A', source: 'S9' },
    O3: { kind: 'na', reason: 'fixture N/A', source: 'S1' },
  })
  const implementationSource = await evidenceFixture(t, {
    O1: { kind: 'test', name: 'save > pending 표시' },
    O2: { kind: 'na', reason: 'implementation reference is not authority', source: 'S2' },
    O3: { kind: 'na', reason: 'fixture N/A', source: 'S1' },
  })

  for (const args of [activeRow, unknownSource, implementationSource]) {
    const rejected = run(...args)
    assert.equal(rejected.status, 1)
    assert.match(rejected.stderr, /^EVIDENCE_OWNER_INVALID: /)
  }
})

test('O18: visual evidence owner를 tier별로 강제하고 pending은 GREEN에서만 허용한다', async (t) => {
  const base = await directory(t)
  const oracle = join(base, 'oracle.md')
  const map = join(base, 'evidence.json')
  const ledger = join(base, 'runs.jsonl')

  await writeFile(oracle, VISUAL_EVIDENCE_CARD)
  await mkdir(join(base, 'visual-qa/v-003/screenshots'), { recursive: true })
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
    chainedLedger(
      `${JSON.stringify({
        runId: 'r-001',
        exitCode: 0,
        grade: 'reported',
        tests: [{ name: 'visual > exact copy', status: 'passed' }],
      })}\n`,
      createHash('sha256').update(VISUAL_EVIDENCE_CARD).digest('hex'),
    ),
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
  const artifact = join(base, 'visual-qa/v-001/evidence.json')
  const oracleSha256 = createHash('sha256').update(VISUAL_EVIDENCE_CARD).digest('hex')
  const worktreeSha256 = 'a'.repeat(64)
  const media = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==',
    'base64',
  )
  const mediaSha256 = createHash('sha256').update(media).digest('hex')

  await writeFile(oracle, VISUAL_EVIDENCE_CARD)
  await mkdir(join(base, 'visual-qa/v-001'), { recursive: true })
  await writeFile(join(base, 'visual-qa/v-001/mobile.png'), media)
  const receipt = {
    schemaVersion: 3,
    oracleSha256,
    producerRun: { runId: 'visual-run-001', tool: 'playwright', status: 'passed', worktreeSha256 },
    rows: {
      D1: {
        status: 'passed',
        journey: {
          status: 'passed',
          tool: 'playwright',
          scenario: 'layout relation check',
          checks: ['D1 relation is preserved'],
          artifacts: [{ path: 'mobile.png', sha256: mediaSha256, mediaType: 'image/png' }],
        },
      },
    },
  }
  const receiptRaw = JSON.stringify(receipt)
  await writeFile(artifact, receiptRaw)
  await writeFile(
    map,
    JSON.stringify({
      schemaVersion: 3,
      rows: {
        D1: {
          kind: 'visual',
          artifact: 'visual-qa/v-001/evidence.json',
          sha256: createHash('sha256').update(receiptRaw).digest('hex'),
        },
        D2: { kind: 'reviewer', finding: 'd-1', role: 'designer' },
        D3: { kind: 'test', name: 'visual > exact copy' },
      },
    }),
  )
  await writeFile(
    ledger,
    chainedLedger(
      `${JSON.stringify({
        runId: 'r-001',
        exitCode: 0,
        grade: 'reported',
        tests: [{ name: 'visual > exact copy', status: 'passed' }],
      })}\n${JSON.stringify({
        runId: 'visual-run-001',
        command: ['npx', 'playwright', 'test'],
        exitCode: 0,
        signal: null,
        grade: 'exit-only',
        oracleSha256,
        worktreeSha256,
      })}\n`,
      oracleSha256,
    ),
  )

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

  await writeFile(
    artifact,
    JSON.stringify({
      schemaVersion: 3,
      oracleSha256: '0'.repeat(64),
      producerRun: { runId: 'visual-run-001', tool: 'playwright', status: 'passed', worktreeSha256 },
      rows: {
        D1: {
          status: 'passed',
          journey: {
            status: 'passed',
            tool: 'playwright',
            scenario: 'layout relation check',
            checks: ['D1 relation is preserved'],
            artifacts: [{ path: 'mobile.png', sha256: mediaSha256, mediaType: 'image/png' }],
          },
        },
      },
    }),
  )
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

test('O18: visual artifact는 browser journey 없이 screenshot-only로 review를 통과할 수 없다', async (t) => {
  const base = await directory(t)
  const oracle = join(base, 'oracle.md')
  const map = join(base, 'evidence.json')
  const ledger = join(base, 'runs.jsonl')
  const artifact = join(base, 'visual-qa/v-002/evidence.json')
  const oracleSha256 = createHash('sha256').update(VISUAL_EVIDENCE_CARD).digest('hex')

  await writeFile(oracle, VISUAL_EVIDENCE_CARD)
  await mkdir(join(base, 'visual-qa/v-002'), { recursive: true })
  await writeFile(artifact, JSON.stringify({ schemaVersion: 2, oracleSha256, rows: { D1: { artifacts: ['d1.png'] } } }))
  await writeFile(
    map,
    JSON.stringify({
      schemaVersion: 2,
      rows: {
        D1: { kind: 'visual', artifact: 'visual-qa/v-002/evidence.json' },
        D2: { kind: 'reviewer', finding: 'd-1', role: 'designer' },
        D3: { kind: 'test', name: 'visual > exact copy' },
      },
    }),
  )
  await writeFile(
    ledger,
    chainedLedger(
      `${JSON.stringify({
        runId: 'r-001',
        exitCode: 0,
        grade: 'reported',
        tests: [{ name: 'visual > exact copy', status: 'passed' }],
      })}\n`,
      oracleSha256,
    ),
  )

  const screenshotOnly = run(
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
  assert.equal(screenshotOnly.status, 1)
  assert.match(screenshotOnly.stderr, /^VISUAL_EVIDENCE_INVALID: /)

  await writeFile(
    artifact,
    JSON.stringify({
      schemaVersion: 2,
      oracleSha256,
      rows: {
        D1: {
          journey: {
            status: 'passed',
            tool: 'playwright',
            scenario: 'layout relation check',
            checks: ['D1 relation is preserved'],
            artifacts: ['screenshots/d1.png'],
          },
        },
      },
    }),
  )
  const missingRowPass = run(
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
  assert.equal(missingRowPass.status, 1)
  assert.match(missingRowPass.stderr, /^VISUAL_EVIDENCE_INVALID: /)

  await writeFile(
    artifact,
    JSON.stringify({
      schemaVersion: 2,
      oracleSha256,
      rows: {
        D1: {
          status: 'passed',
          journey: {
            status: 'passed',
            tool: 'playwright',
            scenario: 'layout relation check',
            checks: [null],
            artifacts: ['screenshots/d1.png'],
          },
        },
      },
    }),
  )
  const emptyCheck = run(
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
  assert.equal(emptyCheck.status, 1)
  assert.match(emptyCheck.stderr, /^VISUAL_EVIDENCE_INVALID: /)

  await writeFile(
    artifact,
    JSON.stringify({
      schemaVersion: 2,
      oracleSha256,
      rows: {
        D1: {
          status: 'not-applicable',
          checks: ['D1 relation reviewed outside browser journey'],
          artifacts: ['d1.png'],
          journey: { status: 'not-applicable', reason: 'layout relation has no browser journey', source: 'S1' },
        },
      },
    }),
  )
  const rowNotApplicable = run(
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
  assert.equal(rowNotApplicable.status, 1)
  assert.match(rowNotApplicable.stderr, /^VISUAL_EVIDENCE_INVALID: /)

  const media = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==',
    'base64',
  )
  const mediaSha256 = createHash('sha256').update(media).digest('hex')
  const worktreeSha256 = 'a'.repeat(64)
  await writeFile(join(base, 'visual-qa/v-002/d1.png'), media)
  const approvedReceipt = {
    schemaVersion: 3,
    oracleSha256,
    producerRun: { runId: 'visual-run-002', tool: 'playwright', status: 'passed', worktreeSha256 },
    rows: {
      D1: {
        status: 'passed',
        checks: ['D1 relation reviewed outside browser journey'],
        artifacts: [{ path: 'd1.png', sha256: mediaSha256, mediaType: 'image/png' }],
        journey: {
          status: 'not-applicable',
          reason: 'no interactive browser journey for static relation',
          source: 'S1',
        },
      },
    },
  }
  const approvedReceiptRaw = JSON.stringify(approvedReceipt)
  await writeFile(artifact, approvedReceiptRaw)
  await writeFile(
    map,
    JSON.stringify({
      schemaVersion: 3,
      rows: {
        D1: {
          kind: 'visual',
          artifact: 'visual-qa/v-002/evidence.json',
          sha256: createHash('sha256').update(approvedReceiptRaw).digest('hex'),
        },
        D2: { kind: 'reviewer', finding: 'd-1', role: 'designer' },
        D3: { kind: 'test', name: 'visual > exact copy' },
      },
    }),
  )
  await writeFile(
    ledger,
    chainedLedger(
      `${JSON.stringify({
        runId: 'r-001',
        exitCode: 0,
        grade: 'reported',
        tests: [{ name: 'visual > exact copy', status: 'passed' }],
      })}\n${JSON.stringify({
        runId: 'visual-run-002',
        command: ['npx', 'playwright', 'test'],
        exitCode: 0,
        signal: null,
        grade: 'exit-only',
        oracleSha256,
        worktreeSha256,
      })}\n`,
      oracleSha256,
    ),
  )
  const journeyNotApplicable = run(
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
  assert.equal(journeyNotApplicable.status, 0, journeyNotApplicable.stderr)

  await writeFile(
    artifact,
    JSON.stringify({
      schemaVersion: 2,
      oracleSha256,
      rows: {
        D1: {
          status: 'passed',
          checks: ['D1 relation reviewed outside browser journey'],
          artifacts: ['not-applicable.md'],
          journey: { status: 'not-applicable', reason: 'not approved', source: 'S9' },
        },
      },
    }),
  )

  const unapprovedSource = run(
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
  assert.equal(unapprovedSource.status, 1)
  assert.match(unapprovedSource.stderr, /^VISUAL_EVIDENCE_INVALID: /)
})

test('O18: visual artifact 내부 journey tool과 artifact 경로를 fail-closed로 검증한다', async (t) => {
  const base = await directory(t)
  const outside = await directory(t)
  const oracle = join(base, 'oracle.md')
  const map = join(base, 'evidence.json')
  const ledger = join(base, 'runs.jsonl')
  const artifact = join(base, 'visual-qa/v-003/evidence.json')
  const oracleSha256 = createHash('sha256').update(VISUAL_EVIDENCE_CARD).digest('hex')

  await writeFile(oracle, VISUAL_EVIDENCE_CARD)
  await mkdir(join(base, 'visual-qa/v-003/screenshots'), { recursive: true })
  await writeFile(
    map,
    JSON.stringify({
      schemaVersion: 2,
      rows: {
        D1: { kind: 'visual', artifact: 'visual-qa/v-003/evidence.json' },
        D2: { kind: 'reviewer', finding: 'd-1', role: 'designer' },
        D3: { kind: 'na', reason: 'copy contract is not part of this fixture', source: 'S1' },
      },
    }),
  )
  await writeFile(
    ledger,
    chainedLedger(`${JSON.stringify({ runId: 'r-001', exitCode: 0, grade: 'reported', tests: [] })}\n`, oracleSha256),
  )

  const verify = () =>
    run('evidence', '--oracle', oracle, '--map', map, '--ledger', ledger, '--run', 'r-001', '--phase', 'review')

  await writeFile(
    artifact,
    JSON.stringify({
      schemaVersion: 2,
      oracleSha256,
      rows: {
        D1: {
          status: 'passed',
          journey: {
            status: 'passed',
            tool: 'frontend-visual-qa',
            scenario: 'layout relation check',
            checks: ['D1 relation is preserved'],
            artifacts: ['screenshots/d1.png'],
          },
        },
      },
    }),
  )
  const unsupportedTool = verify()
  assert.equal(unsupportedTool.status, 1)
  assert.match(unsupportedTool.stderr, /^VISUAL_EVIDENCE_INVALID: /)

  await writeFile(
    artifact,
    JSON.stringify({
      schemaVersion: 2,
      oracleSha256,
      rows: {
        D1: {
          status: 'passed',
          journey: {
            status: 'passed',
            tool: 'playwright',
            scenario: 'layout relation check',
            checks: ['D1 relation is preserved'],
            artifacts: ['screenshots/missing.png'],
          },
        },
      },
    }),
  )
  const missingNestedArtifact = verify()
  assert.equal(missingNestedArtifact.status, 1)
  assert.match(missingNestedArtifact.stderr, /^VISUAL_EVIDENCE_INVALID: /)

  await writeFile(join(outside, 'outside.png'), 'png')
  await symlink(join(outside, 'outside.png'), join(base, 'visual-qa/v-003/screenshots/symlink.png'))
  await writeFile(
    artifact,
    JSON.stringify({
      schemaVersion: 2,
      oracleSha256,
      rows: {
        D1: {
          status: 'passed',
          journey: {
            status: 'passed',
            tool: 'mcp:browser',
            scenario: 'layout relation check',
            checks: ['D1 relation is preserved'],
            artifacts: ['screenshots/symlink.png'],
          },
        },
      },
    }),
  )
  const symlinkNestedArtifact = verify()
  assert.equal(symlinkNestedArtifact.status, 1)
  assert.match(symlinkNestedArtifact.stderr, /^VISUAL_EVIDENCE_INVALID: /)
})

test('O18: visual artifact symlink은 Oracle directory 안 경로여도 거부한다', async (t) => {
  const base = await directory(t)
  const outside = await directory(t)
  const oracle = join(base, 'oracle.md')
  const map = join(base, 'evidence.json')
  const ledger = join(base, 'runs.jsonl')
  const artifact = join(base, 'visual-evidence.json')
  const oracleSha256 = createHash('sha256').update(VISUAL_EVIDENCE_CARD).digest('hex')

  await writeFile(oracle, VISUAL_EVIDENCE_CARD)
  await writeFile(
    join(outside, 'visual-evidence.json'),
    JSON.stringify({
      schemaVersion: 2,
      oracleSha256,
      rows: {
        D1: {
          status: 'passed',
          journey: {
            status: 'passed',
            tool: 'playwright',
            scenario: 'layout relation check',
            checks: ['D1 relation is preserved'],
            artifacts: ['screenshots/d1.png'],
          },
        },
      },
    }),
  )
  await symlink(join(outside, 'visual-evidence.json'), artifact)
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
  await writeFile(
    ledger,
    chainedLedger(`${JSON.stringify({ runId: 'r-001', exitCode: 0, grade: 'reported', tests: [] })}\n`, oracleSha256),
  )

  const rejected = run(
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

  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /^VISUAL_EVIDENCE_INVALID: /)
})

test('O19: run 결과에 없거나 통과하지 않은 테스트 이름을 거부한다', async (t) => {
  const missingName = await evidenceFixture(t, {
    O1: { kind: 'test', name: 'save > 존재하지 않는 이름' },
    O2: { kind: 'na', reason: '사유', source: 'S1' },
    O3: { kind: 'na', reason: '사유', source: 'S1' },
  })
  const failedName = await evidenceFixture(t, {
    O1: { kind: 'test', name: 'save > 잘못된 테스트 이름' },
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
  assert.match(failing.stderr, /잘못된 테스트 이름/)
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

const CHANGEABILITY_REVIEW = [
  { axis: 'Readability', status: 'PASS', evidence: 'src/form.tsx:10-30' },
  { axis: 'Predictability', status: 'PASS', evidence: 'deterministic state transitions only' },
  { axis: 'Cohesion', status: 'N/A', evidence: '변경된 소유 경계가 없다' },
  { axis: 'Coupling', status: 'PASS', evidence: '새 public API가 없다' },
  { axis: 'Simplicity', status: 'PASS', evidence: '기존 platform API를 재사용한다' },
]

function chainedRecord(record, previousDigest = '0'.repeat(64)) {
  const chained = { schemaVersion: 3, ...record, previousDigest }
  chained.digest = createHash('sha256').update(stableStringify(chained)).digest('hex')
  return chained
}

async function appendReviewReceipt(ledger, findingsPath, oracleSha256) {
  const raw = await readFile(ledger, 'utf8')
  const records = raw.trim().split('\n').map(JSON.parse)
  const documentRaw = await readFile(findingsPath, 'utf8')
  const document = JSON.parse(documentRaw)
  const receipt = document.orchestrationReceipt
  const event = chainedRecord(
    {
      type: 'review-receipt',
      receiptId: receipt.receiptId,
      packetSha256: receipt.packetSha256,
      targetRevision: receipt.targetRevision,
      role: receipt.role,
      reviewerId: document.reviewerId,
      taskId: receipt.taskId,
      outputSha256: receipt.outputSha256,
      findingsSha256: createHash('sha256').update(documentRaw).digest('hex'),
      oracleSha256,
      adapter: 'controller',
      at: '2025-01-01T00:00:01.000Z',
    },
    records.at(-1).digest,
  )
  await writeFile(ledger, `${raw}${JSON.stringify(event)}\n`)
}

async function reviewFixture(t, findings, overrides = {}) {
  const base = await directory(t)
  const oracle = join(base, 'oracle.md')
  const packetPath = join(base, 'review-packet.json')
  const map = join(base, 'evidence.json')
  const ledger = join(base, 'runs.jsonl')
  const revision = overrides.revision ?? 'a'.repeat(64)
  const productionRevision = overrides.productionRevision ?? 'b'.repeat(64)
  const evidence = overrides.evidence ?? overrides.map ?? { schemaVersion: 2, rows: {} }
  const mapDocument = overrides.map ?? evidence
  const oracleSha256 = createHash('sha256').update(EVIDENCE_CARD).digest('hex')
  const manifestSha256 = 'c'.repeat(64)
  const decisionContent = 'Implement the approved change.\n'
  const decisionSha256 = createHash('sha256').update(decisionContent).digest('hex')
  const changeability = await readFile(join(dirname(fileURLToPath(import.meta.url)), '../references/changeability.md'))
  const greenRun = chainedRecord({
    type: 'run',
    runId: 'r-002',
    label: 'behavior:reported',
    command: [process.execPath, '--test', 'fixture.test.mjs'],
    exitCode: 0,
    signal: null,
    grade: 'reported',
    tests: [{ name: 'save > pending 표시', status: 'passed' }],
    oracleSha256,
    adapter: 'node-test',
    worktreeSha256: revision,
    productionSha256: productionRevision,
    lockManifestSha256: manifestSha256,
    at: '2025-01-01T00:00:00.000Z',
  })
  const extraRuns = []
  for (const record of overrides.extraRuns ?? []) {
    const previous = extraRuns.at(-1) ?? greenRun
    extraRuns.push(
      chainedRecord(
        {
          oracleSha256,
          worktreeSha256: revision,
          productionSha256: productionRevision,
          lockManifestSha256: manifestSha256,
          ...record,
        },
        previous.digest,
      ),
    )
  }
  const packet = {
    schemaVersion: 2,
    oracle: { content: EVIDENCE_CARD, sha256: oracleSha256 },
    lock: { oracle: { path: 'oracle.md', sha256: oracleSha256 } },
    lockVerification: {
      stdout: `ORACLE_VERIFIED sha256:${oracleSha256} manifest-sha256:${manifestSha256}`,
      manifestSha256,
    },
    state: {
      lockManifestSha256: manifestSha256,
      history: [{ state: 'IMPLEMENTED_GREEN', runId: 'r-002' }],
    },
    ledger: [greenRun, ...extraRuns],
    evidence,
    evidenceArtifacts: [],
    implementationDecision: {
      path: 'implementation-decision.md',
      content: decisionContent,
      sha256: decisionSha256,
    },
    reviewPoints: [
      {
        path: 'changeability.md',
        sha256: createHash('sha256').update(changeability).digest('hex'),
      },
    ],
    targetRevision: revision,
    targetSnapshot: overrides.targetSnapshot ?? {
      worktreeSha256: revision,
      productionSha256: productionRevision,
      lockManifestSha256: manifestSha256,
    },
  }
  const packetRaw = `${JSON.stringify(packet, null, 2)}\n`
  const packetSha256 = createHash('sha256').update(packetRaw).digest('hex')
  const document = {
    schemaVersion: 2,
    reviewerRole: 'code-reviewer',
    reviewerId: overrides.reviewerId ?? 'reviewer-a',
    packetSha256,
    targetRevision: revision,
    changeabilityReview: CHANGEABILITY_REVIEW,
    findings,
    ...overrides.document,
  }
  if (!Object.hasOwn(document, 'orchestrationReceipt')) {
    const taskId = `task-${document.reviewerId}-${overrides.name ?? 'findings'}`
    const output = { ...document }
    const outputSha256 = createHash('sha256').update(stableStringify(output)).digest('hex')
    document.orchestrationReceipt = {
      receiptId: createHash('sha256')
        .update(stableStringify({ packetSha256, reviewerId: document.reviewerId, taskId, outputSha256 }))
        .digest('hex'),
      packetSha256: document.packetSha256,
      targetRevision: document.targetRevision,
      role: document.reviewerRole,
      reviewerId: document.reviewerId,
      taskId,
      outputSha256,
    }
  }
  const findingsPath = join(base, overrides.name ?? 'findings.json')
  const findingsRaw = JSON.stringify(document)

  await writeFile(oracle, EVIDENCE_CARD)
  await writeFile(packetPath, packetRaw)
  await writeFile(map, JSON.stringify(mapDocument))
  await writeFile(findingsPath, findingsRaw)
  await writeFile(ledger, [greenRun, ...extraRuns].map((record) => `${JSON.stringify(record)}\n`).join(''))
  if (document.orchestrationReceipt) await appendReviewReceipt(ledger, findingsPath, oracleSha256)

  return { oracle, packetPath, map, ledger, revision, productionRevision, findingsPath, packetSha256, oracleSha256 }
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

test('O23: review 명령은 v2 findings를 packet·revision·evidence map에 묶고 blocking을 판정한다', async (t) => {
  const blockingFinding = {
    id: 'f-1',
    row: 'O2',
    classification: 'PRODUCT_DEFECT',
    severity: 'high',
    finding: '오류 표시가 없다',
    evidence: 'r-003',
    fix: 'error UI 추가',
  }
  const blocking = await reviewFixture(t, [blockingFinding], {
    map: { schemaVersion: 2, rows: { O3: { kind: 'reviewer', finding: 'f-1', role: 'code-reviewer' } } },
  })
  const clear = await reviewFixture(t, [], { name: 'clear.json' })

  const rejected = run(
    'review',
    '--file',
    blocking.findingsPath,
    '--oracle',
    blocking.oracle,
    '--packet',
    blocking.packetPath,
    '--revision',
    blocking.revision,
    '--map',
    blocking.map,
  )
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /^FINDINGS_BLOCKING: /)

  const accepted = run(
    'review',
    '--file',
    clear.findingsPath,
    '--oracle',
    clear.oracle,
    '--packet',
    clear.packetPath,
    '--revision',
    clear.revision,
    '--map',
    clear.map,
  )
  assert.equal(accepted.status, 0, accepted.stderr)
  assert.equal(accepted.stdout, 'REVIEW_CLEAR advisory:0\n')

  // typecheck·lint 처럼 리포터가 없는 required label 은 원장에 adapter: null·grade: 'exit-only'
  // 로 기록된다(oracle-run.mjs). 그 런이 섞였다는 이유로 리뷰 검증이 막히면 안 된다.
  const exitOnly = await reviewFixture(t, [], {
    name: 'exit-only.json',
    extraRuns: [
      {
        type: 'run',
        runId: 'r-003',
        label: 'typecheck:exit',
        command: ['npx', 'tsc', '--noEmit'],
        adapter: null,
        exitCode: 0,
        signal: null,
        grade: 'exit-only',
        tests: null,
        at: '2025-01-01T00:00:00.500Z',
      },
    ],
  })
  const acceptedExitOnly = run(
    'review',
    '--file',
    exitOnly.findingsPath,
    '--oracle',
    exitOnly.oracle,
    '--packet',
    exitOnly.packetPath,
    '--revision',
    exitOnly.revision,
    '--map',
    exitOnly.map,
  )
  assert.equal(acceptedExitOnly.status, 0, acceptedExitOnly.stderr)
  assert.equal(acceptedExitOnly.stdout, 'REVIEW_CLEAR advisory:0\n')

  // 리뷰 지적(blocking finding)을 고치면 worktree 리비전이 바뀐다. 그때는 IMPLEMENTED_GREEN 을
  // 기록한 런이 아니라, 같은 라벨로 새 리비전에서 다시 통과한 reported 런이 GREEN 증거다.
  const fixedRevision = 'd'.repeat(64)
  const afterFix = await reviewFixture(t, [], {
    name: 'after-fix.json',
    document: { targetRevision: fixedRevision },
    targetSnapshot: {
      worktreeSha256: fixedRevision,
      productionSha256: 'b'.repeat(64),
      lockManifestSha256: 'c'.repeat(64),
    },
    extraRuns: [
      {
        type: 'run',
        runId: 'r-004',
        label: 'behavior:reported',
        command: [process.execPath, '--test', 'fixture.test.mjs'],
        adapter: 'node-test',
        exitCode: 0,
        signal: null,
        grade: 'reported',
        tests: [{ name: 'save > pending 표시', status: 'passed' }],
        worktreeSha256: fixedRevision,
        at: '2025-01-01T00:00:00.700Z',
      },
    ],
  })
  const acceptedAfterFix = run(
    'review',
    '--file',
    afterFix.findingsPath,
    '--oracle',
    afterFix.oracle,
    '--packet',
    afterFix.packetPath,
    '--revision',
    fixedRevision,
    '--map',
    afterFix.map,
  )
  assert.equal(acceptedAfterFix.status, 0, acceptedAfterFix.stderr)
  assert.equal(acceptedAfterFix.stdout, 'REVIEW_CLEAR advisory:0\n')

  const stale = await reviewFixture(t, [], { document: { targetRevision: 'b'.repeat(64) }, name: 'stale.json' })
  const rejectedRevision = run(
    'review',
    '--file',
    stale.findingsPath,
    '--oracle',
    stale.oracle,
    '--packet',
    stale.packetPath,
    '--revision',
    stale.revision,
    '--map',
    stale.map,
  )
  assert.equal(rejectedRevision.status, 1)
  assert.match(rejectedRevision.stderr, /^REVIEW_REVISION_MISMATCH: /)

  const productionOnly = await reviewFixture(t, [], { name: 'production-only.json' })
  const rejectedProductionTarget = run(
    'review',
    '--file',
    productionOnly.findingsPath,
    '--oracle',
    productionOnly.oracle,
    '--packet',
    productionOnly.packetPath,
    '--revision',
    productionOnly.productionRevision,
    '--map',
    productionOnly.map,
  )
  assert.equal(rejectedProductionTarget.status, 1)
  assert.match(rejectedProductionTarget.stderr, /^REVIEW_PACKET_INVALID: /)

  const tampered = await reviewFixture(t, [], { name: 'tampered.json' })
  await writeFile(
    tampered.map,
    JSON.stringify({ schemaVersion: 2, rows: { O3: { kind: 'na', reason: 'late edit', source: 'S1' } } }),
  )
  const rejectedEvidence = run(
    'review',
    '--file',
    tampered.findingsPath,
    '--oracle',
    tampered.oracle,
    '--packet',
    tampered.packetPath,
    '--revision',
    tampered.revision,
    '--map',
    tampered.map,
  )
  assert.equal(rejectedEvidence.status, 1)
  assert.match(rejectedEvidence.stderr, /^REVIEW_EVIDENCE_STALE: /)

  const replayed = await reviewFixture(t, [], { name: 'replayed.json' })
  await writeFile(replayed.oracle, EVIDENCE_CARD.replace('pending 표시', '다른 표시'))
  const rejectedOracle = run(
    'review',
    '--file',
    replayed.findingsPath,
    '--oracle',
    replayed.oracle,
    '--packet',
    replayed.packetPath,
    '--revision',
    replayed.revision,
    '--map',
    replayed.map,
  )
  assert.equal(rejectedOracle.status, 1)
  assert.match(rejectedOracle.stderr, /^REVIEW_ORACLE_STALE: /)
})

test('O23: review 명령은 fresh v1과 unknown reviewer evidence finding을 거부한다', async (t) => {
  const legacy = await reviewFixture(t, [], { document: { schemaVersion: 1 }, name: 'legacy.json' })
  const legacyReview = run(
    'review',
    '--file',
    legacy.findingsPath,
    '--oracle',
    legacy.oracle,
    '--packet',
    legacy.packetPath,
    '--revision',
    legacy.revision,
    '--map',
    legacy.map,
  )
  assert.equal(legacyReview.status, 1)
  assert.match(legacyReview.stderr, /schemaVersion 2/)

  const unknown = await reviewFixture(t, [], {
    map: { schemaVersion: 2, rows: { O3: { kind: 'reviewer', finding: 'f-404', role: 'code-reviewer' } } },
    name: 'unknown-evidence.json',
  })
  const unknownReview = run(
    'review',
    '--file',
    unknown.findingsPath,
    '--oracle',
    unknown.oracle,
    '--packet',
    unknown.packetPath,
    '--revision',
    unknown.revision,
    '--map',
    unknown.map,
  )
  assert.equal(unknownReview.status, 1)
  assert.match(unknownReview.stderr, /^REVIEW_FINDING_UNKNOWN: /)
})

test('O23: intersected review samples require distinct reviewer identities, not distinct roles', async (t) => {
  const first = await reviewFixture(t, [], { name: 'first.json', reviewerId: 'same-reviewer' })
  const second = await reviewFixture(t, [], { name: 'second.json', reviewerId: 'same-reviewer' })
  const intersect = join(dirname(first.findingsPath), 'second.json')
  const secondDocument = JSON.parse(await readFile(second.findingsPath, 'utf8'))
  secondDocument.packetSha256 = first.packetSha256
  secondDocument.targetRevision = first.revision
  secondDocument.orchestrationReceipt.packetSha256 = first.packetSha256
  secondDocument.orchestrationReceipt.targetRevision = first.revision
  const secondOutput = { ...secondDocument }
  delete secondOutput.orchestrationReceipt
  secondDocument.orchestrationReceipt.outputSha256 = createHash('sha256')
    .update(stableStringify(secondOutput))
    .digest('hex')
  await writeFile(intersect, JSON.stringify(secondDocument))
  await appendReviewReceipt(first.ledger, intersect, first.oracleSha256)
  const rejected = run(
    'review',
    '--file',
    first.findingsPath,
    '--intersect',
    intersect,
    '--oracle',
    first.oracle,
    '--packet',
    first.packetPath,
    '--revision',
    first.revision,
    '--map',
    first.map,
  )
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /^REVIEWER_NOT_INDEPENDENT: /)
})

test('O23: reviewer evidence role must match the artifact that owns the finding', async (t) => {
  const first = await reviewFixture(
    t,
    [
      {
        id: 'f-code',
        row: 'O1',
        classification: 'PRODUCT_DEFECT',
        severity: 'high',
        finding: 'code issue',
        evidence: 'x',
        fix: 'y',
      },
    ],
    {
      name: 'code.json',
      reviewerId: 'code-reviewer-1',
      map: { schemaVersion: 2, rows: { O2: { kind: 'reviewer', finding: 'f-design', role: 'code-reviewer' } } },
    },
  )
  const second = await reviewFixture(
    t,
    [
      {
        id: 'f-design',
        row: 'O2',
        classification: 'PRODUCT_DEFECT',
        severity: 'high',
        finding: 'design issue',
        evidence: 'x',
        fix: 'y',
      },
    ],
    {
      name: 'design.json',
      reviewerId: 'designer-1',
      document: { reviewerRole: 'designer', packetSha256: first.packetSha256, targetRevision: first.revision },
    },
  )
  const intersect = join(dirname(first.findingsPath), 'design.json')
  await writeFile(intersect, await readFile(second.findingsPath, 'utf8'))
  await appendReviewReceipt(first.ledger, intersect, first.oracleSha256)
  const rejected = run(
    'review',
    '--file',
    first.findingsPath,
    '--intersect',
    intersect,
    '--oracle',
    first.oracle,
    '--packet',
    first.packetPath,
    '--revision',
    first.revision,
    '--map',
    first.map,
  )
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /^REVIEWER_EVIDENCE_INVALID: /)
})

test('O23: review rejects duplicate finding ids and reviewer role without matching artifact', async (t) => {
  const duplicate = await reviewFixture(t, [
    { id: 'f-1', row: 'O1', classification: 'PRODUCT_DEFECT', severity: 'high', finding: 'a', evidence: 'x', fix: 'y' },
    { id: 'f-1', row: 'O2', classification: 'PRODUCT_DEFECT', severity: 'high', finding: 'b', evidence: 'x', fix: 'y' },
  ])
  const duplicateReview = run(
    'review',
    '--file',
    duplicate.findingsPath,
    '--oracle',
    duplicate.oracle,
    '--packet',
    duplicate.packetPath,
    '--revision',
    duplicate.revision,
    '--map',
    duplicate.map,
  )
  assert.equal(duplicateReview.status, 1)
  assert.match(duplicateReview.stderr, /duplicate finding id/)

  const roleMismatch = await reviewFixture(
    t,
    [
      {
        id: 'f-1',
        row: 'O1',
        classification: 'PRODUCT_DEFECT',
        severity: 'high',
        finding: 'a',
        evidence: 'x',
        fix: 'y',
      },
    ],
    {
      map: { schemaVersion: 2, rows: { O1: { kind: 'reviewer', finding: 'f-1', role: 'designer' } } },
      name: 'role-mismatch.json',
    },
  )
  const rejectedRole = run(
    'review',
    '--file',
    roleMismatch.findingsPath,
    '--oracle',
    roleMismatch.oracle,
    '--packet',
    roleMismatch.packetPath,
    '--revision',
    roleMismatch.revision,
    '--map',
    roleMismatch.map,
  )
  assert.equal(rejectedRole.status, 1)
  assert.match(rejectedRole.stderr, /^REVIEWER_EVIDENCE_INVALID: /)
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

test('O9: visual evidence requires approved producer-bound artifacts', async (t) => {
  const verifyLegacyAttack = async () => {
    const base = await directory(t)
    const oracle = join(base, 'oracle.md')
    const map = join(base, 'evidence.json')
    const ledger = join(base, 'runs.jsonl')
    const artifact = join(base, 'visual/evidence.json')
    const card = VISUAL_EVIDENCE_CARD.replace(
      '- Visual QA authorization: approved',
      '- Visual QA authorization: declined',
    )
    const receipt = {
      schemaVersion: 2,
      oracleSha256: createHash('sha256').update(card).digest('hex'),
      rows: {
        D1: {
          status: 'passed',
          journey: {
            status: 'passed',
            tool: 'playwright',
            scenario: 'self-authored legacy journey',
            checks: ['D1 relation is claimed'],
            artifacts: ['proof.png'],
          },
        },
      },
    }
    await writeFile(oracle, card)
    await mkdir(dirname(artifact), { recursive: true })
    await writeFile(join(dirname(artifact), 'proof.png'), 'png')
    await writeFile(artifact, JSON.stringify(receipt))
    await writeFile(
      map,
      JSON.stringify({
        schemaVersion: 2,
        rows: {
          D1: { kind: 'visual', artifact: 'visual/evidence.json' },
          D2: { kind: 'reviewer', finding: 'd-1', role: 'designer' },
          D3: { kind: 'na', reason: 'fixture', source: 'S1' },
        },
      }),
    )
    await writeFile(
      ledger,
      chainedLedger(`${JSON.stringify({ runId: 'r-001', exitCode: 0, grade: 'exit-only' })}\n`, receipt.oracleSha256),
    )
    return run('evidence', '--oracle', oracle, '--map', map, '--ledger', ledger, '--run', 'r-001', '--phase', 'review')
  }

  const legacyAttack = await verifyLegacyAttack()
  assert.equal(legacyAttack.status, 1)
  assert.match(legacyAttack.stderr, /^VISUAL_EVIDENCE_INVALID: |^EVIDENCE_/)

  const verifyAttack = async (authorization, mutate) => {
    const base = await directory(t)
    const oracle = join(base, 'oracle.md')
    const map = join(base, 'evidence.json')
    const ledger = join(base, 'runs.jsonl')
    const artifact = join(base, 'visual/evidence.json')
    const card = VISUAL_EVIDENCE_CARD.replace(
      '- Visual QA authorization: approved',
      `- Visual QA authorization: ${authorization}`,
    )
    const media = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==',
      'base64',
    )
    const mediaSha256 = createHash('sha256').update(media).digest('hex')
    const worktreeSha256 = 'a'.repeat(64)
    const receipt = {
      schemaVersion: 3,
      oracleSha256: createHash('sha256').update(card).digest('hex'),
      producerRun: {
        runId: 'visual-run-001',
        tool: 'playwright',
        status: 'passed',
        worktreeSha256,
      },
      rows: {
        D1: {
          status: 'passed',
          journey: {
            status: 'passed',
            tool: 'playwright',
            scenario: 'approved producer journey',
            checks: ['D1 relation is preserved'],
            artifacts: [{ path: 'proof.png', sha256: mediaSha256, mediaType: 'image/png' }],
          },
        },
      },
    }
    await writeFile(oracle, card)
    await mkdir(dirname(artifact), { recursive: true })
    await writeFile(join(dirname(artifact), 'proof.png'), media)
    await mutate(receipt, artifact)
    const receiptRaw = JSON.stringify(receipt)
    await writeFile(artifact, receiptRaw)
    await writeFile(
      map,
      JSON.stringify({
        schemaVersion: 3,
        rows: {
          D1: {
            kind: 'visual',
            artifact: 'visual/evidence.json',
            sha256: createHash('sha256').update(receiptRaw).digest('hex'),
          },
          D2: { kind: 'reviewer', finding: 'd-1', role: 'designer' },
          D3: { kind: 'na', reason: 'copy is outside this visual producer fixture', source: 'S1' },
        },
      }),
    )
    await writeFile(
      ledger,
      chainedLedger(
        [
          JSON.stringify({ runId: 'r-001', exitCode: 0, signal: null, grade: 'exit-only' }),
          JSON.stringify({
            runId: 'visual-run-001',
            label: 'visual-qa',
            command: ['npx', 'playwright', 'test'],
            exitCode: 0,
            signal: null,
            grade: 'exit-only',
            oracleSha256: receipt.oracleSha256,
            worktreeSha256,
          }),
          '',
        ].join('\n'),
        receipt.oracleSha256,
      ),
    )
    return run('evidence', '--oracle', oracle, '--map', map, '--ledger', ledger, '--run', 'r-001', '--phase', 'review')
  }

  for (const [authorization, mutate] of [
    ['declined', async () => {}],
    [
      'approved',
      async (receipt) => {
        delete receipt.producerRun
      },
    ],
    [
      'approved',
      async (receipt) => {
        receipt.producerRun.tool = 'handwritten-browser-tool'
      },
    ],
    [
      'approved',
      async (receipt, artifact) => {
        await writeFile(join(dirname(artifact), 'proof.png'), 'dummy png bytes')
      },
    ],
    [
      'approved',
      async (receipt) => {
        receipt.rows.D1.journey.artifacts[0].sha256 = '0'.repeat(64)
        receipt.rows.D1.journey.artifacts[0].mediaType = 'image/jpeg'
      },
    ],
  ]) {
    const rejected = await verifyAttack(authorization, mutate)
    assert.equal(rejected.status, 1)
    assert.match(rejected.stderr, /^VISUAL_EVIDENCE_INVALID: |^EVIDENCE_/)
  }
})

test('O10: evidence rejects non-clean failed or signaled runs', async (t) => {
  const rows = {
    O1: { kind: 'test', name: 'save > pending 표시' },
    O2: { kind: 'na', reason: 'fixture exception', source: 'S1' },
    O3: { kind: 'na', reason: 'fixture exception', source: 'S1' },
  }
  for (const runRecord of [
    { ...JSON.parse(REPORTED_RUN), exitCode: 1, tests: [{ name: 'save > pending 표시', status: 'passed' }] },
    {
      ...JSON.parse(REPORTED_RUN),
      exitCode: null,
      signal: 'SIGTERM',
      tests: [{ name: 'save > pending 표시', status: 'passed' }],
    },
    {
      ...JSON.parse(REPORTED_RUN),
      tests: [
        { name: 'save > pending 표시', status: 'passed' },
        { name: 'other', status: 'failed' },
      ],
    },
    {
      ...JSON.parse(REPORTED_RUN),
      tests: [
        { name: 'save > pending 표시', status: 'passed' },
        { name: 'other', status: 'skipped' },
      ],
    },
  ]) {
    const args = await evidenceFixture(t, rows, { ledger: `${JSON.stringify(runRecord)}\n` })
    const rejected = run(...args)
    assert.equal(rejected.status, 1)
    assert.match(rejected.stderr, /^EVIDENCE_/)
  }
})

test('O15: review identity is bound to allowed roles and orchestration receipts', async (t) => {
  const unknownRole = await reviewFixture(t, [], {
    document: { reviewerRole: 'invented-reviewer', reviewerId: 'self-declared' },
  })
  const absentReceipt = await reviewFixture(t, [], {
    reviewerId: 'self-declared',
    document: { orchestrationReceipt: undefined },
  })
  const verify = (fixture, intersect) =>
    run(
      'review',
      '--file',
      fixture.findingsPath,
      ...(intersect ? ['--intersect', intersect] : []),
      '--oracle',
      fixture.oracle,
      '--packet',
      fixture.packetPath,
      '--revision',
      fixture.revision,
      '--map',
      fixture.map,
    )

  for (const fixture of [unknownRole, absentReceipt]) {
    const rejected = verify(fixture)
    assert.equal(rejected.status, 1)
    assert.match(rejected.stderr, /^REVIEWER_|^REVIEW_PACKET_INVALID: |^FINDINGS_INVALID: /)
  }

  const high = await reviewFixture(t, [], {
    reviewerId: 'high-sample-a',
    document: { sampleRisk: 'High' },
  })
  const secondPath = join(dirname(high.findingsPath), 'high-sample-b.json')
  const second = JSON.parse(await readFile(high.findingsPath, 'utf8'))
  second.reviewerId = 'high-sample-b'
  const secondOutput = { ...second }
  delete secondOutput.orchestrationReceipt
  second.orchestrationReceipt.outputSha256 = createHash('sha256').update(stableStringify(secondOutput)).digest('hex')
  await writeFile(secondPath, JSON.stringify(second))
  const duplicateReceipt = verify(high, secondPath)
  assert.equal(duplicateReceipt.status, 1)
  assert.match(duplicateReceipt.stderr, /^REVIEWER_/)
})

test('O17: visual rows require an approved authoritative Source Registry reference', async (t) => {
  const freeText = VALID_CARD.replace(
    '| D1  | P4   | copy | 버튼 문구는 "저장"이다 | 다른 문구 | S1   | HARD      |',
    '| D1  | P4   | copy | 버튼 문구는 "저장"이다 | 다른 문구 | handwritten baseline | HARD |',
  )
  const implementationOnly = VALID_CARD.replace(
    '| S1  | product-policy | 저장 정책 | PRD  | repo:docs/save.md#v3 | approved  |',
    '| S1  | implementation-reference | 저장 구현 | Code | repo:src/save.ts#v1 | draft |\n| S2 | product-policy | 저장 정책 | PRD | repo:docs/save.md#v3 | approved |',
  )
    .replaceAll('출처: S1', '출처: S2')
    .replace(
      '| D1  | P4   | copy | 버튼 문구는 "저장"이다 | 다른 문구 | S2   | HARD      |',
      '| D1  | P4   | copy | 버튼 문구는 "저장"이다 | 다른 문구 | S1 | HARD |',
    )
  const draftAuthority = VALID_CARD.replace(
    '| S1  | product-policy | 저장 정책 | PRD  | repo:docs/save.md#v3 | approved  |',
    '| S1  | product-policy | visual draft | PRD | repo:docs/visual.md#v1 | draft |\n| S2 | product-policy | 저장 정책 | PRD | repo:docs/save.md#v3 | approved |',
  )
    .replaceAll('출처: S1', '출처: S2')
    .replace(
      '| D1  | P4   | copy | 버튼 문구는 "저장"이다 | 다른 문구 | S2   | HARD      |',
      '| D1  | P4   | copy | 버튼 문구는 "저장"이다 | 다른 문구 | S1 | HARD |',
    )

  for (const card of [freeText, implementationOnly, draftAuthority]) {
    const rejected = run('card', '--oracle', await cardFile(t, card))
    assert.equal(rejected.status, 1)
    assert.match(rejected.stderr, /visual-source|source-unapproved|implementation-reference/)
  }
})

test('O18: evidence and review artifacts stay inside the Oracle directory with stable digests', async (t) => {
  const fixture = await reviewFixture(t, [])
  const outside = await directory(t)
  const externalMap = join(outside, 'evidence.json')
  const externalFindings = join(outside, 'findings.json')
  const externalPacket = join(outside, 'review-packet.json')
  await writeFile(externalMap, await readFile(fixture.map, 'utf8'))
  await writeFile(externalFindings, await readFile(fixture.findingsPath, 'utf8'))
  await writeFile(externalPacket, await readFile(fixture.packetPath, 'utf8'))

  const review = (file, packet, map) =>
    run(
      'review',
      '--file',
      file,
      '--oracle',
      fixture.oracle,
      '--packet',
      packet,
      '--revision',
      fixture.revision,
      '--map',
      map,
    )
  for (const [file, packet, map] of [
    [fixture.findingsPath, fixture.packetPath, externalMap],
    [externalFindings, fixture.packetPath, fixture.map],
    [fixture.findingsPath, externalPacket, fixture.map],
  ]) {
    const rejected = review(file, packet, map)
    assert.equal(rejected.status, 1)
    assert.match(rejected.stderr, /^REVIEW_|^EVIDENCE_|^FINDINGS_INVALID: /)
  }

  const mapAlias = join(dirname(fixture.map), 'map-alias.json')
  const mapHardlink = join(dirname(fixture.map), 'map-hardlink.json')
  await symlink(fixture.map, mapAlias)
  await link(fixture.map, mapHardlink)
  for (const alias of [mapAlias, mapHardlink]) {
    const rejected = review(fixture.findingsPath, fixture.packetPath, alias)
    assert.equal(rejected.status, 1)
    assert.match(rejected.stderr, /^REVIEW_|^EVIDENCE_|^FINDINGS_INVALID: /)
  }

  const base = await directory(t)
  const oracle = join(base, 'oracle.md')
  const map = join(base, 'evidence.json')
  const ledger = join(base, 'runs.jsonl')
  const artifact = join(base, 'receipt/evidence.json')
  const oracleSha256 = createHash('sha256').update(VISUAL_EVIDENCE_CARD).digest('hex')
  const media = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==',
    'base64',
  )
  const mediaSha256 = createHash('sha256').update(media).digest('hex')
  const worktreeSha256 = 'a'.repeat(64)
  const receipt = JSON.stringify({
    schemaVersion: 3,
    oracleSha256,
    producerRun: {
      runId: 'visual-run-001',
      tool: 'playwright',
      status: 'passed',
      worktreeSha256,
    },
    rows: {
      D1: {
        status: 'passed',
        journey: {
          status: 'passed',
          tool: 'playwright',
          scenario: 'stable receipt',
          checks: ['D1'],
          artifacts: [{ path: 'proof.png', sha256: mediaSha256, mediaType: 'image/png' }],
        },
      },
    },
  })
  await writeFile(oracle, VISUAL_EVIDENCE_CARD)
  await mkdir(dirname(artifact), { recursive: true })
  await writeFile(join(dirname(artifact), 'proof.png'), media)
  await writeFile(artifact, receipt)
  await writeFile(
    map,
    JSON.stringify({
      schemaVersion: 3,
      rows: {
        D1: {
          kind: 'visual',
          artifact: 'receipt/evidence.json',
          sha256: createHash('sha256').update(receipt).digest('hex'),
        },
        D2: { kind: 'reviewer', finding: 'd-1', role: 'designer' },
        D3: { kind: 'na', reason: 'fixture', source: 'S1' },
      },
    }),
  )
  await writeFile(
    ledger,
    chainedLedger(
      [
        JSON.stringify({ runId: 'r-001', exitCode: 0, signal: null, grade: 'exit-only' }),
        JSON.stringify({
          runId: 'visual-run-001',
          label: 'visual-qa',
          command: ['npx', 'playwright', 'test'],
          exitCode: 0,
          signal: null,
          grade: 'exit-only',
          oracleSha256,
          worktreeSha256,
        }),
        '',
      ].join('\n'),
      oracleSha256,
    ),
  )
  await writeFile(join(dirname(artifact), 'proof.png'), 'swapped nested artifact bytes')
  const nestedSwap = run('evidence', '--oracle', oracle, '--map', map, '--ledger', ledger, '--run', 'r-001')
  assert.equal(nestedSwap.status, 1)
  assert.match(nestedSwap.stderr, /^VISUAL_EVIDENCE_INVALID: |^EVIDENCE_/)

  await writeFile(join(dirname(artifact), 'proof.png'), media)
  await writeFile(artifact, receipt.replace('stable receipt', 'swapped receipt'))
  const receiptSwap = run('evidence', '--oracle', oracle, '--map', map, '--ledger', ledger, '--run', 'r-001')
  assert.equal(receiptSwap.status, 1)
  assert.match(receiptSwap.stderr, /^VISUAL_EVIDENCE_INVALID: |^EVIDENCE_/)
})
