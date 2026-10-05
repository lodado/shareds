import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'

import { packageIssues } from './oracle-package.mjs'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('shared verification preserves approval, immutable locks, product RED and explicit current-profile evidence', async () => {
  const shared = await read('references/verification-common.md')
  assert.match(shared, /profile/)
  assert.match(shared, /VALID_RED/)
  assert.match(shared, /ALREADY_SATISFIED/)
  assert.match(shared, /Design-only/)
  const author = await read('references/roles/author.md')
  assert.match(author, /resolved profile.*approved source identities and human-confirmed axes/)
  assert.match(author, /Author the unlocked Draft/)
  assert.match(author, /Never approve policy, create\/change lock, edit target consumer tests or production\/dependencies/)
  assert.match(author, /Design-only writes\/executes no consumer tests/)
  const review = await read('references/roles/review.md')
  assert.match(review, /resolved profile, explicit dispatched review mode/)
  assert.match(review, /Never approve policy, change locks, issue receipts or perform transitions/)
  assert.match(review, /No product edits/)
  assert.match(review, /Card-only cold-read sees card bytes alone, not sources, implementation, author conclusions or Delivery/)
  assert.match(review, /Do not mix these contexts or claim independent judgment from a same-context skill switch/)
})

test('every Oracle invocation loads the mandatory stack without a new Low exemption', async () => {
  const graph = JSON.parse(await read('references/reference-graph.json'))
  const node = graph.nodes.find(({ id }) => id === 'mandatory-verification')
  assert.ok(node, 'the mandatory stack must be a loadable reference node')
  assert.deepEqual(node.requires, ['common'])
  assert.match(node.when, /every invocation/)
  assert.match(node.when, /all risks and both modes/)
  const always = graph.reviewPoints.find(({ when }) => when === 'always')
  assert.ok(always.nodesByProfile['formal-bend/v1'].includes(node.id))
  assert.equal(always.nodes.includes(node.id), false, 'shared review cannot unconditionally load Formal proof')
  assert.equal(always.nodesByProfile['contract/v1'].includes(node.id), false)
  for (const lane of graph.lanes) {
    if (lane.id === 'low-fast-path') {
      assert.equal(lane.legacyOnly, true, 'Low may describe history, not bypass a new invocation')
      assert.match(lane.when, /legacy/i)
    }
  }
  const skill = await read('references/controller-entry-formal.md')
  assert.match(skill, /mandatory-verification\.md/)
  assert.match(skill, /common.*(?:every|all).*risk/is)
})

test('the mandatory stack requires real proof, type-fest consumer, static witnesses and positive sampling', async () => {
  const contract = await read('references/mandatory-verification.md')
  for (const member of ['Bend', 'type-fest', 'TypeScript', 'fast-check']) assert.ok(contract.includes(member), member)
  for (const label of [
    'bend-proof:reported',
    'bend-adequacy:reported',
    'type-contract:reported',
    'fast-check:reported',
  ])
    assert.ok(contract.includes(label), label)
  assert.match(contract, /including Low/)
  assert.match(contract, /actual type-fest consumer/)
  assert.match(contract, /positive and negative witnesses/)
  assert.match(contract, /positive-count sampling/)
  assert.match(contract, /small-domain generator.*sampling/s)
  assert.match(contract, /does not infer arbitrary library use/)
  assert.match(contract, /no opt-out/i)
})

test('mandatory tools preserve approval, Design-only and product VALID_RED boundaries', async () => {
  const contract = await read('references/mandatory-verification.md')
  assert.match(contract, /does not write or execute consumer test files or production changes/)
  assert.match(contract, /Model proof, adequacy, static rejection and harness failure are not a product `VALID_RED`/)
  assert.match(contract, /NEEDS_DECISION/)
  assert.match(contract, /ENVIRONMENT_DEFECT.*FAIL/)
  assert.match(contract, /no longer permits falling back to ordinary tests/)
  assert.match(contract, /new revision/)
  assert.match(contract, /Never rewrite an old lock or ledger/)
})

