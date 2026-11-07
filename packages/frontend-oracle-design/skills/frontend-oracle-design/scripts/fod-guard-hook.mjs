#!/usr/bin/env node

// FOD 최소 가드(PreToolUse Write|Edit): 승인된 run이 아직 RED를 보지 않았는데 그 run의 제품 범위 파일을 바꾸려 하면 막는다.
// 테스트·adapter·Bend·SPEC 쓰기는 막지 않는다. 24시간 넘게 RED가 없는 승인과 drop한 run은 버린 것으로 보고 무시한다.
// 훅 자체가 실패하면 막지 않는다 — 판정의 권위는 `fod.mjs run red`의 RED_PRODUCT_CHANGED다.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
// matchesGlob은 Node 22.5+에만 있다 — 이름으로 import하면 옛 Node에서 훅이 로드되지 않아 쓰기마다 오류가 뜬다
import path, { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { findRoot, readJson, readRuns, RUN_ROOT, sha256 } from './fod-spec.mjs'

export const STALE_MS = 24 * 60 * 60 * 1000

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

/** 이 파일 쓰기를 막는 run이 있으면 그 이유, 없으면 null. */
export function blockingReason({ filePath, cwd, now = Date.now() }) {
  const target = isAbsolute(filePath) ? filePath : resolve(cwd, filePath)
  const root = findRoot(dirname(target)) ?? findRoot(cwd)
  if (!root) return null
  const file = relative(root, target)
  if (file === '..' || file.startsWith(`..${sep}`)) return null
  const oracles = join(root, RUN_ROOT)
  for (const id of readdirSync(oracles)) {
    const dir = join(oracles, id)
    const approvalFile = join(dir, 'approval.json')
    if (!existsSync(approvalFile)) continue
    const approval = readJson(approvalFile)
    const digest = sha256(readFileSync(approvalFile, 'utf8'))
    const runs = readRuns(dir).filter((entry) => entry.approval === digest)
    const settled = runs.some((entry) => entry.phase === 'red' || entry.phase === 'dropped')
    const abandoned = now - Date.parse(approval.at) > STALE_MS
    if (!settled && !abandoned && approval.globs.some((glob) => path.matchesGlob(file, glob)))
      return `FOD ${id}: 승인 뒤 RED 전에는 제품 파일(${file})을 바꾸지 않는다. 먼저 \`node fod.mjs gen ${id}\` → \`node fod.mjs run red ${id}\`로 생성 테스트가 지금 제품에서 실패하는 것을 기록한다. 이 run을 버렸으면 \`node fod.mjs drop ${id}\`.`
  }
  return null
}

async function main() {
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  const event = JSON.parse(input)
  if (!WRITE_TOOLS.has(event.tool_name)) return
  const filePath = event.tool_input?.file_path ?? event.tool_input?.notebook_path
  if (!filePath) return
  const reason = blockingReason({ filePath, cwd: event.cwd ?? process.cwd() })
  if (reason)
    process.stdout.write(
      `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })}\n`,
    )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch {
    // 가드는 조언이다 — 읽지 못한 기록 때문에 작업을 막지 않는다.
    process.exitCode = 0
  }
}
