// 법칙을 커널 전에 계산으로 점검하고(lawReport), 유한한 `for` 법칙의 칸 증명을 만들고(cellProof), 유한 상태 기계의 도달
// 집합으로 모든 trace의 안전 증명을 만든다(reachPlan·reachProof). 모두 컴파일된 def·Bend 원문·도달 상태만 받는다 — Bend를
// 부르지 않는다. 값은 oracle-types의 런타임 표현이고, 같음은 plain 값의 stableStringify다.

import { stableStringify } from './oracle-fs.mjs'
import {
  bendLiteral,
  bendTypeName,
  cardinality,
  defSignature,
  parseBendTypes,
  scanBendSource,
  toPlain,
  toRuntime,
  typeIR,
  valuesOf,
} from './oracle-types.mjs'

export const MAX_EVALS = 1_000_000
export const MAX_CELL_CASES = 4096
// 칸 목록(반례·자유 칸·귀납 반례)에 싣는 수 — 개수는 늘 전부를 센다
export const LISTED_CELLS = 100

class CliError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

// compileModel과 같은 감싸기: 컴파일된 def는 인자를 복사하지 않는다 — 도메인 값을 칸마다 나눠 쓰므로 복제해 넘긴다
const cloned =
  (fn) =>
  (...args) =>
    fn(...args.map((argument) => structuredClone(argument)))
const isTrue = (value) => toPlain(value) === true

/** 서명의 타입 원문 → 비교용: 수량 표식(`+`, `&2,`)·모듈 별칭·공백을 뗀다. */
const bareType = (type) =>
  type
    .replace(/^\+/, '')
    .replace(/^\w+\./, '')
    .replaceAll(/&\d+\s*,\s*/g, '')
    .replaceAll(/\s+/g, '')

/** 한 줄 서명 `def name(…) -> R:`이 인자 타입 params를 받고(수량 표식 무시), returns를 주면 그 타입을 돌려주는가. */
function typed(source, name, params, returns = null) {
  const signature = defSignature(source, name)
  if (signature?.params.length !== params.length) return false
  if (returns !== null && bareType(signature.returns) !== bareType(returns)) return false
  return signature.params.every(({ type }, index) => bareType(type) === bareType(params[index]))
}

const BOUND_FLAGS = { nat: ['Nat', '--nat-max'], list: ['List', '--list-max'] }

/** IR 안의 Nat·List마다 [종류, 상한이 있는가]. */
function boundSlots(ir) {
  switch (ir.kind) {
    case 'nat': {
      return [['nat', ir.max !== null]]
    }
    case 'list': {
      return [['list', ir.maxLength !== null], ...boundSlots(ir.of)]
    }
    case 'maybe': {
      return boundSlots(ir.of)
    }
    case 'data': {
      return ir.constructors.flatMap(({ fields }) => fields.flatMap((field) => boundSlots(field.type)))
    }
    default: {
      return []
    }
  }
}

function checkLimits({ prefix, bounds, maxEvals }) {
  if (!/^[A-Z]\w*$/.test(prefix ?? ''))
    throw new CliError('USAGE', 'prefix must name the model namespace, e.g. Toggle', 2)
  for (const [kind, value] of Object.entries(bounds)) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new CliError('USAGE', `${BOUND_FLAGS[kind]?.[1] ?? kind} must be a non-negative safe integer`, 2)
  }
  if (!Number.isSafeInteger(maxEvals) || maxEvals < 1)
    throw new CliError('USAGE', 'max-evals must be a positive safe integer', 2)
}

function checkDefs({ source, exported, prefix, state, command, relations, observe, invariant, run }) {
  const full = (name) => `${prefix}.${name}`
  for (const name of relations.map(full)) {
    if (!typed(source, name, [state, command, state], 'Bool'))
      throw new CliError(
        'RELATION_INVALID',
        `${name} must be def ${name}(s: ${state}, c: ${command}, t: ${state}) -> Bool`,
        2,
      )
  }
  if (observe && !typed(source, full(observe), [state]))
    throw new CliError('OBSERVE_INVALID', `${full(observe)} must be def ${full(observe)}(s: ${state}) -> <observed>`, 2)
  if (invariant && !typed(source, full(invariant), [state], 'Bool'))
    throw new CliError('INVARIANT_INVALID', `${full(invariant)} must be def ${full(invariant)}(s: ${state}) -> Bool`, 2)
  // 관계가 없는 불변식 점검에서도 --command가 모델의 사건 타입인지 여기서 걸린다
  if (!typed(source, full('step'), [state, command], state))
    throw new CliError('STEP_INVALID', `${full('step')} must be def ${full('step')}(s: ${state}, c: ${command}) -> ${state}`, 2)
  // run은 trace 법칙의 fold — 닿은 귀납 반례를 다시 접는 데 init과 함께 쓴다
  const needed = [...relations, observe, invariant, 'step', ...(run ? [run, 'init'] : [])].filter(Boolean).map(full)
  const missing = needed.filter((name) => typeof exported[name] !== 'function')
  if (missing.length > 0)
    throw new CliError('MODEL_INTERFACE', `the compiled model does not export ${missing.join(', ')}`, 2)
}

