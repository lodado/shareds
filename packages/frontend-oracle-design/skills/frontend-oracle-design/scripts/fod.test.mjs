import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { blockingReason, STALE_MS } from './fod-guard-hook.mjs'
import { checkSpec } from './fod-spec.mjs'
import {
  approve,
  axisNames,
  check,
  drop,
  failingTests,
  gen,
  init,
  judge,
  missingPackages,
  prove,
  rulesWithLaws,
  runPhase,
  shellQuote,
  status,
  suiteNames,
} from './fod.mjs'
import { installedBend } from './oracle-test-bend.mjs'

const PACKAGE = fileURLToPath(new URL('../../../', import.meta.url))
const STALE_SEARCH = join(PACKAGE, 'test-fixtures', 'stale-search')
const codes = (result) => result.findings.map(({ code }) => code)

// stale-search 모델을 쓰는 완성된 SPEC. 규칙 id는 LAWS.bend 주석(# R1·R2·R3)과 맞춘다.
const SPEC = `# 검색 결과 순서

## 목표

검색어를 연달아 바꿔도 마지막 요청의 결과만 보인다.

## 출처

- S1: "이전 검색어의 결과가 늦게 와서 화면을 덮어쓴다" (티켓)
- C1: search/search-reducer.mts:4 — 응답을 요청 id와 비교하지 않는다

## 규칙

- R1: 요청을 보내면 그 요청이 최신이 되고, 보이는 결과는 그대로다 (S1)
- R2: 최신이 아닌 요청의 응답이 오면 화면은 바뀌지 않는다 (S1, C1)
- R3: 최신 요청의 응답이 오면 그 결과가 보인다 (S1)

## 7축

| 축 | 값·경계 | 모델에서 | 출처 |
| --- | --- | --- | --- |
| Data | 결과 없음(0) · 요청 1·2·3개 | \`Search.shown\` | S1 |
| Value | 요청 id 1..bound | \`Search.latest\`, \`Respond\` | S1 |
| Async | 응답 대기 · 도착 | \`Issue\`, \`Respond\` | S1 |
| Order | 응답이 요청 순서와 다르게 도착 | \`Env.pending\` | S1 |
| Entry | N/A — 어떻게 들어와도 시작 상태는 결과 없음 하나다 | - | S1 |
| Environment | N/A — 권한·세션과 무관한 로컬 상태 | - | S1 |
| Platform | N/A — 브라우저 차이 없는 순수 상태 전이 | - | S1 |

## 이어받는 규칙

- 없음

## 범위 밖

- 검색 결과 렌더링 모양

## 질문

- 없음

## 모델

- model: \`search/MODEL.bend\`
- prefix: Search
- bound: 4
- runs: 20
- adapter: \`search/search.adapter.mjs\`
- out: \`search/generated\`
- product: \`search/search-reducer.mts\`
- test: \`node --test "search/generated/*.test.mjs"\`
`

const BUGGY = `export const initialSearch = { latestRequestId: 0, results: null }
export function reduceSearch(state, event) {
  if (event.type === 'issue') return { ...state, latestRequestId: state.latestRequestId + 1 }
  return { ...state, results: { requestId: event.requestId, items: event.items } }
}
`

const FIXED = `export const initialSearch = { latestRequestId: 0, results: null }
export function reduceSearch(state, event) {
  if (event.type === 'issue') return { ...state, latestRequestId: state.latestRequestId + 1 }
  if (event.requestId !== state.latestRequestId) return state
  return { ...state, results: { requestId: event.requestId, items: event.items } }
}
`

