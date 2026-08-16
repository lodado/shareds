#!/usr/bin/env node

import { readFile } from 'node:fs/promises'

const FLAG_NAMES = ['oracle', 'map', 'ledger', 'run', 'file', 'intersect', 'path']

const CLASSIFICATIONS = [
  'POLICY_GAP',
  'EVIDENCE_GAP',
  'HARNESS_DEFECT',
  'PRODUCT_DEFECT',
  'ENVIRONMENT_DEFECT',
  'NON_ORACLE_OPINION',
]

const SEVERITIES = ['critical', 'high', 'medium', 'low']

const EVIDENCE_TIERS = ['HARD', 'RELATIONAL', 'JUDGMENT']

const VAGUE_WORDS = [
  '적절히',
  '적절한',
  '적당히',
  '알맞게',
  '자연스럽게',
  '부드럽게',
  '깔끔하게',
  '유연하게',
  '빠르게',
  'appropriately',
  'properly',
  'gracefully',
  'smoothly',
]

/** bva.md의 자동 추가 TC 7종. 행이든 N/A 사유든 카드 어딘가에는 나와야 한다. */
const AUTO_TEST_CASES = [
  { kind: '중복', tokens: ['중복'] },
  { kind: '오류', tokens: ['오류', '에러', 'error'] },
  { kind: '재시도', tokens: ['재시도', 'retry'] },
  { kind: '빈-데이터', tokens: ['빈 ', '0건', 'empty'] },
  { kind: '로딩', tokens: ['로딩', 'loading'] },
  { kind: 'out-of-order', tokens: ['out-of-order', '역전'] },
  { kind: '취소', tokens: ['취소', '이탈', 'cancel'] },
]

// oracle:nondeterminism scan이 찾는 토큰 목록 자체다 — 실행 경로가 아니다
const NONDETERMINISM_TOKENS = ['Date.now', 'Math.random', 'crypto.randomUUID', 'toLocale', 'new Intl.', 'new Date()']

const EXEMPTION_MARKER = 'oracle:nondeterminism'

class CliError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

function parseOptions(args) {
  const options = { path: [] }

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    const name = flag.startsWith('--') ? flag.slice(2) : ''
    const value = args[index + 1]

    if (!FLAG_NAMES.includes(name) || value === undefined) {
      throw new CliError('USAGE', `Unknown or incomplete option: ${flag}`, 2)
    }

    if (name === 'path') options.path.push(value)
    else options[name] = value
    index += 1
  }

  return options
}

async function readJson(path, code) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new CliError(code, `Cannot read ${path}: ${error.message}`)
  }
}

function splitRow(line) {
  return line
    .slice(1, line.lastIndexOf('|'))
    .split('|')
    .map((cell) => cell.trim())
}

/** 카드의 `| ID |` 표에서 `O1`·`D1` 형식의 계약 행만 헤더 이름과 함께 뽑는다. */
function parseRows(card) {
  const rows = []
  let headers = null

  card.split('\n').forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) {
      headers = null
      return
    }

    const cells = splitRow(trimmed)

    if (cells[0] === 'ID') {
      headers = cells
      return
    }

    if (!headers || !/^[OD]\d+$/.test(cells[0])) return

    const row = { id: cells[0], line: index + 1, cells: {} }
    headers.forEach((header, position) => {
      row.cells[header] = cells[position] ?? ''
    })
    rows.push(row)
  })

  return rows
}

function cellOf(row, ...names) {
  const header = Object.keys(row.cells).find((key) => names.some((name) => key.includes(name)))
  return header ? row.cells[header] : ''
}

function isEmptyCell(value) {
  return value === '' || value === '-' || value.toUpperCase() === 'TBD'
}

