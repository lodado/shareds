import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BEND_VERSION, ensureBend } from './ensure-bend.mjs'
import { conformWorld } from './oracle-adequacy.mjs'
import {
  aiInput,
  applyDispositions,
  applyFault,
  candidateId,
  closure,
  crossCheckIssues,
  crossCheckSpace,
  decisionMisfit,
  declaredStatus,
  killedChecks,
  lifecycle,
  mappingInput,
  OPERATORS,
  perturbations,
  productCompleteReasons,
  requirementClosure,
  sourceSentences,
  spaceCrossCheck,
  stepPatterns,
} from './oracle-discovery.mjs'
import { parseCaseSpace } from './oracle-frames.mjs'
import { enumerateSpace } from './oracle-model.mjs'
import { loadPackage, OPERATOR_IDS, packageInputs, packageIssues } from './oracle-package.mjs'

const FIXTURE = fileURLToPath(new URL('../../test-fixtures/stale-search/', import.meta.url))
const SCRIPTS = fileURLToPath(new URL('.', import.meta.url))
const PKG = JSON.parse(await readFile(join(FIXTURE, 'oracle.package.json'), 'utf8'))
const clone = (value) => structuredClone(value)
const { NODE_TEST_CONTEXT: _parent, ...CHILD_ENV } = process.env

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

async function fixtureCopy(t) {
  const root = await mkdtemp(join(tmpdir(), 'oracle-discovery-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await cp(FIXTURE, root, { recursive: true })
  return root
}

async function writePackage(root, name, pkg) {
  await writeFile(join(root, name), `${JSON.stringify(pkg, null, 2)}\n`)
  return name
}

const codes = (issues) => issues.map((issue) => issue.split(':')[0])

// ── 카탈로그·결정성 ────────────────────────────────────────────────────────────────────────────────────────────────

test('the operator catalog is one list: the package schema and the discovery tool name the same operators', () => {
  assert.deepEqual(
    OPERATORS.map((operator) => operator.id),
    OPERATOR_IDS,
  )
  for (const operator of OPERATORS) assert.ok(['deterministic', 'declared', 'ai'].includes(operator.layer), operator.id)
})

test('candidate IDs come from the operator and the content only, so the same phenomenon keeps its ID across revisions', () => {
  const key = { check: 'sufficiency', target: 'G1', fields: ['oldShown'] }
  assert.equal(candidateId('observation-sufficiency', key), candidateId('observation-sufficiency', clone(key)))
  assert.notEqual(candidateId('observation-sufficiency', key), candidateId('goal-implication', key))
  assert.match(candidateId('mutation', { fault: 'F1' }), /^C-[a-f0-9]{10}$/)
})

// ── 교란 연산자 ────────────────────────────────────────────────────────────────────────────────────────────────────

/** 손 모델 — 한 요청과 그 응답만 허용하는 환경. 교란이 무엇을 만드는지 보려는 test double이다. */
const oneShot = {
  init: () => ({ $: 'S', sent: false, got: false }),
  step: (state, event) => (event.$ === 'Send' ? { ...state, sent: true } : { ...state, got: true }),
  observe: (state) => state.got,
  next: (history) => {
    const events = []
    for (let cursor = history; cursor?.$ === 'Con'; cursor = cursor.tail) events.push(cursor.head)
    if (events.length === 0) return { $: 'Con', head: { $: 'Send' }, tail: { $: 'Nil' } }
    if (events.length === 1) return { $: 'Con', head: { $: 'Reply', id: 1 }, tail: { $: 'Nil' } }
    return { $: 'Nil' }
  },
}

test('perturbations only leave the declared environment: boundary values, duplicates, swaps and early events', () => {
  const space = enumerateSpace(oneShot, { bound: 2 })
  const { list, capped } = perturbations(oneShot, space)
  assert.equal(capped, false)
  const labels = list.map((entry) => `${entry.kind} ${entry.key} @${entry.leaveAt} ${JSON.stringify(entry.trace)}`)
  // Reply before Send, Reply{id:0}, Reply{id:2}, duplicated Send/Reply and the swapped pair are all outside the space
  assert.ok(labels.some((text) => text.startsWith('boundary Reply.id=zero @1')), labels.join('\n'))
  assert.ok(labels.some((text) => text.startsWith('boundary Reply.id=past-max @1')), labels.join('\n'))
  assert.ok(labels.some((text) => text.startsWith('duplicate duplicate:Send @1')), labels.join('\n'))
  assert.ok(labels.some((text) => text.startsWith('swap swap:Reply @0')), labels.join('\n'))
  // nothing inside the space is kept — the conformance run already covers those traces
  assert.ok(!labels.some((text) => text.endsWith('[{"$":"Send"},{"$":"Reply","id":1}]')))
})

test('observation patterns ignore magnitudes and keep the kind of change per event', () => {
  const events = [{ $: 'Issue' }, { $: 'Respond', id: 1 }, { $: 'Issue' }, { $: 'Respond', id: 1 }, { $: 'Respond', id: 2 }]
  assert.deepEqual(stepPatterns(events, [0, 1, 1, 1, 2], 0), [
    'Issue:none → Respond:from-initial',
    'Respond:from-initial → Issue:none',
    'Issue:none → Respond:none',
    'Respond:none → Respond:replace',
  ])
})

// ── 수명주기 ───────────────────────────────────────────────────────────────────────────────────────────────────────

test('the candidate lifecycle is computed from evidence, never stored: produced, decided, promoted, absorbed, locked', () => {
  const derived = { axes: [{ id: 'world.Race.oldShown' }] }
  const found = (id, reproducible = true) => ({ id, operator: 'x', class: 'y', summary: 's', reproducible, evidence: {} })
  const pkg = {
    discoveryDecisions: [
      { candidate: 'C-000000000a', decision: 'out-of-scope', source: 'S1', reason: 'r' },
      { candidate: 'C-000000000b', decision: 'promoted', axis: 'world.Race.oldShown', source: 'S1', reason: 'r' },
      { candidate: 'C-000000000c', decision: 'promoted', axis: 'world.Race.oldShown', source: 'S1', reason: 'r' },
      { candidate: 'C-000000000d', decision: 'promoted', axis: 'world.Race.gone', source: 'S1', reason: 'r' },
      { candidate: 'C-0000000010', decision: 'promoted', axis: 'world.Race.gone', source: 'S1', reason: 'r' },
      { candidate: 'C-0000000011', decision: 'promoted', axis: 'world.Race.oldShown', source: 'S1', reason: 'r' },
    ],
  }
  const stages = (records) => Object.fromEntries(records.map((entry) => [entry.id, [entry.stage, entry.open]]))
  const carried = { ...found('C-0000000011', false), evidence: { stale: true } }
  const current = [
    found('C-000000000a'),
    found('C-000000000c'),
    found('C-000000000e', false),
    found('C-000000000f'),
    found('C-0000000010'),
    carried,
  ]
  assert.deepEqual(stages(lifecycle(current, pkg, derived)), {
    'C-000000000a': ['DOMAIN_VALIDATED', false],
    // promoted and defined, but the operator still finds it: the checks do not see the new axis yet
    'C-000000000c': ['ORACLE_DEFINED', true],
    'C-000000000b': ['TEST_IMPLEMENTED', false],
    // promoted to something the package does not have: not defined in the oracle
    'C-000000000d': ['AXIS_CLASSIFIED', true],
    'C-0000000010': ['AXIS_CLASSIFIED', true],
    'C-000000000e': ['DISCOVERED', true],
    'C-000000000f': ['REPRODUCIBLE', true],
    // a stale run cannot run again, so it always carries its finding: absorbed once the target is in the package
    'C-0000000011': ['TEST_IMPLEMENTED', false],
  })
  assert.equal(
    lifecycle([], pkg, derived, { locked: true }).find((entry) => entry.id === 'C-000000000b').stage,
    'REGRESSION_LOCKED',
  )
})

// ── L1 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('L1: every requirement quotes the source verbatim and is carried by the oracle; a paraphrase or an orphan fails', async (t) => {
  const root = await fixtureCopy(t)
  const loaded = await loadPackage('oracle.package.json', { root })
  const clean = await requirementClosure(loaded)
  assert.equal(clean.status, 'pass')
  assert.equal(clean.requirements.find((entry) => entry.id === 'R6').status, 'scoped-out')
  // the only source sentence no requirement quotes is the list's introduction — a candidate the package decides
  assert.deepEqual(clean.unquoted, [{ source: 'S1', sentence: 'The source text the card cites as S1:' }])

  // dropping a requirement leaves its sentence unquoted instead of passing silently
  const dropped = clone(PKG)
  dropped.requirements = dropped.requirements.filter((entry) => entry.id !== 'R3')
  for (const list of [dropped.goals, dropped.policies])
    for (const entry of list) entry.requirements = (entry.requirements ?? []).filter((id) => id !== 'R3')
  await writePackage(root, 'dropped.json', dropped)
  const gap = await requirementClosure(await loadPackage('dropped.json', { root }))
  assert.ok(gap.unquoted.some((entry) => entry.sentence === 'A response to an older request does not change what the list shows.'))

  // the Space discovery record holds the user's answers about the axes; its lines are decisions the Terms and the
  // families already carry, not requirement sentences to sweep — a requirement it states is still quoted from it as an R*
  await writeFile(join(root, 'space-discovery.md'), '# Space discovery\n\nThe arrival order matters. Entry is out of scope.\n')
  const confirmed = clone(PKG)
  confirmed.packageVersion = 2
  confirmed.sources.push({
    id: 'S7',
    kind: 'product-policy',
    jurisdiction: 'oracle space axes',
    standard: "the user's answers in Space discovery",
    location: 'repo:space-discovery.md',
    approval: 'approved',
  })
  confirmed.spaceDiscovery = 'S7'
  await writePackage(root, 'confirmed.json', confirmed)
  const withRecord = await requirementClosure(await loadPackage('confirmed.json', { root }))
  assert.equal(withRecord.status, 'pass')
  assert.deepEqual(withRecord.unquoted, clean.unquoted)

  // a location whose anchor does not resolve is not the whole file
  const moved = clone(PKG)
  moved.sources.find((entry) => entry.id === 'S1').location = 'repo:README.md#no-such-section'
  await writePackage(root, 'moved-source.json', moved)
  const missing = await requirementClosure(await loadPackage('moved-source.json', { root }))
  assert.equal(missing.status, 'fail')
  assert.ok(missing.requirements.every((entry) => entry.status === 'source-missing'))

  const paraphrased = clone(PKG)
  paraphrased.requirements[2].quote = 'An older response never changes the list.'
  const orphan = clone(PKG)
  orphan.goals = orphan.goals.map((goal) => ({ ...goal, requirements: (goal.requirements ?? []).filter((id) => id !== 'R3') }))
  orphan.policies = orphan.policies.map((policy) => ({ ...policy, requirements: (policy.requirements ?? []).filter((id) => id !== 'R3') }))
  for (const [name, pkg, id, field, expected] of [
    ['paraphrased.json', paraphrased, 'R3', 'verbatim', false],
    ['orphan.json', orphan, 'R3', 'status', 'unmapped'],
  ]) {
    await writePackage(root, name, pkg)
    const result = await requirementClosure(await loadPackage(name, { root }))
    assert.equal(result.status, 'fail', name)
    assert.equal(result.requirements.find((entry) => entry.id === id)[field], expected, name)
  }
})