/** 상태·명령 타입 → 유한 IR. 상한 없는 Nat·List는 어느 상한이 빠졌는지 말하고 멈춘다. used: 실제로 도메인을 줄인 상한. */
function domainsOf({ source, state, command, bounds }) {
  const types = parseBendTypes(source)
  const irOf = (type) => {
    try {
      return typeIR(type, types, bounds)
    } catch (error) {
      throw new CliError('TYPE_UNSUPPORTED', error.message, 2)
    }
  }
  const stateIR = irOf(state)
  const commandIR = irOf(command)
  const slots = [...boundSlots(stateIR), ...boundSlots(commandIR)]
  const missing = [...new Set(slots.filter(([, bounded]) => !bounded).map(([kind]) => kind))]
  if (missing.length > 0) {
    throw new CliError(
      'SAMPLING_BOUND_REQUIRED',
      `${state}×${command} has an unbounded ${missing.map((kind) => BOUND_FLAGS[kind][0]).join(' and ')} — pass ${missing
        .map((kind) => BOUND_FLAGS[kind][1])
        .join(' and ')}; the report then says bounded: true and gives the bounds`,
      2,
    )
  }
  const empty = [state, command].filter((_type, index) => cardinality([stateIR, commandIR][index]) === 0)
  if (empty.length > 0)
    throw new CliError('TYPE_EMPTY', `${empty.join(' and ')} has no value: every check over it would hold vacuously`, 2)
  const used = Object.fromEntries(Object.entries(bounds).filter(([kind]) => slots.some(([slot]) => slot === kind)))
  return { types, stateIR, commandIR, used }
}

/** 강도를 재는 관측: --observe의 def, 아니면 상태 하나를 받는 `<prefix>.observe`, 아니면 상태 전체("state"). */
function scopeOf({ source, exported, prefix, state, observe }) {
  if (observe) return `${prefix}.${observe}`
  const fallback = `${prefix}.observe`
  if (typeof exported[fallback] !== 'function' || !typed(source, fallback, [state])) return 'state'
  return fallback
}

/** 관측값이 생성자 하나의 record면 그 필드 이름들 — 자유 칸이 어느 필드에서 갈리는지 본다. 타입을 못 읽으면 null. */
function recordFields({ source, scope, stateIR, types, bounds }) {
  let ir = stateIR
  if (scope !== 'state') {
    try {
      ir = typeIR(defSignature(source, scope).returns, types, bounds)
    } catch {
      return null
    }
  }
  if (ir.kind !== 'data' || ir.constructors.length !== 1) return null
  return ir.constructors[0].fields.map(({ name }) => name)
}

/** 검사를 모두 통과한 뒤에만 도메인을 펼친다 — 서명·도메인·비용 오류는 어떤 def도 부르기 전에 난다. */
function lawPlan(input) {
  const { exported, prefix, relations, invariant, run, maxEvals } = input
  checkLimits(input)
  checkDefs(input)
  const { types, stateIR, commandIR, used } = domainsOf(input)
  const stateCount = cardinality(stateIR)
  const cellCount = stateCount * cardinality(commandIR)
  const scope = relations.length > 0 ? scopeOf(input) : null
  const observing = scope !== null && scope !== 'state'
  const evaluations =
    cellCount * stateCount * relations.length + cellCount + (observing ? stateCount : 0) + (invariant ? cellCount : 0)
  if (evaluations > maxEvals) {
    throw new CliError(
      'LAWS_TOO_LARGE',
      `${cellCount} cells × ${stateCount} candidates need ${evaluations} evaluations, more than --max-evals ${maxEvals}: lower --nat-max or --list-max, or raise --max-evals`,
      2,
    )
  }
  const call = (name) => cloned(exported[`${prefix}.${name}`])
  const folding = Boolean(invariant && run)
  const states = valuesOf(stateIR)
  const plainOf = states.map(toPlain)
  const keys = plainOf.map(stableStringify)
  const observeFn = observing ? cloned(exported[scope]) : null
  const observed = (value, plain) => (observeFn === null ? plain : toPlain(observeFn(value)))
  const obsPlain = scope === null ? [] : states.map((value, index) => observed(value, plainOf[index]))
  return {
    stateIR,
    commandIR,
    used,
    evaluations,
    stateCount,
    commandCount: cardinality(commandIR),
    states,
    commands: valuesOf(commandIR),
    plainOf,
    keys,
    indexOf: new Map(keys.map((key, index) => [key, index])),
    step: call('step'),
    relations: relations.map((name) => ({ name: `${prefix}.${name}`, fn: call(name) })),
    invariantName: invariant ? `${prefix}.${invariant}` : null,
    invariant: invariant ? call(invariant) : null,
    run: folding ? call(run) : null,
    init: folding ? call('init') : null,
    scope,
    observed,
    obsPlain,
    obsKeys: obsPlain.map(stableStringify),
    fields: scope === null ? null : recordFields({ ...input, scope, stateIR, types, bounds: used }),
  }
}

