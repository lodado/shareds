import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { load, measure } from '../../../scripts/fod-run-stats.mjs'
import { blockingReason, STALE_MS } from './fod-guard-hook.mjs'
import { checkSpec } from './fod-spec.mjs'
import {
  approve,
  axisNames,
  bendText,
  cellRelations,
  check,
  drop,
  emitPlan,
  execute,
  failingTests,
  gen,
  genFix,
  hasOtherStepLaws,
  init,
  judge,
  lawFindings,
  lawStrength,
  missingPackages,
  prove,
  rulesWithLaws,
  runPhase,
  safeName,
  shellQuote,
  status,
  strengthFindings,
  usageFindings,
} from './fod.mjs'
import { spaceUsage } from './oracle-model.mjs'
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
  const folded = '# R1, R4: a rule that is long enough\n# to wrap, as R9 would\nlaw wrapped:\n  x\n\n# R7: apart\n\nlaw alone:\n  y\n'
  assert.deepEqual([...rulesWithLaws(folded)].sort(), ['R1', 'R4'])
  assert.deepEqual([...rulesWithLaws('# -- R3: a section title --\n# R5 : spaced\nlaw titled:\n  x\n')], ['R5'])
})

test('safe names the same function with or without the model prefix', () => {
  assert.equal(safeName({ prefix: 'Search', safe: 'Search.safe' }), 'safe')
  assert.equal(safeName({ prefix: 'Search', safe: 'safe' }), 'safe')
  assert.equal(safeName({ prefix: 'M.Search', safe: 'M.Search.inv' }), 'inv')
})

test('failing test names come from node --test, vitest and TAP output', () => {
  const output = '✔ ok one\n✖ [MODEL] [T1] Issue · Respond (3ms)\n× vitest case\nnot ok 3 - tap case\n✖ failing tests:\n'
  assert.deepEqual(failingTests(output), ['✖ [MODEL] [T1] Issue · Respond (3ms)', '× vitest case', 'not ok 3 - tap case'])
})

// 판정 범위: 승인이 제품 파일로 고정한 glob
const SCOPE = { root: '/p', globs: ['src/**'], adapter: 'test/feed.adapter.mjs', out: 'test/oracle' }
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
  // vitest 5 prints the specifier as written and the importing file (seen in a real run)
  const vitest = (specifier) =>
    ` ❯ x.oracle.test.mjs (0 test)\n FAIL  x.oracle.test.mjs [ x.oracle.test.mjs ]\nError: Cannot find module '${specifier}' imported from /p/src/feed.adapter.mjs\n`
  assert.deepEqual(judged('red', vitest('./feed.mjs')), [], 'vitest: the missing product module resolves next to the adapter')
  assert.deepEqual(judged('red', vitest('../test/helper.mjs')), ['RED_NOT_A_TEST_FAILURE'], 'vitest: a missing harness file stays a harness failure')
  assert.deepEqual(judged('red', '✖ x\n'), ['RED_NOT_A_TEST_FAILURE'], 'a failure line from a command that never ran the generated tests')
  assert.deepEqual(judged('red', '✔ [MODEL] [T1] Issue (2ms)\n✖ hand test\n'), ['RED_PASSED'], 'the model tests passed; only a hand test failed')
  assert.deepEqual(judged('red', "✔ [MODEL] [T1] Issue (2ms)\n✖ hand.test.mjs\nError: Cannot find module '/p/src/new.mjs' imported from /p/test/hand.test.mjs\n"), ['RED_PASSED'],
    'a missing product module in a hand test does not stand in for generated tests that passed')
  assert.deepEqual(judged('red', '✔ [MODEL] [T1] Issue (2ms)\n', 0), ['RED_PASSED'])
  assert.deepEqual(
    judged('red', "Error: Cannot find module '/p/src/new.mjs' imported from /p/test/hand.test.mjs\nError: Cannot find module '/p/test/helpr.mjs' imported from /p/test/feed.adapter.mjs\n"),
    ['RED_NOT_A_TEST_FAILURE'], 'a hand test importing the new module does not cover an adapter that failed on a harness file')
  assert.deepEqual(judged('red', "Error: Cannot find module '/p/src/new.mjs' imported from /p/test/hand.test.mjs\n"), ['RED_NOT_A_TEST_FAILURE'],
    'only the adapter, the generated tests or product files load the generated suite')
  assert.deepEqual(judged('red', "Error: Cannot find module '/p/src/feed.mjs' imported from /p/test/oracle/feed.oracle.test.mjs\n"), [])
  const spaced = { ...SCOPE, root: '/Users/x/My App' }
  const output = "Error: Cannot find module './../src/feed.mjs' imported from /Users/x/My App/test/feed.adapter.mjs\n"
  assert.deepEqual(judge('red', 'npm test', { exit: 1, output, failing: [], tail: output }, spaced), [], 'a root with a space')
})

