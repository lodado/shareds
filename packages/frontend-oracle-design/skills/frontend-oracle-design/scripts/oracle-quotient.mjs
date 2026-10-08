// 구성 그래프(oracle-model의 configurationGraph)를 읽어 모델 공간의 밀도를 재는 순수 분석 — 상태 몫(숨은 상태·중복 좌표),
// 사건 교환(독립 쌍), 특성 집합(W-method), 사건 순서 t-way, 도달 밀도. 그래프와 사건 이름 함수만 받는다.
// oracle-model을 import하지 않는다: 그쪽이 이 모듈을 부르고, 두 모듈이 순환하면 top-level await가 import를 교착시킨다.
// 모든 분석은 닫힌 그래프(유한 모델)에서만 말한다. 상한에 걸린 그래프는 가장자리가 열려 있어 `capped`로 답하고 멈춘다.

import { sha256, stableStringify } from './oracle-fs.mjs'
import { toPlain } from './oracle-types.mjs'

const EXAMPLES = 3
const MAX_DIFFS = 5
const MAX_CLASSES = 150
const MAX_GROUP_REPRESENTATIVES = 30
const MAX_TUPLES = 4096
const MAX_WALK = 200
const MAX_SAMPLE_PRODUCT = 50_000n
const MAX_PAIR_VISITS = 20_000
const MAX_T = 6
const compare = (left, right) => (left < right ? -1 : Number(left > right))
const defaultName = (event) => stableStringify(event)
function kindOf(event) {
  if (event === null || typeof event !== 'object') return 'event'
  return typeof event.$ === 'string' ? event.$ : 'event'
}

function cappedReport(graph) {
  return {
    status: 'capped',
    reason: `the configuration graph hit its cap at depth ${graph.capped} (a state that grows without bound, or a finite model larger than the cap), so its frontier is unexplored`,
  }
}

/** 노드 번호와 사건 키로 찾는 간선 표 — 같은 사건 키 순서(정렬)가 모든 분석의 결정성을 만든다. */
function network(graph) {
  const nodes = graph.nodes
  const index = new Map(nodes.map((node, position) => [node.key, position]))
  const sorted = nodes.map((node) =>
    node.edges
      .filter((edge) => index.has(edge.to))
      .map((edge) => [stableStringify(edge.event), { edge, to: index.get(edge.to) }])
      .sort(([left], [right]) => compare(left, right)),
  )
  return { nodes, index, sorted, out: sorted.map((entries) => new Map(entries)) }
}

/** 같은 류 가운데 가장 앞선(접근 trace가 가장 짧은) 구성 하나씩. */
function firstOfEachClass(members, classes) {
  const first = new Map()
  for (const position of members) if (!first.has(classes[position])) first.set(classes[position], position)
  return [...first.values()]
}

/** 부모 표를 거슬러 올라가 시작 쌍에서 `key` 쌍까지의 사건열을 만든다. */
function eventsTo(parents, key) {
  const events = []
  for (let cursor = key; parents.get(cursor) !== null; cursor = parents.get(cursor).from) events.push(parents.get(cursor).event)
  return events.reverse()
}

/** 두 구성이 함께 허용하는 사건만 따라 관측이 처음 달라지는 가장 짧은 사건열. 없거나 탐색 예산을 넘으면 null. */
function observationalSequence(net, observed, start, other) {
  const keyOf = (left, right) => `${left}:${right}`
  const parents = new Map([[keyOf(start, other), null]])
  const queue = [[start, other]]
  for (let head = 0; head < queue.length && head < MAX_PAIR_VISITS; head += 1) {
    const [left, right] = queue[head]
    if (observed[left] !== observed[right]) return eventsTo(parents, keyOf(left, right))
    for (const [key, { edge, to }] of net.sorted[left]) {
      const twin = net.out[right].get(key)
      const next = twin ? keyOf(to, twin.to) : null
      if (next !== null && !parents.has(next)) {
        parents.set(next, { from: keyOf(left, right), event: edge.event })
        queue.push([to, twin.to])
      }
    }
  }
  return null
}

function idsBy(values) {
  const ids = new Map()
  return values.map((value) => {
    if (!ids.has(value)) ids.set(value, ids.size)
    return ids.get(value)
  })
}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

