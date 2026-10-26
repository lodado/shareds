import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { access, chmod, cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { initialSearch, reduceSearch } from '../../../test-fixtures/stale-search/search-reducer.mts'
import {
  reduceIgnoringResponses,
  reduceShowingPrevious,
  reduceWithoutStaleCheck,
} from '../../../test-fixtures/stale-search/search-reducer.mutants.mts'
import { adapterFor } from '../../../test-fixtures/stale-search/search.adapter.mjs'
import { BEND_VERSION } from './ensure-bend.mjs'
import { sha256, stableStringify } from './oracle-fs.mjs'
import { cellProof, lawReport, MAX_REACH_CELLS, reachPlan, reachProof } from './oracle-laws.mjs'
import {
  bendFailureHint,
  bendInputs,
  checkBendFiles,
  checkConformance,
  classifyTrace,
  compileBend,
  configurationGraph,
  enumerateSpace,
  eventLabel,
  formalModelIssues,
  LISTED_CASES,
  listedSpace,
  loadModel,
  minimalCover,
  parseFormalModel,
  proveLaws,
  proveReach,
  reachedStates,
  scaffoldWorld,
  scanBendSource,
  transitionCover,
  verdictBeside,
} from './oracle-model.mjs'
import { inputsPin } from './oracle-stage.mjs'
import { installedBend } from './oracle-test-bend.mjs'
import { toPlain } from './oracle-types.mjs'

const FIXTURE = fileURLToPath(new URL('../../../test-fixtures/stale-search/', import.meta.url))
const PAY = fileURLToPath(new URL('../../../test-fixtures/pay/', import.meta.url))
const SEARCH_ENV = fileURLToPath(new URL('../../../test-fixtures/stale-search-env/', import.meta.url))
const TOGGLE = fileURLToPath(new URL('../../../test-fixtures/toggle/', import.meta.url))
const SESSION = fileURLToPath(new URL('../../../test-fixtures/session-expiry/', import.meta.url))
const CELLS = fileURLToPath(new URL('../../../test-fixtures/cells/', import.meta.url))
const PAGINATION = fileURLToPath(new URL('../../../test-fixtures/pagination/', import.meta.url))
const SCRIPTS = fileURLToPath(new URL('.', import.meta.url))

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'oracle-model-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

/** fixture를 임시 디렉터리에 복사한다 — 모델·증명 변형은 여기서만 하고 원본은 건드리지 않는다. */
async function fixtureCopy(t, source = FIXTURE) {
  const root = await workspace(t)
  await cp(source, root, { recursive: true })
  return root
}

async function edit(path, from, to) {
  const text = await readFile(path, 'utf8')
  assert.ok(text.includes(from), `${path} lacks the text the mutation replaces`)
  await writeFile(path, text.replace(from, to))
}

/** 가짜 bend — 주어진 출력과 exit code를 내고, 실행됐다는 흔적을 남긴다. 분류 로직만 시험한다. */
async function fakeBend(root, { stdout = '', exitCode = 0, sleep = 0 }) {
  const bin = join(root, 'fake-bend')
  const output = join(root, 'fake-bend.out')
  const marker = join(root, 'fake-bend.ran')
  await writeFile(output, `${stdout}\n`)
  const pause = sleep ? `sleep ${sleep}\n` : ''
  await writeFile(bin, `#!/bin/sh\ntouch '${marker}'\n${pause}cat '${output}'\nexit ${exitCode}\n`)
  await chmod(bin, 0o755)
  return {
    bin,
    ran: () =>
      access(marker).then(
        () => true,
        () => false,
      ),
  }
}

async function proofDir(t, { laws = 'law a:\n  {0n == 0n : Nat}\n', proof = 'import ./LAWS.bend as Laws\n' } = {}) {
  const root = await workspace(t)
  await writeFile(join(root, 'LAWS.bend'), `import Base\n${laws}`)
  await writeFile(join(root, 'PROOF.bend'), `import Base\n${proof}`)
  return root
}

// ── prove: 결과 분류 (가짜 bend, mock) ──────────────────────────────────────────────

test('prove reports proven only for exit 0 with the exact ALL PROOFS CHECK line', async (t) => {
  const dir = await proofDir(t)
  const proven = await proveLaws({ dir, bin: (await fakeBend(dir, { stdout: 'ALL PROOFS CHECK' })).bin })
  assert.equal(proven.status, 'proven')
  assert.deepEqual(proven.laws, ['a'])

  const nearMiss = await proveLaws({ dir, bin: (await fakeBend(dir, { stdout: 'ALL PROOFS CHECK?' })).bin })
  assert.equal(nearMiss.status, 'failed')

  const nonZero = await proveLaws({ dir, bin: (await fakeBend(dir, { stdout: 'ALL PROOFS CHECK', exitCode: 1 })).bin })
  assert.equal(nonZero.status, 'failed')
})

test('prove keeps open laws, unsafe code, failures, timeouts and a missing tool out of proven', async (t) => {
  const dir = await proofDir(t)
  const cases = [
    [{ stdout: 'SOME PROOFS FAIL\nError: 1 TODO found.', exitCode: 1 }, 'open'],
    [{ stdout: 'SOME PROOFS FAIL\nError: 2 defs rely on unsafe or foreign code:', exitCode: 1 }, 'unsafe'],
    [{ stdout: 'SOME PROOFS FAIL\nLocation: Laws.a', exitCode: 1 }, 'failed'],
  ]
  for (const [output, status] of cases) {
    const result = await proveLaws({ dir, bin: (await fakeBend(dir, output)).bin })
    assert.equal(result.status, status, output.stdout)
  }
  assert.equal(
    (
      await proveLaws({
        dir,
        bin: (await fakeBend(dir, { stdout: 'SOME PROOFS FAIL\nLocation: Laws.a', exitCode: 1 })).bin,
      })
    ).failedAt,
    'Laws.a',
  )

  const slow = await fakeBend(dir, { stdout: 'ALL PROOFS CHECK', sleep: 5 })
  assert.equal((await proveLaws({ dir, bin: slow.bin, timeoutMs: 200 })).status, 'timeout')
  assert.equal((await proveLaws({ dir, bin: join(dir, 'no-such-bend') })).status, 'unavailable')
})

test('prove refuses a PROOF.bend that checks other laws, or laws missing a required one, without running bend', async (t) => {
  const detached = await proofDir(t, { proof: 'import ./OTHER.bend as Laws\n' })
  await writeFile(join(detached, 'OTHER.bend'), 'import Base\n')
  const fakeDetached = await fakeBend(detached, { stdout: 'ALL PROOFS CHECK' })
  const refused = await proveLaws({ dir: detached, bin: fakeDetached.bin })
  assert.equal(refused.status, 'failed')
  assert.match(refused.reason, /does not import \.\/LAWS\.bend/)
  assert.equal(await fakeDetached.ran(), false)

  const partial = await proofDir(t)
  const fakePartial = await fakeBend(partial, { stdout: 'ALL PROOFS CHECK' })
  const missing = await proveLaws({ dir: partial, bin: fakePartial.bin, require: ['a', 'b'] })
  assert.equal(missing.status, 'failed')
  assert.match(missing.reason, /required laws: b/)
  assert.equal(await fakePartial.ran(), false)
})

test('scanBendSource finds foreign imports, unsafe defs, hub imports and witness laws', () => {
  const scanned = scanBendSource(
    [
      'import Base',
      'import ./MODEL.bend as M',
      'import 0xabc/main.bend as P',
      'law w:',
      '  exs t: Nat',
      '  {t == 0n : Nat}',
      'law s:',
      '  for x: Nat',
      '  {x == x : Nat}',
      'def e(x: U32) -> IO(Unit):',
      '  import "./e.js"',
      '@unsafe def loop(x: Nat) -> Nat:',
      '  loop(x)',
    ].join('\n'),
  )
  assert.deepEqual(scanned.imports, ['./MODEL.bend'])
  assert.deepEqual(scanned.external, ['0xabc/main.bend'])
  // each law also lists its `for` binders in order: `exs` is not one
  assert.deepEqual(scanned.laws, [
    { name: 'w', witness: true, binders: [] },
    { name: 's', witness: false, binders: [{ name: 'x', type: 'Nat' }] },
  ])
  assert.equal(scanned.foreign, true)
  assert.equal(scanned.unsafe, true)
  assert.equal(scanBendSource('def f?(x: Nat) -> Nat:\n  f(x)\n').unsafe, true)
})

// ── space: 결정적 열거 (손 모델, mock) ───────────────────────────────────────────────

/** 컴파일된 MODEL.bend와 같은 값 모양의 손 모델 — 열거기만 시험한다. 어떤 기대값의 출처도 아니다. */
function handModel({ reverse = false, forbidRepeatB = false, duplicate = false } = {}) {
  const last = (list) => {
    let found = null
    for (let cursor = list; cursor.$ === 'Con'; cursor = cursor.tail) found = cursor.head
    return found
  }
  return {
    prefix: 'Hand',
    digest: 'hand-model',
    init: () => ({ $: 'State', a: 0n }),
    step: (state, event) => ({ $: 'State', a: state.a + (event.$ === 'A' ? 1n : 0n) }),
    observe: (state) => state.a,
    next: (history) => {
      const events = [{ $: 'A' }, { $: 'B' }]
      if (forbidRepeatB && last(history)?.$ === 'B') events.pop()
      if (duplicate) events.push({ $: 'A' })
      if (reverse) events.reverse()
      return events.reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' })
    },
  }
}

test('a configuration graph is computed once per model and cap, and callers cannot change the shared graph', () => {
  const model = handModel({ forbidRepeatB: true })
  let calls = 0
  const next = model.next
  model.next = (history) => {
    calls += 1
    return next(history)
  }
  const first = configurationGraph(model, 40)
  const used = calls
  assert.ok(used > 0)
  assert.equal(configurationGraph(model, 40), first)
  assert.equal(calls, used)
  // another cap is another graph; so is another model, even one that reports the same digest
  assert.notEqual(configurationGraph(model, 39), first)
  assert.ok(calls > used)
  assert.notEqual(configurationGraph(handModel({ forbidRepeatB: true }), 40), first)
  assert.throws(() => first.nodes.push({}), TypeError)
  assert.throws(() => first.nodes[0].edges.push({}), TypeError)
})

test('space enumeration is deterministic and its case IDs do not depend on the environment order', () => {
  const first = enumerateSpace(handModel(), { bound: 3 })
  const second = enumerateSpace(handModel(), { bound: 3 })
  const reversed = enumerateSpace(handModel({ reverse: true }), { bound: 3 })

  assert.equal(first.cases.length, 8)
  assert.equal(first.complete, true)
  assert.deepEqual(second, first)
  assert.deepEqual(
    reversed.cases.map(({ id }) => id),
    first.cases.map(({ id }) => id),
  )
  assert.equal(reversed.spaceDigest, first.spaceDigest)
  assert.match(first.cases[0].id, /^M[a-f0-9]{12}$/)
  assert.deepEqual(first.cases.find(({ label }) => label === 'A · B · A').observations, [1, 1, 2])
})

test('a model enumerates one range once per process, and a case id is the digest of its serialized trace', () => {
  const model = handModel()
  let calls = 0
  const next = model.next
  model.next = (history) => {
    calls += 1
    return next(history)
  }
  const first = enumerateSpace(model, { bound: 3 })
  const used = calls
  assert.ok(used > 0)
  assert.equal(enumerateSpace(model, { bound: 3 }), first)
  assert.equal(calls, used)
  // another range, or a budget, is another space
  assert.notEqual(enumerateSpace(model, { bound: 2 }), first)
  assert.notEqual(enumerateSpace(model, { bound: 3, maxCases: 3 }), first)
  // the id and label are built incrementally from shared prefixes; they equal the ones built from the whole trace
  for (const entry of first.cases) {
    assert.equal(entry.id, `M${sha256(stableStringify(entry.trace)).slice(0, 12)}`)
    assert.equal(entry.label, entry.trace.map(eventLabel).join(' · '))
  }
})

test('the transition table calls step once per state and event, and a case still equals folding its trace through the model', () => {
  const model = handModel()
  const steps = []
  const step = model.step
  model.step = (state, event) => {
    steps.push(`${state.a}:${event.$}`)
    return step(state, event)
  }
  const space = enumerateSpace(model, { bound: 4 })
  // a counts the A events: the states that can still move at bound 4 are a = 0..3, two events each, however many traces reach them
  assert.equal(space.cases.length, 16)
  assert.equal(new Set(steps).size, steps.length)
  assert.equal(steps.length, 8, steps.join(' '))
  // a case equals what folding its trace through the model gives
  for (const { trace, observations } of space.cases) {
    let state = model.init()
    const seen = trace.map((event) => {
      state = step(state, event)
      return toPlain(model.observe(state))
    })
    assert.deepEqual(observations, seen)
  }
})

test('the transition table keeps states apart whose plain values agree but whose values are not strictly equal', () => {
  const steps = []
  const model = {
    prefix: 'Typed',
    digest: 'typed-model',
    init: () => ({ $: 'State', v: 0 }),
    step: (state, event) => {
      steps.push(`${typeof state.v}${state.v}:${event.$}`)
      if (event.$ === 'P') return { $: 'State', v: 1 }
      if (event.$ === 'Q') return { $: 'State', v: 1n }
      return { $: 'State', v: 5 }
    },
    observe: (state) => state.v,
    next: (history) => {
      const events = history.$ === 'Nil' ? [{ $: 'P' }, { $: 'Q' }] : [{ $: 'R' }]
      return events.reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' })
    },
  }
  const space = enumerateSpace(model, { bound: 2 })
  assert.equal(space.cases.length, 2)
  // R runs from {v: 1} and from {v: 1n}: the plain values are both 1, the values are not strictly equal
  assert.deepEqual(steps.filter((entry) => entry.endsWith(':R')).sort(), ['bigint1:R', 'number1:R'])
})

test('space follows the declared environment and removes duplicate events it offers', () => {
  const restricted = enumerateSpace(handModel({ forbidRepeatB: true }), { bound: 3 })
  assert.equal(
    restricted.cases.some(({ label }) => label.includes('B · B')),
    false,
  )
  assert.equal(restricted.cases.length, 5)

  const duplicated = enumerateSpace(handModel({ duplicate: true }), { bound: 2 })
  assert.equal(duplicated.cases.length, 4)
})

test('a budget stop keeps the explored cases and reports the space as incomplete', () => {
  const full = enumerateSpace(handModel(), { bound: 3 })
  const stopped = enumerateSpace(handModel(), { bound: 3, maxCases: 3 })

  assert.equal(stopped.complete, false)
  assert.equal(stopped.stopped, 'budget')
  assert.equal(stopped.cases.length, 3)
  assert.notEqual(stopped.inputDigest, full.inputDigest)
})

test('space has no default case ceiling and still honors explicit limits', () => {
  const full = enumerateSpace(handModel(), { bound: 13 })
  assert.equal(full.cases.length, 8192)
  assert.equal(full.complete, true)
  assert.equal(full.stopped, null)
  assert.equal(full.maxCases, null)
  assert.equal(JSON.parse(JSON.stringify(full)).maxCases, null)
  const limited = enumerateSpace(handModel(), { bound: 13, maxCases: 5000 })
  assert.equal(limited.cases.length, 5000)
  assert.equal(limited.complete, false)
  assert.equal(limited.stopped, 'budget')
  assert.equal(limited.maxCases, 5000)
  assert.notEqual(limited.inputDigest, full.inputDigest)
})

test('the space report lists a bounded prefix of cases and always carries the full count', () => {
  const full = enumerateSpace(handModel(), { bound: 10 })
  assert.equal(full.cases.length, 1024)
  const report = listedSpace(full)
  assert.equal(report.caseCount, 1024)
  assert.equal(report.cases.length, LISTED_CASES)
  assert.deepEqual(report.cases, full.cases.slice(0, LISTED_CASES))
  assert.equal(report.spaceDigest, full.spaceDigest)
  assert.equal(listedSpace(full, 1024).cases.length, 1024)
  assert.equal(listedSpace(full, 0).cases.length, 0)
  assert.throws(() => listedSpace(full, -1), { code: 'USAGE' })
  assert.throws(() => listedSpace(full, 1.5), { code: 'USAGE' })
})

test('space refuses invalid explicit case limits', () => {
  for (const maxCases of [-1, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => enumerateSpace(handModel(), { bound: 1, maxCases }),
      (error) => error.code === 'USAGE',
    )
  }
})

test('space accepts bounds beyond eight and preserves the case budget', () => {
  const full = enumerateSpace(handModel(), { bound: 9 })
  assert.equal(full.complete, true)
  assert.equal(full.cases.length, 512)
  const stopped = enumerateSpace(handModel(), { bound: 9, maxCases: 3 })
  assert.equal(stopped.complete, false)
  assert.equal(stopped.cases.length, 3)
  const linear = { ...handModel(), next: () => ({ $: 'Con', head: { $: 'A' }, tail: { $: 'Nil' } }) }
  const deep = enumerateSpace(linear, { bound: 40 })
  assert.equal(deep.complete, true)
  assert.equal(deep.cases.length, 1)
  assert.equal(deep.cases[0].trace.length, 40)
})

test('space refuses bounds that are not positive safe integers', () => {
  for (const bound of [-1, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => enumerateSpace(handModel(), { bound }),
      (error) => error.code === 'USAGE',
    )
  }
})

// ── transition cover: 도달 가능한 (상태, 허용 사건) 조합마다 모든 사건 (손 모델) ───────────────────────────────

/** 세 열의 순서처럼 유한한 모델: 상태는 0..3, R은 한 칸 회전, X는 그대로. 3에는 bound 1의 trace가 닿지 않는다. */
function ringModel() {
  return {
    prefix: 'Ring',
    digest: 'ring-model',
    init: () => ({ $: 'Ring', at: 0n }),
    step: (state, event) => ({ $: 'Ring', at: event.$ === 'R' ? (state.at + 1n) % 4n : state.at }),
    observe: (state) => state.at,
    next: () => ({ $: 'Con', head: { $: 'R' }, tail: { $: 'Con', head: { $: 'X' }, tail: { $: 'Nil' } } }),
  }
}

test('the transition cover takes every allowed event from every reachable configuration, with the model computing each expectation', () => {
  const model = ringModel()
  const space = enumerateSpace(model, { bound: 2 })
  const cover = transitionCover(model, space)
  assert.equal(cover.status, 'closed')
  assert.equal(cover.configurations, 4)
  assert.equal(cover.pairs, 8)
  // state 2 is first reached by R·R (depth 2) and state 3 by R·R·R: their events are traces the bound-2 space never ran
  assert.deepEqual(
    cover.cases.map(({ label }) => label),
    ['R · R · R', 'R · R · X', 'R · R · R · R', 'R · R · R · X'],
  )
  assert.ok(cover.cases.every(({ trace }) => trace.length > space.bound))
  assert.deepEqual(cover.cases.find(({ label }) => label === 'R · R · R · R').observations, [1, 2, 3, 0])
  assert.match(cover.cases[0].id, /^C[a-f0-9]{12}$/)
  // deterministic: the same model and bound give the same cover
  assert.deepEqual(transitionCover(ringModel(), enumerateSpace(ringModel(), { bound: 2 })), cover)

  // a product wrong only in state 3 passes every bound-2 case and fails a cover case
  const product = {
    init: () => 0,
    // R from 3 should wrap to 0; this product sticks at 3
    step: (state, event) => (event.$ === 'R' ? Math.min(state + 1, 3) : state),
    observe: (state) => state,
  }
  assert.equal(checkConformance(space, product).pass, true)
  const failed = checkConformance({ ...space, cases: cover.cases }, product)
  assert.equal(failed.pass, false)
  assert.deepEqual(failed.failures[0].trace.map(({ $ }) => $), ['R', 'R', 'R', 'R'])
})

test('an unbounded model caps its transition cover at a stated depth instead of running forever', () => {
  const counter = {
    prefix: 'Count',
    digest: 'count-model',
    init: () => 0n,
    step: (state) => state + 1n,
    observe: (state) => state,
    next: () => ({ $: 'Con', head: { $: 'Inc' }, tail: { $: 'Nil' } }),
  }
  const space = enumerateSpace(counter, { bound: 2 })
  const cover = transitionCover(counter, space, { maxConfigurations: 5 })
  assert.equal(cover.status, 'capped')
  assert.equal(cover.configurations, 5)
  // capped covers the configurations the bound reaches and every event from them; fast-check samples past it
  assert.equal(cover.coveredDepth, 2)
  assert.deepEqual(cover.cases.map(({ label }) => label), ['Inc · Inc · Inc'])
  assert.match(cover.reason, /more than 5 configurations/)
})

/** `next(history)`가 상태·지금 허용 사건에 없는 과거를 읽는 환경: A·B 뒤에는 둘 다 C만 허용하지만 C 다음은 B로 시작했을 때만 Bad다. */
function historyModel() {
  const names = (list) => {
    const found = []
    for (let cursor = list; cursor.$ === 'Con'; cursor = cursor.tail) found.push(cursor.head.$)
    return found
  }
  const listOfNames = (items) => items.reduceRight((tail, name) => ({ $: 'Con', head: { $: name }, tail }), { $: 'Nil' })
  return {
    prefix: 'History',
    digest: 'history-model',
    init: () => ({ $: 'State', bad: 0n }),
    step: (state, event) => ({ $: 'State', bad: event.$ === 'Bad' ? 1n : state.bad }),
    observe: (state) => state.bad,
    next: (history) => {
      const path = names(history).join(',')
      if (path === '') return listOfNames(['A', 'B'])
      if (path === 'A' || path === 'B') return listOfNames(['C'])
      if (path === 'B,C') return listOfNames(['Bad'])
      return listOfNames([])
    },
  }
}

test('the transition cover does not merge two histories whose next allowed events differ one step later', () => {
  const model = historyModel()
  const space = enumerateSpace(model, { bound: 1 })
  const cover = transitionCover(model, space)
  // A and B reach the same state with the same allowed events (C), yet only B·C allows Bad — merging them loses B·C·Bad
  assert.ok(cover.cases.some(({ label }) => label === 'B · C · Bad'))
  assert.equal(cover.status, 'closed')
  // the closed claim names what a configuration is, so a reader sees which environments it can merge
  assert.match(cover.basis, /allowed events.*one step later/)

  // a product that never reaches the bad state passes the bound-1 space and fails the cover
  const product = { init: () => 0, step: (state) => state, observe: (state) => state }
  assert.equal(checkConformance(space, product).pass, true)
  const failed = checkConformance({ ...space, cases: cover.cases }, product)
  assert.equal(failed.pass, false)
  assert.deepEqual(failed.failures[0].trace.map(({ $ }) => $), ['B', 'C', 'Bad'])
})

// ── minimum cover: 동치류·경계값 항목을 모두 덮는 최소 trace 묶음 (손 모델) ──────────────────────────────────

test('the minimum cover takes every event × state class once, so a single-pair defect still fails with far fewer traces', () => {
  const model = ringModel()
  const space = enumerateSpace(model, { bound: 2 })
  const cover = minimalCover(model, space)
  assert.equal(cover.status, 'closed')
  assert.equal(cover.configurations, 4)
  // X at 0, 1, 2 and 3 and R at 3 are the pairs the shortest traces reach; R at 0, 1 and 2 ride along inside them
  assert.deepEqual(
    cover.cases.map(({ label }) => label),
    ['X', 'R · X', 'R · R · X', 'R · R · R · R', 'R · R · R · X'],
  )
  assert.match(cover.cases[0].id, /^T[a-f0-9]{12}$/)
  assert.deepEqual(minimalCover(ringModel(), enumerateSpace(ringModel(), { bound: 2 })), cover)

  // R from 3 should wrap to 0; this product sticks at 3 — only the (R, at=3) pair shows it, and bound 2 never gets there
  const product = {
    init: () => 0,
    step: (state, event) => (event.$ === 'R' ? Math.min(state + 1, 3) : state),
    observe: (state) => state,
  }
  assert.equal(checkConformance(space, product).pass, true)
  const failed = checkConformance({ ...space, cases: cover.cases }, product)
  assert.equal(failed.pass, false)
  assert.deepEqual(failed.failures[0].trace.map(({ $ }) => $), ['R', 'R', 'R', 'R'])
})

test('a wide event domain folds to its boundary values: twenty picks need a handful of traces, not four hundred', () => {
  const list = (items) => items.reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' })
  const model = {
    prefix: 'Wide',
    digest: 'wide-model',
    init: () => 0n,
    step: (_state, event) => event.n,
    observe: (state) => state,
    next: () => list(Array.from({ length: 20 }, (_, index) => ({ $: 'Pick', n: BigInt(index + 1) }))),
  }
  const space = enumerateSpace(model, { bound: 2 })
  const cover = minimalCover(model, space)
  assert.equal(space.cases.length, 400)
  assert.equal(cover.cases.length, 20)
  // low, low+1, high-1 and high of 1..20 are all in; the middle of the domain is one representative, not seventeen
  const values = new Set(cover.cases.flatMap(({ trace }) => trace.map(({ n }) => n)))
  for (const boundary of [1, 2, 19, 20]) assert.ok(values.has(boundary), `Pick{${boundary}} is a boundary value`)
  assert.equal([...values].filter((value) => value > 2 && value < 19).length, 1)

  // a product that ignores Pick{1} after the first event sits behind no boundary of the space, yet a cover trace takes it
  const product = {
    init: () => ({ last: 0, index: 0 }),
    step: (state, event) => {
      const ignored = state.index > 0 && event.n === 1
      return { last: ignored ? state.last : event.n, index: state.index + 1 }
    },
    observe: (state) => state.last,
  }
  assert.equal(checkConformance({ ...space, cases: cover.cases }, product).pass, false)
})

test('the minimum cover only takes events the environment allows, even when it merges histories', () => {
  const model = historyModel()
  const cover = minimalCover(model, enumerateSpace(model, { bound: 1 }))
  assert.equal(cover.status, 'closed')
  assert.ok(cover.cases.every(({ trace }) => classifyTrace(model, trace).verdict === 'in-space'))
  // Bad is allowed only after B · C, and a state class alone cannot name that path — the trace is still found
  assert.ok(cover.cases.some(({ label }) => label === 'B · C · Bad'))
})

test('an unbounded model caps its minimum cover at the bound and says so', () => {
  const counter = {
    prefix: 'Count',
    digest: 'count-model',
    init: () => 0n,
    step: (state) => state + 1n,
    observe: (state) => state,
    next: () => ({ $: 'Con', head: { $: 'Inc' }, tail: { $: 'Nil' } }),
  }
  const cover = minimalCover(counter, enumerateSpace(counter, { bound: 2 }), { maxConfigurations: 5 })
  assert.equal(cover.status, 'capped')
  assert.equal(cover.coveredDepth, 2)
  assert.deepEqual(cover.cases.map(({ label }) => label), ['Inc · Inc · Inc'])
})

test('a joint case starts the product on its world coordinates; an adapter that cannot take them fails instead of passing on the default fixture', () => {
  const space = {
    spaceDigest: 'synthetic',
    complete: true,
    initial: 0,
    cases: [
      { id: 'Mplain', label: 'A', trace: [{ $: 'A' }], observations: [1] },
      { id: 'Jjoint', label: 'rows=Empty · A', coordinates: { rows: 'Empty' }, trace: [{ $: 'A' }], observations: [1] },
    ],
  }
  const seen = []
  const adapter = {
    init: (coordinates) => {
      seen.push(coordinates)
      return 0
    },
    step: (state) => state + 1,
    observe: (state) => state,
  }
  assert.equal(checkConformance(space, adapter).pass, true)
  assert.deepEqual(seen, [undefined, { rows: 'Empty' }])
  // init() without a parameter would run the joint case on the default fixture and pass vacuously
  const blind = { init: () => 0, step: (state) => state + 1, observe: (state) => state }
  const report = checkConformance(space, blind)
  assert.equal(report.pass, false)
  assert.deepEqual(
    report.failures.map((failure) => [failure.caseId, failure.status]),
    [['Jjoint', 'adapter-error']],
  )
  assert.match(report.failures[0].error, /^ADAPTER_JOINT_UNSUPPORTED/)
})

// ── conform: 관측 대조 (합성 공간, mock) ─────────────────────────────────────────────

const SPACE = {
  spaceDigest: 'synthetic',
  complete: true,
  initial: 0,
  cases: [{ id: 'Mcase', label: 'A', trace: [{ $: 'A' }], observations: [1] }],
}

test('conformance never counts an undefined observation or an adapter error as a pass', () => {
  const silent = checkConformance(SPACE, { init: () => 0, step: (state) => state + 1, observe: () => undefined })
  assert.equal(silent.pass, false)
  assert.deepEqual(
    { status: silent.failures[0].status, step: silent.failures[0].step, observed: silent.failures[0].observed },
    { status: 'mismatch', step: 0, observed: null },
  )

  const broken = checkConformance(SPACE, {
    init: () => 0,
    step: () => {
      throw new Error('unmapped event')
    },
    observe: (state) => state,
  })
  assert.equal(broken.pass, false)
  assert.equal(broken.failures[0].status, 'adapter-error')
  assert.equal(broken.failures[0].error, 'unmapped event')

  assert.throws(
    () => checkConformance(SPACE, { init: () => 0, observe: () => 0 }),
    (error) => error.code === 'ADAPTER_INTERFACE',
  )
})

test('an incomplete space never passes conformance even when every explored case matches', () => {
  const report = checkConformance(
    { ...SPACE, complete: false },
    { init: () => 0, step: (state) => state + 1, observe: (state) => state },
  )
  assert.equal(report.passed, 1)
  assert.equal(report.pass, false)
})

test('loadModel refuses foreign, unsafe or hub-imported model code before running bend', async (t) => {
  const root = await workspace(t)
  await writeFile(join(root, 'MODEL.bend'), 'import Base\nimport ./helper.bend as H\n')
  await writeFile(join(root, 'helper.bend'), 'import Base\ndef e(x: U32) -> IO(Unit):\n  import "./e.js"\n')
  const bend = await fakeBend(root, { stdout: '' })
  await assert.rejects(loadModel({ model: join(root, 'MODEL.bend'), prefix: 'Search', bin: bend.bin }), (error) => {
    return error.code === 'MODEL_UNTRUSTED' && /helper\.bend: foreign import/.test(error.message)
  })
  assert.equal(await bend.ran(), false)
})

// ── Formal Model 구조 검사 (mock) ─────────────────────────────────────────────────────

async function formalContext(overrides = {}) {
  const card = await readFile(join(FIXTURE, 'oracle.md'), 'utf8')
  const files = {
    'MODEL.bend': await readFile(join(FIXTURE, 'MODEL.bend'), 'utf8'),
    'LAWS.bend': await readFile(join(FIXTURE, 'LAWS.bend'), 'utf8'),
    ...overrides.files,
  }
  return {
    formal: parseFormalModel((overrides.card ?? card).split('\n')),
    context: {
      policies: new Set(['P1', 'P2', 'P3']),
      rows: new Set(['O1', 'O2', 'O3', 'O4']),
      invariants: new Set(),
      sources: new Map([
        ['S1', { repoPath: 'README.md', authoritative: true }],
        ['S2', { repoPath: 'MODEL.bend', authoritative: true }],
        ['S3', { repoPath: 'LAWS.bend', authoritative: true }],
        ...(overrides.sources ?? []),
      ]),
      readSource: async (path) => files[path] ?? null,
    },
  }
}

async function formalIssues(overrides) {
  const { formal, context } = await formalContext(overrides)
  return formalModelIssues(formal, context)
}

async function cardWith(from, to) {
  const card = await readFile(join(FIXTURE, 'oracle.md'), 'utf8')
  assert.ok(from.test(card), `oracle.md lacks ${from}`)
  return card.replace(from, to)
}

test('the fixture Formal Model is structurally complete', async () => {
  assert.deepEqual(await formalIssues(), [])
})

test('a law table row without a law, and a law without a row, are both reported', async () => {
  const issues = await formalIssues({
    files: {
      'LAWS.bend': (
        await readFile(join(FIXTURE, 'LAWS.bend'), 'utf8')
      ).replace('law issue_advances:', 'law issue_moves:'),
    },
  })
  assert.ok(issues.includes('formal-law-undeclared: issue_advances is not a law in LAWS.bend'), issues.join('\n'))
  assert.ok(issues.includes('formal-law-unmapped: issue_moves in LAWS.bend has no Formal Model row'), issues.join('\n'))
})

test('an effect law needs a witness for its policy, and safety laws alone are vacuous', async () => {
  const unwitnessed = await formalIssues({
    card: await cardWith(
      /\| latest_reachable +\| witness +\| P1 P3 O1 O3 +\|/,
      '| latest_reachable | witness | P3 O3 |',
    ),
  })
  assert.ok(
    unwitnessed.some((issue) => issue.startsWith('formal-witness-missing: P1 ')),
    unwitnessed.join('\n'),
  )

  const safetyOnly = await formalIssues({
    card: (await readFile(join(FIXTURE, 'oracle.md'), 'utf8')).replaceAll(/\| effect +\|/g, '| safety |'),
  })
  assert.ok(
    safetyOnly.some((issue) => issue.startsWith('formal-effect-missing:')),
    safetyOnly.join('\n'),
  )

  const notWitness = await formalIssues({
    card: await cardWith(/\| stale_ignored +\| safety +\|/, '| stale_ignored    | witness |'),
  })
  assert.ok(
    notWitness.includes('formal-witness-shape: stale_ignored is a witness row but its law asks for no exs witness'),
    notWitness.join('\n'),
  )
})

test('laws must cite real card policies, and an unformalized policy must be listed', async () => {
  const unknown = await formalIssues({ card: await cardWith(/\| P2 O2 +\|/, '| P9 O2 |') })
  assert.ok(unknown.includes('formal-law-cite-unknown: stale_ignored: P9 is not on this card'), unknown.join('\n'))
  assert.ok(
    unknown.includes('formal-policy-unlisted: P2 is cited by no law and not listed under Not formalized'),
    unknown.join('\n'),
  )

  const listed = await formalIssues({
    card: (
      await cardWith(/\| P2 O2 +\|/, '| P1 O2 |')
    ).replace('- Not formalized: none', '- Not formalized: P2 — covered by O2 tests only'),
  })
  assert.equal(
    listed.some((issue) => issue.includes('P2')),
    false,
    listed.join('\n'),
  )
})

test('every local file the model or laws import must be a locked source, and untrusted code is refused', async () => {
  const model = (await readFile(join(FIXTURE, 'MODEL.bend'), 'utf8')).replace(
    'import Base\n',
    'import Base\nimport ./helpers.bend as H\n',
  )
  const unlocked = await formalIssues({ files: { 'MODEL.bend': model, 'helpers.bend': 'import Base\n' } })
  assert.ok(
    unlocked.includes(
      'formal-import-unlocked: helpers.bend (imported by MODEL.bend) is not a repo: Source Registry source',
    ),
    unlocked.join('\n'),
  )

  const locked = await formalIssues({
    files: { 'MODEL.bend': model, 'helpers.bend': 'import Base\n' },
    sources: [['S4', { repoPath: 'helpers.bend', authoritative: true }]],
  })
  assert.deepEqual(locked, [])

  const foreign = await formalIssues({
    files: {
      'MODEL.bend': `${model}\ndef e(x: U32) -> IO(Unit):\n  import "./e.js"\n`,
      'helpers.bend': 'import Base\n',
    },
    sources: [['S4', { repoPath: 'helpers.bend', authoritative: true }]],
  })
  assert.ok(
    foreign.some((issue) => issue.startsWith('formal-untrusted-code: MODEL.bend')),
    foreign.join('\n'),
  )
})

test('the laws must import the locked model, and model and laws need approved authoritative sources', async () => {
  const detached = await formalIssues({
    files: {
      'LAWS.bend': (
        await readFile(join(FIXTURE, 'LAWS.bend'), 'utf8')
      ).replace('import ./MODEL.bend as M', 'import ./OTHER.bend as M'),
      'OTHER.bend': 'import Base\n',
    },
    sources: [['S4', { repoPath: 'OTHER.bend', authoritative: true }]],
  })
  assert.ok(
    detached.some((issue) => issue.startsWith('formal-laws-target: LAWS.bend must import the Model source MODEL.bend')),
    detached.join('\n'),
  )

  const reference = await formalIssues({ sources: [['S2', { repoPath: 'MODEL.bend', authoritative: false }]] })
  assert.ok(
    reference.some((issue) => issue.startsWith('formal-model-source: Model')),
    reference.join('\n'),
  )
})

test('card lint runs the Formal Model checks on the fixture card and on a broken copy', async (t) => {
  const root = await fixtureCopy(t)
  const verify = (cwd) =>
    spawnSync(process.execPath, [join(SCRIPTS, 'oracle-verify.mjs'), 'card', '--oracle', 'oracle.md'], {
      cwd,
      encoding: 'utf8',
    })

  const clean = verify(root)
  assert.equal(clean.status, 0, clean.stderr)
  assert.match(clean.stdout, /CARD_LINT_OK 4 rows/)

  await edit(join(root, 'oracle.md'), '- Bound: 4', '- Bound: 40')
  const deep = verify(root)
  assert.equal(deep.status, 0, deep.stderr)

  await edit(join(root, 'oracle.md'), '- Bound: 40', '- Bound: 0')
  const broken = verify(root)
  assert.equal(broken.status, 1)
  assert.match(broken.stderr, /formal-bound: Bound must be a positive safe integer/)
})

test('the lock covers the model and laws: a changed law fails verify, a changed proof candidate does not', async (t) => {
  const root = await fixtureCopy(t)
  // this test is about what the lock covers, not the pre-lock stages (oracle-stage.test.mjs): the package sits beside the
  // card here, so record it as DRAFTED on its current bytes and the inputs CHECKED would have judged
  const packageBytes = await readFile(join(root, 'oracle.package.json'))
  await writeFile(
    join(root, 'stage.json'),
    JSON.stringify({ schemaVersion: 1, stage: 'DRAFTED', packageSha256: sha256(packageBytes), inputsSha256: await inputsPin(root, { root }), history: [] }),
  )
  const lock = (...args) =>
    spawnSync(process.execPath, [join(SCRIPTS, 'oracle-lock.mjs'), ...args], { cwd: root, encoding: 'utf8' })

  const withoutModel = lock(
    'create',
    '--oracle',
    'oracle.md',
    '--lock',
    'oracle.lock.json',
    '--source',
    'README.md',
    '--source',
    'LAWS.bend',
  )
  assert.equal(withoutModel.status, 1)
  assert.match(withoutModel.stderr, /source-repo-path: S2: repo: source must be a regular file/)

  const created = lock(
    'create',
    '--oracle',
    'oracle.md',
    '--lock',
    'oracle.lock.json',
    '--source',
    'README.md',
    '--source',
    'MODEL.bend',
    '--source',
    'LAWS.bend',
  )
  assert.equal(created.status, 0, created.stderr)

  await edit(
    join(root, 'PROOF.bend'),
    'def Laws.issue_advances(latest, shown):\n  {==}',
    'def Laws.issue_advances(latest, shown):\n  ?TODO',
  )
  assert.equal(lock('verify', '--lock', 'oracle.lock.json').status, 0)

  await edit(
    join(root, 'LAWS.bend'),
    '{Nat.is_lt(id, latest) == True{} : Bool}',
    '{Nat.is_lt(id, 0n) == True{} : Bool}',
  )
  const weakened = lock('verify', '--lock', 'oracle.lock.json')
  assert.equal(weakened.status, 1)
  assert.match(weakened.stderr, /SOURCE_CHANGED/)
})

test('init refuses a locked Formal Model card unless the law proof run is a required label', async (t) => {
  const repository = await workspace(t)
  await cp(FIXTURE, repository, { recursive: true })
  const oracleDirectory = join(repository, '.ai', 'oracles', 'stale-search')
  await mkdir(oracleDirectory, { recursive: true })
  await mkdir(join(repository, 'src'), { recursive: true })
  await writeFile(join(repository, 'src', 'index.mjs'), 'export {}\n')
  await cp(join(repository, 'oracle.md'), join(oracleDirectory, 'oracle.md'))
  const lock = join(oracleDirectory, 'oracle.lock.json')
  const node = (script, args) =>
    spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd: repository, encoding: 'utf8' })
  const locked = node('oracle-lock.mjs', [
    'create',
    '--oracle',
    join(oracleDirectory, 'oracle.md'),
    '--lock',
    lock,
    '--source',
    'README.md',
    '--source',
    'MODEL.bend',
    '--source',
    'LAWS.bend',
  ])
  assert.equal(locked.status, 0, locked.stderr)

  const init = (...labels) =>
    node('oracle-run.mjs', [
      'init',
      '--dir',
      oracleDirectory,
      '--lock',
      lock,
      '--scan-root',
      join(repository, 'src'),
      ...labels.flatMap((label) => ['--required-label', label]),
    ])
  const refused = init('behavior')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /^FORMAL_PROOF_LABEL_REQUIRED: /)

  const accepted = init('behavior', 'bend-proof:reported')
  assert.equal(accepted.status, 0, accepted.stderr)
})