test('the discovery registries are checked structurally: decisions need authority, fault edits must differ, modeled is only for declared operators', () => {
  const broken = clone(PKG)
  broken.discoveryDecisions.push({ candidate: 'C-1111111111', decision: 'out-of-scope', reason: 'no source given' })
  broken.faultModel.push({ id: 'F90', class: 'ordering', file: 'search-reducer.mts', find: 'x', replace: 'x' })
  broken.operators.mutation = 'modeled: event.Msg'
  broken.aiRuns = [{ operator: 'ai-explorer', file: 'x.json', agent: 'someone', inputDigest: 'nope' }]
  broken.assumptions = [{ id: 'A1', source: 'S1', owner: 'search backend', falsifier: 'a log line' }]
  const found = codes(packageIssues(broken))
  for (const code of ['package-decision', 'package-fault-edit', 'package-operator', 'package-ai-run', 'package-assumption-registry'])
    assert.ok(found.includes(code), `${code} in ${found.join(', ')}`)

  // "covered" names a row that exists, and a promotion names what it became
  const vague = clone(PKG)
  vague.discoveryDecisions = [
    { candidate: 'C-2222222222', decision: 'covered', by: 'O9', reason: 'some row' },
    { candidate: 'C-3333333333', decision: 'promoted', source: 'S1', reason: 'somewhere' },
  ]
  const messages = packageIssues(vague).filter((issue) => issue.startsWith('package-decision'))
  assert.ok(messages.some((issue) => issue.includes('C-2222222222: covered names the contract row')), messages.join('\n'))
  assert.ok(messages.some((issue) => issue.includes('C-3333333333: a promotion names')), messages.join('\n'))

  // authority is an approved source text — never the package itself, a Bend model file or an unapproved draft
  const selfCited = clone(PKG)
  selfCited.sources.push({ id: 'S7', kind: 'product-policy', jurisdiction: 'draft', standard: 'draft', location: 'repo:README.md#files', approval: 'pending' })
  selfCited.discoveryDecisions = [
    { candidate: 'C-4444444444', decision: 'out-of-scope', source: 'S5', reason: 'the package says so' },
    { candidate: 'C-5555555555', decision: 'accepted-risk', source: 'S4', reason: 'the world says so' },
    { candidate: 'C-6666666666', decision: 'out-of-scope', source: 'S7', reason: 'a draft says so' },
    { candidate: 'C-7777777777', decision: 'rejected', reason: 'no source' },
  ]
  selfCited.operators['dependency-failure'] = 'n/a: S5 the package says so'
  selfCited.metamorphic = 'n/a: S2 the model says so'
  const refused = packageIssues(selfCited)
  for (const id of ['C-4444444444', 'C-5555555555', 'C-6666666666', 'C-7777777777'])
    assert.ok(refused.some((issue) => issue.startsWith('package-decision') && issue.includes(id)), id)
  assert.ok(refused.some((issue) => issue.startsWith('package-operator') && issue.includes('dependency-failure')))
  assert.ok(refused.some((issue) => issue.startsWith('package-metamorphic')))

  // a fault is planted in the product, and a run record pins the output it read
  const harness = clone(PKG)
  harness.faultModel.push({ id: 'F91', class: 'conditional', file: 'search.adapter.mjs', find: 'return requestId', replace: 'return 0' })
  const { outputDigest: _dropped, ...unpinned } = harness.aiRuns[0]
  harness.aiRuns[0] = unpinned
  const pinned = packageIssues(harness)
  assert.ok(pinned.some((issue) => issue.startsWith('package-fault-file: F91')), pinned.join('\n'))
  assert.ok(pinned.some((issue) => issue.startsWith('package-ai-run') && issue.includes('outputDigest')), pinned.join('\n'))
})

test('a mutant is killed only by a unit the unmutated product passes: a trace case, a world setting, fast-check or a relation', () => {
  const setting = (arrival, status) => ({ coordinates: { arrival }, status })
  const base = {
    trace: { failedCases: ['c3'] },
    sampled: { failed: false },
    world: { settings: [setting('OldFirst', 'pass'), setting('NewFirst', 'model-gap')] },
  }
  // failing only where the unmutated product already fails is not a kill; a model gap does not hide the other settings
  assert.deepEqual(
    killedChecks(base, { trace: { failedCases: ['c3'] }, sampled: { failed: false }, world: { settings: [setting('OldFirst', 'pass'), setting('NewFirst', 'violation')] } }),
    [],
  )
  assert.deepEqual(
    killedChecks(
      base,
      { trace: { failedCases: ['c3', 'c7'] }, sampled: { failed: true }, world: { settings: [setting('OldFirst', 'violation'), setting('NewFirst', 'model-gap')] } },
      [
        { id: 'MR1', baseHolds: true, mutantBroken: true },
        { id: 'MR2', baseHolds: false, mutantBroken: true },
      ],
    ),
    ['trace-conformance', 'fast-check', 'world-conformance', 'metamorphic MR1'],
  )
})