/** 임시 저장소: stale-search 모델 + 결함 있는 제품 + fast-check 링크. 법칙 주석은 P* → R*로 바꾼다. */
async function repo(t) {
  const root = await mkdtemp(join(tmpdir(), 'fod-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dir = join(root, 'search')
  await mkdir(dir, { recursive: true })
  for (const name of ['MODEL.bend', 'PROOF.bend', 'search.adapter.mjs']) await cp(join(STALE_SEARCH, name), join(dir, name))
  const laws = await readFile(join(STALE_SEARCH, 'LAWS.bend'), 'utf8')
  await writeFile(join(dir, 'LAWS.bend'), laws.replaceAll('# P1', '# R1').replaceAll('# P2', '# R2').replaceAll('# P3', '# R3'))
  await writeFile(join(dir, 'search-reducer.mts'), BUGGY)
  await mkdir(join(root, 'node_modules'))
  await symlink(join(PACKAGE, 'node_modules', 'fast-check'), join(root, 'node_modules', 'fast-check'))
  await mkdir(join(root, '.ai', 'oracles', 'search'), { recursive: true })
  await writeFile(join(root, '.ai', 'oracles', 'search', 'SPEC.md'), SPEC)
  return root
}

/** SPEC 일부를 바꾼다. 찾는 글이 없으면 실패한다 — 조용히 그대로 두면 테스트가 바꾸지 않은 SPEC을 검사한다. */
function edit(text, ...pairs) {
  return pairs.reduce((out, [from, to]) => {
    assert.ok(out.includes(from), `SPEC에 없는 글: ${from}`)
    return out.replace(from, to)
  }, text)
}

test('check reports every problem of a SPEC in one pass, each with a fix', () => {
  const broken = edit(SPEC,
    ['| Order | 응답이 요청 순서와 다르게 도착 | `Env.pending` | S1 |\n', ''],
    ['| Environment | N/A — 권한·세션과 무관한 로컬 상태 | - | S1 |', '| Environment | 미정 | - | S1 |'],
    ['그 결과가 보인다 (S1)', '그 결과가 적절히 보인다'],
    ['- bound: 4\n', ''],
    ['## 범위 밖', '## 범위 밖\n\n- <바뀌지 않는 화면>'])
  const { findings } = checkSpec(broken)
  assert.deepEqual(findings.map(({ code }) => code).sort(), [
    'SPEC_AXIS_MISSING',
    'SPEC_AXIS_UNDECIDED',
    'SPEC_MODEL_KEY_MISSING',
    'SPEC_PLACEHOLDER',
    'SPEC_RULE_NO_SOURCE',
    'SPEC_RULE_VAGUE',
  ])
  assert.ok(findings.every(({ fix }) => fix.length > 0))
  assert.deepEqual(checkSpec(SPEC).findings, [])
})

test('model keys the generator needs as numbers or names are checked before any Bend runs', () => {
  const invalid = (...lines) => checkSpec(edit(SPEC, ['- runs: 20\n', lines.join('')])).findings.map(({ message }) => message)
  assert.deepEqual(invalid('- runs: 0\n'), ['runs "0"가 양의 정수가 아니다'])
  assert.deepEqual(invalid('- runner: jest\n'), ['runner "jest"를 모른다'])
  assert.equal(invalid('- environment: jsdom\n').length, 1, 'environment without vitest')
  assert.deepEqual(invalid('- runner: vitest\n', '- environment: jsdom\n'), [])
})

test('the template has every section and fails only on its placeholders', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'fod-init-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  assert.deepEqual(codes(init({ root, id: 'pay' })), [])
  assert.deepEqual(codes(init({ root, id: 'pay' })), ['SPEC_EXISTS'])
  assert.deepEqual([...new Set(codes(check({ root, id: 'pay' })))], ['SPEC_PLACEHOLDER'])
  assert.equal(status({ root, id: 'pay' }).step, 1)
  assert.throws(() => init({ root, id: '../x' }), /소문자/)
})

test('a law says which rules it states by its name or the comment above it', () => {
  const laws = '# R1, R3: both\nlaw both:\n  x\n\nlaw r2_named:\n  y\n\n# P4: old style\nlaw other:\n  z\n'
  assert.deepEqual([...rulesWithLaws(laws)].sort(), ['R1', 'R2', 'R3'])
})

test('failing test names come from node --test, vitest and TAP output', () => {
  const output = '✔ ok one\n✖ [MODEL] [T1] Issue · Respond (3ms)\n× vitest case\nnot ok 3 - tap case\n✖ failing tests:\n'
  assert.deepEqual(failingTests(output), ['✖ [MODEL] [T1] Issue · Respond (3ms)', '× vitest case', 'not ok 3 - tap case'])
})

// 판정 범위: 승인이 제품 파일로 고정한 glob
const SCOPE = { root: '/p', globs: ['src/**'] }
const judged = (phase, output, exit = 1) => judge(phase, 'npm test', { exit, output, failing: failingTests(output), tail: output }, SCOPE).map(({ code }) => code)

test('a generated test file that cannot load its package is never a RED, even when another test fails', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'fod-deps-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const file = join(root, 'x.oracle.test.mjs')
  await writeFile(file, "import fc from 'fast-check'\nimport { a } from '@scope/missing-pkg/sub'\nimport { b } from './x.model.mjs'\nimport assert from 'node:assert'\n")
  assert.deepEqual(missingPackages([file]), ['@scope/missing-pkg', 'fast-check'])
  await mkdir(join(root, 'node_modules', 'fast-check'), { recursive: true })
  await writeFile(join(root, 'node_modules', 'fast-check', 'package.json'), '{}')
  assert.deepEqual(missingPackages([file]), ['@scope/missing-pkg'])

  // case-3 field run: the oracle file failed to load while a hand test failed — the old judge accepted it as RED
  const unloaded = {
    exit: 1,
    output: "✖ x.oracle.test.mjs\n  Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'fast-check' imported from /p/x.oracle.test.mjs\n✖ hand test\n",
    failing: ['✖ x.oracle.test.mjs', '✖ hand test'],
  }
  assert.deepEqual(judge('red', 'npm test', unloaded, SCOPE).map(({ code }) => code), ['RED_NOT_A_TEST_FAILURE'])
  assert.match(judge('red', 'npm test', unloaded, SCOPE)[0].fix, /npm i -D fast-check/)
  assert.deepEqual(judge('red', 'npm test', { exit: 1, output: '✖ [MODEL] [T1] Click\n', failing: ['✖ [MODEL] [T1] Click'] }, SCOPE), [])
})