const listing = () => ({ count: 0, listed: [] })

function note(list, entry) {
  if (list.listed.length < LISTED_CELLS) list.listed.push(entry())
  list.count += 1
}

const cellLiterals = (plan, cell) => ({
  state: bendLiteral(plan.plainOf[cell.index], plan.stateIR),
  command: bendLiteral(toPlain(cell.command), plan.commandIR),
  after: bendLiteral(cell.afterPlain, plan.stateIR),
})

/** 자유 칸의 후보 관측값이 갈리는 record 필드마다, 모델의 step이 그 필드를 지키는가(관측한 step(s, c).f = s.f). */
function freeFieldsOf(plan, cell, candidates) {
  const { fields, obsPlain } = plan
  const before = obsPlain[cell.index]
  const after = cell.afterIndex === undefined ? plan.observed(cell.after, cell.afterPlain) : obsPlain[cell.afterIndex]
  return fields
    .filter((field) => new Set(candidates.map((index) => stableStringify(obsPlain[index][field]))).size > 1)
    .map((field) => ({ field, kept: stableStringify(after[field]) === stableStringify(before[field]) }))
}

/** 모든 관계를 만족하는 후보들의 관측값: 하나면 고정(그 관계가 없으면 풀리는 칸이 관계의 기여), 둘 이상이면 자유, 없으면 빈 칸. */
function strengthCell(plan, tallies, cell, candidates, singles) {
  const { obsKeys } = plan
  const distinct = new Set(candidates.map((index) => obsKeys[index]))
  if (distinct.size === 0) {
    tallies.empty += 1
    return
  }
  if (distinct.size === 1) {
    tallies.pinned += 1
    singles.forEach((indices, at) => {
      if (indices.some((index) => !distinct.has(obsKeys[index]))) tallies.marginal[at] += 1
    })
    return
  }
  const alternatives = distinct.size - 1
  tallies.alternatives += alternatives
  const freeFields = plan.fields === null ? null : freeFieldsOf(plan, cell, candidates)
  for (const { field } of (freeFields ?? []).filter(({ kept }) => kept))
    tallies.kept.set(field, (tallies.kept.get(field) ?? 0) + 1)
  note(tallies.free, () => {
    const { state, command } = cellLiterals(plan, cell)
    return { state, command, alternatives, ...(freeFields === null ? {} : { freeFields }) }
  })
}

/** 칸 (s, c) 하나: 후보 t마다 관계를 한 번씩 계산해 반례(step 결과가 깨는 관계)와 강도를 같은 결과에서 낸다. */
function relationCell(plan, tallies, cell) {
  const { relations } = plan
  const failedAt = (t) => relations.flatMap(({ fn }, at) => (isTrue(fn(cell.state, cell.command, t)) ? [] : [at]))
  const failures = plan.states.map(failedAt)
  // step 결과가 상한 밖이면 후보에 없다 — 그때만 따로 계산한다
  const failedAfter = cell.afterIndex === undefined ? failedAt(cell.after) : failures[cell.afterIndex]
  for (const at of failedAfter)
    note(tallies.counterexamples, () => ({ relation: relations[at].name, ...cellLiterals(plan, cell) }))
  const candidates = failures.flatMap((failed, index) => (failed.length === 0 ? [index] : []))
  // 관계 하나만 거짓인 후보 — 그 관계를 빼면 후보가 된다
  const only = failures.map((failed) => (failed.length === 1 ? failed[0] : -1))
  const singles = relations.map((_, at) => only.flatMap((failed, index) => (failed === at ? [index] : [])))
  strengthCell(plan, tallies, cell, candidates, singles)
}

/** 닿은 trace에 사건을 이은 trace를 법칙 자신의 fold로 다시 접어도 불변식이 깨지는가. fold가 없으면 step으로 접은 것과 같다고 본다. */
function brokenAlongTrace(plan, trace, cell) {
  if (plan.run === null) return true
  const events = toRuntime([...trace, toPlain(cell.command)], { kind: 'list', of: plan.commandIR, maxLength: null })
  return !isTrue(plan.invariant(plan.run(events, plan.init())))
}

