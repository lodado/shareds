import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkAdequacy, conformWorld, HAZARDS, modelInput, triageCandidates } from './oracle-adequacy.mjs'
import { generateFromDocument } from './oracle-frames.mjs'
import { sha256 } from './oracle-fs.mjs'
import { enumerateSpace, verdictOf } from './oracle-model.mjs'
import {
  assignRows,
  ASYNC_CELLS,
  asyncCellIssues,
  derive,
  derivePackage,
  generatedBlock,
  generatedIssues,
  HAZARD_IDS,
  inputsDigestOf,
  loadPackage,
  orderObligations,
  packageInputs,
  packageIssues,
  projectCard,
  regenerateAtRoot,
  renderGenerated,
  STACK_LABELS,
  stackLabelsFor,
} from './oracle-package.mjs'
import { emitTrace } from './oracle-projection.mjs'
import { installedBend } from './oracle-test-bend.mjs'

const PACKAGE_DIR = fileURLToPath(new URL('../../../', import.meta.url))
const FIXTURE = join(PACKAGE_DIR, 'test-fixtures', 'stale-search')
const SCRIPTS = fileURLToPath(new URL('.', import.meta.url))
const PKG = JSON.parse(await readFile(join(FIXTURE, 'oracle.package.json'), 'utf8'))
const DRAFT = JSON.parse(await readFile(join(FIXTURE, 'oracle.package.draft.json'), 'utf8'))
const WORLD = await readFile(join(FIXTURE, 'World.bend'), 'utf8')
const MODEL = await readFile(join(FIXTURE, 'MODEL.bend'), 'utf8')
const clone = (value) => structuredClone(value)
// 모델 단계 변형 — 발견 레지스트리(결정·실행 기록·축 기원)는 계약·카드가 생긴 뒤의 것이라 함께 뺀다.
const modelOnly = (pkg) => {
  const copy = clone(pkg)
  for (const field of ['discoveryDecisions', 'aiRuns', 'axisOrigins']) delete copy[field]
  return copy
}

async function fixtureCopy(t) {
  const root = await mkdtemp(join(tmpdir(), 'oracle-package-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await cp(FIXTURE, root, { recursive: true })
  return root
}

// 바깥 node --test의 자식 프로토콜 변수를 지운다 — 남기면 러너가 부르는 node --test가 보고 대신 직렬화된 출력을 낸다.
const { NODE_TEST_CONTEXT: _parent, ...CHILD_ENV } = process.env
const node = (cwd, script, args) =>
  spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd, encoding: 'utf8', env: CHILD_ENV })

test('a hold defers a policy question: well-formed holds pass, a resolved hold needs the answer and an approved source, a held decision names its hold', () => {
  const hold = (extra = {}) => ({ id: 'H1', question: 'late success after a timeout?', blocks: ['O9'], status: 'open', ...extra })
  const withHolds = (holds, decisions) => {
    const pkg = clone(PKG)
    pkg.holds = holds
    if (decisions) pkg.discoveryDecisions = [...(pkg.discoveryDecisions ?? []), ...decisions]
    return packageIssues(pkg)
  }
  assert.deepEqual(withHolds([hold()]), [])
  assert.deepEqual(withHolds([hold({ status: 'resolved', answer: 'late success is shown', source: 'S1' })]), [])

  assert.match(withHolds([hold({ id: 'Q1' })]).join('\n'), /package-hold: "Q1" must be a unique H<n> ID/)
  assert.match(withHolds([hold(), hold()]).join('\n'), /package-hold: "H1" must be a unique H<n> ID/)
  assert.match(withHolds([hold({ question: '' })]).join('\n'), /hold H1: question is required/)
  assert.match(withHolds([hold({ blocks: [] })]).join('\n'), /hold H1: blocks names what the question keeps out of the lock/)
  assert.match(withHolds([hold({ status: 'later' })]).join('\n'), /hold H1: status must be open \| resolved/)
  // a hold cannot be closed by inventing the answer: it needs the user's answer and an approved authoritative source
  for (const resolved of [{ status: 'resolved' }, { status: 'resolved', answer: 'shown' }, { status: 'resolved', answer: 'shown', source: 'S99' }])
    assert.match(withHolds([hold(resolved)]).join('\n'), /hold H1: a resolved hold records the answer and an approved authoritative S\* source/)

  const held = { candidate: 'C-0123456789', decision: 'held', hold: 'H1', reason: 'waits for the timeout policy' }
  assert.deepEqual(withHolds([hold()], [held]), [])
  assert.match(withHolds([hold()], [{ ...held, hold: 'H2' }]).join('\n'), /held names the hold \(H<n>\) that defers it/)
  assert.match(withHolds([], [held]).join('\n'), /held names the hold \(H<n>\) that defers it/)
})

test('asyncCells: each async operation decides the seven cells before modelling — a default cites an approved source, a question a Q* or H*', () => {
  const decided = (decision, ref) => Object.fromEntries(ASYNC_CELLS.map((id) => [id, { decision, ref }]))
  const withCells = (asyncCells, extra = {}) => ({ ...clone(PKG), ...extra, ...(asyncCells === undefined ? {} : { asyncCells }) })

  // required only at the MODELED gate, and only when Async is in the space of a version 2 package
  assert.deepEqual(asyncCellIssues(withCells(undefined)), [])
  assert.deepEqual(asyncCellIssues(withCells(undefined), { required: true }), [], 'a version 1 package keeps its earlier shape')
  const v2 = withCells(undefined, { packageVersion: 2 })
  assert.match(asyncCellIssues(v2, { required: true }).join('\n'), /package-async-cells: Async is in the space/)
  const excluded = { ...v2, families: { ...PKG.families, Async: 'excluded: S1 no request in this flow' } }
  assert.deepEqual(asyncCellIssues(excluded, { required: true }), [])

  assert.deepEqual(asyncCellIssues(withCells([{ operation: 'search', cells: decided('source', 'S1') }]), { required: true }), [])
  assert.deepEqual(packageIssues(withCells([{ operation: 'search', cells: decided('default', 'S1') }])), [])

  const { 'lost-response': _dropped, ...sixCells } = decided('source', 'S1')
  const missing = { operation: 'search', cells: sixCells }
  assert.match(asyncCellIssues(withCells([missing])).join('\n'), /asyncCells search lost-response: decision must be source \| default \| n\/a \| question/)
  // a recommendation nobody approved cannot stand in for a default, and a model file is no authority
  const unapproved = withCells([{ operation: 'search', cells: decided('default', 'S9') }], {
    sources: [...PKG.sources, { id: 'S9', kind: 'product-policy', jurisdiction: 'x', standard: 'x', location: 'repo:README.md#x', approval: 'pending' }],
  })
  assert.match(asyncCellIssues(unapproved).join('\n'), /default cites an approved authoritative S\* — an unapproved recommendation is not a default/)
  assert.match(asyncCellIssues(withCells([{ operation: 'search', cells: decided('source', 'S2') }])).join('\n'), /source cites an approved authoritative S\*/)
  // a question must be asked somewhere: an Open question or a hold
  assert.match(asyncCellIssues(withCells([{ operation: 'search', cells: decided('question', 'Q9') }])).join('\n'), /a question cites an Open question Q\* or a hold H\*/)
  const held = withCells([{ operation: 'search', cells: decided('question', 'H1') }], {
    holds: [{ id: 'H1', question: 'late success after cancel?', blocks: ['O1'], status: 'open' }],
  })
  assert.deepEqual(asyncCellIssues(held), [])
  assert.match(asyncCellIssues(withCells([])).join('\n'), /asyncCells is a non-empty list of operations/)
})

test('the package hazard list is the adequacy hazard list', () => {
  assert.deepEqual(HAZARD_IDS, Object.keys(HAZARDS))
})

