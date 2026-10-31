#!/usr/bin/env node
/**
 * Claude Code 세션 기록(~/.claude/projects/*\/*.jsonl)에서 Oracle 저작 루프의 비용을 잰다: 스크립트별 호출 수,
 * 도구 호출부터 결과까지 걸린 누적 시간, 실패 수, 왕복 수. oracle-cycle 도입 전후를 비교하는 측정용이고 판정이 아니다.
 *
 *   node scripts/oracle-session-stats.mjs [--days 21] [--root ~/.claude/projects]
 */
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
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

async function main() {
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