test('RED is only a failing generated test, or the new product module that does not exist yet', () => {
  assert.deepEqual(judged('red', "✖ x.oracle.test.mjs\nError [ERR_MODULE_NOT_FOUND]: Cannot find module '/p/src/feed.mjs' imported from /p/src/feed.adapter.mjs\n"), [],
    'a product file the approval names but nobody wrote yet is the RED of a new feature')
  assert.deepEqual(judged('red', "✖ x.oracle.test.mjs\nError [ERR_MODULE_NOT_FOUND]: Cannot find module '/p/test/helper.mjs' imported from /p/src/feed.adapter.mjs\n"), ['RED_NOT_A_TEST_FAILURE'],
    'a missing harness file outside the product globs is a broken harness')
  assert.deepEqual(judged('red', "Error: Cannot find module 'left-pad'\n"), ['RED_NOT_A_TEST_FAILURE'], 'a bare name is never a product path')
  assert.deepEqual(judged('red', '✖ x\n'), ['RED_NOT_A_TEST_FAILURE'], 'a failure line from a command that never ran the generated tests')
  assert.deepEqual(judged('red', '✔ [MODEL] [T1] Issue (2ms)\n✖ hand test\n'), ['RED_PASSED'], 'the model tests passed; only a hand test failed')
  assert.deepEqual(judged('red', "✔ [MODEL] [T1] Issue (2ms)\n✖ hand.test.mjs\nError: Cannot find module '/p/src/new.mjs' imported from /p/test/hand.test.mjs\n"), ['RED_PASSED'],
    'a missing product module in a hand test does not stand in for generated tests that passed')
  assert.deepEqual(judged('red', '✔ [MODEL] [T1] Issue (2ms)\n', 0), ['RED_PASSED'])
})

test('GREEN needs exit 0 and the generated tests in the output', () => {
  assert.deepEqual(judged('green', '✔ [MODEL] [T1] Issue (2ms)\n', 0), [])
  assert.deepEqual(judged('green', '{"fastCheck":{"row":"MODEL","runs":100}}\n', 0), [], 'the sampled test logs its row instead of a [MODEL] name')
  assert.deepEqual(judged('green', '✔ hand test\n', 0), ['GREEN_TESTS_NOT_RUN'])
  assert.deepEqual(judged('green', '✖ [MODEL] [T1] Issue\n'), ['GREEN_FAILED'])
})

test('the suggested GREEN command survives the shell and comes back as the command RED recorded', () => {
  for (const recorded of ['node --test "a/*.test.mjs"', "vitest run --reporter='dot' it's"]) {
    // fod.mjs execute()가 쓰는 셸과 같은 POSIX sh
    const echoed = spawnSync('/bin/sh', ['-c', `printf %s ${shellQuote(recorded)}`], { encoding: 'utf8' })
    assert.equal(echoed.stdout, recorded)
  }
})