// What a run must read before Draft/lock. The closure follows `requires`, so one new edge can pull tens of KB into every run;
// raise a budget only with the measured reason in the commit. Measured at 0.70.0: 234,425 and 430,120 bytes.
const DESIGN_ONLY_NODES = [
  'common',
  'mandatory-verification',
  'bend-cross-verification',
  'adequacy',
  'card-policy-sources',
  'card-risk-grill',
  'bva',
  'card-format',
  'card-interaction-sweep',
  'card-case-space',
  'card-confirmation-lock',
]
const DELIVERY_NODES = [
  ...DESIGN_ONLY_NODES,
  'delivery-ledger',
  'delivery-red',
  'delivery-implementation-decision',
  'delivery-green-review',
  'subagent-review',
  'discovery',
  'card-retro-metrics',
]
const CONDITIONAL_TYPE_NODES = [
  'types-advanced-contracts',
  'types-api-surface',
  'types-state-ladder',
  'types-authoring',
  'type-environment',
]

test('the always-read reference closure stays inside its byte budget and never pulls the conditional type nodes', async () => {
  const graph = JSON.parse(await read('references/reference-graph.json'))
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const { referenceDependencies, referencePathFor } = await import('./generate-reference-bundles.mjs')
  const closure = (ids, profile) => {
    const seen = new Set()
    const visit = (id) => {
      assert.ok(byId.has(id), `graph node ${id}`)
      if (seen.has(id)) return
      seen.add(id)
      assert.ok(byId.get(id).profiles.includes(profile), `${id} supports ${profile}`)
      referenceDependencies(byId.get(id), profile).forEach(visit)
    }
    ids.forEach(visit)
    return seen
  }
  const bytes = async (ids, profile) =>
    (await stat(new URL(profile === 'contract/v1' ? '../../frontend-contract-design/SKILL.md' : '../SKILL.md', import.meta.url))).size +
    (
      await Promise.all(
        [...ids].map(async (id) => (await stat(new URL(`../${referencePathFor(byId.get(id), profile)}`, import.meta.url))).size),
      )
    ).reduce((a, b) => a + b, 0)
  for (const profile of ['formal-bend/v1', 'contract/v1']) {
    const roots = profile === 'formal-bend/v1' ? DESIGN_ONLY_NODES : [
      'common', 'verification-common', 'contract-requirements', 'contract-space',
      'card-policy-sources', 'card-risk-grill', 'bva', 'card-format', 'card-interaction-sweep',
      'card-case-space', 'card-confirmation-lock',
    ]
    const designOnly = closure(roots, profile)
    const delivery = closure(profile === 'formal-bend/v1' ? DELIVERY_NODES : [
      ...roots, 'delivery-ledger', 'delivery-red', 'delivery-implementation-decision',
      'delivery-green-review', 'subagent-review', 'card-retro-metrics',
    ], profile)
    for (const id of CONDITIONAL_TYPE_NODES) {
      assert.equal(designOnly.has(id), false, `${profile}: ${id} loads only when the card has an exposed type boundary`)
      assert.equal(delivery.has(id), false, `${profile}: ${id}`)
    }
    assert.ok((await bytes(designOnly, profile)) <= 245_000, `${profile}: Design-only closure is ${await bytes(designOnly, profile)} bytes`)
    assert.ok((await bytes(delivery, profile)) <= 445_000, `${profile}: Delivery closure is ${await bytes(delivery, profile)} bytes`)
    if (profile === 'contract/v1') {
      for (const id of [...designOnly, ...delivery]) assert.ok(byId.get(id).profiles.includes('contract/v1'), `${id} must not import Formal`)
      assert.equal(delivery.has('mandatory-verification'), false)
      assert.equal(delivery.has('bend-cross-verification'), false)
    }
  }
})