// ── laws: 관계·불변식을 모든 칸에서 계산 (가짜 컴파일 def, mock) ───────────────────────────────

/**
 * lawReport가 Bend 원문에서 읽는 것은 타입 선언과 def 서명 줄뿐이라 본문은 `...`이다. 컴파일된 def 자리에는 같은 값 모양
 * (oracle-types.mjs)을 받는 JS 함수를 둔다 — 어떤 기대값의 출처도 아니고, 호출을 세어 "아무것도 계산하지 않았다"를 본다.
 */
const stubbed = (signature) => `${signature}:\n  ...`
const modelSource = (types, ...signatures) => `import Base\n\n${types}\n\n${signatures.map(stubbed).join('\n\n')}\n`

function fakeCompiled(functions) {
  const calls = []
  const exported = Object.fromEntries(
    Object.entries(functions).map(([name, fn]) => [
      name,
      (...args) => {
        calls.push(name)
        return fn(...args)
      },
    ]),
  )
  return { exported, calls }
}

/** 코드가 있는 오류: 코드·exit code(2)·메시지에 든(들지 않은) 문구. */
function assertRefused(run, { code, has = [], lacks = [] }) {
  assert.throws(run, (error) => {
    assert.equal(error.code, code)
    assert.equal(error.exitCode, 2)
    for (const text of has) assert.ok(error.message.includes(text), `${error.message} lacks ${text}`)
    for (const text of lacks) assert.ok(!error.message.includes(text), `${error.message} has ${text}`)
    return true
  })
}

