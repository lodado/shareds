import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import fc from 'fast-check'
import { BEND_VERSION, ensureBend } from './ensure-bend.mjs'
import {
  classifyTrace,
  enumerateSpace,
  formalModelIssues,
  parseFormalModel,
  projectionResidue,
} from './oracle-model.mjs'
import { auditAdapterSource, emitState, emitTrace, emitWorld, replay } from './oracle-projection.mjs'
import {
  arbitraryOf,
  bendLiteral,
  cardinality,
  defSignature,
  parseBendTypes,
  toPlain,
  toRuntime,
  typeIR,
  valuesOf,
} from './oracle-types.mjs'

const PACKAGE = fileURLToPath(new URL('../../', import.meta.url))
const FIXTURES = join(PACKAGE, 'test-fixtures')
const TOGGLE = await readFile(join(FIXTURES, 'toggle', 'MODEL.bend'), 'utf8')
const SAMPLE_TYPES = `import Base

type Level is Data:
  Low{}
  High{}

type Item is Data:
  Item{on: Bool, level: Level, count: Nat, tags: List<&2, Level>, note: Maybe<&2, Bool>}

type Tree is Data:
  Leaf{}
  Node{left: Tree}
`

/** 설치된 고정 Bend가 있을 때만 돈다 — 테스트는 내려받지 않는다. skip은 통과가 아니라 skipped로 남는다. */
async function installedBend(t) {
  try {
    const { bin } = await ensureBend({
      download: () => {
        throw Object.assign(new Error('tests never download Bend'), { code: 'BEND_NOT_INSTALLED' })
      },
    })
    return bin
  } catch (error) {
    t.skip(`Bend ${BEND_VERSION} is not installed (${error.code ?? error.message}) — real Bend integration not run`)
    return null
  }
}

/** fixture 복사본 + 생성 테스트가 fast-check를 찾을 수 있게 node_modules/fast-check 링크. 원본은 건드리지 않는다. */
async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'oracle-projection-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'node_modules'))
  await symlink(join(PACKAGE, 'node_modules', 'fast-check'), join(root, 'node_modules', 'fast-check'))
  for (const name of ['stale-search', 'toggle', 'doc-save']) await cp(join(FIXTURES, name), join(root, name), { recursive: true })
  return root
}

function runGenerated(file) {
  // 바깥 node --test의 자식 프로토콜 변수를 지운다 — 남기면 자식이 요약 대신 직렬화된 보고를 낸다.
  const { NODE_TEST_CONTEXT: _parent, ...env } = process.env
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=spec', file], { encoding: 'utf8', env })
  const count = (label) => Number(run.stdout.match(new RegExp(`ℹ ${label} (\\d+)`))?.[1] ?? Number.NaN)
  return {
    ...run,
    output: `${run.stdout}${run.stderr}`,
    tests: count('tests'),
    pass: count('pass'),
    fail: count('fail'),
  }
}

test('Bend types become one IR: records, sums, enums, bounded Nat, List and Maybe; recursion and unknown types are refused', () => {
  const types = parseBendTypes(SAMPLE_TYPES)
  const item = typeIR('Item', types, { nat: 2, list: 1 })
  assert.deepEqual(
    item.constructors[0].fields.map(({ name, type }) => [name, type.kind]),
    [
      ['on', 'bool'],
      ['level', 'data'],
      ['count', 'nat'],
      ['tags', 'list'],
      ['note', 'maybe'],
    ],
  )
  // 2 × 2 × 3 × (1 + 2) × (1 + 2) = 108
  assert.equal(cardinality(item), 108)
  assert.equal(valuesOf(item).length, 108)
  assert.equal(new Set(valuesOf(item).map((value) => JSON.stringify(toPlain(value)))).size, 108)
  assert.equal(cardinality(typeIR('Item', types)), Infinity)
  assert.throws(() => valuesOf(typeIR('Item', types)), /finite domain/)
  assert.throws(() => typeIR('Tree', types), /recursive type Tree/)
  assert.throws(() => typeIR('Missing', types), /not Bool, Nat, List, Maybe or a data type/)

  const toggle = parseBendTypes(TOGGLE)
  assert.equal(cardinality(typeIR('Toggle', toggle)), 8)
  assert.equal(cardinality(typeIR('Cmd', toggle)), 6)
  assert.deepEqual(defSignature(TOGGLE, 'Toggle.R_blocked_keeps'), {
    params: [
      { name: 's', type: 'Toggle' },
      { name: 'c', type: 'Cmd' },
      { name: 't', type: 'Toggle' },
    ],
    returns: 'Bool',
  })
})

test('values keep the compiled Bend runtime shape: Nat is BigInt, lists are Con cells, a bad projection is refused', () => {
  const ir = typeIR('Item', parseBendTypes(SAMPLE_TYPES), { nat: 2, list: 1 })
  for (const value of valuesOf(ir)) assert.deepEqual(toRuntime(toPlain(value), ir), value)
  const sample = valuesOf(ir).find((value) => value.count === 2n && value.tags.$ === 'Con' && value.note.$ === 'Some')
  assert.equal(typeof sample.count, 'bigint')
  assert.deepEqual(sample.tags.tail, { $: 'Nil' })
  assert.equal(
    bendLiteral(toPlain(sample), ir),
    `M.Item{${sample.on ? 'True{}' : 'False{}'}, M.${sample.level.$}{}, 2n, [M.${sample.tags.head.$}{}], Some{${
      sample.note.value ? 'True{}' : 'False{}'
    }}}`,
  )

  const plain = toPlain(sample)
  assert.throws(() => toRuntime({ ...plain, extra: 1 }, ir), /only the fields of Item, not extra/)
  assert.throws(() => toRuntime({ ...plain, on: 'yes' }, ir), /value\.on: expected a boolean/)
  assert.throws(() => toRuntime({ ...plain, count: -1 }, ir), /value\.count: expected a non-negative integer/)
  assert.throws(() => toRuntime({ ...plain, $: 'Other' }, ir), /expected one of Item/)
})