function invariantCell(plan, tallies, cell, holding, reached) {
  const kept = cell.afterIndex === undefined ? isTrue(plan.invariant(cell.after)) : holding[cell.afterIndex]
  if (kept) return
  const trace = reached?.traces.get(plan.keys[cell.index]) ?? null
  const witness = () => ({
    ...cellLiterals(plan, cell),
    ...(reached === null ? {} : { reached: trace?.map((event) => bendLiteral(event, plan.commandIR)) ?? null }),
  })
  note(tallies.ctis, witness)
  // 목록 밖의 칸도 센다 — 닿는 반례 하나가 목록 뒤에 있어도 빠지지 않는다
  if (trace === null || !brokenAlongTrace(plan, trace, cell)) return
  tallies.reached.first ??= witness()
  tallies.reached.count += 1
}

function evaluateCells(plan, reached) {
  const tallies = {
    counterexamples: listing(),
    free: listing(),
    ctis: listing(),
    reached: { count: 0, first: null },
    pinned: 0,
    empty: 0,
    alternatives: 0,
    marginal: plan.relations.map(() => 0),
    kept: new Map(),
  }
  const holding = plan.invariant === null ? null : plan.states.map((value) => isTrue(plan.invariant(value)))
  const cells = plan.states.flatMap((state, index) => plan.commands.map((command) => ({ index, state, command })))
  for (const cell of cells) {
    cell.after = plan.step(cell.state, cell.command)
    cell.afterPlain = toPlain(cell.after)
    cell.afterIndex = plan.indexOf.get(stableStringify(cell.afterPlain))
    if (plan.relations.length > 0) relationCell(plan, tallies, cell)
    if (holding?.[cell.index]) invariantCell(plan, tallies, cell, holding, reached)
  }
  return { ...tallies, invariantStates: holding?.filter(Boolean).length ?? 0 }
}

function statusOf(tallies) {
  if (tallies.counterexamples.count > 0) return 'counterexample'
  return tallies.ctis.count > 0 ? 'not-inductive' : 'ok'
}

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`

// 보고 → 고칠 방향 한 줄. 처음 맞는 줄 하나만 쓰고, 맞는 줄이 없으면 hint가 없다. 칸은 목록의 첫 항목을 이름한다.
const LAW_HINTS = [
  [
    (report) => report.counterexampleCount > 0,
    ({ counterexamples: [first] }) =>
      `${first.relation} is false at ${first.state} ${first.command} (step gives ${first.after}): the model breaks the law or the law misstates its sentence — check the source before changing either`,
  ],
  [
    (report) => (report.invariant?.ctiCount ?? 0) > 0,
    ({ invariant }) =>
      `${plural(invariant.ctiCount, 'counterexample')} to induction of ${invariant.def}: a CTI the space reaches means the model or requirement is wrong; one it does not reach within the bound means the invariant needs a conjunct`,
  ],
  [
    (report) => Object.keys(report.strength?.keptFields ?? {}).length > 0,
    ({ strength }) => {
      const fields = Object.entries(strength.keptFields).sort(([, left], [, right]) => right - left)
      const named = fields.map(([field, count]) => `${field} in ${plural(count, 'cell')}`).join(', ')
      return `the laws leave ${named} open while the model's step keeps the field: a frame law ("a refused or stayed event keeps ${fields[0][0]}") or another law pins them`
    },
  ],
  [
    (report) => (report.strength?.freeCount ?? 0) > 0,
    ({ strength }) =>
      `${plural(strength.freeCount, 'cell')} leave ${strength.scope === 'state' ? 'the next state' : strength.scope} open: a law can pin them if the source decides them; a property relation may leave a cell open on purpose; otherwise it is a question`,
  ],
  [
    (report) => (report.strength?.emptyCount ?? 0) > 0,
    ({ strength }) =>
      `${plural(strength.emptyCount, 'cell')} have no candidate in the bounded domain that satisfies every relation: raise the bounds or check the relations`,
  ],
]

export function lawHint(report) {
  const found = LAW_HINTS.find(([matches]) => matches(report))
  return found ? found[1](report) : null
}