test('a run that never finishes is cut off and named, at RED and at GREEN', () => {
  for (const phase of ['red', 'green']) {
    const result = { exit: 1, timedOut: true, output: '✔ [MODEL] [T1] Issue\n', failing: [], tail: '✔ [MODEL] [T1] Issue' }
    const [found, ...rest] = judge(phase, 'npm test', result, SCOPE)
    assert.equal(found.code, 'RUN_TIMEOUT', phase)
    assert.deepEqual(rest, [])
    assert.match(found.fix, phase === 'red' ? /고치기 전 제품/ : /고친 제품/)
  }
})

// 끊긴 프로세스는 출력 pipe를 닫은 뒤라 execute가 돌아온 시점에 이미 죽었다 — 아직 거둬지지 않은 zombie(Z)도 죽은 것이다
const gone = (pid) => {
  const stat = spawnSync('/bin/ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim()
  return stat === '' || stat.startsWith('Z')
}

test('a timed-out command is stopped with every process it started', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'fod-timeout-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  // 셸이 띄운 손자가 끝나지 않는 테스트 worker 역할을 한다
  const result = execute(root, 'sleep 30 & echo $! > child.pid; wait', 500)
  assert.equal(result.timedOut, true)
  assert.equal(gone(Number(await readFile(join(root, 'child.pid'), 'utf8'))), true, 'the grandchild is gone')
  const quick = execute(root, 'echo done; exit 3', 5000)
  assert.deepEqual([quick.timedOut, quick.exit, quick.output.trim()], [false, 3, 'done'])

  // a suite that starts a server and never stops it: the run ends with the command, not at the time limit
  const started = Date.now()
  const leftover = execute(root, 'sleep 33 & echo $! > server.pid; echo ok', 20_000)
  assert.deepEqual([leftover.timedOut, leftover.exit, leftover.output.trim()], [false, 0, 'ok'])
  assert.ok(Date.now() - started < 10_000, 'did not wait for the leftover process')
  assert.equal(gone(Number(await readFile(join(root, 'server.pid'), 'utf8'))), true, 'the leftover process is gone')
  assert.doesNotMatch(execute(root, '-x', 5000).output, /bad option/, 'a command starting with - is not a node option')
})