test('fast-check arbitraries stay inside the declared domain, and every value of a small domain appears', () => {
  const ir = typeIR('Item', parseBendTypes(SAMPLE_TYPES), { nat: 2, list: 1 })
  const domain = new Set(valuesOf(ir).map((value) => JSON.stringify(toPlain(value))))
  const seen = new Set()
  fc.assert(
    fc.property(arbitraryOf(fc, ir), (value) => {
      const key = JSON.stringify(toPlain(value))
      seen.add(key)
      return domain.has(key) && typeof value.count === 'bigint'
    }),
    { numRuns: 3000, seed: 7 },
  )
  assert.ok(seen.size > 90, `sampling reached ${seen.size} of 108 values`)
  assert.throws(() => arbitraryOf(fc, typeIR('Item', parseBendTypes(SAMPLE_TYPES))), /set a Nat bound/)
})

/** 탐색 엔진만 시험하는 손 모델 — 오래된 응답 무시. 기대값의 출처가 아니다. */
function handModel() {
  const listItems = (list) => {
    const items = []
    for (let cursor = list; cursor?.$ === 'Con'; cursor = cursor.tail) items.push(cursor.head)
    return items
  }
  return {
    init: () => ({ $: 'S', latest: 0n, shown: 0n }),
    step(state, event) {
      if (event.$ === 'Issue') return { ...state, latest: state.latest + 1n }
      return event.id === state.latest ? { ...state, shown: event.id } : state
    },
    next(history) {
      const events = listItems(history)
      const issued = events.filter(({ $ }) => $ === 'Issue').length
      const answered = new Set(events.filter(({ $ }) => $ === 'Respond').map(({ id }) => id))
      const pending = []
      for (let id = issued; id >= 1; id -= 1)
        if (!answered.has(BigInt(id))) pending.push({ $: 'Respond', id: BigInt(id) })
      return [{ $: 'Issue' }, ...pending].reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' })
    },
    observe: (state) => state.shown,
  }
}

test('replay classification: an event the environment forbids is outside the space; otherwise the model judges', () => {
  const model = handModel()
  const outside = classifyTrace(model, [{ $: 'Respond', id: 1 }])
  assert.equal(outside.verdict, 'outside-space')
  assert.deepEqual(outside.allowed, [{ $: 'Issue' }])
  assert.match(outside.route, /reopen the problem definition/)

  const late = [{ $: 'Issue' }, { $: 'Issue' }, { $: 'Respond', id: 2 }, { $: 'Respond', id: 1 }]
  const defect = classifyTrace(model, late, [0, 0, 0, 2, 1])
  assert.deepEqual(
    { verdict: defect.verdict, step: defect.step, expected: defect.expected, observed: defect.observed },
    { verdict: 'implementation-defect', step: 4, expected: 2, observed: 1 },
  )
  assert.equal(classifyTrace(model, late, [0, 0, 0, 2, 2]).verdict, 'model-agrees')
  assert.deepEqual(classifyTrace(model, late).expected, [0, 0, 0, 2, 2])
})

test('projection residue names the implementation fields that vary while the observation stays the same', () => {
  const model = handModel()
  const space = enumerateSpace(model, { bound: 3 })
  const adapter = {
    init: () => ({ latest: 0, shown: 0, revision: 0 }),
    step: (state, event) => {
      if (event.$ === 'Issue') return { ...state, latest: state.latest + 1, revision: state.revision + 1 }
      return event.id === state.latest ? { ...state, shown: event.id, revision: state.revision + 1 } : state
    },
    observe: (state) => state.shown,
    snapshot: (state) => state,
  }
  const residue = projectionResidue(space, adapter)
  assert.deepEqual(
    residue.fields.map(({ field }) => field),
    ['latest', 'revision'],
  )
  const { snapshot: _snapshot, ...withoutSnapshot } = adapter
  assert.equal(projectionResidue(space, withoutSnapshot), null)
})