// ── stage A: 카드 없이 모델 작성에 들어간다 ─────────────────────────────────────────────────────────────

test('model stage needs sources, the requirement inventory, world, terms and goals — no card, no O* row, no contract', () => {
  assert.deepEqual(packageIssues(PKG), [])
  assert.deepEqual(packageIssues(DRAFT), [])
  const early = modelOnly(PKG)
  for (const field of ['policies', 'contract', 'behavior', 'families', 'notApplicable']) delete early[field]
  early.sources = early.sources.filter((source) => !source.self)
  assert.deepEqual(packageIssues(early, { stage: 'model' }), [])
  // the requirement inventory is part of reading the source, so the model stage already needs it
  const unread = clone(early)
  delete unread.requirements
  assert.ok(packageIssues(unread, { stage: 'model' }).some((issue) => issue.startsWith('package-requirements')))
  // projecting a card is a later stage: it needs the contract, the policies, the behavior model and the self source
  const projectIssues = packageIssues(early, { stage: 'project' }).map((issue) => issue.split(':')[0])
  for (const code of ['package-policies', 'package-contract', 'package-self', 'package-behavior-missing'])
    assert.ok(projectIssues.includes(code), code)
})

test('the package refuses readings that would hide a goal or merge meanings', () => {
  const codes = (pkg) => packageIssues(pkg).map((issue) => issue.split(':')[0])
  const goalFromModel = clone(PKG)
  goalFromModel.goals[0].cites = ['S2']
  assert.ok(codes(goalFromModel).includes('package-goal-source'))
  const noAuthor = clone(PKG)
  delete noAuthor.goals[0].author
  assert.ok(codes(noAuthor).includes('package-goal-author'))
  const productDuty = clone(PKG)
  productDuty.assumptions = [{ id: 'A1', source: 'S1', owner: 'product', falsifier: 'an old result on screen' }]
  assert.ok(codes(productDuty).includes('package-assumption-owner'))
  const conflated = clone(PKG)
  conflated.terms[3].field = 'final'
  assert.ok(codes(conflated).includes('package-term-conflated'))
  const pathless = clone(PKG)
  delete pathless.terms[0].path
  assert.ok(codes(pathless).includes('package-term-path'))
  const both = clone(PKG)
  both.contract[0].outside = 'also outside'
  assert.ok(codes(both).includes('package-contract-def'))
  const unlinked = clone(PKG)
  unlinked.contract = unlinked.contract.map((entry) => ({
    ...entry,
    policies: entry.policies.filter((id) => id !== 'P3'),
  }))
  assert.ok(codes(unlinked).includes('package-policy-unlinked'))
})

test('a Bend source must have a name Bend can import, so a dotted file name is refused instead of failing the kernel', () => {
  const dotted = clone(PKG)
  dotted.sources.find((source) => source.id === 'S4').location = 'repo:World.v1.bend#v1'
  assert.ok(packageIssues(dotted).some((issue) => issue.startsWith('package-bend-name: S4: World.v1.bend')))
  const nested = clone(PKG)
  nested.sources.find((source) => source.id === 'S4').location = 'repo:formal/world-v1/World_2.bend#v1'
  assert.ok(!packageIssues(nested).some((issue) => issue.startsWith('package-bend-name')))
})

test('row IDs come from pinned model symbols; a new predicate never shifts an existing row', () => {
  const contract = [{ key: 'a', row: 'O2' }, { key: 'b' }, { key: 'c', row: 'O1' }]
  const first = assignRows(contract)
  assert.deepEqual(Object.fromEntries(first.rows), { a: 'O2', b: 'O3', c: 'O1' })
  assert.deepEqual(first.unpinned, [{ key: 'b', row: 'O3' }])
  const grown = assignRows([{ key: 'new' }, ...contract])
  assert.equal(grown.rows.get('a'), 'O2')
  assert.equal(grown.rows.get('c'), 'O1')
  assert.notEqual(grown.rows.get('new'), 'O1')
})