function reportOf(input, plan, tallies, reached) {
  const names = plan.relations.map(({ name }) => name)
  const bounded = Object.keys(plan.used).length > 0
  return {
    status: statusOf(tallies),
    prefix: input.prefix,
    state: input.state,
    command: input.command,
    relations: names,
    domain: { states: plan.stateCount, commands: plan.commandCount, cells: plan.stateCount * plan.commandCount },
    bounded,
    ...(bounded ? { bounds: plan.used } : {}),
    evaluations: plan.evaluations,
    counterexampleCount: tallies.counterexamples.count,
    counterexamples: tallies.counterexamples.listed,
    strength:
      names.length === 0
        ? null
        : {
            scope: plan.scope,
            pinnedCount: tallies.pinned,
            freeCount: tallies.free.count,
            emptyCount: tallies.empty,
            alternatives: tallies.alternatives,
            marginal: Object.fromEntries(names.map((name, at) => [name, tallies.marginal[at]])),
            ...(plan.fields === null ? {} : { keptFields: Object.fromEntries(tallies.kept) }),
            freeCells: tallies.free.listed,
          },
    invariant:
      plan.invariant === null
        ? null
        : {
            def: plan.invariantName,
            states: tallies.invariantStates,
            ctiCount: tallies.ctis.count,
            ctis: tallies.ctis.listed,
            reach: reached === null ? null : { bound: reached.bound, complete: reached.complete },
            ...(reached === null ? {} : { reachedCount: tallies.reached.count, firstReached: tallies.reached.first }),
          },
  }
}

/**
 * 관계·불변식 def를 모델 도메인의 모든 칸 (s, c)에서 계산한다 — 커널 전에 반례, 법칙이 다음 상태를 얼마나 고정하는지,
 * 귀납 반례를 본다. 이름은 `emit-state --relation`처럼 접두 없는 def 이름(`R_x` → `<prefix>.R_x`)이고 보고는 전체 이름이다.
 * 같은 관계를 두 번 주면 한 번으로 센다. reach: 서명·도메인·비용 검사가 모두 통과한 뒤에만 한 번 부르는 함수 —
 * `{ bound, complete, traces }`(공간이 닿은 상태의 키(plain 값의 stableStringify) → 처음 닿은 plain 사건 목록)를 준다.
 * reach가 있으면 닿은 귀납 반례를 목록과 따로 전부 센다(reachedCount, 첫 칸 firstReached). run(trace 법칙
 * `I(run(t, init()))`의 fold, 접두 없는 이름)을 주면 그중 닿은 trace에 사건을 이어 run으로 접어도 I가 깨지는 칸만 센다.
 */
export function lawReport({
  source,
  exported,
  prefix,
  state,
  command,
  relations = [],
  observe = null,
  invariant = null,
  run = null,
  bounds = {},
  maxEvals = MAX_EVALS,
  reach = null,
}) {
  const input = {
    source,
    exported,
    prefix,
    state,
    command,
    relations: [...new Set(relations)],
    observe,
    invariant,
    run,
    bounds,
    maxEvals,
  }
  const plan = lawPlan(input)
  const reached = reach === null ? null : reach()
  const report = reportOf(input, plan, evaluateCells(plan, reached), reached)
  const hint = lawHint(report)
  return hint === null ? report : { ...report, hint }
}

const caseCount = (irs) => irs.reduce((product, ir) => product * cardinality(ir), 1)

/** 법칙 하나 → 묶음마다 유한 IR, 또는 칸 증명을 만들지 않는 이유. types가 null이면 묶음 타입을 풀 MODEL.bend가 없다. */
function cellPlan({ binders, witness }, types, maxCases) {
  if (witness) return { skip: { reason: 'witness' } }
  if (binders.length === 0) return { skip: { reason: 'no-binders' } }
  if (types === null) return { skip: { reason: 'no-model' } }
  const irs = []
  for (const binder of binders) {
    const at = { binder: binder.name, type: binder.type }
    let ir
    try {
      ir = typeIR(binder.type, types)
    } catch (error) {
      // MODEL.bend에 없는 타입, 재귀 타입, 동치 가설 같은 타입 아닌 묶음 — 유한한지 알 수 없다
      return { skip: { reason: 'unsupported-type', ...at, error: error.message } }
    }
    const size = cardinality(ir)
    if (!Number.isFinite(size)) return { skip: { reason: 'not-finite', ...at, cardinality: 'infinite' } }
    // 값이 없는 타입은 case가 하나도 없는 match가 된다
    if (size === 0) return { skip: { reason: 'empty-domain', ...at } }
    irs.push(ir)
  }
  const cases = caseCount(irs)
  if (cases > maxCases) return { skip: { reason: 'too-many-cases', cases, maxCases } }
  return { irs }
}

const CELLS_HEADER = [
  'import Base',
  'import ./MODEL.bend as M',
  'import ./LAWS.bend as Laws',
  'import ./PROOF.bend as Proof',
  '',
  '# Generated by oracle-model.mjs prove for the laws PROOF.bend leaves undefined: one case per value of each `for`',
  '# binder, closed by computation. It is checked in a temporary copy and never written beside PROOF.bend.',
  '',
]