test('card lint: declared Relations need State, Command, a model def and a law that states them', async () => {
  const card = await readFile(join(FIXTURES, 'stale-search', 'oracle.md'), 'utf8')
  const lines = card.replace('- Conformance row: O4', '- Conformance row: O4\n- Relations: R_missing').split('\n')
  const read = (path) => readFile(join(FIXTURES, 'stale-search', path), 'utf8').catch(() => null)
  const context = {
    policies: new Set(['P1', 'P2', 'P3']),
    rows: new Set(['O1', 'O2', 'O3', 'O4']),
    invariants: new Set(),
    sources: new Map([
      ['S1', { repoPath: 'README.md', authoritative: true }],
      ['S2', { repoPath: 'MODEL.bend', authoritative: true }],
      ['S3', { repoPath: 'LAWS.bend', authoritative: true }],
    ]),
    readSource: read,
  }
  const issues = await formalModelIssues(parseFormalModel(lines), context)
  assert.ok(issues.includes('formal-relation-types: Relations need State: the Bend type of the state'))
  assert.ok(issues.includes('formal-relation-def: Search.R_missing is not a def of the locked model'))
  const withStep = parseFormalModel(
    card
      .replace('- Conformance row: O4', '- Conformance row: O4\n- State: Search\n- Command: Msg\n- Relations: observe')
      .split('\n'),
  )
  assert.ok(
    (await formalModelIssues(withStep, context)).includes(
      'formal-relation-unproven: no law in LAWS.bend states observe — the generated test would judge with an unproven relation',
    ),
  )
})

// ── 실제 Bend 2.0.34 통합 (설치본이 있을 때만) ────────────────────────────────────────

test('[bend] emit-trace: the generated test passes for the reducer, fails a mutant at its step, and goes stale with the model', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await workspace(t)
  const dir = join(root, 'stale-search')
  const emitted = await emitTrace({
    model: join(dir, 'MODEL.bend'),
    prefix: 'Search',
    bound: 4,
    adapter: join(dir, 'search.adapter.mjs'),
    out: join(dir, 'generated'),
    row: 'O4',
    runs: 100,
    maxLength: 8,
    bin,
    regenerate: 'test',
  })
  assert.deepEqual(emitted.verification.exhaustive, { cases: 10, bound: 4, complete: true })
  assert.equal(emitted.verification.sampled.runs, 100)
  assert.equal(emitted.verification.beyondBoundReachable, true)
  // the request ids grow without bound, so the transition cover stops at the bound: every configuration the bound
  // reaches takes every event once, one step past the bound, with the expectation the model computed
  const { cover } = emitted.verification
  assert.equal(cover.status, 'capped')
  assert.equal(cover.coveredDepth, 4)
  assert.ok(cover.cases > 0)
  const testFile = join(dir, 'generated', 'search.oracle.test.mjs')
  const text = await readFile(testFile, 'utf8')
  assert.match(text, /^\/\/ AUTO-GENERATED .* DO NOT EDIT\./)
  assert.match(text, /Passing it is not a proof about the implementation/)
  assert.match(text, /"id":"C[a-f0-9]{12}"/)
  const clean = runGenerated(testFile)
  assert.equal(clean.status, 0, clean.output)
  // 10 traces + the cover cases + sources unchanged + adapter audit + the sampled property
  assert.deepEqual([clean.tests, clean.fail], [13 + cover.cases, 0])
  // the sampled test reports what fast-check actually executed, including runs past the bound
  const stats = JSON.parse(clean.output.match(/\{"fastCheck":.*\}/)[0]).fastCheck
  assert.equal(stats.requested, 100)
  assert.ok(stats.executed >= 100)
  assert.ok(stats.beyondBound > 0 && stats.longest > 4)

  await writeFile(
    join(dir, 'mutant.adapter.mjs'),
    "import { adapterFor } from './search.adapter.mjs'\nimport { initialSearch } from './search-reducer.mts'\nimport { reduceWithoutStaleCheck } from './search-reducer.mutants.mts'\nexport const { init, step, observe } = adapterFor(reduceWithoutStaleCheck, initialSearch)\n",
  )
  await emitTrace({
    model: join(dir, 'MODEL.bend'),
    prefix: 'Search',
    bound: 4,
    adapter: join(dir, 'mutant.adapter.mjs'),
    out: join(dir, 'mutant'),
    row: 'O4',
    runs: 100,
    bin,
    regenerate: 'test',
  })
  const mutant = runGenerated(join(dir, 'mutant', 'search.oracle.test.mjs'))
  assert.equal(mutant.status, 1)
  assert.ok(mutant.fail >= 1)
  // the exhaustive part names the shortest failing trace; sampling fails the mutant on its own as well
  assert.match(mutant.output, /step 4 \(Respond\{id:1\}\) of Issue · Issue · Respond\{id:2\} · Respond\{id:1\}/)
  assert.match(mutant.output, /✖ \[O4\] sampled traces \(fast-check\)/)

  await writeFile(
    join(dir, 'MODEL.bend'),
    `${await readFile(join(dir, 'MODEL.bend'), 'utf8')}\n# edited after generation\n`,
  )
  const stale = runGenerated(testFile)
  assert.equal(stale.status, 1)
  assert.match(stale.output, /STALE_GENERATED_TESTS: \.\.\/MODEL\.bend changed since generation/)

  await assert.rejects(
    emitTrace({
      model: join(dir, 'MODEL.bend'),
      prefix: 'Search',
      bound: 4,
      adapter: join(dir, 'search.adapter.mjs'),
      out: join(dir, 'x'),
      row: 'O4',
      runs: 100,
      maxCases: 3,
      bin,
      regenerate: 'test',
    }),
    /SPACE_INCOMPLETE|the space stopped at 3 cases/,
  )
})

