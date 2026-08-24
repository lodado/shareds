#!/usr/bin/env node

import { Buffer } from 'node:buffer'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import {
  assertSnapshotUnchanged,
  isPathInside,
  sha256,
  snapshotRegularFile,
  stableStringify,
} from './oracle-fs.mjs'

const FLAG_NAMES = [
  'oracle',
  'map',
  'ledger',
  'run',
  'row',
  'file',
  'intersect',
  'path',
  'phase',
  'source',
  'packet',
  'revision',
]

const CLASSIFICATIONS = [
  'POLICY_GAP',
  'EVIDENCE_GAP',
  'HARNESS_DEFECT',
  'PRODUCT_DEFECT',
  'ENVIRONMENT_DEFECT',
  'NON_ORACLE_OPINION',
]

const SEVERITIES = ['critical', 'high', 'medium', 'low']
const REVIEWER_ROLES = ['code-reviewer', 'designer']

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
  const options = { path: [], source: [] }

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    const name = flag.startsWith('--') ? flag.slice(2) : ''
    const value = args[index + 1]

    if (!FLAG_NAMES.includes(name) || value === undefined) {
      throw new CliError('USAGE', `Unknown or incomplete option: ${flag}`, 2)
    }

    if (name === 'path') options.path.push(value)
    else if (name === 'source') options.source.push(value)
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

