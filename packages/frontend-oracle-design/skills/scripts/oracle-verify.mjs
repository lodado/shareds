#!/usr/bin/env node

import { Buffer } from 'node:buffer'
import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { isTrustedAdapter } from './oracle-adapters.mjs'
import { generateFromDocument, TAXONOMY_FAMILIES } from './oracle-frames.mjs'
import {
  assertSnapshotUnchanged,
  isPathInside,
  scanSideEffects,
  sha256,
  SIDE_EFFECT_CATEGORIES,
  SIDE_EFFECT_EXEMPTION_MARKER,
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
  'lock',
  'blind-map',
]

/** 값 없는 플래그 — `card --ir`, `card --repo-policies`, `scan --side-effects`. */
const BOOLEAN_FLAGS = new Set(['ir', 'repo-policies', 'side-effects'])

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
  { kind: '중복', tokens: ['중복', 'duplicate'] },
  { kind: '오류', tokens: ['오류', '에러', 'error'] },
  { kind: '재시도', tokens: ['재시도', 'retry'] },
  { kind: '빈-데이터', tokens: ['빈 ', '0건', 'empty'] },
  { kind: '로딩', tokens: ['로딩', 'loading'] },
  { kind: 'out-of-order', tokens: ['out-of-order', '역전'] },
  { kind: '취소', tokens: ['취소', '이탈', 'cancel'] },
]

// 카드 schema token은 문서 언어와 무관하게 판정한다 — 한국어 카드와 영어 카드가 같은 검사를 통과한다.
const SOURCE_COLUMNS = {
  jurisdiction: ['관할', 'Jurisdiction'],
  location: ['위치·version', 'Location·version'],
  approval: ['승인 상태', 'Approval status'],
}
const POLICY_SECTION_TITLES = ['결정된 정책', 'Decided policies']
const SOURCE_MARKERS = ['(출처:', '(source:']
const ROW_MARKERS = ['(행:', '(rows:']

function columnOf(record, names) {
  const key = names.find((name) => record[name] !== undefined)
  return key === undefined ? '' : record[key]
}

function markedText(line, markers) {
  for (const marker of markers) {
    const value = betweenMarkers(line, marker, ')')
    if (value) return value
  }
  return ''
}

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

/** 거절 코드마다 다음 합법 행동 한 줄 — confirmation-lock.md·green-review.md의 처방과 같은 내용이다. */
const NEXT_ACTIONS = {
  CARD_LINT_FAILED: 'fix the card structure the issues name before the lock — never reword to bypass a check',
  CARD_UNREADABLE: 'pass the locked oracle.md path with --oracle',
  EVIDENCE_INVALID: 'regenerate with `evidence-scaffold` from the locked card and fill only the values',
  EVIDENCE_MISSING_ROW: 'regenerate with `evidence-scaffold` — the row set diverged from the locked card',
  EVIDENCE_UNKNOWN_ROW: 'regenerate with `evidence-scaffold` — the row set diverged from the locked card',
  EVIDENCE_MISSING_PATH: 'name the [PATH*] test in evidence.json paths — a skipped path blocks GREEN like a skipped row',
  EVIDENCE_MISSING_FRAME: 'name the covered frame case in evidence.json frames, or disposition the frame as independent()',
  SEQUENCE_EVIDENCE_MISSING: 'map the fast-check sequence test in evidence.json sequence, or record why fast-check is unavailable',
  EVIDENCE_OWNER_INVALID: 'match the evidence kind to the row tier — HARD→test, RELATIONAL→visual|pending, JUDGMENT→designer',
  EVIDENCE_NOT_IN_RUN: 'attach the reporter (`--adapter node-test --report <path>`) and re-run; never invent a test name',
  EVIDENCE_UNVERIFIABLE: 'the run is exit-only — re-run with `--adapter node-test --report <path>`',
  EVIDENCE_PENDING: 'complete the pending visual evidence before REVIEW_VERIFIED — IMPLEMENTED_GREEN is the honest stop',
  EVIDENCE_STALE: 'a frozen name changed after VALID_RED — spend the harness budget and record a new reported RED',
  RED_EVIDENCE_MISSING: 'run the mapped test with the reporter so the failing name is recorded',
  RED_EVIDENCE_UNVERIFIABLE: 'an exit-only or setup failure is not RED — re-run with the reporter and a failing mapped row',
  RUN_NOT_FOUND: 'cite a runId that exists in runs.jsonl — run `exec` again if needed',
  RUN_NOT_RED: 'the cited run must fail on the mapped row — write the test, run `red --row <row>`',
  FINDINGS_INVALID: 'findings must use the six classifications and cite real card rows — regenerate the findings file',
  FINDINGS_BLOCKING: 'fix the PRODUCT_DEFECT findings and re-verify, or route a POLICY_GAP to NEEDS_DECISION',
  REVIEW_PACKET_STALE: 'regenerate `review-packet` — the input changed since the packet was built',
  REVIEW_REVISION_MISMATCH: 'pass the targetRevision printed in review-input.json',
  REVIEWER_NOT_INDEPENDENT: 'High risk needs two artifacts from different reviewerIds',
  VISUAL_EVIDENCE_INVALID: 'the artifact must be a schema-v3 receipt inside the Oracle directory with matching digests',
  NONDETERMINISM_FOUND: 'inject the source through a seam, or record `oracle:nondeterminism <reason>` next to the token',
  ASSUMPTION_DRIFT: 're-run the landmine sweep for the drifted packages in a new revision — this is not a lock failure',
  LOCK_INVALID: 'FAIL — the determinism judgment is impossible; do not substitute LLM judgment',
  LEDGER_INVALID: 'do not edit runs.jsonl — recover from `oracle-run.mjs status --json`',
  EVIDENCE_MAPPING_DISPUTED:
    'the blind read and evidence.json disagree — re-read the disputed rows; a test that enforces a different row is EVIDENCE_GAP, never a mapping edit',
  BLIND_MAP_INVALID: 'the blind map must be JSON of { "<test name>": "O1" | ["O1", "O2"] } written by a reviewer who never saw evidence.json',
  SIDE_EFFECT_UNOWNED:
    'add the row whose side-effect column owns that category, or exempt the line with `oracle:side-effect <row|reason>` — an unrequested effect is PRODUCT_DEFECT, a missing row is POLICY_GAP',
  SIDE_EFFECT_EXEMPTION_INVALID: 'write `oracle:side-effect O3` (a real row) or `oracle:side-effect <reason>` — a bare marker exempts nothing',
}

/** 인수 오류에는 처방이 없다. */
const NO_NEXT_ACTION = new Set(['USAGE', 'INPUT_UNREADABLE'])

function nextActionLine(code) {
  if (NO_NEXT_ACTION.has(code) || !NEXT_ACTIONS[code]) return ''
  return `next: ${NEXT_ACTIONS[code]}\n`
}

function parseOptions(args) {
  const options = { path: [], source: [] }

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    const name = flag.startsWith('--') ? flag.slice(2) : ''
    if (BOOLEAN_FLAGS.has(name)) {
      options[name] = true
      continue
    }
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

// `<oracle-id>.P7`처럼 점이 앞선 id는 다른 오라클의 정책이다 — 이 카드의 P*로 세지 않는다
function policyIds(value) {
  return [...new Set(value.match(/(?<![\w.])P\d+\b/g) ?? [])]
}

function rowIds(value) {
  return [...new Set(value.match(/\b[OD]\d+\b/g) ?? [])]
}

const WITNESS_PATTERN = /\b(code|constraint|type|docs)\(([^)]+)\)/
const LOOKUP_PATTERN = /\b(docs|code|issue|changelog)\(([^)]+)\)/