test('[bend] emit-state: proven relations judge the reducer on all 48 pairs; the && mutant fails exhaustively and sampled', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await workspace(t)
  const dir = join(root, 'toggle')
  const base = {
    model: join(dir, 'MODEL.bend'),
    prefix: 'Toggle',
    stateType: 'Toggle',
    commandType: 'Cmd',
    relations: ['R_blocked_keeps', 'R_free_applies'],
    row: 'O1',
    runs: 200,
    bin,
    regenerate: 'test',
  }
  const exhaustive = await emitState({
    ...base,
    adapter: join(dir, 'toggle.adapter.mjs'),
    out: join(dir, 'ok'),
    differential: true,
  })
  assert.deepEqual(
    {
      strategy: exhaustive.verification.strategy,
      domain: exhaustive.verification.domain,
      cases: exhaustive.verification.cases,
    },
    { strategy: 'exhaustive+sampled', domain: 48, cases: 48 },
  )
  const clean = runGenerated(join(dir, 'ok', 'toggle.oracle.test.mjs'))
  assert.equal(clean.status, 0, clean.output)
  // 48 pairs + sources unchanged + adapter audit + the sampled property — sampling runs even on a small domain
  assert.deepEqual([clean.tests, clean.fail], [51, 0])
  assert.equal(JSON.parse(clean.output.match(/\{"fastCheck":.*\}/)[0]).fastCheck.executed, 200)

  await writeFile(
    join(dir, 'mutant.adapter.mjs'),
    "import { mutants } from './toggle.adapter.mjs'\nexport const { concretize, step, project } = mutants.blockedOnlyWhenBoth\n",
  )
  await emitState({ ...base, adapter: join(dir, 'mutant.adapter.mjs'), out: join(dir, 'mutant') })
  const mutant = runGenerated(join(dir, 'mutant', 'toggle.oracle.test.mjs'))
  assert.equal(mutant.status, 1)
  // 막혀 있어야 하는데(disabled 또는 loading 하나만) Set이 checked를 바꾸는 네 쌍, 그리고 같은 결함을 찾은 표본
  assert.equal(mutant.fail, 5)
  assert.match(
    mutant.output,
    /R_blocked_keeps violated at Toggle\{checked:false,disabled:true,loading:false\} · Set\{next:true\} → Toggle\{checked:true,disabled:true,loading:false\}/,
  )

  const sampled = await emitState({
    ...base,
    adapter: join(dir, 'mutant.adapter.mjs'),
    out: join(dir, 'sampled'),
    threshold: 0,
    runs: 300,
  })
  assert.equal(sampled.verification.strategy, 'sampled')
  assert.equal(sampled.verification.sampled.runs, 300)
  const found = runGenerated(join(dir, 'sampled', 'toggle.oracle.test.mjs'))
  assert.equal(found.status, 1)
  assert.match(found.output, /seed: \d+, path: "[\d:]+"/)
  assert.match(found.output, /Counterexample: \[\{"\$":"Toggle".*\{"\$":"Set","next":true\}\]/)
  assert.match(found.output, /R_blocked_keeps violated/)

  await writeFile(
    join(dir, 'lossy.adapter.mjs'),
    "import { adapterFor } from './toggle.adapter.mjs'\nimport { reduceToggle } from './toggle.mts'\nconst base = adapterFor(reduceToggle)\nexport const step = base.step\nexport const project = base.project\nexport const concretize = (state) => ({ ...base.concretize(state), loading: false })\n",
  )
  await emitState({ ...base, adapter: join(dir, 'lossy.adapter.mjs'), out: join(dir, 'lossy') })
  const lossy = runGenerated(join(dir, 'lossy', 'toggle.oracle.test.mjs'))
  assert.equal(lossy.status, 1)
  assert.match(lossy.output, /adapter round trip project\(concretize\(s\)\) differs/)

  await assert.rejects(
    emitState({ ...base, relations: ['blocked'], adapter: join(dir, 'toggle.adapter.mjs'), out: join(dir, 'bad') }),
    /Toggle\.blocked must be def Toggle\.blocked\(s: Toggle, c: Cmd, t: Toggle\) -> Bool/,
  )
  // positive-count sampling is mandatory: omitting runs or passing 0 is refused before anything is written
  for (const runs of [undefined, 0]) {
    await assert.rejects(
      emitState({ ...base, runs, adapter: join(dir, 'toggle.adapter.mjs'), out: join(dir, 'unsampled') }),
      { code: 'SAMPLING_REQUIRED' },
    )
  }
})

