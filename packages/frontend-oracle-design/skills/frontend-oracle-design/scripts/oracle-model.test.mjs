import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { access, chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
import { sha256 } from './oracle-fs.mjs'
import {
  bendFailureHint,
  checkBendFiles,
  checkConformance,
  classifyTrace,
  enumerateSpace,
  formalModelIssues,
  LISTED_CASES,
  listedSpace,
  loadModel,
  minimalCover,
  parseFormalModel,
  proveLaws,
  scaffoldWorld,
  scanBendSource,
  transitionCover,
} from './oracle-model.mjs'
import { installedBend } from './oracle-test-bend.mjs'

const FIXTURE = fileURLToPath(new URL('../../../test-fixtures/stale-search/', import.meta.url))
const SCRIPTS = fileURLToPath(new URL('.', import.meta.url))

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'oracle-model-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

/** fixture를 임시 디렉터리에 복사한다 — 모델·증명 변형은 여기서만 하고 원본은 건드리지 않는다. */
async function fixtureCopy(t) {
  const root = await workspace(t)
  await cp(FIXTURE, root, { recursive: true })
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
  assert.deepEqual(scanned.laws, [
    { name: 'w', witness: true },
    { name: 's', witness: false },
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
  // card here, so record it as DRAFTED on its current bytes
  const packageBytes = await readFile(join(root, 'oracle.package.json'))
  await writeFile(
    join(root, 'stage.json'),
    JSON.stringify({ schemaVersion: 1, stage: 'DRAFTED', packageSha256: sha256(packageBytes), history: [] }),
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