test('the scope gate stops work with no modelable behavior before the stack instead of looping in NEEDS_DECISION', async () => {
  const [skill, common, contract] = await Promise.all([
    read('references/controller-entry-formal.md'),
    read('references/common.md'),
    read('references/mandatory-verification.md'),
  ])
  // the gate sits between common.md and the stack; it routes, never narrows
  assert.match(skill, /\*\*Scope gate, after common and before mandatory verification\.\*\*/)
  assert.match(skill, /without card\/lock\/stack/)
  // the stop has a report word the corpus can grade; it is not a ledger state
  assert.match(skill, /`Status: OUT_OF_SCOPE`/)
  assert.match(skill, /OUT_OF_SCOPE is not a ledger state/)
  assert.match(skill, /`\$frontend-visual-qa`\s+for rendered UI/)
  assert.match(skill, /never narrow\s+the requirement to fit Bend/)
  assert.match(skill, /Not formalized\/Out of scope/)
  assert.match(contract, /not an opt-out for work that does/)
  assert.match(contract, /Behavior no model can state is stopped by the scope gate/)
  // Low has no card-free path: only its modelable regression fixes remain, and CSS/copy/token work is the gate's
  const lowRow = common.split('\n').find((line) => line.startsWith('| `Low`'))
  assert.doesNotMatch(lowRow, /isolated CSS/)
  assert.match(common, /Copy, token and isolated-CSS work without a behavioral contract stops at the controller's scope gate/)
  // visual-only work is no trigger either
  assert.doesNotMatch((await read('SKILL.md')).match(/^description: ([^\n]+)$/m)[1], /approved visual intent/)
})

test('the procedure no longer contradicts itself on lint, dependencies and type guidance', async () => {
  const [controller, author, mandatory] = await Promise.all([
    read('references/roles/controller-formal.md'),
    read('references/roles/author-formal.md'),
    read('references/mandatory-verification.md'),
  ])
  // the pre-lock model and card checks are named, not forbidden
  assert.doesNotMatch(controller, /no\s+lint,\s+lock,\s+tests,\s+or\s+production edits/)
  assert.match(controller, /Only named pre-lock\s+checks run/)
  // The mandatory stack owns approval timing; authoring identifies the exact dependency.
  assert.match(author, /Tool preparation follows mandatory verification and target dependency rules/)
  assert.match(author, /package, version and owning package\.json as a Draft approval item/)
  assert.match(mandatory, /dependency is one approval item in the Draft/)
  assert.match(mandatory, /Design-only records it as unavailable until approved\s+and installs nothing/)
  // type guidance follows the exposed type boundary, so no node pulls the type ladder into every run
  assert.match(mandatory, /when the card has an exposed type boundary/)
  assert.doesNotMatch(author, /unconditionally load the type-fest/)
  const graph = JSON.parse(await read('references/reference-graph.json'))
  assert.match(
    graph.nodes.find(({ id }) => id === 'types-advanced-contracts').when,
    /^the card has an exposed type boundary/,
  )
})

test('the scope gate sorts a request: no behavior stops, value domains become axes, a mix models its core', async () => {
  const skill = await read('references/controller-entry-formal.md')
  assert.match(skill, /No modelable state/)
  // time, money, negative, string and randomness are axes, never a gate stop of their own
  assert.doesNotMatch(skill, /domain Bend cannot represent|unsupported domain/)
  assert.match(skill, /time is an Order\/Async event[\s\S]*?Value\s+classes[\s\S]*?environment choice in `next\(history\)`/)
  assert.match(skill, /`NEEDS_DECISION` only when the sources leave the\s+boundary, precision or duration undecided/)
  assert.match(skill, /Mixed: model the stateful part/)
  // a missing source is asked for, never guessed
  assert.match(skill, /Ask for a required missing source, never guess it/)
  const [graph, mandatory, patterns] = await Promise.all([
    read('references/bend-cross-verification.md'),
    read('references/mandatory-verification.md'),
    read('references/model-patterns.md'),
  ])
  assert.doesNotMatch(`${graph}\n${mandatory}`, /unsupported domain|unsupported or unresolved scope/)
  assert.match(graph, /unresolved \(a boundary, precision or duration\) is `NEEDS_DECISION`/)
  // the encoding guidance sits beside "Time is an event"
  for (const kind of [/\*\*Clock, expiry:\*\*/, /\*\*Negative, quantity:\*\*/, /\*\*Money, decimal:\*\*/, /\*\*String:\*\*/, /\*\*Randomness:\*\*/])
    assert.match(patterns, kind)
  assert.match(patterns, /`Empty\{\}`, `Valid\{\}`, `TooLong\{\}`, `Malformed\{\}`,\s+`Unicode\{\}`/)
})

test('the model package has a small copyable example that passes the model-stage validator', async () => {
  const [author, doc, raw] = await Promise.all([
    read('references/roles/author-formal.md'),
    read('references/bend-cross-verification.md'),
    read('references/model-package.example.json'),
  ])
  assert.match(doc, /\[`model-package\.example\.json`\]\(model-package\.example\.json\)/)
  assert.match(author, /\[`model-package\.example\.json`\]\(\.\.\/model-package\.example\.json\)/)
  // the doc names the example instead of a 47KB fixture the agent can only half read
  assert.match(doc, /Do not take\s+`cat` of a fixture's/)
  assert.deepEqual(packageIssues(JSON.parse(raw), { stage: 'model' }), [])
  assert.ok(raw.length < 6000, 'small enough to read whole in one call')
})

test('the Bend model is the oracle the tests compute with, never the shape of the product code', async () => {
  const [bend, ladder, patterns] = await Promise.all([
    read('references/bend-cross-verification.md'),
    read('references/types/state-ladder.md'),
    read('references/model-patterns.md'),
  ])
  assert.match(bend, /The\s+model\s+is\s+the\s+oracle,\s+not\s+the\s+product's\s+design/)
  assert.match(bend, /never\s+mirror\s+the\s+model's\s+message\s+union/)
  assert.match(bend, /never\s+import\s+the\s+model\s+or\s+its\s+compiled\s+module\s+from\s+product\s+code/)
  // emit-state drives a pure function the ladder produced, never a reducer written for the test
  assert.match(bend, /never\s+a\s+reducer\s+written\s+for\s+the\s+test/)
  // the placement example drives a component; it no longer shows product code as the model's transition
  assert.doesNotMatch(bend, /the pure transition under test/)
  assert.match(bend, /ui\/FeedGrid\.tsx\s+product code — shaped by the state ladder, not by the model/)
  assert.match(ladder, /`## State Model`\s+or\s+a\s+Bend\s+model/)
  assert.match(ladder, /Model\s+messages\s+are\s+test\s+vocabulary,\s+not\s+product\s+actions/)
  assert.match(patterns, /no\s+product\s+structure/)
})

test('time decides the stack: Order or Async needs the behavior model and fast-check; a timeless card runs every possible world setting', async () => {
  const [contract, bend, ledger, green] = await Promise.all([
    read('references/mandatory-verification.md'),
    read('references/bend-cross-verification.md'),
    read('references/delivery/ledger.md'),
    read('references/delivery/green-review.md'),
  ])
  assert.match(
    contract,
    /The behavior model\s+\(MODEL, LAWS, PROOF\) and fast-check apply when time is part of the space/,
  )
  assert.match(contract, /\| World +\| Without a behavior model: every possible coordinate setting run on the product/)
  assert.match(contract, /`world-conformance:reported`/)
  assert.match(
    bend,
    /behavior model \(`MODEL\.bend`, `LAWS\.bend`, `PROOF\.bend`\) is required when the Order or Async family is\s+part of the space/,
  )
  assert.match(bend, /oracle-projection\.mjs emit-world/)
  assert.match(
    ledger,
    /A card without a `## Formal Model` registers `bend-adequacy:reported`, `world-conformance:reported`/,
  )
  assert.match(green, /needs `bend-adequacy:reported` and `world-conformance:reported` instead/)
})