function diffPaths(left, right, path, found = []) {
  if (found.length >= MAX_DIFFS) return found
  if (isRecord(left) && isRecord(right)) {
    for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) diffPaths(left[key], right[key], `${path}.${key}`, found)
    return found
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length === right.length) left.forEach((item, position) => diffPaths(item, right[position], `${path}[${position}]`, found))
    else found.push(`${path}.length`)
    return found
  }
  if (stableStringify(left) !== stableStringify(right)) found.push(path)
  return found
}

/**
 * 상태 몫 — 관측으로 시작해 (사건 → 다음 류)로 쪼개는 분할 정제(쌍모사). 같은 류의 구성은 어떤 사건열로도 관측이 다르지
 * 않고 허용 사건도 같다. 같은 관측인데 나중에 갈리는 구성은 숨은 상태(그 관측만 보면 구분되지 않는다)이고, 갈리지 않는데
 * 모델 상태만 다른 구성은 그 상태 좌표가 미래를 바꾸지 않는다는 뜻이다(중복 좌표 후보).
 */
export function stateQuotient(graph, { label: name = defaultName } = {}) {
  if (graph.capped !== null) return cappedReport(graph)
  const net = network(graph)
  const history = [idsBy(net.nodes.map((node) => stableStringify(node.observation)))]
  for (;;) {
    const last = history.at(-1)
    const refined = idsBy(
      net.nodes.map((_, position) =>
        stableStringify([last[position], net.sorted[position].map(([key, { to }]) => [key, last[to]])]),
      ),
    )
    // 정제는 쪼개기만 한다 — 류 수가 같으면 분할이 같다
    if (new Set(refined).size === new Set(last).size) break
    history.push(refined)
  }
  const final = history.at(-1)

  /** 갈라지는 가장 짧은 사건열 — 분할이 갈린 라운드를 거슬러 올라간다. 마지막 걸음이 한쪽만 허용하는 사건이면 byEnabling이다. */
  const separate = (left, right) => {
    const round = history.findIndex((ids) => ids[left] !== ids[right])
    if (round < 0) return null
    if (round === 0) return { events: [], byEnabling: false }
    const before = history[round - 1]
    for (const [key, { edge, to }] of net.sorted[left]) {
      const other = net.out[right].get(key)
      if (other && before[to] !== before[other.to]) {
        const rest = separate(to, other.to)
        return { events: [edge.event, ...rest.events], byEnabling: rest.byEnabling }
      }
    }
    for (const [key, { edge }] of net.sorted[left]) if (!net.out[right].has(key)) return { events: [edge.event], byEnabling: true }
    for (const [key, { edge }] of net.sorted[right]) if (!net.out[left].has(key)) return { events: [edge.event], byEnabling: true }
    return null
  }

  /**
   * 두 구성을 가르는 가장 짧은 사건열. 둘이 함께 허용하는 사건만으로 관측이 갈리면 그 열을 쓰고(byEnabling: false — 제품이
   * 보여 줄 수 있다), 그런 열이 없을 때만 한쪽만 허용하는 사건으로 가른다(byEnabling: true — 환경만 구분한다).
   */
  const distinguish = (left, right) => {
    if (history.every((ids) => ids[left] === ids[right])) return null
    const events = observationalSequence(net, history[0], left, right)
    return events === null ? separate(left, right) : { events, byEnabling: false }
  }

  const groupsBy = (ids) => {
    const groups = new Map()
    ids.forEach((id, position) => groups.set(id, [...(groups.get(id) ?? []), position]))
    return [...groups.values()]
  }
  const accessOf = (position) => net.nodes[position].trace.map(name)
  const hiddenAll = groupsBy(history[0])
    .map((members) => {
      const representatives = firstOfEachClass(members, final)
      return { members, representatives }
    })
    .filter(({ representatives }) => representatives.length > 1)
  const hiddenState = hiddenAll.slice(0, EXAMPLES).map(({ members, representatives }) => {
    const shown = representatives.slice(0, MAX_GROUP_REPRESENTATIVES)
    const pairs = shown.flatMap((left, first) => shown.slice(first + 1).map((right) => ({ left, right, found: distinguish(left, right) })))
    // 관측으로 갈리는 쌍을 예로 든다 — 환경이 허용하는 사건으로만 갈리는 쌍은 제품이 보여 줄 수 없다
    const byObservation = pairs.filter(({ found }) => !found.byEnabling)
    const { left, right, found } = byObservation[0] ?? pairs[0]
    return {
      observation: net.nodes[left].observation,
      configurations: members.length,
      classes: representatives.length,
      byObservation: byObservation.length,
      byEnabling: pairs.length - byObservation.length,
      example: { left: accessOf(left), right: accessOf(right), distinguishedBy: found.events.map(name), byEnabling: found.byEnabling },
    }
  })
  const equivalentAll = groupsBy(final).filter((members) => members.length > 1)
  const equivalent = equivalentAll.slice(0, EXAMPLES).map((members) => {
    const base = toPlain(net.nodes[members[0]].state)
    const differsIn = [
      ...new Set(members.slice(1).flatMap((position) => diffPaths(base, toPlain(net.nodes[position].state), 'state'))),
    ].sort()
    return { configurations: members.length, example: [accessOf(members[0]), accessOf(members[1])], differsIn }
  })

  const report = {
    status: 'closed',
    configurations: net.nodes.length,
    classes: new Set(final).size,
    hiddenGroups: hiddenAll.length,
    hiddenState,
    equivalentGroups: equivalentAll.length,
    equivalent,
  }
  Object.defineProperty(report, 'internals', { value: { net, history, distinguish }, enumerable: false })
  return report
}

