import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { classifyTrace, configurationGraph, eventLabel } from './oracle-model.mjs'
import {
  characterizationSet,
  eventIndependence,
  orderWaysCover,
  reachabilityDensity,
  stateQuotient,
  wSuite,
} from './oracle-quotient.mjs'

// 컴파일된 MODEL.bend와 같은 값 모양의 손 모델 — 분석기만 시험한다. 어떤 기대값의 출처도 아니다.
const list = (items) => items.reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' })
const names = (history) => {
  const found = []
  for (let cursor = history; cursor.$ === 'Con'; cursor = cursor.tail) found.push(cursor.head.$)
  return found
}
const events = (...kinds) => list(kinds.map((kind) => ({ $: kind })))
const graphOf = (model, max = 2000) => configurationGraph(model, max)
const options = { label: eventLabel }

/** 상태 0..2, Tap은 한 칸 전진(2에서 머문다). 0과 1은 같은 'idle'로 보이지만 Tap 뒤가 다르다. */
function tapModel() {
  return {
    prefix: 'Tap',
    digest: 'tap-model',
    init: () => ({ $: 'S', n: 0n }),
    step: (state) => ({ $: 'S', n: state.n < 2n ? state.n + 1n : 2n }),
    observe: (state) => (state.n === 2n ? 'armed' : 'idle'),
    next: () => events('Tap'),
  }
}

/** 네 칸 반지름: 관측이 칸마다 달라서 모든 구성이 서로 다르다. */
function ringModel() {
  return {
    prefix: 'Ring',
    digest: 'ring-model',
    init: () => ({ $: 'Ring', at: 0n }),
    step: (state) => ({ $: 'Ring', at: (state.at + 1n) % 4n }),
    observe: (state) => state.at,
    next: () => events('R'),
  }
}

/** 보이지 않는 비트 a가 사건마다 뒤집히지만 관측도 미래도 바꾸지 않는다. */
function toggleModel() {
  return {
    prefix: 'Toggle',
    digest: 'toggle-model',
    init: () => ({ $: 'S', a: 0n }),
    step: (state) => ({ $: 'S', a: 1n - state.a }),
    observe: () => 0n,
    next: () => events('T'),
  }
}

function counterModel() {
  return {
    prefix: 'Count',
    digest: 'count-model',
    init: () => 0n,
    step: (state) => state + 1n,
    observe: (state) => state,
    next: () => events('Inc'),
  }
}

test('the configuration graph names each configuration and points every edge at its target', () => {
  const graph = graphOf(ringModel())
  assert.equal(graph.capped, null)
  assert.equal(graph.nodes.length, 4)
  const keys = new Set(graph.nodes.map(({ key }) => key))
  assert.equal(keys.size, 4)
  assert.deepEqual(graph.nodes.map(({ observation }) => observation), [0, 1, 2, 3])
  for (const node of graph.nodes) for (const edge of node.edges) assert.ok(keys.has(edge.to), 'every edge target is a node')
})

test('the quotient keeps configurations apart when their observations differ and reports no hidden or redundant state', () => {
  const quotient = stateQuotient(graphOf(ringModel()), options)
  assert.equal(quotient.status, 'closed')
  assert.equal(quotient.configurations, 4)
  assert.equal(quotient.classes, 4)
  assert.equal(quotient.hiddenGroups, 0)
  assert.equal(quotient.equivalentGroups, 0)
})

test('two configurations that look alike but behave differently are hidden state, with the shortest event that tells them apart', () => {
  const quotient = stateQuotient(graphOf(tapModel()), options)
  assert.equal(quotient.classes, 3)
  assert.equal(quotient.hiddenGroups, 1)
  const [group] = quotient.hiddenState
  assert.equal(group.observation, 'idle')
  assert.equal(group.configurations, 2)
  assert.equal(group.classes, 2)
  assert.deepEqual(group.example.left, [])
  assert.deepEqual(group.example.right, ['Tap'])
  assert.deepEqual(group.example.distinguishedBy, ['Tap'])
  assert.equal(group.example.byEnabling, false)
  assert.equal(group.byObservation, 1)
  assert.equal(group.byEnabling, 0)
})