test('a fault edit is literal: replacement patterns such as $& or $\' are not expanded, and the mutant marks itself loaded', () => {
  const mutated = applyFault("const total = amount + 1\nexport default total\n", { find: '+ 1', replace: "+ '$&' + '$\''" })
  assert.equal(mutated, "globalThis.__ORACLE_MUTANT_LOADED__ = true; const total = amount + '$&' + '$\''\nexport default total\n")
})

test('a source n/a replaces only an operator that ran nothing; a cut-short or invalid run keeps its status', () => {
  const operators = applyDispositions(
    {
      'boundary-perturbation': { status: 'incomplete', reason: 'the perturbation cap stopped it', candidates: [] },
      'order-perturbation': { status: 'not-run', candidates: [] },
      metamorphic: { status: 'undeclared', candidates: [] },
    },
    {
      'boundary-perturbation': 'n/a: S1 no numeric input',
      'order-perturbation': 'n/a: S1 one event kind',
      metamorphic: 'n/a: S1 no relation',
    },
  )
  assert.deepEqual(operators['boundary-perturbation'], { status: 'incomplete', reason: 'the perturbation cap stopped it', candidates: [] })
  assert.equal(operators['order-perturbation'].status, 'not-applicable')
  assert.equal(operators.metamorphic.status, 'not-applicable')
})

test('product completeness needs a reviewed runner with no blockers, a fresh latest run per label, and a lock over the package inputs', () => {
  const reviewed = { state: 'REVIEW_VERIFIED', blockers: [], staleLabels: [] }
  assert.deepEqual(productCompleteReasons(reviewed, true), [])
  assert.equal(productCompleteReasons(null, true).length, 1)
  assert.equal(productCompleteReasons(reviewed, false).length, 1)
  const stale = productCompleteReasons({ state: 'REVIEW_VERIFIED', blockers: ['LOCK_DRIFT'], staleLabels: ['behavior'] }, true)
  assert.equal(stale.length, 2)
  assert.match(stale.join('; '), /LOCK_DRIFT/)
  assert.match(stale.join('; '), /behavior/)
})

test('a decision must fit what it closes: equivalent only for a surviving mutant, covered only for an AI finding', () => {
  assert.equal(decisionMisfit({ class: 'oracle-weakness', operator: 'mutation' }, { decision: 'equivalent' }), null)
  assert.match(decisionMisfit({ class: 'hidden-state', operator: 'projection-residue' }, { decision: 'equivalent' }), /surviving mutant/)
  assert.match(decisionMisfit({ class: 'hidden-state', operator: 'projection-residue' }, { decision: 'covered', by: 'O2' }), /contradicts/)
  assert.equal(decisionMisfit({ class: 'new-axis', operator: 'cross-agent' }, { decision: 'covered', by: 'O2' }), null)
  const pkg = { discoveryDecisions: [{ candidate: 'C-000000000a', decision: 'equivalent', reason: 'r' }] }
  const [record] = lifecycle([{ id: 'C-000000000a', operator: 'projection-residue', class: 'hidden-state', reproducible: true, evidence: {} }], pkg, { axes: [] })
  assert.deepEqual([record.stage, record.open], ['REPRODUCIBLE', true])
})

test('a declared operator is modeled only by an input the space varies: an event or a coordinate with two values or more', () => {
  const axis = (id, role, values) => ({ id, role, domain: { enumerated: { values } } })
  const derived = {
    axes: [
      axis('event.Msg', 'environment', ['Issue', 'Respond']),
      axis('event.Only', 'environment', ['Issue']),
      axis('world.Race.final', 'observable', ['NoneShown', 'NewShown']),
    ],
  }
  assert.equal(declaredStatus('latency', 'modeled: event.Msg', derived).status, 'covered')
  assert.match(declaredStatus('latency', 'modeled: event.Only', derived).reason, /fewer than two/)
  assert.match(declaredStatus('latency', 'modeled: world.Race.final', derived).reason, /observable axis/)
  assert.match(declaredStatus('mutation', 'modeled: event.Msg', derived).reason, /runs mechanically/)
  assert.equal(declaredStatus('latency', 'n/a: S1 no network', derived).status, 'not-applicable')
})

test('source sentences drop headings and list markers and split after sentence and clause marks', () => {
  assert.deepEqual(sourceSentences('## Policy\n\nIntro:\n\n1. One thing; another thing.\n2. Last one.'), [
    'Intro:',
    'One thing;',
    'another thing.',
    'Last one.',
  ])
})

test('the mutation hook swaps one product module for its mutant and leaves every other import alone', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-hook-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'helper.mjs'), 'export const two = 2\n')
  await writeFile(join(root, 'product.mjs'), "import { two } from './helper.mjs'\nexport const value = () => two\n")
  await writeFile(join(root, 'main.mjs'), "import { value } from './product.mjs'\nconsole.log(value())\n")
  const mutantDirectory = await mkdtemp(join(tmpdir(), 'oracle-hook-mutant-'))
  t.after(() => rm(mutantDirectory, { recursive: true, force: true }))
  // the mutant still imports ./helper.mjs — resolved next to the original, not next to the mutant
  await writeFile(join(mutantDirectory, 'product.mjs'), "import { two } from './helper.mjs'\nexport const value = () => two + 40\n")
  const run = (redirect) =>
    spawnSync(process.execPath, ['--import', pathToFileURL(join(SCRIPTS, 'oracle-mutation-register.mjs')).href, join(root, 'main.mjs')], {
      encoding: 'utf8',
      env: { ...CHILD_ENV, ORACLE_MUTATION_REDIRECT: JSON.stringify(redirect) },
    })
  assert.equal(run({}).stdout.trim(), '2')
  const mutated = run({ [pathToFileURL(join(root, 'product.mjs')).href]: pathToFileURL(join(mutantDirectory, 'product.mjs')).href })
  assert.equal(mutated.stdout.trim(), '42', mutated.stderr)
  assert.equal(await readFile(join(root, 'product.mjs'), 'utf8'), "import { two } from './helper.mjs'\nexport const value = () => two\n")
})

test('the mutation hook finds a product module that the redirect names through a symlinked path', async (t) => {
  // macOS tmpdir() is /var/..., a symlink to /private/var/... — Node loads the real path, so a redirect keyed by the link path never matched
  const real = await mkdtemp(join(tmpdir(), 'oracle-hook-real-'))
  const holder = await mkdtemp(join(tmpdir(), 'oracle-hook-link-'))
  t.after(() => Promise.all([rm(real, { recursive: true, force: true }), rm(holder, { recursive: true, force: true })]))
  const link = join(holder, 'repo')
  await symlink(real, link)
  await writeFile(join(real, 'product.mjs'), 'export const value = () => 2\n')
  await writeFile(join(real, 'main.mjs'), "import { value } from './product.mjs'\nconsole.log(value())\n")
  const mutantDirectory = await mkdtemp(join(tmpdir(), 'oracle-hook-mutant-'))
  t.after(() => rm(mutantDirectory, { recursive: true, force: true }))
  await writeFile(join(mutantDirectory, 'product.mjs'), 'export const value = () => 42\n')
  const mutated = spawnSync(process.execPath, ['--import', pathToFileURL(join(SCRIPTS, 'oracle-mutation-register.mjs')).href, join(real, 'main.mjs')], {
    encoding: 'utf8',
    env: {
      ...CHILD_ENV,
      ORACLE_MUTATION_REDIRECT: JSON.stringify({ [pathToFileURL(join(link, 'product.mjs')).href]: pathToFileURL(join(mutantDirectory, 'product.mjs')).href }),
    },
  })
  assert.equal(mutated.stdout.trim(), '42', mutated.stderr)
})

// ── 실제 Bend 2.0.34 통합 ─────────────────────────────────────────────────────────────────────────────────────────