/** 칸마다 `{==}` 한 줄 — 값은 바깥 묶음부터 valuesOf 순서, 리터럴은 MODEL 생성자에 `M.`, Base 생성자는 그대로. */
function cellsDef({ name, binders }, irs) {
  const vars = binders.map((binder) => binder.name)
  const options = irs.map((ir) => valuesOf(ir).map((value) => bendLiteral(toPlain(value), ir)))
  const rows = options.reduce((partial, values) => partial.flatMap((row) => values.map((value) => [...row, value])), [[]])
  return [
    `def Laws.${name}(${vars.join(', ')}):`,
    `  match ${vars.join(' ')}:`,
    ...rows.flatMap((row) => [`    case ${row.join(' ')}:`, '      {==}']),
  ].join('\n')
}

/**
 * names(PROOF.bend가 채우지 않은 law)마다 칸 증명 — `for` 값의 조합마다 case 하나를 `{==}`로 닫는 `def Laws.<name>`.
 * text는 PROOF.bend를 부르는 검사용 진입 파일(LAWS.bend 순서)이고, 만들 law가 없으면 null이다. 만들 수 없는 law는 이유와
 * 함께 skipped다. model은 MODEL.bend 원문 — LAWS.bend가 옆의 MODEL.bend를 부르지 않으면 null이고, 그때는 만들지 않는다.
 */
export function cellProof({ laws, model, names, maxCases = MAX_CELL_CASES }) {
  const types = model === null ? null : parseBendTypes(model)
  const planned = scanBendSource(laws)
    .laws.filter((block) => names.includes(block.name))
    .map((block) => ({ block, ...cellPlan(block, types, maxCases) }))
  const generated = planned.filter(({ skip }) => !skip)
  const text =
    generated.length === 0
      ? null
      : `${[...CELLS_HEADER, generated.map(({ block, irs }) => cellsDef(block, irs)).join('\n\n')].join('\n')}\n`
  return {
    text,
    generated: generated.map(({ block, irs }) => ({ law: block.name, cases: caseCount(irs) })),
    skipped: planned.filter(({ skip }) => skip).map(({ block, skip }) => ({ law: block.name, ...skip })),
  }
}

// prove-reach: 상태 도메인 × 사건 도메인 칸 수 상한 — 증명 파일은 상태마다, 도달 상태에서는 사건마다 arm 하나다.
// Bend 2.0.34 실측(사건 둘): 상태 1만 = 2.8MB·3초, 10만 = 32MB·36초로 선형이다.
export const MAX_REACH_CELLS = 100_000

/** IR 안에서 처음 만나는 무한 자리(Nat·List)의 경로 — `Pay.Pay.charges`처럼 타입·생성자·필드. 없으면 null. */
function infiniteSlot(ir, path) {
  if (ir.kind === 'nat') return { path, type: 'Nat' }
  if (ir.kind === 'list') return { path, type: 'List' }
  if (ir.kind === 'maybe') return infiniteSlot(ir.of, path)
  if (ir.kind !== 'data') return null
  for (const { name, fields } of ir.constructors) {
    for (const field of fields) {
      const found = infiniteSlot(field.type, `${path}.${name}.${field.name}`)
      if (found) return found
    }
  }
  return null
}

/** 도달 집합 증명의 도메인 하나. 무한이면 NOT_FINITE — 와일드카드 arm은 목표를 정제하지 못해 비멤버를 덮을 수 없다. */
function finiteDomain(type, types, role) {
  let ir
  try {
    ir = typeIR(type, types)
  } catch (error) {
    if (error.message.startsWith('recursive type'))
      throw new CliError('NOT_FINITE', `the ${role} type ${type} is recursive, so it has infinitely many values: ${error.message}`)
    throw new CliError('TYPE_UNSUPPORTED', error.message, 2)
  }
  if (!Number.isFinite(cardinality(ir))) {
    const slot = infiniteSlot(ir, bareType(type))
    // 무한 자리가 없는데 무한이면 유한한 곱이 수의 범위를 넘었다
    if (slot === null)
      throw new CliError(
        'REACH_TOO_LARGE',
        `the ${role} type ${type} has more values than a number can count: model coarser classes`,
        2,
      )
    throw new CliError(
      'NOT_FINITE',
      `the ${role} type ${type} is infinite (${slot.path} is a ${slot.type}): prove-reach needs finite types — model the field in finite classes (a saturated counter) or prove the law with an invariant`,
    )
  }
  return ir
}

/**
 * prove-reach의 입력 점검 — 어떤 def도 컴파일하기 전에 원문만으로. 상태·사건 타입은 `<prefix>.step(s: S, m: E) -> S`
 * 서명에서 읽고, `<prefix>.init() -> S`, `<prefix>.<safe>(s: S) -> Bool`, 있으면 `<prefix>.enabled(s: S) -> List<E>`를
 * 확인한다. 두 타입이 유한하고 칸 수(상태 × 사건)가 maxCells 이하일 때만 도메인을 돌려준다.
 */
