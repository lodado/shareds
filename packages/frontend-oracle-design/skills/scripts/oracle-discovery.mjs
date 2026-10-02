#!/usr/bin/env node

// Discovery-driven closure — 선언한 오라클 공간 Ω를 결정론적으로 검증하고(L1~L5), 선언한 탐색 연산자 E로 Ω 밖을
// 공격해 후보를 모으고(L6), 운영 이상을 다시 공간에 비춰 본다(L7). 결론은 언제나 조건부다: "선언한 Ω·E·F·C 아래에서
// 닫혔다"이지 "버그가 없다"가 아니다. 새 상태 머신은 없다 — 판정 보고서는 증거 파일이고, Delivery 상태는
// oracle-run.mjs가 계속 소유한다. 후보는 자동으로 공간에 들어가지 않는다: 사람의 결정(discoveryDecisions)과 새 리비전을
// 거친다. 도구는 결정을 쓰지 않는다.

import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual, parseArgs } from 'node:util'
import { ensureBend } from './ensure-bend.mjs'
import {
  anchoredSection,
  checkAdequacy,
  conformWorld,
  evaluateWorlds,
  exploreInput,
  EXPLORER_SCHEMA,
  loadWorld,
  modelInput,
  searchAdequacy,
  triageCandidates,
} from './oracle-adequacy.mjs'
import { parseCaseSpace } from './oracle-frames.mjs'
import { sha256, stableStringify } from './oracle-fs.mjs'
import {
  checkConformance,
  classifyTrace,
  compileBend,
  enumerateSpace,
  loadModel,
  MAX_BOUND,
  observeTrace,
  proveLaws,
  transitionCover,
} from './oracle-model.mjs'
import {
  AI_OPERATORS,
  DECLARED_OPERATORS,
  derivePackage,
  inputsDigestOf,
  loadPackage,
  OPERATOR_IDS,
  packageInputs,
  packageIssues,
  projectCard,
  requirementMapping,
  sourcePath,
} from './oracle-package.mjs'
import { defSignature, parseBendTypes, toPlain, toRuntime, typeIR } from './oracle-types.mjs'

export const DISCOVERY_VERSION = 1
const SCRIPT = fileURLToPath(import.meta.url)
const REGISTER = fileURLToPath(new URL('oracle-mutation-register.mjs', import.meta.url))
const MAX_PERTURBATIONS = 5000
const MUTANT_MARK = '__ORACLE_MUTANT_LOADED__'
const EXAMPLES = 3

/**
 * 탐색 연산자 카탈로그 E. layer: deterministic(같은 입력이면 같은 결과) · declared(도구가 일반적으로 만들 수 없는 계열 —
 * 모델이 표현한다는 선언을 기계로 확인) · ai(비결정 — 기록된 실행만 센다). target: 무엇을 공격하는가.
 */
export const OPERATORS = [
  {
    id: 'requirement-coverage',
    layer: 'deterministic',
    target: 'requirements',
    attacks: 'sentences of an authoritative source that no requirement quotes',
  },
  {
    id: 'space-cross-check',
    layer: 'deterministic',
    target: 'space',
    attacks:
      'declared axis values, value pairs and state transitions the model never produces, pairs split across the world and the behavior model, and transitions the model decides that the declaration lacks',
  },
  {
    id: 'observation-sufficiency',
    layer: 'deterministic',
    target: 'model',
    attacks: 'two worlds alike on every coordinate and observation that a goal judges differently',
  },
  { id: 'goal-implication', layer: 'deterministic', target: 'model', attacks: 'worlds every row allows that break a goal' },
  { id: 'goal-witness', layer: 'deterministic', target: 'model', attacks: 'a contract that forbids the normal path or itself' },
  {
    id: 'assumption-sensitivity',
    layer: 'deterministic',
    target: 'model',
    attacks: 'what if each assumption is false — goals it alone supports, worlds it hides',
  },
  {
    id: 'temporal-order',
    layer: 'deterministic',
    target: 'model',
    attacks: 'event orders that change or pass through different observations while the world treats order as n/a',
  },
  {
    id: 'trace-extension',
    layer: 'deterministic',
    target: 'model',
    attacks: 'behaviour patterns that appear only past the declared bound',
  },
  {
    id: 'boundary-perturbation',
    layer: 'deterministic',
    target: 'product',
    attacks: 'event field values at 0 and past the largest value the space uses, where the environment forbids them',
  },
  {
    id: 'order-perturbation',
    layer: 'deterministic',
    target: 'product',
    attacks: 'duplicated, swapped and early events the environment forbids (rapid repeat, reordering, response before request)',
  },
  {
    id: 'projection-residue',
    layer: 'deterministic',
    target: 'product',
    attacks: 'product state that varies while the observation stays the same',
  },
  {
    id: 'world-model-gap',
    layer: 'deterministic',
    target: 'product',
    attacks: 'product results the world model calls impossible',
  },
  { id: 'mutation', layer: 'deterministic', target: 'oracle', attacks: 'declared faults the oracle must detect' },
  {
    id: 'metamorphic',
    layer: 'deterministic',
    target: 'model+product',
    attacks: 'relations between f(x) and f(T(x)) on in-space pairs',
  },
  { id: 'dependency-failure', layer: 'declared', target: 'model', attacks: 'timeouts, errors, partial or malformed responses' },
  { id: 'latency', layer: 'declared', target: 'model', attacks: 'late, reordered or slow completions' },
  { id: 'environment-variation', layer: 'declared', target: 'model', attacks: 'browser, device, viewport, input mode' },
  { id: 'malformed-input', layer: 'declared', target: 'model', attacks: 'input the product must reject' },
  { id: 'concurrency', layer: 'declared', target: 'model', attacks: 'overlapping operations, tabs, devices' },
  {
    id: 'ai-explorer',
    layer: 'ai',
    target: 'card',
    attacks: 'situations where every row passes and the user is still harmed',
  },
  {
    id: 'cross-agent',
    layer: 'ai',
    target: 'space',
    attacks: 'hidden assumptions and axes a domain expert would add',
  },
]

class CliError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

const listItems = (list) => {
  const items = []
  for (let cursor = list; cursor?.$ === 'Con'; cursor = cursor.tail) items.push(cursor.head)
  return items
}
const listOf = (items) => items.reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' })
const label = (event) => {
  const fields = Object.entries(event ?? {})
    .filter(([key]) => key !== '$')
    .map(([key, value]) => `${key}:${JSON.stringify(value)}`)
  return fields.length === 0 ? event?.$ : `${event.$}{${fields.join(',')}}`
}
const traceLabel = (trace) => trace.map(label).join(' · ')

/** 후보 ID — 연산자와 내용 키에서만 나온다(실행 시각·순서 없음). 같은 현상은 리비전이 바뀌어도 같은 ID다. */
export function candidateId(operator, key) {
  return `C-${sha256(stableStringify({ operator, key })).slice(0, 10)}`
}

function candidate({ operator, cls, key, summary, evidence = {}, reproducible = true }) {
  return { id: candidateId(operator, key), operator, class: cls, summary, reproducible, evidence }
}

// ── space-cross-check: 선언한 공간(Space discovery 기록) ↔ Bend 공간 ──────────────────────────────────────────────

/** `## State Model` → { states, events, transitions } — 없으면 null. oracle-frames.mjs의 표 문법과 같다. */
export function declaredStateModel(text) {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.trim() === '## State Model')
  if (start === -1) return null
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  const section = lines.slice(start + 1, end === -1 ? lines.length : end)
  const list = (name) =>
    (section.find((line) => line.trim().startsWith(`- ${name}:`)) ?? '')
      .split(':')
      .slice(1)
      .join(':')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  const transitions = section
    .filter((line) => line.trim().startsWith('|'))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim()),
    )
    .filter(([from]) => from && from !== 'From' && !/^:?-+:?$/.test(from))
    .map(([from, event, to]) => ({ from, event, to }))
  return { states: list('States'), events: list('Events'), transitions }
}

/** 한 trace를 모델로 다시 걸어 단계마다 런타임 값(이전 상태·사건·다음 상태)을 얻는다 — 분류 def가 읽는다. */
function runtimeSteps(model, trace) {
  const raw = []
  let state = model.init()
  return trace.map((event) => {
    const match = listItems(model.next(listOf(raw))).find((choice) => isDeepStrictEqual(toPlain(choice), event))
    const after = model.step(state, match)
    const step = { before: state, event: match, after, label: label(event) }
    raw.push(match)
    state = after
    return step
  })
}

/** 가정이 지운 세계에서 거짓이 된 가정 — 쌍·값이 왜 빠졌는지의 근거. */
const rejectedBy = (list) =>
  [
    ...new Set(
      list.flatMap((world) =>
        Object.entries(world.truth ?? {})
          .filter(([id, holds]) => /^A\d+$/.test(id) && !holds)
          .map(([id]) => id),
      ),
    ),
  ].sort()

/** 번역표 조회 — 선언 값을 세계 값이나 분류 생성자로 옮긴다. 값·쌍 점검이 함께 쓴다. */
function crossLookup({ caseSpace, mapping, worlds, traces, classify, coordinates = [] }) {
  const maps = mapping.dimensions ?? {}
  const dimensions = caseSpace.families.filter((entry) => !entry.excluded && entry.dimension)
  const kindOf = (dimension) => {
    const entry = maps[dimension.dimension]
    if (entry?.world) return 'world'
    if (entry?.classify) return 'behavior'
    return null
  }
  const target = (dimension, value) => maps[dimension.dimension]?.values?.[value]
  const mapped = (dimension, value) => kindOf(dimension) !== null && target(dimension, value) !== undefined
  const worldHas = (world, dimension, value) => world.plain[maps[dimension.dimension].world] === target(dimension, value)
  // 한 trace가 보인 선언 값 — 단계마다 분류 def가 그 단계의 값을 말한다
  const behavior = dimensions.filter((dimension) => kindOf(dimension) === 'behavior')
  const shown = traces.map(
    (trace) =>
      new Set(
        trace.steps.flatMap((step) =>
          behavior.map(
            (dimension) => `${dimension.dimension}=${classify(maps[dimension.dimension].classify, step.before, step.event)}`,
          ),
        ),
      ),
  )
  const traceHas = (seen, dimension, value) => seen.has(`${dimension.dimension}=${target(dimension, value)}`)
  return { dimensions, worlds, traces, coordinates, maps, kindOf, target, mapped, worldHas, shown, traceHas }
}

/** 순서와 무관한 쌍 이름 — 결합 커버와 쌍 점검이 같은 열쇠로 만난다. */
const pairKey = (left, right) => [left, right].sort().join(' × ')

/**
 * 결합 커버 — 세계 축(테스트가 설정하는 필드)과 행동 축의 값 쌍마다, 그 세계 값을 가진 가능한 설정 위에서 그 행동 값을 보이는
 * trace를 한 번 돌린다. 쌍을 가장 많이 덮는 (설정, trace)를 차례로 고른다(같으면 짧은 trace, 먼저 나온 것). 기대값은 그
 * trace에 대해 모델이 계산한 그대로다 — 결합 케이스는 "행동이 그 세계 조건과 무관하다"는 주장을 시험한다.
 */
function jointCover(lookup) {
  const settable = lookup.dimensions.filter(
    (dimension) => lookup.kindOf(dimension) === 'world' && lookup.coordinates.includes(lookup.maps[dimension.dimension].world),
  )
  const behavior = lookup.dimensions.filter((dimension) => lookup.kindOf(dimension) === 'behavior')
  const plain = (dimension) => dimension.choices.filter((choice) => !choice.error && lookup.mapped(dimension, choice.value))
  const shownValues = behavior.flatMap((dimension) =>
    plain(dimension)
      .filter((choice) => lookup.shown.some((seen) => lookup.traceHas(seen, dimension, choice.value)))
      .map((choice) => [dimension, choice]),
  )
  const valid = lookup.worlds.filter((world) => world.valid)
  const worldValues = settable.flatMap((dimension) =>
    plain(dimension)
      .filter((choice) => valid.some((world) => lookup.worldHas(world, dimension, choice.value)))
      .map((choice) => [dimension, choice]),
  )
  const name = ([dimension, choice]) => `${dimension.dimension}=${choice.value}`
  const required = new Set(worldValues.flatMap((world) => shownValues.map((value) => pairKey(name(world), name(value)))))
  const settings = [
    ...new Map(
      valid.map((world) => {
        const setting = Object.fromEntries(lookup.coordinates.map((field) => [field, world.plain[field]]))
        return [stableStringify(setting), setting]
      }),
    ),
  ].sort(([left], [right]) => (left < right ? -1 : Number(left > right)))
  const pairsOf = (setting, index) =>
    worldValues
      .filter(([dimension, choice]) => setting[lookup.maps[dimension.dimension].world] === lookup.target(dimension, choice.value))
      .flatMap((world) =>
        shownValues
          .filter(([dimension, choice]) => lookup.traceHas(lookup.shown[index], dimension, choice.value))
          .map((value) => pairKey(name(world), name(value))),
      )
  const remaining = new Set(required)
  const chosen = []
  while (remaining.size > 0) {
    let best = null
    for (const [, setting] of settings)
      lookup.traces.forEach((trace, index) => {
        const gain = pairsOf(setting, index).filter((pair) => remaining.has(pair))
        const better = !best || gain.length > best.gain.length || (gain.length === best.gain.length && trace.trace.length < best.trace.trace.length)
        if (gain.length > 0 && better) best = { setting, trace, gain }
      })
    if (!best) break
    for (const pair of best.gain) remaining.delete(pair)
    chosen.push(best)
  }
  const literal = (setting) => Object.entries(setting).map(([field, value]) => `${field}=${String(value)}`).join(' ')
  return {
    required: required.size,
    covered: required.size - remaining.size,
    pairs: new Set([...required].filter((pair) => !remaining.has(pair))),
    cases: chosen.map(({ setting, trace }) => ({
      id: `J${sha256(stableStringify({ coordinates: setting, trace: trace.trace })).slice(0, 12)}`,
      label: `${literal(setting)} · ${trace.label}`,
      coordinates: setting,
      trace: trace.trace,
      observations: trace.observations,
    })),
  }
}

/** 선언 값 하나 — 대응이 없음·모델이 만들지 않음·세계가 갖지 않음·가정이 전부 지움이면 후보, 덮였으면 null. */
function valueFinding(lookup, dimension, choice) {
  const name = `${dimension.dimension}=${choice.value}`
  if (!lookup.mapped(dimension, choice.value))
    return ['new-axis', { unmapped: name }, `${name} has no counterpart in the world or the behavior model — map it in crossCheck or add it to the model`, { value: name }]
  if (lookup.kindOf(dimension) === 'behavior') {
    if (lookup.shown.some((seen) => lookup.traceHas(seen, dimension, choice.value))) return null
    return ['new-axis', { unreached: name }, `${name} is declared, but the behavior model never produces it`, { value: name }]
  }
  const having = lookup.worlds.filter((world) => lookup.worldHas(world, dimension, choice.value))
  if (having.length === 0)
    return ['new-axis', { absent: name }, `${name} maps to ${String(lookup.target(dimension, choice.value))}, which no world takes`, { value: name }]
  if (having.some((world) => world.valid)) return null
  const by = rejectedBy(having)
  return ['assumption-risk', { excluded: name }, `${name} is declared, but ${by.join(', ')} excludes every world with it`, { value: name, by }]
}