test('[bend] replay: each verdict carries a kernel-checked claim, and only an in-space counterexample closes', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const model = join(FIXTURES, 'stale-search', 'MODEL.bend')
  const late = [{ $: 'Issue' }, { $: 'Issue' }, { $: 'Respond', id: 2 }, { $: 'Respond', id: 1 }]
  const defect = await replay({ model, prefix: 'Search', trace: late, observed: [0, 0, 0, 2, 1], bin })
  assert.equal(defect.verdict, 'implementation-defect')
  assert.equal(defect.closed, true)
  assert.equal(defect.certification.status, 'proven')
  assert.match(defect.certification.law, /== 2n : Nat\}$/)

  const outside = await replay({ model, prefix: 'Search', trace: [{ $: 'Respond', id: 1 }], bin })
  assert.equal(outside.verdict, 'outside-space')
  assert.equal(outside.closed, false)
  assert.equal(outside.certification.status, 'proven')
  assert.equal(outside.certification.law, '{M.Search.next([]) == [M.Issue{}] : List<M.Msg>}')

  // --out: 반례 기록(REPLAY.bend·REPLAY.json)을 남기고, 남긴 법칙은 그 자리에서 다시 검사된다
  const root = await mkdtemp(join(tmpdir(), 'oracle-replay-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const kept = await replay({ model, prefix: 'Search', trace: late, observed: [0, 0, 0, 2, 1], bin, out: root })
  const record = JSON.parse(await readFile(kept.artifacts.result, 'utf8'))
  assert.deepEqual(
    [record.verdict, record.trace.length, record.observed],
    ['implementation-defect', 4, [0, 0, 0, 2, 1]],
  )
  const recheck = spawnSync(bin, ['REPLAY.bend', '--verdict'], { cwd: root, encoding: 'utf8' })
  assert.equal(recheck.status, 0, recheck.stdout + recheck.stderr)

  const { adapterFor } = await import(join(FIXTURES, 'stale-search', 'search.adapter.mjs'))
  const { initialSearch } = await import(join(FIXTURES, 'stale-search', 'search-reducer.mts'))
  const { reduceShowingPrevious } = await import(join(FIXTURES, 'stale-search', 'search-reducer.mutants.mts'))
  const viaAdapter = await replay({
    model,
    prefix: 'Search',
    trace: late,
    adapter: adapterFor(reduceShowingPrevious, initialSearch),
    bin,
  })
  assert.equal(viaAdapter.verdict, 'implementation-defect')
  assert.equal(viaAdapter.certification.status, 'proven')
})

// 선택지가 16개를 넘는 환경 — 예전 생성기는 fc.nat({ max: 15 }) % 선택지 수라서 17번째 이후 선택지를 영원히 뽑지 못했다.
const WIDE = `import Base

type Msg is Data:
  Pick{n: Nat}

type Wide is Data:
  Wide{last: Nat}

def Wide.init() -> Wide:
  Wide{0n}

def Wide.step(s: Wide, m: Msg) -> Wide:
  match m:
    case Pick{n}:
      Wide{n}

def Wide.observe(s: Wide) -> Nat:
  match s:
    case Wide{last}:
      last

def Wide.picks(+k: Nat) -> List<Msg>:
  match k:
    case 0n:
      Nil{}
    case 1n+p:
      Pick{1n+p} <> Wide.picks(p)

def Wide.next(+h: +List<Msg>) -> List<Msg>:
  Wide.picks(20n)
`
// 결함 있는 제품: 첫 사건 뒤의 Pick{1}을 무시한다. bound 1의 전수 공간은 첫 사건만 보므로 이 결함은 표본만 찾는다.
const WIDE_PRODUCT = `export function reduce(state, n, index) {
  return index > 0 && n === 1 ? state : n
}
`
const WIDE_ADAPTER = `import { reduce } from './wide-product.mjs'
export const init = () => ({ last: 0, index: 0 })
export function step(state, event) {
  if (event.$ !== 'Pick' || !Number.isInteger(event.n)) throw new Error('unmapped event ' + JSON.stringify(event))
  return { last: reduce(state.last, event.n, state.index), index: state.index + 1 }
}
export const observe = (state) => state.last
`

test('[bend] emit-trace samples every environment choice: a defect behind the 20th branch past the bound is found', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await workspace(t)
  const dir = join(root, 'wide')
  await mkdir(dir)
  await writeFile(join(dir, 'MODEL.bend'), WIDE)
  await writeFile(join(dir, 'wide-product.mjs'), WIDE_PRODUCT)
  await writeFile(join(dir, 'wide.adapter.mjs'), WIDE_ADAPTER)
  const emitted = await emitTrace({
    model: join(dir, 'MODEL.bend'),
    prefix: 'Wide',
    bound: 1,
    adapter: join(dir, 'wide.adapter.mjs'),
    out: join(dir, 'generated'),
    row: 'O1',
    runs: 300,
    maxLength: 3,
    bin,
    regenerate: 'test',
  })
  assert.deepEqual(emitted.verification.exhaustive, { cases: 20, bound: 1, complete: true })
  // 21 configurations (last = 0..20) × 20 picks: the cover takes Pick{n:1} once from every configuration, so the
  // defect past the bound is now found deterministically — 19 cover cases (Pick{n:1} twice is no defect)
  assert.deepEqual(emitted.verification.cover, { status: 'closed', configurations: 21, pairs: 420, cases: 400 })
  const run = runGenerated(join(dir, 'generated', 'wide.oracle.test.mjs'))
  assert.equal(run.status, 1, run.output)
  assert.match(run.output, /✖ \[O1\] \[C[a-f0-9]{12}\] Pick\{n:2\} · Pick\{n:1\}/)
  // and the sampled property still finds it on its own: it draws every environment choice, not a small index range
  assert.match(run.output, /✖ \[O1\] sampled traces \(fast-check\)/)
  assert.equal(run.fail, 19 + 1, run.output)
})

