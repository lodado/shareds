import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { enumerateStateModel, generateCaseFrames, generateFromDocument, parseCaseSpace } from './oracle-frames.mjs'

/** 플랜 §5 서버 페이지네이션 dry-run 공간 — 일반 도메인. */
const SERVER_TABLE_CARD = `# Card

## Case space

- Strength: 2

| Family      | Dimension    | Choices                               |
| ----------- | ------------ | ------------------------------------- |
| Data        | rows         | 0, 1, pageSize, pageSize+1, max       |
| Value       | keyword      | empty, min, unicode [error]           |
| Async       | list request | success, http-5xx [error]             |
| Order       | filter/page  | sequential, inverted                  |
| Entry       | entry        | fresh, refresh, back-forward          |
| Environment | viewport     | 320, desktop                          |
| Platform    | —            | excluded: single-engine scope per S1  |
| Inherited   | —            | excluded: first revision, no prior P* |

## State Model

- States: idle, fetching, error
- Events: PAGE_CHANGE, RESPONSE_OK, RESPONSE_ERROR, RETRY

| From     | Event          | To       | 행 |
| -------- | -------------- | -------- | -- |
| idle     | PAGE_CHANGE    | fetching | O1 |
| fetching | RESPONSE_OK    | idle     | O2 |
| fetching | RESPONSE_ERROR | error    | O3 |
| error    | RETRY          | fetching | O4 |
`

test('parseCaseSpace: strength·excluded·[error] 주석을 읽는다', () => {
  const caseSpace = parseCaseSpace(SERVER_TABLE_CARD)

  assert.equal(caseSpace.strength, 2)
  assert.equal(caseSpace.families.length, 8)
  const platform = caseSpace.families.find((entry) => entry.family === 'Platform')
  assert.equal(platform.excluded, 'single-engine scope per S1')
  const keyword = caseSpace.families.find((entry) => entry.family === 'Value')
  assert.deepEqual(keyword.choices.at(-1), { value: 'unicode', error: true })
})

test('generateCaseFrames: pairwise가 전 곱을 대폭 줄이면서 모든 2-tuple을 덮는다', () => {
  const caseSpace = parseCaseSpace(SERVER_TABLE_CARD)

  const { frames, errorFrames } = generateCaseFrames(caseSpace)

  // 전 곱(오류 제외) 5×2×1×2×3×2 = 120 대비 대폭 절감, [error] 2건은 단독 프레임.
  assert.ok(frames.length >= 15 && frames.length <= 40, `frames=${frames.length}`)
  assert.equal(errorFrames.length, 2)
  assert.match(errorFrames[0].label, /^\[error\] keyword=unicode$/)

  // 모든 2-way tuple 커버 검증 — 완전성이 이 생성기의 존재 이유다.
  const dimensions = caseSpace.families
    .filter((entry) => !entry.excluded && entry.dimension)
    .map((entry) => ({ dimension: entry.dimension, choices: entry.choices.filter((choice) => !choice.error).map((choice) => choice.value) }))
    .filter((entry) => entry.choices.length > 0)
  const assignments = frames.map((frame) => new Map(frame.label.split(' × ').map((part) => part.split('=')).map(([key, value]) => [key, value])))
  for (let first = 0; first < dimensions.length; first += 1) {
    for (let second = first + 1; second < dimensions.length; second += 1) {
      for (const firstChoice of dimensions[first].choices) {
        for (const secondChoice of dimensions[second].choices) {
          const hit = assignments.some(
            (frame) => frame.get(dimensions[first].dimension) === firstChoice && frame.get(dimensions[second].dimension) === secondChoice,
          )
          assert.ok(hit, `uncovered: ${dimensions[first].dimension}=${firstChoice} × ${dimensions[second].dimension}=${secondChoice}`)
        }
      }
    }
  }

  // 플랜 수용 기준: back-forward × pending류 교차가 실제로 생성 목록에 나타난다.
  assert.ok(assignments.some((frame) => frame.get('entry') === 'back-forward' && frame.get('filter/page') === 'inverted'))
})

test('generateCaseFrames: 결정적이다 — 같은 입력은 같은 ID·라벨', () => {
  const caseSpace = parseCaseSpace(SERVER_TABLE_CARD)

  const first = generateCaseFrames(caseSpace)
  const second = generateCaseFrames(caseSpace)

  assert.deepEqual(first, second)
})