/**
 * 사건 교환 — 두 사건을 함께 허용하는 모든 구성에서 두 순서가 모두 허용되고 같은 구성에 닿으면 독립이다. 독립한 쌍은 한 순서만
 * 시험하면 되고, 의존한 쌍은 두 순서가 모두 필요하다. 의존에는 첫 증인(구성·두 사건·이유)이 붙는다. 쌍은 사건 종류(`$`)로 묶는다.
 */
export function eventIndependence(graph, { label: name = defaultName } = {}) {
  if (graph.capped !== null) return cappedReport(graph)
  const net = network(graph)
  const found = new Map()
  net.sorted.forEach((entries, position) => {
    for (const [left, right] of pairsOf(entries)) {
      const reason = conflictOf(net, name, left, right)
      const [a, b] = [kindOf(left.edge.event), kindOf(right.edge.event)].sort()
      const key = `${a}|${b}`
      const pair = found.get(key) ?? { a, b, instances: 0, dependentInstances: 0, witness: null }
      pair.instances += 1
      if (reason !== null) {
        pair.dependentInstances += 1
        pair.witness ??= { at: net.nodes[position].trace.map(name), events: [name(left.edge.event), name(right.edge.event)], reason }
      }
      found.set(key, pair)
    }
  })
  const pairs = [...found.values()]
    .sort((left, right) => compare(`${left.a}|${left.b}`, `${right.a}|${right.b}`))
    .map(({ a, b, instances, dependentInstances, witness }) => ({
      a,
      b,
      status: dependentInstances === 0 ? 'independent' : 'dependent',
      instances,
      ...(witness ? { witness } : {}),
    }))
  return {
    status: 'closed',
    basis: 'a pair commutes when, at every configuration that allows both, both orders are allowed and reach the same configuration',
    pairs,
    independentPairs: pairs.filter(({ status }) => status === 'independent').length,
    dependentPairs: pairs.filter(({ status }) => status === 'dependent').length,
  }
}

/** 한 구성이 허용하는 사건의 모든 순서 없는 쌍. */
function pairsOf(entries) {
  const hops = entries.map(([key, hop]) => ({ key, ...hop }))
  return hops.flatMap((left, first) => hops.slice(first + 1).map((right) => [left, right]))
}

/** 두 순서가 모두 허용되고 같은 구성에 닿으면 null, 아니면 이유. */
function conflictOf(net, name, left, right) {
  const leftThenRight = net.out[left.to].get(right.key)
  if (!leftThenRight) return `${name(right.edge.event)} is not allowed after ${name(left.edge.event)}`
  const rightThenLeft = net.out[right.to].get(left.key)
  if (!rightThenLeft) return `${name(left.edge.event)} is not allowed after ${name(right.edge.event)}`
  return leftThenRight.to === rightThenLeft.to ? null : 'different result'
}

const ASSUMPTION =
  'complete for output and transfer faults when the product has at most as many states as the model, for the sequences that ran (one the environment forbids after a trace is skipped and counted); a product with k extra states needs k more events between a cover trace and each sequence, which is not generated'