const DISPOSITION_ENUM = {
  sweep: 'disposition must be covered(O*) | impossible: mechanism — witness | needs-decision: question | needs-evidence: fact — lookup',
  deviation:
    'disposition must be covered(O*) | impossible: mechanism — witness | needs-decision: question | needs-evidence: fact — lookup',
  frame:
    'disposition must be covered(O*) | independent(O*): reason | impossible: mechanism — witness | needs-decision: question | needs-evidence: fact — lookup',
  landmine:
    'disposition must be covered(O*) | impossible: mechanism — witness | needs-decision: question | needs-evidence: fact — lookup | N/A reason',
}

/** disposition 셀 하나를 구조로 — sweep·deviation·frame·landmine 4계열이 같은 파서를 쓴다. IR의 disposition 필드다. */
function parseDisposition(value) {
  const text = value.trim()
  if (isEmptyCell(text)) return { type: 'empty', text }
  const cited = text.match(/^(covered|independent)\(([^)]+)\)(?::\s*(\S.*))?$/)
  if (cited) {
    const [, verb, ids, reason] = cited
    const subrefs = [...new Set(ids.match(/\b[OD]\d+\.(?:Then|Never)\b/g) ?? [])]
    return { type: verb, rows: rowIds(ids), subrefs, reason: reason ?? null, text }
  }
  if (/^impossible:\s*\S/.test(text)) {
    const witness = text.match(WITNESS_PATTERN)
    return { type: 'impossible', witness: witness ? { kind: witness[1], ref: witness[2].trim() } : null, text }
  }
  if (/^needs-decision:\s*\S/.test(text)) return { type: 'needs-decision', text }
  if (/^needs-evidence:\s*\S/.test(text)) {
    const lookup = text.match(LOOKUP_PATTERN)
    return { type: 'needs-evidence', lookup: lookup ? { kind: lookup[1], ref: lookup[2].trim() } : null, text }
  }
  if (/^N\/A/i.test(text)) return { type: 'na', text }
  return { type: 'unknown', text }
}