test('axis cells name concrete model identifiers; the generic machine names are not evidence', () => {
  assert.deepEqual(axisNames('`Feed.Load(Empty)`, `Respond`'), ['Load', 'Empty', 'Respond'])
  assert.deepEqual(axisNames('`Search.latest`'), ['latest'])
  assert.deepEqual(axisNames('`Search.init`, `State`, `next`'), [])
  assert.deepEqual(axisNames('-'), [])
})

test('the trace suite and the state suite are written to different files', () => {
  assert.deepEqual(suiteNames('Search'), { trace: 'search', state: 'search-state' })
})

test('[bend] six steps on stale-search: prove, approve, generate, a RED the hook guards, GREEN, review', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await repo(t)
  const id = 'search'
  const product = join(root, 'search', 'search-reducer.mts')
  assert.deepEqual(codes(check({ root, id })), [])
  assert.equal(status({ root, id }).step, 2)

  // a rule with no law and an axis the model does not name are both reported before Bend runs
  const specFile = join(root, '.ai', 'oracles', id, 'SPEC.md')
  await writeFile(specFile, edit(SPEC, ['\n## 7축', '- R4: 결과는 3초 안에 보인다 (S1)\n\n## 7축'], ['`Env.pending`', '`Env.waiting`']))
  assert.deepEqual(codes(prove({ root, id })).sort(), ['AXIS_NOT_IN_MODEL', 'RULE_WITHOUT_LAW'])
  await writeFile(specFile, SPEC)

  assert.deepEqual(codes(prove({ root, id })), [])
  assert.equal(status({ root, id }).step, 2, 'proven but not approved')
  assert.deepEqual(codes(await gen({ root, id })), ['GEN_NOT_APPROVED'])
  assert.deepEqual(codes(approve({ root, id, by: 'tester' })), [])
  assert.equal(status({ root, id }).step, 3)

  // between approval and RED the hook keeps product writes out, and nothing else
  const reason = blockingReason({ filePath: product, cwd: root })
  assert.match(reason, /FOD search: 승인 뒤 RED 전에는 제품 파일\(search\/search-reducer\.mts\)/)
  assert.equal(blockingReason({ filePath: join(root, 'search', 'search.adapter.mjs'), cwd: root }), null)
  assert.equal(blockingReason({ filePath: product, cwd: root, now: Date.now() + STALE_MS + 1 }), null, 'an abandoned approval does not block')

  const generated = await gen({ root, id })
  assert.deepEqual(codes(generated), [])
  assert.ok(generated.gen.files.some((file) => file.endsWith('.oracle.test.mjs')))
  assert.equal(status({ root, id }).step, 4)

  // RED must see the product as approved; a fix written first is refused
  await writeFile(product, FIXED)
  assert.deepEqual(codes(runPhase({ root, id, phase: 'red' })), ['RED_PRODUCT_CHANGED'])
  await writeFile(product, BUGGY)
  const red = runPhase({ root, id, phase: 'red' })
  assert.deepEqual(codes(red), [])
  assert.ok(red.entry.failing.length > 0, 'the generated tests name the stale-response defect')
  assert.equal(blockingReason({ filePath: product, cwd: root }), null, 'after RED the product is open')
  assert.deepEqual(codes(runPhase({ root, id, phase: 'red' })), ['RED_DONE'])

  assert.deepEqual(codes(runPhase({ root, id, phase: 'green' })), ['GREEN_FAILED'])
  assert.deepEqual(codes(runPhase({ root, id, phase: 'green', command: 'true' })), ['GREEN_COMMAND_CHANGED'], 'GREEN runs the command RED ran')
  await writeFile(product, FIXED)
  const adapter = join(root, 'search', 'search.adapter.mjs')
  const adapterText = await readFile(adapter, 'utf8')
  await writeFile(adapter, `${adapterText}\n// edited\n`)
  assert.deepEqual(codes(runPhase({ root, id, phase: 'green' })), ['GREEN_TESTS_CHANGED'])
  await writeFile(adapter, adapterText)
  assert.deepEqual(codes(runPhase({ root, id, phase: 'green' })), [])
  assert.equal(status({ root, id }).step, 6)

  // a changed rule makes the proof stale again: the run goes back to step 2
  await writeFile(specFile, edit(SPEC, ['그대로다 (S1)', '그대로이고 이전 결과가 남는다 (S1)']))
  assert.equal(status({ root, id }).step, 2)
  assert.deepEqual(codes(drop({ root, id })), [])
  assert.equal(status({ root, id }).next, 'dropped')
})