function isApproved(value) {
  return /^(?:approved|승인됨)$/i.test(value.trim())
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

function betweenMarkers(value, start, end) {
  const startIndex = value.indexOf(start)
  if (startIndex === -1) return ''

  const contentStart = startIndex + start.length
  const endIndex = value.indexOf(end, contentStart)
  if (endIndex === -1) return ''

  return value.slice(contentStart, endIndex).trim()
}

function policyIdFromLine(line) {
  if (!line.startsWith('- P')) return null

  const marker = line.indexOf(':')
  if (marker === -1) return null

  const id = line.slice(2, marker)
  return /^P\d+$/.test(id) ? id : null
}

function stableJson(value) {
  return stableStringify(value)
}

async function snapshotOracleFile(path, base, code, label, snapshots) {
  const snapshot = await snapshotRegularFile(path, {
    base,
    allowHardlinks: false,
    label,
    fail: (message) => new CliError(code, message),
  })
  snapshots?.push(snapshot)
  return snapshot
}

async function assertSnapshots(snapshots, base, code) {
  for (const snapshot of snapshots) {
    await assertSnapshotUnchanged(snapshot, {
      base,
      label: 'verification input',
      fail: (message) => new CliError(code, message),
    })
  }
}

function parseSnapshotJson(snapshot, code) {
  try {
    return JSON.parse(snapshot.bytes.toString('utf8'))
  } catch (error) {
    throw new CliError(code, `Cannot parse ${snapshot.path}: ${error.message}`)
  }
}

function isDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
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
  for (const header of ['Kind', '관할', '위치·version', '승인 상태']) {
    if (!sourceHeaders?.includes(header)) {
      issues.push(`source-registry-header: Source Registry must include a \`${header}\` column`)
    }
  }
  const sourceById = new Map()
  for (const source of sources) {
    if (sourceById.has(source.ID)) issues.push(`duplicate-source: ${source.ID}: Source Registry ID is repeated`)
    sourceById.set(source.ID, source)
    if (!SOURCE_KINDS.includes(source.Kind)) {
      issues.push(`source-kind: ${source.ID}: ${source.Kind || '(empty)'} must be one of ${SOURCE_KINDS.join(', ')}`)
    }
    if (source.Kind !== 'implementation-reference' && !isApproved(source['승인 상태'] ?? '')) {
      issues.push(`source-unapproved: ${source.ID}: authoritative sources must be approved before lock`)
    }
    for (const [field, code] of [
      ['관할', 'source-jurisdiction'],
      ['위치·version', 'source-location-version'],
      ['승인 상태', 'source-approval-status'],
    ]) {
      if (isEmptyCell(source[field] ?? '')) issues.push(`${code}: ${source.ID}: ${field} must have a concrete value`)
    }
  }

  const enforceSourceLock = (options.source ?? []).length > 0
  const lockedSources = new Set()
  for (const path of (options.source ?? []).filter(Boolean)) {
    const sourcePath = resolve(path)
    lockedSources.add((await realpath(sourcePath).catch(() => null)) ?? sourcePath)
  }
  const registeredRepoSources = new Set()
  const realRoot = await realpath(process.cwd())
  for (const source of sources) {
    const location = source['위치·version'] ?? ''
    const repoSource = location.startsWith('repo:') ? location.slice('repo:'.length).split('#')[0] : null
    if (repoSource !== null) {
      const sourcePath = resolve(repoSource)
      const sourcePortable = relative(process.cwd(), sourcePath)
      if (
        isEmptyCell(repoSource) ||
        isAbsolute(repoSource) ||
        repoSource.includes('\\') ||
        sourcePortable.startsWith('..') ||
        isAbsolute(sourcePortable)
      ) {
        issues.push(`source-repo-path: ${source.ID}: repo: source must stay under the repository root`)
      } else if (enforceSourceLock) {
        let stat = await lstat(sourcePath).catch(() => null)
        let realSource = stat ? await realpath(sourcePath).catch(() => null) : null
        const suffix = `/${repoSource}`
        const lockedMatch = [...lockedSources].find((lockedSource) => lockedSource.endsWith(suffix))
        if (!realSource && lockedMatch) {
          stat = await lstat(lockedMatch).catch(() => null)
          realSource = stat ? await realpath(lockedMatch).catch(() => null) : null
        }
        registeredRepoSources.add(realSource ?? sourcePath)
        const realPortable = realSource ? relative(realRoot, realSource) : '..'
        if (stat?.isSymbolicLink() || !stat?.isFile() || realPortable.startsWith('..') || isAbsolute(realPortable)) {
          issues.push(`source-repo-path: ${source.ID}: repo: source must be a regular file under the repository root`)
        } else if (!lockedSources.has(realSource ?? sourcePath)) {
          issues.push(`source-lock-missing: ${source.ID}: local source ${repoSource} must be passed with --source`)
        }
      }
    }
  }
  if (enforceSourceLock) {
    for (const lockedSource of lockedSources) {
      if (!registeredRepoSources.has(lockedSource)) {
        issues.push(`source-lock-unregistered: ${lockedSource}: --source is not referenced by Source Registry`)
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
    if (!authorization || !/:\s*(?:approved|declined)\s*$/i.test(authorization.trim())) {
      issues.push('visual-qa-authorization: RELATIONAL rows require `- Visual QA authorization: approved | declined`')
    }
  }

  const policies = new Map()
  let inPolicySection = false
  lines.forEach((line, index) => {
    if (line.startsWith('## ')) inPolicySection = line.includes('결정된 정책')
    if (!inPolicySection || !line.startsWith('- ')) return

    const sourceText = betweenMarkers(line, '(출처:', ')')
    if (!sourceText) {
      issues.push(`policy-source: line ${index + 1}: policy has no approved source — ${line.trim()}`)
    } else {
      const cited = sourceText
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
      const registered = cited.filter((entry) => /^S\d+$/.test(entry))
      const confirmationSource = confirmation
        .find((entry) => /^- Source:/i.test(entry.trim()))
        ?.split(':')
        .slice(1)
        .join(':')
        .trim()
      for (const entry of cited) {
        if (/^S\d+$/.test(entry)) {
          const source = sourceById.get(entry)
          if (!source) issues.push(`policy-source-unknown: ${entry}: policy cites a source outside Source Registry`)
          else if (source.Kind !== 'implementation-reference' && !isApproved(source['승인 상태'] ?? '')) {
            issues.push(`policy-source-unapproved: ${entry}: policy source is not approved`)
          }
        } else if (entry !== confirmationSource) {
          issues.push(
            `policy-source-unregistered: ${entry}: policy source must be a Source Registry ID or exact user confirmation source`,
          )
        }
      }
      const registeredSources = registered.map((entry) => sourceById.get(entry)).filter(Boolean)
      if (
        registeredSources.length > 0 &&
        registeredSources.every((source) => source.Kind === 'implementation-reference')
      ) {
        issues.push(
          `policy-source-implementation-reference: line ${
            index + 1
          }: implementation-reference cannot be sole policy authority`,
        )
      }
    }

    const id = policyIdFromLine(line)
    if (!id) {
      issues.push(`policy-id: line ${index + 1}: policy must start with a unique P* ID`)
      return
    }

    if (policies.has(id)) issues.push(`duplicate-policy: ${id}: policy ID is repeated`)

    const linked = betweenMarkers(line, '(행:', ')')
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
      const cited = source.match(/\bS\d+\b/g) ?? []
      const approvedAuthority = cited.some((id) => {
        const registered = sourceById.get(id)
        return registered && registered.Kind !== 'implementation-reference' && isApproved(registered['승인 상태'] ?? '')
      })
      if (!approvedAuthority) {
        issues.push(`visual-source: ${row.id}: visual contract requires an approved non-implementation Source Registry source`)
      }
      for (const id of cited) {
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

  // State Model 섹션은 선택이다 — 없어도 lint를 막지 않고, 있으면 구조를 검증한다.
  const stateModel = sectionLines(lines, 'State Model')

  if (stateModel.length > 0) {
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

function assertNaEvidence(row, entry, approvedSources) {
  if (entry.kind !== 'na') return

  if (!approvedSources.has(entry.source)) {
    throw new CliError('EVIDENCE_OWNER_INVALID', `${row.id}: N/A evidence requires an approved Source Registry source`)
  }
  if (!/\bN\/A\b/i.test(rowText(row)) || !rowText(row).includes(entry.source)) {
    throw new CliError('EVIDENCE_OWNER_INVALID', `${row.id}: N/A evidence requires an explicit source-backed N/A row`)
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

function hasNonEmptyStrings(value) {
  return (
    Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === 'string' && entry.trim() !== '')
  )
}

function isAllowedJourneyTool(value) {
  return value === 'playwright' || /^mcp:[\w.-]+$/.test(value)
}

async function assertRegularFileInside(base, path, id, label, snapshots) {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} must be a non-empty relative path`)
  }

  const target = resolve(base, path)
  if (!isPathInside(base, target)) {
    throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} must stay inside the Oracle directory`)
  }
  return snapshotOracleFile(target, base, 'VISUAL_EVIDENCE_INVALID', `${id}: ${label}`, snapshots)
}

async function assertArtifactFiles(base, artifacts, id, label, snapshots) {
  for (const [index, artifact] of artifacts.entries()) {
    if (
      !artifact ||
      typeof artifact.path !== 'string' ||
      !isDigest(artifact.sha256) ||
      typeof artifact.mediaType !== 'string' ||
      !artifact.mediaType.trim()
    ) {
      throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label}[${index}] must have path, sha256 and mediaType`)
    }
    const snapshot = await assertRegularFileInside(base, artifact.path, id, `${label}[${index}].path`, snapshots)
    if (snapshot.sha256 !== artifact.sha256) {
      throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label}[${index}] digest does not match`)
    }
    if (artifact.mediaType === 'image/png') assertPng(snapshot.bytes, id, `${label}[${index}]`)
  }
}

function rowText(row) {
  return Object.values(row.cells).join(' ')
}

function approvedSourceIds(lines) {
  const sourceSection = sectionLines(lines, 'Source Registry')
  let headers = null
  const approved = new Set()

  for (const line of sourceSection) {
    if (!line.trim().startsWith('|')) continue

    const cells = splitRow(line.trim())
    if (cells[0] === 'ID') {
      headers = cells
      continue
    }
    if (!headers || !/^S\d+$/.test(cells[0])) continue

    const source = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))
    if (source.Kind !== 'implementation-reference' && isApproved(source['승인 상태'] ?? '')) approved.add(source.ID)
  }

  return approved
}

function visualAuthorization(card) {
  return sectionLines(markdownLines(card), 'User Confirmation')
    .find((line) => /^- Visual QA authorization:/i.test(line.trim()))
    ?.split(':')
    .slice(1)
    .join(':')
    .trim()
    .toLowerCase()
}

function assertPng(bytes, id, label) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (!bytes.subarray(0, 8).equals(signature)) throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} is not a PNG file`)
  let offset = 8
  let ihdr = false
  let iend = false
  const idat = []
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} has a truncated PNG chunk`)
    const length = bytes.readUInt32BE(offset)
    const type = bytes.subarray(offset + 4, offset + 8)
    const end = offset + 12 + length
    if (end > bytes.length) throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} has an invalid PNG chunk boundary`)
    const expected = bytes.readUInt32BE(end - 4)
    // PNG CRC uses the IEEE polynomial; Node exposes it only indirectly, so validate
    // through a compact table-less implementation.
    let crc = 0xffffffff
    for (const byte of bytes.subarray(offset + 4, end - 4)) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320)
    }
    if (((crc ^ 0xffffffff) >>> 0) !== expected)
      throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} has an invalid PNG CRC`)
    const name = type.toString('ascii')
    if (!/^[a-z]{4}$/i.test(name)) throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} has an invalid PNG chunk type`)
    if (!ihdr) {
      if (name !== 'IHDR' || length !== 13) throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} lacks a valid PNG IHDR`)
      const width = bytes.readUInt32BE(offset + 8)
      const height = bytes.readUInt32BE(offset + 12)
      if (!width || !height) throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} has invalid PNG dimensions`)
      ihdr = true
    } else if (name === 'IDAT') {
      if (iend) throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} has PNG data after IEND`)
      idat.push(bytes.subarray(offset + 8, end - 4))
    } else if (name === 'IEND') {
      if (length !== 0 || iend || idat.length === 0) throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} has an invalid PNG IEND`)
      iend = true
      if (end !== bytes.length) throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} has trailing PNG bytes`)
    }
    offset = end
  }
  if (!ihdr || !iend) throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} is an incomplete PNG`)
  try {
    inflateSync(Buffer.concat(idat))
  } catch {
    throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} has undecompressible PNG image data`)
  }
}

