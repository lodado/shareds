import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { canonicalTuple, enumerateStateModel, frameId, generateCaseFrames, generateFromDocument, MAX_STATE_PATHS, parseCaseSpace } from './oracle-frames.mjs'

const script = join(dirname(fileURLToPath(import.meta.url)), 'oracle-frames.mjs')

const FULL_PRODUCT_CARD = `## Case space

- Coverage: full-product

\`\`\`json
{"dimensionSources":{"rows":"C-rows","mode":"C-mode"},"boundaries":[{"id":"next","kind":"async","source":"C-next"}],"applicability":[{"boundary":"next","candidate":"repeat","source":"C-next","dimensionId":"mode"}],"constraints":[]}
\`\`\`

| Family | Dimension | Choices |
| ------ | --------- | ------- |
| Data | rows | first, last |
| Async | mode | idle, pending, done |
`

const fullProduct = () => generateFromDocument(FULL_PRODUCT_CARD)

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

test('parseCaseSpace preserves literal marker text and trims whitespace only before terminal error markers', () => {
  const longChoice = `${'x'.repeat(4096)}${' '.repeat(4096)}suffix`
  const choices = `unicode\u00A0\t[error], literal[error]suffix, plain, ${longChoice}`
  const card = SERVER_TABLE_CARD.replace('empty, min, unicode [error]', choices)
  const values = parseCaseSpace(card).families.find((entry) => entry.family === 'Value').choices
  assert.deepEqual(values.slice(0, 3), [
    { value: 'unicode', error: true },
    { value: 'literal[error]suffix', error: false },
    { value: 'plain', error: false },
  ])
  assert.equal(values[3].value, longChoice)
  assert.equal(values[3].error, false)
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

const PAIRWISE_CARD = `## Case space

- Strength: 2

| Family | Dimension | Choices                 |
| ------ | --------- | ----------------------- |
| Data   | rows      | 0, max                  |
| Async  | request   | success, http-5xx       |
| Entry  | —         | excluded: fixture scope |
`

test('parseCaseSpace: 불완전한 선언은 조용히 강등하지 않고 거절한다', () => {
  const code = (card) => {
    try {
      parseCaseSpace(card)
      return 'ok'
    } catch (error) {
      return error.code
    }
  }
  assert.equal(code(PAIRWISE_CARD), 'ok')
  for (const strength of ['abc', '0', '-1', '2.5', '']) {
    assert.equal(code(PAIRWISE_CARD.replace('- Strength: 2', `- Strength: ${strength}`)), 'CASE_SPACE_STRENGTH', strength)
  }
  assert.equal(code(PAIRWISE_CARD.replace('| 0, max                  |', '|                         |')), 'CASE_SPACE_INCOMPLETE')
  assert.equal(code(PAIRWISE_CARD.replace('excluded: fixture scope', 'excluded:')), 'CASE_SPACE_INCOMPLETE')
  assert.equal(code(PAIRWISE_CARD.replace('| Async  | request   |', '| Async  | rows      |')), 'CASE_SPACE_ID')
  assert.equal(code(PAIRWISE_CARD.replace('0, max', '0, 0')), 'CASE_SPACE_ID')
  assert.equal(code(PAIRWISE_CARD.replace('| Data   | rows      |', '| Data   | —         |')), 'CASE_SPACE_ID')
})

test('F* ID는 위치 기반이다 — 선택지 순서만 바꿔도 같은 ID가 다른 조합을 가리킨다', () => {
  const before = generateFromDocument(PAIRWISE_CARD)
  const reordered = generateFromDocument(PAIRWISE_CARD.replace('0, max', 'max, 0'))
  assert.deepEqual(reordered.frames.map((frame) => frame.id), before.frames.map((frame) => frame.id))
  assert.notDeepEqual(reordered.frames.map((frame) => frame.label), before.frames.map((frame) => frame.label))
})

test('CLI: 카드 Label 열에 옮겨 적을 라벨을 ID 뒤에 그대로 출력한다', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'oracle-frames-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const oracle = join(directory, 'oracle.md')
  await writeFile(oracle, PAIRWISE_CARD)
  const result = spawnSync(process.execPath, [script, '--oracle', oracle], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const [first] = generateFromDocument(PAIRWISE_CARD).frames
  assert.equal(result.stdout.split('\n')[0], `${first.id} ${first.label}`)
})

test('enumerateStateModel: 단순 경로가 상한을 넘으면 상한+1에서 멈춘다', () => {
  const states = ['s0', 's1', 's2', 's3', 's4', 's5']
  const transitions = states.flatMap((from) => states.filter((to) => to !== from).map((to) => `| ${from} | GO_${to} | ${to} | O1 |`))
  const card = `## State Model

- States: ${states.join(', ')}
- Events: ${states.map((state) => `GO_${state}`).join(', ')}

| From | Event | To | 행 |
| ---- | ----- | -- | -- |
${transitions.join('\n')}
`
  const { paths } = enumerateStateModel(card)
  assert.equal(paths.length, MAX_STATE_PATHS + 1)
  assert.equal(enumerateStateModel(SERVER_TABLE_CARD).paths.length, 2)
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

test('full-product: parses metadata and emits every raw tuple with deterministic IDs', () => {
  const generated = fullProduct()
  assert.equal(generated.caseSpace.coverage, 'full-product')
  assert.equal(generated.caseSpace.metadata.dimensionSources.rows, 'C-rows')
  assert.equal(generated.rawCount, 6)
  assert.equal(generated.frames.length, 6)
  assert.deepEqual(generated.errorFrames, [])
  assert.ok(generated.frames.every((frame) => frame.tuple && frame.id.startsWith('F')))
  assert.equal(new Set(generated.frames.map((frame) => frame.id)).size, 6)
  assert.equal(generated.frames[0].id, frameId(generated.frames[0].tuple, generated.dimensionRevision, generated.constraintRevision))
  assert.equal(canonicalTuple(generated.frames[0].tuple), canonicalTuple(generated.frames[0].tuple))
})

test('full-product: rejects duplicate or empty stable IDs and malformed metadata', () => {
  assert.throws(() => generateFromDocument(FULL_PRODUCT_CARD.replace('| Data | rows |', '| Data | rows |').replace('first, last', 'first, first')), /duplicate/i)
  assert.throws(() => generateFromDocument(FULL_PRODUCT_CARD.replace('"C-rows"', '"C-rows"}')), /CASE_SPACE_METADATA|metadata/i)
  assert.throws(() => generateFromDocument(FULL_PRODUCT_CARD.replace('rows | first', 'rows with space | first')), /stable|ASCII|ID/i)
  assert.throws(() => generateFromDocument(FULL_PRODUCT_CARD.replace('first, last', 'first,,last')), /Empty choice/)
  assert.throws(() => generateFromDocument(FULL_PRODUCT_CARD.replace('| Data | rows |', '| Data | |')), /stable ID/)
})

test('full-product: canonical IDs ignore tuple key order, revisions bind values, constraints and event metadata', () => {
  assert.equal(canonicalTuple({ a: '1', b: '2' }), canonicalTuple({ b: '2', a: '1' }))
  const before = fullProduct()
  const changedValue = generateFromDocument(FULL_PRODUCT_CARD.replace('first, last', 'first, other'))
  assert.notEqual(before.dimensionRevision, changedValue.dimensionRevision)
  const changedConstraint = generateFromDocument(FULL_PRODUCT_CARD.replace('"constraints":[]', '"constraints":[{"id":"C1","when":{"rows":"first"}}]'))
  assert.notEqual(before.constraintRevision, changedConstraint.constraintRevision)
  const changedMetadata = generateFromDocument(FULL_PRODUCT_CARD.replace('"constraints":[]', '"constraints":[],"sequences":{"mode":{"idle":["start:next:A","complete:A"]}}'))
  assert.notEqual(before.dimensionRevision, changedMetadata.dimensionRevision)
  assert.notEqual(before.frames[0].id, changedMetadata.frames[0].id)
})

test('full-product: refuses oversized products instead of sampling', () => {
  const values = Array.from({ length: 317 }, (_, index) => `v${index}`).join(', ')
  const huge = FULL_PRODUCT_CARD.replace('first, last', values).replace('idle, pending, done', values)
  assert.throws(() => generateFromDocument(huge), (error) => error.code === 'CASE_SPACE_INCOMPLETE')
})