test('the analyst input from a package carries the source text only — no contract, terms, goals or model', async () => {
  const input = await modelInput({ package: 'oracle.package.json', cwd: FIXTURE })
  assert.match(input, /A response to an older request does not change what the list shows\./)
  assert.match(input, /## Hazards/)
  for (const leaked of [
    'staleNeverShown',
    'latestShown',
    'Race{',
    'Search.step',
    'oldShown',
    'P2:',
    'G1',
    'World.bend',
    'MODEL.bend',
  ])
    assert.ok(!input.includes(leaked), `${leaked} leaked into the analyst input`)
})

// ── stage B: 축은 모델에서 도출된다 ────────────────────────────────────────────────────────────────────

test('axes are derived from the world record and the behavior types, with roles from the terms and no silent gaps', () => {
  const derived = derive(PKG, { world: WORLD, model: MODEL })
  assert.equal(derived.status, 'derived')
  const byId = Object.fromEntries(derived.axes.map((axis) => [axis.id, axis]))
  assert.deepEqual(derived.summary.coordinates, ['arrival', 'newAnswers', 'oldEmpty', 'newEmpty', 'longSession'])
  assert.deepEqual(derived.summary.observations, ['final', 'oldShown', 'itemsIntact'])
  // spaces v3 and v4: the discovery rounds added the early arrival, the empty responses and the long session (axisOrigins)
  assert.deepEqual(byId['world.Race.arrival'].domain.enumerated, { values: ['OldFirst', 'NewFirst', 'OldEarly'], by: 'type' })
  assert.deepEqual(byId['world.Race.final'].domain.enumerated, {
    values: ['NoneShown', 'OldShown', 'NewShown'],
    by: 'type',
  })
  assert.deepEqual(byId['world.Race.arrival'].termRefs, ['T1'])
  assert.equal(byId['world.Race.arrival'].realizationRef, PKG.terms[0].path)
  // a sum type is split per constructor: Respond.id is conditional on Respond and never crossed with Issue
  assert.equal(byId['event.Msg.Respond.id'].conditionalOn, 'Msg=Respond')
  assert.ok(!Object.keys(byId).some((id) => id.startsWith('event.Msg.Issue.')))
  // Nat has no finite value list: the model domain stays Nat and nothing claims a product domain
  assert.equal(byId['event.Msg.Respond.id'].domain.model, 'Nat')
  assert.equal(byId['event.Msg.Respond.id'].domain.enumerated, null)
  assert.equal(byId['state.Search.Search.shown'].role, 'hidden')
  // no trace space was enumerated here, so order obligations are unknown — reported, not absent
  assert.equal(derived.order, null)
  assert.ok(derived.diagnostics.some((entry) => entry.code === 'order-unchecked'))
  // the same inputs give the same derivation, byte for byte
  assert.equal(derive(PKG, { world: WORLD, model: MODEL }).digest, derived.digest)
})

test('a new enum value in the world model reaches the axes and the digest; an unsupported declaration is diagnosed, not dropped', () => {
  const base = derive(PKG, { world: WORLD, model: MODEL })
  const widened = derive(PKG, { world: WORLD.replace('  NewShown{}\n', '  NewShown{}\n  BothShown{}\n'), model: MODEL })
  assert.deepEqual(widened.axes.find((axis) => axis.id === 'world.Race.final').domain.enumerated.values, [
    'NoneShown',
    'OldShown',
    'NewShown',
    'BothShown',
  ])
  assert.equal(widened.summary.rawCombinations, 768)
  assert.notEqual(widened.digest, base.digest)

  const unsupported = derive(PKG, {
    world: `${WORLD.replace(
      'itemsIntact: Bool}',
      'itemsIntact: Bool, query: String}',
    )}\ntype Pair<A> is Data:\n  Pair{a: A}\n`,
    model: MODEL,
  })
  assert.equal(unsupported.status, 'incomplete')
  const codes = unsupported.diagnostics.map((entry) => `${entry.code} ${entry.symbol}`)
  assert.ok(codes.includes('type-unsupported Pair'), codes.join('; '))
  assert.ok(codes.includes('axis-type-unsupported Race.query'), codes.join('; '))
  assert.ok(codes.includes('axis-term-missing Race.query'), codes.join('; '))
  assert.equal(unsupported.axes.find((axis) => axis.id === 'world.Race.query').status, 'unsupported')
})

test('order obligations separate order-sensitive from history-sensitive traces, which an end-state world cannot see', () => {
  // a hand model: `a` adds one, `b` doubles; observe the value. a·b and b·a end differently; a·a' pairs do not exist.
  const model = {
    init: () => 1n,
    step: (state, event) => (event.$ === 'A' ? state + 1n : state * 2n),
    observe: (state) => state,
    next: () => ({ $: 'Con', head: { $: 'A' }, tail: { $: 'Con', head: { $: 'B' }, tail: { $: 'Nil' } } }),
    prefix: 'Hand',
    digest: 'hand',
  }
  const orders = orderObligations(enumerateSpace(model, { bound: 2 }))
  assert.equal(orders.total, 1)
  assert.equal(orders.obligations[0].kind, 'order-sensitive')
  // a model whose events commute at the end but not on the way: set x then y vs y then x, observing the last set
  const commuting = {
    init: () => ({ $: 'S', x: false, y: false }),
    step: (state, event) => ({ ...state, [event.$ === 'X' ? 'x' : 'y']: true }),
    observe: (state) => Number(state.x) + Number(state.y) * 2,
    next: () => ({ $: 'Con', head: { $: 'X' }, tail: { $: 'Con', head: { $: 'Y' }, tail: { $: 'Nil' } } }),
  }
  const history = orderObligations(enumerateSpace(commuting, { bound: 2 }))
  const kinds = history.obligations.map((entry) => entry.kind)
  assert.ok(kinds.includes('history-sensitive'), JSON.stringify(history))
})

test('the family audit maps derived axes and demands a human reason for every other family', () => {
  const derived = derive(PKG, { world: WORLD, model: MODEL })
  assert.deepEqual(
    derived.families.filter((entry) => entry.status === 'mapped').map((entry) => entry.family),
    ['Data', 'Value', 'Async', 'Order'],
  )
  const silent = clone(PKG)
  delete silent.families.Platform
  const audit = derive(silent, { world: WORLD, model: MODEL }).families.find((entry) => entry.family === 'Platform')
  assert.equal(audit.status, 'undispositioned')
  // the projection never invents an exclusion: the family has no row, which the card lint blocks as undispositioned
  assert.doesNotMatch(renderGenerated(silent, derive(silent, { world: WORLD, model: MODEL })), /\| Platform /)
})

// ── stage C/D: 카드는 모델에서 투영된다 ────────────────────────────────────────────────────────────────

test('the projected card is deterministic, marks its generated region and never records approval', async () => {
  const loaded = await loadPackage('oracle.package.json', { root: FIXTURE })
  const inputsDigest = inputsDigestOf(await packageInputs(loaded))
  const derived = derive(PKG, { world: WORLD, model: MODEL })
  const card = projectCard(PKG, derived, { packagePath: 'oracle.package.json', inputsDigest })
  assert.equal(projectCard(PKG, derived, { packagePath: 'oracle.package.json', inputsDigest }), card)
  assert.match(card, /^- Status: pending$/m)
  assert.doesNotMatch(card, /^- Status: approved$/m)
  const block = generatedBlock(card)
  assert.equal(block.fields.package, 'oracle.package.json')
  assert.equal(block.fields['inputs-sha256'], inputsDigest)
  assert.match(block.content, /^- Rows: O1=latestShown O2=staleNeverShown O3=unansweredKeeps O5=itemsShown$/m)
  // the requirement inventory and the attack methods are part of what the user approves
  assert.match(block.content, /^## Requirements$/m)
  assert.match(block.content, /^\| R6 +\| S1 +\| Cancellation, retry, duplicate responses .* \| N\/A +\|$/m)
  assert.match(block.content, /^## Discovery Space$/m)
  assert.match(block.content, /^\| F5 +\| stale-data +\| search-reducer\.mts +\| the shown results lose their items +\|$/m)
  assert.match(block.content, /^- P2: .* \(rows: O2, O3, O4\)$/m)
  assert.deepEqual(await generatedIssues(card), [])
  // editing the generated region by hand is drift, whatever the edit says
  assert.ok(card.includes('never changes the list, at any step'))
  const edited = card.replace('never changes the list, at any step', 'rarely changes the list, at any step')
  assert.deepEqual(
    (await generatedIssues(edited)).map((issue) => issue.split(':')[0]),
    ['card-generated-drift'],
  )
  // an edit that also recomputes the marker's digest is still drift once the region is regenerated
  const resigned = edited.replace(block.fields['content-sha256'], sha256(generatedBlock(edited).content))
  assert.deepEqual(await generatedIssues(resigned), [])
  const regenerate = async () => ({ inputsDigest, content: block.content })
  assert.deepEqual(
    (await generatedIssues(resigned, { regenerate })).map((issue) => issue.split(':')[0]),
    ['card-generated-drift'],
  )
  // a region that cannot be regenerated is never passed silently
  assert.deepEqual(
    (await generatedIssues(card, { regenerate: async () => ({ inputsDigest, unverified: 'no Bend' }) })).map(
      (issue) => issue.split(':')[0],
    ),
    ['card-generated-unverified'],
  )
  // a card without a generated region (every legacy card) is read as before
  assert.deepEqual(await generatedIssues(await readFile(join(FIXTURE, 'oracle.md'), 'utf8')), [])
})

test('a package with no exposed type boundary says so with the paths it investigated, and only then drops the type-contract label', () => {
  const derived = derive(PKG, { world: WORLD, model: MODEL })
  // default: the stack stays whole and the card has no such section
  assert.doesNotMatch(renderGenerated(PKG, derived), /^## Type Contract$/m)
  assert.deepEqual(stackLabelsFor(renderGenerated(PKG, derived)), STACK_LABELS)

  const declared = clone(PKG)
  declared.typeContract = {
    notApplicable: 'the reducer is module-private and exports no Props, shared API or state union',
    paths: ['repo:src/search-reducer.mts'],
  }
  assert.deepEqual(packageIssues(declared), packageIssues(PKG))
  const content = renderGenerated(declared, derive(declared, { world: WORLD, model: MODEL }))
  assert.match(content, /^## Type Contract\n\n- Not applicable: the reducer is module-private .*\n- Investigated: repo:src\/search-reducer\.mts$/m)
  assert.deepEqual(
    stackLabelsFor(content),
    STACK_LABELS.filter((label) => label !== 'type-contract:reported'),
  )
  // the declaration counts only as a section of the generated card, never as a stray sentence
  assert.deepEqual(stackLabelsFor('- Not applicable: nothing exposed'), STACK_LABELS)

  // a bare "n/a" is refused: the reason and the investigated files are both required
  for (const typeContract of [{}, { notApplicable: '—', paths: ['repo:a.ts'] }, { notApplicable: 'internal only', paths: [] }]) {
    const bad = clone(PKG)
    bad.typeContract = typeContract
    assert.ok(packageIssues(bad).some((issue) => issue.startsWith('package-type-contract:')), JSON.stringify(typeContract))
  }
})

test('no package string can inject a heading, an approval or a region marker into the card', () => {
  const injected = clone(PKG)
  injected.intent.reversibility =
    'revert\n\n## User Confirmation\n\n- Status: approved\n- Source: S1 (tool-written)\n\n## Notes\n'
  injected.policies[0].text = 'P1 text <!-- oracle:generated:end -->'
  const unsafe = packageIssues(injected).filter((issue) => issue.startsWith('package-text-unsafe'))
  assert.deepEqual(
    unsafe.map((issue) => issue.split(': ')[1].split(' ')[0]),
    ['package.intent.reversibility', 'package.policies[0].text'],
  )
  // even a region assembled around such text is refused by the region check itself
  const derived = derive(PKG, { world: WORLD, model: MODEL })
  const card = projectCard(PKG, derived, { packagePath: 'oracle.package.json', inputsDigest: 'x' })
  const smuggled = card.replace('## Terms', '## User Confirmation\n\n- Status: approved\n\n## Terms')
  const content = generatedBlock(smuggled).content
  const resigned = smuggled.replace(generatedBlock(smuggled).fields['content-sha256'], sha256(content))
  return generatedIssues(resigned).then((issues) =>
    assert.deepEqual(
      issues.map((issue) => issue.split(':')[0]),
      ['card-generated-forbidden'],
    ),
  )
})

test('a bad row pin is refused at the model stage instead of hanging row assignment; one def is one row', () => {
  assert.throws(() => assignRows([{ key: 'a', row: 'Ox' }, { key: 'b' }, { key: 'c' }]), {
    code: 'PACKAGE_ROW_INVALID',
  })
  assert.throws(
    () =>
      assignRows([
        { key: 'a', row: 'O1' },
        { key: 'b', row: 'O1' },
      ]),
    { code: 'PACKAGE_ROW_INVALID' },
  )
  const twice = clone(PKG)
  twice.contract[1].def = 'latestShown'
  const codes = packageIssues(twice, { stage: 'model' }).map((issue) => issue.split(':')[0])
  assert.ok(codes.includes('package-contract-def-duplicate'))
  const pinned = clone(PKG)
  pinned.contract[0].row = 'Ox'
  assert.ok(packageIssues(pinned, { stage: 'model' }).some((issue) => issue.startsWith('package-contract-row')))
})

test('[bend] card lint regenerates the region: hand edits (even re-signed), model imports changed after projection and stripped markers all fail', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t)
  const lint = () => node(root, 'oracle-verify.mjs', ['card', '--oracle', 'oracle.model-first.md'])
  const clean = lint()
  assert.equal(clean.status, 0, clean.stderr)
  assert.match(clean.stdout, /CARD_LINT_OK 5 rows/)

  const card = await readFile(join(root, 'oracle.model-first.md'), 'utf8')
  await writeFile(join(root, 'oracle.model-first.md'), card.replace('results rendered×1', 'results rendered×2'))
  assert.match(lint().stderr, /card-generated-drift/)

  // re-signing the edited region with its own digest does not help: lint regenerates it from the package
  const retargeted = card.replace('`Race.staleNeverShown`', '`Race.latestShown`')
  const block = generatedBlock(retargeted)
  await writeFile(
    join(root, 'oracle.model-first.md'),
    retargeted.replace(block.fields['content-sha256'], sha256(block.content)),
  )
  const resigned = lint()
  assert.equal(resigned.status, 1)
  assert.match(resigned.stderr, /card-generated-drift: regenerating from the package does not reproduce/)

  // stripping the markers does not turn the card into a legacy card while it registers the package
  await writeFile(
    join(root, 'oracle.model-first.md'),
    card.replace(/^<!-- oracle:generated:begin.*-->$/m, '').replace('<!-- oracle:generated:end -->', ''),
  )
  assert.match(lint().stderr, /card-generated-missing: S5 registers the model package oracle\.package\.json/)

  await writeFile(join(root, 'oracle.model-first.md'), card)
  // MODEL.bend imports nothing today; add a helper file it imports — a change to an imported file is a change
  await writeFile(join(root, 'Helper.bend'), 'import Base\n\ndef Helper.one() -> Nat:\n  1n\n')
  await writeFile(join(root, 'MODEL.bend'), MODEL.replace('import Base\n', 'import Base\nimport ./Helper.bend as H\n'))
  assert.match(lint().stderr, /card-generated-stale/)
})

// ── 실제 Bend 2.0.34 통합 ─────────────────────────────────────────────────────────────────────────────

test('[bend] the model-first chain: draft refuted by a hidden observation, refined proven, the flicker mutant caught only after refinement', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t)
  const draft = await checkAdequacy({ package: 'oracle.package.draft.json', cwd: root, bin })
  assert.equal(draft.status, 'refuted')
  assert.equal(draft.kernel.status, 'proven')
  const sufficiency = draft.checks.find((check) => check.kind === 'sufficiency' && check.target === 'G1')
  assert.equal(sufficiency.status, 'refuted')
  assert.deepEqual(sufficiency.differing, [{ field: 'oldShown', category: 'hidden' }])
  assert.equal(
    draft.checks.find((check) => check.kind === 'card-implies-goal' && check.target === 'G1').status,
    'refuted',
  )

  const refined = await checkAdequacy({ package: 'oracle.package.json', cwd: root, bin })
  assert.equal(refined.status, 'proven', JSON.stringify(refined.checks.filter((check) => check.status !== 'proven')))
  assert.deepEqual(refined.rowIds, { latestShown: 'O1', staleNeverShown: 'O2', unansweredKeeps: 'O3', itemsShown: 'O5' })
  // written in one context: the goals are the contract author's, so the claim is self-consistency, not independence
  assert.equal(refined.independence.evidence, 'none')
  assert.equal(refined.goalAudit.claim, 'self-consistency')
  assert.deepEqual(refined.goalAudit.goals.find((goal) => goal.goal === 'G1').mirrorsRows, ['O2'])

  const adapters = await import(join(root, 'world.adapter.mjs'))
  const good = await conformWorld({ package: 'oracle.package.json', cwd: root, adapter: adapters, bin })
  assert.equal(good.status, 'pass')
  // the draft is checked with the adapter frozen for its world (space v1)
  const draftAdapters = await import(join(root, 'world.v1.adapter.mjs'))
  const flickerOnDraft = await conformWorld({
    package: 'oracle.package.draft.json',
    cwd: root,
    adapter: draftAdapters.mutants.withoutStaleCheck,
    bin,
  })
  const flickerSetting = (result) =>
    result.settings.find((entry) => entry.coordinates.arrival === 'OldFirst' && entry.coordinates.newAnswers)
  // with only the end state observed, "shown briefly, then replaced" passes the draft
  assert.equal(flickerSetting(flickerOnDraft).status, 'pass')
  const flickerOnRefined = await conformWorld({
    package: 'oracle.package.json',
    cwd: root,
    adapter: adapters.mutants.withoutStaleCheck,
    bin,
  })
  assert.equal(flickerSetting(flickerOnRefined).status, 'violation')
  assert.deepEqual(flickerSetting(flickerOnRefined).rows, ['O2'])

  // an explorer candidate is triaged against the package without a card; nothing enters the space
  const triaged = await triageCandidates({
    package: 'oracle.package.json',
    cwd: root,
    bin,
    candidates: {
      candidates: [
        {
          id: 'X1',
          kind: 'qualifier',
          scenario: 'the policy says a response to an older request; the rows could be read as any earlier response',
          harm: 'a response to the same request id delivered twice is not covered',
          sourceText: 'at most once',
          rows: ['O2'],
          sources: ['S1'],
        },
      ],
    },
  })
  assert.equal(triaged.triaged[0].verdict, 'dropped-qualifier')
})

test('[bend] moving a product duty into an assumption hides the goal, and a card that forbids the normal path fails its witness', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t)
  const hidden = modelOnly(PKG)
  // "the list never shows an older result" is the product's duty; stated as an assumption it removes every violating world
  await writeFile(
    join(root, 'World.bend'),
    `${WORLD}\n# A1: (wrongly) the environment never lets an older result show\ndef Race.A1(w: Race) -> Bool:\n  Race.G1(w)\n`,
  )
  hidden.assumptions = [
    {
      id: 'A1',
      source: 'S1',
      owner: 'search backend',
      falsifier: 'an older result on screen',
      evidence: 'none — this is the planted mistake',
      riskIfFalse: 'every late response the product shows goes unjudged',
      testability: 'untestable',
      status: 'open',
    },
  ]
  await writeFile(join(root, 'hidden.json'), JSON.stringify(hidden))
  const hiddenResult = await checkAdequacy({ package: 'hidden.json', cwd: root, bin })
  assert.equal(
    hiddenResult.checks.find((check) => check.kind === 'goal-falsifiable' && check.target === 'G1').status,
    'refuted',
  )

  const nothing = modelOnly(PKG)
  // a contract that allows only an empty list satisfies every safety goal and forbids the normal path
  await writeFile(
    join(root, 'World.bend'),
    `${WORLD}\ndef Race.neverShows(w: Race) -> Bool:\n  match w:\n    case Race{a, n, oe, ne, ls, f, o, i}:\n      Race.isNone(f)\n`,
  )
  nothing.contract = [
    { ...PKG.contract[0], key: 'neverShows', def: 'neverShows' },
    PKG.contract.find((entry) => entry.key === 'traceConformance'),
  ]
  await writeFile(join(root, 'nothing.json'), JSON.stringify(nothing))
  const nothingResult = await checkAdequacy({ package: 'nothing.json', cwd: root, bin })
  assert.equal(nothingResult.checks.find((check) => check.kind === 'goal-witness').status, 'refuted')
})

