#!/usr/bin/env node
// Oracle host hook — one script for three events, dispatched on the payload.
// PreToolUse: denies, before the write lands, what the transition gate would reject afterwards —
//   a test written in a session that activated the skill before any lock exists, production edits
//   while an oracle sits at ORACLE_READY, weakening tokens added to a test after VALID_RED, and any
//   write to host-receipts.jsonl. A SubagentHandback call records a receipt.
// SubagentStop: records a digest of the reviewer output the subagent actually returned.
// Stop: blocks a final report whose Status line or cited runs disagree with the ledger.
// Any failure to judge is fail-open (exit 0, no output): the gate in oracle-run.mjs stays the authority.
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { appendFile, readdir, readFile, realpath, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  HOST_RECEIPTS_FILE,
  isPathInside,
  isTestPath,
  reviewOutputDigest,
  RUN_BACKED_STATES,
  WEAKENING_TOKENS,
} from './oracle-fs.mjs'
import { spawnGit } from './resolve-executable.mjs'

const runScript = join(dirname(fileURLToPath(import.meta.url)), 'oracle-run.mjs')

const GUARDED_STATES_BEFORE_RED = new Set(['ORACLE_READY'])
const GUARDED_STATES_AFTER_RED = new Set(['VALID_RED', 'IMPLEMENTED_GREEN'])

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage'])
const NESTED_DEPTH = 4

/** git 저장소 루트 — 없으면 cwd. 레포 루트나 형제 패키지에서 시작한 세션도 같은 범위를 본다. */
function repositoryRoot(cwd) {
  const result = spawnGit(['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', timeout: 2000 })
  const root = result.status === 0 ? result.stdout.trim() : ''
  return root || cwd
}

/** 한 폴더에 `.ai`가 있는지와 내려갈 하위 폴더 — 의존성·빌드 산출물·숨김 폴더로는 내려가지 않는다. */
async function scanDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  const children = folders.filter((name) => !name.startsWith('.') && !SKIPPED_DIRECTORIES.has(name))
  return { hasOracleRoot: folders.includes('.ai'), children: children.map((name) => join(directory, name)) }
}

/** base부터 NESTED_DEPTH 단계 아래까지 `.ai`를 가진 폴더. */
async function nestedRoots(base) {
  const roots = []
  let level = [base]
  for (let depth = 0; depth <= NESTED_DEPTH && level.length > 0; depth++) {
    const scanned = await Promise.all(level.map(scanDirectory))
    roots.push(...level.filter((_, index) => scanned[index].hasOracleRoot))
    level = scanned.flatMap(({ children }) => children)
  }
  return roots
}

/**
 * cwd와 대상 파일의 조상 디렉터리에서 `.ai/oracles/<id>/` 디렉터리를 모은다. `nested`면 저장소 루트 아래도 찾는다 —
 * 쓰기는 대상 파일에서 위로 올라가면 닿지만, 보고·영수증은 cwd밖에 없어서 cwd 아래 패키지의 오라클을 놓친다.
 */
async function oracleDirectories(cwd, filePath, nested = false) {
  const roots = new Set([cwd])
  let cursor = dirname(filePath)
  while (true) {
    roots.add(cursor)
    const parent = dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }
  if (nested) for (const root of await nestedRoots(repositoryRoot(cwd))) roots.add(root)

  // git은 실제 경로를 돌려준다(macOS /var → /private/var) — 같은 오라클을 두 번 세지 않게 실제 경로로 거른다
  const seen = new Set()
  const directories = []
  for (const root of roots) {
    const oracles = join(root, '.ai', 'oracles')
    const entries = await readdir(oracles, { withFileTypes: true }).catch(() => [])
    for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
      const directory = join(oracles, entry.name)
      const key = await realpath(directory).catch(() => directory)
      if (seen.has(key)) continue
      seen.add(key)
      directories.push(directory)
    }
  }
  return directories
}