test('configurations no event sequence can tell apart are one class, and the model state field they differ in is named', () => {
  const quotient = stateQuotient(graphOf(toggleModel()), options)
  assert.equal(quotient.configurations, 2)
  assert.equal(quotient.classes, 1)
  assert.equal(quotient.equivalentGroups, 1)
  const [group] = quotient.equivalent
  assert.equal(group.configurations, 2)
  assert.deepEqual(group.differsIn, ['state.a'])
  assert.equal(quotient.hiddenGroups, 0)
})

test('a difference only the environment shows (an event allowed in one configuration and not the other) is marked byEnabling', () => {
  // after Stop nothing is allowed; the observation is the same everywhere
  const model = {
    prefix: 'Door',
    digest: 'door-model',
    init: () => ({ $: 'S', closed: false }),
    step: (state, event) => ({ $: 'S', closed: state.closed || event.$ === 'Stop' }),
    observe: () => 0n,
    next: (history) => (names(history).includes('Stop') ? events() : events('Go', 'Stop')),
  }
  const quotient = stateQuotient(graphOf(model), options)
  assert.equal(quotient.classes, 2)
  const [group] = quotient.hiddenState
  assert.equal(group.example.byEnabling, true)
  assert.equal(group.byObservation, 0)
  assert.equal(group.byEnabling, 1)
})

test('an unbounded model has no quotient, independence, characterization, order ways or density to report: every analysis says capped', () => {
  const graph = graphOf(counterModel(), 5)
  assert.notEqual(graph.capped, null)
  const quotient = stateQuotient(graph, options)
  assert.equal(quotient.status, 'capped')
  assert.equal(eventIndependence(graph, options).status, 'capped')
  assert.equal(characterizationSet(graph, quotient, options).status, 'capped')
  assert.equal(orderWaysCover(graph, [], { ...options, t: 3 }).status, 'capped')
  assert.equal(reachabilityDensity(graph).status, 'capped')
})

/** a, b는 서로 독립이고 Reset은 둘 다에 의존한다. */
function pairModel() {
  return {
    prefix: 'Pair',
    digest: 'pair-model',
    init: () => ({ $: 'P', a: 0n, b: 0n }),
    step: (state, event) => {
      if (event.$ === 'IncA') return { $: 'P', a: 1n - state.a, b: state.b }
      if (event.$ === 'IncB') return { $: 'P', a: state.a, b: 1n - state.b }
      return { $: 'P', a: 0n, b: 0n }
    },
    observe: (state) => [state.a, state.b],
    next: () => events('IncA', 'IncB', 'Reset'),
  }
}

test('events whose order never matters are independent and the ones that do carry a witness', () => {
  const independence = eventIndependence(graphOf(pairModel()), options)
  assert.equal(independence.status, 'closed')
  const byPair = Object.fromEntries(independence.pairs.map((pair) => [`${pair.a}|${pair.b}`, pair]))
  assert.equal(byPair['IncA|IncB'].status, 'independent')
  assert.ok(byPair['IncA|IncB'].instances > 0)
  assert.equal(byPair['IncA|Reset'].status, 'dependent')
  assert.equal(byPair['IncA|Reset'].witness.reason, 'different result')
  assert.deepEqual(byPair['IncA|Reset'].witness.events.toSorted(), ['IncA', 'Reset'])
  assert.equal(independence.independentPairs, 1)
  assert.equal(independence.dependentPairs, 2)
})

test('an event that is no longer allowed after another is a dependence by enabling, with the event named', () => {
  const model = {
    prefix: 'Door',
    digest: 'door-model',
    init: () => ({ $: 'S', closed: false }),
    step: (state, event) => ({ $: 'S', closed: state.closed || event.$ === 'Close' }),
    observe: (state) => state.closed,
    next: (history) => (names(history).includes('Close') ? events() : events('Send', 'Close')),
  }
  const independence = eventIndependence(graphOf(model), options)
  const pair = independence.pairs.find(({ a, b }) => a === 'Close' && b === 'Send')
  assert.equal(pair.status, 'dependent')
  assert.match(pair.witness.reason, /Send is not allowed after Close/)
})

