#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

const FLAG_NAMES = ['oracle', 'map', 'ledger', 'run', 'row', 'file', 'intersect', 'path', 'phase']

const CLASSIFICATIONS = [
  'POLICY_GAP',
  'EVIDENCE_GAP',
  'HARNESS_DEFECT',
  'PRODUCT_DEFECT',
  'ENVIRONMENT_DEFECT',
  'NON_ORACLE_OPINION',
]

const SEVERITIES = ['critical', 'high', 'medium', 'low']

const CHANGEABILITY_AXES = ['Readability', 'Predictability', 'Cohesion', 'Coupling', 'Simplicity']
const CHANGEABILITY_STATUSES = ['PASS', 'FINDING', 'N/A']

const EVIDENCE_TIERS = ['HARD', 'RELATIONAL', 'JUDGMENT']

const OUTCOME_FIELDS = [
  'Actor and context',
  'Observable success',
  'Non-goals',
  'Worst regression',
  'Reversibility',
  'Sources',
]

const SOURCE_KINDS = ['product-policy', 'mandatory-constraint', 'project-constraint', 'implementation-reference']

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

/** O* 행의 Given·When·BVA에 이 토큰이 있으면 카드에 `## State Model`이 필수다. */
const ASYNC_STATE_TOKENS = [
  'pending',
  'loading',
  '로딩',
  'retry',
  '재시도',
  '역전',
  'out-of-order',
  '중복',
  'timeout',
  '타임아웃',
  '취소',
  'cancel',
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
  const cells = []
  let cell = ''
  let escaped = false

  for (const character of line.slice(1, line.lastIndexOf('|'))) {
    if (character === '|' && !escaped) {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += character
    }
    escaped = character === '\\' && !escaped
  }
  cells.push(cell.trim())
  return cells
}