test('the adapter audit sees through comments, query strings, computed imports, require and file reads', () => {
  const audit = (text) => auditAdapterSource(text).map((finding) => finding.code)
  assert.deepEqual(audit('// from "./product.mjs"\nexport const init = () => 0\n'), ['adapter-no-product'])
  assert.deepEqual(audit('import p from "./p.mjs"\nconst m = await import("./MODEL" + ".model.mjs")\n'), [
    'adapter-opaque-load',
  ])
  assert.deepEqual(audit('import m from "./MODEL.model.mjs?v=1"\nimport p from "./p.mjs"\n'), [
    'adapter-imports-oracle',
  ])
  assert.deepEqual(
    audit(
      'import { createRequire } from "node:module"\nimport p from "./p.mjs"\ncreateRequire(import.meta.url)("./m.cjs")\n',
    ),
    ['adapter-opaque-load'],
  )
  assert.deepEqual(
    audit('import _ from "lodash"\nimport { readFileSync } from "node:fs"\nreadFileSync("MODEL.bend")\n'),
    ['adapter-opaque-load'],
  )
  assert.deepEqual(audit('import p from "./p.mjs"\nimport x from "../scripts/oracle-package.mjs"\n'), [
    'adapter-imports-oracle',
  ])
})

test('[bend] emit-trace refuses to generate without positive-count sampling or with an adapter that does not observe the product', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await workspace(t)
  const dir = join(root, 'stale-search')
  const base = { model: join(dir, 'MODEL.bend'), prefix: 'Search', bound: 4, row: 'O4', bin, regenerate: 'test' }
  for (const runs of [undefined, 0, -1, 1.5]) {
    await assert.rejects(emitTrace({ ...base, runs, adapter: join(dir, 'search.adapter.mjs'), out: join(dir, 'x') }), {
      code: 'SAMPLING_REQUIRED',
    })
  }
  // an adapter that reads the compiled model can return the expected observation instead of the product's
  await writeFile(
    join(dir, 'echo.adapter.mjs'),
    "import model from './generated/search.model.mjs'\nexport const init = () => model['Search.init']()\nexport const step = (s, e) => model['Search.step'](s, e)\nexport const observe = (s) => model['Search.observe'](s)\n",
  )
  await assert.rejects(
    emitTrace({ ...base, runs: 10, adapter: join(dir, 'echo.adapter.mjs'), out: join(dir, 'echo') }),
    (error) => error.code === 'ADAPTER_SUSPECT' && /adapter-imports-oracle/.test(error.message),
  )
  // an adapter that imports nothing treats every event as a no-op on its own state — it observes no product
  await writeFile(
    join(dir, 'noop.adapter.mjs'),
    'export const init = () => 0\nexport const step = (s) => s\nexport const observe = () => 0\n',
  )
  await assert.rejects(
    emitTrace({ ...base, runs: 10, adapter: join(dir, 'noop.adapter.mjs'), out: join(dir, 'noop') }),
    (error) => error.code === 'ADAPTER_SUSPECT' && /adapter-no-product/.test(error.message),
  )
  // the generated test re-audits the adapter, so a later edit that makes it echo the model fails the run
  await emitTrace({ ...base, runs: 10, adapter: join(dir, 'search.adapter.mjs'), out: join(dir, 'generated') })
  await writeFile(
    join(dir, 'search.adapter.mjs'),
    `${await readFile(join(dir, 'search.adapter.mjs'), 'utf8')}\nimport './generated/search.model.mjs'\n`,
  )
  const edited = runGenerated(join(dir, 'generated', 'search.oracle.test.mjs'))
  assert.equal(edited.status, 1)
  assert.match(edited.output, /ADAPTER_SUSPECT: .*adapter-imports-oracle/)
})

// 비동기 제품: 상태는 macrotask 뒤에 바뀐다. init은 이전 case가 dispose되지 않았으면 던진다 — GREEN이면 모든 case와
// 표본 사이에서 dispose가 돌았다는 뜻이다.
const asyncSearchAdapter = (reducer, { hangOn = null } = {}) => {
  const reduce = reducer === 'reduceSearch' ? reducer : `mutants.${reducer}`
  return [
    "import { adapterFor } from './search.adapter.mjs'",
    "import { initialSearch, reduceSearch } from './search-reducer.mts'",
    "import * as mutants from './search-reducer.mutants.mts'",
    `const sync = adapterFor(${reduce}, initialSearch)`,
    'const later = (compute) => new Promise((settle) => setTimeout(() => settle(compute()), 1))',
    'let live = 0',
    'export async function init() {',
    "  if (live !== 0) throw new Error('previous case leaked ' + live + ' mounted state')",
    '  live += 1',
    '  return later(() => ({ current: sync.init() }))',
    '}',
    'export async function step(box, event) {',
    ...(hangOn ? [`  if (event.$ === ${JSON.stringify(hangOn)}) return new Promise(() => {})`] : []),
    '  box.current = await later(() => sync.step(box.current, event))',
    '  return box',
    '}',
    'export const observe = async (box) => sync.observe(box.current)',
    'export function dispose() {',
    '  live -= 1',
    '}',
    '',
  ].join('\n')
}

