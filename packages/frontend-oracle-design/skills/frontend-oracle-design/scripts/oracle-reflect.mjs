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
    if (stage || ledger.length) runs.push({ id, history: stage?.history ?? [], ledger })
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

const USAGE = 'usage: oracle-reflect.mjs [--root <repository root>] [--min-runs <n ≥ 1, default 2>]'

function parse(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]?.replace(/^--/, '')
    if (!['root', 'min-runs'].includes(name) || args[index + 1] === undefined) throw new CliError('USAGE', USAGE, 2)
    options[name] = args[index + 1]
  }
  const minRuns = options['min-runs'] === undefined ? 2 : Number(options['min-runs'])
  if (!Number.isSafeInteger(minRuns) || minRuns < 1) throw new CliError('USAGE', USAGE, 2)
  return { root: resolve(options.root ?? process.cwd()), minRuns }
}

async function main() {
  const { root, minRuns } = parse(process.argv.slice(2))
  const { runs, skipped } = await collect(root)
  if (runs.length === 0) throw new CliError('REFLECT_NO_RUNS', `no readable .ai/oracles/<id>/ run under ${root}`)
  process.stdout.write(`${JSON.stringify({ ...reflectRuns(runs, { minRuns }), skipped }, null, 2)}\n`)
}

runCli(import.meta, main, { CliError, fallback: 'REFLECT_FAILED' })
