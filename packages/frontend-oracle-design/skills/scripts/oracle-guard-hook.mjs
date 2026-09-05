#!/usr/bin/env node
// PreToolUse guard — reads the hook payload on stdin and denies, before the write lands, what the
// transition gate would reject afterwards: production edits while an oracle sits at ORACLE_READY,
// and weakening tokens added to a test after VALID_RED. Everything else is silent. Any failure to
// judge is fail-open (exit 0, no output): the gate in oracle-run.mjs stays the authority.
import { Buffer } from 'node:buffer'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { isPathInside, isTestPath, WEAKENING_TOKENS } from './oracle-fs.mjs'

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

async function main() {
  const payload = JSON.parse(await readStdin())
  const toolName = payload.tool_name
  const input = payload.tool_input ?? {}
  // NotebookEdit writes a source file under another key; every other write path (shell rm·mv, an
  // MCP writer) is invisible here and stays the transition gate's job — README records the split.
  const targetPath = typeof input.file_path === 'string' ? input.file_path : input.notebook_path
  if (!['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(toolName) || typeof targetPath !== 'string') return

  const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd()
  const absolutePath = resolve(cwd, targetPath)

  for (const { directory, state } of await findStates(cwd, absolutePath)) {
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
        `PRODUCTION_TOUCHED_BEFORE_RED: ${portable} — this oracle (${directory}) is at ORACLE_READY. Write the failing tests first and record VALID_RED with oracle-run.mjs red; a config·setup file that must change before RED is declared with --harness-path at init, never edited around the gate.`,
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

try {
  await main()
} catch (error) {
  // fail-open: 판정 불가는 허용이다 — 사후 게이트가 권위다. 다만 흔적은 남긴다.
  unjudged('PAYLOAD_UNREADABLE', { message: error instanceof Error ? error.message : String(error) })
}
process.exitCode = 0
