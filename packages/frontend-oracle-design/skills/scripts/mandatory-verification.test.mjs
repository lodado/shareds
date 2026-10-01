import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('every Oracle invocation loads the mandatory stack without a new Low exemption', async () => {
  const graph = JSON.parse(await read('references/reference-graph.json'))
  const node = graph.nodes.find(({ id }) => id === 'mandatory-verification')
  assert.ok(node, 'the mandatory stack must be a loadable reference node')
  assert.deepEqual(node.requires, ['common'])
  assert.match(node.when, /every invocation/)
  assert.match(node.when, /all risks and both modes/)
  assert.ok(graph.reviewPoints.find(({ when }) => when === 'always').nodes.includes(node.id))
  for (const lane of graph.lanes) {
    if (lane.id === 'low-fast-path') {
      assert.equal(lane.legacyOnly, true, 'Low may describe history, not bypass a new invocation')
      assert.match(lane.when, /legacy/i)
    }
  }
  const skill = await read('SKILL.md')
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
  const closure = (ids) => {
    const seen = new Set()
    const visit = (id) => {
      assert.ok(byId.has(id), `graph node ${id}`)
      if (seen.has(id)) return
      seen.add(id)
      byId.get(id).requires.forEach(visit)
    }
    ids.forEach(visit)
    return seen
  }
  const bytes = async (ids) =>
    (await stat(new URL('../SKILL.md', import.meta.url))).size +
    (
      await Promise.all(
        [...ids].map(async (id) => (await stat(new URL(`../${byId.get(id).path}`, import.meta.url))).size),
      )
    ).reduce((a, b) => a + b, 0)
  const designOnly = closure(DESIGN_ONLY_NODES)
  const delivery = closure(DELIVERY_NODES)
  for (const id of CONDITIONAL_TYPE_NODES) {
    assert.equal(designOnly.has(id), false, `${id} loads only when the card has an exposed type boundary`)
    assert.equal(delivery.has(id), false, id)
  }
  assert.ok((await bytes(designOnly)) <= 245_000, `Design-only closure is ${await bytes(designOnly)} bytes`)
  assert.ok((await bytes(delivery)) <= 445_000, `Delivery closure is ${await bytes(delivery)} bytes`)
})

test('the scope gate stops work with no modelable behavior before the stack instead of looping in NEEDS_DECISION', async () => {
  const [skill, common, contract] = await Promise.all([
    read('SKILL.md'),
    read('references/common.md'),
    read('references/mandatory-verification.md'),
  ])
  // the gate sits between common.md and the stack; it routes, never narrows
  assert.match(skill, /\*\*Scope gate — after `common\.md`, before `mandatory-verification\.md`\.\*\*/)
  assert.match(skill, /no\s+card, lock or stack/)
  // the stop has a report word the corpus can grade; it is not a ledger state
  assert.match(skill, /`Status: OUT_OF_SCOPE — <where it was routed>`\s+\(a report word, not a\s+ledger state\)/)
  assert.match(skill, /`\$frontend-visual-qa`\s+for rendered UI/)
  assert.match(skill, /never narrow\s+the requirement to fit Bend/)
  assert.match(skill, /Not formalized`\/`Out of scope`/)
  assert.match(contract, /not an opt-out for work that does/)
  assert.match(contract, /Behavior no model can state is stopped by the scope gate/)
  // Low has no card-free path: only its modelable regression fixes remain, and CSS/copy/token work is the gate's
  const lowRow = common.split('\n').find((line) => line.startsWith('| `Low`'))
  assert.doesNotMatch(lowRow, /isolated CSS/)
  assert.match(common, /Copy, token and isolated-CSS work has no behavior a model can state/)
  // visual-only work is no trigger either
  assert.doesNotMatch(skill.match(/^description: ([^\n]+)$/m)[1], /approved visual intent/)
})

test('the procedure no longer contradicts itself on lint, dependencies and type guidance', async () => {
  const skill = await read('SKILL.md')
  // the pre-lock model and card checks are named, not forbidden
  assert.doesNotMatch(skill, /no\s+lint,\s+lock,\s+tests,\s+or\s+production edits/)
  assert.match(skill, /Only\s+the pre-lock checks this procedure names run/)
  // a stack dependency is one Draft approval item, never installed during Design-only
  assert.match(skill, /one approval item in the Draft \(package, version, owning `package\.json`\)/)
  assert.match(skill, /never during Design-only/)
  // type guidance follows the exposed type boundary, so no node pulls the type ladder into every run
  assert.match(skill, /when the card has an exposed type boundary/)
  assert.doesNotMatch(skill, /unconditionally load the type-fest/)
  const graph = JSON.parse(await read('references/reference-graph.json'))
  assert.match(
    graph.nodes.find(({ id }) => id === 'types-advanced-contracts').when,
    /^the card has an exposed type boundary/,
  )
})