test('[bend] the first reading is attacked: a hidden observation, a weak contract and a surviving mutant become candidates', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t)
  const draft = await closure({ packagePath: 'oracle.package.draft.json', root, bin })
  assert.equal(draft.verdict, 'EXPANSION_REQUIRED')
  const open = new Map(draft.candidates.filter((entry) => entry.open).map((entry) => [entry.id, entry]))
  // the three counterexamples the refined package records as the origins of its axes and contract
  assert.equal(open.get('C-fee4ce433a')?.class, 'observation-gap')
  assert.equal(open.get('C-3ac744e3e6')?.class, 'weak-contract')
  assert.equal(open.get('C-069764844d')?.class, 'oracle-weakness')
  assert.equal(draft.levels.L3.status, 'fail')
  assert.equal(draft.levels.L3.adequacy.status, 'refuted')
  // behaviour past the bound was executed by the sampler, so it is sampled coverage, not a candidate
  assert.ok(draft.operators['trace-extension'].coveredBySampling.length > 0)
  assert.equal(draft.operators['trace-extension'].candidates.length, 0)
})

test('[bend] the refined space closes with bounds: every level passes, promotions are absorbed, residual risk is listed', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t)
  const result = await closure({ packagePath: 'oracle.package.json', root, bin, runtime: 'discovery/runtime-anomalies.json' })
  assert.equal(
    result.verdict,
    'CLOSED_WITH_BOUNDS',
    JSON.stringify({ failing: result.failingLevels, blocking: result.levels.L6.blockingOperators, open: result.levels.L6.openCandidates }),
  )
  for (const level of ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']) assert.equal(result.levels[level].status, 'pass', level)
  assert.equal(result.explorationClosed, true)
  // both AI operators ran on the current space
  for (const id of ['ai-explorer', 'cross-agent']) {
    assert.equal(result.operators[id].status, 'run', id)
    assert.ok(result.operators[id].runs.some((run) => run.status === 'current'), id)
  }
  // each fault dies to the check built for it: the world for the observations and coordinates the discovery
  // rounds added, the trace space for the third request
  const killedBy = Object.fromEntries(result.operators.mutation.mutants.map((entry) => [entry.fault, entry.killedBy]))
  assert.deepEqual(killedBy.F5, ['world-conformance'])
  assert.deepEqual(killedBy.F6, ['trace-conformance', 'fast-check'])
  // F12 needs five events (space v5): enumerated now, where at bound 4 only sampling caught it
  assert.ok(killedBy.F12.includes('trace-conformance'))
  for (const id of ['F7', 'F8', 'F9', 'F11']) assert.deepEqual(killedBy[id], ['world-conformance'], id)
  assert.deepEqual(result.levels.L5.equivalent, ['F2'])
  const stage = (id) => {
    const entry = result.candidates.find((candidate) => candidate.id === id)
    return [entry?.stage, entry?.open]
  }
  for (const id of ['C-fee4ce433a', 'C-3ac744e3e6', 'C-069764844d']) assert.deepEqual(stage(id), ['TEST_IMPLEMENTED', false], id)
  // promotions found by earlier AI rounds are absorbed once their axis exists
  for (const id of ['C-b55fd8002e', 'C-5b74ed91ab', 'C-56c922678f', 'C-32bf7f62bc', 'C-826523b49a'])
    assert.deepEqual(stage(id), ['TEST_IMPLEMENTED', false], id)
  // the sentence that only introduces the policy list was found by requirement coverage and decided, not ignored
  assert.deepEqual(stage('C-d7a18d2dea'), ['DOMAIN_VALIDATED', false])
  const axis = (id) => result.registry.axes.find((entry) => entry.id === id)
  const items = axis('world.Race.itemsIntact')
  assert.deepEqual([items.origin.origin, items.origin.ref], ['counterexample', 'C-069764844d'])
  assert.deepEqual(items.promotedFrom, ['C-069764844d', 'C-4ec1477d3e'])
  assert.deepEqual(items.judgedBy, ['G5', 'O5'])
  for (const [id, ref] of [
    ['world.Race.oldEmpty', 'C-5b74ed91ab'],
    ['world.Race.newEmpty', 'C-b55fd8002e'],
    ['world.Race.longSession', 'C-56c922678f'],
  ])
    assert.deepEqual([axis(id).origin.origin, axis(id).origin.ref], ['counterexample', ref], id)
  // the incident trace is inside the space and the current product matches the model; the duplicate is decided
  assert.equal(result.levels.L7.anomalies.find((entry) => entry.id === 'INC-184').status, 'absorbed')
  assert.deepEqual(stage('C-7d53bbf538'), ['DOMAIN_VALIDATED', false])
  const kinds = new Set(result.residualRisk.map((entry) => entry.kind))
  for (const kind of ['operator-not-applicable', 'operator-modeled', 'ai-sampled', 'decided-candidate', 'bound', 'independence'])
    assert.ok(kinds.has(kind), kind)
  // covered decisions are claims the tool did not verify, so they stay in the residual risk list
  assert.ok(result.residualRisk.some((entry) => entry.kind === 'decided-candidate' && entry.decision === 'covered'))
  // without --dir and --lock the closure never claims product completeness, and says why
  assert.equal(result.verdict, 'CLOSED_WITH_BOUNDS')
  assert.ok(result.productComplete.reasons.some((reason) => reason.includes('--dir')))
  assert.equal(result.levels.L6.canaries['observation-ablation'].status, 'pass')
  assert.deepEqual(
    result.levels.L6.canaries['observation-ablation'].loadBearing.map((entry) => entry.field).sort(),
    ['final', 'itemsIntact', 'oldShown'],
  )
})

test('[bend] a lock that covers the package turns absorbed promotions into regression-locked ones', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t)
  const inputs = await packageInputs(await loadPackage('oracle.package.json', { root }))
  // a lock over the package bytes alone does not lock the world the promoted axes live in
  await writeFile(join(root, 'partial.lock.json'), JSON.stringify({ sources: inputs.filter((entry) => entry.path === 'oracle.package.json') }))
  const partial = await closure({ packagePath: 'oracle.package.json', root, bin, lock: 'partial.lock.json' })
  assert.equal(partial.candidates.find((entry) => entry.id === 'C-fee4ce433a').stage, 'TEST_IMPLEMENTED')
  // the lock path is resolved against the package root, not the working directory of the caller
  await writeFile(join(root, 'oracle.lock.json'), JSON.stringify({ sources: inputs }))
  const result = await closure({ packagePath: 'oracle.package.json', root, bin, lock: 'oracle.lock.json' })
  assert.equal(result.candidates.find((entry) => entry.id === 'C-fee4ce433a').stage, 'REGRESSION_LOCKED')
  await assert.rejects(closure({ packagePath: 'oracle.package.json', root, bin, lock: 'missing.lock.json' }), /DISCOVERY_INPUT|unreadable/)
})

test('[bend] runtime evidence reopens the space: an undecided anomaly and a regressed product each reopen it', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t)
  const anomalies = JSON.parse(await readFile(join(root, 'discovery/runtime-anomalies.json'), 'utf8'))
  anomalies.anomalies.push({ id: 'INC-207', source: 'synthetic', summary: 'results for a query nobody typed — no trace captured' })
  await writeFile(join(root, 'anomalies.json'), JSON.stringify(anomalies))
  const unexplained = await closure({ packagePath: 'oracle.package.json', root, bin, runtime: 'anomalies.json' })
  assert.equal(unexplained.verdict, 'RUNTIME_REOPENED')
  const entry = unexplained.levels.L7.anomalies.find((anomaly) => anomaly.id === 'INC-207')
  assert.equal(entry.status, 'unexplained')
  assert.ok(unexplained.levels.L6.openCandidates.includes(entry.candidate))

  // the product regresses to the stale-overwrite bug: the incident trace no longer matches the model
  const mutants = await readFile(join(root, 'search-reducer.mutants.mts'), 'utf8')
  const reducer = await readFile(join(root, 'search-reducer.mts'), 'utf8')
  await writeFile(
    join(root, 'search-reducer.mts'),
    `${reducer.split('export function reduceSearch')[0]}${mutants
      .split('\n')
      .filter((line) => !line.startsWith('import'))
      .join('\n')
      .replace('export function reduceWithoutStaleCheck', 'export function reduceSearch')}`,
  )
  const regressed = await closure({ packagePath: 'oracle.package.json', root, bin, runtime: 'discovery/runtime-anomalies.json' })
  assert.equal(regressed.verdict, 'RUNTIME_REOPENED')
  assert.equal(regressed.levels.L7.anomalies.find((anomaly) => anomaly.id === 'INC-184').status, 'product-defect')
  // a check the unmutated product already fails kills no mutant, and the mutation level cannot pass on it
  assert.equal(regressed.levels.L5.status, 'fail')
  assert.ok(regressed.levels.L5.baselineFailures.includes('trace-conformance'))
  for (const mutant of regressed.operators.mutation.mutants)
    assert.ok(!mutant.killedBy?.some((check) => regressed.levels.L5.baselineFailures.includes(check)), mutant.fault)
})