/** 선언 차원의 2-way 값 쌍 전부 — 오류 값([error])은 조합하지 않는다. */
function valuePairs(dimensions) {
  const plain = (dimension) => dimension.choices.filter((choice) => !choice.error)
  return dimensions.flatMap((first, index) =>
    dimensions
      .slice(index + 1)
      .flatMap((second) => plain(first).flatMap((a) => plain(second).map((b) => [[first, a], [second, b]]))),
  )
}

/** 값 쌍 하나의 자리: unmapped · joint(결합 케이스가 덮음) · cross(아무도 함께 돌리지 않음) · world · excluded · traces · unreached. */
function pairPlace(lookup, [first, a], [second, b], joint) {
  if (!lookup.mapped(first, a.value) || !lookup.mapped(second, b.value)) return { place: 'unmapped' }
  if (lookup.kindOf(first) !== lookup.kindOf(second)) {
    const key = pairKey(`${first.dimension}=${a.value}`, `${second.dimension}=${b.value}`)
    return { place: joint.pairs.has(key) ? 'joint' : 'cross' }
  }
  if (lookup.kindOf(first) === 'world') {
    const having = lookup.worlds.filter(
      (world) => lookup.worldHas(world, first, a.value) && lookup.worldHas(world, second, b.value),
    )
    if (having.some((world) => world.valid)) return { place: 'world' }
    return { place: 'excluded', by: rejectedBy(having) }
  }
  const together = lookup.shown.some((seen) => lookup.traceHas(seen, first, a.value) && lookup.traceHas(seen, second, b.value))
  return { place: together ? 'traces' : 'unreached' }
}

const PAIR_COUNTERS = {
  unmapped: 'unmapped',
  joint: 'coveredByJoint',
  cross: 'crossTerm',
  world: 'coveredByWorld',
  traces: 'coveredByTraces',
  unreached: 'unreached',
}

/** 값 쌍 점검 — 쌍마다 자리를 세고, 덮이지 않은 쌍은 차원 쌍마다 한 후보로 묶는다. */
function pairFindings(lookup, joint) {
  const pairs = { total: 0, coveredByWorld: 0, coveredByTraces: 0, coveredByJoint: 0, crossTerm: 0, unmapped: 0, excluded: [], unreached: 0 }
  const groups = { cross: new Map(), unreached: new Map() }
  for (const [first, second] of valuePairs(lookup.dimensions)) {
    const pair = `${first[0].dimension}=${first[1].value} × ${second[0].dimension}=${second[1].value}`
    const { place, by } = pairPlace(lookup, first, second, joint)
    pairs.total += 1
    if (place === 'excluded') pairs.excluded.push({ pair, by })
    else pairs[PAIR_COUNTERS[place]] += 1
    const group = groups[place]
    if (!group) continue
    const names = [first[0].dimension, second[0].dimension].sort()
    const key = names.join(' × ')
    group.set(key, { dimensions: names, pairs: [...(group.get(key)?.pairs ?? []), pair] })
  }
  const findings = [
    ...[...groups.cross.values()].map(({ dimensions: names, pairs: list }) => [
      'cross-term',
      { crossTerm: names },
      `${names.join(' × ')}: ${list.length} value pairs split across the world and the behavior model that no joint case can run (the world field is not one the test sets) — make it settable, add the axis to the model's events, or decide them independent with a reason`,
      { dimensions: names, pairs: list },
    ]),
    ...[...groups.unreached.values()].map(({ dimensions: names, pairs: list }) => [
      'new-axis',
      { unreachedPairs: names },
      `${names.join(' × ')}: ${list.length} declared value pairs no trace produces together`,
      { dimensions: names, pairs: list },
    ]),
  ]
  return { pairs, findings }
}

/** 모델의 전이를 선언 이름으로 추상화한다 — 대응 없는 생성자는 `<생성자>`, 증인은 그 전이를 처음 밟은 trace 앞부분. */
function modelTransitions(machine, traces, classify) {
  const taken = new Map()
  if (!machine.phase || !machine.step) return taken
  const named = (map, value) => Object.keys(map).find((name) => map[name] === value) ?? `<${value}>`
  const states = machine.states ?? {}
  const events = machine.events ?? {}
  for (const trace of traces)
    trace.steps.forEach((step, index) => {
      const from = named(states, classify(machine.phase, step.before))
      const event = named(events, classify(machine.step, step.before, step.event))
      const edge = `${from} -${event}-> ${named(states, classify(machine.phase, step.after))}`
      if (!taken.has(edge)) taken.set(edge, trace.steps.slice(0, index + 1).map((entry) => entry.label ?? '?').join(' · '))
    })
  return taken
}

/** 상태표 점검 — 대응 없는 상태·사건, 선언에 없는 모델 전이(silent-decision), 모델이 밟지 않는 선언 전이. */
function transitionFindings(stateModel, machine = {}, traces, classify) {
  const states = machine.states ?? {}
  const events = machine.events ?? {}
  const declaredStates = [...new Set([...stateModel.states, ...stateModel.transitions.flatMap(({ from, to }) => [from, to])])]
  const declaredEvents = [...new Set([...stateModel.events, ...stateModel.transitions.map(({ event }) => event)])]
  const findings = [
    ...declaredStates
      .filter((state) => states[state] === undefined)
      .map((name) => ['new-axis', { unmappedState: name }, `state ${name} has no counterpart in the behavior model — map it in crossCheck.stateModel or add it to the model`, { state: name }]),
    ...declaredEvents
      .filter((event) => events[event] === undefined)
      .map((name) => ['new-axis', { unmappedEvent: name }, `event ${name} has no counterpart in the behavior model — map it in crossCheck.stateModel or add it to the model`, { event: name }]),
  ]
  const taken = modelTransitions(machine, traces, classify)
  const edgeOf = ({ from, event, to }) => `${from} -${event}-> ${to}`
  const declared = new Set(stateModel.transitions.map(edgeOf))
  const silent = [...taken]
    .filter(([edge]) => !declared.has(edge))
    .sort(([left], [right]) => (left < right ? -1 : Number(left > right)))
  for (const [edge, witness] of silent) {
    const [from, rest] = edge.split(' -')
    const event = rest.split('-> ')[0]
    const declaredEmpty = !stateModel.transitions.some((entry) => entry.from === from && entry.event === event)
    const how = declaredEmpty ? ', a cell the declaration left empty' : ', which the declaration states differently'
    findings.push([
      'silent-decision',
      { transition: edge },
      `the model takes ${edge}${how} — confirm it as policy or fix the model (witness ${witness})`,
      { transition: edge, witness, declaredEmpty },
    ])
  }
  const mappedEdge = (entry) => [states[entry.from], states[entry.to], events[entry.event]].every((value) => value !== undefined)
  const unrealized = stateModel.transitions.filter((entry) => mappedEdge(entry) && !taken.has(edgeOf(entry)))
  for (const entry of unrealized)
    findings.push(['new-axis', { unrealized: edgeOf(entry) }, `the model never takes the declared transition ${edgeOf(entry)}`, { transition: edgeOf(entry) }])
  return {
    transitions: { declared: stateModel.transitions.length, model: taken.size, silent: silent.length, unrealized: unrealized.length },
    findings,
  }
}

const NO_STATE_MODEL = { transitions: { declared: 0, model: 0, silent: 0, unrealized: 0 }, findings: [] }

/**
 * 선언한 공간이 Bend 공간에 다 있는가, 거꾸로 모델이 선언에 없는 결정을 하는가. 선언한 축 값마다 세계 필드 값이나 분류
 * def의 생성자로 옮긴 번역표(crossCheck)를 따라:
 * - 값: 대응이 없거나(new-axis), 모델이 만들지 않거나(new-axis), 가정이 전부 지운다(assumption-risk).
 * - 값 쌍(2-way): 세계끼리는 가능한 세계가, 행동끼리는 한 trace가 함께 보이면 덮였다. 세계 축과 행동 축의 쌍은 두 모델이
 *   따로 열거해 함께 돈 적이 없다(cross-term, 차원 쌍마다 한 후보).
 * - 상태표: 모델의 전이를 선언 이름으로 추상화해, 선언에 없는 전이(silent-decision)와 대응이 없는 상태·사건을 낸다.
 * 번역표는 사람이 쓴 해석이다 — 결과는 판정이 아니라 결정할 후보다.
 */
export function crossCheckSpace({ caseSpace, stateModel = null, mapping = {}, worlds = [], traces = [], classify, coordinates = [] }) {
  const lookup = crossLookup({ caseSpace, mapping, worlds, traces, classify, coordinates })
  const joint = jointCover(lookup)
  const values = lookup.dimensions
    .flatMap((dimension) => dimension.choices.map((choice) => valueFinding(lookup, dimension, choice)))
    .filter(Boolean)
  const { pairs, findings: pairList } = pairFindings(lookup, joint)
  const machine = stateModel ? transitionFindings(stateModel, mapping.stateModel, traces, classify) : NO_STATE_MODEL
  return {
    status: 'run',
    summary: {
      values: lookup.dimensions.reduce((count, dimension) => count + dimension.choices.length, 0),
      pairs,
      transitions: machine.transitions,
    },
    joint: { required: joint.required, covered: joint.covered, cases: joint.cases },
    candidates: [...values, ...pairList, ...machine.findings].map(([cls, key, summary, evidence]) =>
      candidate({ operator: 'space-cross-check', cls, key, summary, evidence }),
    ),
  }
}

/**
 * space-cross-check 실행 — 버전 2 패키지의 선언 공간(spaceDiscovery 기록의 `## Case space`·`## State Model`)을 세계 열거와,
 * 행동 모델의 trace(bound까지의 공간 + 전이 커버)에 비춘다. 분류 def는 행동 모델 파일에 있다.
 */
export async function spaceCrossCheck({ loaded, bin, timeoutMs }) {
  const { pkg } = loaded
  if ((pkg.packageVersion ?? 1) < 2)
    return { status: 'not-applicable', reason: 'a version-1 package has no Space discovery record to compare', candidates: [] }
  if (!pkg.crossCheck)
    return {
      status: 'undeclared',
      reason: 'map the Space discovery record onto the model in crossCheck, or write the operator off with a sourced n/a',
      candidates: [],
    }
  const declaredPath = sourcePath(loaded, pkg.crossCheck.declared ?? pkg.spaceDiscovery)
  const text = declaredPath ? await readFile(declaredPath, 'utf8').catch(() => null) : null
  const caseSpace = text === null ? null : parseCaseSpace(text)
  if (!caseSpace)
    return { status: 'invalid', reason: 'the declared source has no ## Case space table of the confirmed axes', candidates: [] }
  const world = await loadWorld({ package: relative(loaded.root, loaded.path), cwd: loaded.root, bin, timeoutMs })
  if (world.result) return { status: 'not-run', reason: `the world cannot be enumerated: ${world.result.reason}`, candidates: [] }
  let traces = []
  let classify = () => null
  if (pkg.behavior) {
    const modelPath = sourcePath(loaded, pkg.behavior.model)
    const model = await loadModel({ model: modelPath, prefix: pkg.behavior.prefix, bin, timeoutMs })
    const space = enumerateSpace(model, { bound: pkg.behavior.bound })
    traces = [...space.cases, ...transitionCover(model, space).cases].map((entry) => ({
      label: entry.label,
      trace: entry.trace,
      observations: entry.observations,
      steps: runtimeSteps(model, entry.trace),
    }))
    const { exported } = await compileBend({ entry: modelPath, bin, timeoutMs })
    classify = (def, ...args) => {
      if (typeof exported[def] !== 'function')
        throw Object.assign(new Error(`${basename(modelPath)} does not define ${def}`), { code: 'CROSS_CHECK_DEF' })
      return exported[def](...args.map((argument) => structuredClone(argument)))?.$ ?? null
    }
  }
  // 상태표는 분석 에이전트가 따로 읽은 것일 수 있다(crossCheck.states) — 그러면 모델과 두 독립 해석을 비교한다
  const statesPath = pkg.crossCheck.states ? sourcePath(loaded, pkg.crossCheck.states) : declaredPath
  const statesText = statesPath === declaredPath ? text : await readFile(statesPath, 'utf8').catch(() => '')
  try {
    return crossCheckSpace({
      caseSpace,
      stateModel: declaredStateModel(statesText),
      mapping: pkg.crossCheck,
      worlds: evaluateWorlds(world.model, world.spec),
      traces,
      classify,
      coordinates: world.spec.coordinates,
    })
  } catch (error) {
    if (error.code === 'CROSS_CHECK_DEF') return { status: 'invalid', reason: error.message, candidates: [] }
    throw error
  }
}

/** 행동 모델 원문에서 타입 선언과 이름이 붙은 def만 — step·next·환경 로직은 싣지 않는다. */
function bendExcerpt(text, defs) {
  const blocks = text.split(/\n(?=\S)/)
  const wanted = (block) =>
    /^type\s/.test(block) || defs.some((def) => block.startsWith(`def ${def}(`) || block.startsWith(`def ${def}Of(`))
  return blocks.filter(wanted).join('\n').trimEnd()
}

/**
 * 번역표 검토 입력 — 선언(축 기록·분석 상태표), 모델의 타입과 분류 def, 번역표. 행동 로직(step·next)은 없다: 검토자는
 * 매핑이 선언의 뜻대로인지 보고, 모델이 무엇을 하는지는 보지 않는다. 이 바이트의 sha256이 crossCheck.reviewedBy와 맞아야
 * 그 검토를 현재 매핑에 대한 것으로 센다.
 */
export async function mappingInput({ loaded }) {
  const { pkg } = loaded
  const read = async (id) => {
    const path = id ? sourcePath(loaded, id) : null
    return path ? readFile(path, 'utf8').catch(() => '') : ''
  }
  const { reviewedBy: _review, ...mapping } = pkg.crossCheck ?? {}
  const classifiers = [
    ...Object.values(mapping.dimensions ?? {}).map((entry) => entry.classify),
    mapping.stateModel?.phase,
    mapping.stateModel?.step,
  ].filter(Boolean)
  const model = pkg.behavior ? await read(pkg.behavior.model) : ''
  const states = mapping.states ? await read(mapping.states) : ''
  return [
    '# Translation table review input',
    '',
    'Check that every declared value, state and event maps to the world value or constructor that means the same thing.',
    'Report each mapping you dispute, with the declared meaning and the constructor that would fit; do not judge the model.',
    '',
    '## Declared space (Space discovery record)',
    '',
    (await read(mapping.declared ?? pkg.spaceDiscovery)).trimEnd(),
    ...(states ? ['', '## Analyst state table', '', states.trimEnd()] : []),
    '',
    '## Model types and classifiers',
    '',
    '```python',
    bendExcerpt(model, classifiers),
    '```',
    '',
    '## World types',
    '',
    '```python',
    bendExcerpt(await read(pkg.world?.source), []),
    '```',
    '',
    '## Translation table',
    '',
    '```json',
    JSON.stringify({ crossCheck: mapping }, null, 2),
    '```',
    '',
  ].join('\n')
}