/** strength의 개수 필드만 — 칸 목록과 부가 필드는 따로 본다. */
const counts = ({ scope, pinnedCount, freeCount, emptyCount, alternatives, marginal }) => ({
  scope,
  pinnedCount,
  freeCount,
  emptyCount,
  alternatives,
  marginal,
})

// 상태 둘 × 명령 둘 = 칸 넷이라 손으로 센다. R_hold_again은 R_hold_keeps의 복사본이고, 서명이 어긋난 def는 거부 시험용이다.
const GATE_SOURCE = modelSource(
  'type Gate is Data:\n  Open{}\n  Shut{}\n\ntype Cmd is Data:\n  Flip{}\n  Hold{}',
  'def Gate.step(s: Gate, c: Cmd) -> Gate',
  'def Gate.R_hold_keeps(s: Gate, c: Cmd, t: Gate) -> Bool',
  'def Gate.R_hold_again(+s: +Gate, +c: +Cmd, t: Gate) -> Bool',
  'def Gate.R_flip_changes(s: Gate, c: Cmd, t: Gate) -> Bool',
  'def Gate.is_open(s: Gate) -> Bool',
  'def Gate.same(s: Gate) -> Gate',
  'def Gate.R_swapped(s: Cmd, c: Gate, t: Gate) -> Bool',
  'def Gate.R_after_cmd(s: Gate, c: Cmd, t: Cmd) -> Bool',
  'def Gate.R_two(s: Gate, c: Cmd) -> Bool',
  'def Gate.R_four(s: Gate, c: Cmd, t: Gate, u: Gate) -> Bool',
  'def Gate.R_gate(s: Gate, c: Cmd, t: Gate) -> Gate',
  'def Gate.pair(s: Gate, c: Cmd) -> Bool',
  'def Gate.of_cmd(s: Cmd) -> Bool',
)
const gate = (name) => ({ $: name })
const flipGate = (state) => gate(state.$ === 'Open' ? 'Shut' : 'Open')
const holdKeeps = (state, command, after) => command.$ !== 'Hold' || after.$ === state.$
const GATE = {
  'Gate.step': (state, command) => (command.$ === 'Flip' ? flipGate(state) : state),
  'Gate.R_hold_keeps': holdKeeps,
  'Gate.R_hold_again': holdKeeps,
  'Gate.R_flip_changes': (state, command, after) => command.$ !== 'Flip' || after.$ !== state.$,
  'Gate.is_open': (state) => state.$ === 'Open',
  'Gate.same': (state) => state,
}
const gateLaws = (options, exported = GATE) =>
  lawReport({ source: GATE_SOURCE, exported, prefix: 'Gate', state: 'Gate', command: 'Cmd', ...options })
// one wrong cell: a held Shut gate opens
const slipStep = (state, command) => {
  if (state.$ === 'Shut' && command.$ === 'Hold') return gate('Open')
  return GATE['Gate.step'](state, command)
}
const SLIPPING = { ...GATE, 'Gate.step': slipStep }

test('lawReport pins a cell when every next state the relations allow looks the same, and counts what each relation adds', () => {
  const both = gateLaws({ relations: ['R_hold_keeps', 'R_flip_changes'] })
  assert.equal(both.status, 'ok')
  assert.deepEqual(both.relations, ['Gate.R_hold_keeps', 'Gate.R_flip_changes'])
  assert.deepEqual(both.domain, { states: 2, commands: 2, cells: 4 })
  assert.equal(both.bounded, false)
  assert.equal(both.counterexampleCount, 0)
  assert.deepEqual(both.strength, {
    scope: 'state',
    pinnedCount: 4,
    freeCount: 0,
    emptyCount: 0,
    alternatives: 0,
    // the two Hold cells need R_hold_keeps and the two Flip cells need R_flip_changes
    marginal: { 'Gate.R_hold_keeps': 2, 'Gate.R_flip_changes': 2 },
    freeCells: [],
  })
  assert.equal('hint' in both, false)

  // R_hold_keeps alone leaves the Flip cells open between Open and Shut; open cells are a report, not a failure
  const holdOnly = gateLaws({ relations: ['R_hold_keeps'] })
  assert.equal(holdOnly.status, 'ok')
  assert.deepEqual(counts(holdOnly.strength), {
    scope: 'state',
    pinnedCount: 2,
    freeCount: 2,
    emptyCount: 0,
    alternatives: 2,
    marginal: { 'Gate.R_hold_keeps': 2 },
  })
  assert.deepEqual(holdOnly.strength.freeCells, [
    { state: 'M.Open{}', command: 'M.Flip{}', alternatives: 1 },
    { state: 'M.Shut{}', command: 'M.Flip{}', alternatives: 1 },
  ])
  assert.match(holdOnly.hint, /^2 cells leave the next state open/)

  // a relation another one repeats adds nothing: dropping either of the twins leaves every cell pinned
  const twins = gateLaws({ relations: ['R_hold_keeps', 'R_hold_again', 'R_flip_changes'] })
  assert.equal(twins.strength.pinnedCount, 4)
  assert.deepEqual(twins.strength.marginal, { 'Gate.R_hold_keeps': 0, 'Gate.R_hold_again': 0, 'Gate.R_flip_changes': 2 })

  // the same relation named twice is one relation, not a twin that hides what it adds
  const repeated = fakeCompiled(GATE)
  const once = gateLaws({ relations: ['R_hold_keeps', 'R_flip_changes', 'R_hold_keeps'] }, repeated.exported)
  assert.deepEqual(once.relations, ['Gate.R_hold_keeps', 'Gate.R_flip_changes'])
  assert.deepEqual(once.strength.marginal, { 'Gate.R_hold_keeps': 2, 'Gate.R_flip_changes': 2 })
  assert.equal(repeated.calls.length, once.evaluations)
  assert.equal(once.evaluations, 20)
})

test('lawReport lists each cell where the step breaks a relation with the state, event and what the step gave', () => {
  // Flip keeps and Hold flips: every cell breaks exactly one relation
  const inverted = { ...GATE, 'Gate.step': (state, command) => (command.$ === 'Hold' ? flipGate(state) : state) }
  const report = gateLaws({ relations: ['R_hold_keeps', 'R_flip_changes'] }, inverted)
  assert.equal(report.status, 'counterexample')
  assert.equal(report.counterexampleCount, 4)
  assert.deepEqual(report.counterexamples, [
    { relation: 'Gate.R_flip_changes', state: 'M.Open{}', command: 'M.Flip{}', after: 'M.Open{}' },
    { relation: 'Gate.R_hold_keeps', state: 'M.Open{}', command: 'M.Hold{}', after: 'M.Shut{}' },
    { relation: 'Gate.R_flip_changes', state: 'M.Shut{}', command: 'M.Flip{}', after: 'M.Shut{}' },
    { relation: 'Gate.R_hold_keeps', state: 'M.Shut{}', command: 'M.Hold{}', after: 'M.Open{}' },
  ])
  // strength reads the relations alone: the broken step changes nothing about it
  assert.equal(report.strength.pinnedCount, 4)
  assert.match(report.hint, /Gate\.R_flip_changes.*M\.Open\{\}.*M\.Flip\{\}/)

  // one wrong cell is one counterexample
  const single = gateLaws({ relations: ['R_hold_keeps', 'R_flip_changes'] }, SLIPPING)
  assert.equal(single.counterexampleCount, 1)
  assert.deepEqual(single.counterexamples, [
    { relation: 'Gate.R_hold_keeps', state: 'M.Shut{}', command: 'M.Hold{}', after: 'M.Open{}' },
  ])
})

// 필드 둘짜리 record 상태: 법칙이 열어 둔 필드가 어느 것이고 모델의 step이 그 필드를 지키는지 본다
const LAMP_TYPES = 'type Lamp is Data:\n  Lamp{lit: Bool, mark: Bool}\n\ntype Cmd is Data:\n  Tap{}\n  Wait{}'
const LAMP_SIGNATURES = [
  'def Lamp.step(s: Lamp, c: Cmd) -> Lamp',
  'def Lamp.R_tap_lights(s: Lamp, c: Cmd, t: Lamp) -> Bool',
  'def Lamp.lit(s: Lamp) -> Bool',
]
const lamp = (lit, mark) => ({ $: 'Lamp', lit, mark })
const LAMP = {
  // Tap lights the lamp; the mark is never touched
  'Lamp.step': (state, command) => lamp(command.$ === 'Tap' || state.lit, state.mark),
  'Lamp.R_tap_lights': (_state, command, after) => command.$ !== 'Tap' || after.lit === true,
  'Lamp.lit': (state) => state.lit,
}
const lampLaws = (options, exported = LAMP, signatures = LAMP_SIGNATURES) =>
  lawReport({
    source: modelSource(LAMP_TYPES, ...signatures),
    exported,
    prefix: 'Lamp',
    state: 'Lamp',
    command: 'Cmd',
    relations: ['R_tap_lights'],
    ...options,
  })

test('lawReport names the record fields a free cell leaves open and whether the model keeps each', () => {
  const kept = lampLaws({})
  assert.deepEqual(kept.domain, { states: 4, commands: 2, cells: 8 })
  // Tap cells leave two candidates, Wait cells all four: 4·1 + 4·3 alternatives
  assert.deepEqual(counts(kept.strength), {
    scope: 'state',
    pinnedCount: 0,
    freeCount: 8,
    emptyCount: 0,
    alternatives: 16,
    marginal: { 'Lamp.R_tap_lights': 0 },
  })
  assert.deepEqual(kept.strength.freeCells.slice(0, 2), [
    {
      state: 'M.Lamp{False{}, False{}}',
      command: 'M.Tap{}',
      alternatives: 1,
      freeFields: [{ field: 'mark', kept: true }],
    },
    {
      state: 'M.Lamp{False{}, False{}}',
      command: 'M.Wait{}',
      alternatives: 3,
      freeFields: [
        { field: 'lit', kept: true },
        { field: 'mark', kept: true },
      ],
    },
  ])
  // the hint names the fields the model keeps, the most open first
  assert.match(kept.hint, /mark in 8 cells/)
  assert.match(kept.hint, /lit in 4 cells/)
  assert.match(kept.hint, /frame law/)

  // a step that moves every open field keeps none of them: the hint falls back to the plain free-cell advice
  const flipping = {
    ...LAMP,
    'Lamp.step': (state, command) => lamp(command.$ === 'Tap' || !state.lit, !state.mark),
  }
  const moved = lampLaws({}, flipping)
  assert.deepEqual(moved.strength.freeCells.slice(0, 2).map(({ freeFields }) => freeFields), [
    [{ field: 'mark', kept: false }],
    [
      { field: 'lit', kept: false },
      { field: 'mark', kept: false },
    ],
  ])
  assert.match(moved.hint, /^8 cells leave the next state open/)
  assert.doesNotMatch(moved.hint, /frame law/)
})

