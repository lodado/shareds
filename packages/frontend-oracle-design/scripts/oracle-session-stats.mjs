#!/usr/bin/env node
/**
 * Claude Code 세션 기록(~/.claude/projects/*\/*.jsonl)에서 Oracle 저작 루프의 비용을 잰다: 스크립트별 호출 수,
 * 도구 호출부터 결과까지 걸린 누적 시간, 실패 수, 왕복 수. oracle-cycle 도입 전후를 비교하는 측정용이고 판정이 아니다.
 *
 *   node scripts/oracle-session-stats.mjs [--days 21] [--root ~/.claude/projects]
 *
 * `--run`은 현장 실행 한 번을 잰다. 컨트롤러 transcript에서 시작해 `Agent` 결과의 `agentId: <id>`를 따라 같은 폴더의
 * `agent-<id>.jsonl` 하위 에이전트를 재귀로 읽고, 에이전트의 자가 보고(마찰 로그)가 아니라 기록에서 센다: 시간, 도구 호출,
 * oracle 명령, 거절 코드, 루프 신호, 하위 에이전트, 문서 읽기 바이트(KB는 1024바이트), 사과 줄. 시각은 UTC다.
 * 사과 줄은 어시스턴트 글의 사과 표현과, 컨트롤러가 Bash `echo`로 마찰 로그에 남기는 `OHRIGHT:` 줄(kind note)이다.
 *
 *   node scripts/oracle-session-stats.mjs --run <controller.jsonl> [--friction <log.md>] [--run <...>] [--table]
 *
 * `--friction`은 바로 앞 `--run`의 마찰 로그이고 `OHRIGHT` 줄 수만 센다. 출력은 run마다 객체 하나인 JSON 배열이고,
 * `--table`은 대신 run당 마크다운 한 줄을 찍는다.
 */
import { Buffer } from 'node:buffer'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline'

const SCRIPT = /\b(oracle-[a-z-]+)\.mjs\s+([a-z-]+)?/

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

async function sessions(root, days) {
  const since = Date.now() - days * 86_400_000
  const files = []
  for (const project of await readdir(root).catch(() => [])) {
    for (const name of await readdir(join(root, project)).catch(() => [])) {
      if (!name.endsWith('.jsonl')) continue
      const path = join(root, project, name)
      if ((await stat(path)).mtimeMs >= since) files.push(path)
    }
  }
  return files
}

function blocks(line) {
  try {
    const content = JSON.parse(line)?.message?.content
    return Array.isArray(content) ? { at: Date.parse(JSON.parse(line).timestamp), content } : null
  } catch {
    return null
  }
}

function record(totals, started, entry, block) {
  const row = (totals[started.key] ??= { calls: 0, ms: 0, failed: 0 })
  row.calls += 1
  row.ms += Math.max(0, entry.at - started.at) || 0
  if (block.is_error) row.failed += 1
}

/** 한 줄(한 메시지)을 센다 — 스크립트 호출은 pending에 두고, 그 결과가 오면 totals에 더한다. 센 결과가 있으면 true. */
export function tallyLine(line, pending, totals) {
  const entry = blocks(line)
  let used = false
  for (const block of entry?.content ?? []) {
    const match = block?.type === 'tool_use' && SCRIPT.exec(String(block.input?.command ?? ''))
    if (match) pending.set(block.id, { key: `${match[1]} ${match[2] ?? ''}`.trim(), at: entry.at })
    const started = block?.type === 'tool_result' && pending.get(block.tool_use_id)
    if (!started) continue
    pending.delete(block.tool_use_id)
    record(totals, started, entry, block)
    used = true
  }
  return used
}

async function tallyFile(path, totals) {
  const pending = new Map()
  let used = false
  for await (const line of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) {
    if (line.includes('oracle-') || line.includes('tool_result')) used = tallyLine(line, pending, totals) || used
  }
  return used
}

// ---- --run: 현장 실행 한 번(컨트롤러 + 하위 에이전트 전부)을 transcript에서 잰다 ----