test('[bend] closure is withheld when the attack itself is weak: stale AI runs, an unkillable fault model, a hidden axis or an unexplained residue', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t)

  // a changed operator disposition changes the AI input, so the recorded runs are stale, not current
  const moved = clone(PKG)
  moved.operators['environment-variation'] = 'n/a: S1 no browser is in scope for this reducer'
  await writePackage(root, 'moved.json', moved)
  const inputDigest = async (name) =>
    createHash('sha256')
      .update(await aiInput({ loaded: await loadPackage(name, { root }), operator: 'cross-agent', bin }))
      .digest('hex')
  const recorded = PKG.aiRuns.filter((run) => run.operator === 'cross-agent').map((run) => run.inputDigest)
  // control: the unchanged package's input is the one a recorded run saw; the moved one is not
  assert.ok(recorded.includes(await inputDigest('oracle.package.json')))
  assert.ok(!recorded.includes(await inputDigest('moved.json')))
  const stale = await closure({ packagePath: 'moved.json', root, bin })
  assert.equal(stale.operators['cross-agent'].status, 'stale')
  assert.equal(stale.verdict, 'NOT_CLOSED')

  // a fault model whose only fault is equivalent kills nothing: the harness cannot be shown to fail
  const weak = clone(PKG)
  weak.faultModel = weak.faultModel.filter((fault) => fault.id === 'F2')
  await writePackage(root, 'weak.json', weak)
  const unkillable = await closure({ packagePath: 'weak.json', root, bin })
  assert.equal(unkillable.levels.L6.canaries['mutation-baseline'].status, 'fail')
  assert.equal(unkillable.levels.L5.status, 'fail')

  // a mutant whose edit does not even load is stillborn: invalid, never a kill, and the mutation level is incomplete
  const stillborn = clone(PKG)
  stillborn.faultModel = [
    ...stillborn.faultModel,
    { id: 'F99', class: 'conditional', file: 'search-reducer.mts', find: "if (event.type === 'issue') return", replace: "if (event.type === 'issue') retur" },
  ]
  await writePackage(root, 'stillborn.json', stillborn)
  const broken = await closure({ packagePath: 'stillborn.json', root, bin })
  assert.equal(broken.operators.mutation.mutants.find((entry) => entry.fault === 'F99').status, 'invalid')
  assert.equal(broken.operators.mutation.status, 'incomplete')
  assert.equal(broken.levels.L5.status, 'fail')

  // order-timing declared n/a while the behaviour model computes order obligations: a temporal axis is missing
  const timeless = clone(PKG)
  timeless.hazards['order-timing'] = 'n/a: S1 one attempt judged by its end state'
  await writePackage(root, 'timeless.json', timeless)
  const temporal = await closure({ packagePath: 'timeless.json', root, bin })
  const axis = temporal.candidates.find((entry) => entry.operator === 'temporal-order')
  assert.deepEqual([axis?.class, axis?.open], ['new-axis', true])

  // an undeclared residue field is hidden product state the observation cannot see
  const residue = clone(PKG)
  residue.residue = {}
  await writePackage(root, 'residue.json', residue)
  const hidden = await closure({ packagePath: 'residue.json', root, bin })
  assert.ok(hidden.candidates.some((entry) => entry.class === 'hidden-state' && entry.evidence.field === 'latestRequestId' && entry.open))

  // a declared operator is modeled by an input the space varies — hidden state or an observation is not an attack
  const fake = clone(PKG)
  fake.operators.concurrency = 'modeled: state.Search.Search.latest'
  fake.operators['malformed-input'] = 'modeled: world.Race.final'
  await writePackage(root, 'fake.json', fake)
  const invalid = await closure({ packagePath: 'fake.json', root, bin })
  for (const id of ['concurrency', 'malformed-input']) {
    assert.equal(invalid.operators[id].status, 'invalid', id)
    assert.ok(invalid.levels.L6.blockingOperators.some((entry) => entry.startsWith(`${id}: invalid`)), id)
  }
})

test('[bend] a finding outlives the space it was made on: a stale run is carried until decided, and a lost record blocks closure', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t)
  // round 1 ran on space v1; its "empty latest response" finding became the newEmpty axis of space v3
  const undecided = clone(PKG)
  undecided.discoveryDecisions = undecided.discoveryDecisions.filter((entry) => entry.candidate !== 'C-b55fd8002e')
  await writePackage(root, 'undecided.json', undecided)
  const carried = await closure({ packagePath: 'undecided.json', root, bin })
  const finding = carried.candidates.find((entry) => entry.id === 'C-b55fd8002e')
  assert.deepEqual([finding?.class, finding?.open, finding?.evidence.stale], ['new-axis', true, true])
  assert.equal(carried.verdict, 'EXPANSION_REQUIRED')
  // decided, the carried promotion counts as absorbed: its target is in the package
  const decided = await closure({ packagePath: 'oracle.package.json', root, bin })
  const absorbed = decided.candidates.find((entry) => entry.id === 'C-b55fd8002e')
  assert.deepEqual([absorbed.stage, absorbed.open, absorbed.produced], ['TEST_IMPLEMENTED', false, 'carried'])

  // an old run's new fact that is now a world field was absorbed; its world literal from an older world is not
  // readable any more and needs a decision instead of vanishing
  await writeFile(
    join(root, 'discovery/old.json'),
    JSON.stringify({
      candidates: [
        { id: 'Y1', kind: 'new-fact', scenario: 'an empty latest response', harm: 'h', newFact: { name: 'newEmpty', category: 'controllable', observedVia: '—' }, whyOutside: 'w', sources: ['S1'] },
        { id: 'Y2', kind: 'in-world', scenario: 'a space v2 world', harm: 'h', world: 'arrival=OldFirst newAnswers final=NewShown !oldShown itemsIntact', sources: ['S1'] },
      ],
    }),
  )
  const older = clone(PKG)
  const oldOutput = await readFile(join(root, 'discovery/old.json'))
  older.aiRuns.push({
    operator: 'cross-agent',
    file: 'discovery/old.json',
    agent: 'a stale test run',
    inputDigest: '0'.repeat(64),
    outputDigest: createHash('sha256').update(oldOutput).digest('hex'),
  })
  await writePackage(root, 'older.json', older)
  const aged = await closure({ packagePath: 'older.json', root, bin })
  const oldRun = aged.operators['cross-agent'].runs.find((run) => run.file === 'discovery/old.json')
  assert.equal(oldRun.status, 'stale')
  // a fact named like a field is not proof the field means it: it stays open until a decision promotes it there
  const fromOld = aged.candidates.filter((entry) => entry.evidence?.run === 'discovery/old.json')
  assert.deepEqual(fromOld.map((entry) => [entry.class, entry.open]).sort(), [['new-axis', true], ['superseded-world', true]])

  // a recorded run whose output is gone cannot be triaged, so exploration cannot close over it
  const lost = clone(PKG)
  lost.aiRuns[0] = { ...lost.aiRuns[0], file: 'discovery/round1/missing.json' }
  await writePackage(root, 'lost.json', lost)
  const blocked = await closure({ packagePath: 'lost.json', root, bin })
  assert.equal(blocked.operators[lost.aiRuns[0].operator].status, 'invalid')
  assert.equal(blocked.verdict, 'NOT_CLOSED')
})

