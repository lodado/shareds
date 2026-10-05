// Pure legacy Space parsing and structural audit. Execution and Formal proof stay caller-owned.
import { APPLICABILITY_CANDIDATES } from './oracle-dimensions.mjs'
import { frameId, TAXONOMY_FAMILIES } from './oracle-frames.mjs'
import { stableStringify } from './oracle-fs.mjs'
import { bracedValues, replacePlaceholders, stripTrailingParenthesized } from './oracle-verify-helpers.mjs'

// Card schema tokens are independent of the document language.
export const SOURCE_COLUMNS = {
  jurisdiction: ['관할', 'Jurisdiction'],
  location: ['위치·version', 'Location·version'],
  approval: ['승인 상태', 'Approval status'],
}

export function columnOf(record, names) {
  const key = names.find((name) => record[name] !== undefined)
  return key === undefined ? '' : record[key]
}

export function splitRow(line) {
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

export function markdownLines(card) {
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
export function parseRows(document) {
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

export function cellOf(row, ...names) {
  const header = Object.keys(row.cells).find((key) => names.some((name) => key.includes(name)))
  return header ? row.cells[header] : ''
}

/** 계약 행의 선택 열 — 이 행이 지금 코드의 동작과 어떻게 다른가. */
export const AS_IS_COLUMNS = ['As-is', '기존 동작']

/**
 * 행의 delta — `As-is`가 비면 새 동작, `same`이면 이미 있는 동작(기존 테스트를 재사용한다), 그 밖의 글은 바뀌는 기존
 * 동작이다(As-is → Then). 열이 없는 카드는 모든 행이 새 동작이라 이전과 같게 판정된다.
 */
export function rowDelta(row) {
  const value = cellOf(row, ...AS_IS_COLUMNS).trim()
  if (value === '' || value === '-' || value === '—') return { delta: 'new', asIs: null }
  if (/^same$/i.test(value)) return { delta: 'kept', asIs: null }
  return { delta: 'changed', asIs: value }
}

/** 계약 칸 전부 — As-is는 옛 동작의 서술이라 자동 TC·N/A 판정 재료에서 뺀다. */
export function contractCells(row) {
  return Object.entries(row.cells)
    .filter(([key]) => !AS_IS_COLUMNS.some((name) => key.includes(name)))
    .map(([, value]) => value)
}

export function isEmptyCell(value) {
  return value === '' || value === '-' || value.toUpperCase() === 'TBD'
}

export function isApproved(value) {
  return /^(?:approved|승인됨)$/i.test(value.trim())
}

export function sectionLines(lines, title) {
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
export function policyIds(value) {
  return [...new Set(value.match(/(?<![\w.])P\d+\b/g) ?? [])]
}

export function rowIds(value) {
  return [...new Set(value.match(/\b[OD]\d+\b/g) ?? [])]
}

const WITNESS_PATTERN = /\b(code|constraint|type|docs)\(([^)]+)\)/
const LOOKUP_PATTERN = /\b(docs|code|issue|changelog)\(([^)]+)\)/

export const DISPOSITION_ENUM = {
  sweep: 'disposition must be covered(O*) | impossible: mechanism — witness | needs-decision: question | needs-evidence: fact — lookup',
  deviation:
    'disposition must be covered(O*) | impossible: mechanism — witness | needs-decision: question | needs-evidence: fact — lookup',
  frame:
    'disposition must be covered(O*) | independent(O*): reason | impossible: mechanism — witness | needs-decision: question | needs-evidence: fact — lookup',
  landmine:
    'disposition must be covered(O*) | impossible: mechanism — witness | needs-decision: question | needs-evidence: fact — lookup | N/A reason',
}

/** disposition 셀 하나를 구조로 — sweep·deviation·frame·landmine 4계열이 같은 파서를 쓴다. IR의 disposition 필드다. */
export function parseDisposition(value) {
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

export function tableCells(lines, section, header) {
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
    const tokens = parts.map((part) => policyIds(part)[0] ?? stripTrailingParenthesized(part))
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

export function approvedSourceIds(lines) {
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

/** Identity coverage, preserving encounter order and every excess occurrence. */
export function auditIdCoverage(expectedIds, actualIds) {
  const expected = new Set(expectedIds)
  const seen = new Set()
  const extra = []
  const duplicate = []
  for (const id of actualIds) {
    if (seen.has(id)) duplicate.push(id)
    else if (!expected.has(id)) extra.push(id)
    seen.add(id)
  }
  return { missing: [...expected].filter((id) => !seen.has(id)), extra, duplicate }
}

/** Default t-way Contract summary — generated identity counts only. Execution counts stay null until evidence. */
export function tWaySummary(generated) {
  const { strength } = generated.caseSpace
  return {
    coverage: `t-way ${strength}`,
    strength,
    N_frames: generated.frames.length,
    N_error_frames: generated.errorFrames.length,
    N_paths: generated.paths.length,
    N_empty_cells: generated.emptyCells.length,
    N_executed_unique: null,
    N_passed_unique: null,
    executionStatus: 'not-run',
  }
}

export function fullProductRecords(card) {
  return tableCells(markdownLines(card), 'Frame dispositions', 'Frame').map(([id, disposition, tuple, scenario]) => {
    const parse = (value) => { try { return JSON.parse(value) } catch { return null } }
    return { id, disposition: parseDisposition(disposition ?? ''), tuple: parse(tuple), scenario: parse(scenario) }
  })
}

function sequenceFor(events, tuple) {
  return events.map((event) => replacePlaceholders(event, tuple))
}

function sequenceWitness(events, candidate, boundary) {
  const starts = events.flatMap((event, index) => {
    const match = event.match(/^start:([^:]+):([^:]+)$/)
    if (!match) return []
    const end = events.findIndex((value, position) => position > index && ['complete', 'fail', 'cancel'].some((kind) => value === `${kind}:${match[2]}`))
    return [{ action: match[1], request: match[2], index, end }]
  })
  if (candidate === 'action-repeat') return starts.some(({ action, index, end }) => action === boundary && events.some((event, position) => event === `repeat:${boundary}:pending` && position > index && (end === -1 || position < end)))
  if (candidate === 'response-order') return starts.some((a) => starts.some((b) => a.request !== b.request && a.index < b.index && b.index < b.end && b.end < a.end && events[a.end] === `complete:${a.request}` && events[b.end] === `complete:${b.request}`))
  if (candidate === 'owner-lifetime') return starts.some(({ index, end, request }) => events[end] === `complete:${request}` && events.some((event, position) => event.startsWith('owner:') && position > index && position < end))
  return starts.some(({ index, end }) => end > index)
}

/** Structural legacy full-product audit. Source relevance and assertion sufficiency remain review-owned. */
export function auditFullProduct(card, generated, { scenarioShape = 'legacy' } = {}) {
  const { caseSpace, frames, dimensionRevision, constraintRevision, rawCount } = generated
  const model = caseSpace.model
  const lines = markdownLines(card)
  const records = fullProductRecords(card)
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  const text = (value) => typeof value === 'string' && !isEmptyCell(value)
  const strings = (value) => Array.isArray(value) && value.length > 0 && value.every(text)
  const validGiven = (value) => object(value) && (scenarioShape === 'contract'
    ? Object.keys(value).length > 0
    : ['query', 'page', 'history', 'data', 'pending'].every((key) => Object.hasOwn(value, key) && value[key] !== null))
  const dimensions = caseSpace.families.filter((entry) => !entry.excluded && entry.dimension)
  const domains = new Map(dimensions.map((entry) => [entry.dimension, new Set(entry.choices.map((choice) => choice.value))]))
  const sourceIds = new Set(tableCells(lines, 'Source Registry', 'ID').map(([id]) => id))
  const approved = approvedSourceIds(lines)
  const rowSet = new Set(parseRows(card).map(({ id }) => id))
  const questions = new Set()
  const questionText = sectionLines(lines, 'Open questions').join('\n')
  const issues = []
  const malformed = []
  const stale = []
  const ids = new Set(frames.map(({ id }) => id))
  const auxiliaryIds = new Set([...generated.paths, ...generated.emptyCells].map(({ id }) => id))
  const seen = new Set()
  const coverage = auditIdCoverage([...ids, ...auxiliaryIds], records.map(({ id }) => id))
  const { extra, duplicate } = coverage
  const constraints = Array.isArray(model.constraints) ? model.constraints.filter(object) : []
  const constraintIds = new Set()
  const validPartial = (tuple) => object(tuple) && Object.keys(tuple).length > 0 && Object.entries(tuple).every(([id, value]) => domains.get(id)?.has(value))
  const validTuple = (tuple) => validPartial(tuple) && Object.keys(tuple).length === domains.size
  const matches = (tuple, constraint) => object(constraint.when) && Object.entries(constraint.when).every(([id, value]) => tuple?.[id] === value)
  const ask = (id, label) => {
    if (!/^Q\d+$/.test(id ?? '') || !new RegExp(`\\b${id}\\b`).test(questionText)) issues.push(`question: ${label} requires a registered Open question ID`)
    else questions.add(id)
  }

  if (!Array.isArray(model.constraints) || constraints.length !== model.constraints.length) malformed.push('constraints must be an array of objects (empty is explicit)')
  for (const constraint of constraints) {
    if (!object(constraint) || !/^C\d+$/.test(constraint.id ?? '') || constraintIds.has(constraint.id) || !validPartial(constraint.when) || !approved.has(constraint.source) || !text(constraint.mechanism) || !text(constraint.falsifier)) {
      malformed.push(`exclusion constraint: ${constraint?.id ?? '(missing)'}`)
    }
    constraintIds.add(constraint?.id)
  }
  for (const dimension of dimensions) {
    const id = dimension.dimension
    if (!sourceIds.has(model.dimensionSources?.[id])) malformed.push(`dimension source: ${id}`)
    if (!['input', 'observation'].includes(model.dimensionKinds?.[id])) malformed.push(`dimension kind: ${id}`)
    if (model.dimensionKinds?.[id] === 'observation') {
      const observation = model.observationAxes?.[id]
      if (!text(observation?.at) || !strings(observation?.constraints) || !observation.constraints.every((c) => constraintIds.has(c))) malformed.push(`observation sample point/constraints: ${id}`)
    }
  }
  for (const family of auditIdCoverage(TAXONOMY_FAMILIES, caseSpace.families.map((entry) => entry.family)).missing) malformed.push(`family-undispositioned: ${family}`)
  const boundaries = Array.isArray(model.boundaries) ? model.boundaries.filter(object) : []
  const applicability = Array.isArray(model.applicability) ? model.applicability.filter(object) : []
  if (!boundaries.length || boundaries.length !== model.boundaries.length || !Array.isArray(model.applicability) || applicability.length !== model.applicability.length) malformed.push('boundary/applicability inventory required')
  const boundaryIds = new Set()
  for (const boundary of boundaries) {
    if (!object(boundary) || !/^[\w-]+$/.test(boundary.id ?? '') || boundaryIds.has(boundary.id) || !['action', 'external-event', 'async'].includes(boundary.kind) || !sourceIds.has(boundary.source)) malformed.push(`boundary: ${boundary?.id}`)
    boundaryIds.add(boundary?.id)
    for (const candidate of APPLICABILITY_CANDIDATES) {
      const entries = applicability.filter((entry) => entry?.boundary === boundary?.id && entry.candidate === candidate)
      if (entries.length !== 1) issues.push(`applicability: ${boundary?.id}/${candidate} requires exactly one disposition`)
    }
  }
  for (const entry of applicability) {
    if (!object(entry) || !boundaryIds.has(entry.boundary) || !APPLICABILITY_CANDIDATES.includes(entry.candidate) || !sourceIds.has(entry.source) || ['dimensionId', 'reason', 'question'].filter((key) => text(entry[key])).length !== 1) {
      malformed.push(`applicability: ${entry?.boundary}/${entry?.candidate}`)
      continue
    }
    if (entry.question) ask(entry.question, `applicability ${entry.boundary}/${entry.candidate}`)
    if (entry.dimensionId && !domains.has(entry.dimensionId)) malformed.push(`applicability dimension: ${entry.dimensionId}`)
    if (entry.dimensionId && ['action-repeat', 'request-lifecycle', 'response-order', 'owner-lifetime'].includes(entry.candidate)) {
      const choices = model.sequences?.[entry.dimensionId]
      if (!object(choices) || ![...domains.get(entry.dimensionId) ?? []].every((value) => strings(choices[value]) && choices[value].length >= 2)) issues.push(`applicability sequence: ${entry.boundary}/${entry.candidate}`)
      const witnessed = frames.some(({ tuple }) => {
          const events = choices?.[tuple[entry.dimensionId]]
          if (!strings(events)) return false
          const expanded = sequenceFor(events, tuple)
          return sequenceWitness(expanded, entry.candidate, entry.boundary)
        })
      if (!witnessed) issues.push(`applicability ${entry.candidate} sequence: ${entry.boundary} lacks its temporal witness`)
    }
  }
  for (const [id, choices] of Object.entries(model.sequences ?? {})) {
    if (!domains.has(id) || !object(choices) || Object.entries(choices).some(([value, events]) => !domains.get(id).has(value) || !strings(events) || events.some((event) => bracedValues(event).some((placeholder) => !domains.has(placeholder))))) malformed.push(`sequence domain: ${id}`)
  }
  const section = sectionLines(lines, 'Frame dispositions')
  for (const [label, revision] of [['Dimension revision', dimensionRevision], ['Constraint revision', constraintRevision]]) {
    const values = section.filter((line) => line.startsWith(`- ${label}:`)).map((line) => line.slice(label.length + 3).trim())
    if (values.length !== 1 || values[0] !== revision) stale.push(label)
  }

  const excluded = []
  const unresolvedRecords = []
  const scenarios = new Set()
  let unresolved = 0
  for (const record of records) {
    if (seen.has(record.id)) continue
    seen.add(record.id)
    if (!ids.has(record.id)) continue
    if (!validTuple(record.tuple)) { malformed.push(`tuple domain: ${record.id}`); continue }
    if (frameId(record.tuple, dimensionRevision, constraintRevision) !== record.id) malformed.push(`ID/tuple mismatch: ${record.id}`)
    const applicable = constraints.filter((constraint) => matches(record.tuple, constraint))
    const disposition = record.disposition
    if (disposition.type === 'impossible') {
      const cited = applicable.find((constraint) => new RegExp(`\\b${constraint.id}\\b`).test(disposition.text) && disposition.witness?.kind === 'constraint' && disposition.witness.ref === constraint.source)
      if (!cited) issues.push(`exclusion: ${record.id} needs an applicable approved constraint, mechanism and falsifier`)
      else excluded.push({ id: record.id, tuple: record.tuple, constraints: applicable.map((c) => c.id), source: cited.source, mechanism: cited.mechanism, falsifier: cited.falsifier })
      if (record.scenario) issues.push(`scenario: excluded frame ${record.id} cannot assert an expectation`)
    } else if (disposition.type === 'needs-decision' || disposition.type === 'needs-evidence') {
      unresolved += 1
      unresolvedRecords.push({ id: record.id, tuple: record.tuple, disposition: disposition.text })
      if (disposition.type === 'needs-decision') ask(disposition.text.match(/^needs-decision:\s*(Q\d+)\b/)?.[1], record.id)
      if (disposition.type === 'needs-evidence' && !disposition.lookup) issues.push(`needs-evidence-lookup-missing: ${record.id}`)
      if (record.scenario) issues.push(`scenario: unresolved frame ${record.id} cannot assert an expectation`)
    } else if (disposition.type === 'covered' && !disposition.reason && disposition.rows.length > 0 && disposition.rows.every((id) => rowSet.has(id))) {
      if (applicable.length) issues.push(`exclusion: ${record.id} contradicts applicable constraint ${applicable.map((c) => c.id).join(',')}`)
      const gwt = record.scenario
      if (!object(gwt) || !text(gwt.id) || scenarios.has(gwt.id) || !strings(gwt.sources) || !gwt.sources.every((id) => approved.has(id)) || !strings(gwt.rows) || stableStringify([...new Set(gwt.rows)].sort()) !== stableStringify([...disposition.rows].sort()) || !validGiven(gwt.given) || !strings(gwt.when) || !object(gwt.then) || !['requests', 'display', 'effects', 'never'].every((key) => text(gwt.then[key])) || !['target', 'control', 'barrier', 'observe'].every((key) => text(gwt[key]))) {
        issues.push(`scenario: ${record.id} requires unique sourced GWT, contract rows and realization`)
        continue
      }
      scenarios.add(gwt.id)
      for (const [dimension, value] of Object.entries(record.tuple)) {
        const events = model.sequences?.[dimension]?.[value]
        if (!strings(events)) continue
        let cursor = -1
        const expanded = sequenceFor(events, record.tuple)
        if (expanded.some((event) => { cursor = gwt.when.indexOf(event, cursor + 1); return cursor === -1 })) issues.push(`sequence: ${record.id} must contain ${expanded.join(' -> ')}`)
      }
    } else issues.push(`disposition: ${record.id} must use covered, impossible, needs-decision or needs-evidence`)
  }
  const missing = coverage.missing.filter((id) => ids.has(id))
  for (const [kind, values] of [['missing', missing], ['extra', extra], ['duplicate', duplicate], ['malformed', malformed], ['stale-mapping', stale]]) if (values.length) issues.push(`${kind}: ${values.join(', ')}`)
  return {
    coverage: 'full-product', dimensionRevision, constraintRevision,
    dimensions: dimensions.map((entry) => ({ id: entry.dimension, values: entry.choices.map((choice) => choice.value), source: model.dimensionSources?.[entry.dimension] })),
    N_raw: rawCount, N_valid: rawCount - excluded.length - unresolved, N_excluded: excluded.length, N_unresolved: unresolved,
    N_scenarios: scenarios.size, N_executed_unique: null, N_passed_unique: null,
    missing, extra, duplicate, malformed, 'stale-mapping': stale, excluded, unresolved: unresolvedRecords, questions: [...questions].sort(), issues,
    ready: issues.length === 0 && unresolved === 0 && questions.size === 0,
    execution: 'not-run', limitation: 'Declared-model completeness only; source relevance and assertion semantics require review.',
  }
}