test('lawReport measures strength on the --observe def, else <prefix>.observe, else the whole state', () => {
  // pinned means one observed value: Tap cells still differ in mark, but the lamp light is the same in all of them
  const run = (options, signatures = LAMP_SIGNATURES, exported = LAMP) => {
    const { exported: counted, calls } = fakeCompiled(exported)
    return { report: lampLaws(options, counted, signatures), calls }
  }
  const whole = run({})
  assert.equal(whole.report.strength.scope, 'state')
  assert.equal(whole.report.strength.pinnedCount, 0)

  const lit = run({ observe: 'lit' })
  assert.deepEqual(counts(lit.report.strength), {
    scope: 'Lamp.lit',
    pinnedCount: 4,
    freeCount: 4,
    emptyCount: 0,
    // the Wait cells have four candidates but two observed values
    alternatives: 4,
    marginal: { 'Lamp.R_tap_lights': 4 },
  })
  assert.equal('freeFields' in lit.report.strength.freeCells[0], false)
  // 8 cells × 4 candidates + 8 step calls + 4 observe calls
  assert.equal(lit.report.evaluations, 44)
  assert.equal(lit.calls.length, 44)
  assert.equal(whole.calls.length, whole.report.evaluations)

  // a model that exports observe(state) is measured there without being asked; --observe still wins
  const withObserve = [...LAMP_SIGNATURES, 'def Lamp.observe(s: Lamp) -> Bool']
  const observing = { ...LAMP, 'Lamp.observe': (state) => state.lit }
  assert.equal(run({}, withObserve, observing).report.strength.scope, 'Lamp.observe')
  assert.equal(run({ observe: 'lit' }, withObserve, observing).report.strength.scope, 'Lamp.lit')
  // an observe that does not take the state alone is not the model's observation
  const notObserve = [...LAMP_SIGNATURES, 'def Lamp.observe(s: Lamp, c: Cmd) -> Bool']
  assert.equal(run({}, notObserve, observing).report.strength.scope, 'state')
})

// 상한을 거는 도메인: 상태는 Nat 하나
const BOX_SOURCE = modelSource(
  'type Box is Data:\n  Box{n: Nat}\n\ntype Cmd is Data:\n  Go{}',
  'def Box.step(s: Box, c: Cmd) -> Box',
  'def Box.R_any(s: Box, c: Cmd, t: Box) -> Bool',
  'def Box.R_stay(s: Box, c: Cmd, t: Box) -> Bool',
  'def Box.R_far(s: Box, c: Cmd, t: Box) -> Bool',
  'def Box.even(s: Box) -> Bool',
)
const box = (n) => ({ $: 'Box', n })
const BOX = {
  'Box.step': (state) => box(state.n + 1n),
  'Box.R_any': () => true,
  'Box.R_stay': (state, _command, after) => after.n === state.n,
  'Box.R_far': (state, _command, after) => after.n === state.n + 5n,
  'Box.even': (state) => state.n % 2n === 0n,
}
const boxLaws = (options, exported = BOX) =>
  lawReport({ source: BOX_SOURCE, exported, prefix: 'Box', state: 'Box', command: 'Cmd', ...options })

test('lawReport calls a cell empty when no candidate in the bounded domain fits, and still judges a step that leaves the domain', () => {
  // the step jumps by five and so does the relation: it holds, but no candidate in 0..2 is five ahead
  const leaping = { ...BOX, 'Box.step': (state) => box(state.n + 5n) }
  const empty = boxLaws({ relations: ['R_far'], bounds: { nat: 2 } }, leaping)
  assert.equal(empty.status, 'ok')
  assert.equal(empty.bounded, true)
  assert.deepEqual(empty.bounds, { nat: 2 })
  assert.deepEqual(empty.domain, { states: 3, commands: 1, cells: 3 })
  assert.equal(empty.counterexampleCount, 0)
  assert.deepEqual(counts(empty.strength), {
    scope: 'state',
    pinnedCount: 0,
    freeCount: 0,
    emptyCount: 3,
    alternatives: 0,
    marginal: { 'Box.R_far': 0 },
  })
  assert.match(empty.hint, /^3 cells have no candidate in the bounded domain/)
  assert.match(empty.hint, /raise the bounds or check the relations/)

  // the step moves by one: the last cell steps to 3, outside the domain, and the relation is still judged on it
  const stepping = boxLaws({ relations: ['R_stay'], bounds: { nat: 2 } })
  assert.equal(stepping.status, 'counterexample')
  assert.deepEqual(stepping.counterexamples, [
    { relation: 'Box.R_stay', state: 'M.Box{0n}', command: 'M.Go{}', after: 'M.Box{1n}' },
    { relation: 'Box.R_stay', state: 'M.Box{1n}', command: 'M.Go{}', after: 'M.Box{2n}' },
    { relation: 'Box.R_stay', state: 'M.Box{2n}', command: 'M.Go{}', after: 'M.Box{3n}' },
  ])
  assert.equal(stepping.strength.pinnedCount, 3)
})

const BAG_SOURCE = modelSource(
  'type Bag is Data:\n  Bag{items: List<Nat>}\n\ntype Cmd is Data:\n  Add{}',
  'def Bag.step(s: Bag, c: Cmd) -> Bag',
  'def Bag.R_any(s: Bag, c: Cmd, t: Bag) -> Bool',
)
const bagLaws = (bounds) =>
  lawReport({
    source: BAG_SOURCE,
    exported: { 'Bag.step': (state) => state, 'Bag.R_any': () => true },
    prefix: 'Bag',
    state: 'Bag',
    command: 'Cmd',
    relations: ['R_any'],
    bounds,
  })

test('lawReport refuses an unbounded Nat or List, says which bound is missing, and echoes the bounds it used', () => {
  assertRefused(() => boxLaws({ relations: ['R_stay'] }), {
    code: 'SAMPLING_BOUND_REQUIRED',
    has: ['unbounded Nat', '--nat-max'],
    lacks: ['--list-max'],
  })
  assertRefused(() => bagLaws({}), {
    code: 'SAMPLING_BOUND_REQUIRED',
    has: ['unbounded', 'Nat', 'List', '--nat-max', '--list-max'],
  })
  assertRefused(() => bagLaws({ nat: 1 }), {
    code: 'SAMPLING_BOUND_REQUIRED',
    has: ['unbounded List', '--list-max'],
    lacks: ['--nat-max'],
  })
  assertRefused(() => bagLaws({ list: 2 }), {
    code: 'SAMPLING_BOUND_REQUIRED',
    has: ['unbounded Nat', '--nat-max'],
    lacks: ['--list-max'],
  })

  // lists of up to two items, each 0 or 1: 1 + 2 + 4 states
  const bounded = bagLaws({ nat: 1, list: 2 })
  assert.equal(bounded.bounded, true)
  assert.deepEqual(bounded.bounds, { nat: 1, list: 2 })
  assert.deepEqual(bounded.domain, { states: 7, commands: 1, cells: 7 })
  // a bound the types never use shrinks nothing, so the report does not claim it
  const unused = boxLaws({ relations: ['R_stay'], bounds: { nat: 2, list: 3 } })
  assert.deepEqual(unused.bounds, { nat: 2 })
  const finite = gateLaws({ relations: ['R_hold_keeps'], bounds: { nat: 5 } })
  assert.equal(finite.bounded, false)
  assert.equal('bounds' in finite, false)
})

test('lawReport refuses a relation that is not (state, command, state) -> Bool, and bad observe, invariant or limits, before calling anything', () => {
  const signature = (name) => `Gate.${name} must be def Gate.${name}(s: Gate, c: Cmd, t: Gate) -> Bool`
  // swapped parameter types, a different last type, two and four parameters, a non-Bool result, a def the source never declares
  for (const relation of ['R_swapped', 'R_after_cmd', 'R_two', 'R_four', 'R_gate', 'R_undeclared']) {
    const { exported, calls } = fakeCompiled(GATE)
    assertRefused(() => gateLaws({ relations: ['R_hold_keeps', relation] }, exported), {
      code: 'RELATION_INVALID',
      has: [signature(relation)],
    })
    assert.deepEqual(calls, [], relation)
  }
  // quantity markers on the parameters are not part of the type
  assert.equal(gateLaws({ relations: ['R_hold_again'] }).status, 'ok')

  for (const observe of ['pair', 'of_cmd', 'undeclared']) {
    assertRefused(() => gateLaws({ relations: ['R_hold_keeps'], observe }), {
      code: 'OBSERVE_INVALID',
      has: [`Gate.${observe} must be def Gate.${observe}(s: Gate) -> <observed>`],
    })
  }
  // an observation may return anything ...
  assert.equal(gateLaws({ relations: ['R_hold_keeps'], observe: 'same' }).strength.scope, 'Gate.same')
  // ... an invariant must return Bool
  for (const invariant of ['pair', 'of_cmd', 'same', 'undeclared']) {
    assertRefused(() => gateLaws({ invariant }), {
      code: 'INVARIANT_INVALID',
      has: [`Gate.${invariant} must be def Gate.${invariant}(s: Gate) -> Bool`],
    })
  }

  // defs the source declares but the compiled model does not export
  assertRefused(() => gateLaws({ relations: ['R_hold_keeps'] }, { 'Gate.step': GATE['Gate.step'] }), {
    code: 'MODEL_INTERFACE',
    has: ['Gate.R_hold_keeps'],
  })
  assertRefused(() => gateLaws({ relations: ['R_hold_keeps'] }, { 'Gate.R_hold_keeps': holdKeeps }), {
    code: 'MODEL_INTERFACE',
    has: ['Gate.step'],
  })

  const usage = { code: 'USAGE' }
  assertRefused(() => gateLaws({ prefix: 'gate', relations: ['R_hold_keeps'] }), { ...usage, has: ['prefix'] })
  assertRefused(() => gateLaws({ relations: ['R_hold_keeps'], bounds: { nat: -1 } }), { ...usage, has: ['--nat-max'] })
  assertRefused(() => gateLaws({ relations: ['R_hold_keeps'], bounds: { list: 1.5 } }), { ...usage, has: ['--list-max'] })
  assertRefused(() => gateLaws({ relations: ['R_hold_keeps'], maxEvals: 0 }), { ...usage, has: ['max-evals'] })
})

test('lawReport counts the evaluations first and refuses, calling nothing, when they exceed --max-evals', () => {
  const options = { relations: ['R_hold_keeps', 'R_flip_changes'] }
  // 4 cells × 2 candidates × 2 relations, plus the 4 step calls: the estimate is the number of calls made
  const fits = fakeCompiled(GATE)
  assert.equal(gateLaws({ ...options, maxEvals: 20 }, fits.exported).evaluations, 20)
  assert.equal(fits.calls.length, 20)

  const refused = fakeCompiled(GATE)
  assertRefused(() => gateLaws({ ...options, maxEvals: 19 }, refused.exported), {
    code: 'LAWS_TOO_LARGE',
    has: ['4 cells', '20 evaluations', '--max-evals 19'],
  })
  assert.deepEqual(refused.calls, [])

  // the default limit is a million evaluations: 1001 states × 1001 cells is just over
  const huge = fakeCompiled(BOX)
  assertRefused(() => boxLaws({ relations: ['R_any'], bounds: { nat: 1000 } }, huge.exported), {
    code: 'LAWS_TOO_LARGE',
    has: ['1003002 evaluations', '--max-evals 1000000'],
  })
  assert.deepEqual(huge.calls, [])
})

test('lawReport refuses a step that is not (state, command) -> state, and a state or command type with no value, calling nothing', () => {
  // an invariant check has no relation to name the command type: the step signature is what catches a wrong --command
  const wrongCommand = fakeCompiled(GATE)
  assertRefused(() => gateLaws({ invariant: 'is_open', command: 'Gate' }, wrongCommand.exported), {
    code: 'STEP_INVALID',
    has: ['Gate.step must be def Gate.step(s: Gate, c: Gate) -> Gate'],
  })
  assert.deepEqual(wrongCommand.calls, [])
  for (const step of ['def Gate.step(s: Gate) -> Gate', 'def Gate.step(s: Gate, c: Cmd) -> Bool', null]) {
    const source = modelSource(
      'type Gate is Data:\n  Open{}\n  Shut{}\n\ntype Cmd is Data:\n  Flip{}',
      ...[step, 'def Gate.R_hold_keeps(s: Gate, c: Cmd, t: Gate) -> Bool'].filter(Boolean),
    )
    const { exported, calls } = fakeCompiled(GATE)
    assertRefused(
      () => lawReport({ source, exported, prefix: 'Gate', state: 'Gate', command: 'Cmd', relations: ['R_hold_keeps'] }),
      { code: 'STEP_INVALID', has: ['Gate.step must be def Gate.step(s: Gate, c: Cmd) -> Gate'] },
    )
    assert.deepEqual(calls, [], String(step))
  }

  // no value means no cell: every count would be 0 and every relation would hold vacuously
  const empty = (types, state, command) => {
    const source = modelSource(
      types,
      `def Void.step(s: ${state}, c: ${command}) -> ${state}`,
      `def Void.R_any(s: ${state}, c: ${command}, t: ${state}) -> Bool`,
    )
    const { exported, calls } = fakeCompiled({ 'Void.step': (s) => s, 'Void.R_any': () => true })
    return { run: () => lawReport({ source, exported, prefix: 'Void', state, command, relations: ['R_any'] }), calls }
  }
  const noState = empty('type Never is Data:\n\ntype Cmd is Data:\n  Go{}', 'Never', 'Cmd')
  assertRefused(noState.run, { code: 'TYPE_EMPTY', has: ['Never has no value'], lacks: ['Cmd'] })
  const noCommand = empty('type One is Data:\n  One{}\n\ntype Never is Data:', 'One', 'Never')
  assertRefused(noCommand.run, { code: 'TYPE_EMPTY', has: ['Never has no value'], lacks: ['One'] })
  assert.deepEqual([...noState.calls, ...noCommand.calls], [])
})

test('lawReport lists at most 100 counterexamples, free cells and counterexamples to induction while the counts stay complete', () => {
  const bounds = { nat: 200 }
  // 201 states, one command: R_any leaves every cell free, and 101 even states step to an odd one
  const open = boxLaws({ relations: ['R_any'], invariant: 'even', bounds })
  assert.equal(open.status, 'not-inductive')
  assert.equal(open.evaluations, 40803)
  assert.equal(open.strength.freeCount, 201)
  assert.equal(open.strength.alternatives, 201 * 200)
  assert.equal(open.strength.freeCells.length, 100)
  assert.equal(open.strength.freeCells.at(-1).state, 'M.Box{99n}')
  assert.equal(open.invariant.states, 101)
  assert.equal(open.invariant.ctiCount, 101)
  assert.equal(open.invariant.ctis.length, 100)
  assert.equal(open.invariant.ctis.at(-1).state, 'M.Box{198n}')

  // R_stay is false after every step
  const broken = boxLaws({ relations: ['R_stay'], bounds })
  assert.equal(broken.status, 'counterexample')
  assert.equal(broken.counterexampleCount, 201)
  assert.equal(broken.counterexamples.length, 100)
  assert.deepEqual(broken.counterexamples.at(-1), {
    relation: 'Box.R_stay',
    state: 'M.Box{99n}',
    command: 'M.Go{}',
    after: 'M.Box{100n}',
  })
  assert.equal(broken.strength.pinnedCount, 201)
})

test('lawReport hints in a fixed order: a counterexample, a CTI, then fields the model keeps, free cells, empty cells', () => {
  // a counterexample, free cells and a CTI all at once: the counterexample is named
  const everything = gateLaws({ relations: ['R_hold_keeps'], invariant: 'is_open' }, SLIPPING)
  assert.equal(everything.counterexampleCount, 1)
  assert.equal(everything.strength.freeCount, 2)
  assert.equal(everything.invariant.ctiCount, 1)
  assert.match(everything.hint, /^Gate\.R_hold_keeps is false at M\.Shut\{\} M\.Hold\{\}/)
  assert.match(everything.hint, /model breaks the law or the law misstates its sentence/)

  // the step is right now: a CTI is a status, so it outranks the free cells, which are only a report
  const free = gateLaws({ relations: ['R_hold_keeps'], invariant: 'is_open' })
  assert.equal(free.counterexampleCount, 0)
  assert.equal(free.strength.freeCount, 2)
  assert.match(free.hint, /^1 counterexample to induction of Gate\.is_open/)

  // without the invariant the free cells speak
  assert.match(gateLaws({ relations: ['R_hold_keeps'] }).hint, /^2 cells leave the next state open/)

  // a CTI outranks empty cells too; without the invariant the empty cells speak
  const leaping = { ...BOX, 'Box.step': (state) => box(state.n + 5n) }
  const empty = boxLaws({ relations: ['R_far'], invariant: 'even', bounds: { nat: 2 } }, leaping)
  assert.equal(empty.invariant.ctiCount, 2)
  assert.equal(empty.strength.emptyCount, 3)
  assert.match(empty.hint, /^2 counterexamples to induction of Box\.even/)
  assert.match(boxLaws({ relations: ['R_far'], bounds: { nat: 2 } }, leaping).hint, /^3 cells have no candidate/)

  // a fully pinned, inductive model has nothing to say
  const quiet = gateLaws({ relations: ['R_hold_keeps', 'R_flip_changes'] })
  assert.equal('hint' in quiet, false)
})

// 0..3을 도는 ringModel을 가짜 컴파일 def로 쓴다 — 공간(reachedStates)과 같은 step이다
const RING_SOURCE = modelSource(
  'type Ring is Data:\n  Ring{at: Nat}\n\ntype Ev is Data:\n  R{}\n  X{}',
  'def Ring.step(s: Ring, e: Ev) -> Ring',
  'def Ring.below_three(s: Ring) -> Bool',
  'def Ring.below_four(s: Ring) -> Bool',
  'def Ring.is_zero(s: Ring) -> Bool',
)
const RING = {
  'Ring.step': ringModel().step,
  'Ring.below_three': (state) => state.at < 3n,
  'Ring.below_four': (state) => state.at < 4n,
  'Ring.is_zero': (state) => state.at === 0n,
}
const ringLaws = (options) =>
  lawReport({
    source: RING_SOURCE,
    exported: RING,
    prefix: 'Ring',
    state: 'Ring',
    command: 'Ev',
    bounds: { nat: 3 },
    ...options,
  })