test('a Bend failure shows the reason, the hint and what Bend printed, not the whole report', () => {
  const json = {
    status: 'failed',
    command: ['bend', 'PROOF.bend'],
    inputs: [{ path: 'MODEL.bend', sha256: 'abc' }],
    stderr: 'Mismatch:\n- expected : List<&1, Nat>\n- detected : List<&2, Nat>',
    hint: 'spell the region of the bound list',
    counterexample: { trace: [{ $: 'Issue' }] },
  }
  const text = bendText({ json, output: JSON.stringify(json) })
  assert.match(text, /List<&2, Nat>/)
  assert.match(text, /spell the region/)
  assert.match(text, /counterexample: \{"trace"/)
  assert.doesNotMatch(text, /sha256/)
  assert.equal(bendText({ json: null, output: 'plain tail' }), 'plain tail')
  // oracle-model check and prove-reach put Bend's own text under `output`, with or without a hint
  const checked = { files: [{ file: 'MODEL.bend', status: 'failed', output: "Location: MODEL.bend:12\n- expected : Search\n- detected : Nat" }] }
  const checkText = bendText({ json: checked, output: JSON.stringify(checked) })
  assert.match(checkText, /Location: MODEL\.bend:12/)
  assert.doesNotMatch(checkText, /"status"/)
  const reach = { status: 'failed', proof: { file: 'REACH.bend', arms: 3, bytes: 900 }, output: 'Mismatch at arm 2', hint: 'step breaks safe' }
  const reachText = bendText({ json: reach, output: JSON.stringify(reach) })
  assert.match(reachText, /Mismatch at arm 2/)
  assert.match(reachText, /step breaks safe/)
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

test('laws that repeat each other or never pin the start are reported before approval', () => {
  const where = 'search/LAWS.bend'
  const witness = (name) => `law ${name}:\n  exs t: List<M.Msg>\n  {M.Search.observe(M.Search.run(t, M.Search.init())) == 2n : Nat}\n`
  assert.deepEqual(lawFindings(`import Base\n\n# R2: a\n${witness('r2_shown')}\n# R3: b\n${witness('r3_shown')}`, { prefix: 'Search', where }).map(({ code }) => code), ['LAW_DUPLICATE'])
  const cell = 'law issue_advances:\n  for latest: Nat\n  {M.Search.step(M.Search{latest, 0n}, M.Issue{}) == M.Search{1n+latest, 0n} : M.Search}\n'
  assert.deepEqual(lawFindings(cell, { prefix: 'Search', where }).map(({ code }) => code), ['LAW_INIT_UNPINNED'], 'cell laws hold in every state and fix no start')
  assert.deepEqual(lawFindings(`${cell}\n${witness('r3_shown')}`, { prefix: 'Search', where }), [])
  assert.deepEqual(lawFindings(`# R1: Search.init shows nothing\n${cell}`, { prefix: 'Search', where }).map(({ code }) => code), ['LAW_INIT_UNPINNED'],
    'a comment naming init pins nothing')
})

test('a field the step keeps while the cell relations leave it open is reported before approval', async (t) => {
  const relation = (name, body) => `law ${name}:\n  for s: M.Search\n  for c: M.Msg\n  {${body} == True{} : Bool}\n`
  const laws = [
    relation('r1_shown', 'M.Search.r1(s, c, M.Search.step(s, c))'),
    relation('r2_kept', 'M.Search.r2(s,c,M.Search.step(s,c))'),
    // a relation over a trace, a relation of another model and a fixed cell are not cell relations of this model
    'law r5_forward:\n  for t: List<M.Msg>\n  for c: M.Msg\n  {M.Search.forward(M.Search.run(t, M.Search.init()), c, M.Search.step(M.Search.run(t, M.Search.init()), c)) == True{} : Bool}\n',
    relation('other', 'M.Feed.r1(s, c, M.Feed.step(s, c))'),
    'law issue_advances:\n  for latest: Nat\n  {M.Search.step(M.Search{latest, 0n}, M.Issue{}) == M.Search{1n+latest, 0n} : M.Search}\n',
  ].join('\n')
  assert.deepEqual(cellRelations(laws, 'Search'), [{ state: 'Search', command: 'Msg', relations: ['r1', 'r2'] }])
  assert.deepEqual(cellRelations(relation('spaced', 'M.Search.r1(s, c, M.Search.step(s, c))').replaceAll(': M.', ' : M.'), 'Search').length, 1)
  // another law that speaks of this model's step may pin what the relations leave open: nothing is measured, nothing refused
  assert.equal(hasOtherStepLaws(laws, 'Search'), true)
  assert.equal(hasOtherStepLaws(laws, 'Feed'), false)
  const mixed = await mkdtemp(join(tmpdir(), 'fod-mixed-'))
  t.after(() => rm(mixed, { recursive: true, force: true }))
  await writeFile(join(mixed, 'LAWS.bend'), laws)
  assert.deepEqual(lawStrength({ root: mixed, model: { model: 'MODEL.bend', prefix: 'Search' }, lawsFile: 'LAWS.bend' }), {
    findings: [],
    summary: { relations: 2, pinned: 0, free: 0, empty: 0, bounded: false, skipped: ['MIXED_CELL_LAWS'] },
  })

  const where = 'search/LAWS.bend'
  const open = { state: 'M.Search{0n, 0n, 0n}', command: 'M.Answer{0n}', alternatives: 3 }
  const report = (keptFields, freeFields) => ({ strength: { freeCount: 78, keptFields, freeCells: [{ ...open, freeFields }] } })
  const [found, ...rest] = strengthFindings(report({ errors: 18, requests: 78 }, [{ field: 'requests', kept: true }, { field: 'errors', kept: true }]), { where })
  assert.deepEqual([found.code, found.where, rest.length], ['LAW_FRAME_MISSING', where, 0])
  assert.match(found.message, /requests\(78칸\), errors\(18칸\).*M\.Search\{0n, 0n, 0n\} 에서 M\.Answer\{0n\}\), Nat·List 1 안에서/)
  assert.match(found.fix, /뒤 상태의 requests는 앞 상태와 같다/)
  assert.deepEqual(strengthFindings(report({}, [{ field: 'shown', kept: false }]), { where }), [], 'a field the step changes may be left open on purpose')
  assert.deepEqual(strengthFindings({ strength: null }, { where }), [])
})

test('[bend] law strength is measured on the cell relations LAWS.bend states, inside a small bound', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const measured = (fixture, prefix) =>
    lawStrength({ root: PACKAGE, model: { model: `test-fixtures/${fixture}/MODEL.bend`, prefix }, lawsFile: `test-fixtures/${fixture}/LAWS.bend` })

  // forward, refusal and frame laws together pin every cell
  assert.deepEqual(measured('cells', 'Doc'), { findings: [], summary: { relations: 9, pinned: 160, free: 0, empty: 0, bounded: false, skipped: [] } })

  // two property relations and no frame law: the step keeps `expired` and `sent` where the laws allow either value
  const session = measured('session-expiry', 'Session')
  assert.deepEqual(session.findings.map(({ code }) => code), ['LAW_FRAME_MISSING'])
  assert.match(session.findings[0].message, /expired\(6칸\), sent\(2칸\)/)
  assert.deepEqual(session.summary, { relations: 2, pinned: 0, free: 8, empty: 0, bounded: false, skipped: [] })

  // a List state is cut at the bound; no law of another shape is measured
  assert.equal(measured('reorder', 'Board').summary.bounded, true)
  // one frame law pins one field: the fields it does not name still need theirs
  assert.match(measured('toggle', 'Toggle').findings[0].message, /disabled\(40칸\), loading\(40칸\), checked\(32칸\)/)
  assert.deepEqual(measured('stale-search', 'Search'), { findings: [], summary: null })
})

test('an event next never offers and an observation that never changes are reported before approval', () => {
  const model = 'type Msg is Data:\n  Issue{}\n  Respond{id: Nat}\n  Cancel{}\n\ntype Search is Data:\n  Search{latest: Nat}\n'
  const options = { prefix: 'Search', bound: 4, where: 'search/MODEL.bend' }
  const found = usageFindings(model, { events: { Issue: 9, Respond: 6 }, observed: false }, options)
  assert.deepEqual(found.map(({ code }) => code), ['MODEL_EVENT_NEVER_OFFERED', 'MODEL_OBSERVES_NOTHING'])
  assert.match(found[0].message, /Cancel를 한 번도/)
  assert.deepEqual(usageFindings(model, { events: { Issue: 9, Respond: 6, Cancel: 1 }, observed: true }, options), [])

  // the space side: counts per constructor, and whether any prefix observation differs from init
  const space = {
    initial: 0,
    cases: [
      { trace: [{ $: 'Issue' }, { $: 'Issue' }], observations: [0, 0] },
      { trace: [{ $: 'Issue' }, { $: 'Respond', id: 1 }], observations: [0, 1] },
    ],
  }
  assert.deepEqual(spaceUsage(space), { events: { Issue: 2, Respond: 1 }, observed: true })
  assert.equal(spaceUsage({ ...space, cases: [space.cases[0]] }).observed, false)
})

test('axis cells name concrete model identifiers; the generic machine names are not evidence', () => {
  assert.deepEqual(axisNames('`Feed.Load(Empty)`, `Respond`'), ['Load', 'Empty', 'Respond'])
  assert.deepEqual(axisNames('`Search.latest`'), ['latest'])
  assert.deepEqual(axisNames('`Search.init`, `State`, `next`'), [])
  assert.deepEqual(axisNames('-'), [])
})

test('gen writes the trace suite always and the state suite only when asked, to different files', () => {
  assert.deepEqual(emitPlan({ prefix: 'Search' }), [{ suite: 'trace', name: 'search' }])
  const plan = emitPlan({ prefix: 'Toggle', state: 'Toggle', command: 'Cmd', relations: 'R_blocked_keeps, R_free_applies' })
  assert.deepEqual(plan.map(({ suite, name }) => [suite, name]), [['trace', 'toggle'], ['state', 'toggle-state']])
  assert.deepEqual(plan[1].relations, ['R_blocked_keeps', 'R_free_applies'])
  assert.deepEqual(emitPlan({ prefix: 'Toggle', state: 'Toggle', relations: 'R1' }).length, 1, 'no command type, no state suite')
})

test('every code gen can pass through has a fix, and a Bend install failure points at the installer', () => {
  for (const code of ['USAGE', 'TYPE_UNSUPPORTED', 'RELATION_INVALID', 'SAMPLING_BOUND_REQUIRED', 'ADAPTER_SUSPECT', 'SPACE_INCOMPLETE'])
    assert.doesNotMatch(genFix(code), /메시지대로/, code)
  for (const code of ['BEND_DOWNLOAD_FAILED', 'BEND_CHECKSUM_MISMATCH', 'BEND_INSTALL_FAILED', 'BEND_UNSUPPORTED_PLATFORM'])
    assert.match(genFix(code), /ensure-bend\.mjs/, code)
  assert.match(genFix('SOMETHING_NEW'), /메시지대로/)
})

test('run stats split a transcript at the fod.mjs results and place each reviewer before approval or after GREEN', () => {
  assert.throws(() => load(''), /시각이 있는 줄이 없다/)
  let clock = Date.parse('2026-11-11T00:00:00Z')
  let id = 0
  const lines = []
  const say = (type, content, extra = {}) => lines.push(JSON.stringify({ type, timestamp: new Date(clock).toISOString(), message: { content, ...extra } }))
  /** 도구 호출 하나: 부르고 seconds 뒤에 결과가 온다. */
  const call = (name, input, out, seconds) => {
    id += 1
    say('assistant', [{ type: 'tool_use', id: `t${id}`, name, input }], { id: `m${id}`, usage: { cache_read_input_tokens: 1000 } })
    clock += seconds * 1000
    say('user', [{ type: 'tool_result', tool_use_id: `t${id}`, content: out }])
  }
  call('Bash', { command: 'node /skill/scripts/fod.mjs check pay' }, 'ok check\nnext: …', 60)
  call('Bash', { command: 'F=/skill/scripts/fod.mjs; node "$F" prove pay' }, '✖ PROVE_FAILED …\n1건을 모두 고친 뒤 다시 실행한다', 30)
  call('Bash', { command: 'node "$F" prove pay' }, 'ok prove', 30)
  call('Agent', { description: 'model reading' }, 'findings', 40)
  call('Bash', { command: 'node /skill/scripts/fod.mjs approve pay --by me && node /skill/scripts/fod.mjs gen pay' }, 'ok approve\nok gen', 20)
  call('Bash', { command: 'node /skill/scripts/fod.mjs run red pay' }, 'ok run', 10)
  call('Bash', { command: 'node /skill/scripts/fod.mjs run green pay' }, 'ok run', 10)
  call('Agent', { description: 'delivery reading' }, 'findings', 100)

  const run = measure(lines.join('\n'))
  assert.deepEqual(run.counts, {
    check: { calls: 1, failed: 0 },
    prove: { calls: 2, failed: 1 },
    approve: { calls: 1, failed: 0 },
    gen: { calls: 1, failed: 0 },
    'run red': { calls: 1, failed: 0 },
    'run green': { calls: 1, failed: 0 },
  })
  assert.deepEqual(run.reviewers, { beforeApproval: 1, afterGreen: 1, between: 0 })
  // spec 60 · model 30 · prove-repair 30 · read+approve 40+20 · adapter+gen 0 · red 10 · green 10 · after-green 100
  assert.deepEqual(run.seconds, [60, 30, 30, 60, 0, 10, 10, 100])
  assert.deepEqual([run.total, run.firstGreen, run.apiCalls, run.cacheRead], [300, 200 / 60, 8, 8000])
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

  const proven = prove({ root, id })
  assert.deepEqual(codes(proven), [])
  assert.equal(proven.proof.strength, null, 'laws that fix one cell each have no relation to measure')
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

  // a review fix to the adapter alone needs no new approval, but a new RED on the unfixed product
  await writeFile(adapter, `${adapterText}\n// review fix\n`)
  assert.equal(status({ root, id }).step, 4)
  assert.deepEqual(codes(runPhase({ root, id, phase: 'green' })), ['GREEN_TESTS_CHANGED'])
  assert.deepEqual(codes(runPhase({ root, id, phase: 'red' })), ['RED_PRODUCT_CHANGED'], 'the fix is still in place')
  await writeFile(product, BUGGY)
  assert.deepEqual(codes(runPhase({ root, id, phase: 'red' })), [])
  assert.deepEqual(codes(runPhase({ root, id, phase: 'red' })), ['RED_DONE'])
  assert.equal(status({ root, id }).step, 5)
  await writeFile(product, FIXED)
  assert.deepEqual(codes(runPhase({ root, id, phase: 'green' })), [])
  assert.equal(status({ root, id }).step, 6)

  // a changed rule makes the proof stale again: the run goes back to step 2
  await writeFile(specFile, edit(SPEC, ['그대로다 (S1)', '그대로이고 이전 결과가 남는다 (S1)']))
  assert.equal(status({ root, id }).step, 2)
  assert.deepEqual(codes(drop({ root, id })), [])
  assert.equal(status({ root, id }).next, 'dropped')
})
