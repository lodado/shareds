#!/usr/bin/env node

// 여러 run을 가로질러 되풀이된 원인을 센다 — 한 run 안에서는 rewind·보정이 그 run의 수리일 뿐이지만, 같은 원인이 여러 run에서
// 되풀이되면 그것은 스킬이 아직 구조로 막지 못한 실수다. 읽기만 하고 제안만 낸다: 새 lint·스윕 규칙·intake 질문으로 옮기는
// 일은 유지보수자가 한다(applied는 언제나 false). 0.101 이전 rewind는 이유가 없으므로 unrecorded로만 센다 — 추측하지 않는다.

import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { runCli } from './oracle-cli.mjs'
import { readStage } from './oracle-stage.mjs'

class CliError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

const STOP_STATES = new Set(['FAIL', 'NEEDS_DECISION'])
const SUGGESTIONS = {
  'review-finding': 'independent reviews keep sending runs back — turn the repeated finding into a pre-lock sweep check or card-lint rule',
  'gate-failure': 'a stage gate keeps refusing — move that check into authoring guidance so the author meets it before advance',
  'user-answer': 'user answers keep reopening the model — ask the question at intake as a Space axis',
  'source-change': 'sources keep moving under runs — settle the source set before MODELED',
}

const BUDGET_SUGGESTIONS = {
  policy: 'policy decisions keep reopening Delivery — settle them in the card before lock',
  harness: 'harness corrections keep recurring — fix the recurring cause in the $test harness guidance',
  product: 'product repairs keep recurring — look for the card row or Space axis those repairs share',
}

