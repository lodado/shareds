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
import { emitState, emitTrace, replay } from './oracle-projection.mjs'
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
  for (const name of ['stale-search', 'toggle']) await cp(join(FIXTURES, name), join(root, name), { recursive: true })
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
  const testFile = join(dir, 'generated', 'search.oracle.test.mjs')
  const text = await readFile(testFile, 'utf8')
  assert.match(text, /^\/\/ AUTO-GENERATED .* DO NOT EDIT\./)
  assert.match(text, /Passing it is not a proof about the implementation/)
  const clean = runGenerated(testFile)
  assert.equal(clean.status, 0, clean.output)
  assert.deepEqual([clean.tests, clean.fail], [12, 0])

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
    bin,
    regenerate: 'test',
  })
  const mutant = runGenerated(join(dir, 'mutant', 'search.oracle.test.mjs'))
  assert.equal(mutant.status, 1)
  assert.ok(mutant.fail >= 1)
  assert.match(mutant.output, /step 4 \(Respond\{id:1\}\) of Issue · Issue · Respond\{id:2\} · Respond\{id:1\}/)
  assert.doesNotMatch(mutant.output, /fast-check/)

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
    { strategy: 'exhaustive', domain: 48, cases: 48 },
  )
  const clean = runGenerated(join(dir, 'ok', 'toggle.oracle.test.mjs'))
  assert.equal(clean.status, 0, clean.output)
  assert.deepEqual([clean.tests, clean.fail], [49, 0])

  await writeFile(
    join(dir, 'mutant.adapter.mjs'),
    "import { mutants } from './toggle.adapter.mjs'\nexport const { concretize, step, project } = mutants.blockedOnlyWhenBoth\n",
  )
  await emitState({ ...base, adapter: join(dir, 'mutant.adapter.mjs'), out: join(dir, 'mutant') })
  const mutant = runGenerated(join(dir, 'mutant', 'toggle.oracle.test.mjs'))
  assert.equal(mutant.status, 1)
  // 막혀 있어야 하는데(disabled 또는 loading 하나만) Set이 checked를 바꾸는 네 쌍
  assert.equal(mutant.fail, 4)
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
  await assert.rejects(
    emitState({ ...base, adapter: join(dir, 'toggle.adapter.mjs'), out: join(dir, 'big'), threshold: 10 }),
    /48 state·command pairs, above the threshold 10 — pass --runs/,
  )
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
