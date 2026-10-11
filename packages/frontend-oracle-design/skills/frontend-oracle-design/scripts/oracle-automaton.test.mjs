import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { finiteAutomaton } from './oracle-automaton.mjs'
import { stableStringify } from './oracle-fs.mjs'
import { enumerateSpace, loadModel } from './oracle-model.mjs'
import { installedBend } from './oracle-test-bend.mjs'

const spaceOf = (bound, cases) => ({ bound, complete: true, initial: 0, cases })
const entry = (trace, observations) => ({ trace, observations })
const follow = (automaton, trace) => {
  let state = automaton.start
  const observations = []
  for (const event of trace) {
    const edge = automaton.states[state].edges.find((candidate) => stableStringify(candidate.event) === stableStringify(event))
    if (!edge) return null
    state = edge.to
    observations.push(automaton.states[state].observation)
  }
  return { state, observations }
}

test('finite automaton keeps histories separated when their futures diverge more than one step later', () => {
  const space = spaceOf(4, [
    entry(['A', 'C', 'D', 'X'], [0, 0, 0, 1]),
    entry(['B', 'C', 'D', 'Y'], [0, 0, 0, 2]),
  ])
  const automaton = finiteAutomaton(space)
  assert.notEqual(follow(automaton, ['A']).state, follow(automaton, ['B']).state)
  for (const { trace, observations } of space.cases) assert.deepEqual(follow(automaton, trace).observations, observations)
  assert.equal(follow(automaton, ['A', 'C', 'D', 'Y']), null)
  assert.equal(follow(automaton, ['B', 'C', 'D', 'X']), null)
  assert.deepEqual(automaton.scope, { kind: 'bounded-traces', bound: 4, outside: 'unverified' })
})

test('finite automaton merges exactly equal suffixes, with canonical output independent of case order', () => {
  const space = spaceOf(3, [entry(['A', 'C', 'X'], [0, 0, 1]), entry(['B', 'C', 'X'], [0, 0, 1])])
  const automaton = finiteAutomaton(space)
  assert.equal(automaton.prefixes, 7)
  assert.equal(automaton.states.length, 4)
  assert.equal(follow(automaton, ['A']).state, follow(automaton, ['B']).state)
  assert.deepEqual(finiteAutomaton({ ...space, cases: [...space.cases].reverse() }), automaton)
})

test('finite automaton preserves intermediate observations even when reordered traces end alike', () => {
  const space = spaceOf(2, [entry(['A', 'B'], [1, 2]), entry(['B', 'A'], [0, 2])])
  const automaton = finiteAutomaton(space)
  assert.deepEqual(follow(automaton, ['A', 'B']).observations, [1, 2])
  assert.deepEqual(follow(automaton, ['B', 'A']).observations, [0, 2])
  assert.equal(follow(automaton, ['A', 'B', 'A']), null)
})

test('finite automaton does not confuse a natural endpoint with a bound cutoff', () => {
  const automaton = finiteAutomaton(spaceOf(2, [entry(['A'], [0]), entry(['B', 'C'], [0, 0])]))
  assert.equal(automaton.states[follow(automaton, ['A']).state].boundary, false)
  assert.equal(automaton.states[follow(automaton, ['B', 'C']).state].boundary, true)
  assert.notEqual(follow(automaton, ['A']).state, follow(automaton, ['B', 'C']).state)
  const empty = finiteAutomaton(spaceOf(1, [entry([], [])]))
  assert.equal(empty.states.length, 1)
  assert.deepEqual(follow(empty, []), { state: 0, observations: [] })
})

test('finite automaton refuses budget stops, malformed traces and contradictory prefix observations', () => {
  assert.throws(() => finiteAutomaton({ ...spaceOf(2, [entry(['A'], [0])]), complete: false }), { code: 'SPACE_INCOMPLETE' })
  for (const space of [spaceOf(0, []), spaceOf(2, []), spaceOf(1, [entry(['A', 'B'], [0, 0])]), spaceOf(2, [entry(['A'], [])])]) {
    assert.throws(() => finiteAutomaton(space), { code: 'SPACE_INVALID' })
  }
  assert.throws(() => finiteAutomaton(spaceOf(2, [entry(['A', 'B'], [0, 1]), entry(['A', 'C'], [2, 1])])), { code: 'SPACE_INCONSISTENT' })
})

test('[bend] finite automaton preserves every compiled model trace and refuses a budget-stopped Space', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const model = await loadModel({
    model: fileURLToPath(new URL('../../../test-fixtures/stale-search/MODEL.bend', import.meta.url)),
    prefix: 'Search',
    bin,
  })
  const space = enumerateSpace(model, { bound: 4 })
  const automaton = finiteAutomaton(space)
  assert.equal(space.cases.length, 10)
  for (const { trace, observations } of space.cases) assert.deepEqual(follow(automaton, trace).observations, observations)
  assert.throws(() => finiteAutomaton(enumerateSpace(model, { bound: 4, maxCases: 1 })), { code: 'SPACE_INCOMPLETE' })
})

test('finite automaton accepts exactly the enumerated prefixes and their observations, not other event orders', () => {
  const list = (events) => events.reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' })
  const items = (events) => events.$ === 'Nil' ? [] : [events.head, ...items(events.tail)]
  const alphabet = ['A', 'B', 'C']
  for (let seed = 0; seed < 12; seed += 1) {
    const model = {
      init: () => 0,
      observe: (state) => state,
      step: (state, event) => (state * 3 + alphabet.indexOf(event) + seed) % 5,
      next: (history) => list(alphabet.filter((_, index) => (items(history).length + index + seed) % 3 !== 0)),
    }
    const space = enumerateSpace(model, { bound: 4 })
    assert.equal(space.cases.length, 16)
    const automaton = finiteAutomaton(space)
    const expected = new Map([['[]', []]])
    for (const { trace, observations } of space.cases) {
      for (let length = 1; length <= trace.length; length += 1) expected.set(stableStringify(trace.slice(0, length)), observations.slice(0, length))
    }
    let traces = [[]]
    for (let depth = 0; depth <= 5; depth += 1) {
      for (const trace of traces) {
        const observed = follow(automaton, trace)
        assert.deepEqual(observed?.observations ?? null, expected.get(stableStringify(trace)) ?? null, `${seed}: ${trace}`)
      }
      traces = traces.flatMap((trace) => alphabet.map((event) => [...trace, event]))
    }
  }
})