/** 원장 줄마다 객체여야 한다 — 끊긴 줄·null 하나는 그 원장만 버리고, 같은 run의 stage 기록은 그대로 센다. */
async function readLedger(directory) {
  const raw = await readFile(join(directory, 'runs.jsonl'), 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
  return raw.split('\n').filter(Boolean).map((line, index) => {
    const event = JSON.parse(line)
    if (event === null || typeof event !== 'object' || Array.isArray(event)) throw new Error(`line ${index + 1} is not an object`)
    return event
  })
}

/** `<root>/.ai/oracles/<id>/`마다 stage 기록과 원장 — 읽을 수 없는 run은 이유와 함께 skipped로 남는다. */
async function collect(root) {
  const base = join(root, '.ai', 'oracles')
  const entries = await readdir(base, { withFileTypes: true }).catch(() => [])
  const runs = []
  const skipped = []
  for (const id of entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
    const directory = join(base, id)
    let stage
    try {
      stage = await readStage(directory)
    } catch (error) {
      skipped.push({ run: id, error: error.message })
      continue
    }
    let ledger = []
    try {
      ledger = await readLedger(directory)
    } catch (error) {
      skipped.push({ run: id, error: `runs.jsonl: ${error.message}` })
    }
    if (stage || ledger.length) runs.push({ id, history: stage?.history ?? [], dispatches: stage?.dispatches ?? [], ledger })
  }
  return { runs, skipped }
}

const bump = (counts, key) => {
  counts[key] = (counts[key] ?? 0) + 1
}

export function reflectRuns(runs, { minRuns = 2 } = {}) {
  const rewinds = { total: 0, unrecorded: 0, byReason: {}, byWalk: {} }
  const budgets = {}
  const stops = {}
  // signal → 그 신호가 나온 run과 메모, 처음 본 순서대로(rewind가 budget보다 앞선다)
  const signals = new Map()
  const observe = (signal, run, note) => {
    const entry = signals.get(signal) ?? { signal, runs: new Set(), count: 0, notes: [] }
    entry.runs.add(run)
    entry.count += 1
    if (note && !entry.notes.includes(note)) entry.notes.push(note)
    signals.set(signal, entry)
  }
  for (const run of runs) {
    run.history.forEach((step, index) => {
      if (step.evidence !== 'rewind') return
      rewinds.total += 1
      bump(rewinds.byWalk, `${run.history[index - 1]?.stage ?? '?'}→${step.stage}`)
      if (!step.reason) {
        rewinds.unrecorded += 1
        return
      }
      bump(rewinds.byReason, step.reason)
      observe(`rewind:${step.reason}`, run.id, step.note)
    })
  }
  for (const run of runs) {
    for (const event of run.ledger) {
      if (event.type === 'budget' && !event.duplicate) {
        bump(budgets, event.budget)
        observe(`budget:${event.budget}`, run.id, event.reason)
      }
      if (event.type === 'transition' && STOP_STATES.has(event.state)) bump(stops, event.state)
    }
  }
  const candidates = [...signals.values()]
    .filter((entry) => entry.runs.size >= minRuns)
    .sort((left, right) => right.runs.size - left.runs.size)
    .map(({ signal, runs: seen, count, notes }) => {
      const [kind, name] = signal.split(':')
      return {
        signal,
        runs: [...seen].sort(),
        count,
        notes,
        suggest: (kind === 'rewind' ? SUGGESTIONS : BUDGET_SUGGESTIONS)[name] ?? `${signal} recurs — find what those runs share`,
        applied: false,
      }
    })
  return { runs: runs.length, rewinds, budgets, stops, candidates }
}

const STAGE_ORDER = ['DISCOVERING', 'MODELED', 'CHECKED', 'DRAFTED', 'ORACLE_READY']
const at = (entry) => Date.parse(entry?.at ?? '')
const sum = (values) => values.reduce((total, value) => total + value, 0)

/** 두 기록 사이 시간 — 끝 기록이 없으면(아직 잠그지 않았다) null이다. */
function spanMs(start, end) {
  if (!end) return null
  return at(end) - at(start)
}

/** 겹치는 구간은 한 번만 센다 — 복구 중에 또 되감기면 두 복구 시간이 같은 벽시계를 두 번 세지 않게 한다. */
function unionMs(spans) {
  let total = 0
  let end = -Infinity
  for (const [start, stop] of [...spans].sort((left, right) => left[0] - right[0])) {
    if (stop <= end) continue
    total += stop - Math.max(start, end)
    end = stop
  }
  return total
}

/**
 * lock 전 저작 시간 — 시각이 찍힌 stage 기록만 센다(0.102 이전 기록은 시각이 없어 untimed). 단계마다 머문 시간, advance 관문이 쓴
 * 시간, 그리고 rewind마다 되감기 전 가장 앞선 단계(furthest, 시각 없이 전체 기록에서)로 다시 돌아오기까지 걸린 시간(regain)을
 * 낸다. 앞부분만 시각이 없는 기록은 partial로 표시하고 시작을 모르므로 전체 저작 시간을 내지 않는다.
 */
function authoringTiming(history) {
  const stamped = history.filter((entry) => Number.isFinite(at(entry)))
  if (stamped.length === 0) return null
  const partial = stamped.length < history.length
  const stages = {}
  stamped.forEach((entry, index) => {
    const next = stamped[index + 1]
    const slot = (stages[entry.stage] ??= { visits: 0, ms: 0, gateMs: 0 })
    slot.visits += 1
    if (next) slot.ms += at(next) - at(entry)
    if (typeof entry.durationMs === 'number') slot.gateMs += entry.durationMs
  })
  const rewinds = []
  const spans = []
  history.forEach((entry, index) => {
    if (entry.evidence !== 'rewind' || !Number.isFinite(at(entry))) return
    const before = history.slice(0, index).map((step) => STAGE_ORDER.indexOf(step.stage))
    const furthest = before.length > 0 ? Math.max(...before) : STAGE_ORDER.indexOf(entry.stage)
    const regained = history
      .slice(index + 1)
      .find((step) => step.evidence !== 'rewind' && Number.isFinite(at(step)) && STAGE_ORDER.indexOf(step.stage) >= furthest)
    if (regained) spans.push([at(entry), at(regained)])
    rewinds.push({
      left: history[index - 1]?.stage ?? null,
      furthest: STAGE_ORDER[furthest] ?? null,
      to: entry.stage,
      reason: entry.reason ?? null,
      at: entry.at,
      regainMs: regained ? at(regained) - at(entry) : null,
    })
  })
  const locked = stamped.find((entry) => entry.stage === 'ORACLE_READY')
  return {
    partial,
    startedAt: partial ? null : stamped[0].at,
    lockedAt: locked?.at ?? null,
    ms: partial ? null : spanMs(stamped[0], locked),
    stages,
    rewinds,
    regainMs: unionMs(spans),
  }
}

/** lock 뒤 Delivery 시간 — 원장은 처음부터 시각을 남긴다: 상태마다 머문 시간, 실행 명령 시간, 리뷰 라운드·예산 사용 횟수. */
function deliveryTiming(ledger) {
  const marks = ledger.filter((event) => (event.type === 'init' || event.type === 'transition') && Number.isFinite(at(event)))
  if (marks.length === 0) return null
  const states = marks.map((event, index) => ({ state: event.state, at: event.at, ms: marks[index + 1] ? at(marks[index + 1]) - at(event) : null }))
  const runs = ledger.filter((event) => event.type === 'run')
  const byLabel = {}
  for (const run of runs) {
    const slot = (byLabel[run.label ?? 'unlabeled'] ??= { runs: 0, commandMs: 0 })
    slot.runs += 1
    slot.commandMs += run.commandMs ?? 0
  }
  const timed = ledger.filter((event) => Number.isFinite(at(event)))
  return {
    initAt: marks[0].at,
    lastAt: timed.at(-1).at,
    ms: at(timed.at(-1)) - at(marks[0]),
    states,
    commandMs: sum(runs.map((run) => run.commandMs ?? 0)),
    wrapperMs: sum(runs.map((run) => run.wrapperMs ?? 0)),
    runsByLabel: byLabel,
    reviewRounds: ledger.filter((event) => event.type === 'review-round').length,
    budgetSpends: ledger.filter((event) => event.type === 'budget' && !event.duplicate).length,
  }
}

/** run별 리드타임 — 저작(stage 기록)과 Delivery(원장)를 따로 재고, 독립 디스패치는 종류별로 센다. 읽기만 한다. */
export function timingRuns(runs) {
  const timed = []
  const untimed = []
  for (const run of runs) {
    const authoring = authoringTiming(run.history)
    const delivery = deliveryTiming(run.ledger)
    if (!authoring && !delivery) {
      untimed.push(run.id)
      continue
    }
    const dispatches = {}
    for (const entry of run.dispatches ?? []) bump(dispatches, entry.kind)
    timed.push({ run: run.id, authoring, delivery, dispatches })
  }
  return {
    runs: timed,
    untimed,
    totals: {
      // partial 기록은 시작을 몰라 ms가 null이다 — 합계에 넣지 않는다
      authoringMs: sum(timed.map((entry) => entry.authoring?.ms ?? 0)),
      partialRuns: timed.filter((entry) => entry.authoring?.partial).map((entry) => entry.run),
      regainMs: sum(timed.map((entry) => entry.authoring?.regainMs ?? 0)),
      rewinds: sum(timed.map((entry) => entry.authoring?.rewinds.length ?? 0)),
      deliveryMs: sum(timed.map((entry) => entry.delivery?.ms ?? 0)),
      commandMs: sum(timed.map((entry) => entry.delivery?.commandMs ?? 0)),
      dispatches: sum(timed.map((entry) => sum(Object.values(entry.dispatches)))),
    },
  }
}

const USAGE = 'usage: oracle-reflect.mjs [--root <repository root>] [--min-runs <n ≥ 1, default 2>] [--timing]'

function parse(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]?.replace(/^--/, '')
    if (name === 'timing') {
      options.timing = true
      continue
    }
    if (!['root', 'min-runs'].includes(name) || args[index + 1] === undefined) throw new CliError('USAGE', USAGE, 2)
    options[name] = args[index + 1]
    index += 1
  }
  const minRuns = options['min-runs'] === undefined ? 2 : Number(options['min-runs'])
  if (!Number.isSafeInteger(minRuns) || minRuns < 1) throw new CliError('USAGE', USAGE, 2)
  return { root: resolve(options.root ?? process.cwd()), minRuns, timing: options.timing === true }
}

async function main() {
  const { root, minRuns, timing } = parse(process.argv.slice(2))
  const { runs, skipped } = await collect(root)
  if (runs.length === 0) throw new CliError('REFLECT_NO_RUNS', `no readable .ai/oracles/<id>/ run under ${root}`)
  const report = timing ? timingRuns(runs) : reflectRuns(runs, { minRuns })
  process.stdout.write(`${JSON.stringify({ ...report, skipped }, null, 2)}\n`)
}

runCli(import.meta, main, { CliError, fallback: 'REFLECT_FAILED' })