test('[bend] async adapter: the generated test awaits it, disposes every case and sample, and still kills the mutant', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await workspace(t)
  const dir = join(root, 'stale-search')
  const base = {
    model: join(dir, 'MODEL.bend'),
    prefix: 'Search',
    bound: 4,
    row: 'O4',
    runs: 50,
    maxLength: 8,
    bin,
    regenerate: 'test',
  }
  await writeFile(join(dir, 'async.adapter.mjs'), asyncSearchAdapter('reduceSearch'))
  const emitted = await emitTrace({ ...base, adapter: join(dir, 'async.adapter.mjs'), out: join(dir, 'async') })
  const clean = runGenerated(join(dir, 'async', 'search.oracle.test.mjs'))
  assert.equal(clean.status, 0, clean.output)
  // 10 exhaustive traces + the transition cover + sources unchanged + adapter audit + sampled property
  assert.deepEqual([clean.tests, clean.fail], [13 + emitted.verification.cover.cases, 0])
  assert.equal(JSON.parse(clean.output.match(/\{"fastCheck":.*\}/)[0]).fastCheck.executed, 50)

  await writeFile(join(dir, 'async-mutant.adapter.mjs'), asyncSearchAdapter('reduceWithoutStaleCheck'))
  await emitTrace({ ...base, adapter: join(dir, 'async-mutant.adapter.mjs'), out: join(dir, 'async-mutant') })
  const mutant = runGenerated(join(dir, 'async-mutant', 'search.oracle.test.mjs'))
  assert.equal(mutant.status, 1)
  assert.match(mutant.output, /step 4 \(Respond\{id:1\}\) of Issue · Issue · Respond\{id:2\} · Respond\{id:1\}/)
  assert.match(mutant.output, /✖ \[O4\] sampled traces \(fast-check\)/)
  assert.doesNotMatch(mutant.output, /previous case leaked/)

  // a step that never settles fails as ADAPTER_TIMEOUT at that step instead of hanging the suite
  await writeFile(join(dir, 'hang.adapter.mjs'), asyncSearchAdapter('reduceSearch', { hangOn: 'Respond' }))
  const hanging = await emitTrace({
    ...base,
    runs: 1,
    caseTimeout: 50,
    adapter: join(dir, 'hang.adapter.mjs'),
    out: join(dir, 'hang'),
  })
  const hung = runGenerated(join(dir, 'hang', 'search.oracle.test.mjs'))
  assert.equal(hung.status, 1)
  // the Respond-free cases pass — one exhaustive trace and the all-Issue cover case — and every other case fails at
  // its first Respond step
  const cover = hanging.verification.cover.cases
  assert.deepEqual([hung.tests, hung.fail], [13 + cover, 10 + cover - 1])
  assert.match(
    hung.output,
    /ADAPTER_TIMEOUT: step 4 \(Respond\{id:1\}\) of Issue · Issue · Issue · Respond\{id:1\} did not settle within 50ms/,
  )
  assert.doesNotMatch(hung.output, /previous case leaked/)
})

test('[bend] async adapter: emit-state awaits concretize, step, project and dispose', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await workspace(t)
  const dir = join(root, 'toggle')
  await writeFile(
    join(dir, 'async.adapter.mjs'),
    [
      "import { concretize as toProduct, step as apply, project as read } from './toggle.adapter.mjs'",
      "import './toggle.mts'",
      'const later = (compute) => new Promise((settle) => setTimeout(() => settle(compute()), 1))',
      'let live = 0',
      'export async function concretize(state) {',
      "  if (live !== 0) throw new Error('previous pair leaked')",
      '  live += 1',
      '  return later(() => toProduct(state))',
      '}',
      'export const step = (state, command) => later(() => apply(state, command))',
      'export const project = async (state) => read(state)',
      'export function dispose() {',
      '  live -= 1',
      '}',
      '',
    ].join('\n'),
  )
  await emitState({
    model: join(dir, 'MODEL.bend'),
    prefix: 'Toggle',
    stateType: 'Toggle',
    commandType: 'Cmd',
    relations: ['R_blocked_keeps', 'R_free_applies'],
    adapter: join(dir, 'async.adapter.mjs'),
    out: join(dir, 'async'),
    row: 'O3',
    runs: 30,
    bin,
    regenerate: 'test',
  })
  const run = runGenerated(join(dir, 'async', 'toggle.oracle.test.mjs'))
  assert.equal(run.status, 0, run.output)
  assert.deepEqual([run.tests, run.fail], [51, 0])
  assert.equal(JSON.parse(run.output.match(/\{"fastCheck":.*\}/)[0]).fastCheck.executed, 30)
})

test('[bend] replay accepts an async adapter and disposes it', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const { adapterFor } = await import(join(FIXTURES, 'stale-search', 'search.adapter.mjs'))
  const { initialSearch } = await import(join(FIXTURES, 'stale-search', 'search-reducer.mts'))
  const { reduceShowingPrevious } = await import(join(FIXTURES, 'stale-search', 'search-reducer.mutants.mts'))
  const sync = adapterFor(reduceShowingPrevious, initialSearch)
  let disposed = 0
  const result = await replay({
    model: join(FIXTURES, 'stale-search', 'MODEL.bend'),
    prefix: 'Search',
    trace: [{ $: 'Issue' }, { $: 'Issue' }, { $: 'Respond', id: 2 }, { $: 'Respond', id: 1 }],
    adapter: {
      init: async () => sync.init(),
      step: async (state, event) => sync.step(state, event),
      observe: async (state) => sync.observe(state),
      dispose: () => {
        disposed += 1
      },
    },
    bin,
  })
  assert.equal(result.verdict, 'implementation-defect')
  assert.equal(result.certification.status, 'proven')
  assert.equal(disposed, 1)
})

