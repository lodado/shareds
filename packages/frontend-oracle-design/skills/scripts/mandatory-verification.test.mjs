import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