test('lawReport lists the counterexamples to induction and, with the reachable states, the first trace that reaches each', () => {
  const plain = ringLaws({ invariant: 'below_three' })
  assert.equal(plain.status, 'not-inductive')
  assert.deepEqual(plain.relations, [])
  assert.equal(plain.strength, null)
  assert.deepEqual(plain.domain, { states: 4, commands: 2, cells: 8 })
  // 0, 1 and 2 satisfy it; only the step 2 → 3 leaves it. Without a lookup the CTI has no reached field at all
  assert.deepEqual(plain.invariant, {
    def: 'Ring.below_three',
    states: 3,
    ctiCount: 1,
    ctis: [{ state: 'M.Ring{2n}', command: 'M.R{}', after: 'M.Ring{3n}' }],
    reach: null,
  })

  const ring = ringModel()
  const reachAt = (bound) => () => reachedStates(ring, enumerateSpace(ring, { bound }))
  const deep = ringLaws({ invariant: 'below_three', reach: reachAt(2) })
  assert.deepEqual(deep.invariant.ctis, [
    { state: 'M.Ring{2n}', command: 'M.R{}', after: 'M.Ring{3n}', reached: ['M.R{}', 'M.R{}'] },
  ])
  assert.deepEqual(deep.invariant.reach, { bound: 2, complete: true })

  // bound 1 never gets to 2: the CTI is not reached, and the report says null rather than leaving the field out
  const shallow = ringLaws({ invariant: 'below_three', reach: reachAt(1) })
  assert.deepEqual(shallow.invariant.ctis, [
    { state: 'M.Ring{2n}', command: 'M.R{}', after: 'M.Ring{3n}', reached: null },
  ])
  assert.deepEqual(shallow.invariant.reach, { bound: 1, complete: true })

  // the initial state is reached by the empty trace
  const initial = ringLaws({ invariant: 'is_zero', reach: reachAt(1) })
  assert.deepEqual(initial.invariant.ctis, [
    { state: 'M.Ring{0n}', command: 'M.R{}', after: 'M.Ring{1n}', reached: [] },
  ])

  // an invariant every step keeps has no CTI
  const inductive = ringLaws({ invariant: 'below_four', reach: reachAt(2) })
  assert.equal(inductive.status, 'ok')
  assert.equal(inductive.invariant.ctiCount, 0)
  assert.deepEqual(inductive.invariant.ctis, [])
  assert.equal('hint' in inductive, false)

  // the space is enumerated once, and only after every signature, domain and cost check passed
  let enumerated = 0
  const counted = () => {
    enumerated += 1
    return reachAt(2)()
  }
  assertRefused(() => ringLaws({ invariant: 'below_three', reach: counted, maxEvals: 1 }), { code: 'LAWS_TOO_LARGE' })
  assertRefused(() => ringLaws({ invariant: 'undeclared', reach: counted }), { code: 'INVARIANT_INVALID' })
  assertRefused(() => ringLaws({ invariant: 'below_three', reach: counted, bounds: {} }), {
    code: 'SAMPLING_BOUND_REQUIRED',
  })
  assert.equal(enumerated, 0)
  ringLaws({ invariant: 'below_three', reach: counted })
  assert.equal(enumerated, 1)
})

test('lawReport counts the reached counterexamples to induction apart from the list, and with run only those the fold still breaks', () => {
  const ring = ringModel()
  const reach = () => reachedStates(ring, enumerateSpace(ring, { bound: 2 }))
  const witness = { state: 'M.Ring{2n}', command: 'M.R{}', after: 'M.Ring{3n}', reached: ['M.R{}', 'M.R{}'] }
  const counted = ringLaws({ invariant: 'below_three', reach })
  assert.deepEqual([counted.invariant.reachedCount, counted.invariant.firstReached], [1, witness])
  // no reach, no count
  assert.equal('reachedCount' in ringLaws({ invariant: 'below_three' }).invariant, false)

  // the trace law folds with its own run from init: a fold that steps confirms the cell, one that ignores the events does not
  const fold = (step) => (events, state) => {
    let at = state
    for (let cursor = events; cursor.$ === 'Con'; cursor = cursor.tail) at = step(at, cursor.head)
    return at
  }
  const withRun = (run) => ({ ...RING, 'Ring.init': ring.init, 'Ring.run': run })
  const stepping = ringLaws({ invariant: 'below_three', reach, run: 'run', exported: withRun(fold(ring.step)) })
  assert.deepEqual([stepping.invariant.reachedCount, stepping.invariant.firstReached], [1, witness])
  const ignoring = ringLaws({ invariant: 'below_three', reach, run: 'run', exported: withRun(fold((state) => state)) })
  assert.deepEqual([ignoring.invariant.ctiCount, ignoring.invariant.reachedCount, ignoring.invariant.firstReached], [1, 0, null])
  // a named run the model does not export is refused before any cell is computed
  assertRefused(() => ringLaws({ invariant: 'below_three', reach, run: 'run' }), { code: 'MODEL_INTERFACE' })
})

test('reachedStates maps each state a space reaches to the shortest trace, the first in case order on a tie', () => {
  const ring = ringModel()
  const space = enumerateSpace(ring, { bound: 2 })
  const reached = reachedStates(ring, space)
  assert.deepEqual({ bound: reached.bound, complete: reached.complete }, { bound: 2, complete: true })
  const traceTo = (traces, model, at) => traces.get(stableStringify({ $: model, at }))
  // the initial state is the empty trace, not X; state 3 needs R·R·R, one past the bound
  assert.deepEqual(traceTo(reached.traces, 'Ring', 0), [])
  assert.deepEqual(traceTo(reached.traces, 'Ring', 1), [{ $: 'R' }])
  assert.deepEqual(traceTo(reached.traces, 'Ring', 2), [{ $: 'R' }, { $: 'R' }])
  assert.equal(traceTo(reached.traces, 'Ring', 3), undefined)
  assert.equal(reached.traces.size, 3)

  // a space stopped by its budget says it is incomplete, so a state it does not reach is not proof of unreachable
  assert.equal(reachedStates(ring, enumerateSpace(ring, { bound: 2, maxCases: 1 })).complete, false)

  // A and B both reach state 1 in one event: the first case of the space (A) is kept
  const events = (names) => names.reduceRight((tail, name) => ({ $: 'Con', head: { $: name }, tail }), { $: 'Nil' })
  const twin = {
    prefix: 'Twin',
    digest: 'twin-model',
    init: () => ({ $: 'Twin', at: 0n }),
    step: (state) => ({ $: 'Twin', at: state.at + 1n }),
    observe: (state) => state.at,
    next: () => events(['A', 'B']),
  }
  const tied = reachedStates(twin, enumerateSpace(twin, { bound: 2 })).traces
  assert.deepEqual(traceTo(tied, 'Twin', 1), [{ $: 'A' }])
  assert.deepEqual(traceTo(tied, 'Twin', 2), [{ $: 'A' }, { $: 'A' }])
})

test('the transition cover reports its diameter when closed and none when capped', () => {
  // states 0..3 are first reached by [], R, R·R and R·R·R: the cover cases add one event to each
  const ring = ringModel()
  const closed = transitionCover(ring, enumerateSpace(ring, { bound: 2 }))
  assert.equal(closed.status, 'closed')
  assert.equal(closed.diameter, 3)
  assert.equal(Math.max(...closed.cases.map(({ trace }) => trace.length)), closed.diameter + 1)

  // a model that never leaves its initial state has one configuration, reached by the empty trace
  const still = {
    prefix: 'Still',
    digest: 'still-model',
    init: () => 0n,
    step: (state) => state,
    observe: (state) => state,
    next: () => ({ $: 'Con', head: { $: 'X' }, tail: { $: 'Nil' } }),
  }
  const alone = transitionCover(still, enumerateSpace(still, { bound: 2 }))
  assert.deepEqual(
    { status: alone.status, configurations: alone.configurations, diameter: alone.diameter },
    { status: 'closed', configurations: 1, diameter: 0 },
  )

  // the state grows without bound: the configurations stop at the cap and the diameter is unknown
  const counter = {
    prefix: 'Count',
    digest: 'count-model',
    init: () => 0n,
    step: (state) => state + 1n,
    observe: (state) => state,
    next: () => ({ $: 'Con', head: { $: 'Inc' }, tail: { $: 'Nil' } }),
  }
  const capped = transitionCover(counter, enumerateSpace(counter, { bound: 2 }), { maxConfigurations: 5 })
  assert.equal(capped.status, 'capped')
  assert.equal(capped.diameter, null)
})

// ── cellProof: 유한한 `for` 법칙의 칸 증명 (원문만, mock) ─────────────────────────────────────

const CELL_MODEL = [
  'import Base',
  '',
  'type Sw is Data:',
  '  On{}',
  '  Off{}',
  '',
  'type Hop is Data:',
  '  Up{}',
  '  Down{}',
  '  Stay{}',
  '',
  'type Pair is Data:',
  '  Pair{left: Bool, right: Sw}',
  '',
  'type Void is Data:',
  '',
].join('\n')
const cellLaws = (...laws) => `import Base\nimport ./MODEL.bend as M\n\n${laws.join('\n\n')}\n`
const lawNames = (laws) => [...laws.matchAll(/^law (\w+):/gm)].map(([, name]) => name)
// proveLaws가 넘기는 것처럼 PROOF.bend가 채우지 않은 law 이름을 준다 — 기본은 LAWS.bend의 모든 law
const cellsOf = (laws, options = {}) => cellProof({ laws, model: CELL_MODEL, names: lawNames(laws), ...options })
const CELLS_HEAD = `import Base
import ./MODEL.bend as M
import ./LAWS.bend as Laws
import ./PROOF.bend as Proof

# Generated by oracle-model.mjs prove for the laws PROOF.bend leaves undefined: one case per value of each \`for\`
# binder, closed by computation. It is checked in a temporary copy and never written beside PROOF.bend.
`
const ZETA = 'law zeta:\n  for h: M.Hop\n  {M.ok(h) == True{} : Bool}'
const ALPHA = 'law alpha:\n  for a: M.Sw\n  {M.ok(a) == True{} : Bool}'

test('cellProof writes one case per value of each for-binder, outer binder first, in an entry that imports PROOF.bend', () => {
  const laws = cellLaws(
    'law both:\n  for a: M.Sw\n  for b: Bool\n  {M.same(a, b) == True{} : Bool}',
    'law nested:\n  for p: M.Pair\n  {M.fine(p) == True{} : Bool}',
  )
  const { text, generated, skipped } = cellsOf(laws)
  assert.equal(
    text,
    `${CELLS_HEAD}
def Laws.both(a, b):
  match a b:
    case M.On{} False{}:
      {==}
    case M.On{} True{}:
      {==}
    case M.Off{} False{}:
      {==}
    case M.Off{} True{}:
      {==}

def Laws.nested(p):
  match p:
    case M.Pair{False{}, M.On{}}:
      {==}
    case M.Pair{False{}, M.Off{}}:
      {==}
    case M.Pair{True{}, M.On{}}:
      {==}
    case M.Pair{True{}, M.Off{}}:
      {==}
`,
  )
  assert.deepEqual(generated, [
    { law: 'both', cases: 4 },
    { law: 'nested', cases: 4 },
  ])
  assert.deepEqual(skipped, [])

  // defs follow LAWS.bend order, not the order of the names asked for
  const twoLaws = cellLaws(ZETA, ALPHA)
  const reversed = cellsOf(twoLaws, { names: ['alpha', 'zeta'] })
  assert.deepEqual(reversed.generated, [
    { law: 'zeta', cases: 3 },
    { law: 'alpha', cases: 2 },
  ])
  assert.ok(reversed.text.indexOf('def Laws.zeta(') < reversed.text.indexOf('def Laws.alpha('))

  // a law PROOF.bend defines is not among the names: it is neither generated nor reported as skipped
  const one = cellsOf(twoLaws, { names: ['alpha'] })
  assert.deepEqual(one.generated, [{ law: 'alpha', cases: 2 }])
  assert.deepEqual(one.skipped, [])
  assert.doesNotMatch(one.text, /def Laws\.zeta\(/)
  assert.deepEqual(cellsOf(twoLaws, { names: [] }), { text: null, generated: [], skipped: [] })
})

test('cellProof skips a law it cannot close by cases and says why', () => {
  const laws = cellLaws(
    'law keep:\n  for a: M.Sw\n  {M.ok(a) == True{} : Bool}',
    'law infinite:\n  for n: Nat\n  {M.big(n) == True{} : Bool}',
    'law open_list:\n  for a: M.Sw\n  for t: List<M.Hop>\n  {M.mix(a, t) == True{} : Bool}',
    'law unknown_type:\n  for x: M.Missing\n  {M.gone(x) == True{} : Bool}',
    'law nothing:\n  for a: M.Sw\n  for v: M.Void\n  {M.none(a, v) == True{} : Bool}',
    'law constant:\n  {M.k() == True{} : Bool}',
    'law witness:\n  exs a: M.Sw\n  {M.pick(a) == True{} : Bool}',
    'law wide:\n  for h: M.Hop\n  for g: M.Hop\n  for a: M.Sw\n  {M.w(h, g, a) == True{} : Bool}',
  )
  const result = cellsOf(laws, { maxCases: 17 })
  assert.deepEqual(result.generated, [{ law: 'keep', cases: 2 }])
  const skipped = Object.fromEntries(result.skipped.map(({ law, ...why }) => [law, why]))
  assert.deepEqual(Object.keys(skipped), ['infinite', 'open_list', 'unknown_type', 'nothing', 'constant', 'witness', 'wide'])
  // not-finite names the binder and its cardinality: the first binder that is not finite, not the law's first
  assert.deepEqual(skipped.infinite, { reason: 'not-finite', binder: 'n', type: 'Nat', cardinality: 'infinite' })
  assert.deepEqual(skipped.open_list, { reason: 'not-finite', binder: 't', type: 'List<M.Hop>', cardinality: 'infinite' })
  // a type MODEL.bend does not declare is not known to be finite or infinite: it is unsupported
  const { error, ...unknown } = skipped.unknown_type
  assert.deepEqual(unknown, { reason: 'unsupported-type', binder: 'x', type: 'M.Missing' })
  assert.match(error, /M\.Missing/)
  // a type with no value would be a match without a case: the law is skipped, not proven vacuously
  assert.deepEqual(skipped.nothing, { reason: 'empty-domain', binder: 'v', type: 'M.Void' })
  assert.deepEqual(skipped.constant, { reason: 'no-binders' })
  assert.deepEqual(skipped.witness, { reason: 'witness' })
  // 3 × 3 × 2 = 18 cases against a limit of 17
  assert.deepEqual(skipped.wide, { reason: 'too-many-cases', cases: 18, maxCases: 17 })
  assert.doesNotMatch(result.text, /def Laws\.(infinite|open_list|unknown_type|nothing|constant|witness|wide)\(/)

  // exactly at the limit it is generated, and the default limit is 4,096 cases
  assert.deepEqual(cellsOf(laws, { maxCases: 18 }).generated.at(-1), { law: 'wide', cases: 18 })
  assert.equal(
    cellsOf(laws).skipped.some(({ law }) => law === 'wide'),
    false,
  )

  // without the MODEL.bend beside LAWS.bend the `M.` literals name nothing: even a finite law is skipped
  const detached = cellProof({ laws, model: null, names: ['keep', 'constant', 'witness'] })
  assert.equal(detached.text, null)
  assert.deepEqual(detached.skipped, [
    { law: 'keep', reason: 'no-model' },
    { law: 'constant', reason: 'no-binders' },
    { law: 'witness', reason: 'witness' },
  ])

  // every law skipped: no text at all
  const none = cellsOf(cellLaws('law infinite:\n  for n: Nat\n  {M.big(n) == True{} : Bool}'))
  assert.equal(none.text, null)
  assert.deepEqual(none.generated, [])
})

// ── prove: PROOF.bend가 비운 유한 칸 law를 만들어 임시 사본에서 검사 (가짜 bend, mock) ──────────────

/** CELL_MODEL 옆에 LAWS.bend·PROOF.bend(와 extra 파일)를 둔 디렉터리. */
async function cellDir(t, { laws, proof, extra = {} }) {
  const root = await workspace(t)
  await writeFile(join(root, 'MODEL.bend'), CELL_MODEL)
  await writeFile(join(root, 'LAWS.bend'), laws)
  await writeFile(join(root, 'PROOF.bend'), proof)
  for (const [name, text] of Object.entries(extra)) await writeFile(join(root, name), text)
  return root
}

/** 가짜 bend — `--verdict` 실행마다 진입 파일, 실행 디렉터리와 그 파일 목록을 남기고 ALL PROOFS CHECK를 낸다. */
async function capturingBend(t) {
  const root = await workspace(t)
  const bin = join(root, 'capture-bend')
  const seen = join(root, 'seen')
  await writeFile(
    bin,
    `#!/bin/sh\nif [ "$2" = '--verdict' ]; then\n  pwd -P > '${seen}.cwd'\n  ls > '${seen}.ls'\n  cp "$1" '${seen}.bend'\nfi\necho 'ALL PROOFS CHECK'\n`,
  )
  await chmod(bin, 0o755)
  const read = (suffix) => readFile(`${seen}.${suffix}`, 'utf8')
  return {
    bin,
    ran: () =>
      access(`${seen}.cwd`).then(
        () => true,
        () => false,
      ),
    seen: async () => ({ cwd: (await read('cwd')).trim(), files: (await read('ls')).trim().split('\n'), text: await read('bend') }),
  }
}

const listing = async (dir) => (await readdir(dir)).sort()
const PROOF_IMPORTS = 'import Base\nimport ./MODEL.bend as M\nimport ./LAWS.bend as Laws\n'

test('prove generates the finite cell laws its closure leaves undefined and checks them in a temporary copy, writing nothing', async (t) => {
  const laws = cellLaws(
    'law keep:\n  for a: M.Sw\n  {M.ok(a) == True{} : Bool}',
    'law by_hand:\n  for a: M.Sw\n  {M.hand(a) == True{} : Bool}',
    'law elsewhere:\n  for a: M.Sw\n  for b: Bool\n  {M.both(a, b) == True{} : Bool}',
    'law witness:\n  exs a: M.Sw\n  {M.pick(a) == True{} : Bool}',
    'law infinite:\n  for n: Nat\n  {M.big(n) == True{} : Bool}',
  )
  // by_hand is defined in PROOF.bend and elsewhere in a helper under its own alias of LAWS.bend; a longer name
  // that starts with `keep` does not define keep
  const dir = await cellDir(t, {
    laws,
    proof: `${PROOF_IMPORTS}import ./HELP.bend as H\n\ndef Laws.by_hand(a):\n  ?TODO\n\ndef Laws.keep_extra(a):\n  ?TODO\n`,
    extra: { 'HELP.bend': 'import Base\nimport ./LAWS.bend as L\n\ndef L.elsewhere(a, b):\n  ?TODO\n' },
  })
  const before = await listing(dir)
  const fake = await capturingBend(t)
  const result = await proveLaws({ dir, bin: fake.bin })

  assert.equal(result.status, 'proven')
  assert.deepEqual(result.command, [fake.bin, 'CELLS.bend', '--verdict'])
  // temporaryCopy says the command ran in a copy: CELLS.bend never existed in dir
  assert.deepEqual(result.cells, {
    generated: [{ law: 'keep', cases: 2 }],
    skipped: [
      { law: 'witness', reason: 'witness' },
      { law: 'infinite', reason: 'not-finite', binder: 'n', type: 'Nat', cardinality: 'infinite' },
    ],
    temporaryCopy: true,
  })
  // the inputs are the PROOF.bend closure; the generated entry is not one of them
  assert.deepEqual(result.inputs.map(({ path }) => path).sort(), ['HELP.bend', 'LAWS.bend', 'MODEL.bend', 'PROOF.bend'])

  const seen = await fake.seen()
  assert.equal(seen.text, `${CELLS_HEAD}\ndef Laws.keep(a):\n  match a:\n    case M.On{}:\n      {==}\n    case M.Off{}:\n      {==}\n`)
  // bend ran beside a copy of the closure, in a directory that is gone afterwards
  assert.deepEqual(seen.files, ['CELLS.bend', 'HELP.bend', 'LAWS.bend', 'MODEL.bend', 'PROOF.bend'])
  assert.notEqual(seen.cwd, await realpath(dir))
  await assert.rejects(access(seen.cwd))
  assert.deepEqual(await listing(dir), before)
})

test('prove runs PROOF.bend itself when nothing is left to generate, and never generates under a name its closure uses', async (t) => {
  const finite = cellLaws('law keep:\n  for a: M.Sw\n  {M.ok(a) == True{} : Bool}')
  // every law is defined: PROOF.bend is the entry, as before
  const defined = await cellDir(t, { laws: finite, proof: `${PROOF_IMPORTS}\ndef Laws.keep(a):\n  ?TODO\n` })
  const plain = await capturingBend(t)
  const ran = await proveLaws({ dir: defined, bin: plain.bin })
  assert.deepEqual(ran.command, [plain.bin, 'PROOF.bend', '--verdict'])
  assert.deepEqual(ran.cells, { generated: [], skipped: [], temporaryCopy: false })
  assert.equal((await plain.seen()).cwd, await realpath(defined))

  // LAWS.bend does not import the MODEL.bend beside it: the law is skipped and PROOF.bend runs alone
  const detached = await proofDir(t, { laws: 'law flag:\n  for b: Bool\n  {b == b : Bool}\n' })
  const alone = await capturingBend(t)
  const unmodeled = await proveLaws({ dir: detached, bin: alone.bin })
  assert.deepEqual(unmodeled.command, [alone.bin, 'PROOF.bend', '--verdict'])
  assert.deepEqual(unmodeled.cells, { generated: [], skipped: [{ law: 'flag', reason: 'no-model' }], temporaryCopy: false })

  // a refused PROOF.bend generates nothing
  const other = await proofDir(t, { proof: 'import ./OTHER.bend as Laws\n' })
  await writeFile(join(other, 'OTHER.bend'), 'import Base\n')
  const refused = await proveLaws({ dir: other, bin: (await capturingBend(t)).bin })
  assert.equal(refused.status, 'failed')
  assert.deepEqual(refused.cells, { generated: [], skipped: [], temporaryCopy: false })

  // a CELLS.bend beside PROOF.bend in its closure would be overwritten by the generated entry: failed before bend runs
  const taken = await cellDir(t, {
    laws: finite,
    proof: `${PROOF_IMPORTS}import ./CELLS.bend as C\n`,
    extra: { 'CELLS.bend': 'import Base\n' },
  })
  const blocked = await capturingBend(t)
  const clash = await proveLaws({ dir: taken, bin: blocked.bin })
  assert.equal(clash.status, 'failed')
  assert.match(clash.reason, /^CELLS\.bend beside PROOF\.bend is in its import closure.*rename that file$/)
  assert.equal(await blocked.ran(), false)
  // the same closure with nothing to generate runs as before
  await writeFile(join(taken, 'PROOF.bend'), `${PROOF_IMPORTS}import ./CELLS.bend as C\n\ndef Laws.keep(a):\n  ?TODO\n`)
  assert.equal((await proveLaws({ dir: taken, bin: blocked.bin })).status, 'proven')

  // a CELLS.bend in another directory of the closure is not overwritten: generation goes ahead
  const nested = await cellDir(t, { laws: finite, proof: `${PROOF_IMPORTS}import ./lib/CELLS.bend as C\n` })
  await mkdir(join(nested, 'lib'))
  await writeFile(join(nested, 'lib', 'CELLS.bend'), 'import Base\n')
  const beside = await capturingBend(t)
  const apart = await proveLaws({ dir: nested, bin: beside.bin })
  assert.equal(apart.status, 'proven')
  assert.deepEqual(apart.cells.generated, [{ law: 'keep', cases: 2 }])
  assert.match((await beside.seen()).text, /^def Laws\.keep\(a\):$/m)
})

// ── 실제 Bend 2.0.34 통합 (설치본이 있을 때만) ────────────────────────────────────────

test('[bend] the fixture laws are proven by the verdict kernel', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const result = await proveLaws({
    dir: FIXTURE,
    bin,
    require: ['stale_ignored', 'latest_applied', 'issue_advances', 'latest_reachable'],
  })
  assert.equal(result.status, 'proven', `${result.stdout}${result.stderr}`)
  assert.deepEqual(result.lawImports, ['./MODEL.bend'])
  assert.deepEqual(result.inputs.map(({ path }) => path).sort(), ['LAWS.bend', 'MODEL.bend', 'PROOF.bend'])
  assert.deepEqual(result.untrusted, [])
  assert.deepEqual(result.bend, { bin, version: BEND_VERSION })
})

test('[bend] a wrong model, an open proof and an unsafe helper are each refused with their own status', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const cases = [
    [
      'MODEL.bend',
      'case False{}:\n      Search{latest, shown}',
      'case False{}:\n      Search{latest, id}',
      'failed',
      'Laws.stale_ignored',
    ],
    [
      'MODEL.bend',
      'case True{}:\n      Search{latest, id}',
      'case True{}:\n      Search{latest, shown}',
      'failed',
      'Laws.latest_applied',
    ],
    [
      'PROOF.bend',
      'def Laws.issue_advances(latest, shown):\n  {==}',
      'def Laws.issue_advances(latest, shown):\n  ?TODO',
      'open',
      null,
    ],
    ['PROOF.bend', 'def nat_eq_refl(n):', '@unsafe def nat_eq_refl(n):', 'unsafe', null],
  ]
  for (const [file, from, to, status, failedAt] of cases) {
    const root = await fixtureCopy(t)
    await edit(join(root, file), from, to)
    const result = await proveLaws({ dir: root, bin })
    assert.equal(result.status, status, `${file}: ${result.stdout}${result.stderr}`)
    if (failedAt) assert.equal(result.failedAt, failedAt)
  }
  // 변형은 복사본에만 했다 — 원본 fixture는 여전히 증명된다.
  assert.equal((await proveLaws({ dir: FIXTURE, bin })).status, 'proven')
})