test('[bend] nothing a tool found disappears by bookkeeping: an n/a operator, a stale duplicate, an edited output, a bad anomaly file or an unloaded mutant', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t)
  const explorerRuns = PKG.aiRuns.filter((run) => run.operator === 'ai-explorer')
  const current = explorerRuns.at(-1)

  // declaring the AI explorer n/a does not close what its recorded runs found
  const notApplicable = clone(PKG)
  notApplicable.operators['ai-explorer'] = 'n/a: S1 the reducer has no screen to explore'
  notApplicable.discoveryDecisions = notApplicable.discoveryDecisions.filter((entry) => entry.candidate !== 'C-b55fd8002e')
  await writePackage(root, 'na.json', notApplicable)
  const na = await closure({ packagePath: 'na.json', root, bin })
  assert.equal(na.operators['ai-explorer'].status, 'run')
  assert.deepEqual(
    [na.candidates.find((entry) => entry.id === 'C-b55fd8002e')?.open, na.verdict],
    [true, 'EXPANSION_REQUIRED'],
  )

  // a finding the current run still produces stays open after promotion, wherever a stale copy of the run is listed
  const produced = na.candidates.find((entry) => entry.operator === 'ai-explorer' && entry.evidence?.stale === false)
  assert.ok(produced, 'the current explorer run produces at least one finding')
  const promoted = clone(PKG)
  promoted.discoveryDecisions = [
    ...promoted.discoveryDecisions.filter((entry) => entry.candidate !== produced.id),
    { candidate: produced.id, decision: 'promoted', axis: 'traceConformance', source: 'S1', reason: 'test' },
  ]
  const staleCopy = { ...current, agent: 'a stale copy', inputDigest: '0'.repeat(64) }
  for (const [name, runs] of [
    ['stale-first.json', [staleCopy, ...promoted.aiRuns]],
    ['stale-last.json', [...promoted.aiRuns, staleCopy]],
  ]) {
    await writePackage(root, name, { ...promoted, aiRuns: runs })
    const duplicate = await closure({ packagePath: name, root, bin })
    const found = duplicate.candidates.find((entry) => entry.id === produced.id)
    assert.deepEqual([found.stage, found.open, found.evidence.stale], ['ORACLE_DEFINED', true, false], name)
  }

  // an output edited after it was recorded is not the run: the operator cannot close over it
  const output = join(root, current.file)
  const edited = JSON.parse(await readFile(output, 'utf8'))
  edited.candidates = edited.candidates.slice(1)
  await writeFile(output, JSON.stringify(edited))
  const tampered = await closure({ packagePath: 'oracle.package.json', root, bin })
  assert.equal(tampered.operators['ai-explorer'].status, 'invalid')
  assert.equal(tampered.verdict, 'NOT_CLOSED')
  await cp(join(FIXTURE, current.file), output)

  // an anomaly file of the wrong shape is an input error, never zero evidence
  await writeFile(join(root, 'anomalies.json'), JSON.stringify([{ id: 'INC-999', summary: 'no trace' }]))
  await assert.rejects(closure({ packagePath: 'oracle.package.json', root, bin, runtime: 'anomalies.json' }), /anomalies/)

  // a product file the checks never import runs unmutated: its mutant is invalid, not a survivor to call equivalent
  await writeFile(join(root, 'unused.mts'), 'export const unused = (value: number) => value + 1\n')
  const unloaded = clone(PKG)
  unloaded.product.files.push('unused.mts')
  unloaded.faultModel.push({ id: 'F90', class: 'boundary', file: 'unused.mts', find: 'value + 1', replace: 'value + 2' })
  await writePackage(root, 'unloaded.json', unloaded)
  const never = await closure({ packagePath: 'unloaded.json', root, bin })
  const mutant = never.operators.mutation.mutants.find((entry) => entry.fault === 'F90')
  assert.equal(mutant.status, 'invalid')
  assert.match(mutant.reason, /never loaded/)
})

test('[bend] the axes the discovery rounds added are what kill their faults: append only at the early arrival, empty responses only when one is empty, text ids only in a long session', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const failing = {}
  for (const fault of PKG.faultModel.filter((entry) => ['F7', 'F8', 'F9', 'F11'].includes(entry.id))) {
    const root = await fixtureCopy(t)
    const file = join(root, fault.file)
    await writeFile(file, (await readFile(file, 'utf8')).replace(fault.find, fault.replace))
    const adapter = await import(pathToFileURL(join(root, 'world.adapter.mjs')).href)
    const result = await conformWorld({ package: 'oracle.package.json', cwd: root, adapter, bin })
    failing[fault.id] = result.settings.filter((entry) => entry.status === 'violation').map((entry) => entry.coordinates)
  }
  // F7 (append to the shown results) needs a list that already shows results when the latest response lands
  assert.ok(failing.F7.length > 0)
  assert.ok(failing.F7.every((setting) => setting.arrival === 'OldEarly' && setting.newAnswers))
  // F8 (skip an empty response) and F9 (an empty response clears the list) need an empty response
  for (const id of ['F8', 'F9']) {
    assert.ok(failing[id].length > 0, id)
    assert.ok(failing[id].every((setting) => setting.oldEmpty || setting.newEmpty), id)
  }
  // F9 at NewFirst with only the late response empty: the stale empty response wiped the latest results
  assert.ok(failing.F9.some((setting) => setting.arrival === 'NewFirst' && setting.oldEmpty && !setting.newEmpty))
  // F11 (ids compared as text) needs two-digit ids: '9' sorts after '10' (space v4)
  assert.ok(failing.F11.length > 0)
  assert.ok(failing.F11.every((setting) => setting.longSession))
})

test('[bend] a metamorphic relation the model itself breaks is a candidate, and a mutant that breaks it on the product is killed', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t)
  const meta = await readFile(join(root, 'Metamorphic.bend'), 'utf8')
  await writeFile(
    join(root, 'Metamorphic.bend'),
    `${meta}\n# a wrong relation: issuing a request changes what is shown\ndef Meta.differentShown(a: Nat, b: Nat) -> Bool:\n  Bool.not(Nat.is_eq(a, b))\n`,
  )
  const wrong = clone(PKG)
  wrong.metamorphic.relations.push({ id: 'MR2', transform: 'Meta.issueAppended', relation: 'Meta.differentShown' })
  await writePackage(root, 'wrong.json', wrong)
  const result = await closure({ packagePath: 'wrong.json', root, bin })
  const mr2 = result.levels.L4.relations.find((entry) => entry.id === 'MR2')
  assert.equal(mr2.status, 'fails')
  assert.ok(mr2.modelViolations > 0)
  assert.ok(result.candidates.some((entry) => entry.class === 'relation-invalid' && entry.open))
  // F4 (issuing clears the list) is killed by MR1 on the product
  assert.ok(result.operators.mutation.mutants.find((entry) => entry.fault === 'F4').killedBy.includes('metamorphic MR1'))
})

// ── space-cross-check: the declared space (Space discovery record) against the Bend space ─────────────────────────

const DECLARED = `## Case space

| Family | Dimension | Choices             |
| ------ | --------- | ------------------- |
| Data   | rows      | 0, 1                |
| Entry  | entry     | fresh, deep         |
| Order  | arrival   | inOrder, overtaken  |
| Async  | response  | ok, fail [error]    |
`