/**
 * 특성 집합 W — 현재 관측이 같은 두 류를 가르는 사건열을 탐욕으로 고른다(가장 적다는 보장은 없다). 관측이 다른 류는 접근
 * trace의 관측 비교가 이미 가르므로 W가 필요 없다. 둘이 함께 허용하는 사건으로는 관측이 갈리지 않고 한쪽만 허용하는 사건으로만
 * 갈리는 쌍은 제품이 보여 줄 수 없으므로 따로 센다.
 */
export function characterizationSet(graph, quotient, { label: name = defaultName } = {}) {
  if (graph.capped !== null) return cappedReport(graph)
  const { net, history, distinguish } = quotient.internals
  const final = history.at(-1)
  const representatives = firstOfEachClass(final.keys(), final).sort((left, right) => left - right)
  if (representatives.length > MAX_CLASSES) {
    return {
      status: 'incomplete',
      reason: `${representatives.length} classes exceed the ${MAX_CLASSES} the pairwise search covers`,
    }
  }
  const outputOf = (position, sequence) => {
    const output = [net.nodes[position].observation]
    let at = position
    for (const event of sequence) {
      const hop = net.out[at].get(stableStringify(event))
      if (!hop) return stableStringify([...output, '⊥'])
      output.push(hop.edge.observation)
      at = hop.to
    }
    return stableStringify(output)
  }
  const pairs = []
  const candidates = new Map()
  let enablingOnlyPairs = 0
  for (let first = 0; first < representatives.length; first += 1) {
    for (let second = first + 1; second < representatives.length; second += 1) {
      const left = representatives[first]
      const right = representatives[second]
      if (history[0][left] !== history[0][right]) continue
      const found = distinguish(left, right)
      pairs.push([left, right])
      if (found.byEnabling) enablingOnlyPairs += 1
      candidates.set(stableStringify(found.events), found.events)
    }
  }
  const ordered = [...candidates.values()].sort((left, right) => left.length - right.length || compare(stableStringify(left), stableStringify(right)))
  const covers = ordered.map((sequence) => new Set(pairs.map(([left, right], position) => (outputOf(left, sequence) !== outputOf(right, sequence) ? position : -1)).filter((position) => position >= 0)))
  const remaining = new Set(pairs.keys())
  const sequences = []
  while (remaining.size > 0) {
    let best = -1
    let gain = 0
    covers.forEach((covered, position) => {
      const count = [...covered].filter((pair) => remaining.has(pair)).length
      if (count > gain) {
        gain = count
        best = position
      }
    })
    sequences.push(ordered[best])
    covers[best].forEach((pair) => remaining.delete(pair))
  }
  return {
    status: 'closed',
    classes: representatives.length,
    pairs: pairs.length,
    enablingOnlyPairs,
    size: sequences.length,
    W: sequences.map((sequence) => sequence.map(name)),
    sequences,
    assumption: ASSUMPTION,
  }
}

/** 구성 `at`에서 사건열을 걸으며 모은 관측값. 환경이 허용하지 않는 사건에서 막히면 null. */
function walkFrom(net, at, sequence) {
  const observations = []
  let cursor = at
  for (const event of sequence) {
    const hop = net.out[cursor].get(stableStringify(event))
    if (!hop) return null
    observations.push(hop.edge.observation)
    cursor = hop.to
  }
  return observations
}

/** 구성의 접근 trace와 거기서 나가는 전이마다의 trace — 특성 열을 이을 자리. */
function basesOf(net, node, position) {
  const edges = node.edges.filter((edge) => net.index.has(edge.to))
  return [
    { trace: node.trace, observations: node.observations, at: position },
    ...edges.map((edge) => ({ trace: edge.trace, observations: edge.observations, at: net.index.get(edge.to) })),
  ]
}

/**
 * W 시험 묶음(W-method의 P·({ε} ∪ W)) — 모든 구성의 접근 trace와 모든 전이(접근 trace + 사건), 그리고 그 각각 뒤에 W의 사건열을
 * 이은 것. 그래프가 합친 이력에서는 `next(history)`가 더 앞에서 막을 수 있으므로 `legal`이 거부하는 trace는 내보내지 않고
 * `illegal`로 센다. 그래프 위에서 막힌 열은 `skipped`다.
 */