/** 번역표는 해석이다 — 모델을 쓰지 않은 분석 에이전트가 현재 매핑 입력(digest)을 검토한 기록이 있어야 한다. */
async function mappingReviewIssues(loaded) {
  const review = loaded.pkg.crossCheck?.reviewedBy
  if (!review?.agent || !review?.inputDigest)
    return ['cross-check-unreviewed: record crossCheck.reviewedBy {agent, inputDigest} from oracle-discovery.mjs mapping-input']
  if (review.inputDigest === sha256(await mappingInput({ loaded }))) return []
  return ['cross-check-unreviewed: the review is stale — the mapping or its inputs changed since it was reviewed']
}

/**
 * lock 전 관문 — 카드 lint가 부른다. 교차검증 후보마다 결정(discoveryDecisions)이 있어야 통과한다: 승격·범위 밖·위험 수용·
 * 기각을 그 출처와 함께. 모델이나 선언 기록을 고쳐 후보가 사라져도 된다. 버전 1 패키지는 관문이 없다. 매핑이 없는 버전 2
 * 패키지는 출처 있는 n/a로만 넘어간다.
 */
export async function crossCheckIssues({ loaded, bin, timeoutMs }) {
  const result = await spaceCrossCheck({ loaded, bin, timeoutMs })
  if (result.status === 'not-applicable') return []
  if (result.status === 'undeclared') {
    const writtenOff = loaded.pkg.operators?.['space-cross-check']?.startsWith('n/a:')
    return writtenOff ? [] : [`cross-check-undeclared: ${result.reason}`]
  }
  if (result.status !== 'run') return [`cross-check-${result.status}: ${result.reason}`]
  const reviewIssues = await mappingReviewIssues(loaded)
  if (result.candidates.length === 0) return reviewIssues
  const { derived } = await derivePackage(loaded, { bin, timeoutMs })
  const open = new Set(
    lifecycle(result.candidates, loaded.pkg, derived)
      .filter((record) => record.open)
      .map((record) => record.id),
  )
  return [
    ...reviewIssues,
    ...result.candidates
      .filter((entry) => open.has(entry.id))
      .map((entry) => `cross-check-undecided: ${entry.id} ${entry.class} — ${entry.summary}`),
  ]
}

/** card lint용 — 저장소 루트(cwd)에서 패키지를 읽고 설치된 Bend로 관문을 돈다(내려받지 않는다 — 없으면 unverified). */
export function crossCheckAtRoot(root = process.cwd()) {
  return async (packagePath) => {
    let loaded
    try {
      loaded = await loadPackage(packagePath, { root })
    } catch (error) {
      return [`cross-check-unverified: ${error.message}`]
    }
    if ((loaded.pkg.packageVersion ?? 1) < 2) return []
    let bin
    try {
      ;({ bin } = await ensureBend({
        download: () => {
          throw Object.assign(new Error('card lint never downloads Bend'), { code: 'BEND_NOT_INSTALLED' })
        },
      }))
    } catch (error) {
      return [`cross-check-unverified: Bend is not installed (${error.code ?? error.message})`]
    }
    return crossCheckIssues({ loaded, bin })
  }
}

// ── L1 Requirement Closure ─────────────────────────────────────────────────────────────────────────────────────────

const normalize = (text) => text.replaceAll(/\s+/g, ' ').trim()