/** code()·constraint() witness는 실재를 검사한다. type()·docs()는 존재만 — 관련성은 역-2-sample 소관. */
async function checkWitness(witness, context, label) {
  if (witness.kind === 'constraint') {
    if (context.sourceIds.has(witness.ref)) return []
    return [`impossible-witness-invalid: ${label}: constraint(${witness.ref}) is not a registered Source Registry ID`]
  }
  if (witness.kind === 'code') {
    const match = witness.ref.match(/^([^#]+)#L(\d+)(?:-L?(\d+))?$/)
    if (!match) return [`impossible-witness-invalid: ${label}: code() must be code(<repo-path>#L<a>-L<b>)`]
    const [, path, from, to] = match
    const content = await readFile(resolve(context.rootDirectory, path), 'utf8').catch(() => null)
    if (content === null) {
      return [`impossible-witness-invalid: ${label}: code(${path}) does not exist under ${context.rootDirectory}`]
    }
    const total = content.split('\n').length
    const first = Number(from)
    const last = Number(to ?? from)
    if (first < 1 || last > total || first > last) {
      return [`impossible-witness-invalid: ${label}: code(${witness.ref}) line range exceeds the file (${total} lines)`]
    }
  }
  return []
}

/**
 * 4계열 공통 판정 검사 — 발행 코드는 계열별로 유지하고(`sweep-disposition` 등), witness·lookup 코드는 전역이다.
 * context: { code, rowCode, label, enumText, seenRows, sourceIds, rootDirectory, allowIndependent, allowNa, frameId }
 */
async function checkDisposition(parsed, context) {
  const issues = []
  const { code, rowCode, label, enumText } = context

  if (parsed.type === 'covered' || parsed.type === 'independent') {
    if (parsed.type === 'independent' && !context.allowIndependent) return [`${code}: ${label}: ${enumText}`]
    if (parsed.rows.length === 0) issues.push(`${code}: ${label}: ${parsed.type}() must cite O*/D* rows`)
    for (const id of parsed.rows) {
      if (!context.seenRows.has(id)) issues.push(`${rowCode}: ${label}: ${id} is not a contract row`)
    }
    if (parsed.type === 'independent' && !parsed.reason) {
      issues.push(`${code}: ${label}: independent() must name why the choices cannot change the outcome`)
    }
    if (parsed.type === 'independent' && context.frameId && !context.frameId.startsWith('F')) {
      issues.push(`${code}: ${label}: independent() applies to F* combination frames only`)
    }
    if (parsed.type === 'covered' && parsed.reason) {
      issues.push(`${code}: ${label}: covered() takes no reason — use independent() for a claim of independence`)
    }
    return issues
  }
  if (parsed.type === 'impossible') {
    if (!parsed.witness) {
      return [
        `impossible-witness-missing: ${label}: impossible needs a witness — code(<path>#La-Lb) | constraint(S*) | type(<expr>) | docs(<anchor>)`,
      ]
    }
    return checkWitness(parsed.witness, context, label)
  }
  if (parsed.type === 'needs-decision') return []
  if (parsed.type === 'needs-evidence') {
    if (parsed.lookup) return []
    return [
      `needs-evidence-lookup-missing: ${label}: needs-evidence needs a lookup — docs(<anchor>) | code(<path>) | issue(<url>) | changelog(<ref>)`,
    ]
  }
  if (parsed.type === 'na' && context.allowNa) return []
  return [`${code}: ${label}: ${enumText}`]
}

/** 카드가 `.ai/oracles/<id>/` 아래에 있으면 레포 루트, 아니면 카드 디렉터리 — code() witness의 기준. */
function oracleRootDirectory(cardPath) {
  const cardDirectory = dirname(resolve(cardPath))
  const segments = cardDirectory.split(/[\\/]/)
  const markerIndex = segments.lastIndexOf('.ai')
  return markerIndex === -1 ? cardDirectory : segments.slice(0, markerIndex).join('/')
}

function tableCells(lines, section, header) {
  return sectionLines(lines, section)
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => splitRow(line.trim()))
    .filter((cells) => cells[0] !== header && !/^:?-+:?$/.test(cells[0]))
}

/** 랜드마인은 패키지별 다중 섹션 — 헤딩에서 패키지 이름을 함께 거둔다. */
function landmineTable(lines) {
  const rows = []
  let pkg = null
  for (const line of lines) {
    if (line.startsWith('## ')) {
      pkg = line.startsWith('## Dependency landmines') ? line.replace(/^## Dependency landmines\s*[—-]?\s*/, '').trim() : null
      continue
    }
    if (pkg === null || !line.trim().startsWith('|')) continue
    const cells = splitRow(line.trim())
    if (cells[0] === 'Landmine' || /^:?-+:?$/.test(cells[0])) continue
    rows.push({ pkg, cells })
  }
  return rows
}

/**
 * Judgment Space IR — 카드 바이트에서 파생하는 정규화 레코드. 저작 표면은 markdown뿐이고 이 함수는 언제나 같은 입력에
 * 같은 출력을 낸다. id는 삽입에 안정한 파생 id: sweep:P3×P1 · deviation:P1:wrong-timing-order · frame:F18 · landmine:<셀>.
 */
export function buildJudgmentSpace(cardText) {
  const lines = markdownLines(cardText)
  const records = []

  for (const [pair = '', disposition = ''] of tableCells(lines, 'Interaction sweep', 'Pair')) {
    const parts = pair
      .split('×')
      .map((part) => part.trim())
      .filter(Boolean)
    const tokens = parts.map((part) => policyIds(part)[0] ?? part.replace(/\s*\(.*\)\s*$/, ''))
    records.push({
      id: `sweep:${tokens.join('×')}`,
      origin: { kind: 'interaction', pair, policies: policyIds(pair) },
      disposition: parseDisposition(disposition),
    })
  }

  for (const [policy = '', type = '', disposition = ''] of tableCells(lines, 'Deviations', 'Policy')) {
    const types = type === 'static' ? ['unsafe-provided', 'wrong-timing-order', 'stopped-early-applied-long'] : [type]
    for (const deviationType of types) {
      records.push({
        id: `deviation:${policy}:${deviationType}`,
        origin: { kind: 'deviation', policy, type: deviationType, shorthand: type === 'static' },
        disposition: parseDisposition(disposition),
      })
    }
  }

  for (const [frameId = '', disposition = ''] of tableCells(lines, 'Frame dispositions', 'Frame')) {
    records.push({ id: `frame:${frameId}`, origin: { kind: 'frame', frame: frameId }, disposition: parseDisposition(disposition) })
  }

  for (const { pkg, cells } of landmineTable(lines)) {
    const [landmine = '', citation = '', disposition = ''] = cells
    records.push({
      id: `landmine:${landmine}`,
      origin: { kind: 'landmine', package: pkg, citation },
      disposition: parseDisposition(disposition),
    })
  }

  return records
}

/**
 * surface 토큰 = 백틱 span, camelCase·PascalCase 식별자, snake_case, 경로꼴(`a/b`). 하이픈 산문(out-of-order)은
 * 영어 단어지 표면이 아니라서 제외한다 — 모든 카드가 공유하는 낱말은 counterpart를 말해주지 않는다.
 */
function surfaceTokens(text) {
  const tokens = new Set()
  for (const span of text.match(/`[^`]+`/g) ?? []) tokens.add(span.slice(1, -1).trim().toLowerCase())
  for (const word of text.match(/[a-z][\w/.]{3,}/gi) ?? []) {
    const camel = /^[a-z]+[A-Z]\w*$/.test(word) || /^[A-Z][a-z]+[A-Z]\w*$/.test(word)
    const snake = /^\w+$/.test(word) && word.includes('_')
    const pathLike = /^[\w.]+\/[\w./]+$/.test(word)
    if (camel || snake || pathLike) tokens.add(word.toLowerCase())
  }
  return tokens
}

function policyLines(lines) {
  const entries = []
  let inPolicySection = false
  for (const line of lines) {
    if (line.startsWith('## ')) inPolicySection = POLICY_SECTION_TITLES.some((title) => line.includes(title))
    if (!inPolicySection || !line.startsWith('- ')) continue
    const id = policyIdFromLine(line)
    if (id) entries.push({ id, line, rows: rowIds(markedText(line, ROW_MARKERS)) })
  }
  return entries
}

/** 정책마다 surface 토큰 = 정책 문장 + 인용 행의 Given·When·Then·Never 셀. */
function policySurfaces(cardText) {
  const lines = markdownLines(cardText)
  const rowText = new Map(parseRows(lines).map((row) => [row.id, Object.values(row.cells).join(' ')]))
  return policyLines(lines).map((policy) => ({
    id: policy.id,
    tokens: surfaceTokens([policy.line, ...policy.rows.map((rowId) => rowText.get(rowId) ?? '')].join(' ')),
  }))
}

/**
 * 같은 레포의 다른 잠긴 카드가 결정한 정책 중 이 카드와 surface를 공유하는 것 — 스윕 counterpart 후보.
 * 판정은 여전히 사람·LLM의 disposition이고, 이 함수는 우주를 넓힐 뿐이다.
 */
async function repoPolicyCandidates(cardPath, cardText) {
  const oracleDirectory = dirname(resolve(cardPath))
  const oraclesRoot = dirname(oracleDirectory)
  const own = policySurfaces(cardText)
  const candidates = []

  const entries = await readdir(oraclesRoot, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() || join(oraclesRoot, entry.name) === oracleDirectory) continue
    const siblingDirectory = join(oraclesRoot, entry.name)
    const bytes = await readFile(join(siblingDirectory, 'oracle.md')).catch(() => null)
    const lock = await readJson(join(siblingDirectory, 'oracle.lock.json'), 'LOCK_INVALID').catch(() => null)
    if (!bytes || lock?.oracle?.sha256 !== sha256(bytes)) continue

    for (const theirs of policySurfaces(bytes.toString('utf8'))) {
      for (const mine of own) {
        const shared = [...mine.tokens].filter((token) => theirs.tokens.has(token))
        if (shared.length === 0) continue
        candidates.push({ policy: mine.id, oracle: entry.name, counterpart: theirs.id, shared: shared.sort() })
      }
    }
  }

  return candidates.sort((left, right) => `${left.policy}${left.oracle}${left.counterpart}`.localeCompare(`${right.policy}${right.oracle}${right.counterpart}`))
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

  // 데이터 뷰 — lint 없이 파생 IR을 덤프한다. 같은 바이트면 같은 출력.
  if (options.ir) {
    process.stdout.write(`${stableStringify(buildJudgmentSpace(card))}\n`)
    return
  }

  // 오라클 간 기억 — 형제 카드의 잠긴 정책 중 surface를 공유하는 counterpart 후보. 정보일 뿐 게이트가 아니다.
  if (options['repo-policies']) {
    const candidates = await repoPolicyCandidates(options.oracle, card)
    process.stdout.write(`REPO_POLICY_CANDIDATES ${candidates.length}\n`)
    if (candidates.length > 0) {
      process.stdout.write('# candidates — disposition each as a sweep counterpart; never paste them as rows\n')
    }
    for (const candidate of candidates) {
      process.stdout.write(
        `| ${candidate.policy} × ${candidate.oracle}.${candidate.counterpart} | needs-evidence: shared surface \`${candidate.shared.join(
          '`, `',
        )}\` — docs(.ai/oracles/${candidate.oracle}/oracle.md#${candidate.counterpart}) |\n`,
      )
    }
    return
  }

  const lines = markdownLines(card)
  const rows = parseRows(lines)
  const issues = []
  const rootDirectory = oracleRootDirectory(options.oracle)

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
  for (const names of [['Kind'], SOURCE_COLUMNS.jurisdiction, SOURCE_COLUMNS.location, SOURCE_COLUMNS.approval]) {
    if (!names.some((header) => sourceHeaders?.includes(header))) {
      issues.push(`source-registry-header: Source Registry must include a \`${names[0]}\` column`)
    }
  }
  const sourceById = new Map()
  for (const source of sources) {
    if (sourceById.has(source.ID)) issues.push(`duplicate-source: ${source.ID}: Source Registry ID is repeated`)
    sourceById.set(source.ID, source)
    if (!SOURCE_KINDS.includes(source.Kind)) {
      issues.push(`source-kind: ${source.ID}: ${source.Kind || '(empty)'} must be one of ${SOURCE_KINDS.join(', ')}`)
    }
    if (source.Kind !== 'implementation-reference' && !isApproved(columnOf(source, SOURCE_COLUMNS.approval))) {
      issues.push(`source-unapproved: ${source.ID}: authoritative sources must be approved before lock`)
    }
    for (const [names, code] of [
      [SOURCE_COLUMNS.jurisdiction, 'source-jurisdiction'],
      [SOURCE_COLUMNS.location, 'source-location-version'],
      [SOURCE_COLUMNS.approval, 'source-approval-status'],
    ]) {
      if (isEmptyCell(columnOf(source, names)))
        issues.push(`${code}: ${source.ID}: ${names[0]} must have a concrete value`)
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

  if (rows.some((row) => cellOf(row, '증거 계층', 'Evidence tier') === 'RELATIONAL')) {
    const authorization = confirmation.find((line) => /^- Visual QA authorization:/i.test(line.trim()))
    if (!authorization || !/:\s*(?:approved|declined)\s*$/i.test(authorization.trim())) {
      issues.push('visual-qa-authorization: RELATIONAL rows require `- Visual QA authorization: approved | declined`')
    }
  }

  const policies = new Map()
  let inPolicySection = false
  lines.forEach((line, index) => {
    if (line.startsWith('## ')) inPolicySection = POLICY_SECTION_TITLES.some((title) => line.includes(title))
    if (!inPolicySection || !line.startsWith('- ')) return

    const sourceText = markedText(line, SOURCE_MARKERS)
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
          else if (
            source.Kind !== 'implementation-reference' &&
            !isApproved(columnOf(source, SOURCE_COLUMNS.approval))
          ) {
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

    const linked = markedText(line, ROW_MARKERS)
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
      if (isEmptyCell(cellOf(row, '부작용', 'Side effects')))
        issues.push(`empty-side-effect: ${row.id}: side effect count is empty`)
    } else {
      if (isEmptyCell(cellOf(row, '계약'))) {
        issues.push(`empty-visual-contract: ${row.id}: visual contract is empty`)
      }
      const source = cellOf(row, '출처')
      if (isEmptyCell(source)) issues.push(`visual-source: ${row.id}: visual contract has no source`)
      const cited = source.match(/\bS\d+\b/g) ?? []
      const approvedAuthority = cited.some((id) => {
        const registered = sourceById.get(id)
        return (
          registered &&
          registered.Kind !== 'implementation-reference' &&
          isApproved(columnOf(registered, SOURCE_COLUMNS.approval))
        )
      })
      if (!approvedAuthority) {
        issues.push(
          `visual-source: ${row.id}: visual contract requires an approved non-implementation Source Registry source`,
        )
      }
      for (const id of cited) {
        if (!sourceIds.has(id)) issues.push(`unknown-source: ${row.id}: ${id} is not in Source Registry`)
      }
      const tier = cellOf(row, '증거 계층', 'Evidence tier')
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

  // Invariants 섹션도 선택이다 — 없어도 lint를 막지 않고, 있으면 구조를 검증한다.
  const invariants = sectionLines(lines, 'Invariants')
  const invariantIds = new Set()

  if (invariants.length > 0) {
    const invariantRows = invariants
      .filter((line) => line.trim().startsWith('|'))
      .map((line) => splitRow(line.trim()))
      .filter((cells) => cells[0] !== 'ID' && !/^:?-+:?$/.test(cells[0]))

    if (invariantRows.length === 0) {
      issues.push('invariant-rows: Invariants must include an ID/Policy/Invariant/Observable-basis table')
    }

    for (const cells of invariantRows) {
      const [id, policy = '', invariant = '', basis = ''] = cells
      if (!/^I\d+$/.test(id ?? '')) {
        issues.push(`invariant-id: "${id}": invariant must have an I* ID`)
        continue
      }
      invariantIds.add(id)
      if (isEmptyCell(invariant)) issues.push(`invariant-empty: ${id}: invariant text is empty`)
      if (isEmptyCell(basis)) issues.push(`invariant-basis: ${id}: observable basis is empty`)
      if (!isEmptyCell(policy) && policy !== '—') {
        const cited = policyIds(policy)
        if (cited.length === 0) {
          issues.push(`invariant-policy-unknown: ${id}: "${policy}" is neither a P* ID nor —`)
        }
        for (const policyId of cited) {
          if (!policies.has(policyId)) {
            issues.push(`invariant-policy-unknown: ${id}: ${policyId} is not a decided policy`)
          }
        }
      }
    }
  }

  // Deviations 섹션도 선택이다 — 있으면 P*×4 STPA 유형 커버리지와 disposition을 검증한다.
  const DEVIATION_TYPES = ['not-provided', 'unsafe-provided', 'wrong-timing-order', 'stopped-early-applied-long']
  // 4계열 disposition 공통 컨텍스트 — 행 실재, 등록 출처(constraint witness), code() witness의 기준 디렉터리
  const dispositionContext = { seenRows, sourceIds: new Set(sourceById.keys()), rootDirectory }
  // lint는 승인된 최종 카드에만 돈다 — 살아남은 needs-decision·needs-evidence는 lock 차단(disposition-open)
  const openCells = []
  const checkCell = async (value, context) => {
    const parsed = parseDisposition(value)
    if (parsed.type === 'needs-decision' || parsed.type === 'needs-evidence') {
      openCells.push(`${context.label}: ${parsed.type}`)
    }
    return checkDisposition(parsed, context)
  }

  const deviations = sectionLines(lines, 'Deviations')

  if (deviations.length > 0) {
    const deviationRows = deviations
      .filter((line) => line.trim().startsWith('|'))
      .map((line) => splitRow(line.trim()))
      .filter((cells) => cells[0] !== 'Policy' && !/^:?-+:?$/.test(cells[0]))

    if (deviationRows.length === 0) {
      issues.push('deviation-rows: Deviations must include a Policy/Type/Disposition table')
    }

    const typesByPolicy = new Map()
    for (const cells of deviationRows) {
      const [policy = '', type = '', disposition = ''] = cells
      if (!policies.has(policy)) {
        issues.push(`deviation-policy-unknown: "${policy}" is not a decided policy`)
        continue
      }
      if (type === 'static') {
        // 정적 정책 축약 — 한 줄이 timing·context·duration 세 유형을 impossible로 닫는다. not-provided는 별도.
        if (!/^impossible:\s*\S/.test(disposition.trim())) {
          issues.push(`deviation-disposition: ${policy} × static: shorthand requires impossible: <reason>`)
          continue
        }
        issues.push(
          ...(await checkCell(disposition, {
            ...dispositionContext,
            code: 'deviation-disposition',
            rowCode: 'deviation-row-unknown',
            label: `${policy} × static`,
            enumText: DISPOSITION_ENUM.deviation,
          })),
        )
        if (!typesByPolicy.has(policy)) typesByPolicy.set(policy, new Set())
        for (const closed of ['unsafe-provided', 'wrong-timing-order', 'stopped-early-applied-long']) {
          typesByPolicy.get(policy).add(closed)
        }
        continue
      }
      if (!DEVIATION_TYPES.includes(type)) {
        issues.push(`deviation-disposition: ${policy}: "${type}" is not a deviation type (${DEVIATION_TYPES.join(' | ')})`)
        continue
      }
      if (!typesByPolicy.has(policy)) typesByPolicy.set(policy, new Set())
      typesByPolicy.get(policy).add(type)

      const value = disposition.trim()
      if (isEmptyCell(value)) {
        issues.push(`deviation-disposition: ${policy} × ${type}: disposition is empty`)
        continue
      }
      issues.push(
        ...(await checkCell(value, {
          ...dispositionContext,
          code: 'deviation-disposition',
          rowCode: 'deviation-row-unknown',
          label: `${policy} × ${type}`,
          enumText: DISPOSITION_ENUM.deviation,
        })),
      )
    }

    for (const policyId of policies.keys()) {
      for (const type of DEVIATION_TYPES) {
        if (!typesByPolicy.get(policyId)?.has(type)) {
          issues.push(`deviation-type-missing: ${policyId}: ${type} has no disposition`)
        }
      }
    }
  }

  // Dependency landmines 섹션도 선택이다 — 있으면 인용·disposition을 검증한다. 패키지별 다중 섹션 허용.
  const landmineRows = []
  {
    let inLandmines = false
    for (const line of lines) {
      if (line.startsWith('## ')) {
        inLandmines = line.startsWith('## Dependency landmines')
        continue
      }
      if (!inLandmines || !line.trim().startsWith('|')) continue
      const cells = splitRow(line.trim())
      if (cells[0] === 'Landmine' || /^:?-+:?$/.test(cells[0])) continue
      landmineRows.push(cells)
    }
  }

  for (const cells of landmineRows) {
    const [landmine = '', citation = '', disposition = ''] = cells
    if (isEmptyCell(citation.trim())) {
      issues.push(`landmine-citation-missing: "${landmine}": a docs anchor, issue URL, or changelog entry is required`)
    }
    const value = disposition.trim()
    if (isEmptyCell(value)) {
      issues.push(`landmine-undispositioned: "${landmine}": disposition is empty`)
      continue
    }
    issues.push(
      ...(await checkCell(value, {
        ...dispositionContext,
        code: 'landmine-undispositioned',
        rowCode: 'landmine-row-unknown',
        label: `"${landmine}"`,
        enumText: DISPOSITION_ENUM.landmine,
        allowNa: true,
      })),
    )
  }

  // Interaction sweep 섹션도 선택이다 — 있으면 disposition enum·행 인용·정책 커버리지를 검증한다.
  const sweep = sectionLines(lines, 'Interaction sweep')

  if (sweep.length > 0) {
    const sweepRows = sweep
      .filter((line) => line.trim().startsWith('|'))
      .map((line) => splitRow(line.trim()))
      .filter((cells) => cells[0] !== 'Pair' && !/^:?-+:?$/.test(cells[0]))

    if (sweepRows.length === 0) {
      issues.push('sweep-rows: Interaction sweep must include a Pair/Disposition table')
    }

    const sweptPolicies = new Set()
    for (const cells of sweepRows) {
      const [pair = '', disposition = ''] = cells
      for (const policyId of policyIds(pair)) sweptPolicies.add(policyId)

      const value = disposition.trim()
      if (isEmptyCell(value)) {
        issues.push(`sweep-cell-empty: "${pair}": disposition is empty`)
        continue
      }

      issues.push(
        ...(await checkCell(value, {
          ...dispositionContext,
          code: 'sweep-disposition',
          rowCode: 'sweep-row-unknown',
          label: `"${pair}"`,
          enumText: DISPOSITION_ENUM.sweep,
        })),
      )
    }

    for (const policyId of policies.keys()) {
      if (!sweptPolicies.has(policyId)) {
        issues.push(`sweep-policy-missing: ${policyId} does not appear in any sweep pair`)
      }
    }
  }

  // Case space 섹션 — 있으면 프레임을 결정적으로 재생성해 disposition 완전성을 대조한다. 열거는 기계, 판정만 사람.
  const generated = generateFromDocument(lines.join('\n'))

  if (generated) {
    const declaredFamilies = new Set(generated.caseSpace.families.map((entry) => entry.family))
    for (const family of TAXONOMY_FAMILIES) {
      if (!declaredFamilies.has(family)) {
        issues.push(`family-undispositioned: ${family}: declare dimensions or exclude it with a reason`)
      }
    }
    for (const family of declaredFamilies) {
      if (!TAXONOMY_FAMILIES.includes(family)) issues.push(`family-unknown: ${family} is not a taxonomy family`)
    }

    // Touches 열 채택 시 — 인용 id는 실재해야 하고, 조합 가능한 차원은 인용하거나 independent 사유를 쓴다.
    const combinableFamilies = generated.caseSpace.families.filter((entry) => !entry.excluded && entry.dimension)
    const touchesAdopted = combinableFamilies.some(
      (entry) => entry.touches && (entry.touches.independent || entry.touches.ids.length > 0),
    )
    if (touchesAdopted) {
      for (const entry of combinableFamilies) {
        if (entry.touches?.independent) continue
        if (entry.touches?.ids?.length > 0) {
          for (const id of entry.touches.ids) {
            const known = id.startsWith('P') ? policies.has(id) : invariantIds.has(id)
            if (!known) issues.push(`touches-unknown: ${entry.dimension}: ${id} is not a decided policy or invariant`)
          }
        } else if (entry.choices.filter((choice) => !choice.error).length >= 2) {
          issues.push(`touches-missing: ${entry.dimension}: cite the P*/I* it can affect or write independent: <reason>`)
        }
      }
    }

    if (generated.frames.length > 50) {
      issues.push(
        `case-space-too-wide: ${generated.frames.length} combinable frames — split the dimension or narrow the scope`,
      )
    }

    const generatedIds = new Set([
      ...generated.frames.map((frame) => frame.id),
      ...generated.errorFrames.map((frame) => frame.id),
      ...generated.paths.map((path) => path.id),
      ...generated.emptyCells.map((cell) => cell.id),
    ])

    const dispositionRows = sectionLines(lines, 'Frame dispositions')
      .filter((line) => line.trim().startsWith('|'))
      .map((line) => splitRow(line.trim()))
      .filter((cells) => cells[0] !== 'Frame' && !/^:?-+:?$/.test(cells[0]))

    const dispositioned = new Set()
    for (const cells of dispositionRows) {
      const [frameId = '', disposition = ''] = cells
      if (!generatedIds.has(frameId)) {
        issues.push(`frame-unknown: ${frameId} is not in the generated frame set`)
        continue
      }
      dispositioned.add(frameId)

      const value = disposition.trim()
      if (isEmptyCell(value)) {
        issues.push(`frame-undispositioned: ${frameId}: disposition is empty`)
        continue
      }
      // covered(O*)는 그 행의 테스트가 이 프레임의 choice 조합으로 실제 실행될 때만. 조합과 무관하게
      // 정책이 성립한다는 주장은 independent(O*): 이유 — 실행 커버리지가 아니라 독립성 주장으로 감사된다.
      issues.push(
        ...(await checkCell(value, {
          ...dispositionContext,
          code: 'frame-disposition',
          rowCode: 'frame-row-unknown',
          label: frameId,
          enumText: DISPOSITION_ENUM.frame,
          allowIndependent: true,
          frameId,
        })),
      )
    }

    for (const id of generatedIds) {
      if (!dispositioned.has(id)) issues.push(`frame-undispositioned: ${id}`)
    }
  }

  for (const cell of openCells) {
    issues.push(
      `disposition-open: ${cell} survives on an approved card — resolve it to covered/impossible, or the card ends NEEDS_DECISION`,
    )
  }

  const contractText = rows.flatMap((row) => Object.values(row.cells)).join(' ')
  const sourcedNaText = lines
    .filter((line) => /\bN\/A\b/i.test(line) && SOURCE_MARKERS.some((marker) => line.includes(marker)))
    .join(' ')

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

  const tier = cellOf(row, '증거 계층', 'Evidence tier')
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
    if (source.Kind !== 'implementation-reference' && isApproved(columnOf(source, SOURCE_COLUMNS.approval)))
      approved.add(source.ID)
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
  if (!bytes.subarray(0, 8).equals(signature))
    throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} is not a PNG file`)
  let offset = 8
  let ihdr = false
  let iend = false
  const idat = []
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length)
      throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} has a truncated PNG chunk`)
    const length = bytes.readUInt32BE(offset)
    const type = bytes.subarray(offset + 4, offset + 8)
    const end = offset + 12 + length
    if (end > bytes.length)
      throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} has an invalid PNG chunk boundary`)
    const expected = bytes.readUInt32BE(end - 4)
    // PNG CRC uses the IEEE polynomial; Node exposes it only indirectly, so validate
    // through a compact table-less implementation.
    let crc = 0xffffffff
    for (const byte of bytes.subarray(offset + 4, end - 4)) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320)
    }
    if ((crc ^ 0xffffffff) >>> 0 !== expected)
      throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} has an invalid PNG CRC`)
    const name = type.toString('ascii')
    if (!/^[a-z]{4}$/i.test(name))
      throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} has an invalid PNG chunk type`)
    if (!ihdr) {
      if (name !== 'IHDR' || length !== 13)
        throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} lacks a valid PNG IHDR`)
      const width = bytes.readUInt32BE(offset + 8)
      const height = bytes.readUInt32BE(offset + 12)
      if (!width || !height) throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} has invalid PNG dimensions`)
      ihdr = true
    } else if (name === 'IDAT') {
      if (iend) throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} has PNG data after IEND`)
      idat.push(bytes.subarray(offset + 8, end - 4))
    } else if (name === 'IEND') {
      if (length !== 0 || iend || idat.length === 0)
        throw new CliError('VISUAL_EVIDENCE_INVALID', `${id}: ${label} has an invalid PNG IEND`)
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
    isTrustedAdapter(producerLedger?.adapter)
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
      if (
        checkpointSeen ||
        index === 0 ||
        record.schemaVersion !== 3 ||
        !isDigest(record.prefixSha256) ||
        record.previousDigest !== '0'.repeat(64)
      ) {
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
      if (
        record.type !== 'init' &&
        record.type !== 'run' &&
        record.type !== 'review-receipt' &&
        record.type !== 'transition' &&
        record.type !== 'budget'
      ) {
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
        const fields = [
          'receiptId',
          'packetSha256',
          'targetRevision',
          'role',
          'reviewerId',
          'taskId',
          'outputSha256',
          'findingsSha256',
          'oracleSha256',
          'adapter',
        ]
        if (fields.some((field) => !validReviewReceiptField(record, field))) {
          throw new CliError('LEDGER_INVALID', `review receipt ${index} has invalid provenance`)
        }
        const identity = `${record.taskId}\0${record.reviewerId}`
        if (receiptIdentities.has(identity))
          throw new CliError('LEDGER_INVALID', `duplicate review receipt ${record.taskId}`)
        receiptIdentities.add(identity)
      }
      if (!isDigest(record.digest) || !isDigest(record.previousDigest) || record.previousDigest !== previousDigest) {
        throw new CliError('LEDGER_INVALID', `ledger record ${index} breaks the digest chain`)
      }
    }
    const { digest, ...unsigned } = record
    if (sha256(stableStringify(unsigned)) !== digest)
      throw new CliError('LEDGER_INVALID', `ledger record ${index} digest does not match`)
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
  if (
    !Number.isInteger(run.exitCode) ||
    run.exitCode === 0 ||
    run.grade !== 'reported' ||
    !isTrustedAdapter(run.adapter) ||
    !Array.isArray(run.tests)
  ) {
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

/** 카드의 Frame dispositions에서 covered()로 처분된 F* id — 실행 주장이라 evidence 게이트 대상이다. */
function coveredFrameIds(card, generated) {
  const generatedFrameIds = new Set(generated.frames.map((frame) => frame.id))
  return sectionLines(markdownLines(card), 'Frame dispositions')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => splitRow(line.trim()))
    .filter((cells) => cells[0] !== 'Frame' && !/^:?-+:?$/.test(cells[0] ?? ''))
    .filter(([frameId = '', disposition = '']) => generatedFrameIds.has(frameId) && /^covered\(/.test(disposition.trim()))
    .map(([frameId]) => frameId)
}

/** PATH* 하나당 테스트 하나, Order choice 2개 이상이면 시퀀스 테스트 하나, covered F*는 프레임 실행
 * 테스트 하나 — 문서만의 약속을 evidence 키로 옮긴다. */
function collectFrameEvidence(card, map) {
  const generated = generateFromDocument(card)
  if (!generated) return []

  const entries = []
  const paths = map?.paths ?? {}
  const pathIds = generated.paths.map((path) => path.id)
  const unknownPaths = Object.keys(paths).filter((id) => !pathIds.includes(id))
  if (unknownPaths.length > 0) {
    throw new CliError('EVIDENCE_UNKNOWN_PATH', `evidence maps paths the State Model does not generate: ${unknownPaths.join(', ')}`)
  }
  const missingPaths = pathIds.filter((id) => !paths[id])
  if (missingPaths.length > 0) {
    throw new CliError('EVIDENCE_MISSING_PATH', `State Model paths have no test evidence: ${missingPaths.join(', ')}`)
  }
  for (const id of pathIds) {
    if (paths[id].kind !== 'test' || !paths[id].name) {
      throw new CliError('EVIDENCE_INVALID', `${id}: path evidence must be { kind: "test", name }`)
    }
    entries.push([id, paths[id].name])
  }

  const covered = coveredFrameIds(card, generated)
  const frameEntries = map?.frames ?? {}
  const unknownFrames = Object.keys(frameEntries).filter((id) => !covered.includes(id))
  if (unknownFrames.length > 0) {
    throw new CliError('EVIDENCE_UNKNOWN_FRAME', `evidence maps frames that are not covered() F* frames: ${unknownFrames.join(', ')}`)
  }
  const missingFrames = covered.filter((id) => !frameEntries[id])
  if (missingFrames.length > 0) {
    throw new CliError('EVIDENCE_MISSING_FRAME', `covered() frames have no execution evidence: ${missingFrames.join(', ')}`)
  }
  for (const id of covered) {
    if (frameEntries[id].kind !== 'test' || !frameEntries[id].name) {
      throw new CliError('EVIDENCE_INVALID', `${id}: frame evidence must be { kind: "test", name }`)
    }
    entries.push([id, frameEntries[id].name])
  }

  const order = generated.caseSpace.families.find((entry) => entry.family === 'Order' && !entry.excluded)
  const orderChoices = order ? order.choices.filter((choice) => !choice.error).length : 0
  if (orderChoices >= 2) {
    if (map?.sequence?.kind !== 'test' || !map.sequence.name) {
      throw new CliError(
        'SEQUENCE_EVIDENCE_MISSING',
        `Order dimension "${order.dimension}" has ${orderChoices} choices — evidence.sequence must name the fast-check (or hand-enumerated) sequence test`,
      )
    }
    entries.push(['sequence', map.sequence.name])
  }

  return entries
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
    await verifyVisualArtifact(
      row,
      map.rows[row.id],
      options.map,
      oracleSha256,
      approvedSources,
      card,
      records,
      snapshots,
    )
  }

  // PATH*·Order 시퀀스 증거 — 카드가 State Model·Order 차원을 선언했으면 행 증거와 같은 게이트를 지난다.
  const frameEvidence = collectFrameEvidence(card, map)

  const needsRunEvidence = [
    ...rows.filter((id) => map.rows[id].kind === 'test').map((id) => [id, map.rows[id].name]),
    ...frameEvidence,
  ]

  if (
    needsRunEvidence.length > 0 &&
    (run.grade !== 'reported' || !isTrustedAdapter(run.adapter) || !Array.isArray(run.tests))
  ) {
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

  for (const [id, name] of needsRunEvidence) {
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
    if (
      !record ||
      typeof record !== 'object' ||
      record.type === 'checkpoint' ||
      !isDigest(record.digest) ||
      !isDigest(record.previousDigest)
    ) {
      throw new CliError('REVIEW_PACKET_INVALID', `embedded ledger record ${index} is malformed`)
    }
    const { digest, ...unsigned } = record
    if (record.previousDigest !== previousDigest || sha256(stableStringify(unsigned)) !== digest) {
      throw new CliError('REVIEW_PACKET_INVALID', `embedded ledger record ${index} breaks its digest chain`)
    }
    if (record.type === 'run') {
      if (
        !record.runId ||
        runIds.has(record.runId) ||
        !isDigest(record.oracleSha256) ||
        // 원장 규칙(oracle-run.mjs)과 같다 — 리포터가 없는 exit-only 런은 adapter: null 로
        // 기록된다. 신뢰 어댑터를 요구하는 것은 행 증거를 만드는 reported 런뿐이다.
        (record.adapter !== null && !isTrustedAdapter(record.adapter)) ||
        (record.grade === 'reported' && !isTrustedAdapter(record.adapter))
      ) {
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
  const packetSnapshot = await snapshotOracleFile(
    options.packet,
    base,
    'REVIEW_PACKET_INVALID',
    'review packet',
    snapshots,
  )
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
    !packet.reviewPoints.some(
      (point) => point?.path === 'changeability.md' && point.sha256 === canonicalChangeabilitySha256,
    ) ||
    !Array.isArray(packet?.evidenceArtifacts)
  ) {
    throw new CliError(
      'REVIEW_PACKET_INVALID',
      'review packet lacks canonical schema-v2 lock, decision, review-point, or artifact bindings',
    )
  }
  assertEmbeddedLedger(packet.ledger)
  for (const [index, artifact] of packet.evidenceArtifacts.entries()) {
    if (!artifact || typeof artifact.path !== 'string' || !isDigest(artifact.sha256)) {
      throw new CliError('REVIEW_PACKET_INVALID', `evidence artifact ${index} lacks path or digest`)
    }
    const snapshot = await assertRegularFileInside(
      base,
      artifact.path,
      'packet',
      `evidenceArtifacts[${index}]`,
      snapshots,
    )
    if (snapshot.sha256 !== artifact.sha256) {
      throw new CliError('REVIEW_PACKET_INVALID', `evidence artifact ${index} digest does not match`)
    }
  }
  const greenEntry = [...(packet?.state?.history ?? [])]
    .reverse()
    .find((history) => history.state === 'IMPLEMENTED_GREEN')
  const greenEntryRun = packet?.ledger?.find((entry) => entry.runId === greenEntry?.runId)
  const targetRevision = packet?.targetSnapshot?.worktreeSha256
  // 리뷰 지적을 고치면 worktree 리비전이 바뀐다. 그때의 GREEN 증거는 IMPLEMENTED_GREEN 을
  // 기록한 런이 아니라, 같은 라벨로 그 리비전에서 다시 통과한 reported 런이다.
  const rerunAtTarget = (label) =>
    packet?.ledger?.find(
      (entry) =>
        entry.type === 'run' &&
        entry.label === label &&
        entry.worktreeSha256 === targetRevision &&
        entry.exitCode === 0 &&
        entry.grade === 'reported',
    )
  const greenRun = (greenEntryRun?.label && rerunAtTarget(greenEntryRun.label)) || greenEntryRun
  if (
    !isDigest(targetRevision) ||
    targetRevision !== options.revision ||
    greenRun?.worktreeSha256 !== targetRevision ||
    greenRun?.exitCode !== 0 ||
    greenRun?.grade !== 'reported'
  ) {
    throw new CliError('REVIEW_PACKET_INVALID', 'review packet does not target the implementation worktree')
  }

  const findingSnapshots = [
    await snapshotOracleFile(options.file, base, 'FINDINGS_INVALID', 'review findings', snapshots),
  ]
  if (options.intersect)
    findingSnapshots.push(
      await snapshotOracleFile(options.intersect, base, 'FINDINGS_INVALID', 'intersected review findings', snapshots),
    )
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
        event.type === 'review-receipt' && event.taskId === receipt.taskId && event.reviewerId === document.reviewerId,
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
      throw new CliError(
        'REVIEWER_EVIDENCE_INVALID',
        'review findings require an independently ledger-bound review receipt',
      )
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
    throw new CliError(
      'REVIEWER_NOT_INDEPENDENT',
      'High-risk intersected reviews require distinct receipt task identities',
    )
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

/**
 * 블라인드 행↔테스트 매핑 대조 — evidence.json을 보지 않은 리뷰어가 카드 행과 테스트 소스만으로 적은
 * `{ "<test name>": "O1" | ["O1", "O2"] }`를 매핑과 비교한다. 이름 통과만 보던 evidence verify의 빈칸을 2-sample로 메운다.
 */
async function assertBlindMapping(options) {
  if (!options.map) throw new CliError('USAGE', 'review --blind-map requires --map', 2)
  const blind = await readJson(resolve(options['blind-map']), 'BLIND_MAP_INVALID')
  if (!blind || typeof blind !== 'object' || Array.isArray(blind)) {
    throw new CliError('BLIND_MAP_INVALID', 'blind map must be a JSON object keyed by test name')
  }
  const map = await readJson(resolve(options.map), 'EVIDENCE_INVALID')
  const disputes = []

  for (const [rowId, entry] of Object.entries(map?.rows ?? {})) {
    if (entry?.kind !== 'test') continue
    const claimed = blind[entry.name]
    const rows = Array.isArray(claimed) ? claimed : claimed ? [claimed] : []
    if (rows.length === 0) disputes.push(`${rowId}: "${entry.name}" — the blind reviewer mapped it to no row`)
    else if (!rows.includes(rowId)) disputes.push(`${rowId}: "${entry.name}" — the blind reviewer mapped it to ${rows.join(', ')}`)
  }

  if (disputes.length > 0) {
    throw new CliError('EVIDENCE_MAPPING_DISPUTED', `row↔test mapping disputed by the blind read:\n  ${disputes.join('\n  ')}`)
  }
}

async function verifyReview(options) {
  if (options['blind-map']) await assertBlindMapping(options)
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

// 잠긴 카드의 행을 그대로 옮긴 빈 manifest를 만든다 — 행 ID를 손으로 옮기다 생기는
// EVIDENCE_MISSING_ROW·EVIDENCE_UNKNOWN_ROW 왕복을 없앤다. 각 항목의 값은 여전히 작성자가 채운다.
function scaffoldRow(row) {
  const tier = cellOf(row, '증거 계층', 'Evidence tier')

  if (/\bN\/A\b/i.test(rowText(row))) {
    return { kind: 'na', reason: '<카드 행이 밝힌 N/A 사유>', source: '<승인된 S*>' }
  }
  if (tier === 'RELATIONAL') return { kind: 'visual', artifact: '<visual-qa/<id>/evidence.json>' }
  if (tier === 'JUDGMENT') return { kind: 'reviewer', finding: '<finding id>', role: 'designer' }
  return { kind: 'test', name: '<이 행을 검증하는 테스트 이름>' }
}

async function scaffoldEvidence(options) {
  if (!options.oracle) throw new CliError('USAGE', 'evidence-scaffold requires --oracle', 2)

  const card = await readFile(resolve(options.oracle), 'utf8').catch((error) => {
    throw new CliError('INPUT_UNREADABLE', `Cannot read Oracle: ${error.message}`)
  })
  const rows = parseRows(card)

  if (rows.length === 0) {
    throw new CliError('EVIDENCE_SCAFFOLD_EMPTY', 'card has no O*/D* contract rows to map')
  }

  const manifest = { schemaVersion: 1, rows: Object.fromEntries(rows.map((row) => [row.id, scaffoldRow(row)])) }
  const generated = generateFromDocument(card)
  if (generated?.paths.length) {
    manifest.paths = Object.fromEntries(
      generated.paths.map((path) => [path.id, { kind: 'test', name: `<[${path.id}] ${path.label}>` }]),
    )
  }
  const order = generated?.caseSpace.families.find((entry) => entry.family === 'Order' && !entry.excluded)
  if (order && order.choices.filter((choice) => !choice.error).length >= 2) {
    manifest.sequence = { kind: 'test', name: '<fast-check sequence test over the Order dimension>' }
  }
  const covered = generated ? coveredFrameIds(card, generated) : []
  if (covered.length > 0) {
    manifest.frames = Object.fromEntries(
      covered.map((id) => [id, { kind: 'test', name: `<the it.each case that runs [${id}]>` }]),
    )
  }
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)
}

/** 카드 행의 side-effect 열 — 한국어·영어 헤더 모두 `부작용`·`Side effect`로 시작한다. */
function sideEffectText(rows) {
  return rows
    .flatMap((row) => Object.entries(row.cells).filter(([key]) => /부작용|side effect/i.test(key)).map(([, value]) => value))
    .join(' ')
}

/**
 * 정적 side-effect 인벤토리. --oracle이 있으면 범주 소유를 대조한다: 카드의 어떤 행도 그 범주의 side effect를
 * 소유하지 않으면 SIDE_EFFECT_UNOWNED. 알려진 토큰 목록일 뿐이라 검출 0은 효과 없음의 증거가 아니다.
 */
async function scanSideEffectInventory(options) {
  const hits = []
  const exemptions = []
  const invalid = []
  for (const path of options.path) {
    const content = await readFile(path, 'utf8').catch((error) => {
      throw new CliError('SCAN_UNREADABLE', `Cannot read ${path}: ${error.message}`)
    })
    const scanned = scanSideEffects(path, content)
    hits.push(...scanned.hits)
    exemptions.push(...scanned.exemptions)
    invalid.push(...scanned.invalid)
  }

  for (const hit of hits) process.stdout.write(`SIDE_EFFECT ${hit.category} ${hit.path}:${hit.line} ${hit.token}\n`)

  // 맨 마커는 면제가 아니다 — `impossible`이 witness를 요구하듯 면제도 행 또는 사유를 요구한다
  if (invalid.length > 0) {
    throw new CliError(
      'SIDE_EFFECT_EXEMPTION_INVALID',
      `exemptions need a row or a reason — \`${SIDE_EFFECT_EXEMPTION_MARKER} <O*|D*|reason>\`:\n  ${invalid
        .map((entry) => `${entry.path}:${entry.line}: ${entry.reason}`)
        .join('\n  ')}`,
    )
  }

  if (!options.oracle) {
    process.stdout.write(`SCAN_OK ${options.path.length} files side-effects:${hits.length}\n`)
    return
  }

  const card = await readFile(options.oracle, 'utf8').catch((error) => {
    throw new CliError('CARD_UNREADABLE', `Cannot read ${options.oracle}: ${error.message}`)
  })
  const rows = parseRows(markdownLines(card))
  const rowSet = new Set(rows.map((row) => row.id))
  const unknownRows = exemptions.filter((entry) => {
    const cited = entry.reason.match(/^([OD]\d+)\b/)
    return cited && !rowSet.has(cited[1])
  })
  if (unknownRows.length > 0) {
    throw new CliError(
      'SIDE_EFFECT_EXEMPTION_INVALID',
      `exemptions cite rows that are not on the card:\n  ${unknownRows
        .map((entry) => `${entry.path}:${entry.line}: ${entry.reason}`)
        .join('\n  ')}`,
    )
  }

  const owned = sideEffectText(rows)
  if (hits.length > 0 && owned.trim() === '') {
    throw new CliError(
      'SIDE_EFFECT_UNOWNED',
      `the card has no side-effect column, so no row can own these effects — run \`card\` lint first:\n  ${hits
        .map((hit) => `${hit.path}:${hit.line}: ${hit.token} (${hit.category})`)
        .join('\n  ')}`,
    )
  }
  const unowned = hits.filter((hit) => {
    const category = SIDE_EFFECT_CATEGORIES.find((entry) => entry.category === hit.category)
    return !category.owned.test(owned)
  })

  if (unowned.length > 0) {
    throw new CliError(
      'SIDE_EFFECT_UNOWNED',
      `no card row owns these side effects — add the row or exempt with \`${SIDE_EFFECT_EXEMPTION_MARKER} <row|reason>\`:\n  ${unowned
        .map((hit) => `${hit.path}:${hit.line}: ${hit.token} (${hit.category})`)
        .join('\n  ')}`,
    )
  }
  process.stdout.write(`SCAN_OK ${options.path.length} files side-effects:${hits.length} owned\n`)
}

async function scanNondeterminism(options) {
  if (options.path.length === 0) throw new CliError('USAGE', 'scan requires at least one --path', 2)
  if (options['side-effects']) return scanSideEffectInventory(options)

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

/** 잠긴 dep 버전과 현재 설치 버전을 대조한다 — 가정 드리프트의 선행 신호. 게이트가 아니라 재스윕 지시다. */
async function verifySources(options) {
  if (!options.lock) throw new CliError('USAGE', 'sources requires --lock', 2)
  const lockPath = resolve(options.lock)
  const lockDirectory = dirname(lockPath)
  const manifest = await readJson(lockPath, 'LOCK_INVALID')
  const dependencies = manifest?.dependencies
  if (dependencies !== undefined && !Array.isArray(dependencies)) {
    throw new CliError('LOCK_INVALID', 'dependencies must be an array of { name, version }')
  }

  if (!dependencies || dependencies.length === 0) {
    process.stdout.write('SOURCES_CURRENT 0 dependencies\n')
    return
  }

  const segments = lockDirectory.split(/[\\/]/)
  const markerIndex = segments.lastIndexOf('.ai')
  const rootDirectory = markerIndex === -1 ? lockDirectory : segments.slice(0, markerIndex).join('/')

  const drifted = []
  for (const entry of dependencies) {
    if (!entry || typeof entry.name !== 'string' || typeof entry.version !== 'string') {
      throw new CliError('LOCK_INVALID', 'dependencies must be an array of { name, version }')
    }
    const installedPath = resolve(rootDirectory, 'node_modules', entry.name, 'package.json')
    let installed
    try {
      installed = JSON.parse(await readFile(installedPath, 'utf8')).version
    } catch {
      installed = null
    }
    if (installed !== entry.version) {
      drifted.push({ name: entry.name, locked: entry.version, installed: installed ?? 'not installed' })
    }
  }

  if (drifted.length > 0) {
    const lines = drifted.map((entry) => `ASSUMPTION_DRIFT ${entry.name} locked ${entry.locked} installed ${entry.installed}`)
    throw new CliError('ASSUMPTION_DRIFT', `${lines.join('\n')}\nre-run the landmine sweep for the drifted packages in a new revision`)
  }
  process.stdout.write(`SOURCES_CURRENT ${dependencies.length} dependencies\n`)
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const options = parseOptions(args)

  if (command === 'card') await lintCard(options)
  else if (command === 'red') await verifyRedEvidence(options)
  else if (command === 'evidence') await verifyEvidence(options)
  else if (command === 'evidence-scaffold') await scaffoldEvidence(options)
  else if (command === 'findings') await verifyFindings(options)
  else if (command === 'review') await verifyReview(options)
  else if (command === 'scan') await scanNondeterminism(options)
  else if (command === 'sources') await verifySources(options)
  else throw new CliError('USAGE', 'Expected card, red, evidence, evidence-scaffold, findings, review, scan or sources', 2)
}

try {
  await main()
} catch (error) {
  const cliError = error instanceof CliError ? error : new CliError('INPUT_UNREADABLE', error.message ?? String(error))
  process.stderr.write(`${cliError.code}: ${cliError.message}\n${nextActionLine(cliError.code)}`)
  process.exitCode = cliError.exitCode
}