export function wSuite(graph, characterization, { label: name = defaultName, legal = () => true } = {}) {
  if (characterization.status !== 'closed') return { cases: [], skipped: 0, illegal: 0 }
  const net = network(graph)
  const traces = new Map()
  let skipped = 0
  let illegal = 0
  const bases = net.nodes.flatMap((node, position) => basesOf(net, node, position))
  for (const base of bases) {
    if (base.trace.length > 0) traces.set(stableStringify(base.trace), { trace: base.trace, observations: base.observations })
    for (const sequence of characterization.sequences) {
      const tail = walkFrom(net, base.at, sequence)
      const full = [...base.trace, ...sequence]
      if (tail === null) skipped += 1
      else if (legal(full)) traces.set(stableStringify(full), { trace: full, observations: [...base.observations, ...tail] })
      else illegal += 1
    }
  }
  return { cases: asCases([...traces.values()], 'W', name), skipped, illegal }
}

/** 다른 trace의 앞부분인 trace는 그 trace가 이미 지난다 — 같은 기대를 한 번 더 돌릴 뿐이다. */
function withoutPrefixes(chosen) {
  const keys = chosen.map(({ trace }) => trace.map(stableStringify))
  const isPrefix = (short, long) => short.length < long.length && short.every((key, position) => key === long[position])
  return chosen.filter((_, position) => !keys.some((other) => isPrefix(keys[position], other)))
}

function asCases(chosen, prefix, name) {
  return withoutPrefixes(chosen)
    .map(({ trace, observations }) => ({
      id: `${prefix}${sha256(stableStringify(trace)).slice(0, 12)}`,
      label: trace.map(name).join(' · '),
      trace,
      observations,
    }))
    .sort((left, right) => left.trace.length - right.trace.length || compare(left.label, right.label))
}

const isSubsequence = (kinds, tuple) => {
  let matched = 0
  for (const kind of kinds) if (matched < tuple.length && kind === tuple[matched]) matched += 1
  return matched === tuple.length
}

/** 사건 종류 t-튜플을 순서대로 지나는 가장 짧은 합법 trace — (구성, 맞춘 개수) 위의 너비 우선 탐색. */
function shortestThrough(net, tuple) {
  const width = tuple.length + 1
  const parent = new Map([[0, null]])
  const queue = [0]
  for (let head = 0; head < queue.length; head += 1) {
    const state = queue[head]
    const position = Math.floor(state / width)
    const matched = state % width
    if (matched === tuple.length) {
      const edges = []
      for (let cursor = state; parent.get(cursor) !== null; cursor = parent.get(cursor).from) edges.push(parent.get(cursor).edge)
      return edges.reverse()
    }
    for (const [, { edge, to }] of net.sorted[position]) {
      const next = to * width + matched + (kindOf(edge.event) === tuple[matched] ? 1 : 0)
      if (!parent.has(next)) {
        parent.set(next, { from: state, edge })
        queue.push(next)
      }
    }
  }
  return null
}

/** 이 사건 종류가 튜플을 얼마나 앞으로 보내는가 — 더 나아간 튜플일수록 값이 크다. */
function advanceScore(tuples, progress, kind) {
  let score = 0
  tuples.forEach((tuple, position) => {
    if (progress[position] < tuple.length && tuple[progress[position]] === kind) score += (progress[position] + 1) ** 2
  })
  return score
}

/** 열린 튜플을 가장 많이 앞으로 보내는 사건을 매 걸음 고르는 걷기 — 한 trace가 여러 튜플을 지나게 한다. */
function greedyWalk(net, tuples) {
  const progress = tuples.map(() => 0)
  const edges = []
  let at = 0
  for (let step = 0; step < MAX_WALK; step += 1) {
    let best = null
    let gain = 0
    for (const [, hop] of net.sorted[at]) {
      const kind = kindOf(hop.edge.event)
      const score = advanceScore(tuples, progress, kind)
      if (score > gain) {
        gain = score
        best = hop
      }
    }
    if (best === null) break
    const kind = kindOf(best.edge.event)
    tuples.forEach((tuple, position) => {
      if (progress[position] < tuple.length && tuple[progress[position]] === kind) progress[position] += 1
    })
    edges.push(best.edge)
    at = best.to
  }
  return edges
}