async function verifyVisualArtifact(row, entry, mapPath, oracleSha256, approvedSources, card, ledger, snapshots) {
  const base = dirname(resolve(mapPath))
  const id = row.id

  if (!isDigest(entry.sha256)) throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: visual evidence requires a sha256`)
  const artifactSnapshot = await assertRegularFileInside(base, entry.artifact, id, 'visual artifact', snapshots)
  if (artifactSnapshot.sha256 !== entry.sha256) {
    throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: visual artifact digest does not match`)
  }
  const artifact = parseSnapshotJson(artifactSnapshot, 'VISUAL_EVIDENCE_INVALID')
  const receipt = artifact?.rows?.[id]
  const journey = receipt?.journey
  const rowStatus = receipt?.status ?? receipt?.result
  const producer = artifact?.producerRun
  const producerLedger = ledger.find((run) => run.runId === producer?.runId)
  const validPassed =
    rowStatus === 'passed' &&
    journey?.status === 'passed' &&
    isAllowedJourneyTool(journey.tool) &&
    typeof journey.scenario === 'string' &&
    journey.scenario.trim() !== '' &&
    hasNonEmptyStrings(journey.checks) &&
    Array.isArray(journey.artifacts) &&
    journey.artifacts.length > 0
  const validNotApplicable =
    rowStatus === 'passed' &&
    journey?.status === 'not-applicable' &&
    typeof journey.reason === 'string' &&
    journey.reason.trim() !== '' &&
    approvedSources.has(journey.source) &&
    rowText(row).includes(journey.source) &&
    hasNonEmptyStrings(receipt.checks) &&
    Array.isArray(receipt.artifacts) &&
    receipt.artifacts.length > 0
  const producerBound =
    producer &&
    typeof producer.runId === 'string' &&
    producer.tool === 'playwright' &&
    producer.status === 'passed' &&
    isDigest(producer.worktreeSha256) &&
    producerLedger?.exitCode === 0 &&
    producerLedger?.signal == null &&
    producerLedger?.oracleSha256 === oracleSha256 &&
    producerLedger?.worktreeSha256 === producer.worktreeSha256 &&
    producerLedger?.adapter === 'node-test'
  if (
    artifact?.schemaVersion !== 3 ||
    artifact.oracleSha256 !== oracleSha256 ||
    !producerBound ||
    (visualAuthorization(card) === 'declined' && !validNotApplicable) ||
    (visualAuthorization(card) !== 'approved' && visualAuthorization(card) !== 'declined') ||
    (!validPassed && !validNotApplicable)
  ) {
    throw new CliError(
      'VISUAL_EVIDENCE_INVALID',
      `${id}: visual artifact must be producer-bound schema v3 with approved authorization and verified artifacts`,
    )
  }

  const receiptDirectory = dirname(artifactSnapshot.path)
  if (validPassed) await assertArtifactFiles(receiptDirectory, journey.artifacts, id, 'journey.artifacts', snapshots)
  if (validNotApplicable) await assertArtifactFiles(receiptDirectory, receipt.artifacts, id, 'artifacts', snapshots)
}