const PAY_LAWS = ['never_double_charge', 'pending_resolve_pays', 'paid_reachable']

test('[bend] the pay fixture proves a safety law over every trace', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const result = await proveLaws({ dir: PAY, bin, require: PAY_LAWS })
  assert.equal(result.status, 'proven', `${result.stdout}${result.stderr}`)
  assert.deepEqual(result.untrusted, [])
})

test('[bend] a model that charges twice fails at the broken step arm', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t, PAY)
  // A duplicate Resolve after payment now charges again: the proof that every step keeps the invariant breaks at that arm.
  await edit(
    join(root, 'MODEL.bend'),
    'case Pay{Paid{}, c} Resolve{}:\n      Pay{Paid{}, c}',
    'case Pay{Paid{}, c} Resolve{}:\n      Pay{Paid{}, 1n+c}',
  )
  const result = await proveLaws({ dir: root, bin, require: PAY_LAWS })
  const output = `${result.stdout}${result.stderr}`
  assert.equal(result.status, 'failed', output)
  assert.equal(result.failedAt, 'inv_step')
  // Bend prints the failing arm's head above the marked line; a failure at a neighbouring arm prints another head.
  assert.match(output, /case M\.Pay\{M\.Paid\{\}, c\} M\.Resolve\{\}:\n[ \t]*\d+>\|/)
})

test('[bend] the stale-search-env fixture proves shown ≤ latest over every trace', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const result = await proveLaws({ dir: SEARCH_ENV, bin, require: ['shown_le_latest'] })
  assert.equal(result.status, 'proven', `${result.stdout}${result.stderr}`)
  assert.deepEqual(result.untrusted, [])
})

// bend-proof.md cuts its relation example from this model, so the kernel must prove the relations it states.
test("[bend] the toggle fixture's relation laws are proven by the verdict kernel", async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const result = await proveLaws({ dir: TOGGLE, bin, require: ['blocked_keeps', 'free_applies'] })
  assert.equal(result.status, 'proven', `${result.stdout}${result.stderr}`)
  assert.deepEqual(result.untrusted, [])
  assert.deepEqual(result.cells, { generated: [], skipped: [], temporaryCopy: false })
})

const CELL_RELATIONS = [
  'R_submit_reviews',
  'R_approve_publishes',
  'R_reject_returns',
  'R_archive_archives',
  'R_archive_again_stays',
  'R_not_owner_refused',
  'R_wrong_phase_refused',
  'R_refused_keeps',
  'R_stayed_keeps',
]
const CELL_LAWS = CELL_RELATIONS.map((name) => name.slice(2))
const MODEL_SCRIPT = join(SCRIPTS, 'oracle-model.mjs')
const oracleModel = (...args) => spawnSync(process.execPath, [MODEL_SCRIPT, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 })

test('[bend] prove closes the cells fixture with generated arms and leaves the directory as it was', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  // PROOF.bend defines no law: it is the three imports and nothing else
  assert.equal(await readFile(join(CELLS, 'PROOF.bend'), 'utf8'), PROOF_IMPORTS)
  const before = await listing(CELLS)
  const run = oracleModel('prove', '--dir', CELLS)
  assert.equal(run.status, 0, run.stderr)
  const result = JSON.parse(run.stdout)
  assert.equal(result.status, 'proven', `${result.stdout}${result.stderr}`)
  // 20 states × 8 events per law
  assert.deepEqual(result.cells, {
    generated: CELL_LAWS.map((law) => ({ law, cases: 160 })),
    skipped: [],
    temporaryCopy: true,
  })
  assert.deepEqual(result.inputs.map(({ path }) => path).sort(), ['LAWS.bend', 'MODEL.bend', 'PROOF.bend'])
  assert.deepEqual(await listing(CELLS), before)

  // the toggle laws proven by hand are proven the same way once PROOF.bend keeps only its imports
  const toggle = await fixtureCopy(t, TOGGLE)
  await writeFile(join(toggle, 'PROOF.bend'), PROOF_IMPORTS)
  const generated = await proveLaws({ dir: toggle, bin, require: ['blocked_keeps', 'free_applies'] })
  assert.equal(generated.status, 'proven', `${generated.stdout}${generated.stderr}`)
  assert.deepEqual(generated.cells.generated, [
    { law: 'blocked_keeps', cases: 48 },
    { law: 'free_applies', cases: 48 },
  ])
})

test('[bend] a generated arm the model breaks fails at its law, and a law PROOF.bend defines stays with PROOF.bend', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  // archiving an archived document now publishes it while claiming Stayed
  const broken = await fixtureCopy(t, CELLS)
  await edit(
    join(broken, 'MODEL.bend'),
    'case Archived{} Archive{o}:\n      Doc{Archived{}, Stayed{}}',
    'case Archived{} Archive{o}:\n      Doc{Published{}, Stayed{}}',
  )
  const failed = await proveLaws({ dir: broken, bin })
  assert.equal(failed.status, 'failed', `${failed.stdout}${failed.stderr}`)
  // `laws` on the same mutant finds only R_stayed_keeps false (the cells laws test below)
  assert.equal(failed.failedAt, 'Laws.stayed_keeps')

  // a hand def wins even when it is a hole: that law is open and the other eight are still generated
  const holed = await fixtureCopy(t, CELLS)
  await writeFile(join(holed, 'PROOF.bend'), `${PROOF_IMPORTS}\ndef Laws.stayed_keeps(s, m):\n  ?TODO\n`)
  const open = await proveLaws({ dir: holed, bin })
  assert.equal(open.status, 'open', `${open.stdout}${open.stderr}`)
  assert.deepEqual(
    open.cells.generated.map(({ law }) => law),
    CELL_LAWS.filter((law) => law !== 'stayed_keeps'),
  )
})

/** 실제 컴파일된 fixture 모델 위의 lawReport. */
async function fixtureLaws(bin, dir, options) {
  const entry = join(dir, 'MODEL.bend')
  const { exported } = await compileBend({ entry, bin })
  return lawReport({ source: await readFile(entry, 'utf8'), exported, ...options })
}

test('[bend] laws on the toggle and session fixtures: cells the observation pins, and what each relation adds', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const toggle = await fixtureLaws(bin, TOGGLE, {
    prefix: 'Toggle',
    state: 'Toggle',
    command: 'Cmd',
    relations: ['R_blocked_keeps', 'R_free_applies'],
    observe: 'checked',
  })
  assert.equal(toggle.status, 'ok')
  assert.deepEqual(toggle.domain, { states: 8, commands: 6, cells: 48 })
  assert.equal(toggle.counterexampleCount, 0)
  assert.deepEqual(counts(toggle.strength), {
    scope: 'Toggle.checked',
    pinnedCount: 16,
    freeCount: 32,
    emptyCount: 0,
    alternatives: 32,
    marginal: { 'Toggle.R_blocked_keeps': 12, 'Toggle.R_free_applies': 4 },
  })
  assert.match(toggle.hint, /^32 cells leave Toggle\.checked open/)

  const session = await fixtureLaws(bin, SESSION, {
    prefix: 'Session',
    state: 'Session',
    command: 'Cmd',
    relations: ['R_expired_blocks', 'R_live_sends'],
    observe: 'sent',
  })
  assert.equal(session.status, 'ok')
  assert.deepEqual(counts(session.strength), {
    scope: 'Session.sent',
    pinnedCount: 4,
    freeCount: 4,
    emptyCount: 0,
    alternatives: 4,
    marginal: { 'Session.R_expired_blocks': 2, 'Session.R_live_sends': 2 },
  })
})

test('[bend] laws on the cells fixture: nine relations pin all 160 cells, and without the frame relations the hint names phase', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const cells = (relations) =>
    fixtureLaws(bin, CELLS, { prefix: 'Doc', state: 'Doc', command: 'Msg', relations })
  const all = await cells(CELL_RELATIONS)
  assert.equal(all.status, 'ok')
  assert.deepEqual(all.domain, { states: 20, commands: 8, cells: 160 })
  // Doc.observe returns the whole record, so scope is that def and the kept fields are counted
  assert.deepEqual(counts(all.strength), {
    scope: 'Doc.observe',
    pinnedCount: 160,
    freeCount: 0,
    emptyCount: 0,
    alternatives: 0,
    marginal: {
      'Doc.R_submit_reviews': 5,
      'Doc.R_approve_publishes': 5,
      'Doc.R_reject_returns': 5,
      'Doc.R_archive_archives': 5,
      'Doc.R_archive_again_stays': 5,
      'Doc.R_not_owner_refused': 80,
      'Doc.R_wrong_phase_refused': 55,
      'Doc.R_refused_keeps': 135,
      'Doc.R_stayed_keeps': 5,
    },
  })
  assert.deepEqual(all.strength.keptFields, {})
  assert.equal('hint' in all, false)

  const unframed = await cells(CELL_RELATIONS.filter((name) => !['R_refused_keeps', 'R_stayed_keeps'].includes(name)))
  assert.equal(unframed.status, 'ok')
  assert.equal(unframed.strength.pinnedCount, 20)
  assert.equal(unframed.strength.freeCount, 140)
  assert.deepEqual(unframed.strength.keptFields, { phase: 140 })
  assert.match(unframed.hint, /phase in 140 cells/)
  assert.match(unframed.hint, /a refused or stayed event keeps phase/)

  // archiving an archived document publishes it while claiming Stayed: the frame law breaks at each Archived state
  const mutant = await fixtureCopy(t, CELLS)
  await edit(
    join(mutant, 'MODEL.bend'),
    'case Archived{} Archive{o}:\n      Doc{Archived{}, Stayed{}}',
    'case Archived{} Archive{o}:\n      Doc{Published{}, Stayed{}}',
  )
  const broken = await fixtureLaws(bin, mutant, { prefix: 'Doc', state: 'Doc', command: 'Msg', relations: CELL_RELATIONS })
  assert.equal(broken.status, 'counterexample')
  // one per `last` value of an Archived document
  assert.equal(broken.counterexampleCount, 5)
  assert.deepEqual(broken.counterexamples[0], {
    relation: 'Doc.R_stayed_keeps',
    state: 'M.Doc{M.Archived{}, M.Began{}}',
    command: 'M.Archive{True{}}',
    after: 'M.Doc{M.Published{}, M.Stayed{}}',
  })
  for (const { relation, state, command, after } of broken.counterexamples)
    assert.deepEqual(
      [relation, state.startsWith('M.Doc{M.Archived{}, '), command, after],
      ['Doc.R_stayed_keeps', true, 'M.Archive{True{}}', 'M.Doc{M.Published{}, M.Stayed{}}'],
    )
  assert.match(broken.hint, /^Doc\.R_stayed_keeps is false at M\.Doc\{M\.Archived\{\}, M\.Began\{\}\} M\.Archive\{True\{\}\}/)
})