/**
 * 사건 순서 t-way — 모델이 허용하는 사건 종류 t-튜플(떨어져 있어도 순서만 맞으면 된다) 가운데 주어진 trace들이 이미 지나는 것과
 * 빠진 것을 센다. 빠진 튜플은 가장 짧은 합법 trace로 덮고(탐욕), 이 trace들이 `cases`다. 허용되지 않는 순서는 요구하지 않는다.
 * 그래프가 합친 이력에서 얻은 trace를 `next(history)`가 막으면(`legal`) 그 튜플은 `unplaced`로 세고 요구에서 뺀다.
 */
export function orderWaysCover(graph, traces, { label: name = defaultName, t = 3, maxTuples = MAX_TUPLES, legal = () => true } = {}) {
  if (graph.capped !== null) return cappedReport(graph)
  if (!Number.isSafeInteger(t) || t < 1 || t > MAX_T) return { status: 'invalid', t, reason: `t must be an integer from 1 to ${MAX_T}` }
  const net = network(graph)
  const kinds = [...new Set(net.nodes.flatMap((node) => node.edges.map((edge) => kindOf(edge.event))))].sort()
  const total = kinds.length ** t
  if (total > maxTuples) {
    return { status: 'incomplete', t, kinds: kinds.length, reason: `${total} ordered ${t}-tuples of ${kinds.length} event kinds exceed the ${maxTuples} budget` }
  }
  const feasible = []
  const through = new Map()
  let unplaced = 0
  const build = (prefix) => {
    if (prefix.length === t) {
      const edges = shortestThrough(net, prefix)
      if (edges === null) return
      if (legal(edges.map((edge) => edge.event))) {
        feasible.push(prefix)
        through.set(prefix.join('\u0000'), edges)
      } else {
        unplaced += 1
      }
      return
    }
    for (const kind of kinds) build([...prefix, kind])
  }
  build([])
  const given = traces.map((trace) => trace.map(kindOf))
  const missing = feasible.filter((tuple) => !given.some((kindsOfTrace) => isSubsequence(kindsOfTrace, tuple)))
  const open = new Set(missing.keys())
  const chosen = []
  const coveredBy = (edges) => {
    const kindsOfWalk = edges.map((edge) => kindOf(edge.event))
    return [...open].filter((position) => isSubsequence(kindsOfWalk, missing[position]))
  }
  const take = (edges, covered) => {
    for (const position of covered) open.delete(position)
    chosen.push({ trace: edges.map((edge) => edge.event), observations: edges.map((edge) => edge.observation) })
  }
  while (open.size > 0) {
    const walk = greedyWalk(net, [...open].map((position) => missing[position]))
    const covered = coveredBy(walk)
    if (covered.length > 0 && legal(walk.map((edge) => edge.event))) take(walk, covered)
    else {
      // 걷기가 아무것도 못 덮거나 환경이 막으면 남은 튜플 하나의 최단 합법 trace로 반드시 나아간다
      const edges = through.get(missing[Math.min(...open)].join('\u0000'))
      take(edges, coveredBy(edges))
    }
  }
  return {
    status: 'closed',
    t,
    kinds: kinds.length,
    feasible: feasible.length,
    covered: feasible.length - missing.length,
    missing: missing.length,
    unplaced,
    cases: asCases(chosen, 'S', name),
  }
}

function leavesOf(value, path, found = []) {
  if (Array.isArray(value)) {
    found.push([`${path}.length`, value.length])
    return found
  }
  if (isRecord(value)) {
    for (const [key, field] of Object.entries(value)) leavesOf(field, `${path}.${key}`, found)
    return found
  }
  found.push([path, value])
  return found
}

/** 경로마다 본 값들(문자열 키 → 값). */
function valuesByPath(states) {
  const values = new Map()
  for (const [path, value] of states.flat()) {
    const seen = values.get(path) ?? new Map()
    seen.set(stableStringify(value), value)
    values.set(path, seen)
  }
  return values
}