test('a React adapter must export dispose; React and testing-library imports are not the product', () => {
  const audit = (text) => auditAdapterSource(text).map((finding) => finding.code)
  const product = 'import { FeedGrid } from "../ui/FeedGrid"\n'
  const render = 'import { render } from "@testing-library/react"\nimport { StrictMode } from "react"\n'
  assert.deepEqual(audit(`${render}${product}export function init() {}\n`), ['adapter-dispose-missing'])
  assert.deepEqual(audit(`${render}${product}export function dispose(s) { s.ui.unmount() }\n`), [])
  assert.deepEqual(audit(`${render}${product}const dispose = () => {}\nexport { init, dispose }\n`), [])
  assert.deepEqual(audit(`${render}import { act } from "react-dom/test-utils"\nexport const dispose = () => {}\n`), [
    'adapter-no-product',
  ])
  // a pure reducer adapter keeps dispose optional
  assert.deepEqual(audit(product), [])
})

test('[bend] JSX adapters and the environment pragma are vitest-only; the pragma leads the generated file', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await workspace(t)
  const dir = join(root, 'stale-search')
  const base = {
    model: join(dir, 'MODEL.bend'),
    prefix: 'Search',
    bound: 2,
    row: 'O4',
    runs: 5,
    bin,
    regenerate: 'test',
  }
  await writeFile(join(dir, 'feed.adapter.tsx'), await readFile(join(dir, 'search.adapter.mjs'), 'utf8'))
  await assert.rejects(emitTrace({ ...base, adapter: join(dir, 'feed.adapter.tsx'), out: join(dir, 'x') }), {
    code: 'USAGE',
    message: /feed\.adapter\.tsx is JSX — pass --runner vitest/,
  })
  await assert.rejects(
    emitTrace({ ...base, environment: 'jsdom', adapter: join(dir, 'search.adapter.mjs'), out: join(dir, 'x') }),
    { code: 'USAGE', message: /environment needs --runner vitest/ },
  )
  await assert.rejects(
    emitTrace({ ...base, caseTimeout: 0, adapter: join(dir, 'search.adapter.mjs'), out: join(dir, 'x') }),
    { code: 'USAGE', message: /case-timeout must be a positive integer/ },
  )
  const emitted = await emitTrace({
    ...base,
    runner: 'vitest',
    environment: 'jsdom',
    adapter: join(dir, 'feed.adapter.tsx'),
    out: join(dir, 'vitest'),
  })
  const text = await readFile(emitted.files[1], 'utf8')
  assert.match(text, /^\/\/ @vitest-environment jsdom\n\/\/ AUTO-GENERATED/)
  assert.match(text, /import \{ test \} from 'vitest'/)
  assert.match(text, /import \* as adapter from "\.\.\/feed\.adapter\.tsx"/)
})

// ── emit-world: one product test per possible coordinate setting, for a card without a behavior model ──────────

test('[bend] emit-world: every possible setting runs once with the outcomes the world allows; a wrong store fails its row; a changed world is stale', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await workspace(t)
  const dir = join(root, 'doc-save')
  const emitted = await emitWorld({
    card: join(dir, 'oracle.md'),
    cwd: dir,
    adapter: join(dir, 'doc-save.adapter.mjs'),
    out: join(dir, 'generated'),
    row: 'O1',
    bin,
    regenerate: 'test',
  })
  // start × held = 4 settings; the assumption that permission is never regained in flight excludes one
  assert.deepEqual(
    { strategy: emitted.verification.strategy, settings: emitted.verification.settings, excluded: emitted.verification.excluded },
    { strategy: 'exhaustive', settings: 3, excluded: 1 },
  )
  const testFile = join(dir, 'generated', 'save.world.test.mjs')
  const text = await readFile(testFile, 'utf8')
  assert.match(text, /^\/\/ AUTO-GENERATED .* DO NOT EDIT\./)
  assert.doesNotMatch(text, /from 'fast-check'/)
  const clean = runGenerated(testFile)
  assert.equal(clean.status, 0, clean.output)
  // 3 settings + sources unchanged + adapter audit
  assert.deepEqual([clean.tests, clean.fail], [5, 0])

  // a store that still commits after the permission was revoked in flight violates O2 at exactly that setting
  await writeFile(
    join(dir, 'submit-check.adapter.mjs'),
    "import { adapterFor } from './doc-save.adapter.mjs'\nimport { saveCheckingAtSubmit } from './doc-store.mutants.mts'\nexport const { run } = adapterFor({ saveWith: saveCheckingAtSubmit })\n",
  )
  await emitWorld({
    card: join(dir, 'oracle.md'),
    cwd: dir,
    adapter: join(dir, 'submit-check.adapter.mjs'),
    out: join(dir, 'mutant'),
    row: 'O1',
    bin,
    regenerate: 'test',
  })
  const mutant = runGenerated(join(dir, 'mutant', 'save.world.test.mjs'))
  assert.equal(mutant.status, 1)
  assert.equal(mutant.fail, 1, mutant.output)
  assert.match(mutant.output, /violates O2 at start !held/)

  await writeFile(join(dir, 'World.bend'), `${await readFile(join(dir, 'World.bend'), 'utf8')}\n# edited after generation\n`)
  const stale = runGenerated(testFile)
  assert.equal(stale.status, 1)
  assert.match(stale.output, /STALE_GENERATED_TESTS: \.\.\/World\.bend changed since generation/)
})
