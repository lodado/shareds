#!/usr/bin/env node

// 리뷰어가 읽는 보기 — 잠긴 카드와 리뷰 패킷은 그대로 기준이고(digest·영수증·verify가 그 파일을 묶는다), 이 보기는 읽는
// 분량만 줄인다. 카드에서는 생성 영역 표의 칸 패딩을 걷고, Derived Axes 절의 긴 칸(관찰 도메인 나열)만 앞부분·길이·해시·원래
// 줄 번호로 접는다. 계약·요구·용어 행은 길어도 접지 않고, 손으로 쓴 영역은 한 바이트도 바꾸지 않는다. 패킷에서는 상태 기록이
// 인용한 런의 테스트 목록만 온전히 남기고, 나머지 런은 개수·상태별 수·해시와 통과하지 못한 테스트만 남긴다.

import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import process from 'node:process'
import { runCli } from './oracle-cli.mjs'
import { sha256 } from './oracle-fs.mjs'
import { generatedBlock } from './oracle-package.mjs'
import { splitRow } from './oracle-space.mjs'

class CliError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

const CELL_LIMIT = 400
const CELL_HEAD = 120
const SEPARATOR = /^:?-{3,}:?$/
// 접어도 되는 절 — 패키지에서 기계로 다시 만들어 check-card가 바이트로 대조하는 나열뿐이다
const FOLDABLE_SECTIONS = new Set(['Derived Axes'])

function foldCell(cell, line, name) {
  if (cell.length <= CELL_LIMIT) return cell
  return `${cell.slice(0, CELL_HEAD)}… [folded ${cell.length} chars · sha256:${sha256(cell).slice(0, 16)} · ${name} line ${line}]`
}

/** 생성 영역 안의 표 행만 다시 쓴다 — 칸 내용과 칸 수는 그대로, 패딩만 걷고 긴 칸만 접는다. */
export function foldCard(card, { name = 'oracle.md' } = {}) {
  const block = generatedBlock(card)
  if (!block.present || block.malformed) return card
  const before = card.slice(0, block.start)
  const offset = before.split('\n').length
  let section = null
  const region = card
    .slice(block.start, block.end)
    .split('\n')
    .map((line, index) => {
      if (line.startsWith('## ')) section = line.slice(3).trim()
      if (!line.startsWith('|')) return line
      const foldable = FOLDABLE_SECTIONS.has(section)
      const cells = splitRow(line).map((cell) => {
        if (SEPARATOR.test(cell)) return '---'
        return foldable ? foldCell(cell, offset + index, name) : cell
      })
      return `| ${cells.join(' | ')} |`
    })
  return `${before}${region.join('\n')}${card.slice(block.end)}`
}

function testsSummary(tests) {
  const byStatus = {}
  for (const test of tests) byStatus[test?.status] = (byStatus[test?.status] ?? 0) + 1
  // 어떤 테스트가 죽었는지(mutation kill, 앞선 RED)는 남긴다 — 접히는 것은 통과한 항목뿐이다
  const notPassed = tests.filter((test) => test?.status !== 'passed')
  return { total: tests.length, byStatus, sha256: sha256(JSON.stringify(tests)), notPassed }
}

/** 패킷 보기 — 원본 객체는 건드리지 않는다. 보기의 원장은 digest 체인을 다시 계산할 수 없으므로 검증 입력이 아니다. */
export function foldPacket(packet, { packetSha256 } = {}) {
  const cited = new Set((packet.state?.history ?? []).map((entry) => entry.runId).filter(Boolean))
  const ledger = (packet.ledger ?? []).map((entry) => {
    if (!Array.isArray(entry?.tests) || cited.has(entry.runId)) return entry
    // 인용하지 않은 run의 테스트 파일 digest(closure용)는 개수만 남긴다
    const { tests, changedTests, ...rest } = entry
    return { ...rest, testsFolded: testsSummary(tests), ...(changedTests ? { changedTestsFolded: Object.keys(changedTests).length } : {}) }
  })
  const oracle = packet.oracle && { ...packet.oracle, content: foldCard(packet.oracle.content ?? '', { name: basename(packet.oracle.path ?? 'oracle.md') }) }
  return {
    view: {
      packetSha256: packetSha256 ?? null,
      note: 'reading view only — lock verification, oracle-verify and review receipts bind the packet file; look folded values up there',
    },
    ...packet,
    ...(oracle ? { oracle } : {}),
    ledger,
  }
}

const USAGE = `usage:
  oracle-review-view.mjs card --oracle <oracle.md>
  oracle-review-view.mjs packet --packet <review packet.json>`

async function main() {
  const [command, flag, value, ...rest] = process.argv.slice(2)
  const expected = { card: '--oracle', packet: '--packet' }[command]
  if (!expected || flag !== expected || !value || rest.length) throw new CliError('USAGE', USAGE, 2)
  const bytes = await readFile(resolve(value))
  if (command === 'card') {
    process.stdout.write(foldCard(bytes.toString('utf8'), { name: basename(value) }))
    return
  }
  const view = foldPacket(JSON.parse(bytes.toString('utf8')), { packetSha256: sha256(bytes) })
  process.stdout.write(`${JSON.stringify(view, null, 2)}\n`)
}

runCli(import.meta, main, { CliError, fallback: 'REVIEW_VIEW_FAILED' })