// 문서 읽기로 세는 경로. 고정해 둔 복사본(`.../fod-0.126.0/skills/oracle-intake/`)에는 패키지 폴더 이름이 없어서, 같은 플러그인의 다른 스킬 폴더도 넣는다.
const FOD_DOC = /\/frontend-oracle-design\/|\/skills\/(?:oracle-[a-z-]+|bend-proof|frontend-contract-design)\//
// 실행하는 호출만 센다: `node [플래그] <경로>/oracle-<이름>.mjs [하위 명령]`. echo·grep·sed가 이름을 언급한 줄은 세지 않는다.
const INVOKE = /\bnode\s+(?:-\S+\s+)*["']?[^\s"']*?(oracle-[a-z-]+)\.mjs\b/g
const SUBCOMMAND = /^["']?\s+([a-z][a-z0-9-]*)(?![\w./:=-])/
// 거절 표지: 스크립트가 찍는 `CODE: …`(oracle-step은 `REFUSED CODE: …`)와 실패한 단계의 JSON(`"ok":false … "code":"X"`).
// `USAGE:`는 표지가 아니다: 사용법을 일부러 불러본 성공 결과에도 찍힌다. 실패한 호출의 이름표(ANY_CODE)로만 쓴다.
const REFUSAL_LINE = /^(?:REFUSED[ \t]+)?([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+):/m
const JSON_FAILED = [/"ok"\s*:\s*false\b[^{}]*"code"\s*:\s*"[A-Z]/, /"failed"\s*:\s*\{[^{}]*"code"\s*:\s*"[A-Z]/]
const JSON_CODE = /"code"\s*:\s*"([A-Z][A-Z0-9_]*)"/
const ANY_CODE = /\b(USAGE|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+):/
// 호출이 PreToolUse 훅에 막히면 스크립트는 돌지 않았다.
const HOOK_DENIED = /^PreToolUse:\S+ hook error/
const NEXT_LINE = /^[ \t]*next(?: for you)?:[ \t]*\S.*$/gim
const APOLOGY = /아\s*맞다|죄송|my mistake|oops|I should have|I forgot|I missed|apolog/i
// 컨트롤러는 사과를 글로 거의 쓰지 않고 마찰 로그에 `echo "… OHRIGHT: …" >> log`로 남긴다. `grep "OHRIGHT:"`처럼 콜론 뒤에 글이 없는 언급은 뺀다.
const OHRIGHT_NOTE = /\bOHRIGHT(?:-lite)?:[ \t]+\S/

function textOf(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map(part => (typeof part === 'string' ? part : (part?.text ?? ''))).join('\n')
}

/**
 * Bash 결과가 거절이면 코드를, 아니면 null을 돌려준다. 컨트롤러가 `; echo EXIT=$?`나 파이프로 종료 코드를 가려서
 * is_error·`Exit code N`만으로는 거절 대부분을 놓치므로, 스크립트가 찍는 거절 줄과 실패 JSON도 거절로 본다.
 * 코드는 JSON `"code"`, 거절 줄, 첫 `CODE:` 토큰 순서로 읽고 없으면 UNKNOWN이다. `*_PENDING`은 리뷰어를 기다리는
 * 정상 대기라 거절이 아니다.
 */
export function refusalOf(text, isError) {
  if (HOOK_DENIED.test(text)) return null
  const line = REFUSAL_LINE.exec(text)?.[1]
  const failed = isError === true || /^Exit code [1-9]/.test(text)
  if (!failed && line === undefined && !JSON_FAILED.some(pattern => pattern.test(text))) return null
  const code = JSON_CODE.exec(text)?.[1] ?? line ?? ANY_CODE.exec(text)?.[1] ?? 'UNKNOWN'
  return code.endsWith('_PENDING') ? null : code
}

function parseRows(lines) {
  const rows = []
  for (const line of lines) {
    if (!line) continue
    try {
      rows.push(JSON.parse(line))
    } catch {
      // 쓰는 도중 잘린 줄은 건너뛴다.
    }
  }
  return rows
}

function newScan(label) {
  return {
    label, id: null, first: Infinity, last: -Infinity, toolCalls: 0, seq: 0, head: '', lastRefusal: null,
    seen: new Set(), calls: new Map(), reads: new Map(), spawns: new Map(), notices: new Map(),
    commands: [], readList: [], spawnList: [], apologies: [], firstOracleSeq: Infinity,
  }
}

/** `oracle-<이름> <하위 명령>` 키 목록. 한 Bash 호출이 `;`·`&&`로 여러 스크립트를 부르면 호출마다 하나씩이다. */
function callKeys(command) {
  return [...command.matchAll(INVOKE)].map((match) => {
    const sub = SUBCOMMAND.exec(command.slice(match.index + match[0].length))?.[1]
    return sub ? `${match[1]} ${sub}` : match[1]
  })
}

function onNotes(scan, command, at) {
  for (const line of command.split('\n')) {
    const found = OHRIGHT_NOTE.exec(line)
    if (found) scan.apologies.push({ at, kind: 'note', afterCode: scan.lastRefusal, text: line.slice(found.index).trim().slice(0, 160) })
  }
}

function onBash(scan, part, at) {
  const command = String(part.input?.command ?? '')
  onNotes(scan, command, at)
  const keys = callKeys(command)
  if (keys.length === 0) return
  scan.firstOracleSeq = Math.min(scan.firstOracleSeq, scan.seq)
  const call = { at, keys, code: null, nexts: [] }
  scan.calls.set(part.id, call)
  scan.commands.push(call)
}

function onRead(scan, part) {
  const path = String(part.input?.file_path ?? '')
  if (!FOD_DOC.test(path)) return
  const read = { path, seq: scan.seq, bytes: 0 }
  scan.reads.set(part.id, read)
  scan.readList.push(read)
}

function onSpawn(scan, part, at) {
  const input = part.input ?? {}
  const spawn = {
    at, description: input.description ?? null, type: input.subagent_type ?? null, model: input.model ?? null,
    resolvedModel: null, childId: null, ackAt: null, syncMs: null, child: null,
  }
  scan.spawns.set(part.id, spawn)
  scan.spawnList.push(spawn)
}

const TOOL_HANDLERS = { Bash: onBash, Read: onRead, Agent: onSpawn, Task: onSpawn }

function onToolUse(scan, part, at) {
  if (scan.seen.has(part.id)) return
  scan.seen.add(part.id)
  scan.toolCalls += 1
  scan.seq += 1
  TOOL_HANDLERS[part.name]?.(scan, part, at)
}

function onText(scan, text, at) {
  for (const line of text.split('\n')) {
    if (APOLOGY.test(line)) scan.apologies.push({ at, kind: 'text', afterCode: scan.lastRefusal, text: line.trim().slice(0, 160) })
  }
}

/** 하위 에이전트 완료 알림(`<task-notification>`): 같은 알림이 attachment와 user 줄에 두 번 남으므로 (id, 시간)으로 합친다. */
function onNotices(scan, text) {
  if (!text.includes('<task-notification>')) return
  for (const block of text.split('<task-notification>').slice(1)) {
    const id = /<task-id>([^<]+)<\/task-id>/.exec(block)?.[1]
    const ms = /<duration_ms>(\d+)<\/duration_ms>/.exec(block)?.[1]
    if (id && ms) scan.notices.set(`${id}:${ms}`, { id, ms: Number(ms) })
  }
}

function onOracleResult(scan, call, part, text) {
  call.code = refusalOf(text, part.is_error)
  for (const match of text.matchAll(NEXT_LINE)) call.nexts.push(match[0].trim().replaceAll(/\s+/g, ' '))
  if (call.code !== null) scan.lastRefusal = call.code
}

function onSpawnResult(spawn, row, text, at) {
  const result = row.toolUseResult ?? {}
  spawn.ackAt = at
  spawn.childId = /\bagentId:\s*([\w-]+)/.exec(text)?.[1] ?? result.agentId ?? null
  spawn.resolvedModel = result.resolvedModel ?? null
  spawn.syncMs = result.totalDurationMs ?? null
}

function onToolResult(scan, row, part, at) {
  const id = part.tool_use_id
  const text = textOf(part.content)
  const [call, read, spawn] = [scan.calls.get(id), scan.reads.get(id), scan.spawns.get(id)]
  if (call) onOracleResult(scan, call, part, text)
  if (read) read.bytes = Buffer.byteLength(text)
  if (spawn) onSpawnResult(spawn, row, text, at)
  if (scan.head.length < 20_000) scan.head += `\n${text.slice(0, 4000)}`
}

function onAssistantPart(scan, part, at) {
  if (part.type === 'tool_use') onToolUse(scan, part, at)
  if (part.type === 'text') onText(scan, textOf(part.text), at)
}

function onUserPart(scan, row, part, at) {
  if (part.type === 'tool_result') onToolResult(scan, row, part, at)
  else onNotices(scan, textOf(part))
}

/** 사용자·어시스턴트 메시지만 센다. `api-request-blob` 같은 요청 사본 줄은 같은 tool_use·tool_result를 한 번 더 담아 중복이 된다. */
function onMessage(scan, row, at) {
  const content = row.message?.content
  if (typeof content === 'string') {
    onNotices(scan, content)
    if (scan.head.length < 20_000) scan.head += `\n${content.slice(0, 4000)}`
    return
  }
  for (const part of Array.isArray(content) ? content : []) {
    if (row.type === 'assistant') onAssistantPart(scan, part, at)
    else onUserPart(scan, row, part, at)
  }
}

function scanAgent(lines, label) {
  const scan = newScan(label)
  for (const row of parseRows(lines)) {
    const at = Date.parse(row.timestamp)
    if (Number.isFinite(at)) {
      scan.first = Math.min(scan.first, at)
      scan.last = Math.max(scan.last, at)
    }
    scan.id ??= row.agentId ?? null
    if (row.type === 'attachment') onNotices(scan, String(row.attachment?.prompt ?? ''))
    if ((row.type === 'assistant' || row.type === 'user') && Number.isFinite(at)) onMessage(scan, row, at)
  }
  return scan
}

function collect(lines, label, loadChild, seen, scans) {
  const scan = scanAgent(lines, label)
  scans.push(scan)
  if (scan.id) seen.add(scan.id)
  for (const spawn of scan.spawnList) {
    if (!spawn.childId || seen.has(spawn.childId)) continue
    seen.add(spawn.childId)
    const childLines = loadChild(spawn.childId)
    if (childLines) spawn.child = collect(childLines, `${spawn.description ?? 'subagent'} [${spawn.childId.slice(0, 8)}]`, loadChild, seen, scans)
  }
  return scan
}

/** 같은 거절 코드가 연달아(사이에 성공한 oracle 명령 없이) 나온 가장 긴 길이. */
function longestRun(commands) {
  let [best, run, previous] = [0, 0, null]
  for (const { code } of commands) {
    if (code === null) run = 0
    else run = code === previous ? run + 1 : 1
    previous = code
    best = Math.max(best, run)
  }
  return best
}

const clock = ms => new Date(ms).toISOString().slice(11, 19)
const minutes = ms => Math.round(ms / 6000) / 10

/**
 * 비동기 하위 에이전트의 spawn→result는 시작 확인(0.1초)이라 소요가 아니다. minutes는 완료 알림 duration_ms의 합(다시 깨워 일을
 * 시키면 알림이 또 오고 각각 그 회차 시간이다)이고, 알림이 없으면 동기 결과, 하위 transcript 길이, 시작 확인 순으로 대신한다.
 * spanMinutes는 spawn부터 하위 에이전트의 마지막 기록까지다(기다린 시간 포함).
 */
function describeSpawn(scan, spawn) {
  const noticed = [...scan.notices.values()].filter(({ id }) => id === spawn.childId).reduce((sum, { ms }) => sum + ms, 0)
  const candidates = [
    ['notification', noticed || Number.NaN],
    ['result', spawn.syncMs ?? Number.NaN],
    ['transcript', spawn.child ? spawn.child.last - spawn.child.first : Number.NaN],
    ['ack', spawn.ackAt === null ? Number.NaN : spawn.ackAt - spawn.at],
  ]
  const [source, ms] = candidates.find(([, value]) => Number.isFinite(value)) ?? ['none', null]
  return {
    parent: scan.label, description: spawn.description, type: spawn.type, model: spawn.resolvedModel ?? spawn.model,
    minutes: ms === null ? null : minutes(ms), source,
    spanMinutes: spawn.child ? minutes(spawn.child.last - spawn.at) : null,
  }
}

function tallyCommands(scans) {
  const [byCommand, byCode, refusals, nexts] = [{}, {}, [], new Map()]
  for (const scan of scans) {
    for (const call of scan.commands) {
      for (const key of call.keys) byCommand[key] = (byCommand[key] ?? 0) + 1
      for (const line of call.nexts) nexts.set(line, (nexts.get(line) ?? 0) + 1)
      if (call.code === null) continue
      byCode[call.code] = (byCode[call.code] ?? 0) + 1
      refusals.push({ at: call.at, agent: scan.label, command: call.keys.join(' + '), code: call.code })
    }
  }
  refusals.sort((a, b) => a.at - b.at)
  return { byCommand, byCode, refusals, nexts }
}

function tallyReads(scans) {
  const [controller] = scans
  const tally = reads => ({ count: reads.length, bytes: reads.reduce((sum, read) => sum + read.bytes, 0) })
  const all = scans.flatMap(scan => scan.readList)
  return {
    ...tally(all),
    preFirstCommand: tally(controller.readList.filter(read => read.seq < controller.firstOracleSeq)),
    nonMarkdown: tally(all.filter(read => !read.path.endsWith('.md'))),
  }
}

const byCount = (a, b) => b[1] - a[1]
const sorted = counts => Object.fromEntries(Object.entries(counts).sort(byCount))

/**
 * 컨트롤러 transcript 줄들과, 하위 에이전트 id로 그 줄들(없으면 null)을 돌려주는 `loadChild`에서 run 하나를 센다.
 * 순수 함수다: 파일은 건드리지 않는다.
 */
export function analyzeRun(lines, loadChild = () => null) {
  const scans = []
  collect(lines, 'controller', loadChild, new Set(), scans)
  const [controller] = scans
  const { byCommand, byCode, refusals, nexts } = tallyCommands(scans)
  const apologies = scans.flatMap(scan => scan.apologies.map(a => ({ ...a, agent: scan.label })))
  const subagents = scans.flatMap(scan => scan.spawnList.map(spawn => describeSpawn(scan, spawn)))
  return {
    agentId: controller.id,
    version: /\bversion\s+(\d+\.\d+\.\d+)/i.exec(controller.head)?.[1] ?? null,
    case: /\bcase-\d[\w-]*/.exec(controller.head)?.[0] ?? null,
    startedAt: Number.isFinite(controller.first) ? new Date(controller.first).toISOString() : null,
    endedAt: Number.isFinite(controller.last) ? new Date(controller.last).toISOString() : null,
    minutes: Number.isFinite(controller.last - controller.first) ? minutes(controller.last - controller.first) : null,
    toolCalls: { controller: controller.toolCalls, total: scans.reduce((sum, scan) => sum + scan.toolCalls, 0) },
    oracle: { commands: Object.values(byCommand).reduce((sum, n) => sum + n, 0), byCommand: sorted(byCommand) },
    refusals: {
      count: refusals.length,
      unknown: byCode.UNKNOWN ?? 0,
      byCode: sorted(byCode),
      list: refusals.map(refusal => ({ ...refusal, at: clock(refusal.at) })),
    },
    loops: {
      maxSameRefusalRun: Math.max(...scans.map(scan => longestRun(scan.commands))),
      repeatedNext: [...nexts].filter(([, count]) => count >= 3).sort(byCount).map(([line, count]) => ({ count, line })),
    },
    subagents: { count: subagents.length, list: subagents },
    docReads: tallyReads(scans),
    apologies: {
      controller: controller.apologies.length,
      total: apologies.length,
      text: apologies.filter(a => a.kind === 'text').length,
      notes: apologies.filter(a => a.kind === 'note').length,
      list: apologies.sort((a, b) => a.at - b.at).map(a => ({ ...a, at: clock(a.at) })),
    },
  }
}

const kb = bytes => (bytes / 1024).toFixed(1)
const TABLE_HEAD = [
  'run', 'version', 'min', 'tool calls (ctrl/total)', 'oracle cmds', 'refusals', 'UNKNOWN', 'max same-refusal run',
  'repeated next lines', 'subagents', 'doc reads (n / KB; pre-first-cmd KB)', 'apologies (ctrl/total)', 'OHRIGHT (friction log)',
]

function tableRow(run) {
  const { docReads } = run
  return [
    [run.case, run.agentId?.slice(0, 8)].filter(Boolean).join(' ') || '-',
    run.version ?? '-',
    run.minutes ?? '-',
    `${run.toolCalls.controller}/${run.toolCalls.total}`,
    run.oracle.commands,
    run.refusals.count,
    run.refusals.unknown,
    run.loops.maxSameRefusalRun,
    run.loops.repeatedNext.length,
    run.subagents.count,
    `${docReads.count} / ${kb(docReads.bytes)}; pre ${kb(docReads.preFirstCommand.bytes)}`,
    `${run.apologies.controller}/${run.apologies.total}`,
    run.friction?.ohright ?? '-',
  ]
}

export function formatTable(runs) {
  const rows = [TABLE_HEAD, TABLE_HEAD.map(() => '---'), ...runs.map(tableRow)]
  return rows.map(cells => `| ${cells.join(' | ')} |`).join('\n')
}

function readLines(path) {
  return readFileSync(path, 'utf8').split('\n')
}

/** `--friction`은 바로 앞 `--run`에 붙는다. */
function runArgs(argv) {
  const runs = []
  for (const [index, arg] of argv.entries()) {
    if (arg === '--run') runs.push({ path: argv[index + 1] })
    if (arg === '--friction' && runs.length > 0) runs.at(-1).friction = argv[index + 1]
  }
  return runs
}

function runMode() {
  const runs = runArgs(process.argv).map(({ path, friction }) => {
    const run = analyzeRun(readLines(path), (id) => {
      const file = join(dirname(path), `agent-${id}.jsonl`)
      return existsSync(file) ? readLines(file) : null
    })
    if (friction) run.friction = { path: friction, ohright: readLines(friction).filter(line => line.includes('OHRIGHT')).length }
    return run
  })
  const out = process.argv.includes('--table') ? formatTable(runs) : JSON.stringify(runs, null, 2)
  process.stdout.write(`${out}\n`)
}

async function main() {
  if (process.argv.includes('--run')) {
    runMode()
    return
  }
  const root = option('root', join(homedir(), '.claude', 'projects'))
  const days = Number(option('days', 21))
  const totals = {}
  let used = 0
  for (const file of await sessions(root, days)) {
    if (await tallyFile(file, totals)) used += 1
  }
  const rows = Object.entries(totals).sort(([, a], [, b]) => b.ms - a.ms)
  const calls = rows.reduce((sum, [, row]) => sum + row.calls, 0)
  process.stdout.write(`${JSON.stringify({ days, sessions: used, calls, callsPerSession: used ? +(calls / used).toFixed(1) : 0 })}\n`)
  for (const [key, row] of rows) process.stdout.write(`${key.padEnd(36)} ${String(row.calls).padStart(5)} ${(row.ms / 60_000).toFixed(1).padStart(7)}min failed=${row.failed}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