export function reachPlan({ source, prefix, safe, maxCells = MAX_REACH_CELLS }) {
  if (!/^[A-Z]\w*$/.test(prefix ?? ''))
    throw new CliError('USAGE', 'prefix must name the model namespace, e.g. Pay', 2)
  if (!/^\w+$/.test(safe ?? ''))
    throw new CliError('USAGE', '--safe names a def under the prefix without it, e.g. at_most_one for Pay.at_most_one', 2)
  if (!Number.isSafeInteger(maxCells) || maxCells < 1)
    throw new CliError('USAGE', 'max-cells must be a positive safe integer', 2)
  const full = (name) => `${prefix}.${name}`
  const signature = defSignature(source, full('step'))
  if (signature?.params.length !== 2 || bareType(signature.returns) !== bareType(signature.params[0].type))
    throw new CliError('STEP_INVALID', `${full('step')} must be def ${full('step')}(s: <State>, m: <Event>) -> <State>`, 2)
  const [state, command] = signature.params.map(({ type }) => type.replace(/^\+/, '').trim())
  if (!typed(source, full('init'), [], state))
    throw new CliError('INIT_INVALID', `${full('init')} must be def ${full('init')}() -> ${state}`, 2)
  if (!typed(source, full(safe), [state], 'Bool'))
    throw new CliError('SAFE_INVALID', `${full(safe)} must be def ${full(safe)}(s: ${state}) -> Bool`, 2)
  const enabled = defSignature(source, full('enabled')) !== null
  if (enabled && !typed(source, full('enabled'), [state], `List<${command}>`))
    throw new CliError('ENABLED_INVALID', `${full('enabled')} must be def ${full('enabled')}(s: ${state}) -> List<${command}>`, 2)

  const types = parseBendTypes(source)
  const stateIR = finiteDomain(state, types, 'state')
  const commandIR = finiteDomain(command, types, 'event')
  const empty = [state, command].filter((_type, index) => cardinality([stateIR, commandIR][index]) === 0)
  if (empty.length > 0)
    throw new CliError('TYPE_EMPTY', `${empty.join(' and ')} has no value: a proof over it would hold vacuously`, 2)
  const stateCount = cardinality(stateIR)
  const commandCount = cardinality(commandIR)
  const cells = stateCount * commandCount
  if (cells > maxCells)
    throw new CliError(
      'REACH_TOO_LARGE',
      `${stateCount} states × ${commandCount} events = ${cells} cells, more than --max-cells ${maxCells}: the proof has an arm per state and per reached state and event — model coarser classes or raise --max-cells`,
      2,
    )
  return { prefix, safe: full(safe), state, command, stateIR, commandIR, stateCount, commandCount, cells, enabled }
}

const REACH_HEADER = (importPath) => [
  'import Base',
  `import ${importPath} as M`,
  '',
  '# Generated by oracle-model.mjs prove-reach: Reach.inv is the set of states reached from init, one arm per state',
  '# of the domain. The kernel checks that every step keeps it and that it implies the safety def. It is checked in a',
  '# temporary copy and never written beside the model.',
  '',
  'def Reach.clash(b: Bool) -> Type:',
  '  match b:',
  '    case False{}:',
  '      Empty',
  '    case True{}:',
  '      Unit',
  '',
  'def Reach.absurd(e: {False{} == True{} : Bool}) -> Empty:',
  '  %Equal.sym(Bool, False{}, True{}, e) : Reach.clash(_)',
  '  Unit{}',
  '',
]

/**
 * `Reach.step` — 모델의 step. enabled가 있으면 enabled가 내지 않는 사건에서 상태를 그대로 둔다(stutter): 그러면 모든
 * trace에 대한 법칙이 환경이 허용하는 trace의 안전과 같고, 닫힘은 허용 사건에 대해서만 검사된다. 사건이 목록에 있는지는
 * 사건 도메인의 값마다 한 arm인 같음(`Reach.same`)으로 계산한다.
 */
function reachStep({ prefix, enabled }, S, E, events) {
  if (!enabled) return [`def Reach.step(s: ${S}, m: ${E}) -> ${S}:`, `  M.${prefix}.step(s, m)`, '']
  return [
    `def Reach.same(a: ${E}, b: ${E}) -> Bool:`,
    '  match a b:',
    ...events.flatMap((event) => [`    case ${event} ${event}:`, '      True{}']),
    '    case _ _:',
    '      False{}',
    '',
    `def Reach.has(xs: List<${E}>, +m: ${E}) -> Bool:`,
    '  match xs:',
    '    case Nil{}:',
    '      False{}',
    '    case Con{x, rest}:',
    '      Bool.or(Reach.same(x, m), Reach.has(rest, m))',
    '',
    `def Reach.keep(allowed: Bool, s: ${S}, t: ${S}) -> ${S}:`,
    '  match allowed:',
    '    case True{}:',
    '      t',
    '    case False{}:',
    '      s',
    '',
    `def Reach.step(+s: ${S}, +m: ${E}) -> ${S}:`,
    `  Reach.keep(Reach.has(M.${prefix}.enabled(s), m), s, M.${prefix}.step(s, m))`,
    '',
  ]
}