function validReviewReceiptField(record, field) {
  if (field.endsWith('Sha256') || field === 'targetRevision') return isDigest(record[field])
  return typeof record[field] === 'string' && record[field] !== ''
}

async function ledgerRun(options, base, snapshots) {
  const snapshot = await snapshotOracleFile(options.ledger, base, 'LEDGER_INVALID', 'run ledger', snapshots)
  let records
  let lines
  try {
    const raw = snapshot.bytes.toString('utf8')
    if (!raw || !raw.endsWith('\n')) throw new Error('ledger must be non-empty newline-terminated JSONL')
    lines = raw.slice(0, -1).split('\n')
    if (lines.some((line) => !line.trim())) throw new Error('ledger contains an empty record')
    records = lines.map((line) => JSON.parse(line))
  } catch (error) {
    throw new CliError('LEDGER_INVALID', `Cannot parse run ledger: ${error.message}`)
  }
  const runIds = new Set()
  const receiptIdentities = new Set()
  let previousDigest = '0'.repeat(64)
  let checkpointSeen = false
  let legacyPrefix = Buffer.alloc(0)
  for (const [index, record] of records.entries()) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new CliError('LEDGER_INVALID', `ledger record ${index} must be an object`)
    }
    if (record.type === 'checkpoint') {
      if (checkpointSeen || index === 0 || record.schemaVersion !== 3 || !isDigest(record.prefixSha256) || record.previousDigest !== '0'.repeat(64)) {
        throw new CliError('LEDGER_INVALID', `ledger checkpoint ${index} is invalid`)
      }
      const expectedPrefix = sha256(legacyPrefix)
      if (record.prefixSha256 !== expectedPrefix || !isDigest(record.digest)) {
        throw new CliError('LEDGER_INVALID', `ledger checkpoint ${index} does not bind exact legacy prefix bytes`)
      }
      checkpointSeen = true
    } else {
      if (record.schemaVersion !== 3 || !record.digest) {
        legacyPrefix = Buffer.concat([legacyPrefix, Buffer.from(`${lines[index]}\n`)])
        continue
      }
      if (record.type !== 'init' && record.type !== 'run' && record.type !== 'review-receipt' && record.type !== 'transition' && record.type !== 'budget') {
        throw new CliError('LEDGER_INVALID', `ledger record ${index} has an unknown type`)
      }
      if (
        record.type === 'init' &&
        (record.state !== 'ORACLE_READY' || !record.stateDelta || typeof record.at !== 'string' || !record.at)
      ) {
        throw new CliError('LEDGER_INVALID', `ledger init ${index} is malformed`)
      }
      if (record.type === 'run') {
        if (
          typeof record.runId !== 'string' ||
          !record.runId ||
          typeof record.label !== 'string' ||
          !record.label ||
          !Array.isArray(record.command) ||
          typeof record.command[0] !== 'string' ||
          !record.command[0] ||
          !record.command.every((part) => typeof part === 'string') ||
          (record.exitCode !== null && !Number.isInteger(record.exitCode)) ||
          (record.signal !== null && typeof record.signal !== 'string') ||
          typeof record.grade !== 'string' ||
          (record.tests !== null && !Array.isArray(record.tests)) ||
          runIds.has(record.runId) ||
          !isDigest(record.oracleSha256) ||
          (record.adapter !== null && typeof record.adapter !== 'string') ||
          !isDigest(record.worktreeSha256)
        ) {
          throw new CliError('LEDGER_INVALID', `ledger run ${index} has invalid identity, Oracle, or adapter`)
        }
        runIds.add(record.runId)
      }
      if (record.type === 'review-receipt') {
        const fields = ['receiptId', 'packetSha256', 'targetRevision', 'role', 'reviewerId', 'taskId', 'outputSha256', 'findingsSha256', 'oracleSha256', 'adapter']
        if (fields.some((field) => !validReviewReceiptField(record, field))) {
          throw new CliError('LEDGER_INVALID', `review receipt ${index} has invalid provenance`)
        }
        const identity = `${record.taskId}\0${record.reviewerId}`
        if (receiptIdentities.has(identity)) throw new CliError('LEDGER_INVALID', `duplicate review receipt ${record.taskId}`)
        receiptIdentities.add(identity)
      }
      if (!isDigest(record.digest) || !isDigest(record.previousDigest) || record.previousDigest !== previousDigest) {
        throw new CliError('LEDGER_INVALID', `ledger record ${index} breaks the digest chain`)
      }
    }
    const { digest, ...unsigned } = record
    if (sha256(stableStringify(unsigned)) !== digest) throw new CliError('LEDGER_INVALID', `ledger record ${index} digest does not match`)
    previousDigest = digest
  }
  if (legacyPrefix.length > 0 && !checkpointSeen) {
    throw new CliError('LEDGER_INVALID', 'legacy ledger prefix requires one v3 checkpoint')
  }
  if (!options.run) return { run: null, records }
  const run = records.find((entry) => entry.runId === options.run)

  if (!run) {
    throw new CliError('RUN_NOT_FOUND', `${options.run} is not recorded in the run ledger`)
  }

  return { run, records }
}