test('space-cross-check: every declared value, value pair and transition is placed in the world, the traces, or a candidate', () => {
  // two coordinates of the world; the assumption rejects the fresh entry with one row
  const worlds = ['Zero', 'One'].flatMap((rows) =>
    ['Fresh', 'Deep'].map((entry) => ({ plain: { rows, entry }, valid: !(rows === 'One' && entry === 'Fresh'), truth: { A1: !(rows === 'One' && entry === 'Fresh') } })),
  )
  // two traces: an in-order reply and an overtaken one; a step names its arrival kind and its state phase
  const step = (arrival, from, to) => ({ before: { phase: from }, event: { arrival }, after: { phase: to } })
  const traces = [
    { label: 'go · reply', steps: [step('None', 'Shown', 'Busy'), step('InOrder', 'Busy', 'Shown')] },
    { label: 'go · go · old reply', steps: [step('None', 'Shown', 'Busy'), step('None', 'Busy', 'Busy'), step('Overtaken', 'Busy', 'Busy')] },
  ]
  // the classifier defs of a hand model: the arrival kind of a step, whether it is a reply, the phase of a state
  const CLASSIFIERS = {
    'M.arrival': (state, event) => event.arrival,
    'M.reply': (state, event) => (event.arrival === 'None' ? 'None' : 'Reply'),
    'M.phase': (state) => state.phase,
    'M.step': (state, event) => event.arrival,
  }
  const classify = (def, ...args) => CLASSIFIERS[def](...args)
  const result = crossCheckSpace({
    caseSpace: parseCaseSpace(DECLARED),
    stateModel: {
      states: ['shown', 'busy'],
      events: ['GO', 'REPLY'],
      transitions: [
        { from: 'shown', event: 'GO', to: 'busy' },
        { from: 'busy', event: 'REPLY', to: 'shown' },
        { from: 'busy', event: 'CANCEL', to: 'shown' },
      ],
    },
    mapping: {
      dimensions: {
        rows: { world: 'rows', values: { 0: 'Zero', 1: 'One' } },
        entry: { world: 'entry', values: { fresh: 'Fresh', deep: 'Deep' } },
        arrival: { classify: 'M.arrival', values: { inOrder: 'InOrder', overtaken: 'Overtaken' } },
        response: { classify: 'M.reply', values: { ok: 'Reply' } },
      },
      stateModel: { phase: 'M.phase', step: 'M.step', states: { shown: 'Shown', busy: 'Busy' }, events: { GO: 'None', REPLY: 'InOrder' } },
    },
    worlds,
    traces,
    classify,
  })
  const byClass = (cls) => result.candidates.filter((entry) => entry.class === cls)
  // the error value has no counterpart; nothing invented for it
  assert.match(byClass('new-axis').map((entry) => entry.summary).join(' | '), /response=fail has no counterpart/)
  // a pair split across the world and the traces is one candidate per dimension pair, listing its value pairs
  const cross = byClass('cross-term')
  assert.deepEqual(cross.map((entry) => entry.evidence.dimensions.join(' × ')).sort(), ['arrival × entry', 'arrival × rows', 'entry × response', 'response × rows'])
  assert.equal(cross.find((entry) => entry.evidence.dimensions.join(' × ') === 'arrival × rows').evidence.pairs.length, 4)
  // the world pair the assumption removes is reported with the assumption, not as a candidate
  assert.deepEqual(result.summary.pairs.excluded, [{ pair: 'rows=1 × entry=fresh', by: ['A1'] }])
  // the model takes busy -GO-> busy, which the declaration lacks, and an overtaken reply the declaration has no event
  // for (shown as <Overtaken>); the declared CANCEL has no counterpart in the model
  assert.deepEqual(byClass('silent-decision').map((entry) => entry.evidence.transition), ['busy -<Overtaken>-> busy', 'busy -GO-> busy'])
  assert.ok(byClass('new-axis').some((entry) => /CANCEL has no counterpart/.test(entry.summary)))
  // stable: the same inputs give the same candidates
  assert.deepEqual(
    crossCheckSpace({ caseSpace: parseCaseSpace(DECLARED), stateModel: null, mapping: { dimensions: {} }, worlds, traces, classify }).candidates.map((entry) => entry.id),
    crossCheckSpace({ caseSpace: parseCaseSpace(DECLARED), stateModel: null, mapping: { dimensions: {} }, worlds, traces, classify }).candidates.map((entry) => entry.id),
  )
})

test('space-cross-check: given the fields the test sets, a few joint cases cover every world × behavior pair the traces can show', () => {
  const worlds = ['Zero', 'One'].flatMap((rows) =>
    ['Fresh', 'Deep'].map((entry) => ({ plain: { rows, entry }, valid: !(rows === 'One' && entry === 'Fresh'), truth: {} })),
  )
  const step = (arrival) => ({ before: {}, event: { arrival }, after: {} })
  const traces = [
    { label: 'go · reply', trace: [{ $: 'Go' }, { $: 'Reply' }], observations: [1, 2], steps: [step('None'), step('InOrder')] },
    { label: 'go · go · old reply', trace: [{ $: 'Go' }, { $: 'Go' }, { $: 'Reply' }], observations: [1, 1, 1], steps: [step('None'), step('None'), step('Overtaken')] },
  ]
  const CLASSIFIERS = {
    'M.arrival': (state, event) => event.arrival,
    'M.reply': (state, event) => (event.arrival === 'None' ? 'None' : 'Reply'),
  }
  const mapping = {
    dimensions: {
      rows: { world: 'rows', values: { 0: 'Zero', 1: 'One' } },
      entry: { world: 'entry', values: { fresh: 'Fresh', deep: 'Deep' } },
      arrival: { classify: 'M.arrival', values: { inOrder: 'InOrder', overtaken: 'Overtaken' } },
      response: { classify: 'M.reply', values: { ok: 'Reply' } },
    },
  }
  const run = (coordinates) =>
    crossCheckSpace({ caseSpace: parseCaseSpace(DECLARED), mapping, worlds, traces, classify: (def, ...args) => CLASSIFIERS[def](...args), coordinates })
  const both = run(['rows', 'entry'])
  // 4 world values × 3 behavior values = 12 pairs, all covered; no pair is left to a claim
  assert.deepEqual({ required: both.joint.required, covered: both.joint.covered }, { required: 12, covered: 12 })
  assert.equal(both.summary.pairs.coveredByJoint, 12)
  assert.equal(both.candidates.filter((entry) => entry.class === 'cross-term').length, 0)
  // fewer cases than the product of the settings and the traces, each a setting the assumptions allow, each with
  // the expectations the model computed for its trace
  assert.ok(both.joint.cases.length < 3 * 2, JSON.stringify(both.joint.cases.map((entry) => entry.label)))
  for (const entry of both.joint.cases) {
    assert.notDeepEqual(entry.coordinates, { entry: 'Fresh', rows: 'One' })
    assert.match(entry.id, /^J[a-f0-9]{12}$/)
    const source = traces.find((trace) => JSON.stringify(trace.trace) === JSON.stringify(entry.trace))
    assert.ok(source, entry.label)
    assert.deepEqual(entry.observations, source.observations)
  }
  assert.deepEqual(run(['rows', 'entry']).joint.cases, both.joint.cases)
  // a world field the test cannot set leaves its pairs as cross-term candidates
  const rowsOnly = run(['rows'])
  assert.deepEqual(
    rowsOnly.candidates.filter((entry) => entry.class === 'cross-term').map((entry) => entry.evidence.dimensions.join(' × ')).sort(),
    ['arrival × entry', 'entry × response'],
  )
})