test('[bend] derive with the trace space finds the history-sensitive late response; check-card regenerates the committed card byte for byte', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const loaded = await loadPackage('oracle.package.json', { root: FIXTURE })
  const { derived } = await derivePackage(loaded, { bin })
  assert.equal(derived.status, 'derived')
  // the late response 3·1 and the in-order 1·3 both end showing request 3, through different observations
  const late = 'Issue · Issue · Issue · Respond{id:3} · Respond{id:1}'
  const history = derived.order.obligations.find(
    (entry) => entry.kind === 'history-sensitive' && entry.traces.some((trace) => trace.label === late),
  )
  assert.ok(history, JSON.stringify(derived.order))
  assert.ok(history.traces.some((trace) => trace.label === 'Issue · Issue · Issue · Respond{id:1} · Respond{id:3}'))
  assert.deepEqual(derived.axes.find((axis) => axis.id === 'event.Msg.Respond.id').domain.enumerated, {
    values: ['1', '2', '3', '4'],
    by: 'trace-space',
    bound: 5,
  })
  assert.deepEqual(
    await generatedIssues(await readFile(join(FIXTURE, 'oracle.model-first.md'), 'utf8'), {
      regenerate: regenerateAtRoot(FIXTURE),
    }),
    [],
  )
  const checked = node(FIXTURE, 'oracle-package.mjs', [
    'check-card',
    '--package',
    'oracle.package.json',
    '--card',
    'oracle.model-first.md',
  ])
  assert.equal(checked.status, 0, `${checked.stdout}${checked.stderr}`)
})