async function verifyRedEvidence(options) {
  if (!options.oracle || !options.map || !options.ledger || !options.run || !options.row) {
    throw new CliError('USAGE', 'red requires --oracle, --map, --ledger, --run and --row', 2)
  }

  const base = dirname(resolve(options.oracle))
  const snapshots = []
  const cardSnapshot = await snapshotOracleFile(options.oracle, base, 'RED_EVIDENCE_MISSING', 'Oracle', snapshots)
  const mapSnapshot = await snapshotOracleFile(options.map, base, 'EVIDENCE_INVALID', 'evidence map', snapshots)
  const card = cardSnapshot.bytes.toString('utf8')
  const rows = parseRows(card).map((row) => row.id)
  const map = parseSnapshotJson(mapSnapshot, 'EVIDENCE_INVALID')
  const entry = map?.rows?.[options.row]

  if (!rows.includes(options.row) || !entry) {
    throw new CliError('RED_EVIDENCE_MISSING', `${options.row} has no planned evidence in the locked card`)
  }

  assertEvidenceShape(options.row, entry)
  if (entry.kind !== 'test') {
    throw new CliError('RED_EVIDENCE_MISSING', `${options.row} must map to a test for VALID_RED`)
  }

  const run = (await ledgerRun(options, base, snapshots)).run
  if (!Number.isInteger(run.exitCode) || run.exitCode === 0 || run.grade !== 'reported' || run.adapter !== 'node-test' || !Array.isArray(run.tests)) {
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

  await assertSnapshots(snapshots, base, 'EVIDENCE_INVALID')
  process.stdout.write(`RED_EVIDENCE_VERIFIED ${options.row} ${entry.name}\n`)
}

async function verifyEvidence(options) {
  if (!options.oracle || !options.map || !options.ledger || !options.run) {
    throw new CliError('USAGE', 'evidence requires --oracle, --map, --ledger and --run', 2)
  }

  const base = dirname(resolve(options.oracle))
  const snapshots = []
  const oracleSnapshot = await snapshotOracleFile(options.oracle, base, 'EVIDENCE_INVALID', 'Oracle', snapshots)
  const mapSnapshot = await snapshotOracleFile(options.map, base, 'EVIDENCE_INVALID', 'evidence map', snapshots)
  const card = oracleSnapshot.bytes.toString('utf8')
  const map = parseSnapshotJson(mapSnapshot, 'EVIDENCE_INVALID')
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

  const approvedSources = approvedSourceIds(markdownLines(card))
  for (const row of contracts) {
    assertEvidenceShape(row.id, map.rows[row.id])
    assertNaEvidence(row, map.rows[row.id], approvedSources)
    assertEvidenceOwner(row, map.rows[row.id])
  }

  const pending = contracts.filter((row) => map.rows[row.id].kind === 'pending').map((row) => row.id)
  if (pending.length > 0 && phase === 'review') {
    throw new CliError('EVIDENCE_PENDING', `review requires completed visual evidence: ${pending.join(', ')}`)
  }

  const oracleSha256 = oracleSnapshot.sha256
  const { run, records } = await ledgerRun(options, base, snapshots)
  for (const row of contracts.filter((entry) => map.rows[entry.id].kind === 'visual')) {
    await verifyVisualArtifact(row, map.rows[row.id], options.map, oracleSha256, approvedSources, card, records, snapshots)
  }

  const needsRunEvidence = rows.filter((id) => map.rows[id].kind === 'test')

  if (needsRunEvidence.length > 0 && (run.grade !== 'reported' || run.adapter !== 'node-test' || !Array.isArray(run.tests))) {
    throw new CliError(
      'EVIDENCE_UNVERIFIABLE',
      `${run.runId} is graded ${run.grade} — test names cannot be verified without a parsed reporter`,
    )
  }
  if (
    !Number.isInteger(run.exitCode) ||
    run.exitCode !== 0 ||
    run.signal != null ||
    ((run.tests ?? []).length > 0 && (run.tests ?? []).some((test) => test.status !== 'passed'))
  ) {
    throw new CliError('EVIDENCE_UNVERIFIABLE', `${run.runId} is not a clean successful evidence run`)
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
  await assertSnapshots(snapshots, base, 'EVIDENCE_INVALID')
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

  const findingIds = new Set()
  for (const finding of findings) {
    if (finding?.id) {
      if (findingIds.has(finding.id))
        throw new CliError('FINDINGS_INVALID', `${source}: duplicate finding id ${finding.id}`)
      findingIds.add(finding.id)
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

function assertEmbeddedLedger(ledger) {
  if (!Array.isArray(ledger) || ledger.length === 0) {
    throw new CliError('REVIEW_PACKET_INVALID', 'review packet requires a non-empty embedded ledger')
  }
  const runIds = new Set()
  const receiptIdentities = new Set()
  let previousDigest = '0'.repeat(64)
  for (const [index, record] of ledger.entries()) {
    if (!record || typeof record !== 'object' || record.type === 'checkpoint' || !isDigest(record.digest) || !isDigest(record.previousDigest)) {
      throw new CliError('REVIEW_PACKET_INVALID', `embedded ledger record ${index} is malformed`)
    }
    const { digest, ...unsigned } = record
    if (record.previousDigest !== previousDigest || sha256(stableStringify(unsigned)) !== digest) {
      throw new CliError('REVIEW_PACKET_INVALID', `embedded ledger record ${index} breaks its digest chain`)
    }
    if (record.type === 'run') {
      if (!record.runId || runIds.has(record.runId) || !isDigest(record.oracleSha256) || typeof record.adapter !== 'string' || !record.adapter) {
        throw new CliError('REVIEW_PACKET_INVALID', `embedded run ${index} lacks a trusted identity`)
      }
      runIds.add(record.runId)
    }
    if (record.type === 'review-receipt') {
      const identity = `${record.taskId}\0${record.reviewerId}`
      if (
        record.schemaVersion !== 3 ||
        !isDigest(record.receiptId) ||
        !isDigest(record.packetSha256) ||
        !isDigest(record.targetRevision) ||
        !isDigest(record.outputSha256) ||
        !isDigest(record.findingsSha256) ||
        !isDigest(record.oracleSha256) ||
        typeof record.role !== 'string' ||
        typeof record.reviewerId !== 'string' ||
        typeof record.taskId !== 'string' ||
        record.adapter !== 'controller' ||
        receiptIdentities.has(identity)
      ) {
        throw new CliError('REVIEW_PACKET_INVALID', `embedded review receipt ${index} is malformed`)
      }
      receiptIdentities.add(identity)
    }
    previousDigest = digest
  }
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

async function assertReviewBinding(options) {
  if (!options.packet || !options.revision || !options.map || !options.ledger) {
    throw new CliError('REVIEW_EVIDENCE_REQUIRED', 'review requires --packet, --revision, --map and --ledger')
  }
  const base = dirname(resolve(options.oracle))
  const snapshots = []
  const oracleSnapshot = await snapshotOracleFile(options.oracle, base, 'REVIEW_PACKET_INVALID', 'Oracle', snapshots)
  const packetSnapshot = await snapshotOracleFile(options.packet, base, 'REVIEW_PACKET_INVALID', 'review packet', snapshots)
  const mapSnapshot = await snapshotOracleFile(options.map, base, 'EVIDENCE_INVALID', 'evidence map', snapshots)
  const externalLedger = await ledgerRun({ ...options, run: null }, base, snapshots)
  const packet = parseSnapshotJson(packetSnapshot, 'REVIEW_PACKET_INVALID')
  const packetSha256 = packetSnapshot.sha256
  const oracleRaw = oracleSnapshot.bytes.toString('utf8')
  const oracleSha256 = oracleSnapshot.sha256
  const canonicalChangeabilitySha256 = sha256(
    await readFile(resolve(dirname(fileURLToPath(import.meta.url)), '../references/changeability.md')),
  )
  if (packet?.oracle?.content !== oracleRaw || packet?.oracle?.sha256 !== oracleSha256) {
    throw new CliError('REVIEW_ORACLE_STALE', 'review packet Oracle bytes do not match the current locked Oracle')
  }
  if (
    packet?.schemaVersion !== 2 ||
    packet?.lock?.oracle?.sha256 !== oracleSha256 ||
    !isDigest(packet?.lockVerification?.manifestSha256) ||
    packet.lockVerification.manifestSha256 !== packet?.targetSnapshot?.lockManifestSha256 ||
    !isDigest(packet?.implementationDecision?.sha256) ||
    typeof packet?.implementationDecision?.content !== 'string' ||
    sha256(packet.implementationDecision.content) !== packet.implementationDecision.sha256 ||
    !Array.isArray(packet?.reviewPoints) ||
    !packet.reviewPoints.some((point) => point?.path === 'changeability.md' && point.sha256 === canonicalChangeabilitySha256) ||
    !Array.isArray(packet?.evidenceArtifacts)
  ) {
    throw new CliError('REVIEW_PACKET_INVALID', 'review packet lacks canonical schema-v2 lock, decision, review-point, or artifact bindings')
  }
  assertEmbeddedLedger(packet.ledger)
  for (const [index, artifact] of packet.evidenceArtifacts.entries()) {
    if (!artifact || typeof artifact.path !== 'string' || !isDigest(artifact.sha256)) {
      throw new CliError('REVIEW_PACKET_INVALID', `evidence artifact ${index} lacks path or digest`)
    }
    const snapshot = await assertRegularFileInside(base, artifact.path, 'packet', `evidenceArtifacts[${index}]`, snapshots)
    if (snapshot.sha256 !== artifact.sha256) {
      throw new CliError('REVIEW_PACKET_INVALID', `evidence artifact ${index} digest does not match`)
    }
  }
  const greenEntry = [...(packet?.state?.history ?? [])]
    .reverse()
    .find((history) => history.state === 'IMPLEMENTED_GREEN')
  const greenRun = packet?.ledger?.find((entry) => entry.runId === greenEntry?.runId)
  const targetRevision = packet?.targetSnapshot?.worktreeSha256
  if (!isDigest(targetRevision) || targetRevision !== options.revision || greenRun?.worktreeSha256 !== targetRevision || greenRun?.exitCode !== 0 || greenRun?.grade !== 'reported') {
    throw new CliError('REVIEW_PACKET_INVALID', 'review packet does not target the implementation worktree')
  }

  const findingSnapshots = [await snapshotOracleFile(options.file, base, 'FINDINGS_INVALID', 'review findings', snapshots)]
  if (options.intersect)
    findingSnapshots.push(await snapshotOracleFile(options.intersect, base, 'FINDINGS_INVALID', 'intersected review findings', snapshots))
  const documents = findingSnapshots.map((snapshot) => parseSnapshotJson(snapshot, 'FINDINGS_INVALID'))
  const allFindings = documents.flatMap((document) => document.findings ?? [])
  const ids = new Set(allFindings.map((finding) => finding.id))
  if (ids.size !== allFindings.length) throw new CliError('FINDINGS_INVALID', 'duplicate finding id')
  for (const document of documents) {
    if (document.schemaVersion !== 2)
      throw new CliError('FINDINGS_INVALID', 'new review verification requires findings schemaVersion 2')
    if (!REVIEWER_ROLES.includes(document.reviewerRole) || !document.reviewerId)
      throw new CliError('FINDINGS_INVALID', 'new review verification requires reviewerRole and reviewerId')
    if (document.packetSha256 !== packetSha256)
      throw new CliError('REVIEW_PACKET_INVALID', 'findings must cite the review packet sha256')
    if (document.targetRevision !== options.revision) {
      throw new CliError('REVIEW_REVISION_MISMATCH', 'findings must cite the target implementation worktree')
    }
    const receipt = document.orchestrationReceipt
    const output = { ...document }
    delete output.orchestrationReceipt
    if (
      !receipt ||
      typeof receipt !== 'object' ||
      receipt.packetSha256 !== packetSha256 ||
      receipt.targetRevision !== options.revision ||
      receipt.role !== document.reviewerRole ||
      typeof receipt.taskId !== 'string' ||
      !receipt.taskId ||
      !isDigest(receipt.outputSha256) ||
      receipt.outputSha256 !== sha256(stableStringify(output))
    ) {
      throw new CliError('REVIEWER_EVIDENCE_INVALID', 'review findings require a bound orchestration receipt')
    }
    const receiptEvent = externalLedger.records.find(
      (event) =>
        event.type === 'review-receipt' &&
        event.taskId === receipt.taskId &&
        event.reviewerId === document.reviewerId,
    )
    if (
      !receiptEvent ||
      receiptEvent.packetSha256 !== packetSha256 ||
      receiptEvent.targetRevision !== options.revision ||
      receiptEvent.role !== document.reviewerRole ||
      receiptEvent.taskId !== receipt.taskId ||
      receiptEvent.outputSha256 !== receipt.outputSha256 ||
      receiptEvent.findingsSha256 !== sha256(findingSnapshots[documents.indexOf(document)].bytes) ||
      receiptEvent.oracleSha256 !== oracleSha256 ||
      receiptEvent.adapter !== 'controller'
    ) {
      throw new CliError('REVIEWER_EVIDENCE_INVALID', 'review findings require an independently ledger-bound review receipt')
    }
  }
  if (documents.length > 1 && documents[0].reviewerId === documents[1].reviewerId)
    throw new CliError('REVIEWER_NOT_INDEPENDENT', 'intersected review samples require distinct reviewer identities')
  if (
    documents.length > 1 &&
    documents.some((document) => document.sampleRisk === 'High') &&
    (documents[0].orchestrationReceipt.taskId === documents[1].orchestrationReceipt.taskId ||
      documents[0].orchestrationReceipt.outputSha256 === documents[1].orchestrationReceipt.outputSha256 ||
      documents[0].reviewerRole === documents[1].reviewerRole)
  )
    throw new CliError('REVIEWER_NOT_INDEPENDENT', 'High-risk intersected reviews require distinct receipt task identities')
  const byId = new Map(
    documents.flatMap((document) => (document.findings ?? []).map((finding) => [finding.id, document.reviewerRole])),
  )
  const map = parseSnapshotJson(mapSnapshot, 'EVIDENCE_INVALID')
  if (stableJson(packet.evidence) !== stableJson(map)) {
    throw new CliError('REVIEW_EVIDENCE_STALE', 'review evidence map must match the review packet evidence')
  }

  for (const entry of Object.values(map?.rows ?? {})) {
    if (entry?.kind === 'reviewer') {
      if (!ids.has(entry.finding))
        throw new CliError('REVIEW_FINDING_UNKNOWN', `${entry.finding} is not in review findings`)
      if (byId.get(entry.finding) !== entry.role)
        throw new CliError(
          'REVIEWER_EVIDENCE_INVALID',
          `${entry.finding} belongs to ${byId.get(entry.finding)}, not ${entry.role}`,
        )
    }
  }
  await assertSnapshots(snapshots, base, 'REVIEW_PACKET_INVALID')
}

async function verifyReview(options) {
  await assertReviewBinding(options)
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