/** 원문 절의 문장 — 제목 줄과 목록 표시를 걷어 내고 . ! ? : ; 뒤에서 끊는다. */
export function sourceSentences(section) {
  const body = section
    .split('\n')
    .filter((line) => !/^#+\s/.test(line))
    .map((line) => line.replace(/^\s*(?:\d+\.|[-*+])\s+/, ''))
    .join(' ')
  return normalize(body)
    .split(/(?<=[.!?:;])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

/** 위치의 절 — 앵커가 가리키는 제목이 없으면 null이다(파일 전체로 대신하지 않는다). */
function sectionAt(text, anchor) {
  if (text === null) return null
  if (!anchor) return text
  const found = text
    .split('\n')
    .some((line) => (line.match(/^#+\s(.*)$/)?.[1] ?? '').trim().toLowerCase().replaceAll(/\W+/g, '-') === anchor)
  return found ? anchoredSection(text, anchor) : null
}

/**
 * 요구사항마다 quote가 원문(출처 위치의 절)에 글자 그대로 있는지, 그리고 목표·정책·계약·N/A·행동 모델·metamorphic
 * 관계 가운데 하나 이상에 담겼는지(가정만이 담으면 assumed). 거꾸로, 권위 있는 원문의 문장 가운데 어떤 quote에도
 * 들어 있지 않은 문장은 requirement-coverage 후보다 — 목록을 빠뜨려 L1을 통과하는 길을 막는다.
 */
export async function requirementClosure(loaded) {
  const { pkg } = loaded
  const mapping = requirementMapping(pkg)
  const sections = new Map()
  const sectionOf = async (id) => {
    if (!sections.has(id)) {
      const source = pkg.sources.find((entry) => entry.id === id)
      const [, anchor] = (source?.location ?? '').split('#')
      const path = sourcePath(loaded, id)
      const text = path ? await readFile(path, 'utf8').catch(() => null) : null
      sections.set(id, sectionAt(text, anchor))
    }
    return sections.get(id)
  }
  const entries = []
  for (const requirement of pkg.requirements ?? []) {
    const section = await sectionOf(requirement.source)
    const verbatim = section !== null && normalize(section).includes(normalize(requirement.quote))
    const mappedBy = mapping.get(requirement.id) ?? []
    let status = 'mapped'
    if (section === null) status = 'source-missing'
    else if (mappedBy.length === 0) status = 'unmapped'
    else if (mappedBy.every((entry) => entry === 'N/A')) status = 'scoped-out'
    else if (mappedBy.every((entry) => entry === 'N/A' || /^A\d+$/.test(entry))) status = 'assumed'
    entries.push({ id: requirement.id, source: requirement.source, verbatim, status, mappedBy })
  }
  const quotes = (pkg.requirements ?? []).map((requirement) => normalize(requirement.quote ?? ''))
  const unquoted = []
  // Space discovery 기록은 축에 대한 사용자 답이다 — 용어·계열이 이미 싣고 있으니 문장마다 후보를 만들지 않는다
  for (const source of (pkg.sources ?? []).filter((entry) => entry.id !== pkg.spaceDiscovery)) {
    const location = source.location ?? ''
    if (source.kind === 'implementation-reference' || source.self || source.approval !== 'approved' || !location.startsWith('repo:'))
      continue
    if (/\.bend(?:#|$)/.test(location)) continue
    const section = await sectionOf(source.id)
    if (section === null) continue
    for (const sentence of sourceSentences(section))
      if (!quotes.some((quote) => quote.includes(sentence))) unquoted.push({ source: source.id, sentence })
  }
  const pass =
    entries.length > 0 &&
    entries.every((entry) => entry.verbatim && !['unmapped', 'source-missing'].includes(entry.status))
  return {
    status: pass ? 'pass' : 'fail',
    requirements: entries,
    unquoted,
    ...(entries.length === 0 ? { reason: 'no requirement inventory — list R* with verbatim quotes' } : {}),
  }
}

// ── 공간과 모델 도구 ───────────────────────────────────────────────────────────────────────────────────────────────

/** trace가 환경 안에 있는지 — 처음으로 벗어나는 위치(leaveAt)와 그때까지의 런타임 사건. */
function traceStatus(model, plainTrace) {
  const raw = []
  for (const [index, event] of plainTrace.entries()) {
    const allowed = listItems(model.next(listOf(raw)))
    const match = allowed.find((choice) => isDeepStrictEqual(toPlain(choice), event))
    if (!match) return { inSpace: false, leaveAt: index, raw }
    raw.push(match)
  }
  return { inSpace: true, raw }
}

function beyondBoundReachable(model, space) {
  return space.cases.some((entry) => {
    if (entry.trace.length < space.bound) return false
    const status = traceStatus(model, entry.trace)
    return status.inSpace && listItems(model.next(listOf(status.raw))).length > 0
  })
}

async function behaviorTypes(modelPath, prefix) {
  const text = await readFile(modelPath, 'utf8')
  const types = parseBendTypes(text)
  const step = defSignature(text, `${prefix}.step`)
  const observe = defSignature(text, `${prefix}.observe`)
  return {
    eventIR: typeIR(step?.params?.[1]?.type ?? '', types),
    observationIR: typeIR(observe?.returns ?? '', types),
  }
}

// ── 모델 수준 연산자 ───────────────────────────────────────────────────────────────────────────────────────────────

const CHECK_OPERATOR = {
  sufficiency: 'observation-sufficiency',
  'card-observable': 'observation-sufficiency',
  'card-implies-goal': 'goal-implication',
  example: 'goal-implication',
  'open-terms': 'goal-implication',
  'goal-witness': 'goal-witness',
  'world-nonempty': 'goal-witness',
  'card-satisfiable': 'goal-witness',
  'goal-falsifiable': 'assumption-sensitivity',
}
const CHECK_CLASS = {
  sufficiency: 'observation-gap',
  'card-observable': 'observation-gap',
  'card-implies-goal': 'weak-contract',
  example: 'example-flipped',
  'open-terms': 'open-term',
  'goal-witness': 'vacuous-contract',
  'world-nonempty': 'contradiction',
  'card-satisfiable': 'contradiction',
  'goal-falsifiable': 'assumption-hides-goal',
}

/** 적정성 결과 → 모델 수준 후보. 커널이 확인하지 않은 결과(unknown)는 후보가 아니라 연산자 미실행이다. */
function adequacyCandidates(adequacy, pkg) {
  const candidates = []
  for (const check of adequacy.checks ?? []) {
    if (check.status !== 'refuted' || !CHECK_OPERATOR[check.kind]) continue
    const fields = (check.differing ?? []).map(({ field }) => field)
    candidates.push(
      candidate({
        operator: CHECK_OPERATOR[check.kind],
        cls: CHECK_CLASS[check.kind],
        key: { check: check.kind, target: check.target, fields },
        summary: [
          `${check.kind} refuted`,
          check.target ? `for ${check.target}` : null,
          fields.length ? `— differing ${fields.join(', ')}` : null,
        ]
          .filter(Boolean)
          .join(' '),
        evidence: {
          counterexample: check.counterexample ?? check.pair ?? check.witness ?? null,
          differing: check.differing ?? [],
          suggestions: check.suggestions ?? [],
        },
      }),
    )
  }
  const assumptions = new Map((pkg.assumptions ?? []).map((row) => [row.id, row]))
  for (const entry of adequacy.sensitivity ?? []) {
    const row = assumptions.get(entry.assumption)
    const guarded = ['tested', 'monitored'].includes(row?.testability) && row?.status === 'confirmed'
    if (entry.brokenGoals.length > 0 && !guarded)
      candidates.push(
        candidate({
          operator: 'assumption-sensitivity',
          cls: 'assumption-risk',
          key: { assumption: entry.assumption, goals: entry.brokenGoals },
          summary: `goals ${entry.brokenGoals.join(', ')} rest on ${entry.assumption}, which is ${row?.testability ?? 'unregistered'}/${
            row?.status ?? 'unregistered'
          }`,
          evidence: { worlds: entry.worlds, reading: entry.reading },
        }),
      )
    else if (entry.brokenGoals.length === 0 && entry.cardAllows > 0 && !guarded)
      candidates.push(
        candidate({
          operator: 'assumption-sensitivity',
          cls: 'goal-gap-review',
          // the key names the assumption only: a world count moves whenever an unrelated field is added
          key: { assumption: entry.assumption },
          summary: `dropping ${entry.assumption} opens ${entry.cardAllows} worlds no goal judges — is one of them harmful?`,
          evidence: { worlds: entry.worlds },
        }),
      )
  }
  return candidates
}

/** 모델이 순서 의무를 계산했는데 세계가 order-timing을 n/a로 두었다 — 끝 상태 세계로 표현할 수 없는 축(Axis Breaker). */
function temporalCandidates(derived, pkg) {
  if (!derived.order) return { status: 'not-run', reason: 'no trace space (Bend not run)', candidates: [] }
  const hazard = pkg.hazards?.['order-timing'] ?? ''
  if (derived.order.total === 0 || hazard.startsWith('modeled:')) return { status: 'run', candidates: [] }
  const kinds = [...new Set(derived.order.obligations.map((entry) => entry.kind))].sort()
  return {
    status: 'run',
    candidates: [
      candidate({
        operator: 'temporal-order',
        cls: 'new-axis',
        key: { hazard: 'order-timing', kinds },
        summary: `the behavior model has ${derived.order.total} order obligations (${kinds.join(
          ', ',
        )}) but the world declares order-timing ${hazard || 'undisposed'} — promote a temporal ordering axis or scope it out`,
        evidence: { examples: derived.order.obligations.slice(0, EXAMPLES) },
      }),
    ],
  }
}

/** 관찰 변화의 모양 — 값의 크기와 무관하게 사건 종류와 변화 방식만 남긴다. 연속 두 걸음(bigram)이 패턴이다. */
export function stepPatterns(events, observations, initialValue) {
  const initial = stableStringify(initialValue)
  let previous = initial
  const steps = events.map((event, index) => {
    const current = stableStringify(observations[index])
    let change = 'replace'
    if (current === previous) change = 'none'
    else if (previous === initial) change = 'from-initial'
    else if (current === initial) change = 'to-initial'
    previous = current
    return `${event.$}:${change}`
  })
  if (steps.length === 1) return steps
  return steps.slice(1).map((step, index) => `${steps[index]} → ${step}`)
}

function signatures(space) {
  const found = new Map()
  for (const entry of space.cases)
    for (const gram of stepPatterns(entry.trace, entry.observations, space.initial)) if (!found.has(gram)) found.set(gram, entry)
  return found
}

/** bound 너머에서만 나타나는 행동 패턴 — 모델만으로 계산한다. bound를 늘리지 못하면(최대) 미실행으로 남긴다. */
function traceExtension(model, space, bound) {
  const extended = Math.min(bound + 2, MAX_BOUND)
  if (extended === bound) return { status: 'not-run', reason: `bound ${bound} is already the maximum`, candidates: [] }
  const wide = enumerateSpace(model, { bound: extended })
  if (!wide.complete)
    return { status: 'incomplete', reason: `the space at bound ${extended} stopped at its budget`, candidates: [] }
  const inside = signatures(space)
  const outside = signatures(wide)
  const novel = [...outside.keys()].filter((gram) => !inside.has(gram)).sort()
  return { status: 'run', extendedBound: extended, novel: novel.map((gram) => ({ pattern: gram, example: outside.get(gram).label })) }
}

/**
 * bound 너머에만 있는 패턴은 전수 공간이 보지 못한다. fast-check 표본이 그 패턴을 실제로 실행했으면 "표본으로 덮임"(열거가
 * 아니라 표본 — 잔여 위험에 남는다), 한 번도 실행하지 않았으면 후보다: bound나 표본 수를 늘리거나 범위를 결정한다.
 */
function rangeCandidates(extension, sampledPatterns, bound) {
  if (extension.status !== 'run') return { ...extension, candidates: [] }
  const sampled = new Set(sampledPatterns ?? [])
  return {
    status: 'run',
    extendedBound: extension.extendedBound,
    coveredBySampling: extension.novel.filter((entry) => sampled.has(entry.pattern)).map((entry) => entry.pattern),
    candidates: extension.novel
      .filter((entry) => !sampled.has(entry.pattern))
      .map((entry) =>
        candidate({
          operator: 'trace-extension',
          cls: 'range',
          key: { pattern: entry.pattern },
          summary: `the pattern "${entry.pattern}" appears only past the bound ${bound} and no fast-check sample executed it`,
          evidence: { example: entry.example, bound, extendedBound: extension.extendedBound },
        }),
      ),
  }
}

// ── 제품 수준 교란 ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * 환경이 허용하지 않는 사건을 공간의 trace에 끼운다: 필드 경계값(0, 공간이 쓴 최댓값+1), 중복, 인접 교환, 앞당김.
 * 공간 안에 남는 교란은 대응 검사가 이미 덮으므로 버린다. 결과는 제품에 돌릴 trace와 처음 벗어나는 위치다.
 */
export function perturbations(model, space) {
  const numeric = new Map()
  const example = new Map()
  for (const entry of space.cases)
    for (const event of entry.trace) {
      if (!example.has(event.$)) example.set(event.$, event)
      for (const [field, value] of Object.entries(event))
        if (field !== '$' && Number.isInteger(value))
          numeric.set(`${event.$}.${field}`, Math.max(numeric.get(`${event.$}.${field}`) ?? 0, value))
    }
  const out = new Map()
  let capped = false
  const add = (kind, key, trace) => {
    if (capped) return
    const id = stableStringify(trace)
    if (out.has(id)) return
    const status = traceStatus(model, trace)
    if (status.inSpace) return
    if (out.size >= MAX_PERTURBATIONS) {
      capped = true
      return
    }
    const at = kind === 'boundary' ? '' : `:${trace[status.leaveAt].$}`
    out.set(id, { kind, key: `${key}${at}`, trace, leaveAt: status.leaveAt })
  }
  for (const entry of space.cases) {
    const { trace } = entry
    for (let position = 0; position <= trace.length; position += 1) {
      const prefix = trace.slice(0, position)
      for (const [slot, max] of [...numeric].sort()) {
        const [tag, field] = slot.split('.')
        for (const [name, value] of [
          ['zero', 0],
          ['past-max', max + 1],
        ])
          add('boundary', `${slot}=${name}`, [...prefix, { ...example.get(tag), [field]: value }])
      }
    }
    for (let index = 0; index < trace.length; index += 1) {
      add('duplicate', 'duplicate', [...trace.slice(0, index + 1), trace[index], ...trace.slice(index + 1)])
      if (index + 1 < trace.length)
        add('swap', 'swap', [...trace.slice(0, index), trace[index + 1], trace[index], ...trace.slice(index + 2)])
      if (index > 0) add('early', 'early', [trace[index], ...trace.slice(0, index), ...trace.slice(index + 1)])
    }
  }
  return { list: [...out.values()], capped }
}

/** 교란 결과 → 후보: 환경이 배제한 사건에서 제품의 관찰이 바뀌었거나(명세되지 않은 동작) 예외가 났다. */
function perturbationCandidates(list, results) {
  const groups = new Map()
  list.forEach((entry, index) => {
    const result = results[index]
    let cls = null
    let detail = null
    if (result?.error) {
      cls = 'unhandled-event'
      detail = result.error
    } else if (!isDeepStrictEqual(result.observed[entry.leaveAt], result.observed[entry.leaveAt + 1])) {
      cls = 'unspecified-behavior'
      detail = { before: result.observed[entry.leaveAt], after: result.observed[entry.leaveAt + 1] }
    }
    if (!cls) return
    const operator = entry.kind === 'boundary' ? 'boundary-perturbation' : 'order-perturbation'
    const id = `${operator}|${cls}|${entry.key}`
    const group = groups.get(id) ?? { operator, cls, key: entry.key, examples: [] }
    if (group.examples.length < EXAMPLES)
      group.examples.push({ trace: traceLabel(entry.trace), leaveAt: entry.leaveAt + 1, detail })
    groups.set(id, group)
  })
  return [...groups.values()].map((group) =>
    candidate({
      operator: group.operator,
      cls: group.cls,
      key: { perturbation: group.key, cls: group.cls },
      summary:
        group.cls === 'unhandled-event'
          ? `the product throws on ${group.key}, an event the environment excludes`
          : `the product changes what it shows on ${group.key}, an event the environment excludes — the model says nothing about it`,
      evidence: { examples: group.examples },
    }),
  )
}

// ── 자식 프로세스: 기준 실행과 변이 실행 ──────────────────────────────────────────────────────────────────────────

async function importFastCheck(root) {
  try {
    const required = createRequire(join(root, 'package.json')).resolve('fast-check')
    const module = await import(pathToFileURL(required).href)
    return { fc: module.default ?? module, from: 'repository' }
  } catch {
    const module = await import('fast-check')
    return { fc: module.default ?? module, from: 'skill' }
  }
}

function sample({ fc, model, adapter, bound, runs, maxLength, seed }) {
  const lengths = []
  const patterns = new Set()
  let failure = null
  try {
    fc.assert(
      fc.property(fc.array(fc.nat(), { minLength: bound + 1, maxLength }), (indices) => {
        const raw = []
        for (const index of indices) {
          const choices = listItems(model.next(listOf(raw)))
          if (choices.length === 0) break
          raw.push(choices[index % choices.length])
        }
        lengths.push(raw.length)
        let state = model.init()
        const expected = [toPlain(model.observe(state))]
        for (const event of raw) {
          state = model.step(state, event)
          expected.push(toPlain(model.observe(state)))
        }
        const trace = raw.map(toPlain)
        for (const gram of stepPatterns(trace, expected.slice(1), expected[0])) patterns.add(gram)
        const observed = observeTrace(adapter, trace)
        if (!isDeepStrictEqual(observed, expected))
          throw new Error(`${traceLabel(trace)}: observed ${JSON.stringify(observed)}, the model expects ${JSON.stringify(expected)}`)
      }),
      { numRuns: runs, seed },
    )
  } catch (error) {
    failure = String(error?.message ?? error).slice(0, 4000)
  }
  return {
    requested: runs,
    executed: lengths.length,
    beyondBound: lengths.filter((length) => length > bound).length,
    longest: lengths.length ? Math.max(...lengths) : 0,
    seed,
    patterns: [...patterns].sort(),
    failed: failure !== null,
    ...(failure ? { failure } : {}),
  }
}

/** 자식 — 제품(변이됐을 수 있다)을 공간·표본·세계·metamorphic·교란 trace에 돌리고 관찰만 돌려준다. 판정은 부모가 한다. */
async function child(configPath) {
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  const space = JSON.parse(await readFile(config.spacePath, 'utf8'))
  const adapter = await import(pathToFileURL(resolve(config.root, config.adapter)).href)
  const out = {}
  const conformance = checkConformance(space, adapter)
  out.trace = {
    cases: conformance.cases,
    passed: conformance.passed,
    failures: conformance.failures.length,
    failedCases: conformance.failures.map((failure) => failure.caseId),
    first: conformance.failures[0] ?? null,
  }
  if (config.residue) out.residue = conformance.residue
  const model = await loadModel({ model: config.modelPath, prefix: config.prefix, bin: config.bin })
  const { fc, from } = await importFastCheck(config.root)
  out.sampled = { ...sample({ fc, model, adapter, ...config.sampling }), fastCheck: from }
  if (config.worldAdapter) {
    const world = await import(pathToFileURL(resolve(config.root, config.worldAdapter)).href)
    const result = await conformWorld({ package: config.package, cwd: config.root, adapter: world, bin: config.bin })
    const count = (status) => (result.settings ?? []).filter((entry) => entry.status === status).length
    out.world = {
      status: result.status,
      settings: result.settings ?? [],
      violations: count('violation'),
      modelGaps: count('model-gap'),
      errors: count('adapter-error'),
      unknown: count('unknown'),
    }
  }
  const run = (trace) => {
    try {
      return { observed: observeTrace(adapter, trace) }
    } catch (error) {
      return { error: String(error?.message ?? error).slice(0, 500) }
    }
  }
  out.metamorphic = (config.metamorphicPairs ?? []).map(({ left, right }) => ({ left: run(left), right: run(right) }))
  out.perturbation = (config.perturbationTraces ?? []).map((trace) => run(trace))
  out.runtime = (config.runtimeTraces ?? []).map((trace) => run(trace))
  // the mutant file sets this when it is evaluated — a product the hook never redirected reports false
  out.mutantLoaded = globalThis[MUTANT_MARK] === true
  process.stdout.write(`${JSON.stringify(out)}\n`)
}

/**
 * 기계 연산자를 출처 있는 n/a로 둔 경우 — n/a는 아무것도 돌지 않은 상태(not-run·undeclared)만 바꾼다. 돌았거나,
 * 예산에 걸려 멈췄거나(incomplete), 틀린(invalid) 연산자의 상태와 이유는 그대로 남는다.
 */
export function applyDispositions(operators, dispositions = {}) {
  for (const id of OPERATOR_IDS) {
    const disposition = dispositions?.[id]
    if (DECLARED_OPERATORS.includes(id) || AI_OPERATORS.includes(id) || !disposition?.startsWith('n/a:')) continue
    if (['not-run', 'undeclared'].includes(operators[id]?.status ?? 'not-run'))
      operators[id] = { ...(operators[id] ?? { candidates: [] }), status: 'not-applicable', reason: disposition }
  }
  return operators
}

/** 하네스가 실패할 수 있는가 — 선언된 변이 하나 이상이 죽어야 한다. */
const killStatus = (mutants) => (mutants.some((entry) => entry.status === 'killed') ? 'pass' : 'fail')

/**
 * 변이를 죽인 검사 — 기준(변이 없음) 실행에서 통과한 단위(trace case, 세계 설정, fast-check, 관계)가 변이에서 실패할
 * 때만 센다. 기준에서 이미 실패한 단위는 변이의 탓이 아니고, 세계 모델 틈 하나가 나머지 설정의 판정을 가리지도 않는다.
 */
export function killedChecks(base, mutant, relations = []) {
  const killed = []
  const baseFailed = new Set(base.trace?.failedCases ?? [])
  if ((mutant.trace?.failedCases ?? []).some((id) => !baseFailed.has(id))) killed.push('trace-conformance')
  if (mutant.sampled?.failed && !base.sampled?.failed) killed.push('fast-check')
  const setting = (entry) => stableStringify(entry.coordinates)
  const basePassed = new Set((base.world?.settings ?? []).filter((entry) => entry.status === 'pass').map(setting))
  if ((mutant.world?.settings ?? []).some((entry) => !['pass', 'excluded'].includes(entry.status) && basePassed.has(setting(entry))))
    killed.push('world-conformance')
  for (const relation of relations) if (relation.baseHolds && relation.mutantBroken) killed.push(`metamorphic ${relation.id}`)
  return killed
}

/** 결함 편집 — 교체 문자열의 `$&`·`$'` 같은 패턴을 해석하지 않고 글자 그대로 넣는다. 적재 표식을 같은 줄 앞에 붙인다. */
export function applyFault(text, fault) {
  return `globalThis.${MUTANT_MARK} = true; ${text.replace(fault.find, () => fault.replace)}`
}

function runChild(config, redirect, timeoutMs) {
  const { NODE_TEST_CONTEXT: _parent, ...env } = process.env
  const run = spawnSync(process.execPath, ['--import', pathToFileURL(REGISTER).href, SCRIPT, 'child', config], {
    encoding: 'utf8',
    env: { ...env, ORACLE_MUTATION_REDIRECT: JSON.stringify(redirect) },
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
  })
  if (run.error?.code === 'ETIMEDOUT') return { crashed: `timed out after ${timeoutMs}ms`, timedOut: true }
  if (run.status !== 0) return { crashed: `${run.stderr || run.stdout}`.trim().slice(0, 2000) || `exit ${run.status}` }
  try {
    return JSON.parse(run.stdout.trim().split('\n').at(-1))
  } catch {
    return { crashed: `unreadable child output: ${run.stdout.slice(0, 500)}` }
  }
}

// ── metamorphic ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * 관계마다 공간의 trace t에 변환 T를 적용하고, T(t)도 공간 안이면 짝으로 쓴다. 모델 위에서 R(obs(t), obs(T(t)))가 거짓이면
 * 관계나 모델이 틀렸다(후보). 제품 위의 판정은 자식이 돌린 관찰로 부모가 한다.
 */
async function metamorphicPairs({ loaded, model, space, bin, timeoutMs, eventIR, modelPath }) {
  const { metamorphic } = loaded.pkg
  if (typeof metamorphic !== 'object') return { declared: false, relations: [] }
  const meta = await compileBend({ entry: sourcePath(loaded, metamorphic.source), bin, timeoutMs })
  // Bend 2.0.34는 import한 파일의 생성자 태그를 파일 이름으로 한정해 컴파일한다(`Issue` → `MODEL.Issue`, bendlang #1105).
  // 단독으로 컴파일한 모델의 값과 관계 모듈의 값을 오갈 때 태그를 번역한다 — 번역하지 않으면 관계 def가 값을 거부한다.
  const stem = basename(modelPath, '.bend')
  const constructors = new Set([...parseBendTypes(await readFile(modelPath, 'utf8')).values()].flat().map(({ name }) => name))
  const retag = (value, change) => {
    if (Array.isArray(value)) return value.map((entry) => retag(entry, change))
    if (value === null || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, key === '$' ? change(entry) : retag(entry, change)]))
  }
  const qualify = (value) => retag(value, (tag) => (constructors.has(tag) ? `${stem}.${tag}` : tag))
  const unqualify = (value) => retag(value, (tag) => (tag.startsWith(`${stem}.`) ? tag.slice(stem.length + 1) : tag))
  const call = (name, ...args) => unqualify(meta.exported[name](...args.map((argument) => qualify(structuredClone(argument)))))
  const finalOf = (raw) => {
    let state = model.init()
    for (const event of raw) state = model.step(state, event)
    return model.observe(state)
  }
  const relations = []
  for (const relation of metamorphic.relations) {
    const missing = [relation.transform, relation.relation].filter((name) => typeof meta.exported[name] !== 'function')
    if (missing.length > 0) {
      relations.push({ ...relation, status: 'invalid', reason: `${missing.join(', ')} not defined`, pairs: [] })
      continue
    }
    const pairs = []
    let skipped = 0
    let modelViolations = 0
    const examples = []
    for (const entry of space.cases) {
      const raw = entry.trace.map((event) => toRuntime(event, eventIR))
      const transformed = listItems(call(relation.transform, listOf(raw))).map(toPlain)
      const status = traceStatus(model, transformed)
      if (!status.inSpace) {
        skipped += 1
        continue
      }
      const holds = toPlain(call(relation.relation, finalOf(raw), finalOf(status.raw)))
      if (holds !== true) {
        modelViolations += 1
        if (examples.length < EXAMPLES) examples.push({ left: traceLabel(entry.trace), right: traceLabel(transformed) })
      }
      pairs.push({ left: entry.trace, right: transformed })
    }
    relations.push({ ...relation, status: 'checked', pairs, skipped, modelViolations, examples, call })
  }
  return { declared: true, relations }
}

// ── 선언된 연산자·AI 연산자 ────────────────────────────────────────────────────────────────────────────────────────

export function declaredStatus(id, disposition, derived) {
  if (disposition === undefined) return { status: 'undeclared', reason: 'declare modeled: <axis id> or n/a: S<n> <reason>' }
  const na = disposition.match(/^n\/a:\s*(S\d+)\s(.*)$/)
  if (na) return { status: 'not-applicable', source: na[1], reason: na[2] }
  const axisId = disposition.match(/^modeled:\s*([\w.]+)\s*$/)?.[1]
  const axis = derived.axes.find((entry) => entry.id === axisId)
  if (!axis) return { status: 'invalid', reason: `${axisId} is not a derived axis` }
  if (!DECLARED_OPERATORS.includes(id)) return { status: 'invalid', reason: `${id} runs mechanically` }
  // 공격군은 입력이다 — 관찰·숨은 상태는 공격을 모델링하지 못한다. 입력이 두 값 이상으로 실제로 바뀌어야 한다.
  if (!['controllable', 'environment'].includes(axis.role))
    return { status: 'invalid', reason: `${axisId} is a ${axis.role} axis — a declared operator is modeled by an input (a world coordinate or an event)` }
  if ((axis.domain.enumerated?.values ?? []).length < 2)
    return { status: 'invalid', reason: `${axisId} takes fewer than two enumerated values, so the space does not vary it` }
  return { status: 'covered', axis: axisId }
}

const CROSS_AGENT_QUESTIONS = [
  'What does the current oracle space assume without saying so?',
  'Which failure cannot be expressed with the current axes?',
  'What happens when the assumption of a normal user breaks (rapid repeat, back/forward, refresh, multiple tabs, expired session, tampered input)?',
  'What goes wrong if the order of two events is reversed or an event repeats?',
  'Which counterexample satisfies every stated property and is still a product failure?',
  'Which axis would a domain expert of this product add?',
]

/**
 * AI 연산자에게 줄 입력 — 이 바이트의 sha256이 기록(aiRuns.inputDigest)과 맞아야 그 실행을 현재 공간에 대한 실행으로
 * 센다. 공간이 바뀌면 입력이 바뀌고, 이전 실행은 stale이다.
 */
export async function aiInput({ loaded, operator, bin, timeoutMs }) {
  const root = loaded.root
  const relativePackage = relative(root, loaded.path)
  if (operator === 'ai-explorer') {
    const { derived, inputsDigest } = await derivePackage(loaded, { bin, timeoutMs })
    const directory = await mkdtemp(join(tmpdir(), 'oracle-ai-input-'))
    try {
      const card = join(directory, 'oracle.md')
      await writeFile(card, projectCard(loaded.pkg, derived, { packagePath: relativePackage, inputsDigest }))
      return await exploreInput({ card, cwd: root, bin, timeoutMs })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
  if (operator !== 'cross-agent') throw new CliError('USAGE', `operator must be ${AI_OPERATORS.join(' | ')}`, 2)
  const { derived } = await derivePackage(loaded, { bin, timeoutMs })
  const source = await modelInput({ package: relativePackage, cwd: root })
  // 축마다 그 뜻(Terms의 정의)을 붙인다 — 이름만 보고 짐작한 리터럴은 기계 판정을 받아도 비평가가 뜻한 세계가 아니다
  const terms = new Map((loaded.pkg.terms ?? []).map((term) => [term.id, term]))
  const axes = derived.axes.map((axis) => {
    const domain = axis.domain.enumerated ? axis.domain.enumerated.values.join(' ') : axis.domain.model
    const meaning = axis.termRefs
      .map((id) => terms.get(id))
      .filter(Boolean)
      .map((term) => [' —', term.definition, term.not ? `(not: ${term.not})` : null].filter(Boolean).join(' '))
      .join('')
    return `- ${axis.id} (${axis.role}; ${domain})${meaning}`
  })
  const assumptions = (loaded.pkg.assumptions ?? []).map(
    (row) => `- ${row.id}: owner ${row.owner}; falsifier ${row.falsifier}; ${row.testability}/${row.status}`,
  )
  const dispositions = Object.entries(loaded.pkg.operators ?? {}).map(([id, value]) => `- ${id}: ${value}`)
  return [
    '# Cross-agent critique input',
    '',
    'You are a domain expert reviewing an oracle space, not the implementation. Answer the questions from the source text.',
    'Ground every candidate in the source text; a candidate without a source-backed harm is noise.',
    'An in-world candidate gives a world literal naming every world.* field below: a Bool as `name` or `!name`, any other field as `name=Value` — the tool judges it mechanically.',
    'A new-fact names its category as exactly controllable, observable or hidden. A qualifier lists the contract rows it concerns as O* IDs.',
    'Return only JSON of this shape:',
    '',
    '```json',
    JSON.stringify(EXPLORER_SCHEMA, null, 2),
    '```',
    '',
    '## Questions',
    '',
    ...CROSS_AGENT_QUESTIONS.map((question, index) => `${index + 1}. ${question}`),
    '',
    '## Declared axes',
    '',
    ...axes,
    '',
    '## Assumption registry',
    '',
    ...(assumptions.length ? assumptions : ['- none declared']),
    '',
    '## Operator dispositions',
    '',
    ...(dispositions.length ? dispositions : ['- none declared']),
    '',
    // 원문 부분만 싣는다 — 분석가용 작성 지시(세계 모델을 써라)는 이 역할이 아니다.
    source.slice(source.indexOf('## Sources'), source.indexOf('## World model authoring')).trimEnd(),
  ].join('\n')
}

const TRIAGE_CLASS = {
  'assumption-challenge': 'assumption-challenge',
  'goal-gap': 'goal-gap',
  contradiction: 'contradiction',
  'candidate-axis': 'new-axis',
  'dropped-qualifier': 'dropped-qualifier',
}

async function aiOperator({ loaded, operator, bin, timeoutMs, disposition }) {
  // n/a는 실행이 없을 때의 상태만 바꾼다 — 기록된 실행의 발견은 n/a라고 적어도 결정 없이는 닫히지 않는다
  const notApplicable = disposition?.startsWith('n/a:')
  const records = (loaded.pkg.aiRuns ?? []).filter((run) => run.operator === operator)
  if (records.length === 0) {
    if (notApplicable) return { status: 'not-applicable', reason: disposition, candidates: [], runs: [] }
    return { status: 'not-run', reason: `no recorded ${operator} run — produce one from oracle-discovery.mjs ai-input`, candidates: [], runs: [] }
  }
  const digest = sha256(await aiInput({ loaded, operator, bin, timeoutMs }))
  const runs = []
  const candidates = []
  for (const record of records) {
    const text = await readFile(resolve(loaded.root, record.file), 'utf8').catch(() => null)
    if (text === null) {
      runs.push({ ...record, status: 'unreadable' })
      continue
    }
    // 다른 입력에서 나온 실행은 이 공간에 대한 실행으로 세지 않는다(stale). 그래도 그 후보는 지금 세계로 다시 분류해
    // 결정을 받을 때까지 열어 둔다 — 공간이 움직였다고 발견이 결정 없이 사라지지 않는다.
    if (sha256(text) !== record.outputDigest) {
      runs.push({ ...record, status: 'invalid-output', reason: 'the output file is not the one recorded (outputDigest differs)' })
      continue
    }
    const stale = record.inputDigest !== digest
    let output
    let triage
    try {
      output = JSON.parse(text)
      triage = await triageCandidates({
        package: relative(loaded.root, loaded.path),
        cwd: loaded.root,
        candidates: output,
        bin,
        timeoutMs,
      })
    } catch (error) {
      if (error instanceof SyntaxError || error?.code === 'EXPLORE_OUTPUT') {
        runs.push({ ...record, status: 'invalid-output', reason: error.message })
        continue
      }
      throw error
    }
    for (const [index, entry] of triage.triaged.entries()) {
      const raw = output.candidates[index] ?? {}
      const origin = { run: record.file, stale }
      // 옛 실행의 결과가 지금 공간과 어긋나는 것은 형식 오류가 아니다 — 리터럴이 옛 세계의 것이거나(superseded-world),
      // 제안한 사실이 이제 세계의 필드다(이름이 같다고 같은 뜻은 아니니 new-axis로 남아 결정을 받는다).
      const drifted = stale && (entry.literalErrors || entry.existingField)
      if (entry.verdict === 'invalid' && !drifted) {
        // 형식이 틀린 후보를 조용히 버리지 않는다 — 내용이 진짜 발견일 수 있다. 결정(고쳐 다시 돌리거나 기각)을 받는다.
        candidates.push(
          candidate({
            operator,
            cls: 'invalid-output',
            key: { raw: stableStringify(raw) },
            summary: `${raw.id ?? '(no id)'}: unusable AI output (${entry.reason}) — ${normalize(String(raw.scenario ?? '')).slice(0, 160)}`,
            reproducible: false,
            evidence: { reason: entry.reason, raw, ...origin },
          }),
        )
        continue
      }
      let cls = TRIAGE_CLASS[entry.verdict]
      if (drifted) cls = entry.existingField ? 'new-axis' : 'superseded-world'
      if (!cls) continue
      candidates.push(
        candidate({
          operator,
          cls,
          key: {
            kind: raw.kind,
            scenario: normalize(raw.scenario ?? ''),
            fact: raw.newFact?.name ?? null,
            world: raw.world ?? null,
            sourceText: raw.sourceText ?? null,
          },
          summary: `${raw.id}: ${normalize(raw.scenario ?? '')}`,
          reproducible: raw.kind === 'in-world' && cls !== 'superseded-world',
          evidence: {
            verdict: entry.verdict,
            harm: raw.harm,
            route: drifted ? `the world changed since this run: ${entry.reason}` : entry.route,
            sources: raw.sources,
            ...origin,
          },
        }),
      )
    }
    runs.push({ ...record, status: stale ? 'stale' : 'current', summary: triage.summary })
  }
  const broken = runs.filter((run) => ['unreadable', 'invalid-output'].includes(run.status))
  if (broken.length > 0)
    return {
      status: 'invalid',
      reason: `recorded runs that cannot be read as explorer output: ${broken
        .map((run) => [run.file, `(${run.status})`].join(' '))
        .join(', ')} — restore the file; a record is never dropped to hide its findings`,
      runs,
      candidates,
    }
  const current = runs.filter((run) => run.status === 'current').length
  if (current > 0) return { status: 'run', runs, candidates }
  if (notApplicable) return { status: 'not-applicable', reason: disposition, runs, candidates }
  return { status: 'stale', reason: 'every recorded run was made on a different input — rerun on the current space', runs, candidates }
}

// ── canary ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * 탐색기 자체의 검사 — 관찰을 하나씩 가려(숨김으로 바꿔) 충분성 연산자가 반례를 내는지 본다. 하나라도 내면 연산자가
 * 이 세계에서 공허하지 않다. 어떤 목표도 필요로 하지 않는 관찰은 따로 보고한다(최소성 주장은 아니다).
 * 같은 열거로 필드마다 그 값을 바꾸면 판정이 바뀌는 def(목표·행·가정)를 모은다 — 축 레지스트리의 연결 정보다.
 */
async function sufficiencyCanary({ loaded, bin, timeoutMs }) {
  const world = await loadWorld({ package: relative(loaded.root, loaded.path), cwd: loaded.root, bin, timeoutMs })
  if (world.result) return { status: 'not-run', reason: world.result.reason, loadBearing: [], idle: [], dependents: {} }
  const { spec, model } = world
  const base = searchAdequacy(model, spec)
  const refuted = (result) =>
    new Set(result.checks.filter((check) => check.status === 'refuted').map((check) => `${check.kind}:${check.target}`))
  const before = refuted(base)
  const loadBearing = []
  const idle = []
  for (const field of spec.observations) {
    const ablated = {
      ...spec,
      observations: spec.observations.filter((name) => name !== field),
      categories: { ...spec.categories, [field]: 'hidden' },
    }
    const after = refuted(searchAdequacy(model, ablated))
    const opened = [...after].filter((key) => !before.has(key))
    if (opened.length > 0) loadBearing.push({ field, opens: opened })
    else idle.push(field)
  }
  const defs = [...spec.assumptions, ...spec.rows, ...spec.goals.map(({ id }) => id)]
  const dependents = {}
  const worlds = evaluateWorlds(model, spec)
  const byKey = new Map(worlds.map((entry) => [stableStringify(entry.plain), entry]))
  for (const field of spec.fields) {
    const moved = new Set()
    for (const entry of worlds)
      for (const value of field.values) {
        const other = byKey.get(stableStringify({ ...entry.plain, [field.name]: value }))
        for (const id of defs) if (other && other.truth[id] !== entry.truth[id]) moved.add(spec.rowIds?.[id] ?? id)
      }
    dependents[`world.${spec.prefix}.${field.name}`] = [...moved].sort()
  }
  let status = loadBearing.length > 0 ? 'pass' : 'fail'
  if (spec.observations.length === 0) status = 'vacuous'
  return {
    status,
    loadBearing,
    idle,
    dependents,
  }
}

// ── 후보 수명주기·축 레지스트리 ───────────────────────────────────────────────────────────────────────────────────

function promotionTargetExists(target, pkg, derived) {
  if (derived.axes.some((axis) => axis.id === target)) return true
  if ((pkg.goals ?? []).some((goal) => goal.id === target)) return true
  if ((pkg.assumptions ?? []).some((row) => row.id === target)) return true
  return (pkg.contract ?? []).some((entry) => entry.key === target)
}

/**
 * 후보 수명주기 — 상태를 저장하지 않고 증거에서 계산한다: 지금 실행이 낸 후보, 사람이 기록한 결정, 패키지에 있는 승격
 * 대상, lock. DISCOVERED → REPRODUCIBLE → DOMAIN_VALIDATED → AXIS_CLASSIFIED → ORACLE_DEFINED → TEST_IMPLEMENTED →
 * REGRESSION_LOCKED.
 */
/**
 * 결정이 그 후보에 맞는가 — equivalent는 살아남은 변이에만 쓴다. covered는 AI 후보에만 쓴다: 결정론 연산자와 런타임의
 * 증거는 바로 어떤 행도 그것을 막지 못한다는 것이라, "이미 막는 행이 있다"는 결정은 그 증거와 모순된다.
 */
export function decisionMisfit(entry, decision) {
  if (decision.decision === 'equivalent' && entry.class !== 'oracle-weakness')
    return `equivalent applies only to a surviving mutant, not to a ${entry.class} candidate`
  if (decision.decision === 'covered' && !AI_OPERATORS.includes(entry.operator))
    return `covered contradicts the ${entry.operator} evidence that no row rejects it — promote it or scope it out with its authority`
  return null
}

export function lifecycle(candidates, pkg, derived, { locked = false } = {}) {
  const decisions = new Map((pkg.discoveryDecisions ?? []).map((entry) => [entry.candidate, entry]))
  const current = new Map(candidates.map((entry) => [entry.id, entry]))
  // 승격 대상이 패키지에 있으면 공간이 흡수했다 — lock이 그 바이트를 덮으면 회귀가 잠긴다.
  const absorbed = (decision) => {
    const exists = promotionTargetExists(decision.axis, pkg, derived)
    let stage = 'AXIS_CLASSIFIED'
    if (exists) stage = locked ? 'REGRESSION_LOCKED' : 'TEST_IMPLEMENTED'
    return {
      decision,
      stage,
      open: !exists,
      ...(exists ? {} : { reason: `promoted to ${decision.axis}, which is not in the package` }),
    }
  }
  const records = []
  for (const entry of candidates) {
    const decision = decisions.get(entry.id)
    const misfit = decision ? decisionMisfit(entry, decision) : null
    if (!decision || misfit) {
      records.push({
        ...entry,
        ...(decision ? { decision } : {}),
        stage: entry.reproducible ? 'REPRODUCIBLE' : 'DISCOVERED',
        open: true,
        ...(misfit ? { reason: misfit } : {}),
      })
      continue
    }
    if (decision.decision === 'promoted') {
      // 옛 공간에서 한 실행의 후보는 다시 돌릴 수 없어 늘 다시 나온다 — 흡수는 대상이 패키지에 있는지로 본다.
      if (entry.evidence?.stale) {
        records.push({ ...entry, ...absorbed(decision), produced: 'carried' })
        continue
      }
      // 승격했는데 연산자가 아직 같은 현상을 낸다 — 공간이 그 차원을 아직 흡수하지 못했다. 대상이 패키지에 있으면
      // 정의는 됐지만 검사가 아직 그것을 보지 못한다(ORACLE_DEFINED).
      const defined = promotionTargetExists(decision.axis, pkg, derived)
      records.push({
        ...entry,
        decision,
        stage: defined ? 'ORACLE_DEFINED' : 'AXIS_CLASSIFIED',
        open: true,
        reason: defined
          ? `promoted to ${decision.axis}, but the operator still produces it — the checks do not see it yet`
          : 'promoted but still produced — absorb it in a new revision',
      })
      continue
    }
    records.push({ ...entry, decision, stage: 'DOMAIN_VALIDATED', open: false })
  }
  for (const decision of pkg.discoveryDecisions ?? []) {
    if (current.has(decision.candidate)) continue
    if (decision.decision !== 'promoted') {
      records.push({ id: decision.candidate, decision, stage: 'DOMAIN_VALIDATED', open: false, produced: false })
      continue
    }
    records.push({ id: decision.candidate, ...absorbed(decision), produced: false })
  }
  return records.sort((left, right) => (left.id < right.id ? -1 : 1))
}

/** Oracle Space Registry — 축마다 기원(원문·모델·반례·장애…), 승격해 온 후보, 판정이 기대는 def. */
function spaceRegistry(pkg, derived, dependents) {
  const origins = pkg.axisOrigins ?? {}
  const promoted = (pkg.discoveryDecisions ?? []).filter((entry) => entry.decision === 'promoted')
  const issues = []
  for (const [axis, origin] of Object.entries(origins)) {
    if (!derived.axes.some((entry) => entry.id === axis)) issues.push(`axis-origin-unknown: ${axis} is not a derived axis`)
    if (origin.origin === 'counterexample' && !promoted.some((entry) => entry.candidate === origin.ref && entry.axis === axis))
      issues.push(`axis-origin-unlinked: ${axis} names counterexample ${origin.ref}, but no promotion of it to this axis is recorded`)
  }
  const axes = derived.axes.map((axis) => {
    const declared = origins[axis.id]
    const fallback = axis.id.startsWith('world.')
      ? { origin: 'source', ref: axis.sourceRefs.join(' ') || 'unrecorded', reason: 'declared in the analyst world from the source text' }
      : { origin: 'model', ref: axis.sourceRefs.join(' ') || 'unrecorded', reason: 'derived from the behavior model types' }
    return {
      id: axis.id,
      role: axis.role,
      status: axis.status,
      origin: declared ?? fallback,
      promotedFrom: promoted.filter((entry) => entry.axis === axis.id).map((entry) => entry.candidate),
      judgedBy: dependents[axis.id] ?? null,
    }
  })
  return { version: pkg.spaceVersion ?? 1, digest: derived.digest, axes, issues }
}

// ── 판정 보고서 ───────────────────────────────────────────────────────────────────────────────────────────────────

async function runnerState(directory, timeoutMs) {
  if (!directory) return null
  const run = spawnSync(process.execPath, [join(dirname(SCRIPT), 'oracle-run.mjs'), 'status', '--dir', directory, '--json'], {
    encoding: 'utf8',
    timeout: timeoutMs,
  })
  if (run.error?.code === 'ETIMEDOUT') return { error: `oracle-run status did not finish in ${timeoutMs}ms` }
  if (run.status !== 0) return { error: `${run.stderr}`.trim() || `exit ${run.status}` }
  let status
  try {
    status = JSON.parse(run.stdout)
  } catch {
    return { error: 'unreadable status output' }
  }
  // 상태 파일의 REVIEW_VERIFIED만으로는 모자란다 — 라벨마다 마지막 실행이 지금 스냅숏·lock에서 한 것이어야 한다
  const ledger = (await readFile(join(directory, 'runs.jsonl'), 'utf8').catch(() => ''))
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
  const latest = new Map()
  for (const entry of ledger) if ((entry.type ?? 'run') === 'run' && entry.label) latest.set(entry.label, entry)
  const stale = new Set(status.staleOrMissingRuns ?? [])
  return {
    state: status.currentState,
    blockers: status.blockers ?? [],
    staleLabels: [...latest.values()].filter((entry) => stale.has(entry.runId)).map((entry) => entry.label),
  }
}

/** 제품 완결은 통과한 closure에 더해 — 리뷰가 끝난 러너, 막힘 없음, 라벨마다 최신 실행, 패키지 입력 전부를 덮는 lock. */
export function productCompleteReasons(runner, locked) {
  const reasons = []
  if (!runner) reasons.push('no oracle directory (--dir) — the runner state is unknown')
  else if (runner.error) reasons.push(`the runner status is unreadable: ${runner.error}`)
  else {
    if (runner.state !== 'REVIEW_VERIFIED') reasons.push(`the runner is at ${runner.state}, not REVIEW_VERIFIED`)
    if (runner.blockers.length > 0) reasons.push(`runner blockers: ${runner.blockers.join(', ')}`)
    if (runner.staleLabels.length > 0) reasons.push(`the latest run is stale for: ${runner.staleLabels.join(', ')}`)
  }
  if (!locked) reasons.push('no lock (--lock) covers the package and every Bend file it reads')
  return reasons
}

async function lockCovers(lockPath, loaded, inputs) {
  if (!lockPath) return false
  const path = resolve(loaded.root, lockPath)
  let manifest
  try {
    manifest = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new CliError('DISCOVERY_INPUT', `the lock ${lockPath} is unreadable: ${error.message}`, 2)
  }
  if (!Array.isArray(manifest?.sources)) throw new CliError('DISCOVERY_INPUT', `the lock ${lockPath} has no sources list`, 2)
  const directory = dirname(path)
  const locked = new Map(manifest.sources.map((entry) => [resolve(directory, entry.path ?? ''), entry.sha256]))
  // the package and every Bend file it reads: a promoted axis lives in the world, not only in the package bytes
  return inputs.every((entry) => locked.get(resolve(loaded.root, entry.path)) === entry.sha256)
}

/** 런타임 이상 파일 — {"anomalies": [{id, trace?, …}]}. 다른 모양은 증거 0건이 아니라 입력 오류다. */
function readAnomalies(text, where) {
  let value
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new CliError('DISCOVERY_INPUT', `${where} is not JSON: ${error.message}`, 2)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.anomalies))
    throw new CliError('DISCOVERY_INPUT', `${where} must be {"anomalies": [...]}`, 2)
  const ids = new Set()
  for (const [index, anomaly] of value.anomalies.entries()) {
    if (typeof anomaly?.id !== 'string' || !anomaly.id.trim() || ids.has(anomaly.id))
      throw new CliError('DISCOVERY_INPUT', `${where}: anomaly ${index} needs a unique non-empty id`, 2)
    ids.add(anomaly.id)
    if (anomaly.trace !== undefined && !Array.isArray(anomaly.trace))
      throw new CliError('DISCOVERY_INPUT', `${where}: ${anomaly.id}: trace is a list of model events`, 2)
  }
  return value
}

/** 공간 안의 이상 trace — 제품 재생은 기준 자식이 한다(이 프로세스의 모듈 캐시는 이전 실행의 제품을 들고 있을 수 있다). */
function runtimeTraces(anomalies, model) {
  return (anomalies?.anomalies ?? []).flatMap((anomaly, index) =>
    Array.isArray(anomaly.trace) && classifyTrace(model, anomaly.trace).verdict !== 'outside-space'
      ? [{ index, trace: anomaly.trace }]
      : [],
  )
}

/** L7 — 결함이 재현되거나 결정되지 않은 이상이 있으면 다시 열린다. 재생할 수 없는 이상은 판정할 수 없다(fail). */
function runtimeStatus(entries, lives) {
  const open = (entry) => entry.candidate && lives.find((life) => life.id === entry.candidate)?.open
  if (entries.some((entry) => entry.status === 'product-defect' || open(entry))) return 'reopened'
  if (entries.some((entry) => entry.status === 'replay-error')) return 'fail'
  return 'pass'
}

/** 런타임 이상 → 공간에 비춘다. 공간 안이고 지금 제품이 모델과 맞으면 흡수됐다. 아니면 후보(또는 제품 결함)다. */
function runtimeClosure({ anomalies, model, replays }) {
  if (!anomalies) return { status: 'no-evidence', entries: [], candidates: [] }
  const replayed = new Map(runtimeTraces(anomalies, model).map(({ index }, position) => [index, replays[position]]))
  const entries = []
  const candidates = []
  for (const [index, anomaly] of (anomalies.anomalies ?? []).entries()) {
    const base = { id: anomaly.id, source: anomaly.source ?? null }
    const make = (cls, summary, evidence) =>
      candidate({ operator: 'runtime', cls, key: { anomaly: anomaly.id }, summary, evidence, reproducible: Boolean(anomaly.trace) })
    if (!Array.isArray(anomaly.trace)) {
      const entry = make('runtime-unexplained', `${anomaly.id}: ${anomaly.summary ?? 'no trace'} — the space cannot replay it`, { anomaly })
      entries.push({ ...base, status: 'unexplained', candidate: entry.id })
      candidates.push(entry)
      continue
    }
    const inSpace = classifyTrace(model, anomaly.trace)
    if (inSpace.verdict === 'outside-space') {
      const entry = make('new-axis', `${anomaly.id}: the environment model forbids step ${inSpace.step} (${label(inSpace.event)}) — why could the space not express it?`, {
        allowed: inSpace.allowed,
        trace: traceLabel(anomaly.trace),
      })
      entries.push({ ...base, status: 'outside-space', candidate: entry.id })
      candidates.push(entry)
      continue
    }
    const replay = replayed.get(index)
    if (!replay || replay.error) {
      entries.push({ ...base, status: 'replay-error', reason: `the adapter could not replay it: ${replay?.error ?? 'no replay'}` })
      continue
    }
    const now = classifyTrace(model, anomaly.trace, replay.observed)
    entries.push({
      ...base,
      status: now.verdict === 'model-agrees' ? 'absorbed' : 'product-defect',
      ...(now.verdict === 'model-agrees'
        ? { reason: 'inside the space and the current product matches the model — the oracle covers it' }
        : { reason: `the current product still differs at step ${now.step}`, expected: now.expected, observed: now.observed }),
    })
  }
  return { status: 'checked', entries, candidates }
}

/**
 * 한 번의 closure 실행 — 결정론적 검증(L1~L5)과 탐색(L6), 런타임(L7)을 돌려 판정 보고서를 만든다. 입력: 패키지, 설치된
 * Bend, 선택적으로 런타임 이상 파일·Oracle 디렉터리(러너 상태)·lock.
 */
export async function closure({ packagePath, root = process.cwd(), bin, timeoutMs = 300_000, runtime = null, directory = null, lock = null }) {
  const loaded = await loadPackage(packagePath, { root })
  const { pkg } = loaded
  const structural = packageIssues(pkg)
  const missing = []
  if (!pkg.product) missing.push('product (adapter, worldAdapter, files, runs, maxLength)')
  if (!pkg.behavior) missing.push('behavior')
  if (structural.length > 0 || missing.length > 0)
    throw new CliError('DISCOVERY_INPUT', [...structural, ...missing.map((field) => `discovery-input: ${field} is required`)].join('; '))

  const relativePackage = relative(root, loaded.path)
  const inputs = await packageInputs(loaded)
  const productFiles = []
  for (const file of pkg.product.files)
    productFiles.push({ path: file, sha256: sha256(await readFile(resolve(root, file), 'utf8')) })

  // L1
  const requirements = await requirementClosure(loaded)

  // 모델: 법칙·공간·축
  const lawsPath = sourcePath(loaded, pkg.behavior.laws)
  const proof = await proveLaws({ dir: dirname(lawsPath), bin, require: pkg.behavior.lawRows.map((law) => law.name), timeoutMs })
  const modelPath = sourcePath(loaded, pkg.behavior.model)
  const model = await loadModel({ model: modelPath, prefix: pkg.behavior.prefix, bin, timeoutMs })
  const space = enumerateSpace(model, { bound: pkg.behavior.bound })
  const { derived } = await derivePackage(loaded, { bin, timeoutMs })
  const { eventIR, observationIR } = await behaviorTypes(modelPath, pkg.behavior.prefix)
  const adequacy = await checkAdequacy({ package: relativePackage, cwd: root, bin, timeoutMs })

  const operators = {}
  const candidates = []
  const record = (id, result) => {
    operators[id] = { ...(operators[id] ?? {}), ...result, candidates: (result.candidates ?? []).map((entry) => entry.id) }
    candidates.push(...(result.candidates ?? []))
  }
  const adequacyRun = adequacy.status === 'proven' || adequacy.status === 'refuted'
  const fromAdequacy = adequacyRun ? adequacyCandidates(adequacy, pkg) : []
  for (const id of ['observation-sufficiency', 'goal-implication', 'goal-witness', 'assumption-sensitivity'])
    record(
      id,
      adequacyRun
        ? { status: 'run', candidates: fromAdequacy.filter((entry) => entry.operator === id) }
        : { status: 'not-run', reason: `adequacy ${adequacy.status}: ${adequacy.reason ?? adequacy.kernel?.status ?? ''}`, candidates: [] },
    )
  record('requirement-coverage', {
    status: 'run',
    candidates: requirements.unquoted.map(({ source, sentence }) =>
      candidate({
        operator: 'requirement-coverage',
        cls: 'requirement-gap',
        key: { source, sentence },
        summary: `${source}: "${sentence}" is quoted by no requirement — add it to the inventory, or decide it is not a requirement`,
        evidence: { source, sentence },
      }),
    ),
  })
  record('temporal-order', temporalCandidates(derived, pkg))
  const crossCheck = await spaceCrossCheck({ loaded, bin, timeoutMs })
  record('space-cross-check', crossCheck)
  const extension = traceExtension(model, space, pkg.behavior.bound)

  // 제품: 기준 실행(변이 없음) — 공간·표본·세계·metamorphic·교란을 한 자식에서
  const work = await mkdtemp(join(tmpdir(), 'oracle-discovery-'))
  try {
    const spacePath = join(work, 'space.json')
    // 결합 케이스도 같은 대응 검사로 돈다 — 기준 실행과 변이 실행이 세계 조건 위의 trace까지 본다
    const cases = [...space.cases, ...(crossCheck.joint?.cases ?? [])]
    await writeFile(spacePath, JSON.stringify({ bound: space.bound, initial: space.initial, cases, complete: space.complete, spaceDigest: space.spaceDigest }))
    const meta = await metamorphicPairs({ loaded, model, space, bin, timeoutMs, eventIR, modelPath })
    const perturbed = perturbations(model, space)
    const seed = Number.parseInt(space.spaceDigest.slice(0, 8), 16) % 2_147_483_647
    const sampling = { bound: space.bound, runs: pkg.product.runs, maxLength: Math.max(pkg.product.maxLength, space.bound + 1), seed }
    const baseConfig = {
      root,
      package: relativePackage,
      adapter: pkg.product.adapter,
      worldAdapter: pkg.product.worldAdapter,
      modelPath,
      prefix: pkg.behavior.prefix,
      bin,
      spacePath,
      sampling,
      metamorphicPairs: meta.relations.flatMap((relation) => relation.pairs ?? []),
    }
    const anomalies = runtime ? readAnomalies(await readFile(resolve(root, runtime), 'utf8'), runtime) : null
    const baselinePath = join(work, 'baseline.json')
    await writeFile(
      baselinePath,
      JSON.stringify({
        ...baseConfig,
        residue: true,
        perturbationTraces: perturbed.list.map((entry) => entry.trace),
        runtimeTraces: runtimeTraces(anomalies, model).map((entry) => entry.trace),
      }),
    )
    const baseline = runChild(baselinePath, {}, timeoutMs)
    if (baseline.crashed) throw new CliError('DISCOVERY_BASELINE', `the unmutated product could not be checked: ${baseline.crashed}`)

    record('trace-extension', rangeCandidates(extension, baseline.sampled.patterns, pkg.behavior.bound))

    // metamorphic 판정(모델·제품)
    let offset = 0
    const metamorphic = meta.relations.map((relation) => {
      const count = relation.pairs?.length ?? 0
      const observed = baseline.metamorphic.slice(offset, offset + count)
      offset += count
      if (relation.status !== 'checked') return { id: relation.id, status: 'invalid', reason: relation.reason }
      let productViolations = 0
      let productErrors = 0
      const examples = []
      observed.forEach((result, index) => {
        if (result.left.error || result.right.error) {
          productErrors += 1
          return
        }
        const left = toRuntime(result.left.observed.at(-1), observationIR)
        const right = toRuntime(result.right.observed.at(-1), observationIR)
        if (toPlain(relation.call(relation.relation, left, right)) !== true) {
          productViolations += 1
          if (examples.length < EXAMPLES)
            examples.push({ left: traceLabel(relation.pairs[index].left), right: traceLabel(relation.pairs[index].right) })
        }
      })
      return {
        id: relation.id,
        transform: relation.transform,
        relation: relation.relation,
        pairs: count,
        skipped: relation.skipped,
        modelViolations: relation.modelViolations,
        productViolations,
        productErrors,
        examples: [...relation.examples, ...examples],
        status: count > 0 && relation.modelViolations === 0 && productViolations === 0 && productErrors === 0 ? 'holds' : 'fails',
      }
    })
    const relationCandidates = meta.relations
      .filter((relation) => relation.status === 'checked' && relation.modelViolations > 0)
      .map((relation) =>
        candidate({
          operator: 'metamorphic',
          cls: 'relation-invalid',
          key: { relation: relation.id, transform: relation.transform, holds: relation.relation },
          summary: `${relation.id} fails on the model itself for ${relation.modelViolations} in-space pairs — the relation or the model is wrong`,
          evidence: { examples: relation.examples },
        }),
      )
    let metamorphicOperator = { status: 'run', candidates: relationCandidates }
    if (!meta.declared)
      metamorphicOperator = { status: 'undeclared', reason: 'declare metamorphic relations or "n/a: S<n> <reason>"', candidates: [] }
    if (typeof pkg.metamorphic === 'string') metamorphicOperator = { status: 'not-applicable', reason: pkg.metamorphic, candidates: [] }
    record('metamorphic', metamorphicOperator)

    // 교란
    const perturbationFound = perturbationCandidates(perturbed.list, baseline.perturbation)
    for (const id of ['boundary-perturbation', 'order-perturbation']) {
      const kinds = id === 'boundary-perturbation' ? ['boundary'] : ['duplicate', 'swap', 'early']
      const generated = perturbed.list.filter((entry) => kinds.includes(entry.kind)).length
      let status = 'run'
      if (perturbed.capped) status = 'incomplete'
      else if (generated === 0) status = 'vacuous'
      record(id, {
        status,
        generated,
        ...(status === 'vacuous' ? { reason: 'no perturbation leaves the declared environment — nothing to attack' } : {}),
        candidates: perturbationFound.filter((entry) => entry.operator === id),
      })
    }

    // 잔여
    const residueFields = baseline.residue?.fields ?? null
    if (residueFields === null) {
      record('projection-residue', { status: 'not-run', reason: 'the adapter exports no snapshot(state)', candidates: [] })
    } else {
      const declared = pkg.residue ?? {}
      const residueCandidates = []
      const explained = []
      for (const entry of residueFields) {
        const disposition = declared[entry.field]
        const axis = disposition?.match(/^modeled:\s*([\w.]+)/)?.[1]
        if (disposition?.startsWith('n/a:') || (axis && derived.axes.some((candidateAxis) => candidateAxis.id === axis))) {
          explained.push({ field: entry.field, disposition })
          continue
        }
        residueCandidates.push(
          candidate({
            operator: 'projection-residue',
            cls: 'hidden-state',
            key: { field: entry.field },
            summary: `the product field ${entry.field} varies while the observation stays ${JSON.stringify(entry.observation)} — observe it, map it to a modeled axis, or scope it out`,
            evidence: entry,
          }),
        )
      }
      record('projection-residue', { status: 'run', explained, candidates: residueCandidates })
    }

    // 세계 모델 틈
    const world = baseline.world
    record('world-model-gap', {
      status: world ? 'run' : 'not-run',
      candidates: (world?.settings ?? [])
        .filter((entry) => entry.status === 'model-gap')
        .map((entry) =>
          candidate({
            operator: 'world-model-gap',
            cls: 'new-axis',
            key: { coordinates: entry.coordinates, observations: entry.observations },
            summary: `the product produced ${stableStringify(entry.observations)} at ${stableStringify(entry.coordinates)}, which the world calls impossible`,
            evidence: entry,
          }),
        ),
    })

    // mutation — only a unit the unmutated product passes can kill a mutant (killedChecks); L5 also needs the
    // unmutated product to pass every check. World model gaps are candidates for a decision, not failures.
    const baselineFailures = []
    if (baseline.trace.failures > 0) baselineFailures.push('trace-conformance')
    if (baseline.sampled.failed) baselineFailures.push('fast-check')
    if (!world || world.violations > 0 || world.errors > 0 || world.unknown > 0) baselineFailures.push('world-conformance')
    for (const entry of metamorphic) if (entry.status !== 'holds') baselineFailures.push(`metamorphic ${entry.id}`)
    const mutants = []
    for (const fault of pkg.faultModel ?? []) {
      const file = resolve(root, fault.file)
      const text = await readFile(file, 'utf8').catch(() => null)
      const occurrences = text === null ? 0 : text.split(fault.find).length - 1
      if (occurrences !== 1) {
        mutants.push({ fault: fault.id, class: fault.class, status: 'invalid', reason: `find occurs ${occurrences} times in ${fault.file} (needs exactly 1)` })
        continue
      }
      const directoryForMutant = join(work, fault.id)
      await mkdir(directoryForMutant)
      const mutatedPath = join(directoryForMutant, basename(file))
      await writeFile(mutatedPath, applyFault(text, fault))
      const configPath = join(directoryForMutant, 'config.json')
      await writeFile(configPath, JSON.stringify(baseConfig))
      const result = runChild(configPath, { [pathToFileURL(file).href]: pathToFileURL(mutatedPath).href }, timeoutMs)
      // a mutant that cannot load is stillborn — invalid, never a kill; a hang is a behaviour the checks saw
      if (result.crashed && !result.timedOut) {
        mutants.push({ fault: fault.id, class: fault.class, status: 'invalid', reason: `the mutant could not run: ${result.crashed.slice(0, 300)}` })
        continue
      }
      // a product the checks never loaded through the hook (require(), a file outside the import graph) ran unmutated
      if (!result.timedOut && !result.mutantLoaded) {
        mutants.push({ fault: fault.id, class: fault.class, status: 'invalid', reason: `${fault.file} was never loaded through an ESM import, so the checks ran the unmutated product` })
        continue
      }
      let killedBy = ['timeout']
      if (!result.timedOut) {
        let index = 0
        const relations = []
        for (const relation of meta.relations) {
          const count = relation.pairs?.length ?? 0
          const observed = result.metamorphic.slice(index, index + count)
          index += count
          if (relation.status !== 'checked') continue
          const mutantBroken = observed.some((pair) => {
            if (pair.left.error || pair.right.error) return true
            const left = toRuntime(pair.left.observed.at(-1), observationIR)
            const right = toRuntime(pair.right.observed.at(-1), observationIR)
            return toPlain(relation.call(relation.relation, left, right)) !== true
          })
          const baseHolds = metamorphic.find((entry) => entry.id === relation.id)?.status === 'holds'
          relations.push({ id: relation.id, baseHolds, mutantBroken })
        }
        killedBy = killedChecks(baseline, result, relations)
      }
      mutants.push({
        fault: fault.id,
        class: fault.class,
        file: fault.file,
        status: killedBy.length > 0 ? 'killed' : 'survived',
        killedBy,
        ...(result.timedOut ? { crash: result.crashed } : {}),
      })
    }
    const survivors = mutants
      .filter((entry) => entry.status === 'survived')
      .map((entry) => {
        const fault = pkg.faultModel.find((candidateFault) => candidateFault.id === entry.fault)
        return candidate({
          operator: 'mutation',
          cls: 'oracle-weakness',
          key: { fault: fault.id, class: fault.class, file: fault.file, find: fault.find, replace: fault.replace },
          summary: `mutant ${fault.id} (${fault.class}: ${fault.note ?? 'no note'}) survives every check — the oracle cannot tell it from the product`,
          evidence: { fault },
        })
      })
    const invalidMutants = mutants.filter((entry) => entry.status === 'invalid')
    let mutationStatus = 'run'
    if ((pkg.faultModel ?? []).length === 0) mutationStatus = 'undeclared'
    else if (invalidMutants.length > 0) mutationStatus = 'incomplete'
    record('mutation', {
      status: mutationStatus,
      ...(mutationStatus === 'undeclared' ? { reason: 'declare a fault model (faultModel)' } : {}),
      mutants,
      candidates: survivors,
    })

    // 선언된 연산자
    for (const id of DECLARED_OPERATORS) record(id, { ...declaredStatus(id, pkg.operators?.[id], derived), candidates: [] })
    applyDispositions(operators, pkg.operators)
    // AI
    for (const id of AI_OPERATORS) record(id, await aiOperator({ loaded, operator: id, bin, timeoutMs, disposition: pkg.operators?.[id] }))

    // canary
    const sufficiency = await sufficiencyCanary({ loaded, bin, timeoutMs })
    const reachable = beyondBoundReachable(model, space)
    const canaries = {
      'observation-ablation': { status: sufficiency.status, loadBearing: sufficiency.loadBearing, idle: sufficiency.idle },
      'mutation-baseline': {
        status: mutationStatus === 'undeclared' ? 'not-run' : killStatus(mutants),
        reason: 'the harness must be able to fail: at least one declared mutant is killed',
      },
      'sampler-reach': {
        status: baseline.sampled.executed >= sampling.runs && (!reachable || baseline.sampled.beyondBound > 0) ? 'pass' : 'fail',
        executed: baseline.sampled.executed,
        beyondBound: baseline.sampled.beyondBound,
        reachable,
      },
    }

    // L7
    const runtimeResult = runtimeClosure({ anomalies, model, replays: baseline.runtime ?? [] })
    candidates.push(...runtimeResult.candidates)

    // 수명주기·레지스트리
    const locked = await lockCovers(lock, loaded, inputs)
    const merged = new Map()
    for (const entry of candidates) {
      const seen = merged.get(entry.id)
      // the same phenomenon from several runs: one current run makes it a current finding, whatever the order
      if (!seen || (seen.evidence?.stale && !entry.evidence?.stale)) merged.set(entry.id, entry)
    }
    const lives = lifecycle([...merged.values()], pkg, derived, { locked })
    const registry = spaceRegistry(pkg, derived, sufficiency.dependents)
    const openCandidates = lives.filter((entry) => entry.open)

    // 레벨
    const decisions = new Map((pkg.discoveryDecisions ?? []).map((entry) => [entry.candidate, entry]))
    const survivorDecision = (entry) => decisions.get(survivors.find((item) => item.evidence.fault.id === entry.fault)?.id)
    const equivalent = mutants.filter((entry) => entry.status === 'survived' && survivorDecision(entry)?.decision === 'equivalent')
    const outOfScope = mutants.filter((entry) => entry.status === 'survived' && survivorDecision(entry)?.decision === 'out-of-scope')
    const considered = mutants.filter((entry) => entry.status !== 'invalid').length - equivalent.length - outOfScope.length
    const killed = mutants.filter((entry) => entry.status === 'killed').length
    const threshold = pkg.mutationThreshold ?? 1
    const score = considered > 0 ? killed / considered : 0
    const undecidedSurvivors = mutants.filter((entry) => entry.status === 'survived' && !survivorDecision(entry))

    const levels = {
      L1: requirements,
      L2: {
        status:
          space.complete &&
          baseline.trace.failures === 0 &&
          world &&
          world.settings.some((entry) => entry.status === 'pass') &&
          world.violations === 0 &&
          world.errors === 0 &&
          world.unknown === 0
            ? 'pass'
            : 'fail',
        traces: { cases: baseline.trace.cases, passed: baseline.trace.passed, complete: space.complete, first: baseline.trace.first },
        world: world ? { violations: world.violations, modelGaps: world.modelGaps, errors: world.errors, unknown: world.unknown, settings: world.settings.length } : null,
      },
      L3: {
        status:
          proof.status === 'proven' && adequacy.status === 'proven' && canaries['sampler-reach'].status === 'pass' && !baseline.sampled.failed
            ? 'pass'
            : 'fail',
        laws: { status: proof.status, laws: proof.laws },
        adequacy: { status: adequacy.status, worlds: adequacy.counts ?? null, claim: adequacy.goalAudit?.claim ?? null },
        sampled: baseline.sampled,
      },
      L4:
        typeof pkg.metamorphic === 'string'
          ? { status: 'not-applicable', reason: pkg.metamorphic }
          : {
              status: meta.declared && metamorphic.length > 0 && metamorphic.every((entry) => entry.status === 'holds') ? 'pass' : 'fail',
              relations: metamorphic,
              ...(meta.declared ? {} : { reason: 'no metamorphic relation declared' }),
            },
      L5: {
        status:
          baselineFailures.length === 0 &&
          mutationStatus === 'run' &&
          canaries['mutation-baseline'].status === 'pass' &&
          undecidedSurvivors.length === 0 &&
          score >= threshold
            ? 'pass'
            : 'fail',
        baselineFailures,
        faultModel: (pkg.faultModel ?? []).length,
        killed,
        considered,
        equivalent: equivalent.map((entry) => entry.fault),
        outOfScope: outOfScope.map((entry) => entry.fault),
        survivors: mutants.filter((entry) => entry.status === 'survived').map((entry) => entry.fault),
        invalid: invalidMutants.map((entry) => entry.fault),
        score,
        threshold,
      },
      L6: null,
      L7:
        runtimeResult.status === 'no-evidence'
          ? { status: 'no-evidence', reason: 'no runtime anomaly file was given — runtime behavior is unobserved' }
          : {
              status: runtimeStatus(runtimeResult.entries, lives),
              anomalies: runtimeResult.entries,
            },
    }
    const blockingOperators = Object.entries(operators).filter(
      ([, entry]) => !['run', 'covered', 'not-applicable', 'vacuous'].includes(entry.status),
    )
    const failingCanaries = Object.entries(canaries).filter(([, entry]) => entry.status !== 'pass')
    levels.L6 = {
      status:
        blockingOperators.length === 0 && openCandidates.length === 0 && failingCanaries.length === 0 && registry.issues.length === 0
          ? 'pass'
          : 'fail',
      operators: Object.fromEntries(Object.entries(operators).map(([id, entry]) => [id, { status: entry.status, candidates: entry.candidates.length, ...(entry.reason ? { reason: entry.reason } : {}) }])),
      openCandidates: openCandidates.map((entry) => entry.id),
      blockingOperators: blockingOperators.map(([id, entry]) => [`${id}: ${entry.status}`, entry.reason].filter(Boolean).join(' — ')),
      canaries,
      registryIssues: registry.issues,
      claim: 'no undecided candidate under the declared operators; AI operators count only their recorded runs — this is not Ω = U',
    }

    const failing = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'].filter(
      (level) => !['pass', 'not-applicable', 'no-evidence', 'reopened'].includes(levels[level].status),
    )
    const runner = await runnerState(directory, timeoutMs)
    const incomplete = productCompleteReasons(runner, locked)
    let verdict = 'CLOSED_WITH_BOUNDS'
    if (levels.L7.status === 'reopened') verdict = 'RUNTIME_REOPENED'
    else if (openCandidates.length > 0) verdict = 'EXPANSION_REQUIRED'
    else if (failing.length > 0) verdict = 'NOT_CLOSED'
    else if (incomplete.length === 0) verdict = 'PRODUCT_COMPLETE_WITH_BOUNDS'

    const residualRisk = residual({ pkg, adequacy, operators, lives, levels, space, sampling, derived })
    return {
      discoveryVersion: DISCOVERY_VERSION,
      package: relativePackage,
      inputs: { package: inputs, packageDigest: inputsDigestOf(inputs), product: productFiles, runtime: runtime ?? null },
      verdict,
      explorationClosed: levels.L6.status === 'pass',
      failingLevels: failing,
      runner: runner ?? null,
      productComplete: { reasons: incomplete },
      levels,
      coverage: {
        requirements: `${requirements.requirements.filter((entry) => entry.status !== 'unmapped' && entry.verbatim).length}/${requirements.requirements.length}`,
        traces: space.cases.length,
        bound: space.bound,
        worlds: adequacy.counts ? `${adequacy.counts.valid}/${adequacy.counts.worlds}` : null,
        mutation: `${killed}/${considered}`,
        operators: `${Object.values(operators).filter((entry) => ['run', 'covered'].includes(entry.status)).length} run or covered, ${
          Object.values(operators).filter((entry) => entry.status === 'not-applicable').length
        } n/a, of ${OPERATOR_IDS.length}`,
        openCandidates: openCandidates.length,
      },
      registry,
      candidates: lives,
      operators,
      residualRisk,
      claim:
        'closure relative to the declared oracle space, operators, fault model and constraints — never "no bugs" and never "the space is complete"',
    }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/** 남은 불확실성 — 한 단어 등급이 아니라 무엇이 검증되지 않았는지의 목록이다. */
function residual({ pkg, adequacy, operators, lives, levels, space, sampling, derived }) {
  const out = []
  for (const [id, entry] of Object.entries(operators))
    if (entry.status === 'not-applicable') out.push({ kind: 'operator-not-applicable', operator: id, reason: entry.reason ?? entry.source ?? '' })
  for (const id of AI_OPERATORS)
    if (operators[id]?.status === 'run')
      out.push({
        kind: 'ai-sampled',
        operator: id,
        runs: operators[id].runs.filter((run) => run.status === 'current').length,
        note: 'AI exploration is sampled, not exhaustive — closure counts only these recorded runs',
      })
  // every closing decision except an absorbed promotion is a human claim the tool did not verify — covered included
  for (const life of lives)
    if (!life.open && life.decision && life.decision.decision !== 'promoted')
      out.push({
        kind: 'decided-candidate',
        candidate: life.id,
        decision: life.decision.decision,
        ...(life.decision.by ? { by: life.decision.by } : {}),
        source: life.decision.source ?? null,
        reason: life.decision.reason,
      })
  for (const id of DECLARED_OPERATORS)
    if (operators[id]?.status === 'covered')
      out.push({
        kind: 'operator-modeled',
        operator: id,
        axis: operators[id].axis,
        note: 'the author claims this axis models the operator; the tool checked only that it is an input the space varies',
      })
  for (const entry of levels.L1.requirements ?? [])
    if (entry.status === 'assumed') out.push({ kind: 'requirement-assumed', requirement: entry.id, by: entry.mappedBy })
  for (const row of pkg.assumptions ?? [])
    if (row.testability === 'untestable' || row.status !== 'confirmed')
      out.push({ kind: 'assumption', assumption: row.id, testability: row.testability, status: row.status, riskIfFalse: row.riskIfFalse })
  for (const id of adequacy.outside?.harness ?? []) out.push({ kind: 'harness-assumption', assumption: id })
  if (adequacy.outside?.rows) out.push({ kind: 'rows-outside-world', rows: adequacy.outside.rows })
  for (const hazard of adequacy.outside?.hazards ?? []) out.push({ kind: 'hazard-not-modeled', hazard: hazard.Hazard, disposition: hazard.Disposition })
  const withoutLifecycle = (pkg.terms ?? []).filter((term) => !term.lifecycle).map((term) => term.id)
  if (withoutLifecycle.length > 0) out.push({ kind: 'known-unknown', terms: withoutLifecycle, note: 'terms without a recorded lifecycle' })
  out.push({ kind: 'bound', traceBound: space.bound, sampled: { runs: sampling.runs, maxLength: sampling.maxLength }, note: 'longer traces are sampled, not enumerated' })
  const sampledOnly = operators['trace-extension']?.coveredBySampling ?? []
  if (sampledOnly.length > 0)
    out.push({ kind: 'sampled-only-patterns', patterns: sampledOnly, note: 'these behaviour patterns exist only past the bound and were executed by fast-check samples, not enumerated' })
  out.push({ kind: 'independence', evidence: adequacy.independence?.evidence ?? null, claim: adequacy.goalAudit?.claim ?? null })
  if (levels.L7.status === 'no-evidence') out.push({ kind: 'runtime-unobserved', note: levels.L7.reason })
  if (derived.diagnostics.length > 0) out.push({ kind: 'derivation-diagnostics', diagnostics: derived.diagnostics })
  return out
}

/** 사람이 읽는 요약 — 판정과 레벨, 막는 것. */
export function summary(result) {
  const { levels } = result
  const line = (id, text) => `${id} ${text}: ${levels[id].status}`
  return [
    `VERDICT: ${result.verdict}`,
    `${line('L1', 'Requirement Closure')} (${result.coverage.requirements} mapped verbatim)`,
    `${line('L2', 'State Closure')} (${levels.L2.traces.passed}/${levels.L2.traces.cases} traces${
      levels.L2.world ? `, ${levels.L2.world.settings} world settings, ${levels.L2.world.violations} violations` : ''
    })`,
    `${line('L3', 'Property Closure')} (laws ${levels.L3.laws.status}, adequacy ${levels.L3.adequacy.status}, fast-check ${
      levels.L3.sampled.executed
    }/${levels.L3.sampled.requested} executed, ${levels.L3.sampled.beyondBound} past the bound)`,
    [
      line('L4', 'Metamorphic Closure'),
      levels.L4.relations
        ? `(${levels.L4.relations.map((entry) => [entry.id, entry.status, 'on', entry.pairs, 'pairs'].join(' ')).join(', ')})`
        : null,
    ]
      .filter(Boolean)
      .join(' '),
    `${line('L5', 'Mutation Closure')} (${levels.L5.killed}/${levels.L5.considered} killed; equivalent ${levels.L5.equivalent.join(' ') || 'none'}; out of scope ${
      levels.L5.outOfScope.join(' ') || 'none'
    }; threshold ${levels.L5.threshold})`,
    `${line('L6', 'Exploration Closure')} (${result.coverage.operators}; open candidates ${levels.L6.openCandidates.length})`,
    `L7 Runtime Closure: ${levels.L7.status}`,
    ...levels.L6.blockingOperators.map((entry) => `  blocking operator ${entry}`),
    ...levels.L6.openCandidates.map((id) => {
      const entry = result.candidates.find((life) => life.id === id)
      // a record that exists only as a decision (a promotion whose target is missing) has no operator or summary
      const operator = entry.operator ?? 'decision'
      const cls = entry.class ?? entry.decision?.decision
      return `  open ${id} [${operator} · ${cls} · ${entry.stage}] ${entry.summary ?? entry.reason}`
    }),
    `Residual risk items: ${result.residualRisk.length}`,
    result.claim,
  ].join('\n')
}

const OPTIONS = ['package', 'out', 'runtime', 'dir', 'lock', 'operator', 'output', 'timeout-ms']

function parseOptions(args) {
  try {
    const options = Object.fromEntries(OPTIONS.map((name) => [name, { type: 'string' }]))
    return parseArgs({ args, options, strict: true }).values
  } catch (error) {
    throw new CliError('USAGE', `Unknown or incomplete option: ${error.message}`, 2)
  }
}

const USAGE = `usage:
  oracle-discovery.mjs close --package <oracle.package.json> [--out <dir>] [--runtime <anomalies.json>] [--dir <.ai/oracles/<id>>] [--lock <oracle.lock.json>]
  oracle-discovery.mjs ai-input --package <oracle.package.json> --operator ai-explorer|cross-agent --output <file>
  oracle-discovery.mjs cross-check --package <oracle.package.json>
  oracle-discovery.mjs mapping-input --package <oracle.package.json> --output <file outside the repository>
  oracle-discovery.mjs catalog`

/** 교차검증 명령 — mapping-input은 검토 입력만 쓰고(Bend 불필요), cross-check는 후보를 출력한다. */
async function crossCheckCommand(command, options) {
  const loaded = await loadPackage(options.package)
  if (command === 'mapping-input') {
    if (!options.output) throw new CliError('USAGE', USAGE, 2)
    const text = await mappingInput({ loaded })
    await writeFile(options.output, text)
    process.stdout.write(`MAPPING_INPUT_WRITTEN ${options.output} sha256:${sha256(text)}\n`)
    return
  }
  const { bin } = await ensureBend()
  const timeoutMs = options['timeout-ms'] ? Number(options['timeout-ms']) : undefined
  const result = await spaceCrossCheck({ loaded, bin, timeoutMs })
  process.stdout.write(`${JSON.stringify(result)}\n`)
  const clean = result.status === 'run' && result.candidates.length === 0
  process.exitCode = clean ? 0 : 1
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'child') {
    await child(args[0])
    return
  }
  if (command === 'catalog') {
    process.stdout.write(`${JSON.stringify(OPERATORS, null, 2)}\n`)
    return
  }
  if (!['close', 'ai-input', 'cross-check', 'mapping-input'].includes(command)) throw new CliError('USAGE', USAGE, 2)
  const options = parseOptions(args)
  if (!options.package) throw new CliError('USAGE', USAGE, 2)
  if (['mapping-input', 'cross-check'].includes(command)) {
    await crossCheckCommand(command, options)
    return
  }
  const { bin } = await ensureBend()
  const timeoutMs = options['timeout-ms'] ? Number(options['timeout-ms']) : undefined
  if (command === 'ai-input') {
    if (!options.operator || !options.output) throw new CliError('USAGE', USAGE, 2)
    const loaded = await loadPackage(options.package)
    const text = await aiInput({ loaded, operator: options.operator, bin, timeoutMs })
    await writeFile(options.output, text)
    process.stdout.write(`AI_INPUT_WRITTEN ${options.output} sha256:${sha256(text)}\n`)
    return
  }
  const result = await closure({
    packagePath: options.package,
    bin,
    ...(timeoutMs ? { timeoutMs } : {}),
    runtime: options.runtime ?? null,
    directory: options.dir ?? null,
    lock: options.lock ?? null,
  })
  if (options.out) {
    await mkdir(options.out, { recursive: true })
    await writeFile(join(options.out, 'CLOSURE.json'), `${JSON.stringify(result, null, 2)}\n`)
  }
  process.stdout.write(`${summary(result)}\n`)
  process.exitCode = ['CLOSED_WITH_BOUNDS', 'PRODUCT_COMPLETE_WITH_BOUNDS'].includes(result.verdict) ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT) {
  try {
    await main()
  } catch (error) {
    const cliError =
      error instanceof CliError ? error : new CliError(error.code ?? 'DISCOVERY_FAILED', error.message ?? String(error))
    process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
    process.exitCode = cliError.exitCode
  }
}

