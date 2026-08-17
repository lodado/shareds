#!/usr/bin/env node

import { readFile } from 'node:fs/promises'

const FLAG_NAMES = ['oracle', 'map', 'ledger', 'run', 'row', 'file', 'intersect', 'path']

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

function sectionLines(lines, title) {
  const section = []
  let active = false

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (active) break
      active = line.trim() === `## ${title}`
      continue
    }

    if (active) section.push(line)
  }

  return section
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

  const confirmation = sectionLines(lines, 'User Confirmation')
  if (confirmation.length === 0) {
    issues.push('user-confirmation: card has no `## User Confirmation` section')
  } else {
    if (!confirmation.some((line) => /^- Status:\s*approved\s*$/i.test(line.trim()))) {
      issues.push('user-confirmation-status: final card must have `- Status: approved`')
    }

    const source = confirmation
      .find((line) => /^- Source:/i.test(line.trim()))
      ?.split(':')
      .slice(1)
      .join(':')
      .trim()
    if (!source || isEmptyCell(source)) {
      issues.push('user-confirmation-source: final card must cite the approving user response')
    }
  }

  const sourceIds = new Set(
    sectionLines(lines, 'Source Registry')
      .filter((line) => line.trim().startsWith('|'))
      .map((line) => splitRow(line.trim())[0])
      .filter((id) => /^S\d+$/.test(id)),
  )

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

  const seenRows = new Set()
  for (const row of rows) {
    const never = cellOf(row, 'Never')
    const then = cellOf(row, 'Then')

    if (seenRows.has(row.id)) issues.push(`duplicate-row: ${row.id}: contract row ID is repeated`)
    seenRows.add(row.id)

    if (isEmptyCell(never)) issues.push(`empty-never: ${row.id}: Never is empty`)

    if (row.id.startsWith('O')) {
      if (isEmptyCell(then)) issues.push(`empty-then: ${row.id}: Then is empty`)
      if (isEmptyCell(cellOf(row, '부작용'))) issues.push(`empty-side-effect: ${row.id}: side effect count is empty`)
    } else {
      if (isEmptyCell(cellOf(row, '계약'))) {
        issues.push(`empty-visual-contract: ${row.id}: visual contract is empty`)
      }
      const source = cellOf(row, '출처')
      if (isEmptyCell(source)) issues.push(`visual-source: ${row.id}: visual contract has no source`)
      for (const id of source.match(/\bS\d+\b/g) ?? []) {
        if (!sourceIds.has(id)) issues.push(`unknown-source: ${row.id}: ${id} is not in Source Registry`)
      }
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

  const contractText = rows.flatMap((row) => Object.values(row.cells)).join(' ')
  const sourcedNaText = lines.filter((line) => /\bN\/A\b/i.test(line) && line.includes('(출처:')).join(' ')

  for (const { kind, tokens } of AUTO_TEST_CASES) {
    if (!tokens.some((token) => contractText.includes(token) || sourcedNaText.includes(token))) {
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

async function ledgerRun(options) {
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

  return run
}

async function verifyRedEvidence(options) {
  if (!options.oracle || !options.map || !options.ledger || !options.run || !options.row) {
    throw new CliError('USAGE', 'red requires --oracle, --map, --ledger, --run and --row', 2)
  }

  const card = await readFile(options.oracle, 'utf8').catch((error) => {
    throw new CliError('CARD_UNREADABLE', `Cannot read ${options.oracle}: ${error.message}`)
  })
  const rows = parseRows(card).map((row) => row.id)
  const map = await readJson(options.map, 'EVIDENCE_INVALID')
  const entry = map?.rows?.[options.row]

  if (!rows.includes(options.row) || !entry) {
    throw new CliError('RED_EVIDENCE_MISSING', `${options.row} has no planned evidence in the locked card`)
  }

  assertEvidenceShape(options.row, entry)
  if (entry.kind !== 'test') {
    throw new CliError('RED_EVIDENCE_MISSING', `${options.row} must map to a test for VALID_RED`)
  }

  const run = await ledgerRun(options)
  if (run.exitCode === 0 || run.grade !== 'reported') {
    throw new CliError(
      'RED_EVIDENCE_UNVERIFIABLE',
      `${run.runId} must be a non-zero reported run for VALID_RED; got exit ${run.exitCode} grade ${run.grade}`,
    )
  }

  const observed = (run.tests ?? []).find((test) => test.name === entry.name)
  if (!observed || observed.status !== 'failed') {
    throw new CliError(
      'RED_EVIDENCE_MISSING',
      `${options.row}: "${entry.name}" must be failed in ${run.runId}; observed ${observed?.status ?? 'missing'}`,
    )
  }

  process.stdout.write(`RED_EVIDENCE_VERIFIED ${options.row} ${entry.name}\n`)
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

  const run = await ledgerRun(options)

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

    const mandatory = finding.severity === 'critical' || finding.severity === 'high'
    const downgraded = !finding.row && !mandatory && finding.classification !== 'NON_ORACLE_OPINION'

    return {
      ...finding,
      row: finding.row ?? '-',
      classification: downgraded ? 'NON_ORACLE_OPINION' : finding.classification,
      downgraded,
    }
  })
}

function findingKey(finding) {
  const normalized = finding.finding
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  return `${finding.row}|${finding.classification}|${normalized}`
}

async function findingsResult(options) {
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

  const opinions = (findings) => findings.filter((finding) => finding.classification === 'NON_ORACLE_OPINION')
  const claims = (findings) => findings.filter((finding) => finding.classification !== 'NON_ORACLE_OPINION')
  const mandatory = (finding) => finding.severity === 'critical' || finding.severity === 'high'

  let blocking
  let advisory

  if (secondary) {
    const secondaryKeys = new Set(claims(secondary).map(findingKey))
    const primaryKeys = new Set(claims(primary).map(findingKey))
    const seen = new Set()

    blocking = []
    advisory = [...opinions(primary), ...opinions(secondary)]

    for (const finding of [...claims(primary), ...claims(secondary)]) {
      const key = findingKey(finding)
      if (seen.has(key)) continue
      seen.add(key)
      if (mandatory(finding) || (secondaryKeys.has(key) && primaryKeys.has(key))) blocking.push(finding)
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

  return { blocking, advisory, lines }
}

async function verifyFindings(options) {
  const result = await findingsResult(options)
  process.stdout.write(`${result.lines.join('\n')}\n`)
}

async function verifyReview(options) {
  const result = await findingsResult(options)

  if (result.blocking.length > 0) {
    throw new CliError(
      'FINDINGS_BLOCKING',
      `${result.blocking.length} blocking findings remain:\n  ${result.blocking
        .map((finding) => `${finding.id} ${finding.row} ${finding.severity} ${finding.finding}`)
        .join('\n  ')}`,
    )
  }

  process.stdout.write(`REVIEW_CLEAR advisory:${result.advisory.length}\n`)
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
  else if (command === 'red') await verifyRedEvidence(options)
  else if (command === 'evidence') await verifyEvidence(options)
  else if (command === 'findings') await verifyFindings(options)
  else if (command === 'review') await verifyReview(options)
  else if (command === 'scan') await scanNondeterminism(options)
  else throw new CliError('USAGE', 'Expected card, red, evidence, findings, review or scan', 2)
}

try {
  await main()
} catch (error) {
  const cliError = error instanceof CliError ? error : new CliError('INPUT_UNREADABLE', error.message ?? String(error))
  process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
  process.exitCode = cliError.exitCode
}