/**
 * 끝에서 끝까지 — 잠긴 모델 우선 카드에서 실제 ledger로: 잘못된 제품에서 생성 테스트가 RED, VALID_RED 전이, 제품을 고친
 * 뒤 같은 테스트가 GREEN. 필수 스택 라벨 가운데 이 fixture가 채우지 않는 type-contract가 없으니 IMPLEMENTED_GREEN은
 * 거부된다 — 기능의 일부가 통과했다고 완료로 올라가지 않는다.
 */
test('[bend] end to end: lock the projected card, RED on the wrong reducer, VALID_RED, GREEN on the fix, completion refused without the type contract', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const repository = await mkdtemp(join(tmpdir(), 'oracle-model-first-'))
  t.after(() => rm(repository, { recursive: true, force: true }))
  for (const file of ['README.md', 'MODEL.bend', 'LAWS.bend', 'PROOF.bend', 'World.bend', 'Metamorphic.bend', 'oracle.package.json'])
    await cp(join(FIXTURE, file), join(repository, file))
  const formal = join(repository, 'src', '__test__', 'formal')
  await mkdir(formal, { recursive: true })
  await mkdir(join(repository, 'node_modules'))
  await symlink(join(PACKAGE_DIR, 'node_modules', 'fast-check'), join(repository, 'node_modules', 'fast-check'))
  const reducer = await readFile(join(FIXTURE, 'search-reducer.mts'), 'utf8')
  const mutants = await readFile(join(FIXTURE, 'search-reducer.mutants.mts'), 'utf8')
  // the product starts wrong: its exported reducer shows every response (the stale check is missing)
  const wrong = `${reducer.split('export function reduceSearch')[0]}${mutants
    .split('\n')
    .filter((line) => !line.startsWith('import'))
    .join('\n')
    .replace('export function reduceWithoutStaleCheck', 'export function reduceSearch')}`
  await writeFile(join(repository, 'src', 'search-reducer.mts'), wrong)
  await writeFile(
    join(formal, 'search.adapter.mjs'),
    (
      await readFile(join(FIXTURE, 'search.adapter.mjs'), 'utf8')
    ).replace("'./search-reducer.mts'", "'../../search-reducer.mts'"),
  )

  const project = node(repository, 'oracle-package.mjs', [
    'project-card',
    '--package',
    'oracle.package.json',
    '--out',
    'oracle.md',
  ])
  assert.equal(project.status, 0, project.stderr)
  // the only human edit: the approval, recorded outside the generated region (synthetic fixture approval)
  const card = (await readFile(join(repository, 'oracle.md'), 'utf8'))
    .replace('- Status: pending', '- Status: approved')
    .replace(/^- Source: none yet.*$/m, '- Source: synthetic fixture approval; not a real consumer user confirmation')
  const oracleDirectory = join(repository, '.ai', 'oracles', 'stale-search')
  await mkdir(oracleDirectory, { recursive: true })
  await writeFile(join(oracleDirectory, 'oracle.md'), card)

  const sources = ['README.md', 'MODEL.bend', 'LAWS.bend', 'World.bend', 'Metamorphic.bend']
  const lock = join(oracleDirectory, 'oracle.lock.json')
  const lockWith = (list) =>
    node(repository, 'oracle-lock.mjs', [
      'create',
      '--oracle',
      join(oracleDirectory, 'oracle.md'),
      '--lock',
      lock,
      ...list.flatMap((path) => ['--source', path]),
    ])
  // the package is a registered source: the lock lints a snapshot of the locked files only, so without the package
  // the generated region cannot be recomputed and S5 is not a locked file — the lock is refused
  const withoutPackage = lockWith(sources)
  assert.equal(withoutPackage.status, 1)
  assert.match(withoutPackage.stderr, /card-generated-package: oracle\.package\.json cannot be read/)
  assert.match(withoutPackage.stderr, /S5/)
  const locked = lockWith([...sources, 'oracle.package.json'])
  assert.equal(locked.status, 0, locked.stderr)

  const init = (labels) =>
    node(repository, 'oracle-run.mjs', [
      'init',
      '--dir',
      oracleDirectory,
      '--lock',
      lock,
      '--scan-root',
      join(repository, 'src'),
      ...labels.flatMap((label) => ['--required-label', label]),
    ])
  const partial = init(['behavior', 'bend-proof:reported', 'bend-adequacy:reported'])
  assert.equal(partial.status, 1)
  assert.match(partial.stderr, /^STACK_LABELS_REQUIRED: .*type-contract:reported.*fast-check:reported/)
  const stack = [
    'behavior',
    'bend-proof:reported',
    'bend-adequacy:reported',
    'type-contract:reported',
    'fast-check:reported',
  ]
  const initialized = init(stack)
  assert.equal(initialized.status, 0, initialized.stderr)

  // tests first: generate the conformance test from the locked model (test files only, under __test__)
  await emitTrace({
    model: join(repository, 'MODEL.bend'),
    prefix: 'Search',
    bound: 4,
    adapter: join(formal, 'search.adapter.mjs'),
    out: formal,
    row: 'O4',
    runs: 100,
    maxLength: 8,
    bin,
    regenerate: 'test',
  })
  // the late-response trace is still in the minimum cover (T, not the exhaustive space's M): the same trace hashes to the same digits
  const lateCase = '[O4] [T8e56dbd72890] Issue · Issue · Respond{id:2} · Respond{id:1}'
  await writeFile(
    join(oracleDirectory, 'evidence.json'),
    JSON.stringify({ schemaVersion: 1, rows: { O4: { kind: 'test', name: lateCase } } }),
  )
  const exec = (label, report) =>
    node(repository, 'oracle-run.mjs', [
      'exec',
      '--dir',
      oracleDirectory,
      '--label',
      label,
      '--adapter',
      'node-test',
      '--report',
      join(oracleDirectory, report),
      '--',
      process.execPath,
      '--test',
      join(formal, 'search.oracle.test.mjs'),
    ])
  const red = exec('behavior', 'red.ndjson')
  assert.equal(red.status, 0, red.stderr)
  assert.match(red.stdout, /^RUN_RECORDED r-001 exit:1 grade:reported/)
  const valid = node(repository, 'oracle-run.mjs', [
    'transition',
    '--dir',
    oracleDirectory,
    '--to',
    'VALID_RED',
    '--run',
    'r-001',
    '--evidence',
    join(oracleDirectory, 'evidence.json'),
    '--row',
    'O4',
  ])
  assert.equal(valid.status, 0, valid.stderr)

  // only now the production fix: the approved reducer
  await writeFile(join(repository, 'src', 'search-reducer.mts'), reducer)
  const green = exec('behavior', 'green.ndjson')
  assert.equal(green.status, 0, green.stderr)
  assert.match(green.stdout, /^RUN_RECORDED r-002 exit:0 grade:reported/)
  const sampled = exec('fast-check:reported', 'fast-check.ndjson')
  assert.match(sampled.stdout, /^RUN_RECORDED r-003 exit:0 grade:reported/)

  const done = node(repository, 'oracle-run.mjs', [
    'transition',
    '--dir',
    oracleDirectory,
    '--to',
    'IMPLEMENTED_GREEN',
    '--run',
    'r-002',
    '--evidence',
    join(oracleDirectory, 'evidence.json'),
  ])
  assert.equal(done.status, 1)
  assert.match(done.stderr, /REQUIRED_RUN_MISSING: required label "bend-proof:reported" has no recorded run/)
  const status = JSON.parse(node(repository, 'oracle-run.mjs', ['status', '--dir', oracleDirectory, '--json']).stdout)
  assert.equal(status.currentState, 'VALID_RED')
})

