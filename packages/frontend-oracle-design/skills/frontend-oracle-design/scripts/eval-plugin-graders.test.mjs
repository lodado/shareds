import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// Offline check of the `claude plugin eval` regex graders in evals/NN-*/graders/. Samples are final messages and
// card files recorded by earlier live runs (0.86.x–0.87.0), so a grader edit is checked without paying for a run.
const evalDirectory = fileURLToPath(new URL('../evals/', import.meta.url))
const sampleDirectory = fileURLToPath(new URL('../../../test-fixtures/plugin-eval-samples/', import.meta.url))
const caseDirectories = readdirSync(evalDirectory).filter((name) => /^\d\d-/.test(name))

function readGrader(caseName, graderName) {
  const text = readFileSync(join(evalDirectory, caseName, 'graders', `${graderName}.md`), 'utf8')
  const [, frontmatter, body] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  const field = (key) => frontmatter.match(new RegExp(`^${key}: (.*)$`, 'm'))?.[1]
  return { type: field('type'), match: field('match') ?? 'contains', flags: field('flags') ?? '', pattern: body.trim() }
}

// Same semantics as the CLI's regex grader: one RegExp over the target text, then contains / not_contains / count:N.
function grade({ pattern, flags, match }, text) {
  if (match === 'contains') return new RegExp(pattern, flags).test(text)
  if (match === 'not_contains') return !new RegExp(pattern, flags).test(text)
  const count = text.match(new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`))?.length ?? 0
  return count === Number(match.slice('count:'.length))
}

const sample = (name) => readFileSync(join(sampleDirectory, `${name}.txt`), 'utf8')

function expectGrades(caseName, sampleName, expected) {
  const text = sample(sampleName)
  const actual = Object.fromEntries(Object.keys(expected).map((name) => [name, grade(readGrader(caseName, name), text)]))
  assert.deepEqual(actual, expected, `${caseName} graders on ${sampleName}`)
}

test('every regex grader compiles and same-named graders share one pattern across cases', () => {
  const graders = caseDirectories.flatMap((caseName) =>
    readdirSync(join(evalDirectory, caseName, 'graders')).map((file) => ({
      at: `${caseName}/${file}`,
      file,
      ...readGrader(caseName, file.replace(/\.md$/, '')),
    })),
  )
  const patterns = new Map()
  for (const { at, file, pattern, flags } of graders.filter(({ type }) => type === 'regex')) {
    assert.doesNotThrow(() => new RegExp(pattern, flags), at)
    // lane-header's risk level differs per case by design.
    if (file !== 'lane-header.md') assert.equal(pattern, patterns.get(file) ?? pattern, `${at} drifted`)
    patterns.set(file, pattern)
  }
})

test('known-good one-shot Drafts pass every mechanical grader', () => {
  expectGrades('04-double-charge-bug', '04-it3-last', {
    'contract-rows-complete': true,
    'rows-cite-source': true,
    'open-questions-recommend': true,
    'case-space-swept': true,
    'single-confirmation': true,
    'repeat-activation-boundaries': true,
    'unknown-outcome-question': true,
    'no-self-approval': true,
  })
  expectGrades('05-age-gate-conflict', '05-it3-last', {
    'contract-rows-complete': true,
    'rows-cite-source': true,
    'open-questions-recommend': true,
    'case-space-swept': true,
    'single-confirmation': true,
    'age-options-one-question': true,
    'needs-decision': true,
    'no-self-approval': true,
  })
})

test('a BLOCKED reply without a Draft fails the Draft graders', () => {
  expectGrades('04-double-charge-bug', '04-trig-last', {
    'contract-rows-complete': false,
    'open-questions-recommend': false,
    'case-space-swept': false,
    'single-confirmation': false,
    'repeat-activation-boundaries': false,
    'unknown-outcome-question': false,
  })
})

test('bare side-effect counts, a source-less unknown-outcome row and a repo-path ask fail', () => {
  // R1 carries "1" instead of kind×count; R5 settles the timeout case with no Q; Q6 asks for the repository path.
  expectGrades('04-double-charge-bug', '04-it1-last', {
    'contract-rows-complete': false,
    'rows-cite-source': false,
    'open-questions-recommend': false,
    'case-space-swept': false,
    'single-confirmation': false,
    'repeat-activation-boundaries': true,
    'unknown-outcome-question': false,
  })
})

test('an age row without a Q source and a document-location ask fail 05', () => {
  // R1 "| — | 1 order request |": empty Never, no kind×count, no source; the reply also asks for the PRD and memo locations.
  expectGrades('05-age-gate-conflict', '05-it1-last', {
    'contract-rows-complete': false,
    'rows-cite-source': false,
    'open-questions-recommend': true,
    'single-confirmation': false,
    'age-options-one-question': false,
  })
})

test('03 card file: planned race verification passes, unswept dimensions fail', () => {
  expectGrades('03-tenant-cache-race', '03-it2-card', {
    'contract-rows-complete': false,
    'rows-cite-source': true,
    'open-questions-recommend': true,
    'case-space-swept': false,
    'race-dimensions': false,
    'race-verification-plan': true,
  })
  expectGrades('03-tenant-cache-race', '03-it1-last', { 'single-confirmation': true })
  expectGrades('03-tenant-cache-race', '03-trig-last', { 'single-confirmation': false })
})

test('negative cases: direct answers pass, Oracle ceremony fails', () => {
  expectGrades('06-neg-copy-label', '06-trig-last', { 'answers-label': true, 'no-oracle-ceremony': true })
  expectGrades('07-neg-fsd-advice', '07-d-last', { 'names-one-layer': true, 'no-oracle-ceremony': true })
  const ceremony = 'risk=Low lane=oracle nodes=[common]\n## Open questions\n- Q1 (a) ★ entities (b) features'
  assert.equal(grade(readGrader('07-neg-fsd-advice', 'no-oracle-ceremony'), ceremony), false)
  assert.equal(grade(readGrader('07-neg-fsd-advice', 'names-one-layer'), 'entities or features, depending on use.'), false)
  assert.equal(grade(readGrader('06-neg-copy-label', 'answers-label'), "'저장'으로 바꾸기 전에 승인해 주시겠어요?"), false)
})

// 0.87.1 live run (Sonnet, 2026-10-05): the failures below are skill output, not grader misfires.
test('0.87.1 live outputs: registry rows are not contract rows; uncounted effects and location asks fail', () => {
  // Card: Source Registry row `| O1 | observation | … |` is ignored; R9 has `—` effects, R11/R12 effects lack kind×count.
  expectGrades('03-tenant-cache-race', '03-live-card', {
    'contract-rows-complete': false,
    'rows-cite-source': true,
    'open-questions-recommend': true,
    'case-space-swept': true,
    'race-dimensions': true,
    'race-verification-plan': true,
  })
  // "POST 합계 1" and an effects cell of "Q2"; the reply asks for the repository path before work can start.
  expectGrades('04-double-charge-bug', '04-live-last', {
    'contract-rows-complete': false,
    'rows-cite-source': true,
    'open-questions-recommend': true,
    'case-space-swept': true,
    'single-confirmation': false,
    'repeat-activation-boundaries': true,
    'unknown-outcome-question': true,
  })
  // R7 "POST≤1" is not an exact count; Q7 asks where the PRD and memo are, with no options; "Point me to the repo".
  expectGrades('05-age-gate-conflict', '05-live-last', {
    'contract-rows-complete': false,
    'rows-cite-source': true,
    'open-questions-recommend': false,
    'case-space-swept': true,
    'single-confirmation': false,
    'age-options-one-question': true,
  })
})

test('no-self-approval catches a self-issued terminal status', () => {
  const grader = readGrader('01-virtual-grid', 'no-self-approval')
  assert.equal(grade(grader, 'Draft below.\nStatus: ORACLE_READY'), false)
  assert.equal(grade(grader, 'Status: NEEDS_DECISION — Draft awaits one confirmation'), true)
})

// No live run ever wrote the 01/02 cards, so these graders are checked on minimal hand-written shapes.
test('01 escape graders need the filter-switch question and all three runtime mechanisms', () => {
  const filter = readGrader('01-virtual-grid', 'filter-switch-question')
  const escapes = readGrader('01-virtual-grid', 'named-runtime-escapes')
  const question = '## Open questions\n- **Q2. 필터 전환 중 화면**\n  - (a) ★ 이전 목록 유지\n  - (b) Suspense fallback(스켈레톤)\n'
  const mechanisms = [
    '- StrictMode 이중 실행에서 cleanup이 append 타이머와 pending 플래그를 함께 되돌린다',
    '- filterKey 리마운트 시 useWindowVirtualizer의 initialOffset 스크롤 리셋',
    '- ResizeObserver 첫 측정 전에 기본 4열로 렌더된 뒤 실제 열 수로 바뀌는 점프',
  ]
  assert.equal(grade(filter, question), true)
  assert.equal(grade(filter, '- R3 | 필터 전환 | 이전 목록 유지 | S1'), false)
  assert.equal(grade(escapes, mechanisms.join('\n')), true)
  assert.equal(grade(escapes, mechanisms.slice(0, 2).join('\n')), false)
  assert.equal(grade(escapes, '- StrictMode\n- scroll\n- ResizeObserver'), false)
})

test('02 query-owns-lifecycle rejects a union that restates the query lifecycle', () => {
  const grader = readGrader('02-cursor-orders', 'query-owns-lifecycle')
  const axes = 'Inputs: status, isFetching, error, row count (data.length), filterApplied. queryKey: [orders, filter, cursor].\n'
  assert.equal(grade(grader, axes), true)
  assert.equal(grade(grader, `${axes}type View = 'firstLoad' | 'paging' | 'pageError' | 'ready'\n`), false)
  assert.equal(grade(grader, 'Inputs: status, error, row count. queryKey: [orders, cursor].'), false)
})

// 0.87.2 live runs (Sonnet, 2026-10-05) after exact counts, quoted S1 and the no-location-ask rule.
test('0.87.2 live Drafts pass every mechanical grader', () => {
  const draft = {
    'contract-rows-complete': true,
    'rows-cite-source': true,
    'open-questions-recommend': true,
    'case-space-swept': true,
    'single-confirmation': true,
  }
  expectGrades('04-double-charge-bug', '04-v2-last', {
    ...draft,
    'repeat-activation-boundaries': true,
    'unknown-outcome-question': true,
  })
  expectGrades('05-age-gate-conflict', '05-v2-last', { ...draft, 'age-options-one-question': true, 'needs-decision': true })
  // Card: the case space wraps onto a second line and Q lines contain "(b)" options.
  const { 'single-confirmation': _, ...card } = draft
  expectGrades('03-tenant-cache-race', '03-v2-card', { ...card, 'race-dimensions': true, 'race-verification-plan': true })
})

test('0.87.2 live: a Q that asks for document paths fails the option and confirmation graders', () => {
  // Q6 "Where the PRD and memo live. Give me paths" has no (b) or ★, and the 18/19 rows cite S1 alone.
  expectGrades('05-age-gate-conflict', '05-v2-docask-last', {
    'open-questions-recommend': false,
    'single-confirmation': false,
    'age-options-one-question': false,
  })
})

test('Q-number grammar: an option label like "Q4)" is not a new question block', () => {
  const grader = readGrader('03-tenant-cache-race', 'open-questions-recommend')
  const card = '## Open questions\n- Q1 Late response: (a) ★ keep (b) discard\n'
  assert.equal(grade(grader, card), true)
  assert.equal(grade(grader, `   behaviour depends on (\nQ4) and never renders\n${card}`), true)
  assert.equal(grade(grader, `${card}- Q2 Where is the PRD?\n`), false)
})

test('03 race-dimensions needs the four axes and an impossible or needs-decision cell', () => {
  const grader = readGrader('03-tenant-cache-race', 'race-dimensions')
  const space = 'Case space: Tenant{A,B,switch} × Data{none, cache hit, placeholder} × Async{idle, pending, settled} × Order{A→B, B→A}\n'
  assert.equal(grade(grader, `${space}- none × settled → impossible: a settled request always leaves data\n`), true)
  assert.equal(grade(grader, `${space}- pending × A→B → covered(R4)\n`), false)
})