test('[bend] space-cross-check on the paging fixture finds the split pairs, the missing failure and the transitions only the model decides', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = fileURLToPath(new URL('../../test-fixtures/pagination/', import.meta.url))
  const loaded = await loadPackage('oracle.package.json', { root })
  const result = await spaceCrossCheck({ loaded, bin })
  assert.equal(result.status, 'run')
  // 75 pairwise obligations: 38 by the world, 2 by the traces, 2 removed by A1, and the 33 that split across the two
  // models by 4 joint cases — every world value with one trace that shows a late and an in-order response
  assert.deepEqual(
    {
      total: result.summary.pairs.total,
      world: result.summary.pairs.coveredByWorld,
      traces: result.summary.pairs.coveredByTraces,
      joint: result.summary.pairs.coveredByJoint,
      cross: result.summary.pairs.crossTerm,
    },
    { total: 75, world: 38, traces: 2, joint: 33, cross: 0 },
  )
  assert.equal(result.summary.pairs.excluded.length, 2)
  assert.equal(result.joint.cases.length, 4)
  const byClass = (cls) => result.candidates.filter((entry) => entry.class === cls)
  assert.equal(byClass('cross-term').length, 0)
  // the 5xx failure, the error state and its events have no counterpart in the model
  const missing = byClass('new-axis').map((entry) => entry.summary).join(' | ')
  for (const name of ['response=http-5xx', 'state error', 'event ERROR_5XX', 'event RETRY']) assert.match(missing, new RegExp(name.replace('=', '=')))
  // four transitions only the model decides, two of them in cells the declaration left empty
  const silent = byClass('silent-decision')
  assert.deepEqual(silent.map((entry) => entry.evidence.transition).sort(), [
    'loading -GO_PAGE-> showing',
    'showing -GO_PAGE-> showing',
    'showing -RESPONSE_CURRENT-> showing',
    'showing -RESPONSE_STALE-> showing',
  ])
  assert.deepEqual(silent.filter((entry) => entry.evidence.declaredEmpty).map((entry) => entry.evidence.transition).sort(), [
    'showing -RESPONSE_CURRENT-> showing',
    'showing -RESPONSE_STALE-> showing',
  ])
  assert.match(silent.find((entry) => entry.evidence.transition === 'showing -RESPONSE_STALE-> showing').evidence.witness, /Arrive/)
})

test('space-cross-check runs only on a version-2 package; one without a crossCheck mapping blocks until mapped or written off', async () => {
  const v1 = await spaceCrossCheck({ loaded: { pkg: PKG, root: FIXTURE }, bin: null })
  assert.equal(v1.status, 'not-applicable')
  const v2 = { ...clone(PKG), packageVersion: 2 }
  const undeclared = await spaceCrossCheck({ loaded: { pkg: v2, root: FIXTURE }, bin: null })
  assert.equal(undeclared.status, 'undeclared')
  // a sourced n/a turns the blocking undeclared status into not-applicable
  const operators = applyDispositions({ 'space-cross-check': undeclared }, { 'space-cross-check': 'n/a: S1 no declared space exists for this legacy port' })
  assert.equal(operators['space-cross-check'].status, 'not-applicable')
})

// ── the lock gate: an undecided cross-check candidate keeps the card from passing lint ────────────────────────────

test('[bend] the cross-check gate lists every undecided candidate and clears once each is decided with its source', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await mkdtemp(join(tmpdir(), 'oracle-gate-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await cp(fileURLToPath(new URL('../../test-fixtures/pagination/', import.meta.url)), root, { recursive: true })
  const pkg = JSON.parse(await readFile(join(root, 'oracle.package.json'), 'utf8'))
  const open = await crossCheckIssues({ loaded: await loadPackage('oracle.package.json', { root }), bin })
  // the 5xx failure (4 new-axis) and the 4 transitions only the model decides; the split pairs are covered by joint cases
  assert.equal(open.length, 8, open.join('\n'))
  assert.ok(open.every((issue) => /^cross-check-undecided: C-[a-f0-9]{10} (?:new-axis|silent-decision) — /.test(issue)), open.join('\n'))
  // a decision citing the Space discovery record closes each one
  const decided = clone(pkg)
  decided.discoveryDecisions = open.map((issue) => ({
    candidate: issue.match(/C-[a-f0-9]{10}/)[0],
    decision: 'out-of-scope',
    reason: 'failures and returning to a shown page are decided in a later revision',
    source: 'S4',
  }))
  assert.deepEqual(packageIssues(decided, { stage: 'model' }), [])
  await writePackage(root, 'decided.json', decided)
  assert.deepEqual(await crossCheckIssues({ loaded: await loadPackage('decided.json', { root }), bin }), [])
  // a version-2 package without the mapping is blocked unless the operator is written off with a source
  const unmapped = clone(pkg)
  delete unmapped.crossCheck
  await writePackage(root, 'unmapped.json', unmapped)
  assert.match((await crossCheckIssues({ loaded: await loadPackage('unmapped.json', { root }), bin })).join(' '), /^cross-check-undeclared: /)
  unmapped.operators = { 'space-cross-check': 'n/a: S4 no declared space exists for this port' }
  await writePackage(root, 'written-off.json', unmapped)
  assert.deepEqual(await crossCheckIssues({ loaded: await loadPackage('written-off.json', { root }), bin }), [])
  // a version-1 package is not gated
  assert.deepEqual(await crossCheckIssues({ loaded: { pkg: PKG, root: FIXTURE, path: join(FIXTURE, 'oracle.package.json') }, bin }), [])
})

// ── two readings: the analyst's state table and the review of the translation table ────────────────────────────

test('[bend] the mapping review input shows the declared tables, the types, the classifiers and the mapping — never the step logic', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = fileURLToPath(new URL('../../test-fixtures/pagination/', import.meta.url))
  const input = await mappingInput({ loaded: await loadPackage('oracle.package.json', { root }) })
  for (const shown of ['## Case space', '## State Model', 'type Grid is Data:', 'def Grid.arrival(', '"crossCheck"', 'Grid.phase'])
    assert.ok(input.includes(shown), shown)
  for (const hidden of ['def Grid.step(', 'def Grid.next(', 'Env.scan'])
    assert.ok(!input.includes(hidden), `${hidden} leaked into the mapping review input`)
  // the review record names the reviewer and the digest of exactly this input; the record itself is not part of it
  const pkg = JSON.parse(await readFile(join(root, 'oracle.package.json'), 'utf8'))
  assert.equal(pkg.crossCheck.reviewedBy.inputDigest, createHash('sha256').update(input).digest('hex'))
})

test('[bend] the gate needs a current review of the translation table, and reads the analyst state table from its own source', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await mkdtemp(join(tmpdir(), 'oracle-review-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await cp(fileURLToPath(new URL('../../test-fixtures/pagination/', import.meta.url)), root, { recursive: true })
  const pkg = JSON.parse(await readFile(join(root, 'oracle.package.json'), 'utf8'))
  const gate = async (name, value) => {
    await writePackage(root, name, value)
    return crossCheckIssues({ loaded: await loadPackage(name, { root }), bin })
  }
  const unreviewed = clone(pkg)
  delete unreviewed.crossCheck.reviewedBy
  assert.ok((await gate('unreviewed.json', unreviewed)).some((issue) => issue.startsWith('cross-check-unreviewed: ')))
  // a mapping changed after the review makes the review stale
  const moved = clone(pkg)
  moved.crossCheck.dimensions.arrival.values.sequential = 'Overtaken'
  assert.ok((await gate('moved.json', moved)).some((issue) => /^cross-check-unreviewed: .*stale/.test(issue)))
  // the analyst's own state table, registered as its own source, is what the model is compared with
  await writeFile(
    join(root, 'analyst-states.md'),
    '# Analyst reading\n\n## State Model\n\n- States: showing, loading\n- Events: GO_PAGE, RESPONSE_CURRENT, RESPONSE_STALE\n\n| From | Event | To |\n| ---- | ----- | -- |\n| showing | GO_PAGE | loading |\n| loading | RESPONSE_CURRENT | showing |\n| loading | RESPONSE_STALE | loading |\n| showing | RESPONSE_STALE | showing |\n',
  )
  const split = clone(pkg)
  split.sources.push({ id: 'S6', kind: 'product-policy', jurisdiction: 'analyst state reading', standard: 'model analyst', location: 'repo:analyst-states.md', approval: 'approved' })
  split.crossCheck.states = 'S6'
  await writePackage(root, 'split.json', split)
  const result = await spaceCrossCheck({ loaded: await loadPackage('split.json', { root }), bin })
  const silent = result.candidates.filter((entry) => entry.class === 'silent-decision').map((entry) => entry.evidence.transition)
  // the analyst read a stale reply while showing as ignored, like the model; the other three remain disagreements
  assert.ok(!silent.includes('showing -RESPONSE_STALE-> showing'), silent.join(' | '))
  assert.ok(silent.includes('loading -GO_PAGE-> showing'), silent.join(' | '))
})