async function lintCard(options) {
  if (!options.oracle) throw new CliError('USAGE', 'card requires --oracle', 2)

  const card = await readFile(options.oracle, 'utf8').catch((error) => {
    throw new CliError('CARD_UNREADABLE', `Cannot read ${options.oracle}: ${error.message}`)
  })
  const lines = card.split('\n')
  const rows = parseRows(card)
  const issues = []

  if (!card.includes('## Source Registry')) {
    issues.push('source-registry: card has no `## Source Registry` section')
  }

  let inPolicySection = false
  lines.forEach((line, index) => {
    if (line.startsWith('## ')) inPolicySection = line.includes('결정된 정책')
    if (!inPolicySection || !line.startsWith('- ')) return
    if (!line.includes('(출처:')) {
      issues.push(`policy-source: line ${index + 1}: policy has no approved source — ${line.trim()}`)
    }
  })

  if (rows.length === 0) {
    issues.push('no-rows: card has no O*/D* contract rows')
  }

  for (const row of rows) {
    const never = cellOf(row, 'Never')
    const then = cellOf(row, 'Then')

    if (isEmptyCell(never)) issues.push(`empty-never: ${row.id}: Never is empty`)

    if (row.id.startsWith('O')) {
      if (isEmptyCell(cellOf(row, '부작용'))) issues.push(`empty-side-effect: ${row.id}: side effect count is empty`)
    } else {
      if (isEmptyCell(cellOf(row, '출처'))) issues.push(`visual-source: ${row.id}: visual contract has no source`)
      const tier = cellOf(row, '증거 계층')
      if (!EVIDENCE_TIERS.includes(tier)) {
        issues.push(`visual-evidence-tier: ${row.id}: evidence tier must be one of ${EVIDENCE_TIERS.join(', ')}`)
      }
    }

    for (const word of VAGUE_WORDS) {
      if (then.includes(word) || never.includes(word)) {
        issues.push(`vague-word: ${row.id}: "${word}" is not machine-checkable`)
      }
    }
  }

  for (const { kind, tokens } of AUTO_TEST_CASES) {
    if (!tokens.some((token) => card.includes(token))) {
      issues.push(`missing-auto-tc: ${kind}: add a row or a sourced N/A reason`)
    }
  }

  if (issues.length > 0) {
    throw new CliError('CARD_LINT_FAILED', `card structure is incomplete:\n  ${issues.join('\n  ')}`)
  }

  process.stdout.write(`CARD_LINT_OK ${rows.length} rows\n`)
}

function assertEvidenceShape(id, entry) {
  const required = { test: ['name'], na: ['reason', 'source'], reviewer: ['finding', 'role'] }[entry?.kind]

  if (!required) {
    throw new CliError('EVIDENCE_INVALID', `${id}: kind must be test, na or reviewer`)
  }

  for (const field of required) {
    if (!entry[field]) throw new CliError('EVIDENCE_INVALID', `${id}: ${entry.kind} evidence requires ${field}`)
  }
}

async function verifyEvidence(options) {
  if (!options.oracle || !options.map || !options.ledger || !options.run) {
    throw new CliError('USAGE', 'evidence requires --oracle, --map, --ledger and --run', 2)
  }

  const card = await readFile(options.oracle, 'utf8').catch((error) => {
    throw new CliError('CARD_UNREADABLE', `Cannot read ${options.oracle}: ${error.message}`)
  })
  const map = await readJson(options.map, 'EVIDENCE_INVALID')
  const rows = parseRows(card).map((row) => row.id)
  const mapped = Object.keys(map?.rows ?? {})

  const unknown = mapped.filter((id) => !rows.includes(id))
  if (unknown.length > 0) {
    throw new CliError('EVIDENCE_UNKNOWN_ROW', `evidence maps rows that are not in the card: ${unknown.join(', ')}`)
  }

  const missing = rows.filter((id) => !mapped.includes(id))
  if (missing.length > 0) {
    throw new CliError('EVIDENCE_MISSING_ROW', `card rows have no evidence entry: ${missing.join(', ')}`)
  }

  for (const id of rows) assertEvidenceShape(id, map.rows[id])

  const ledger = await readFile(options.ledger, 'utf8').catch((error) => {
    throw new CliError('LEDGER_INVALID', `Cannot read ${options.ledger}: ${error.message}`)
  })
  const run = ledger
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .find((entry) => entry.runId === options.run)

  if (!run) {
    throw new CliError('RUN_NOT_FOUND', `${options.run} is not recorded in the run ledger`)
  }

  const needsRunEvidence = rows.filter((id) => map.rows[id].kind === 'test')

  if (needsRunEvidence.length > 0 && run.grade !== 'reported') {
    throw new CliError(
      'EVIDENCE_UNVERIFIABLE',
      `${run.runId} is graded ${run.grade} — test names cannot be verified without a parsed reporter`,
    )
  }

  for (const id of needsRunEvidence) {
    const name = map.rows[id].name
    const observed = (run.tests ?? []).find((entry) => entry.name === name)

    if (!observed) {
      throw new CliError('EVIDENCE_NOT_IN_RUN', `${id}: "${name}" is not in ${run.runId}`)
    }

    if (observed.status !== 'passed') {
      throw new CliError('EVIDENCE_NOT_IN_RUN', `${id}: "${name}" is ${observed.status} in ${run.runId}`)
    }
  }

  process.stdout.write(`EVIDENCE_VERIFIED ${rows.length} rows\n`)
}