test('enumerateStateModel: maximal simple path와 빈 셀을 열거한다', () => {
  const { paths, emptyCells } = enumerateStateModel(SERVER_TABLE_CARD)

  // idle→fetching→idle(재방문 금지로 종료)과 idle→fetching→error→(RETRY는 fetching 재방문이라 중단)
  assert.equal(paths.length, 2)
  assert.match(paths[0].label, /^idle -PAGE_CHANGE-> fetching/)
  // 3 states × 4 events = 12 − 정의 4 = 8 빈 셀 — 전부 판정 대상이다.
  assert.equal(emptyCells.length, 8)
  assert.ok(emptyCells.some((cell) => cell.id === 'EMPTY fetching × PAGE_CHANGE'))
})

test('generateFromDocument: Case space 없는 카드는 null — 기존 카드 하위 호환', () => {
  assert.equal(generateFromDocument('# Card\n\n## Outcome Brief\n'), null)
})

test('strength가 차원 수보다 크면 1-way로 강등된다', () => {
  const single = parseCaseSpace(`## Case space

- Strength: 3

| Family | Dimension | Choices |
| ------ | --------- | ------- |
| Data   | rows      | 0, max  |
`)

  const { frames } = generateCaseFrames(single)

  assert.equal(frames.length, 2)
  assert.deepEqual(
    frames.map((frame) => frame.label),
    ['rows=0', 'rows=max'],
  )
})

/** Touches 채택 카드 — 직접 공유 쌍만 조합, 파트너 없음·independent는 1-way. */
const TOUCHES_CARD = `## Case space

- Strength: 2

| Family      | Dimension | Choices                      | Touches                        |
| ----------- | --------- | ---------------------------- | ------------------------------ |
| Data        | rows      | 0, 1, max                    | P1, I1                         |
| Value       | keyword   | empty, min                   | P1                             |
| Entry       | entry     | fresh, refresh               | P5                             |
| Environment | viewport  | 320, desktop                 | I1                             |
| Platform    | browser   | chromium, webkit             | independent: engine cannot alter request policy |
`

test('touches: 직접 공유 쌍만 조합 의무가 되고 라벨은 성분 차원만 싣는다', () => {
  const caseSpace = parseCaseSpace(TOUCHES_CARD)
  const { frames } = generateCaseFrames(caseSpace)
  const labels = frames.map((frame) => frame.label)

  // rows×keyword(P1)·rows×viewport(I1)만 쌍 의무 — keyword×viewport 쌍은 요구되지 않는다.
  const assignments = frames
    .filter((frame) => frame.label.includes(' × '))
    .map((frame) => new Map(frame.label.split(' × ').map((part) => part.split('=')).map(([key, value]) => [key, value])))
  for (const rows of ['0', '1', 'max']) {
    for (const keyword of ['empty', 'min']) {
      assert.ok(assignments.some((frame) => frame.get('rows') === rows && frame.get('keyword') === keyword), `rows=${rows} × keyword=${keyword}`)
    }
    for (const viewport of ['320', 'desktop']) {
      assert.ok(assignments.some((frame) => frame.get('rows') === rows && frame.get('viewport') === viewport), `rows=${rows} × viewport=${viewport}`)
    }
  }

  // 조합 프레임은 성분(rows·keyword·viewport) 차원만 싣는다 — entry·browser는 라벨에 없다.
  for (const frame of assignments) {
    assert.ok(!frame.has('entry') && !frame.has('browser'))
  }

  // 파트너 없는 entry(P5 단독)와 independent browser는 choice당 1-way.
  assert.ok(labels.includes('entry=fresh') && labels.includes('entry=refresh'))
  assert.ok(labels.includes('browser=chromium') && labels.includes('browser=webkit'))

  // 전 쌍 pairwise(3×2×2×2×2 공간의 커버링 ≥ 12프레임 상당)보다 작다 — 6 조합 + 4 1-way.
  assert.ok(frames.length <= 10, `frames=${frames.length}`)
})

test('touches: 결정적이고, 열이 없으면 기존 전-쌍 동작 그대로다', () => {
  const withTouches = parseCaseSpace(TOUCHES_CARD)
  assert.deepEqual(generateCaseFrames(withTouches), generateCaseFrames(parseCaseSpace(TOUCHES_CARD)))

  const legacy = parseCaseSpace(TOUCHES_CARD.replace(/\|[^|\n]*\|$/gm, '|').replace(' Touches                        |', '').replace(' independent: engine cannot alter request policy |', ''))
  assert.equal(legacy.families.every((entry) => entry.touches === null), true)
})