test('[bend] the laws command lists the one CTI of pay and whether the space at bound 4 reaches it', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const model = join(PAY, 'MODEL.bend')
  const pay = ['--model', model, '--prefix', 'Pay', '--state', 'Pay', '--command', 'Msg', '--invariant', 'at_most_one']
  const run = oracleModel('laws', ...pay, '--nat-max', '2', '--bound', '4')
  // a counterexample to induction is not ok: exit 1 with the report on stdout
  assert.equal(run.status, 1, run.stderr)
  const report = JSON.parse(run.stdout)
  assert.equal(report.status, 'not-inductive')
  assert.equal(report.strength, null)
  assert.deepEqual({ bounded: report.bounded, bounds: report.bounds }, { bounded: true, bounds: { nat: 2 } })
  assert.deepEqual(report.domain, { states: 12, commands: 3, cells: 36 })
  assert.deepEqual(report.invariant, {
    def: 'Pay.at_most_one',
    states: 8,
    ctiCount: 1,
    ctis: [{ state: 'M.Pay{M.Pending{}, 1n}', command: 'M.Resolve{}', after: 'M.Pay{M.Paid{}, 2n}', reached: null }],
    reach: { bound: 4, complete: true },
    reachedCount: 0,
    firstReached: null,
  })
  assert.match(report.hint, /^1 counterexample to induction of Pay\.at_most_one/)
  assert.deepEqual(report.bend, { bin, version: BEND_VERSION })
  assert.deepEqual(report.inputs.map(({ path }) => path), ['MODEL.bend'])

  // without --bound no space is enumerated and the CTI has no reached field
  const unreached = JSON.parse(oracleModel('laws', ...pay, '--nat-max', '2').stdout)
  assert.equal(unreached.invariant.reach, null)
  assert.equal('reached' in unreached.invariant.ctis[0], false)

  // an invariant the space does break: its CTI state is reached by the first trace of the space that gets there
  const zero = await fixtureCopy(t, PAY)
  await writeFile(
    join(zero, 'MODEL.bend'),
    `${await readFile(join(PAY, 'MODEL.bend'), 'utf8')}\ndef Pay.zero(s: Pay) -> Bool:\n  match s:\n    case Pay{st, c}:\n      Nat.is_le(c, 0n)\n`,
  )
  const zeroArgs = ['--model', join(zero, 'MODEL.bend'), '--prefix', 'Pay', '--state', 'Pay', '--command', 'Msg', '--invariant', 'zero']
  const reaching = oracleModel('laws', ...zeroArgs, '--nat-max', '2', '--bound', '4')
  assert.equal(reaching.status, 1, reaching.stderr)
  assert.deepEqual(JSON.parse(reaching.stdout).invariant, {
    def: 'Pay.zero',
    states: 4,
    ctiCount: 1,
    ctis: [{ state: 'M.Pay{M.Pending{}, 0n}', command: 'M.Resolve{}', after: 'M.Pay{M.Paid{}, 1n}', reached: ['M.Submit{}'] }],
    reach: { bound: 4, complete: true },
    reachedCount: 1,
    firstReached: { state: 'M.Pay{M.Pending{}, 0n}', command: 'M.Resolve{}', after: 'M.Pay{M.Paid{}, 1n}', reached: ['M.Submit{}'] },
  })

  // options of other commands are refused rather than dropped, and --bound means nothing without --invariant
  const foreign = oracleModel('laws', ...pay, '--nat-max', '2', '--max-cases', '3')
  assert.equal(foreign.status, 2)
  assert.match(foreign.stderr, /^USAGE: laws does not take --max-cases\n/)
  const toggleArgs = ['--model', join(TOGGLE, 'MODEL.bend'), '--prefix', 'Toggle', '--state', 'Toggle', '--command', 'Cmd']
  const boundOnly = oracleModel('laws', ...toggleArgs, '--relation', 'R_blocked_keeps', '--bound', '2')
  assert.equal(boundOnly.status, 2)
  assert.match(boundOnly.stderr, /^USAGE: --bound sets the space .*pass it with --invariant/)

  // coded errors from the laws module keep their code and the usage exit code
  const unbounded = oracleModel('laws', ...pay)
  assert.equal(unbounded.status, 2)
  assert.match(unbounded.stderr, /^SAMPLING_BOUND_REQUIRED: .*--nat-max/)
  const relation = oracleModel('laws', '--model', join(TOGGLE, 'MODEL.bend'), '--prefix', 'Toggle', '--state', 'Toggle', '--command', 'Cmd', '--relation', 'R_none')
  assert.equal(relation.status, 2)
  assert.match(relation.stderr, /^RELATION_INVALID: Toggle\.R_none must be def Toggle\.R_none\(s: Toggle, c: Cmd, t: Toggle\) -> Bool/)
  const nothing = oracleModel('laws', '--model', model, '--prefix', 'Pay', '--state', 'Pay', '--command', 'Msg')
  assert.equal(nothing.status, 2)
  assert.match(nothing.stderr, /^USAGE: usage:/)

  const holds = oracleModel('laws', '--model', join(TOGGLE, 'MODEL.bend'), '--prefix', 'Toggle', '--state', 'Toggle', '--command', 'Cmd', '--relation', 'R_blocked_keeps', '--relation', 'R_free_applies')
  assert.equal(holds.status, 0, holds.stderr)
  assert.equal(JSON.parse(holds.stdout).status, 'ok')
})

test('[bend] the pagination cover closes at 48 configurations within 5 events; stale-search is capped with no diameter', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const run = oracleModel('space', '--model', join(PAGINATION, 'MODEL.bend'), '--prefix', 'Grid', '--bound', '3')
  assert.equal(run.status, 0, run.stderr)
  const { cover } = JSON.parse(run.stdout)
  assert.deepEqual({ status: cover.status, configurations: cover.configurations, diameter: cover.diameter }, { status: 'closed', configurations: 48, diameter: 5 })

  const search = await loadModel({ model: join(FIXTURE, 'MODEL.bend'), prefix: 'Search', bin })
  const capped = transitionCover(search, enumerateSpace(search, { bound: 3 }))
  assert.deepEqual({ status: capped.status, configurations: capped.configurations, diameter: capped.diameter }, { status: 'capped', configurations: 2000, diameter: null })
})

test('[bend] loading an unchanged model returns the one compiled model, and a changed file returns another', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t)
  const entry = join(root, 'MODEL.bend')
  const first = await loadModel({ model: entry, prefix: 'Search', bin })
  assert.equal(await loadModel({ model: entry, prefix: 'Search', bin }), first)
  await writeFile(entry, `${await readFile(entry, 'utf8')}\n# a comment changes the bytes, not the model\n`)
  const edited = await loadModel({ model: entry, prefix: 'Search', bin })
  assert.notEqual(edited, first)
  assert.notEqual(edited.digest, first.digest)
})

test('[bend] the compiled model yields the same 10-case space every time, with every required scenario', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const model = await loadModel({ model: join(FIXTURE, 'MODEL.bend'), prefix: 'Search', bin })
  const space = enumerateSpace(model, { bound: 4 })
  const again = enumerateSpace(await loadModel({ model: join(FIXTURE, 'MODEL.bend'), prefix: 'Search', bin }), {
    bound: 4,
  })

  assert.deepEqual(model.bend, { bin, version: BEND_VERSION })
  assert.equal(space.complete, true)
  assert.equal(space.cases.length, 10)
  assert.equal(again.spaceDigest, space.spaceDigest)
  assert.deepEqual(
    again.cases.map(({ id }) => id),
    space.cases.map(({ id }) => id),
  )

  const observed = (labels) => space.cases.find(({ label }) => label === labels || label.startsWith(`${labels} · `))
  assert.deepEqual(observed('Issue · Respond{id:1}').observations.slice(0, 2), [0, 1])
  assert.deepEqual(observed('Issue · Issue · Respond{id:1} · Respond{id:2}').observations, [0, 0, 0, 2])
  assert.deepEqual(observed('Issue · Issue · Respond{id:2} · Respond{id:1}').observations, [0, 0, 2, 2])
  // 최신 응답이 아직 오지 않은 prefix: 미래의 응답을 가정하지 않는다 — 그 시점 관측값만 판정한다.
  assert.deepEqual(observed('Issue · Issue · Respond{id:1}').observations.slice(0, 3), [0, 0, 0])
  // 환경은 요청 전 응답·중복 응답을 내지 않는다.
  assert.equal(
    space.cases.some(({ label }) => label.startsWith('Respond')),
    false,
  )
  assert.equal(
    space.cases.some(({ label }) => label.split('Respond{id:1}').length > 2),
    false,
  )
})

test('[bend] moving the environment into the state keeps the oracle space', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const fromHistory = await loadModel({ model: join(FIXTURE, 'MODEL.bend'), prefix: 'Search', bin })
  const fromState = await loadModel({ model: join(SEARCH_ENV, 'MODEL.bend'), prefix: 'Search', bin })
  // Bound 4 has the 10 cases pinned above; the other bounds are observed from the compiled models.
  for (const [bound, caseCount] of [[3, 4], [4, 10], [5, 26]]) {
    const before = enumerateSpace(fromHistory, { bound })
    const after = enumerateSpace(fromState, { bound })
    assert.equal(before.complete && after.complete, true, `bound ${bound}`)
    assert.equal(before.cases.length, caseCount, `bound ${bound}`)
    assert.equal(after.cases.length, caseCount, `bound ${bound}`)
    assert.equal(after.spaceDigest, before.spaceDigest, `bound ${bound}`)
  }
})

test('[bend] the reducer conforms on the space, and each wrong reducer fails with a concrete counterexample', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const space = enumerateSpace(await loadModel({ model: join(FIXTURE, 'MODEL.bend'), prefix: 'Search', bin }), {
    bound: 4,
  })

  const product = checkConformance(space, adapterFor(reduceSearch, initialSearch))
  assert.deepEqual({ pass: product.pass, passed: product.passed }, { pass: true, passed: 10 })

  const counterexample = ({ status, step, expected, observed }) => ({ status, step, expected, observed })
  const failing = (reduce, label) =>
    checkConformance(space, adapterFor(reduce, initialSearch)).failures.find((failure) => failure.label === label)
  assert.deepEqual(counterexample(failing(reduceWithoutStaleCheck, 'Issue · Issue · Respond{id:2} · Respond{id:1}')), {
    status: 'mismatch',
    step: 4,
    expected: 2,
    observed: 1,
  })
  assert.deepEqual(counterexample(failing(reduceIgnoringResponses, 'Issue · Respond{id:1} · Issue · Respond{id:2}')), {
    status: 'mismatch',
    step: 2,
    expected: 1,
    observed: 0,
  })
  assert.equal(checkConformance(space, adapterFor(reduceShowingPrevious, initialSearch)).pass, false)
})

// ── check·scaffold: Bend 실패를 한 턴 안에 고치게 한다 ──────────────────────────────────────

test('bend failure hints name one fix for each check failure seen in real runs', () => {
  const cases = [
    ["- expected : a fresh name (duplicate declaration: Event)", /domain name/],
    ["- observed : catalog (consumed more than once)", /\+x = v/],
    ["- message  : a match on a parameter or field (this name is a def or a consumed bind)", /before its first other use/],
    ["- message  : a declared constructor (unknown: Ui.Marks)", /type block/],
    ["- expected : a filled definition (an unfilled law is a dead claim: live code cannot", /def f/],
    ["- expected : an import ('import Base', or 'import <path> as <Name>')", /import Base/],
    // the missing constructors, one or several, as real runs printed them
    ['- expected : cases for MODEL.Refresh\n- observed : \\{}', /no case for MODEL\.Refresh: add a case for each \(in `match a b:` one pattern per value/],
    ['- expected : cases for MODEL.RdApple, MODEL.RdOther', /no case for MODEL\.RdApple, MODEL\.RdOther:/],
    // following a one-pattern fix inside `match s m:` (Bend 2.0.34 output)
    ["- expected : 2 patterns (one per scrutinee)\n- observed : 'Refresh{}'", /takes 2 values: give every case 2 patterns in order/],
  ]
  for (const [output, fix] of cases) assert.match(bendFailureHint(`SOME PROOFS FAIL\nError:\n${output}`), fix, output)
  assert.equal(bendFailureHint('SOME PROOFS FAIL\nError:\n- expected : Nat'), null)
})

test('check runs bend --check-only per file and attaches the failure hint', async (t) => {
  const dir = await workspace(t)
  await writeFile(join(dir, 'World.bend'), 'import Base\n')
  const ok = await checkBendFiles({ files: [join(dir, 'World.bend')], bin: (await fakeBend(dir, { stdout: '' })).bin })
  assert.deepEqual(ok.map(({ status }) => status), ['ok'])
  const failing = await fakeBend(dir, {
    stdout: 'SOME PROOFS FAIL\nError:\n- expected : a fresh name (duplicate declaration: Event)\nLocation: World.bend:3',
    exitCode: 1,
  })
  const [failed] = await checkBendFiles({ files: [join(dir, 'World.bend')], bin: failing.bin })
  assert.equal(failed.status, 'failed')
  assert.match(failed.hint, /domain name/)
  assert.match(failed.output, /duplicate declaration: Event/)
  const [missing] = await checkBendFiles({ files: [join(dir, 'World.bend')], bin: join(dir, 'no-such-bend') })
  assert.equal(missing.status, 'unavailable')
})

test('prove attaches the same hint to a failed verdict', async (t) => {
  const dir = await proofDir(t)
  const fake = await fakeBend(dir, { stdout: 'SOME PROOFS FAIL\nError:\n- observed : at (consumed more than once)\nLocation: Laws.a', exitCode: 1 })
  const result = await proveLaws({ dir, bin: fake.bin })
  assert.equal(result.status, 'failed')
  assert.match(result.hint, /reusable/)
})

test('scaffold writes the world record and finite field types and refuses names Base declares', () => {
  const base = 'type Result<a> is Data:\n  Fail{error: E}\n  Done{value: A}\ntype Event is Data:\n  Move{x: U32}\n'
  const world = scaffoldWorld({ prefix: 'Race', fields: ['arrival=OldFirst,NewFirst', 'newAnswers=bool'], baseText: base })
  assert.match(world, /^import Base\n/)
  assert.match(world, /type Arrival is Data:\n {2}OldFirst\{\}\n {2}NewFirst\{\}/)
  assert.match(world, /type Race is Data:\n {2}Race\{arrival: Arrival, newAnswers: Bool\}/)
  assert.throws(
    () => scaffoldWorld({ prefix: 'Race', fields: ['outcome=Done,Fail'], baseText: base }),
    (error) => error.code === 'SCAFFOLD_NAME' && /Done/.test(error.message) && /Fail/.test(error.message),
  )
  assert.throws(
    () => scaffoldWorld({ prefix: 'Race', fields: ['a=On,Off', 'b=On,Idle'], baseText: base }),
    (error) => error.code === 'SCAFFOLD_NAME' && /On/.test(error.message),
  )
  assert.throws(() => scaffoldWorld({ prefix: 'race', fields: ['a=bool'], baseText: base }), (error) => error.code === 'USAGE')
  assert.throws(() => scaffoldWorld({ prefix: 'Race', fields: ['a='], baseText: base }), (error) => error.code === 'USAGE')
})

test('scaffolded world checks with the installed Bend', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const dir = await workspace(t)
  const base = spawnSync(bin, ['base'], { encoding: 'utf8', env: { ...process.env, BEND_NO_TELEMETRY: '1' } }).stdout
  const path = join(dir, 'World.bend')
  await writeFile(path, scaffoldWorld({ prefix: 'Race', fields: ['arrival=OldFirst,NewFirst', 'newAnswers=bool'], baseText: base }))
  const [result] = await checkBendFiles({ files: [path], bin })
  assert.equal(result.status, 'ok', result.output)
})

test('oracle-model help prints usage on stdout with scaffold and check', () => {
  const run = spawnSync(process.execPath, [join(SCRIPTS, 'oracle-model.mjs'), '--help'], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /oracle-model\.mjs scaffold --prefix/)
  assert.match(run.stdout, /oracle-model\.mjs check --file/)
})

test('oracle-model usage lists laws, and prove-cells is not a command: prove generates the cell proofs', () => {
  const help = spawnSync(process.execPath, [join(SCRIPTS, 'oracle-model.mjs'), '--help'], { encoding: 'utf8' })
  assert.match(help.stdout, /oracle-model\.mjs laws --model <MODEL\.bend> --prefix <Prefix> --state <Type> --command <Type>/)
  assert.doesNotMatch(help.stdout, /prove-cells/)
  // refused before Bend is looked up, so this runs without it
  const gone = spawnSync(process.execPath, [join(SCRIPTS, 'oracle-model.mjs'), 'prove-cells', '--dir', SCRIPTS], { encoding: 'utf8' })
  assert.equal(gone.status, 2)
  assert.match(gone.stderr, /^USAGE: usage:/)
})

// ── prove-reach: 유한 상태 기계의 도달 집합을 불변식으로 써서 모든 trace의 안전을 커널이 검사한다 ──────────────