/** 곱 안에서 모델이 닿지 않는 조합 몇 개 — 자릿수를 올리는 순서(마지막 잎이 가장 빨리 돈다)로 훑는다. */
function unreachableSample(varying, reachable, product, constants) {
  if (product > MAX_SAMPLE_PRODUCT) return []
  const options = varying.map(([path, seen]) => [path, [...seen].sort(([left], [right]) => compare(left, right))])
  const cursor = options.map(() => 0)
  const sample = []
  const advance = () => {
    for (let position = options.length - 1; position >= 0; position -= 1) {
      cursor[position] += 1
      if (cursor[position] < options[position][1].length) return
      cursor[position] = 0
    }
  }
  for (let step = 0n; step < product && sample.length < EXAMPLES; step += 1n) {
    const picked = options.map(([path, choices], position) => [path, choices[cursor[position]]])
    if (!reachable.has(stableStringify(Object.fromEntries(picked.map(([path, [key]]) => [path, key]))))) {
      sample.push({ ...constants, ...Object.fromEntries(picked.map(([path, [, value]]) => [path, value])) })
    }
    advance()
  }
  return sample
}

const byPath = ([left], [right]) => compare(left, right)

/** 같은 모양(잎 경로 집합)의 상태들 — 한 생성자가 만들 수 있는 조합과 모델이 닿은 조합. */
function shapeDensity(group, named) {
  const varying = [...valuesByPath(group)].filter(([, seen]) => seen.size > 1).sort(byPath)
  const names = new Set(varying.map(([path]) => path))
  const reachable = new Set(
    group.map((leaves) => stableStringify(Object.fromEntries(leaves.filter(([path]) => names.has(path)).map(([path, value]) => [path, stableStringify(value)])))),
  )
  const product = varying.reduce((count, [, seen]) => count * BigInt(seen.size), 1n)
  // 모양이 여럿이면 어느 생성자의 조합인지 보이도록 값이 하나뿐인 잎(`$` 태그 등)을 예에 싣는다
  const constants = named ? Object.fromEntries(group[0].filter(([path]) => !names.has(path))) : {}
  return { product, reachable: reachable.size, sample: unreachableSample(varying, reachable, product, constants) }
}

/**
 * 도달 밀도 — 상태의 잎(경로별 값)이 낼 수 있는 조합의 곱과 모델이 실제로 닿는 상태 수를 비교한다. 곱에 있고 닿지 않는
 * 조합은 타입으로 표현 못 하게 막을 후보(또는 `impossible` 주장의 증거)다. 생성자마다 필드가 다르므로 모양(잎 경로 집합)별로
 * 세어 더한다. 값이 하나뿐인 잎은 곱에 영향이 없어 뺀다.
 */
export function reachabilityDensity(graph) {
  if (graph.capped !== null) return cappedReport(graph)
  const states = graph.nodes.map((node) => leavesOf(toPlain(node.state), 'state'))
  const shapes = new Map()
  for (const leaves of states) {
    const shape = leaves.map(([path]) => path).join('\u0000')
    shapes.set(shape, [...(shapes.get(shape) ?? []), leaves])
  }
  const parts = [...shapes.values()].map((group) => shapeDensity(group, shapes.size > 1))
  const product = parts.reduce((sum, part) => sum + part.product, 0n)
  const reachable = parts.reduce((sum, part) => sum + part.reachable, 0)
  const varying = [...valuesByPath(states)].filter(([, seen]) => seen.size > 1).sort(byPath)
  return {
    status: 'closed',
    basis: 'a state is its leaf values (arrays count by length), counted per constructor shape; leaves with one value are left out',
    leaves: varying.map(([path, seen]) => ({ path, values: seen.size })),
    product: product.toString(),
    reachable,
    unreachable: (product - BigInt(reachable)).toString(),
    sample: parts.flatMap((part) => part.sample).slice(0, EXAMPLES),
  }
}

/** `space` 보고용 한 덩어리 — 시험 case와 내부 표는 빼고 세어서 싣는다. */
export function analyzeConfigurations(graph, { traces = [], label, orderWays: t = 3, legal } = {}) {
  const quotient = stateQuotient(graph, { label })
  const { sequences: _sequences, ...characterization } = characterizationSet(graph, quotient, { label })
  const { cases, ...order } = orderWaysCover(graph, traces, { label, t, legal })
  return {
    quotient,
    independence: eventIndependence(graph, { label }),
    characterization,
    orderWays: { ...order, ...(cases ? { extraCases: cases.length } : {}) },
    reachability: reachabilityDensity(graph),
  }
}