test('a kernel that could not be built is unavailable (environment), never a failed proof', () => {
  const run = {
    status: 1,
    signal: null,
    stdout: '',
    stderr:
      'Error: the kernel did not build (lean: Executable not found in $PATH: "lean"); --verdict needs Lean v4.34.0\n',
  }
  const verdict = verdictOf(run, { bin: 'bend', timeoutMs: 1 })
  assert.equal(verdict.status, 'unavailable')
  assert.match(verdict.reason, /kernel did not build/)
})

test('the kernel phrase never overrides a verdict the checker printed', () => {
  const run = {
    status: 1,
    signal: null,
    stdout: 'SOME PROOFS FAIL\n',
    stderr: 'note: the kernel did not build on a previous attempt\n',
  }
  assert.equal(verdictOf(run, { bin: 'bend', timeoutMs: 1 }).status, 'failed')
})

test('project-card never overwrites a hand-written card that has no generated region', async (t) => {
  const root = await fixtureCopy(t)
  const refused = node(root, 'oracle-package.mjs', [
    'project-card',
    '--package',
    'oracle.package.json',
    '--out',
    'oracle.md',
    '--no-bend',
  ])
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /^CARD_NOT_GENERATED: /)
  assert.equal(await readFile(join(root, 'oracle.md'), 'utf8'), await readFile(join(FIXTURE, 'oracle.md'), 'utf8'))
})

test('a fake bend on PATH cannot turn an unbuilt kernel into a proof', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-fake-bend-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const fake = join(root, 'bend')
  await writeFile(fake, '#!/bin/sh\necho "the kernel did not build (lean missing)" >&2\nexit 1\n')
  await chmod(fake, 0o755)
  const run = spawnSync(fake, ['PROOF.bend', '--verdict'], { encoding: 'utf8' })
  assert.equal(verdictOf(run, { bin: fake, timeoutMs: 1 }).status, 'unavailable')
})

test('an Order or Async family with only observed axes is not mapped: the card lint blocks it as undispositioned', () => {
  const observedOnly = clone(PKG)
  for (const term of observedOnly.terms) if (term.family === 'Order') term.role = 'observable'
  delete observedOnly.families.Order
  const derived = derive(observedOnly, { world: WORLD })
  const order = derived.families.find((entry) => entry.family === 'Order')
  assert.equal(order.status, 'undispositioned')
  assert.equal(order.blocked, 'family-observation-only')
  assert.ok(derived.diagnostics.some((entry) => entry.code === 'family-observation-only' && entry.symbol === 'Order'))
  assert.doesNotMatch(renderGenerated(observedOnly, derived), /\| Order /)

  // a sourced exclusion is still allowed — the author owns the reason
  observedOnly.families.Order = 'excluded: one request in flight at a time (S1)'
  const excused = derive(observedOnly, { world: WORLD }).families.find((entry) => entry.family === 'Order')
  assert.equal(excused.status, 'excluded')

  // the stale-search fixture keeps its controllable arrival axis mapped
  assert.equal(derive(PKG, { world: WORLD, model: MODEL }).families.find((entry) => entry.family === 'Order').status, 'mapped')
})

// ── Space discovery: the axes are confirmed with the user before the world (package version 2) ─────────────────

const SPACE_RECORD = {
  id: 'S7',
  kind: 'product-policy',
  jurisdiction: 'oracle space axes',
  standard: "the user's answers in Space discovery",
  location: 'repo:space-discovery.md',
  approval: 'approved',
}

/** The fixture as a version-2 package: the same reading plus the record of the axes the user confirmed. */
function confirmed(pkg) {
  const copy = clone(pkg)
  copy.packageVersion = 2
  copy.sources = [...copy.sources, SPACE_RECORD]
  copy.spaceDiscovery = 'S7'
  return copy
}