/** 그 디렉터리들의 `run-state.json`을 모은다. */
async function findStates(cwd, filePath, nested = false) {
  const states = []
  for (const directory of await oracleDirectories(cwd, filePath, nested)) {
    const raw = await readFile(join(directory, 'run-state.json'), 'utf8').catch(() => null)
    if (!raw) continue
    try {
      states.push({ directory, state: JSON.parse(raw) })
    } catch {
      // 손상된 상태 파일은 이 hook이 판정할 수 없다 — 게이트가 STATE_INVALID로 잡는다
      unjudged('STATE_UNPARSEABLE', { oracle: directory })
    }
  }
  return states
}

const SLASH_ACTIVATION = /<command-name>\/(?:frontend-oracle-design:)?frontend-oracle-design<\/command-name>/

/**
 * 세션 기록 한 줄의 판정 조각 — assistant 내용과, 슬래시 명령으로 스킬을 켠 user 줄. 슬래시 명령은 Skill tool_use 없이
 * 문자열 content만 남긴다. 같은 태그를 인용한 tool_result(배열 content)는 활성화가 아니다. 읽을 수 없으면 빈 배열.
 */
function transcriptParts(line) {
  try {
    const entry = JSON.parse(line)
    const at = Date.parse(entry.timestamp) || 0
    const content = entry.message?.content
    if (entry.type === 'user' && typeof content === 'string' && SLASH_ACTIVATION.test(content)) return [{ part: { type: 'slash' }, at }]
    if (entry.type !== 'assistant' || !Array.isArray(content)) return []
    return content.map((part) => ({ part, at }))
  } catch {
    return []
  }
}

const activatesSkill = ({ type, name, input }) =>
  type === 'slash' || (type === 'tool_use' && name === 'Skill' && /frontend-oracle-design/.test(input?.skill ?? ''))
const routesOut = ({ type, text }) => type === 'text' && /^Status:\s*OUT_OF_SCOPE\b/m.test(text ?? '')

/**
 * 이 세션이 스킬을 처음 켠 시각(ms) — 세션 기록의 Skill 호출로 본다. 그 뒤 `Status: OUT_OF_SCOPE`로 넘겼으면 null.
 * 기록을 읽을 수 없으면 null(fail-open). 시각이 없는 기록은 0으로 두어 아무 lock이나 통과시킨다.
 */
async function skillActivation(transcriptPath) {
  if (typeof transcriptPath !== 'string') return null
  const raw = await readFile(transcriptPath, 'utf8').catch(() => '')
  const parts = raw
    .split('\n')
    .filter((line) => line.includes('frontend-oracle-design') || line.includes('OUT_OF_SCOPE'))
    .flatMap(transcriptParts)
  const first = parts.findIndex(({ part }) => activatesSkill(part))
  if (first === -1 || parts.slice(first).some(({ part }) => routesOut(part))) return null
  return parts[first].at
}

/** 스킬을 켠 뒤 만들어진 lock(`*.lock.json`)이 있는가 — 앞 세션의 lock은 이번 요청의 승인이 아니다. */
async function lockedSince(cwd, filePath, since) {
  for (const directory of await oracleDirectories(cwd, filePath)) {
    const names = await readdir(directory).catch(() => [])
    for (const name of names.filter((entry) => entry.endsWith('.lock.json'))) {
      const lock = await stat(join(directory, name)).catch(() => null)
      if (lock && lock.mtimeMs >= since) return true
    }
  }
  return false
}

function countTokens(text) {
  let count = 0
  for (const token of WEAKENING_TOKENS) count += text.split(token).length - 1
  return count
}

/** 이 쓰기가 약화 토큰을 **새로** 늘리는가 — 이미 있던 토큰을 그대로 두는 편집은 통과한다. */
async function addsWeakening(toolName, input, absolutePath) {
  if (toolName === 'Edit') return countTokens(input.new_string ?? '') > countTokens(input.old_string ?? '')
  if (toolName === 'MultiEdit') {
    const edits = Array.isArray(input.edits) ? input.edits : []
    const added = edits.reduce((sum, edit) => sum + countTokens(edit.new_string ?? '') - countTokens(edit.old_string ?? ''), 0)
    return added > 0
  }
  if (toolName === 'Write') {
    const existing = await readFile(absolutePath, 'utf8').catch(() => '')
    return countTokens(input.content ?? '') > countTokens(existing)
  }
  return false
}