/**
 * 도달 집합 R의 Certify 증명 파일 한 장. `Reach.inv`는 상태 도메인 전체의 명시 arm(멤버 True, 비멤버 False)이고,
 * `inv_step`은 멤버마다 사건 arm을 `{==}`로, 비멤버는 가정 `False == True`의 모순으로 닫는다 — 와일드카드 arm은 목표를
 * 정제하지 못한다. 그 뒤 `inv_safe`와 귀납 하나(`safe_run`)로 `law reach_safe`(모든 trace에서 safe)를 증명한다.
 * members: 도달 상태의 plain 키 집합. arms: 생성한 match arm 수(상태 도메인 × 3 + 도달 상태 × 사건 [+ 같음 arm]).
 */
export function reachProof(plan, members, importPath) {
  const { prefix, safe, stateIR, commandIR, enabled } = plan
  const S = bendTypeName(stateIR)
  const E = bendTypeName(commandIR)
  const literal = (value, ir) => bendLiteral(toPlain(value), ir)
  const states = valuesOf(stateIR).map((value) => ({
    text: literal(value, stateIR),
    member: members.has(stableStringify(toPlain(value))),
  }))
  const events = valuesOf(commandIR).map((value) => literal(value, commandIR))
  // 도메인이 크면 arm이 수십만 줄이다 — 인자 펼치기(push(...xs))는 호출 스택을 넘으므로 한 줄씩 넣는다
  const lines = REACH_HEADER(importPath)
  const add = (...items) => {
    for (const item of items) lines.push(item)
  }
  add(`def Reach.inv(s: ${S}) -> Bool:`, '  match s:')
  for (const { text, member } of states) add(`    case ${text}:`, `      ${member ? 'True{}' : 'False{}'}`)
  add('')
  for (const line of reachStep(plan, S, E, events)) add(line)
  const kept = (s) => `{Reach.inv(Reach.step(${s}, m)) == True{} : Bool}`
  const safeOf = (s) => `{M.${safe}(${s}) == True{} : Bool}`
  add(
    `def Reach.run(t: List<${E}>, s: ${S}) -> ${S}:`,
    '  match t:',
    '    case Nil{}:',
    '      s',
    '    case Con{m, rest}:',
    '      Reach.run(rest, Reach.step(s, m))',
    '',
    `def Reach.no_step(s: ${S}, m: ${E}, h: {False{} == True{} : Bool}) -> ${kept('s')}:`,
    `  Empty.absurd(${kept('s')}, Reach.absurd(h))`,
    '',
    `def Reach.no_safe(s: ${S}, h: {False{} == True{} : Bool}) -> ${safeOf('s')}:`,
    `  Empty.absurd(${safeOf('s')}, Reach.absurd(h))`,
    '',
    `def Reach.inv_step(s: ${S}, m: ${E}, h: {Reach.inv(s) == True{} : Bool}) -> ${kept('s')}:`,
    '  match s:',
  )
  const memberArms = ['      match m:', ...events.flatMap((event) => [`        case ${event}:`, '          {==}'])]
  for (const { text, member } of states) {
    add(`    case ${text}:`)
    if (member) for (const line of memberArms) add(line)
    else add(`      Reach.no_step(${text}, m, h)`)
  }
  add('', `def Reach.inv_safe(s: ${S}, h: {Reach.inv(s) == True{} : Bool}) -> ${safeOf('s')}:`, '  match s:')
  for (const { text, member } of states) add(`    case ${text}:`, member ? '      {==}' : `      Reach.no_safe(${text}, h)`)
  const fromInit = `Reach.run(t, M.${prefix}.init())`
  add(
    '',
    `def Reach.safe_run(t: List<${E}>, +s: ${S}, h: {Reach.inv(s) == True{} : Bool}) -> ${safeOf('Reach.run(t, s)')}:`,
    '  match t:',
    '    case Nil{}:',
    '      Reach.inv_safe(s, h)',
    '    case Con{+m, rest}:',
    '      Reach.safe_run(rest, Reach.step(s, m), Reach.inv_step(s, m, h))',
    '',
    'law reach_safe:',
    `  for t: List<${E}>`,
    `  ${safeOf(fromInit)}`,
    '',
    'def reach_safe(t):',
    `  Reach.safe_run(t, M.${prefix}.init(), {==})`,
    '',
  )
  const reached = states.filter(({ member }) => member).length
  const sameArms = enabled ? events.length + 1 : 0
  return { text: lines.join('\n'), arms: states.length * 3 + reached * events.length + sameArms }
}