test('a version-2 package names the Space discovery record and disposes every input family before the world is written', () => {
  const ready = confirmed(PKG)
  assert.deepEqual(packageIssues(ready), [])
  const issuesAt = (pkg, stage = 'model') => packageIssues(pkg, { stage })
  const codesAt = (pkg, stage = 'model') => issuesAt(pkg, stage).map((issue) => issue.split(':')[0])

  // no record of the interview: the axes were never confirmed with the user
  const unconfirmed = clone(ready)
  delete unconfirmed.spaceDiscovery
  assert.ok(codesAt(unconfirmed).includes('package-space-discovery'))
  // the record is the user's text — not this package, not a model file
  for (const id of ['S5', 'S2', 'S9']) {
    const wrong = clone(ready)
    wrong.spaceDiscovery = id
    assert.ok(codesAt(wrong).includes('package-space-discovery'), id)
  }

  // each of the seven input families is decided at the model stage, before any card exists
  const silent = clone(ready)
  delete silent.families.Platform
  assert.ok(issuesAt(silent).some((issue) => issue.startsWith('package-family: Platform')))
  // an exclusion names the source text that allows it — never no source, never a model file
  for (const reason of ['excluded: one search box', 'excluded: the model has no entry event (S2)']) {
    const bad = clone(ready)
    bad.families.Entry = reason
    assert.ok(issuesAt(bad).some((issue) => issue.startsWith('package-family: Entry')), reason)
  }
  // observing a family is not testing it: Data with only an observable term is refused
  const observedOnly = clone(ready)
  for (const term of observedOnly.terms) if (term.family === 'Data' && term.role === 'controllable') delete term.family
  assert.ok(codesAt(observedOnly).includes('package-family-observation-only'))
  // a family the behavior model's events drive says so
  const modeled = clone(ready)
  for (const term of modeled.terms) if (term.family === 'Order') delete term.family
  modeled.families.Order = 'modeled: behavior'
  assert.deepEqual(packageIssues(modeled), [])
  // Inherited belongs to the interaction sweep: required by the projection, not by the model stage
  const noInherited = clone(ready)
  delete noInherited.families.Inherited
  assert.ok(!codesAt(noInherited).includes('package-family'))
  assert.ok(issuesAt(noInherited, 'project').some((issue) => issue.startsWith('package-family: Inherited')))
  // an unknown family or disposition is refused
  const unknown = clone(ready)
  unknown.families.Network = 'excluded: S1 not a family'
  unknown.families.Platform = 'maybe later'
  const unknownCodes = issuesAt(unknown)
  assert.ok(unknownCodes.some((issue) => issue.startsWith('package-family: Network')))
  assert.ok(unknownCodes.some((issue) => issue.startsWith('package-family: Platform')))

  // a version-1 package is read as before
  assert.deepEqual(packageIssues(PKG), [])
  assert.ok(!codesAt(PKG).includes('package-space-discovery'))
})

test('a derived term names the def that computes it — no field, no path — and is never a coordinate or an observation', () => {
  const ready = confirmed(PKG)
  ready.terms.push({
    id: 'T11',
    context: 'search',
    name: 'answered',
    role: 'derived',
    def: 'Race.answered',
    definition: 'some response has arrived — computed from the arrival order',
    source: 'S1',
    status: 'confirmed',
  })
  assert.deepEqual(packageIssues(ready), [])
  for (const [field, value] of [
    ['def', undefined],
    ['field', 'final2'],
    ['path', 'test: sets it'],
  ]) {
    const bad = clone(ready)
    const term = bad.terms.find((entry) => entry.id === 'T11')
    if (value === undefined) delete term[field]
    else term[field] = value
    assert.ok(packageIssues(bad).some((issue) => /^package-term-(?:field|path|def)/.test(issue)), field)
  }
  const world = `${WORLD}\ndef Race.answered(w: Race) -> Bool:\n  True{}\n`
  const derived = derive(ready, { world, model: MODEL })
  const axis = derived.axes.find((entry) => entry.id === 'derived.Race.answered')
  assert.equal(axis.role, 'derived')
  assert.equal(axis.status, 'derived')
  assert.ok(!derived.summary.coordinates.includes('answered') && !derived.summary.observations.includes('answered'))
  // a derived term whose def the world does not define is diagnosed, never dropped
  const missing = derive(ready, { world: WORLD, model: MODEL })
  assert.ok(missing.diagnostics.some((entry) => entry.code === 'derived-def-missing' && entry.symbol === 'Race.answered'))
  // the Terms table shows the def in the Field column
  assert.match(renderGenerated(ready, derived), /^\| T11 +\| search +\| answered +\| derived +\| def: Race\.answered +\|/m)
})

test('every input family counts only axes the test drives; modeled: behavior maps a family to the event axes', () => {
  // the column card's mistake: Environment tagged on an observation is blocked, not mapped
  const observed = clone(PKG)
  observed.terms.find((term) => term.field === 'final').family = 'Environment'
  delete observed.families.Environment
  const environment = derive(observed, { world: WORLD, model: MODEL }).families.find((entry) => entry.family === 'Environment')
  assert.equal(environment.status, 'undispositioned')
  assert.equal(environment.blocked, 'family-observation-only')

  const modeled = clone(PKG)
  for (const term of modeled.terms) if (term.family === 'Value') delete term.family
  modeled.families.Value = 'modeled: behavior'
  const value = derive(modeled, { world: WORLD, model: MODEL }).families.find((entry) => entry.family === 'Value')
  assert.equal(value.status, 'mapped')
  assert.ok(value.axes.length > 0 && value.axes.every((id) => id.startsWith('event.')), JSON.stringify(value))
  // without a behavior model there is nothing to drive it
  const noModel = clone(modeled)
  delete noModel.behavior
  const missing = derive(noModel, { world: WORLD }).families.find((entry) => entry.family === 'Value')
  assert.equal(missing.blocked, 'family-behavior-missing')
})

test('the Case space is projected from the world: Coverage: model, the possible cases and one row per driven axis, with no frames', () => {
  const worlds = { status: 'enumerated', raw: 384, possible: 96, excludedBy: [{ id: 'A1', count: 288 }] }
  const derived = derive(PKG, { world: WORLD, model: MODEL }, { worlds })
  const content = renderGenerated(PKG, derived)
  assert.match(content, /^## Case space\n\n- Coverage: model\n- Possible cases: 96 of 384 worlds \(288 excluded: A1 288\)/m)
  assert.match(content, /^\| Order +\| arrival +\| OldFirst, NewFirst, OldEarly +\|$/m)
  assert.match(content, /^\| Data +\| oldEmpty +\| false, true +\|$/m)
  assert.match(content, /^\| Entry +\| — +\| excluded: one search box S1 +\|$/m)
  // an observation is not a dimension: itemsIntact (Data, observable) has no row
  assert.doesNotMatch(content, /^\| Data +\| itemsIntact /m)
  // the machine enumerates the world; the frame generator has nothing to do
  const generated = generateFromDocument(content)
  assert.equal(generated.caseSpace.coverage, 'model')
  assert.deepEqual([generated.frames.length, generated.errorFrames.length], [0, 0])
  assert.equal(new Set(generated.caseSpace.families.map((entry) => entry.family)).size, 8)
  // the behavior model's transition cover is stated next to the counts: closed for a finite model, capped otherwise
  const traces = { cases: 10, bound: 4, complete: true }
  const closed = renderGenerated(
    PKG,
    derive(PKG, { world: WORLD, model: MODEL }, { worlds, space: { ...traces, cases: [], spaceDigest: 'x' }, cover: { status: 'closed', configurations: 8, pairs: 200, cases: Array.from({ length: 50 }, () => ({})) } }),
  )
  assert.match(closed, /transition cover closed: every event from all 8 configurations \(50 cases past the bound\)/)
  const capped = renderGenerated(
    PKG,
    derive(PKG, { world: WORLD, model: MODEL }, { worlds, space: { ...traces, cases: [], spaceDigest: 'x' }, cover: { status: 'capped', configurations: 2000, pairs: 9000, coveredDepth: 4, cases: Array.from({ length: 12 }, () => ({})) } }),
  )
  assert.match(capped, /transition cover capped at 4 events \(12 cases; the state grows without bound\)/)
  // without Bend the counts are reported as not enumerated, never invented
  assert.match(renderGenerated(PKG, derive(PKG, { world: WORLD, model: MODEL })), /^- Possible cases: not enumerated — Bend was not run/m)
})

test('[bend] derive counts the possible worlds with the compiled world, the same counts the adequacy check proves over', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t)
  const loaded = await loadPackage('oracle.package.json', { root })
  const { derived } = await derivePackage(loaded, { bin })
  const adequacy = await checkAdequacy({ package: 'oracle.package.json', cwd: root, bin })
  assert.equal(derived.worlds.status, 'enumerated')
  assert.equal(derived.worlds.raw, adequacy.counts.worlds)
  assert.equal(derived.worlds.possible, adequacy.counts.valid)
  assert.equal(derived.worlds.raw - derived.worlds.possible, adequacy.counts.excluded)
})