function normalizeFindings(document, rows, source) {
  const findings = document?.findings

  if (!Array.isArray(findings)) {
    throw new CliError('FINDINGS_INVALID', `${source}: findings must be an array`)
  }

  return findings.map((finding) => {
    for (const field of ['id', 'classification', 'severity', 'finding', 'evidence', 'fix']) {
      if (!finding?.[field]) {
        throw new CliError('FINDINGS_INVALID', `${source}: finding ${finding?.id ?? '?'} requires ${field}`)
      }
    }

    if (!CLASSIFICATIONS.includes(finding.classification)) {
      throw new CliError('FINDINGS_INVALID', `${source}: unknown classification ${finding.classification}`)
    }

    if (!SEVERITIES.includes(finding.severity)) {
      throw new CliError('FINDINGS_INVALID', `${source}: unknown severity ${finding.severity}`)
    }

    if (finding.row && !rows.includes(finding.row)) {
      throw new CliError('FINDINGS_INVALID', `${source}: finding ${finding.id} cites unknown card row ${finding.row}`)
    }

    const downgraded = !finding.row && finding.classification !== 'NON_ORACLE_OPINION'

    return {
      ...finding,
      row: finding.row ?? '-',
      classification: downgraded ? 'NON_ORACLE_OPINION' : finding.classification,
      downgraded,
    }
  })
}

async function verifyFindings(options) {
  if (!options.file || !options.oracle) {
    throw new CliError('USAGE', 'findings requires --file and --oracle', 2)
  }

  const card = await readFile(options.oracle, 'utf8').catch((error) => {
    throw new CliError('CARD_UNREADABLE', `Cannot read ${options.oracle}: ${error.message}`)
  })
  const rows = parseRows(card).map((row) => row.id)
  const primary = normalizeFindings(await readJson(options.file, 'FINDINGS_INVALID'), rows, options.file)
  const secondary = options.intersect
    ? normalizeFindings(await readJson(options.intersect, 'FINDINGS_INVALID'), rows, options.intersect)
    : null

  const key = (finding) => `${finding.row}|${finding.classification}`
  const opinions = (findings) => findings.filter((finding) => finding.classification === 'NON_ORACLE_OPINION')
  const claims = (findings) => findings.filter((finding) => finding.classification !== 'NON_ORACLE_OPINION')

  let blocking
  let advisory

  if (secondary) {
    const secondaryKeys = new Set(claims(secondary).map(key))
    const primaryKeys = new Set(claims(primary).map(key))
    const seen = new Set()

    blocking = []
    advisory = [...opinions(primary), ...opinions(secondary)]

    for (const finding of [...claims(primary), ...claims(secondary)]) {
      if (seen.has(key(finding))) continue
      seen.add(key(finding))
      if (secondaryKeys.has(key(finding)) && primaryKeys.has(key(finding))) blocking.push(finding)
      else advisory.push(finding)
    }
  } else {
    blocking = claims(primary)
    advisory = opinions(primary)
  }

  const lines = [`FINDINGS_OK blocking:${blocking.length} advisory:${advisory.length}`]

  if (secondary) {
    lines.push(...blocking.map((finding) => `BLOCKING ${finding.row} ${finding.classification} ${finding.finding}`))
    lines.push(...advisory.map((finding) => `ADVISORY ${finding.row} ${finding.classification} ${finding.finding}`))
  }

  lines.push(
    ...[...primary, ...(secondary ?? [])]
      .filter((finding) => finding.downgraded)
      .map((finding) => `DOWNGRADED ${finding.id} NON_ORACLE_OPINION`),
  )

  process.stdout.write(`${lines.join('\n')}\n`)
}

async function scanNondeterminism(options) {
  if (options.path.length === 0) throw new CliError('USAGE', 'scan requires at least one --path', 2)

  const hits = []

  for (const path of options.path) {
    const content = await readFile(path, 'utf8').catch((error) => {
      throw new CliError('SCAN_UNREADABLE', `Cannot read ${path}: ${error.message}`)
    })
    const lines = content.split('\n')

    lines.forEach((line, index) => {
      const exempt = line.includes(EXEMPTION_MARKER) || (lines[index - 1] ?? '').includes(EXEMPTION_MARKER)
      if (exempt) return

      for (const token of NONDETERMINISM_TOKENS) {
        if (line.includes(token)) hits.push(`${path}:${index + 1}: ${token}`)
      }
    })
  }

  if (hits.length > 0) {
    throw new CliError(
      'NONDETERMINISM_FOUND',
      `nondeterministic sources need an injection seam or an \`${EXEMPTION_MARKER} <reason>\` comment:\n  ${hits.join('\n  ')}`,
    )
  }

  process.stdout.write(`SCAN_OK ${options.path.length} files\n`)
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const options = parseOptions(args)

  if (command === 'card') await lintCard(options)
  else if (command === 'evidence') await verifyEvidence(options)
  else if (command === 'findings') await verifyFindings(options)
  else if (command === 'scan') await scanNondeterminism(options)
  else throw new CliError('USAGE', 'Expected card, evidence, findings or scan', 2)
}

try {
  await main()
} catch (error) {
  const cliError = error instanceof CliError ? error : new CliError('INPUT_UNREADABLE', error.message ?? String(error))
  process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
  process.exitCode = cliError.exitCode
}
