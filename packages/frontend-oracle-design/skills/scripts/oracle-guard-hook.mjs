#!/usr/bin/env node
// Oracle host hook — one script for three events, dispatched on the payload.
// PreToolUse: denies, before the write lands, what the transition gate would reject afterwards —
//   production edits while an oracle sits at ORACLE_READY, weakening tokens added to a test after
//   VALID_RED, and any write to host-receipts.jsonl. A SubagentHandback call records a receipt.
// SubagentStop: records a digest of the reviewer output the subagent actually returned.
// Stop: blocks a final report whose Status line or cited runs disagree with the ledger.
// Any failure to judge is fail-open (exit 0, no output): the gate in oracle-run.mjs stays the authority.
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { appendFile, readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { HOST_RECEIPTS_FILE, isPathInside, isTestPath, reviewOutputDigest, WEAKENING_TOKENS } from './oracle-fs.mjs'

const runScript = join(dirname(fileURLToPath(import.meta.url)), 'oracle-run.mjs')

const GUARDED_STATES_BEFORE_RED = new Set(['ORACLE_READY'])
const GUARDED_STATES_AFTER_RED = new Set(['VALID_RED', 'IMPLEMENTED_GREEN'])

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

/** cwd와 대상 파일의 조상 디렉터리에서 `.ai/oracles/<id>/run-state.json`을 모은다. */
async function findStates(cwd, filePath) {
  const roots = new Set([cwd])
  let cursor = dirname(filePath)
  while (true) {
    roots.add(cursor)
    const parent = dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }

  const states = []
  for (const root of roots) {
    const oracles = join(root, '.ai', 'oracles')
    const entries = await readdir(oracles, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const directory = join(oracles, entry.name)
      const raw = await readFile(join(directory, 'run-state.json'), 'utf8').catch(() => null)
      if (!raw) continue
      try {
        states.push({ directory, state: JSON.parse(raw) })
      } catch {
        // 손상된 상태 파일은 이 hook이 판정할 수 없다 — 게이트가 STATE_INVALID로 잡는다
        unjudged('STATE_UNPARSEABLE', { oracle: directory })
      }
    }
  }
  return states
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
  for (const { directory, state } of await findStates(cwd, cwd)) {
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
  for (const { directory, state } of await findStates(cwd, cwd)) {
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
 * 후보(손상된 원장)는 건너뛰고 다음 후보로 간다. 주인이 없으면(Design-only·다른 레포) 판정하지 않는다. 막은 뒤의
 * 재시도(stop_hook_active)는 다시 막지 않는다.
 */
async function checkFinalReport(payload, cwd) {
  const message = payload.last_assistant_message
  if (payload.stop_hook_active || typeof message !== 'string') return
  if (!/^Status:\s*(?:ORACLE_READY|VALID_RED|IMPLEMENTED_GREEN|REVIEW_VERIFIED|NEEDS_DECISION|FAIL)\b/m.test(message)) return
  const cited = new Set([...message.matchAll(/\b(r-\d{3,})\b/g)].map(([, runId]) => runId))
  if (cited.size === 0) return

  for (const directory of await reportOwners(cwd, cited, message)) {
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

async function guardWrite(payload, cwd) {
  const toolName = payload.tool_name
  const input = payload.tool_input ?? {}
  // NotebookEdit writes a source file under another key; every other write path (shell rm·mv, an
  // MCP writer) is invisible here and stays the transition gate's job — README records the split.
  const targetPath = typeof input.file_path === 'string' ? input.file_path : input.notebook_path
  if (!['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(toolName) || typeof targetPath !== 'string') return

  const absolutePath = resolve(cwd, targetPath)

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
  // v2.1.271+ 서브에이전트는 SubagentHandback 도구로 보고를 넘긴다 — 그때 마지막 메시지는 보고가 아니다
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