test.describe('prove-reach', () => {
  const PAY_FINITE = fileURLToPath(new URL('../../../test-fixtures/pay-finite/', import.meta.url))
  const PAY_FINITE_MODEL = join(PAY_FINITE, 'MODEL.bend')
  const payKey = (state, charges) => stableStringify({ $: 'Pay', state: { $: state }, charges: { $: charges } })
  // Idle, Pending and Errored without a charge, Paid with one
  const PAY_REACHED = [payKey('Idle', 'NoCharge'), payKey('Pending', 'NoCharge'), payKey('Paid', 'OneCharge'), payKey('Errored', 'NoCharge')]
  const reach = (...args) => oracleModel('prove-reach', '--model', ...args)
  // A response comes only while the request is pending, and each response charges once.
  const REQUEST = [
    'import Base',
    '',
    'type Phase is Data:',
    '  Idle{}',
    '  Waiting{}',
    '  Finished{}',
    '',
    'type Msg is Data:',
    '  Request{}',
    '  Respond{}',
    '',
    'type Charges is Data:',
    '  NoCharge{}',
    '  OneCharge{}',
    '  ManyCharges{}',
    '',
    'type Rr is Data:',
    '  Rr{phase: Phase, charges: Charges}',
    '',
    'def Rr.more(c: Charges) -> Charges:',
    '  match c:',
    '    case NoCharge{}:',
    '      OneCharge{}',
    '    case OneCharge{}:',
    '      ManyCharges{}',
    '    case ManyCharges{}:',
    '      ManyCharges{}',
    '',
    'def Rr.init() -> Rr:',
    '  Rr{Idle{}, NoCharge{}}',
    '',
    'def Rr.step(s: Rr, m: Msg) -> Rr:',
    '  match s m:',
    '    case Rr{Idle{}, c} Request{}:',
    '      Rr{Waiting{}, c}',
    '    case Rr{Waiting{}, c} Request{}:',
    '      Rr{Waiting{}, c}',
    '    case Rr{Finished{}, c} Request{}:',
    '      Rr{Finished{}, c}',
    '    case Rr{p, c} Respond{}:',
    '      Rr{Finished{}, Rr.more(c)}',
    '',
    'def Rr.enabled(s: Rr) -> List<Msg>:',
    '  match s:',
    '    case Rr{Waiting{}, c}:',
    '      [Request{}, Respond{}]',
    '    case Rr{Idle{}, c}:',
    '      [Request{}]',
    '    case Rr{Finished{}, c}:',
    '      [Request{}]',
    '',
    'def Rr.safe(s: Rr) -> Bool:',
    '  match s:',
    '    case Rr{p, ManyCharges{}}:',
    '      False{}',
    '    case Rr{p, NoCharge{}}:',
    '      True{}',
    '    case Rr{p, OneCharge{}}:',
    '      True{}',
    '',
  ].join('\n')
  // the same environment read from the history by next, with no enabled export
  const REQUEST_NEXT = [
    REQUEST.replace('def Rr.enabled(', 'def Rr.allowed('),
    'def Rr.run(h: List<Msg>, s: Rr) -> Rr:',
    '  match h:',
    '    case Nil{}:',
    '      s',
    '    case Con{m, rest}:',
    '      Rr.run(rest, Rr.step(s, m))',
    '',
    'def Rr.next(h: List<Msg>) -> List<Msg>:',
    '  Rr.allowed(Rr.run(h, Rr.init()))',
    '',
  ].join('\n')

  test('reachPlan reads the state and event types from step and refuses a malformed init, safety def, enabled or limit', async () => {
    const source = await readFile(PAY_FINITE_MODEL, 'utf8')
    const plan = reachPlan({ source, prefix: 'Pay', safe: 'at_most_one' })
    assert.deepEqual(
      { state: plan.state, command: plan.command, safe: plan.safe, states: plan.stateCount, events: plan.commandCount, cells: plan.cells, enabled: plan.enabled },
      { state: 'Pay', command: 'Msg', safe: 'Pay.at_most_one', states: 12, events: 3, cells: 36, enabled: false },
    )
    const refused = (text, options, code) =>
      assert.throws(
        () => reachPlan({ source: text, prefix: 'Pay', safe: 'at_most_one', ...options }),
        (error) => error.code === code,
        code,
      )
    refused(source, { prefix: 'pay' }, 'USAGE')
    refused(source, { safe: 'Pay.at_most_one' }, 'USAGE')
    refused(source, { maxCells: 0 }, 'USAGE')
    // observe returns the state, not a Bool
    refused(source, { safe: 'observe' }, 'SAFE_INVALID')
    refused(source.replace('def Pay.init() -> Pay:', 'def Pay.init(c: Charges) -> Pay:'), {}, 'INIT_INVALID')
    refused(source.replace('def Pay.step(s: Pay, m: Msg) -> Pay:', 'def Pay.step(s: Pay, m: Msg) -> Bool:'), {}, 'STEP_INVALID')
    refused(`${source}\ndef Pay.enabled(s: Pay) -> List<State>:\n  []\n`, {}, 'ENABLED_INVALID')
    const enabled = reachPlan({ source: `${source}\ndef Pay.enabled(s: Pay) -> List<Msg>:\n  []\n`, prefix: 'Pay', safe: 'at_most_one' })
    assert.equal(enabled.enabled, true)
  })

  test('refuses an infinite state or event type as NOT_FINITE and a domain over --max-cells, before running Bend', async (t) => {
    const missing = join(await workspace(t), 'no-such-bend')
    // the pay fixture counts charges in a Nat
    await assert.rejects(
      proveReach({ model: join(PAY, 'MODEL.bend'), prefix: 'Pay', safe: 'at_most_one', bin: missing }),
      (error) => error.code === 'NOT_FINITE' && /the state type Pay is infinite \(Pay\.Pay\.charges is a Nat\)/.test(error.message),
    )
    await assert.rejects(
      proveReach({ model: PAY_FINITE_MODEL, prefix: 'Pay', safe: 'at_most_one', bin: missing, maxCells: 35 }),
      (error) =>
        error.code === 'REACH_TOO_LARGE' && error.exitCode === 2 && /12 states × 3 events = 36 cells, more than --max-cells 35/.test(error.message),
    )
    // at the limit the plan passes, and only then is Bend needed
    await assert.rejects(
      proveReach({ model: PAY_FINITE_MODEL, prefix: 'Pay', safe: 'at_most_one', bin: missing, maxCells: 36 }),
      (error) => error.code === 'BEND_UNAVAILABLE',
    )
    assert.equal(MAX_REACH_CELLS, 100_000)
    const machine = (types, initial) =>
      `import Base\n${types}\ndef S.init() -> S:\n  ${initial}\n\ndef S.step(s: S, m: Msg) -> S:\n  s\n\ndef S.ok(s: S) -> Bool:\n  True{}\n`
    const notFinite = (types, initial, reason) =>
      assert.throws(
        () => reachPlan({ source: machine(types, initial), prefix: 'S', safe: 'ok' }),
        (error) => error.code === 'NOT_FINITE' && reason.test(error.message),
        String(reason),
      )
    notFinite('type Msg is Data:\n  Respond{id: Nat}\n\ntype S is Data:\n  S{on: Bool}\n', 'S{False{}}', /the event type Msg is infinite \(Msg\.Respond\.id is a Nat\)/)
    notFinite('type Msg is Data:\n  Go{}\n\ntype S is Data:\n  Leaf{}\n  Node{next: S}\n', 'Leaf{}', /the state type S is recursive/)
    notFinite('type Msg is Data:\n  Go{}\n\ntype S is Data:\n  S{seen: List<Msg>}\n', 'S{[]}', /S\.S\.seen is a List/)
    // finite, but 2^(32 × 40) values overflow a number: too large, not a crash on the missing infinite field
    const fields = (type, count) => Array.from({ length: count }, (_, at) => `f${at}: ${type}`).join(', ')
    const wide = `type Msg is Data:\n  Go{}\n\ntype W is Data:\n  W{${fields('Bool', 32)}}\n\ntype S is Data:\n  S{${fields('W', 40)}}\n`
    assert.throws(
      () => reachPlan({ source: machine(wide, 'S{}'), prefix: 'S', safe: 'ok' }),
      (error) =>
        error.code === 'REACH_TOO_LARGE' && error.exitCode === 2 && /the state type S has more values than a number can count/.test(error.message),
    )
  })

  test('reachProof writes an arm per state, event arms only under reached states, and the stutter step only with enabled', async () => {
    const plan = reachPlan({ source: await readFile(PAY_FINITE_MODEL, 'utf8'), prefix: 'Pay', safe: 'at_most_one' })
    const { text, arms } = reachProof(plan, new Set(PAY_REACHED), './MODEL.bend')
    // inv, the outer inv_step match and inv_safe have 12 arms each; the 4 reached states match the 3 events
    assert.equal(arms, 12 * 3 + 4 * 3)
    assert.match(text, /^import \.\/MODEL\.bend as M$/m)
    assert.match(text, /^ {4}case M\.Pay\{M\.Paid\{\}, M\.OneCharge\{\}\}:\n {6}True\{\}$/m)
    assert.match(text, /^ {4}case M\.Pay\{M\.Paid\{\}, M\.ManyCharges\{\}\}:\n {6}False\{\}$/m)
    assert.match(text, /^ {6}Reach\.no_step\(M\.Pay\{M\.Paid\{\}, M\.ManyCharges\{\}\}, m, h\)$/m)
    assert.match(text, /^ {6}Reach\.no_safe\(M\.Pay\{M\.Paid\{\}, M\.ManyCharges\{\}\}, h\)$/m)
    assert.equal(text.match(/^ {6}match m:$/gm).length, 4)
    // a wildcard arm does not refine the goal, so every arm names its state
    assert.doesNotMatch(text, /case _:/)
    assert.match(text, /^def Reach\.step\(s: M\.Pay, m: M\.Msg\) -> M\.Pay:\n {2}M\.Pay\.step\(s, m\)$/m)
    assert.match(text, /^law reach_safe:\n {2}for t: List<M\.Msg>\n {2}\{M\.Pay\.at_most_one\(Reach\.run\(t, M\.Pay\.init\(\)\)\) == True\{\} : Bool\}$/m)
    assert.match(text, /^def reach_safe\(t\):\n {2}Reach\.safe_run\(t, M\.Pay\.init\(\), \{==\}\)$/m)
    const stutter = reachProof({ ...plan, enabled: true }, new Set(PAY_REACHED), './MODEL.bend')
    assert.match(stutter.text, /^ {2}Reach\.keep\(Reach\.has\(M\.Pay\.enabled\(s\), m\), s, M\.Pay\.step\(s, m\)\)$/m)
    // one equality arm per event and the fallback
    assert.equal(stutter.arms, arms + 3 + 1)
  })

  test('the usage lists prove-reach, which refuses a missing --safe and another command option before looking for Bend', () => {
    const help = spawnSync(process.execPath, [MODEL_SCRIPT, '--help'], { encoding: 'utf8' })
    assert.match(help.stdout, /oracle-model\.mjs prove-reach --model <MODEL\.bend> --prefix <Prefix> --safe <def> \[--max-cells <n>\]/)
    const noSafe = reach(PAY_FINITE_MODEL, '--prefix', 'Pay')
    assert.equal(noSafe.status, 2)
    assert.match(noSafe.stderr, /^USAGE: usage:/)
    const foreign = reach(PAY_FINITE_MODEL, '--prefix', 'Pay', '--safe', 'at_most_one', '--bound', '3')
    assert.equal(foreign.status, 2)
    assert.match(foreign.stderr, /^USAGE: prove-reach does not take --bound/)
  })

  test('[bend] certifies pay-finite over every trace in a temporary copy and leaves the directory as it was', async (t) => {
    const bin = await installedBend(t)
    if (!bin) return
    const before = await listing(PAY_FINITE)
    const run = reach(PAY_FINITE_MODEL, '--prefix', 'Pay', '--safe', 'at_most_one')
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`)
    const result = JSON.parse(run.stdout)
    assert.equal(result.status, 'proven', result.output)
    assert.equal(result.safe, 'Pay.at_most_one')
    assert.equal(result.allowed, 'every event')
    assert.match(result.claim, /^for every t: List<Msg>, Pay\.at_most_one\(run\(t, Pay\.init\(\)\)\) is True, where run folds Pay\.step over t$/)
    assert.deepEqual(result.domain, { states: 12, events: 3, cells: 36 })
    // Submit · Resolve reaches the farthest of the four states
    assert.equal(result.reachable, 4)
    assert.equal(result.diameter, 2)
    assert.equal(result.proof.temporaryCopy, true)
    assert.equal(result.proof.arms, 12 * 3 + 4 * 3)
    assert.match(result.inputDigest, /^[0-9a-f]{64}$/)
    assert.deepEqual(result.inputs.map(({ path }) => path), ['MODEL.bend'])
    assert.equal(result.bend.version, BEND_VERSION)
    assert.deepEqual(await listing(PAY_FINITE), before)
    // the same input gives the same digest
    assert.equal(JSON.parse(reach(PAY_FINITE_MODEL, '--prefix', 'Pay', '--safe', 'at_most_one').stdout).inputDigest, result.inputDigest)

    // the fixture laws, the safety law proven by hand, close under prove with the generated cell law
    const proved = await proveLaws({ dir: PAY_FINITE, bin, require: PAY_LAWS })
    assert.equal(proved.status, 'proven', `${proved.stdout}${proved.stderr}`)
    assert.deepEqual(proved.cells.generated, [{ law: 'pending_resolve_pays', cases: 3 }])
  })

  test('[bend] a model that charges again on a duplicate Resolve gets its shortest counterexample, and the kernel is not run', async (t) => {
    const bin = await installedBend(t)
    if (!bin) return
    const root = await fixtureCopy(t, PAY_FINITE)
    await edit(
      join(root, 'MODEL.bend'),
      'case Pay{Paid{}, c} Resolve{}:\n      Pay{Paid{}, c}',
      'case Pay{Paid{}, c} Resolve{}:\n      Pay{Paid{}, Pay.more(c)}',
    )
    const before = await listing(root)
    const run = reach(join(root, 'MODEL.bend'), '--prefix', 'Pay', '--safe', 'at_most_one')
    assert.equal(run.status, 1, run.stderr)
    const result = JSON.parse(run.stdout)
    assert.equal(result.status, 'counterexample')
    assert.equal(result.violations, 1)
    // breadth first: Paid with two charges is first reached after three events
    assert.deepEqual(result.counterexample, {
      length: 3,
      label: 'Submit · Resolve · Resolve',
      trace: [{ $: 'Submit' }, { $: 'Resolve' }, { $: 'Resolve' }],
      events: '[M.Submit{}, M.Resolve{}, M.Resolve{}]',
      state: 'M.Pay{M.Paid{}, M.ManyCharges{}}',
      allowedByNext: true,
    })
    assert.match(result.hint, /POLICY_GAP/)
    assert.equal(result.proof, undefined)
    assert.deepEqual(await listing(root), before)
    const fixture = JSON.parse(reach(PAY_FINITE_MODEL, '--prefix', 'Pay', '--safe', 'at_most_one').stdout)
    assert.notEqual(result.inputDigest, fixture.inputDigest)
  })

  test('[bend] the kernel, not the tool, decides: an invariant missing a reached state or holding an unsafe one is refused', async (t) => {
    const bin = await installedBend(t)
    if (!bin) return
    const plan = reachPlan({ source: await readFile(PAY_FINITE_MODEL, 'utf8'), prefix: 'Pay', safe: 'at_most_one' })
    const inputs = await bendInputs(PAY_FINITE_MODEL)
    const verdictFor = (members) =>
      verdictBeside({ entry: PAY_FINITE_MODEL, inputs, fileName: 'REACH.bend', text: reachProof(plan, new Set(members), './MODEL.bend').text, bin })
    assert.equal((await verdictFor(PAY_REACHED)).status, 'proven')
    // Errored is reached by Submit · Reject: without it a step leaves the invariant
    assert.deepEqual(await verdictFor(PAY_REACHED.filter((key) => key !== payKey('Errored', 'NoCharge'))), {
      status: 'failed',
      failedAt: 'Reach.inv_step',
    })
    // Paid with two charges is closed under every step but breaks the safety def
    assert.deepEqual(await verdictFor([...PAY_REACHED, payKey('Paid', 'ManyCharges')]), { status: 'failed', failedAt: 'Reach.inv_safe' })
  })

  test('[bend] with enabled, only allowed events count: an event the environment does not send keeps the state', async (t) => {
    const bin = await installedBend(t)
    if (!bin) return
    const root = await workspace(t)
    const model = join(root, 'MODEL.bend')
    await writeFile(model, REQUEST)
    const allowed = await proveReach({ model, prefix: 'Rr', safe: 'safe', bin })
    assert.equal(allowed.status, 'proven', allowed.output)
    assert.equal(allowed.allowed, 'Rr.enabled')
    assert.match(allowed.claim, /and keeps the state on an event Rr\.enabled does not list$/)
    // Idle, Waiting, then Finished with one charge
    assert.equal(allowed.reachable, 3)
    // every event counts without enabled: two responses charge twice, a trace next never allows
    await writeFile(model, REQUEST_NEXT)
    const every = await proveReach({ model, prefix: 'Rr', safe: 'safe', bin })
    assert.equal(every.status, 'counterexample')
    assert.equal(every.allowed, 'every event')
    assert.equal(every.counterexample.label, 'Respond · Respond')
    assert.equal(every.counterexample.allowedByNext, false)
    assert.match(every.hint, /export enabled\(state\)/)
    assert.deepEqual(await listing(root), ['MODEL.bend'])
  })

  test('[bend] never checks the generated proof under the name of a file the model imports', async (t) => {
    const bin = await installedBend(t)
    if (!bin) return
    const root = await fixtureCopy(t, PAY_FINITE)
    await writeFile(join(root, 'REACH.bend'), 'import Base\n\ndef keep(b: Bool) -> Bool:\n  b\n')
    await edit(join(root, 'MODEL.bend'), 'import Base\n', 'import Base\nimport ./REACH.bend as Helper\n')
    const before = await readFile(join(root, 'REACH.bend'), 'utf8')
    const result = await proveReach({ model: join(root, 'MODEL.bend'), prefix: 'Pay', safe: 'at_most_one', bin })
    assert.equal(result.status, 'failed')
    assert.match(result.reason, /REACH\.bend beside the model is in its import closure/)
    assert.equal(result.proof, undefined)
    assert.equal(await readFile(join(root, 'REACH.bend'), 'utf8'), before)
  })
})