// ── W4: the behavior model is required only when the request has time in it (Order or Async) ───────────────────

/** A version-2 package with no temporal family: Order and Async excluded by the source, no behavior model. */
function timeless() {
  const pkg = confirmed(PKG)
  for (const term of pkg.terms) if (['Order', 'Async'].includes(term.family)) delete term.family
  pkg.families.Order = 'excluded: S7 one response per search, nothing to order'
  pkg.families.Async = 'excluded: S7 the response is already in when the screen renders'
  delete pkg.behavior
  pkg.contract = pkg.contract.filter((entry) => entry.def)
  return pkg
}

test('without Order or Async the behavior model is optional; with either it is required', () => {
  const codes = (pkg) => packageIssues(pkg).map((issue) => issue.split(':')[0])
  assert.ok(!codes(timeless()).includes('package-behavior-missing'))
  const ordered = timeless()
  ordered.terms.find((term) => term.field === 'arrival').family = 'Order'
  delete ordered.families.Order
  assert.ok(codes(ordered).includes('package-behavior-missing'))
  const asynchronous = timeless()
  asynchronous.families.Async = 'modeled: behavior'
  assert.ok(codes(asynchronous).includes('package-behavior-missing'))
  // a version-1 package keeps the earlier rule: the behavior model is always required
  const legacy = clone(PKG)
  delete legacy.behavior
  assert.ok(codes(legacy).includes('package-behavior-missing'))
})

test('a card without a Formal Model registers the adequacy proof and the world conformance instead of the law proof and fast-check', () => {
  const pkg = timeless()
  const content = renderGenerated(pkg, derive(pkg, { world: WORLD }))
  assert.doesNotMatch(content, /^## Formal Model$/m)
  assert.deepEqual(stackLabelsFor(content), ['bend-adequacy:reported', 'type-contract:reported', 'world-conformance:reported'])
  pkg.typeContract = { notApplicable: 'the reducer is module-private', paths: ['repo:src/search-reducer.mts'] }
  assert.deepEqual(stackLabelsFor(renderGenerated(pkg, derive(pkg, { world: WORLD }))), [
    'bend-adequacy:reported',
    'world-conformance:reported',
  ])
  // a card with a Formal Model keeps the four labels
  assert.deepEqual(stackLabelsFor(renderGenerated(PKG, derive(PKG, { world: WORLD, model: MODEL }))), STACK_LABELS)
})

test('crossCheck maps each declared dimension onto exactly one world field or behavior def, from an approved declaration', () => {
  const codes = (pkg) => packageIssues(pkg, { stage: 'model' }).filter((issue) => issue.startsWith('package-cross-check'))
  const ready = confirmed(PKG)
  ready.crossCheck = {
    dimensions: {
      arrival: { world: 'arrival', values: { early: 'OldEarly' } },
      reply: { classify: 'Search.reply', values: { late: 'Late' } },
    },
    stateModel: { phase: 'Search.phase', step: 'Search.kind', states: {}, events: {} },
  }
  assert.deepEqual(codes(ready), [])
  const both = clone(ready)
  both.crossCheck.dimensions.arrival.classify = 'Search.arrival'
  assert.match(codes(both).join(' | '), /arrival: name exactly one of world/)
  const empty = clone(ready)
  empty.crossCheck.dimensions.reply.values = {}
  assert.match(codes(empty).join(' | '), /reply: values maps each declared value/)
  const fromModel = clone(ready)
  fromModel.crossCheck.declared = 'S2'
  assert.match(codes(fromModel).join(' | '), /crossCheck\.declared names the approved source/)
  const noPhase = clone(ready)
  delete noPhase.crossCheck.stateModel.phase
  assert.match(codes(noPhase).join(' | '), /stateModel\.phase names a behavior model def/)
  // a version-1 package has no Space discovery record to cross-check
  const legacy = clone(PKG)
  legacy.crossCheck = ready.crossCheck
  assert.match(codes(legacy).join(' | '), /needs a version-2 package/)
})

test('[bend] card lint refuses a version-2 card while a cross-check candidate is undecided, so the card cannot be locked', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t)
  // the Space discovery record keeps the confirmed world axes; crossCheck maps each declared value onto the world
  const record = [
    '# Space discovery — search',
    '',
    '## Case space',
    '',
    '| Family | Dimension   | Choices                    |',
    '| ------ | ----------- | -------------------------- |',
    '| Order  | arrival     | oldFirst, newFirst, oldEarly |',
    '| Data   | oldEmpty    | no, yes                    |',
    '| Value  | longSession | short, long                |',
    '',
  ].join('\n')
  await writeFile(join(root, 'space-discovery.md'), record)
  const pkg = confirmed(PKG)
  pkg.crossCheck = {
    dimensions: {
      arrival: { world: 'arrival', values: { oldFirst: 'OldFirst', newFirst: 'NewFirst', oldEarly: 'OldEarly' } },
      oldEmpty: { world: 'oldEmpty', values: { no: false, yes: true } },
      longSession: { world: 'longSession', values: { short: false, long: true } },
    },
  }
  pkg.sources.find((source) => source.self).location = 'repo:oracle.package.v2.json#v1'
  await writeFile(join(root, 'oracle.package.v2.json'), `${JSON.stringify(pkg, null, 2)}\n`)
  // a reviewer that did not write the model read exactly this mapping input
  const { mappingInput } = await import('./oracle-discovery.mjs')
  const review = await mappingInput({ loaded: await loadPackage('oracle.package.v2.json', { root }) })
  pkg.crossCheck.reviewedBy = { agent: 'ocx-gpt-5-5 (test stand-in)', inputDigest: sha256(review) }
  await writeFile(join(root, 'oracle.package.v2.json'), `${JSON.stringify(pkg, null, 2)}\n`)
  const projected = node(root, 'oracle-package.mjs', ['project-card', '--package', 'oracle.package.v2.json', '--out', 'oracle.v2.md'])
  assert.equal(projected.status, 0, projected.stderr)
  const lint = () => node(root, 'oracle-verify.mjs', ['card', '--oracle', 'oracle.v2.md'])
  const issueCodes = (output) =>
    output
      .split('\n')
      .filter((line) => /^ {2}[a-z-]+: /.test(line))
      .map((line) => line.trim().split(':')[0])
  // the only issue left on the fresh projection is the approval the user has not given yet
  assert.deepEqual(issueCodes(lint().stderr), ['user-confirmation-status'])
  // the user confirms a value the model has no counterpart for: lint names it until it is decided
  await writeFile(join(root, 'space-discovery.md'), record.replace('| short, long                |', '| short, long, expired       |'))
  const gated = lint()
  assert.equal(gated.status, 1)
  // the declaration changed under the review, so the mapping review is stale as well
  assert.deepEqual(issueCodes(gated.stderr), ['cross-check-unreviewed', 'cross-check-undecided', 'user-confirmation-status'])
  assert.match(gated.stderr, /cross-check-undecided: C-[a-f0-9]{10} new-axis — longSession=expired has no counterpart/)
})