/** fail-open은 유지하되 판정 불능을 조용히 삼키지 않는다 — stderr 한 줄, stdout·종료코드는 그대로. */
function unjudged(reason, fields = {}) {
  process.stderr.write(`${JSON.stringify({ oracleGuard: 'unjudged', reason, ...fields })}\n`)
}

function deny(reason) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    })}\n`,
  )
}

/** 리뷰어 반환문의 리뷰 산출물 digest 전부 — 통째 JSON과 파싱되는 fenced 블록 각각. 앞선 예시 블록이 뒤의 findings를 가리지 않는다. */
function returnedDigests(text) {
  const candidates = [text, ...[...text.matchAll(/```(?:json)?[ \t]*\n([\s\S]*?)```/g)].map(([, body]) => body)]
  const digests = new Map()
  for (const candidate of candidates) {
    let document
    try {
      document = JSON.parse(candidate.trim())
    } catch {
      continue
    }
    const digest = reviewOutputDigest(document)
    if (digest) digests.set(digest.sha256, digest)
  }
  return [...digests.values()]
}

/** 서브에이전트가 실제로 반환한 리뷰 산출물의 digest를 IMPLEMENTED_GREEN 오라클마다 남긴다. 컨트롤러는 이 파일을 쓸 수 없다. */
async function recordHostReceipt(payload, cwd, text) {
  if (typeof payload.agent_id !== 'string' || !payload.agent_id || typeof text !== 'string') return
  const digests = returnedDigests(text)
  if (digests.length === 0) return
  // oracle:nondeterminism 영수증은 실제 기록 시각을 남긴다
  const at = new Date().toISOString()
  const lines = digests.map(
    (digest) =>
      `${JSON.stringify({ agentId: payload.agent_id, agentType: payload.agent_type ?? '', sessionId: payload.session_id ?? '', ...digest, at })}\n`,
  )
  const states = await findStates(cwd, cwd, true)
  if (states.length === 0) unjudged('ORACLE_NOT_FOUND', { event: 'SubagentStop', agentId: payload.agent_id })
  for (const { directory, state } of states) {
    if (state.state === 'IMPLEMENTED_GREEN') await appendFile(join(directory, HOST_RECEIPTS_FILE), lines.join(''))
  }
}

/**
 * 이 보고의 주인 후보 — 인용한 runId를 **전부** 원장에 가진 오라클. 보고가 `Oracle SHA-256 <digest>`를 적었으면 그
 * 잠금의 오라클로 좁힌다. runId는 오라클마다 r-001부터라서, 원장 마지막 기록이 가장 최근인 순서로 둔다.
 */
async function reportOwners(cwd, cited, message) {
  const lockSha256 = message.match(/Oracle SHA-256\s+([a-f0-9]{64})/)?.[1]
  const owners = []
  for (const { directory, state } of await findStates(cwd, cwd, true)) {
    if (lockSha256 && state.lockSha256 !== lockSha256) continue
    const ledger = await readFile(join(directory, 'runs.jsonl'), 'utf8').catch(() => '')
    if (![...cited].every((runId) => ledger.includes(`"runId":"${runId}"`))) continue
    let last = ''
    try {
      last = JSON.parse(ledger.trim().split('\n').at(-1)).at ?? ''
    } catch {
      // 읽을 수 없는 원장은 가장 오래된 것으로 둔다 — status가 판정 불가로 거른다
    }
    owners.push({ directory, last })
  }
  return owners.sort((left, right) => right.last.localeCompare(left.last)).map(({ directory }) => directory)
}

/**
 * 최종 보고 대조 — 가장 최근에 움직인 주인 오라클 하나가 판정한다. 그 원장과 맞으면 통과, 어긋나면 막는다. 판정할 수 없는
 * 후보(손상된 원장)는 건너뛰고 다음 후보로 간다. 주인이 없으면(Design-only·다른 레포) 판정하지 않고
 * `ORACLE_NOT_FOUND` 흔적만 남긴다. 막은 뒤의 재시도(stop_hook_active)는 다시 막지 않는다.
 */
async function checkFinalReport(payload, cwd) {
  const message = payload.last_assistant_message
  if (payload.stop_hook_active || typeof message !== 'string') return
  const claimed = message.match(/^Status:\s*(ORACLE_READY|VALID_RED|IMPLEMENTED_GREEN|REVIEW_VERIFIED|NEEDS_DECISION|FAIL)\b/m)?.[1]
  if (!claimed) return
  const cited = new Set([...message.matchAll(/\b(r-\d{3,})\b/g)].map(([, runId]) => runId))
  // 실행으로만 닿는 상태를 runId 없이 주장하면 모든 오라클이 주인 후보가 되고, 가장 최근에 움직인 오라클에서 runner가
  // 무인용을 불일치로 판정한다. 실행 없이 닿는 상태(Design-only 보고)의 무인용은 판정하지 않는다.
  if (cited.size === 0 && !RUN_BACKED_STATES.has(claimed)) return

  const owners = await reportOwners(cwd, cited, message)
  if (owners.length === 0) unjudged('ORACLE_NOT_FOUND', { event: 'Stop', claimed, runs: [...cited] })
  for (const directory of owners) {
    const checked = spawnSync(process.execPath, [runScript, 'status', '--dir', directory, '--check-report', '-'], {
      input: message,
      encoding: 'utf8',
      timeout: 8000,
    })
    if (checked.status === 0) return
    const [line] = (checked.stderr ?? '').split('\n')
    if (line.startsWith('REPORT_CLAIM_MISMATCH:')) {
      process.stdout.write(
        `${JSON.stringify({
          decision: 'block',
          reason: `${line} (${directory})\nThe ledger wins over the report — rewrite the Status line and the cited runs from \`oracle-run.mjs status --json\`.`,
        })}\n`,
      )
      return
    }
    unjudged('REPORT_UNCHECKED', { oracle: directory, detail: line || checked.error?.message })
  }
}

/**
 * 스킬을 켠 세션에서 그 뒤의 lock 없이 테스트를 쓰면 막는다. 비대화 실행이 "테스트부터 써 달라"는 요청을 근거로
 * 인터뷰·Bend·lock을 건너뛴 적이 있다 — 문서 규칙만으로는 막지 못했다. `.bend`는 lock 전에 쓰는 모델이다.
 */
async function deniedBeforeLock(payload, cwd, absolutePath) {
  const portable = relative(cwd, absolutePath).split(sep).join('/')
  if (!isTestPath(portable) || portable.endsWith('.bend')) return false
  const activatedAt = await skillActivation(payload.transcript_path)
  if (activatedAt === null || (await lockedSince(cwd, absolutePath, activatedAt))) return false
  deny(
    `TEST_BEFORE_LOCK: ${portable} — this session activated frontend-oracle-design and no oracle lock has been created since. Tests come after the Space discovery interview, the Bend model package, the Draft \`yes\` and the lock. A run that cannot ask the user ends NEEDS_DECISION with the first question; a request to write tests now or to verify existing code is not a reason to skip.`,
  )
  return true
}