test('the characterization set is the fewest event sequences that tell every pair of classes apart', () => {
  const graph = graphOf(tapModel())
  const quotient = stateQuotient(graph, options)
  const characterization = characterizationSet(graph, quotient, options)
  assert.equal(characterization.status, 'closed')
  assert.equal(characterization.classes, 3)
  assert.deepEqual(characterization.W, [['Tap']])
  assert.equal(characterization.size, 1)
  assert.match(characterization.assumption, /at most as many states as the model/)
})

test('the W suite appends each characterizing sequence after every state and transition cover trace and keeps the model expectations', () => {
  const graph = graphOf(tapModel())
  const quotient = stateQuotient(graph, options)
  const { cases, skipped } = wSuite(graph, characterizationSet(graph, quotient, options))
  assert.equal(skipped, 0)
  // every shorter trace is a prefix of the longest one, so one trace carries them all
  assert.equal(cases.length, 1)
  assert.deepEqual(cases[0].trace.map(({ $ }) => $), ['Tap', 'Tap', 'Tap', 'Tap'])
  assert.deepEqual(cases[0].observations, ['idle', 'armed', 'armed', 'armed'])
  assert.match(cases[0].id, /^W[a-f0-9]{12}$/)
})

test('a sequence the environment forbids after a cover trace is skipped, never forced', () => {
  // the observation never changes, so only the environment (Use is allowed once) tells the two configurations apart
  const model = {
    prefix: 'Once',
    digest: 'once-model',
    init: () => ({ $: 'S', used: false }),
    step: (state, event) => ({ $: 'S', used: state.used || event.$ === 'Use' }),
    observe: () => 0n,
    next: (history) => (names(history).includes('Use') ? events() : events('Use')),
  }
  const graph = graphOf(model)
  const quotient = stateQuotient(graph, options)
  const characterization = characterizationSet(graph, quotient, options)
  const { cases, skipped } = wSuite(graph, characterization)
  assert.equal(characterization.status, 'closed')
  assert.equal(characterization.enablingOnlyPairs, 1)
  assert.deepEqual(characterization.W, [['Use']])
  assert.ok(skipped > 0, 'Use is not allowed after Use')
  assert.deepEqual(cases.map(({ trace }) => trace.map(({ $ }) => $)), [['Use']])
})

/** 세 사건 A·B·C가 언제든 허용되고 상태는 마지막 사건이다. */
function lastModel() {
  return {
    prefix: 'Last',
    digest: 'last-model',
    init: () => ({ $: 'S', last: 'none' }),
    step: (_state, event) => ({ $: 'S', last: event.$ }),
    observe: (state) => state.last,
    next: () => events('A', 'B', 'C'),
  }
}

test('order ways count the event orders the model allows and the cover already contains, and close the rest with the shortest traces', () => {
  const graph = graphOf(lastModel())
  const traces = [[{ $: 'A' }, { $: 'B' }, { $: 'C' }]]
  const ways = orderWaysCover(graph, traces, { ...options, t: 3 })
  assert.equal(ways.status, 'closed')
  assert.equal(ways.kinds, 3)
  assert.equal(ways.feasible, 27)
  assert.equal(ways.covered, 1)
  assert.equal(ways.missing, 26)
  // 27 orders of three events need far fewer than 26 traces once each trace carries several
  assert.ok(ways.cases.length < 26)
  const allTraces = [...traces, ...ways.cases.map(({ trace }) => trace)]
  const again = orderWaysCover(graph, allTraces, { ...options, t: 3 })
  assert.equal(again.missing, 0)
  assert.match(ways.cases[0].id, /^S[a-f0-9]{12}$/)
  // pairs are the t=2 case of the same count
  assert.equal(orderWaysCover(graph, traces, { ...options, t: 2 }).feasible, 9)
})

test('an event order the environment never allows is not demanded', () => {
  const model = {
    prefix: 'Seq',
    digest: 'seq-model',
    init: () => ({ $: 'S', last: 'none' }),
    step: (_state, event) => ({ $: 'S', last: event.$ }),
    observe: (state) => state.last,
    next: (history) => {
      const path = names(history).join(',')
      if (path === '') return events('A')
      if (path === 'A') return events('B')
      return events()
    },
  }
  const ways = orderWaysCover(graphOf(model), [], { ...options, t: 2 })
  assert.equal(ways.feasible, 1)
  assert.equal(ways.cases.length, 1)
  assert.deepEqual(ways.cases[0].trace.map(({ $ }) => $), ['A', 'B'])
})