function markdownLines(card) {
  let fence = null

  return card.split('\n').map((line) => {
    const marker = line.trimStart().match(/^(`{3,}|~{3,})/)?.[1]
    if (marker) {
      if (!fence) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null
      return ''
    }
    return fence ? '' : line
  })
}

/** 카드의 `| ID |` 표에서 `O1`·`D1` 형식의 계약 행만 헤더 이름과 함께 뽑는다. */
function parseRows(document) {
  const lines = Array.isArray(document) ? document : markdownLines(document)
  const rows = []
  let headers = null

  lines.forEach((line, index) => {
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

function policyIds(value) {
  return [...new Set(value.match(/\bP\d+\b/g) ?? [])]
}

function rowIds(value) {
  return [...new Set(value.match(/\b[OD]\d+\b/g) ?? [])]
}

async function lintCard(options) {
  if (!options.oracle) throw new CliError('USAGE', 'card requires --oracle', 2)

  const card = await readFile(options.oracle, 'utf8').catch((error) => {
    throw new CliError('CARD_UNREADABLE', `Cannot read ${options.oracle}: ${error.message}`)
  })
  const lines = markdownLines(card)
  const rows = parseRows(lines)
  const issues = []

  const sourceSection = sectionLines(lines, 'Source Registry')
  if (sourceSection.length === 0) {
    issues.push('source-registry: card has no `## Source Registry` section')
  }

  let sourceHeaders = null
  const sources = []
  for (const line of sourceSection) {
    if (!line.trim().startsWith('|')) continue

    const cells = splitRow(line.trim())
    if (cells[0] === 'ID') {
      sourceHeaders = cells
      continue
    }
    if (!sourceHeaders || !/^S\d+$/.test(cells[0])) continue

    sources.push(Object.fromEntries(sourceHeaders.map((header, index) => [header, cells[index] ?? ''])))
  }

  const sourceIds = new Set(sources.map(({ ID }) => ID))
  if (!sourceHeaders?.includes('Kind')) {
    issues.push('source-kind: Source Registry must include a `Kind` column')
  } else {
    for (const source of sources) {
      if (!SOURCE_KINDS.includes(source.Kind)) {
        issues.push(`source-kind: ${source.ID}: ${source.Kind || '(empty)'} must be one of ${SOURCE_KINDS.join(', ')}`)
      }
    }
  }

  const outcome = sectionLines(lines, 'Outcome Brief')
  if (outcome.length === 0) {
    issues.push('outcome-brief: card has no `## Outcome Brief` section')
  } else {
    for (const field of OUTCOME_FIELDS) {
      const value = outcome
        .find((line) => line.trim().startsWith(`- ${field}:`))
        ?.split(':')
        .slice(1)
        .join(':')
        .trim()

      if (!value || isEmptyCell(value)) {
        issues.push(`outcome-field: ${field} must have a concrete value`)
      }
    }

    const citedSources = outcome.find((line) => line.trim().startsWith('- Sources:'))?.match(/\bS\d+\b/g) ?? []
    for (const id of citedSources) {
      if (!sourceIds.has(id)) issues.push(`outcome-source: ${id} is not in Source Registry`)
    }
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

  if (rows.some((row) => cellOf(row, '증거 계층') === 'RELATIONAL')) {
    const authorization = confirmation.find((line) => /^- Visual QA authorization:/i.test(line.trim()))
    if (!authorization || !/:\s*(approved|declined)\s*$/i.test(authorization.trim())) {
      issues.push('visual-qa-authorization: RELATIONAL rows require `- Visual QA authorization: approved | declined`')
    }
  }

  const policies = new Map()
  let inPolicySection = false
  lines.forEach((line, index) => {
    if (line.startsWith('## ')) inPolicySection = line.includes('결정된 정책')
    if (!inPolicySection || !line.startsWith('- ')) return

    if (!line.includes('(출처:')) {
      issues.push(`policy-source: line ${index + 1}: policy has no approved source — ${line.trim()}`)
    }

    const id = line.match(/^- (P\d+):/)?.[1]
    if (!id) {
      issues.push(`policy-id: line ${index + 1}: policy must start with a unique P* ID`)
      return
    }

    if (policies.has(id)) issues.push(`duplicate-policy: ${id}: policy ID is repeated`)

    const linked = line.match(/\(행:\s*([^)]+)\)/)?.[1] ?? ''
    const linkedRows = rowIds(linked)
    if (linkedRows.length === 0) {
      issues.push(`policy-row-unlinked: ${id}: policy must cite at least one contract row`)
    }
    policies.set(id, { rows: linkedRows, line: index + 1 })
  })

  if (rows.length === 0) {
    issues.push('no-rows: card has no O*/D* contract rows')
  }

  const seenRows = new Set()
  const policiesByRow = new Map()
  for (const row of rows) {
    const never = cellOf(row, 'Never')
    const then = cellOf(row, 'Then')
    const linkedPolicies = policyIds(cellOf(row, '정책', 'Policy'))
    policiesByRow.set(row.id, linkedPolicies)

    if (seenRows.has(row.id)) issues.push(`duplicate-row: ${row.id}: contract row ID is repeated`)
    seenRows.add(row.id)

    if (linkedPolicies.length === 0) {
      issues.push(`row-policy-unlinked: ${row.id}: contract row must cite at least one policy ID`)
    }

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

  for (const [policyId, policy] of policies) {
    for (const rowId of policy.rows) {
      if (!seenRows.has(rowId)) {
        issues.push(`policy-row-unknown: ${policyId}: ${rowId} is not a contract row`)
      } else if (!policiesByRow.get(rowId)?.includes(policyId)) {
        issues.push(`policy-row-asymmetric: ${policyId} cites ${rowId}, but ${rowId} does not cite ${policyId}`)
      }
    }
  }

  for (const [rowId, linkedPolicies] of policiesByRow) {
    for (const policyId of linkedPolicies) {
      const policy = policies.get(policyId)
      if (!policy) {
        issues.push(`row-policy-unknown: ${rowId}: ${policyId} is not a decided policy`)
      } else if (!policy.rows.includes(rowId)) {
        issues.push(`policy-row-asymmetric: ${rowId} cites ${policyId}, but ${policyId} does not cite ${rowId}`)
      }
    }
  }

  const asyncRows = rows.filter((row) => {
    if (!row.id.startsWith('O')) return false
    const text = `${cellOf(row, 'Given')} ${cellOf(row, 'When')} ${cellOf(row, 'BVA')}`
    return ASYNC_STATE_TOKENS.some((token) => text.includes(token))
  })

  if (asyncRows.length > 0) {
    const stateModel = sectionLines(lines, 'State Model')

    if (stateModel.length === 0) {
      issues.push(
        `state-model-missing: async rows (${asyncRows
          .map((row) => row.id)
          .join(', ')}) require a \`## State Model\` section`,
      )
    } else {
      for (const field of ['States', 'Events']) {
        const value = stateModel
          .find((line) => line.trim().startsWith(`- ${field}:`))
          ?.split(':')
          .slice(1)
          .join(':')
          .trim()
        if (!value || isEmptyCell(value)) {
          issues.push(`state-model-field: State Model must list concrete ${field}`)
        }
      }

      const transitions = stateModel
        .filter((line) => line.trim().startsWith('|'))
        .map((line) => splitRow(line.trim()))
        .filter((cells) => cells[0] !== 'From' && !/^:?-+:?$/.test(cells[0]))

      if (transitions.length === 0) {
        issues.push('state-model-transitions: State Model must include a From/Event/To transition table')
      }

      for (const cells of transitions) {
        const cited = rowIds(cells.join(' '))
        if (cited.length === 0) {
          issues.push(
            `state-model-row-unlinked: transition "${cells.slice(0, 3).join(' → ')}" must cite at least one O* row`,
          )
        }
        for (const id of cited) {
          if (!seenRows.has(id)) issues.push(`state-model-row-unknown: ${id} is not a contract row`)
        }
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
  const required = {
    test: ['name'],
    na: ['reason', 'source'],
    reviewer: ['finding', 'role'],
    visual: ['artifact'],
    pending: ['reason', 'owner'],
  }[entry?.kind]

  if (!required) {
    throw new CliError('EVIDENCE_INVALID', `${id}: kind must be test, na, reviewer, visual or pending`)
  }

  for (const field of required) {
    if (!entry[field]) throw new CliError('EVIDENCE_INVALID', `${id}: ${entry.kind} evidence requires ${field}`)
  }
}

function assertEvidenceOwner(row, entry) {
  if (!row.id.startsWith('D') || entry.kind === 'na') return

  const tier = cellOf(row, '증거 계층')
  const valid =
    (tier === 'HARD' && entry.kind === 'test') ||
    (tier === 'RELATIONAL' && ['visual', 'pending'].includes(entry.kind)) ||
    (tier === 'JUDGMENT' && entry.kind === 'reviewer' && entry.role === 'designer')

  if (!valid) {
    throw new CliError('EVIDENCE_OWNER_INVALID', `${row.id}: ${tier} cannot use ${entry.kind} evidence`)
  }
}

async function verifyVisualArtifact(id, entry, mapPath, oracleSha256) {
  const base = dirname(resolve(mapPath))
  const artifactPath = resolve(base, entry.artifact)
  const portable = relative(base, artifactPath)

  if (portable.startsWith('..') || isAbsolute(portable)) {
    throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: visual artifact must stay inside the Oracle directory`)
  }

  const artifact = await readJson(artifactPath, 'VISUAL_EVIDENCE_INVALID')
  if (artifact?.schemaVersion !== 1 || artifact.oracleSha256 !== oracleSha256 || artifact.rows?.[id] !== 'passed') {
    throw new CliError(
      'VISUAL_EVIDENCE_INVALID',
      `${id}: visual artifact must cite this Oracle SHA and a passed row result`,
    )
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
  const contracts = parseRows(card)
  const rows = contracts.map((row) => row.id)
  const mapped = Object.keys(map?.rows ?? {})
  const phase = options.phase ?? 'review'

  if (!['green', 'review'].includes(phase)) {
    throw new CliError('USAGE', 'evidence --phase must be green or review', 2)
  }

  const unknown = mapped.filter((id) => !rows.includes(id))
  if (unknown.length > 0) {
    throw new CliError('EVIDENCE_UNKNOWN_ROW', `evidence maps rows that are not in the card: ${unknown.join(', ')}`)
  }

  const missing = rows.filter((id) => !mapped.includes(id))
  if (missing.length > 0) {
    throw new CliError('EVIDENCE_MISSING_ROW', `card rows have no evidence entry: ${missing.join(', ')}`)
  }

  for (const row of contracts) {
    assertEvidenceShape(row.id, map.rows[row.id])
    assertEvidenceOwner(row, map.rows[row.id])
  }

  const pending = contracts.filter((row) => map.rows[row.id].kind === 'pending').map((row) => row.id)
  if (pending.length > 0 && phase === 'review') {
    throw new CliError('EVIDENCE_PENDING', `review requires completed visual evidence: ${pending.join(', ')}`)
  }

  const oracleSha256 = createHash('sha256').update(card).digest('hex')
  for (const row of contracts.filter((entry) => map.rows[entry.id].kind === 'visual')) {
    await verifyVisualArtifact(row.id, map.rows[row.id], options.map, oracleSha256)
  }

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

  const notices = pending.length > 0 ? `VISUAL_EVIDENCE_PENDING ${pending.join(', ')}\n` : ''
  process.stdout.write(`EVIDENCE_VERIFIED ${rows.length} rows\n${notices}`)
}

function normalizeFindings(document, rows, source) {
  const findings = document?.findings

  if (!Array.isArray(findings)) {
    throw new CliError('FINDINGS_INVALID', `${source}: findings must be an array`)
  }
  if (document.schemaVersion !== 1 && document.schemaVersion !== 2) {
    throw new CliError('FINDINGS_INVALID', `${source}: schemaVersion must be 1 or 2`)
  }

  if (document.schemaVersion === 2) {
    const review = document.changeabilityReview
    if (!Array.isArray(review)) {
      throw new CliError('FINDINGS_INVALID', `${source}: schemaVersion 2 requires changeabilityReview`)
    }

    const seen = new Set()
    for (const entry of review) {
      if (!CHANGEABILITY_AXES.includes(entry?.axis)) {
        throw new CliError('FINDINGS_INVALID', `${source}: unknown changeability axis ${entry?.axis ?? '?'}`)
      }
      if (seen.has(entry.axis)) {
        throw new CliError('FINDINGS_INVALID', `${source}: duplicate changeability axis ${entry.axis}`)
      }
      seen.add(entry.axis)

      if (!CHANGEABILITY_STATUSES.includes(entry.status)) {
        throw new CliError('FINDINGS_INVALID', `${source}: ${entry.axis} has invalid status ${entry.status ?? '?'}`)
      }
      if (typeof entry.evidence !== 'string' || !entry.evidence.trim()) {
        throw new CliError('FINDINGS_INVALID', `${source}: ${entry.axis} requires evidence`)
      }

      if (entry.status === 'FINDING') {
        if (!entry.findingId || !findings.some((finding) => finding?.id === entry.findingId)) {
          throw new CliError('FINDINGS_INVALID', `${source}: ${entry.axis} must cite an existing findingId`)
        }
      } else if (entry.findingId) {
        throw new CliError('FINDINGS_INVALID', `${source}: ${entry.axis} ${entry.status} cannot cite a findingId`)
      }
    }

    const missing = CHANGEABILITY_AXES.filter((axis) => !seen.has(axis))
    if (missing.length > 0) {
      throw new CliError('FINDINGS_INVALID', `${source}: missing changeability axes ${missing.join(', ')}`)
    }
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
      `nondeterministic sources need an injection seam or an \`${EXEMPTION_MARKER} <reason>\` comment:\n  ${hits.join(
        '\n  ',
      )}`,
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