async function guardWrite(payload, cwd) {
  const toolName = payload.tool_name
  const input = payload.tool_input ?? {}
  // NotebookEdit writes a source file under another key; every other write path (shell rm·mv, an
  // MCP writer) is invisible here and stays the transition gate's job — README records the split.
  const targetPath = typeof input.file_path === 'string' ? input.file_path : input.notebook_path
  if (!['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(toolName) || typeof targetPath !== 'string') return

  const absolutePath = resolve(cwd, targetPath)

  if (await deniedBeforeLock(payload, cwd, absolutePath)) return

  for (const { directory, state } of await findStates(cwd, absolutePath)) {
    // 대소문자를 가리지 않는 파일 시스템(macOS·Windows)에서는 HOST-RECEIPTS.jsonl도 같은 파일이다
    if (absolutePath.toLowerCase() === join(directory, HOST_RECEIPTS_FILE).toLowerCase()) {
      deny(
        `HOST_RECEIPT_PROTECTED: ${HOST_RECEIPTS_FILE} records what reviewer subagents actually returned — only the host hook writes it.`,
      )
      return
    }
    // hook이 도는 호스트라는 표시 — 구현 중 파일이 생겨 있으면 GREEN이 그 사실을 원장에 남기고, REVIEW는 사라진 파일을 막는다
    if (GUARDED_STATES_AFTER_RED.has(state.state)) await appendFile(join(directory, HOST_RECEIPTS_FILE), '')
    if (typeof state.scanRoot !== 'string') {
      unjudged('SCAN_ROOT_MISSING', { oracle: directory })
      continue
    }
    const scanRoot = resolve(directory, state.scanRoot)
    if (!isPathInside(scanRoot, absolutePath) || isPathInside(directory, absolutePath)) continue
    const portable = relative(scanRoot, absolutePath).split(sep).join('/')
    const harness = Array.isArray(state.harnessPaths) ? state.harnessPaths : []
    const test = isTestPath(portable)

    if (GUARDED_STATES_BEFORE_RED.has(state.state) && !test && !harness.includes(portable)) {
      deny(
        `PRODUCTION_TOUCHED_BEFORE_RED: ${portable} — this oracle (${directory}) is at ORACLE_READY. Write the failing tests first and record VALID_RED with oracle-run.mjs red; a config·setup file that must change before RED is declared with --harness-path at init, never edited around the gate. If this run was abandoned, close it with \`oracle-run.mjs transition --dir ${directory} --to FAIL --reason abandoned\` instead of deleting it.`,
      )
      return
    }

    // 새 테스트 파일(init 스냅샷에 없음)은 약화할 기존 강도가 없다 — 순서 게이트가 따로 본다
    const tracked = state.snapshot && typeof state.snapshot === 'object' && portable in state.snapshot
    if (
      GUARDED_STATES_AFTER_RED.has(state.state) &&
      test &&
      tracked &&
      (await addsWeakening(toolName, input, absolutePath))
    ) {
      deny(
        `TEST_WEAKENED: ${portable} — this write adds a forbidden token (${WEAKENING_TOKENS.join(', ')}) to a test after VALID_RED. Keep the test at its RED strength; a harness defect is repaired within the $test allowances and counted with budget --spend harness.`,
      )
      return
    }
  }
}

async function main() {
  const payload = JSON.parse(await readStdin())
  const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd()
  if (payload.hook_event_name === 'Stop') await checkFinalReport(payload, cwd)
  else if (payload.hook_event_name === 'SubagentStop') await recordHostReceipt(payload, cwd, payload.last_assistant_message)
  // SubagentHandback으로 넘긴 보고 — 2026-10-02 기준 hooks 문서에 없고 2.1.286 로컬 기록에서 관찰 0건이다(서브에이전트는
  // 마지막 메시지로 반환했다). 놓치면 영수증이 self-reported로 내려갈 뿐이라 남겨 둔다
  else if (payload.tool_name === 'SubagentHandback') await recordHostReceipt(payload, cwd, payload.tool_input?.message)
  else await guardWrite(payload, cwd)
}

try {
  await main()
} catch (error) {
  // fail-open: 판정 불가는 허용이다 — 사후 게이트가 권위다. 다만 흔적은 남긴다.
  unjudged('PAYLOAD_UNREADABLE', { message: error instanceof Error ? error.message : String(error) })
}
process.exitCode = 0