test('an order space too wide to count is incomplete instead of guessed', () => {
  const ways = orderWaysCover(graphOf(lastModel()), [], { ...options, t: 3, maxTuples: 10 })
  assert.equal(ways.status, 'incomplete')
  assert.match(ways.reason, /27 .*10/)
})

test('representable but unreachable state combinations are counted and a few are named', () => {
  const model = {
    prefix: 'Excl',
    digest: 'excl-model',
    init: () => ({ $: 'S', x: false, y: false }),
    step: (state, event) => ({ $: 'S', x: state.x || event.$ === 'SetX', y: state.y || event.$ === 'SetY' }),
    observe: (state) => [state.x, state.y],
    next: (history) => (history.$ === 'Nil' ? events('SetX', 'SetY') : events()),
  }
  const density = reachabilityDensity(graphOf(model))
  assert.equal(density.status, 'closed')
  assert.deepEqual(density.leaves, [
    { path: 'state.x', values: 2 },
    { path: 'state.y', values: 2 },
  ])
  assert.equal(density.product, '4')
  assert.equal(density.reachable, 3)
  assert.equal(density.unreachable, '1')
  assert.deepEqual(density.sample, [{ 'state.x': true, 'state.y': true }])
})

// ── review fixes: the suite runs every transition, stays inside next(history), and names what separates classes ──

const traceKey = (trace) => JSON.stringify(trace)
const legalIn = (model) => (trace) => classifyTrace(model, trace).verdict === 'in-space'

/** 상태 이름 → (사건 이름 → 다음 상태)로 적은 손 모델. next(history)는 이력을 다시 걸어 현재 상태를 찾는다. */
function machineModel({ observe, edges }) {
  const walk = (history) => names(history).reduce((at, name) => edges[at][name], 'root')
  return {
    prefix: 'Machine',
    digest: 'machine-model',
    init: () => ({ $: 'S', at: 'root' }),
    step: (state, event) => ({ $: 'S', at: edges[state.at][event.$] }),
    observe: (state) => observe[state.at],
    next: (history) => events(...Object.keys(edges[walk(history)])),
  }
}

test('the W suite runs every state and transition even when no sequence is needed to tell classes apart', () => {
  const twoBits = {
    prefix: 'Bits',
    digest: 'bits-model',
    init: () => ({ $: 'S', x: 0n, y: 0n }),
    step: (state, event) => ({ $: 'S', x: event.$ === 'A' ? 1n - state.x : state.x, y: event.$ === 'B' ? 1n - state.y : state.y }),
    observe: (state) => [state.x, state.y],
    next: () => events('A', 'B'),
  }
  const door = {
    prefix: 'Door',
    digest: 'door-model',
    init: () => ({ $: 'S', closed: false }),
    step: (state, event) => ({ $: 'S', closed: state.closed || event.$ === 'Stop' }),
    observe: () => 0n,
    next: (history) => (names(history).includes('Stop') ? events() : events('Go', 'Stop')),
  }
  for (const model of [twoBits, door]) {
    const graph = graphOf(model)
    const characterization = characterizationSet(graph, stateQuotient(graph, options), options)
    const { cases } = wSuite(graph, characterization)
    const covered = new Set(cases.flatMap(({ trace }) => trace.map((_, index) => traceKey(trace.slice(0, index + 1)))))
    const transitions = graph.nodes.flatMap((node) => node.edges.map((edge) => traceKey(edge.trace)))
    assert.ok(transitions.length > 0)
    for (const transition of transitions) assert.ok(covered.has(transition), `${model.prefix}: ${transition} is not run`)
  }
})

