#!/usr/bin/env node
/**
 * FOD run 한 번의 시간과 호출을 단계별로 나눈다. 입력은 그 run을 돌린 에이전트의 Claude Code transcript(.jsonl)다.
 * 에이전트의 자가 보고가 아니라 기록의 도구 호출 시각과 `fod.mjs` 출력(`ok <명령>`)으로만 센다. 측정용이고 판정이 아니다.
 *
 *   node scripts/fod-run-stats.mjs <controller.jsonl> [<controller.jsonl> ...]
 *
 * 단계 경계: check ok → 첫 prove 실패 → prove ok → approve ok → gen ok → run red ok → run green ok.
 * 도구 호출 하나의 구간은 "앞 호출이 끝난 때부터 이 호출이 끝난 때까지"이고, 그 호출을 시작할 때의 단계에 더한다.
 * 리뷰어는 Agent 호출 수를 승인 전(모델 읽기), 첫 GREEN 뒤(배달 읽기), 그 사이로 나눠 센다.
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import process from 'node:process'

const PHASES = ['1 spec', '2a model', '2b prove-repair', '2c read+approve', '3 adapter+gen', '4 red', '5 green', '6 after-green']
const APPROVED = 4
const AFTER_GREEN = 7
// [명령, 성공 여부, 그 뒤의 단계]
const ADVANCE = [
  ['check', true, 1],
  ['prove', false, 2],
  ['prove', true, 3],
  ['approve', true, APPROVED],
  ['gen', true, 5],
  ['run red', true, 6],
  ['run green', true, AFTER_GREEN],
]

const textOf = (content) => (typeof content === 'string' ? content : (content ?? []).map((part) => part.text ?? '').join('\n'))

/** transcript 한 줄 → 시각이 있는 메시지, 아니면 null. */
function parseEntry(line) {
  if (!line) return null
  try {
    const entry = JSON.parse(line)
    if (!entry.timestamp || !entry.message) return null
    return entry
  } catch {
    return null
  }
}

/** 메시지 하나의 블록들: tool_use는 기억해 두고, 짝이 되는 tool_result가 오면 끝난 호출로 옮긴다. */
function collectBlocks(content, at, uses, events) {
  if (!Array.isArray(content)) return
  for (const block of content) {
    if (block.type === 'tool_use') uses.set(block.id, { at, name: block.name, input: block.input ?? {} })
    const use = block.type === 'tool_result' ? uses.get(block.tool_use_id) : undefined
    if (use) events.push({ ...use, end: at, out: textOf(block.content) })
  }
}

/** transcript → 끝난 도구 호출(시작·끝 시각, 출력), API 메시지별 캐시 읽기, 전체 시작·끝. */
export function load(text) {
  const events = []
  const uses = new Map()
  const messages = new Map()
  const times = []
  for (const line of text.split('\n')) {
    const entry = parseEntry(line)
    if (entry === null) continue
    const at = Date.parse(entry.timestamp)
    times.push(at)
    const { content, usage, id } = entry.message
    if (entry.type === 'assistant' && usage && id && !messages.has(id)) messages.set(id, usage.cache_read_input_tokens ?? 0)
    collectBlocks(content, at, uses, events)
  }
  if (times.length === 0) throw new Error('transcript에 시각이 있는 줄이 없다')
  events.sort((left, right) => left.at - right.at)
  const span = (pick) => times.reduce((best, at) => pick(best, at), times[0])
  return { events, messages, start: span(Math.min), end: span(Math.max) }
}