test('a W or order trace that next(history) forbids is dropped and counted, never emitted', () => {
  // the dial repeats every 5 turns, so the graph merges histories, but the environment allows at most 7 turns in all
  const dial = {
    prefix: 'Dial',
    digest: 'dial-model',
    init: () => ({ $: 'D', n: 0n }),
    step: (state) => ({ $: 'D', n: (state.n + 1n) % 5n }),
    observe: (state) => (state.n === 4n ? 'armed' : 'idle'),
    next: (history) => (names(history).length < 7 ? events('T') : events()),
  }
  const graph = graphOf(dial)
  const characterization = characterizationSet(graph, stateQuotient(graph, options), options)
  const { cases, illegal } = wSuite(graph, characterization, { legal: legalIn(dial) })
  assert.ok(illegal > 0, 'a long W sequence after a long cover trace leaves the environment')
  assert.ok(cases.every(({ trace }) => legalIn(dial)(trace)))

  // B is allowed four times in all; the graph forgets the count, so five B's look possible
  const budget = {
    prefix: 'Budget',
    digest: 'budget-model',
    init: () => ({ $: 'S', last: 'none' }),
    step: (_state, event) => ({ $: 'S', last: event.$ }),
    observe: (state) => state.last,
    next: (history) => (names(history).filter((kind) => kind === 'B').length < 4 ? events('A', 'B') : events('A')),
  }
  const ways = orderWaysCover(graphOf(budget), [], { ...options, t: 5, legal: legalIn(budget) })
  assert.equal(ways.status, 'closed')
  assert.equal(ways.unplaced, 1)
  assert.equal(ways.feasible, 31)
  assert.ok(ways.cases.every(({ trace }) => legalIn(budget)(trace)))
})

test('a pair is byEnabling only when no event both configurations allow separates them by observation', () => {
  const model = machineModel({
    observe: { root: 'r', c1: 'm', c2: 'm', d1: 'm', d2: 'm', e1: 'x', e2: 'y', side: 'm' },
    edges: {
      root: { X: 'c1', Y: 'c2' },
      c1: { a: 'd1', b: 'side' },
      c2: { a: 'd2' },
      d1: { a: 'e1' },
      d2: { a: 'e2' },
      e1: {},
      e2: {},
      side: {},
    },
  })
  const graph = graphOf(model)
  const quotient = stateQuotient(graph, options)
  const group = quotient.hiddenState.find(({ example }) => example.right.includes('Y'))
  // `b` alone separates c1 from c2 by enabling, but `a · a` separates them by observation: that is the example
  assert.equal(group.example.byEnabling, false)
  assert.deepEqual(group.example.distinguishedBy, ['a', 'a'])
})

test('order ways never emit a walk that covers no tuple', () => {
  const model = {
    prefix: 'Fork',
    digest: 'fork-model',
    init: () => ({ $: 'S', last: 'none' }),
    step: (_state, event) => ({ $: 'S', last: event.$ }),
    observe: (state) => state.last,
    next: (history) => {
      if (history.$ === 'Nil') return list([{ $: 'A', v: 1n }, { $: 'A', v: 2n }])
      const afterSecondA = history.head.v === 2n && history.tail.$ === 'Nil'
      return afterSecondA ? events('C') : events()
    },
  }
  const ways = orderWaysCover(graphOf(model), [], { ...options, t: 2 })
  assert.deepEqual(ways.cases.map(({ label }) => label), ['A{v:2} · C'])
})

test('an order width that is not a positive integer is invalid, not a stack overflow', () => {
  for (const t of [Number.NaN, 0, -1, 1.5]) assert.equal(orderWaysCover(graphOf(lastModel()), [], { ...options, t }).status, 'invalid')
})

test('density counts each constructor on its own: fields another constructor lacks do not make unreachable states', () => {
  const model = {
    prefix: 'Load',
    digest: 'load-model',
    init: () => ({ $: 'Idle' }),
    step: (_state, event) => ({ $: 'Loading', id: event.id }),
    observe: (state) => state.$,
    next: (history) => (history.$ === 'Nil' ? list([{ $: 'Start', id: 1n }, { $: 'Start', id: 2n }]) : events()),
  }
  const density = reachabilityDensity(graphOf(model))
  assert.equal(density.product, '3')
  assert.equal(density.reachable, 3)
  assert.equal(density.unreachable, '0')
  assert.deepEqual(density.sample, [])
})