/** `F=/path/fod.mjs` 같은 대입에서 변수 이름을 모은다 — `node $F prove`도 fod 명령이다. */
function scriptVariables(events) {
  const names = new Set()
  for (const event of events) {
    if (event.name !== 'Bash') continue
    for (const token of (event.input.command ?? '').split(/\s+/)) {
      const name = token.slice(0, Math.max(token.indexOf('='), 0))
      if (/^\w+$/.test(name) && token.replaceAll(/["';]/g, '').endsWith('fod.mjs')) names.add(name)
    }
  }
  return [...names]
}

function commandPattern(events) {
  const callers = [String.raw`fod\.mjs["']?`, ...scriptVariables(events).map((name) => String.raw`\$\{?` + name + String.raw`\}?["']?`)]
  return new RegExp(`(?:${callers.join('|')})\\s+(init|check|prove|approve|gen|run|status|drop)(?:\\s+(red|green))?`, 'g')
}

/** Bash 호출 하나에 든 fod 명령들 → [{ command, ok }]. 성공은 출력의 `ok <명령>` 줄이다. */
function fodCalls(event, pattern) {
  if (event.name !== 'Bash') return []
  return [...(event.input.command ?? '').matchAll(pattern)].map((match) => ({
    command: match[2] ? `run ${match[2]}` : match[1],
    ok: new RegExp(`^ok ${match[1]}`, 'm').test(event.out),
  }))
}

function nextPhase(phase, call) {
  let current = phase
  for (const [command, ok, next] of ADVANCE) {
    if (command === call.command && ok === call.ok) current = Math.max(current, next)
  }
  return current
}

function reviewerSlot(phase) {
  if (phase < APPROVED) return 'beforeApproval'
  return phase >= AFTER_GREEN ? 'afterGreen' : 'between'
}

function countCall(counts, call) {
  counts[call.command] ??= { calls: 0, failed: 0 }
  counts[call.command].calls += 1
  if (!call.ok) counts[call.command].failed += 1
}

export function measure(text) {
  const { events, messages, start, end } = load(text)
  const pattern = commandPattern(events)
  const seconds = PHASES.map(() => 0)
  const counts = {}
  const reviewers = { beforeApproval: 0, afterGreen: 0, between: 0 }
  let phase = 0
  let previous = start
  let firstGreen = null
  for (const event of events) {
    // 나란히 돈 호출은 먼저 시작한 쪽이 늦게 끝난다 — 겹친 시간을 두 번 세지도, 음수로 빼지도 않는다
    seconds[phase] += Math.max(0, event.end - previous) / 1000
    previous = Math.max(previous, event.end)
    if (event.name === 'Agent') reviewers[reviewerSlot(phase)] += 1
    for (const call of fodCalls(event, pattern)) {
      countCall(counts, call)
      phase = nextPhase(phase, call)
      if (call.command === 'run green' && call.ok) firstGreen ??= (event.end - start) / 60_000
    }
  }
  seconds[phase] += (end - previous) / 1000
  const cacheRead = [...messages.values()].reduce((sum, tokens) => sum + tokens, 0)
  return { total: (end - start) / 1000, firstGreen, seconds, counts, apiCalls: messages.size, cacheRead, reviewers }
}

function tally(run, command) {
  const count = run.counts[command]
  return count ? `${count.calls}(${count.failed}✗)` : '0'
}

function row(name, run) {
  const share = run.seconds.map((value) => `${Math.round((100 * value) / run.total)}%`)
  return [
    name.replaceAll(/^agent-|\.jsonl$/g, '').slice(0, 8),
    (run.total / 60).toFixed(1),
    run.firstGreen === null ? '-' : run.firstGreen.toFixed(1),
    share[AFTER_GREEN],
    run.apiCalls,
    (run.cacheRead / 1e6).toFixed(1),
    run.counts.approve?.calls ?? 0,
    tally(run, 'prove'),
    tally(run, 'run red'),
    `${run.reviewers.beforeApproval}/${run.reviewers.afterGreen}/${run.reviewers.between}`,
    ...share,
  ]
}

const HEAD = ['run', '총(분)', '첫 GREEN(분)', 'GREEN 뒤 %', 'API 호출', '캐시 읽기(M)', 'approve', 'prove', 'run red', '리뷰어(승인 전/GREEN 뒤/사이)', ...PHASES]

function main(files) {
  if (files.length === 0) {
    process.stderr.write('usage: node scripts/fod-run-stats.mjs <controller.jsonl> [...]\n')
    return 2
  }
  const rows = [HEAD, HEAD.map(() => '---'), ...files.map((file) => row(basename(file), measure(readFileSync(file, 'utf8'))))]
  for (const cells of rows) process.stdout.write(`| ${cells.join(' | ')} |\n`)
  return 0
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) process.exitCode = main(process.argv.slice(2))
