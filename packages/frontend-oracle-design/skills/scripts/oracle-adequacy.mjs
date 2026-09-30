#!/usr/bin/env node

// 오라클 공간 적절성 — 카드의 좌표·관찰이 원문 목표를 가려낼 만큼 충분한지, 카드가 목표보다 약하지 않은지를 잠긴 세계
// 모델(유한 레코드) 위에서 검사한다. 모든 세계를 열거해 증명 또는 반례를 찾고, 그 결론을 Bend 커널이 다시 검사하는
// 파일로 쓴다. 세계 모델에 없는 현상은 찾지 못한다 — 결론은 선언한 세계 안에서만 성립한다.

import { Buffer } from 'node:buffer'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ensureBend, reportedVersion } from './ensure-bend.mjs'
import { sha256, stableStringify } from './oracle-fs.mjs'
import { bendInputs, compileBend, keepArtifact, lockScopeIssues, toPlain, verdictBeside } from './oracle-model.mjs'

export const ADEQUACY_VERSION = 1
// ponytail: 열거와 커널 증명에 같은 상한 — 넘으면 점검 전체가 unknown이다. 더 큰 세계가 필요한 카드가 오면 세계를
// 나누거나 기호 backend(Z3)를 붙인다.
export const MAX_WORLDS = 8192
export const TERM_CATEGORIES = ['controllable', 'observable', 'hidden', 'concept']
export const GOAL_KINDS = ['safety', 'witness']
export const HAZARDS = {
  'permission-change': 'permission, role or ownership changes between the check and the effect',
  'concurrent-change': 'another tab, user or system changes the same data',
  'display-vs-commit': 'what the UI shows differs from what the system committed',
  'effect-count': 'an external effect (request, event, analytics, email) happens zero or several times',
  'identity-reference': 'the wrong actor, resource or version, or a dangling reference',
  'feature-composition': 'another feature or a later step changes the outcome',
  'carry-over':
    'state or an indicator from an earlier attempt remains in the next one (a stale toast, error or selection)',
  'order-timing':
    'the result depends on what happens first (a toast before the commit, a late response) — a record world sees end states only',
}
// 판정에 쓰이면 뜻이 갈리는 단어 — 카드 행에 나오면 ## Terms가 어느 뜻인지 정해야 한다(영문은 단어 시작, 한글은 부분 일치).
const VAGUE_WORDS = [
  'success',
  'complete',
  'save',
  'delete',
  'cancel',
  'same',
  'latest',
  'permission',
  'change',
  '성공',
  '완료',
  '저장',
  '삭제',
  '취소',
  '동일',
  '같은',
  '최신',
  '권한',
  '변경',
]
const TERM_COLUMNS = ['Term', 'Context', 'Name', 'Category', 'Field', 'Path', 'Definition', 'Not', 'Source', 'Status']
const ADEQUACY_FIELDS = ['World', 'Coordinates', 'Observations', 'Rows', 'Rows outside the world']
const REFERENCE = fileURLToPath(new URL('../references/adequacy.md', import.meta.url))
const SUGGESTIONS = {
  controllable: (field) => `add ${field} to Coordinates — the test sets it`,
  observable: (field) => `add ${field} to Observations — the test reads it`,
  hidden: (field) =>
    `${field} is hidden — register a product observation path for it in ## Terms (observable + Path) or record an Open question; never read it from a test double (OBSERVATION_GAP)`,
}

class CliError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

function sectionOf(lines, heading) {
  const start = lines.findIndex((line) => line.trim() === heading)
  if (start === -1) return null
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  return lines.slice(start + 1, end === -1 ? lines.length : end)
}

/** 절 안의 마크다운 표들 — 행은 머리 칸 이름으로 읽는다. */
function tablesOf(body) {
  const tables = []
  let current = null
  for (const line of body) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) {
      current = null
      continue
    }
    const cells = trimmed
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim())
    if (!current) {
      current = { header: cells, rows: [] }
      tables.push(current)
    } else if (!cells.every((cell) => /^:?-+:?$/.test(cell))) {
      current.rows.push(Object.fromEntries(current.header.map((name, index) => [name, cells[index] ?? ''])))
    }
  }
  return tables
}

const words = (value) => (value ?? '').split(/[\s,]+/).filter((token) => token && token !== 'none')
const isField = (row) => Boolean(row.Field) && row.Field !== '—'

/** `## Terms` 절 → 머리 칸과 행. 없으면 null — 사전은 선택이다. */
export function parseTerms(lines) {
  const body = sectionOf(lines, '## Terms')
  if (!body) return null
  const table = tablesOf(body).find(({ header }) => header[0] === 'Term')
  // 0.65.0 카드의 `Observed via` 열은 `Path`와 같다 — 관찰 가능한 용어의 읽는 경로.
  const rename = (name) => (name === 'Observed via' ? 'Path' : name)
  const rows = (table?.rows ?? []).map((row) =>
    Object.fromEntries(Object.entries(row).map(([name, value]) => [rename(name), value])),
  )
  return { header: (table?.header ?? []).map(rename), rows }
}

/** `## Adequacy` 절 → 필드와 가정·목표·예시·위험 표. 없으면 null — 절은 선택이다. */
export function parseAdequacy(lines) {
  const body = sectionOf(lines, '## Adequacy')
  if (!body) return null
  const fields = {}
  for (const line of body) {
    const match = line.trim().match(/^- ([^:]+):(.*)$/)
    if (match && ADEQUACY_FIELDS.includes(match[1])) fields[match[1]] = match[2].trim()
  }
  const tables = Object.fromEntries(tablesOf(body).map(({ header, rows }) => [header[0], rows]))
  return {
    fields,
    assumptions: tables.Assumption ?? [],
    goals: tables.Goal ?? [],
    examples: tables.Example ?? [],
    hazards: tables.Hazard ?? [],
  }
}

/**
 * 세계 타입 — `type <Prefix> is Data:`의 한 생성자 레코드. 필드가 Bool이거나 인자 없는 생성자만 가진 타입이면 값 목록을,
 * 아니면(Nat·목록 등 무한 도메인) values: null을 준다. 레코드가 없으면 null.
 */
export function parseWorldType(text, prefix) {
  const types = new Map()
  let current = null
  for (const line of text.split('\n')) {
    const head = line.match(/^type\s+(\w+)\s+is\s+Data\s*:\s*$/)
    if (head) {
      current = []
      types.set(head[1], current)
      continue
    }
    const declared = current && line.match(/^\s+(\w+)\{(.*)\}\s*$/)
    if (declared) {
      const fields = declared[2]
        .split(',')
        .map((field) => field.trim())
        .filter(Boolean)
        .map((field) => {
          const [name, type] = field.split(':').map((part) => part.trim())
          return { name, type }
        })
      current.push({ name: declared[1], fields })
    } else if (line.trim() && !/^\s/.test(line)) {
      current = null
    }
  }
  const record = types.get(prefix)
  if (record?.length !== 1 || record[0].name !== prefix) return null
  return record[0].fields.map(({ name, type }) => {
    if (type === 'Bool') return { name, type, values: [false, true] }
    const constructors = types.get(type)
    const finite = constructors?.length > 0 && constructors.every((entry) => entry.fields.length === 0)
    return { name, type, values: finite ? constructors.map((entry) => entry.name) : null }
  })
}

/** 예시 세계 `start !held committed kind=Draft` → 필드 값. Bool은 이름·`!이름`, 열거 필드는 `이름=생성자`. */
export function parseWorldLiteral(text, fields) {
  const plain = {}
  const errors = []
  for (const token of words(text)) {
    const [, negated, name, value] = token.match(/^(!?)(\w+)(?:=(\w+))?$/) ?? []
    const field = fields.find((candidate) => candidate.name === name)
    if (!field) {
      errors.push(`unknown field ${token}`)
      continue
    }
    if (name in plain) errors.push(`${name} set twice`)
    if (field.type === 'Bool' && value === undefined) plain[name] = !negated
    else if (field.type !== 'Bool' && !negated && field.values?.includes(value)) plain[name] = value
    else errors.push(`bad value ${token}`)
  }
  for (const field of fields) if (!(field.name in plain)) errors.push(`${field.name} missing`)
  return { plain, errors }
}

function sourceLocation(lines, id) {
  const registry = sectionOf(lines, '## Source Registry') ?? []
  const table = tablesOf(registry)[0]
  const column = table?.header.find((name) => /Location|위치/.test(name))
  return table?.rows.find((row) => row.ID === id)?.[column] ?? ''
}

/** 승인된 비구현 `repo:*.bend` 출처의 경로, 아니면 null. */
function lockedBendPath(source) {
  if (!source?.authoritative || !source.repoPath?.endsWith('.bend')) return null
  return source.repoPath
}

/**
 * Terms·Adequacy 구조 검사 — card lint가 부른다. 연결과 범주만 본다: 정의가 원문의 뜻과 같은지는 리뷰 소관이다.
 * context: { rows: Set<O*|D*>, rowText: Map<id, text>, sources: Map<S*, { repoPath, authoritative }>,
 *            questionIds: Set<Q*>, readSource(repoPath) → text | null }
 */
export async function adequacyIssues({ adequacy, terms }, context) {
  const issues = []
  const termRows = terms?.rows ?? []
  if (terms) {
    const missing = TERM_COLUMNS.filter((name) => !terms.header.includes(name))
    if (missing.length > 0) issues.push(`terms-columns: ## Terms needs the columns ${missing.join(', ')}`)
    const ids = new Set()
    const names = new Set()
    const byField = new Map()
    for (const row of termRows) {
      const id = row.Term
      if (!/^T\d+$/.test(id) || ids.has(id)) issues.push(`terms-id: "${id}" must be a unique T* ID`)
      ids.add(id)
      const name = `${(row.Context ?? '').toLowerCase()}/${(row.Name ?? '').toLowerCase()}`
      if (names.has(name)) {
        issues.push(
          `terms-duplicate: ${id}: "${row.Name}" is already a term in context ${row.Context} — the same word in another bounded context gets its own Context`,
        )
      }
      names.add(name)
      if (!TERM_CATEGORIES.includes(row.Category))
        issues.push(`terms-category: ${id}: Category must be ${TERM_CATEGORIES.join(' | ')}`)
      if ((row.Category === 'concept') === isField(row))
        issues.push(
          `terms-field: ${id}: a concept has Field —; a controllable, observable or hidden term names one world field`,
        )
      if (isField(row)) byField.set(row.Field, [...(byField.get(row.Field) ?? []), id])
      // 테스트가 설정하는 방법(controllable)과 제품에서 읽는 경로(observable)를 적는다 — 좌표의 뜻과 테스트가 실제로
      // 만드는 상황이 어긋나면 그 좌표는 검사되지 않은 채 통과한다.
      const hasPath = Boolean(row.Path) && row.Path !== '—'
      if (['controllable', 'observable'].includes(row.Category) !== hasPath)
        issues.push(
          `terms-path: ${id}: a controllable term names how the test sets it and an observable term the product path that reads it; hidden and concept terms have —`,
        )
      if (!row.Definition || row.Definition === '—') issues.push(`terms-definition: ${id}: Definition is empty`)
      if (isField(row) && (!row.Not || row.Not === '—'))
        issues.push(`terms-not: ${id}: name the neighbouring meaning the term must not be confused with`)
      if (!['confirmed', 'open'].includes(row.Status))
        issues.push(`terms-status: ${id}: Status must be confirmed | open`)
      if (row.Status === 'confirmed' && !context.sources.get(row.Source)?.authoritative)
        issues.push(`terms-source: ${id}: a confirmed term cites one approved, non-implementation Source Registry ID`)
    }
    for (const [field, owners] of byField) {
      if (owners.length > 1)
        issues.push(
          `terms-field-conflated: ${field}: ${owners.join(
            ', ',
          )} name one world field — distinct meanings need distinct fields`,
        )
    }
  }
  if (!adequacy) return issues

  const { fields } = adequacy
  for (const field of ADEQUACY_FIELDS) if (!fields[field]) issues.push(`adequacy-field: Adequacy must set ${field}`)
  if (!terms) issues.push('terms-missing: an Adequacy section needs a ## Terms table naming every world field')
  const [, worldSource, prefix] = fields.World?.match(/^(S\d+)\s+([A-Z]\w*)$/) ?? []
  const source = context.sources.get(worldSource)
  const worldPath = lockedBendPath(source)
  if (fields.World && !worldPath) {
    issues.push(
      'adequacy-world: World must be `S<n> <Prefix>` citing one approved, non-implementation repo:<path>.bend Source Registry ID',
    )
  }

  const assumptions = new Set()
  for (const row of adequacy.assumptions) {
    if (!/^A\d+$/.test(row.Assumption) || assumptions.has(row.Assumption))
      issues.push(`adequacy-assumption: "${row.Assumption}" must be a unique A* ID`)
    assumptions.add(row.Assumption)
    if (!context.sources.has(row.Source))
      issues.push(`adequacy-assumption: ${row.Assumption}: Source must be a Source Registry ID`)
    if (!row.Falsifier || row.Falsifier === '—')
      issues.push(`adequacy-assumption: ${row.Assumption}: name the observation that would show it false`)
    // 가정은 제품이 바꿀 수 없는 사실만이다. 제품이 보장하는 것은 목표다 — 가정으로 적으면 위반하는 세계가 공간에서 사라진다.
    if (!row.Owner || row.Owner === '—')
      issues.push(
        `adequacy-assumption-owner: ${row.Assumption}: name who guarantees it outside the product, or \`harness\``,
      )
    else if (/^product\b/i.test(row.Owner))
      issues.push(`adequacy-assumption-owner: ${row.Assumption}: a duty of the product is a goal, not an assumption`)
  }
  const goals = new Set()
  for (const row of adequacy.goals) {
    if (!/^G\d+$/.test(row.Goal) || goals.has(row.Goal))
      issues.push(`adequacy-goal: "${row.Goal}" must be a unique G* ID`)
    goals.add(row.Goal)
    if (!GOAL_KINDS.includes(row.Kind))
      issues.push(`adequacy-goal: ${row.Goal}: Kind must be ${GOAL_KINDS.join(' | ')}`)
    const cited = (row.Cites ?? '').match(/\bS\d+\b/g) ?? []
    if (cited.length === 0) {
      issues.push(
        `adequacy-goal-source: ${row.Goal} must cite the source text (S*) directly — a goal read off the card checks the card against itself`,
      )
    }
    for (const id of cited) {
      if (!context.sources.get(id)?.authoritative)
        issues.push(`adequacy-goal-source: ${row.Goal}: ${id} is not an approved, non-implementation source`)
    }
  }
  if (!adequacy.goals.some((row) => row.Kind === 'safety'))
    issues.push('adequacy-goal-missing: state at least one safety goal from the source text')

  const listed = words(fields.Rows)
  const outside = fields['Rows outside the world']?.match(/\bO\d+\b/g) ?? []
  for (const id of listed) {
    if (!/^O\d+$/.test(id) || !context.rows.has(id))
      issues.push(`adequacy-row-unknown: ${id} is not an O* row on this card`)
  }
  for (const id of context.rows) {
    if (id.startsWith('O') && !listed.includes(id) && !outside.includes(id))
      issues.push(`adequacy-row-unlisted: ${id} is neither in Rows nor in Rows outside the world (with a reason)`)
  }
  for (const [id, text] of context.rowText) {
    if (!id.startsWith('O')) continue
    for (const word of VAGUE_WORDS) {
      const used = /^[a-z]/.test(word) ? new RegExp(`\\b${word}`, 'i').test(text) : text.includes(word)
      if (used && !termRows.some((row) => (row.Name ?? '').toLowerCase().includes(word)))
        issues.push(`adequacy-vague-term: ${id} says "${word}" — define which meaning in ## Terms`)
    }
  }

  const modeled = []
  for (const id of Object.keys(HAZARDS)) {
    const count = adequacy.hazards.filter((row) => row.Hazard === id).length
    if (count !== 1) issues.push(`adequacy-hazard: ${id} needs exactly one disposition row (found ${count})`)
  }
  for (const row of adequacy.hazards) {
    if (!(row.Hazard in HAZARDS)) {
      issues.push(`adequacy-hazard: ${row.Hazard} is not one of ${Object.keys(HAZARDS).join(', ')}`)
      continue
    }
    const disposition = row.Disposition ?? ''
    const fieldList = disposition.match(/^modeled:\s*(\S.*)$/)?.[1]
    const excluded = disposition.match(/^n\/a:\s*(S\d+)\s+\S/)?.[1]
    const question = disposition.match(/^question:\s*(Q\d+)\s*$/)?.[1]
    if (fieldList) modeled.push(...words(fieldList).map((field) => [row.Hazard, field]))
    else if (!(context.sources.has(excluded) || context.questionIds.has(question))) {
      issues.push(
        `adequacy-hazard: ${row.Hazard}: Disposition must be modeled: <fields> | n/a: S<n> <reason> | question: Q<n> on this card`,
      )
    }
  }

  const exampleIds = new Set()
  for (const row of adequacy.examples) {
    if (!/^E\d+$/.test(row.Example) || exampleIds.has(row.Example))
      issues.push(`adequacy-example: "${row.Example}" must be a unique E* ID`)
    exampleIds.add(row.Example)
    if (!goals.has(row.Goal)) issues.push(`adequacy-example: ${row.Example}: ${row.Goal} is not a goal`)
    if (!['holds', 'violates'].includes(row.Verdict))
      issues.push(`adequacy-example: ${row.Example}: Verdict must be holds | violates`)
  }

  if (!worldPath) return issues
  const scope = await lockScopeIssues([worldPath], context)
  issues.push(...scope.issues)
  const world = scope.structures.get(worldPath)
  if (!world) return issues
  const worldFields = parseWorldType(world.text, prefix)
  if (!worldFields) {
    issues.push(
      `adequacy-world-type: ${worldPath} declares no record type ${prefix} with one constructor ${prefix}{...}`,
    )
    return issues
  }
  const names = worldFields.map(({ name }) => name)
  const category = new Map(termRows.filter(isField).map((row) => [row.Field, row.Category]))
  for (const row of termRows) {
    if (isField(row) && !names.includes(row.Field))
      issues.push(`terms-field-unknown: ${row.Term}: ${row.Field} is not a field of ${prefix}`)
  }
  for (const name of names)
    if (!category.has(name)) issues.push(`terms-field-unmapped: ${prefix}.${name} has no ## Terms row`)
  const keyIssues = (label, expected) => {
    for (const name of words(fields[label])) {
      if (!names.includes(name)) issues.push(`adequacy-key-unknown: ${label}: ${name} is not a field of ${prefix}`)
      else if (category.get(name) !== expected) {
        const role = label === 'Coordinates' ? 'coordinate' : 'observation'
        const verb = expected === 'controllable' ? 'sets' : 'reads'
        const [roleArticle, article] = expected === 'observable' ? ['an', 'an'] : ['a', 'a']
        issues.push(
          `adequacy-${role}-category: ${name} is ${
            category.get(name) ?? 'untyped'
          } — ${roleArticle} ${role} is ${article} ${expected} field the test ${verb}`,
        )
      }
    }
  }
  keyIssues('Coordinates', 'controllable')
  keyIssues('Observations', 'observable')
  for (const [hazard, field] of modeled) {
    if (!names.includes(field)) issues.push(`adequacy-hazard: ${hazard}: ${field} is not a field of ${prefix}`)
  }
  const texts = [...scope.structures.values()]
    .filter(Boolean)
    .map(({ text }) => text)
    .join('\n')
  for (const id of [...assumptions, ...goals, ...listed]) {
    if (!new RegExp(`^def\\s+${prefix}\\.${id}\\(`, 'm').test(texts))
      issues.push(`adequacy-def-missing: ${prefix}.${id} is not defined in ${worldPath} or its imports`)
  }
  for (const row of adequacy.examples) {
    const { errors } = parseWorldLiteral(row.World, worldFields)
    if (errors.length > 0) issues.push(`adequacy-example: ${row.Example}: ${errors.join('; ')}`)
  }
  return issues
}

/** 카드 + 세계 파일 → 점검 입력. 구조 오류는 card lint가 먼저 잡는다 — 여기서는 필수 입력이 없으면 멈춘다. */
export function adequacySpec(cardText, worldText) {
  const lines = cardText.split('\n')
  const adequacy = parseAdequacy(lines)
  const terms = parseTerms(lines)
  if (!adequacy || !terms) throw new CliError('ADEQUACY_SPEC', 'the card needs both ## Adequacy and ## Terms')
  const [, source, prefix] = adequacy.fields.World?.match(/^(S\d+)\s+([A-Z]\w*)$/) ?? []
  if (!prefix) throw new CliError('ADEQUACY_SPEC', 'World must be `S<n> <Prefix>`')
  const fields = parseWorldType(worldText, prefix)
  if (!fields) throw new CliError('ADEQUACY_SPEC', `the world file declares no record type ${prefix}`)
  const termOf = new Map(terms.rows.filter(isField).map((row) => [row.Field, row]))
  return {
    source,
    prefix,
    fields,
    coordinates: words(adequacy.fields.Coordinates),
    observations: words(adequacy.fields.Observations),
    rows: words(adequacy.fields.Rows),
    assumptions: adequacy.assumptions.map((row) => row.Assumption),
    goals: adequacy.goals.map((row) => ({ id: row.Goal, kind: row.Kind })),
    examples: adequacy.examples.map((row) => ({
      id: row.Example,
      goal: row.Goal,
      verdict: row.Verdict,
      world: parseWorldLiteral(row.World, fields),
    })),
    categories: Object.fromEntries(fields.map(({ name }) => [name, termOf.get(name)?.Category ?? 'hidden'])),
    openFields: fields.map(({ name }) => name).filter((name) => termOf.get(name)?.Status === 'open'),
    outside: {
      rows: adequacy.fields['Rows outside the world'] ?? '',
      hazards: adequacy.hazards.filter((row) => !(row.Disposition ?? '').startsWith('modeled:')),
      // 테스트가 만들 수 없어서 둔 가정 — 그 가정이 뺀 세계는 검사되지 않았다.
      harness: adequacy.assumptions.filter((row) => /^harness\b/i.test(row.Owner ?? '')).map((row) => row.Assumption),
    },
    owners: Object.fromEntries(adequacy.assumptions.map((row) => [row.Assumption, row.Owner ?? ''])),
    digestInput: { adequacy, terms: terms.rows },
  }
}

const worldKey = (plain) => stableStringify(plain)
const bendNot = (expr) => `Bool.not(${expr})`
const bendDef = (prefix, id, w) => `M.${prefix}.${id}(${w})`

/** 필드 값의 곱 전체. 앞 필드가 가장 느리게 바뀌고 Bool은 false가 먼저다 — 같은 입력이면 같은 순서·ID다. */
export function enumerateWorlds(fields) {
  let worlds = [{}]
  for (const field of fields) {
    worlds = worlds.flatMap((plain) => field.values.map((value) => ({ ...plain, [field.name]: value })))
  }
  return worlds.map((plain) => ({ id: `W${sha256(worldKey(plain)).slice(0, 12)}`, plain }))
}

function evaluate(model, name, value) {
  const result = toPlain(model.call(name, value))
  if (typeof result !== 'boolean')
    throw new CliError('ADEQUACY_DEF_TYPE', `${name} returned ${JSON.stringify(result)}, not a Bool`)
  return result
}

const lawName = (...parts) => parts.filter(Boolean).join('_').toLowerCase().replaceAll(/\W/g, '_')

/**
 * 점검 — 모든 세계를 열거해 각 점검의 증명 또는 반례를 찾는다. model.call(name, value)는 세계 값에 def를 적용한 Bool이다.
 * obligations는 커널이 다시 검사할 결론이다: 존재는 witness, 전칭은 경우 전부, 인수분해는 판정표와 경우 전부.
 */
export function searchAdequacy(model, spec) {
  const defs = [...spec.assumptions, ...spec.rows, ...spec.goals.map(({ id }) => id)]
  const worlds = evaluateWorlds(model, spec)
  const byKey = new Map(worlds.map((world) => [worldKey(world.plain), world]))
  const valid = worlds.filter((world) => world.valid)
  const key = [...spec.coordinates, ...spec.observations]
  const checks = []
  const obligations = []
  const goal = (id) => `M.${spec.prefix}.${id}(w)`
  const both = 'Bool.and(Adq.valid(w), Adq.card(w))'

  const exists = (kind, target, holds, expr) => {
    const witness = worlds.find(holds)
    const law = lawName(kind, target)
    if (witness) {
      checks.push({ kind, target, status: 'proven', evidenceKind: 'kernel-witness', witness: witness.plain })
      obligations.push({ shape: 'exists', law, expr, world: witness.plain })
    } else {
      checks.push({ kind, target, status: 'refuted', evidenceKind: 'kernel-proof-finite' })
      obligations.push({ shape: 'forall', law, expr: `Bool.not(${expr})` })
    }
  }
  const forall = (kind, target, holds, expr) => {
    const counterexample = worlds.find((world) => !holds(world))
    const law = lawName(kind, target)
    if (counterexample) {
      checks.push({
        kind,
        target,
        status: 'refuted',
        evidenceKind: 'kernel-witness',
        counterexample: counterexample.plain,
      })
      obligations.push({ shape: 'exists', law, expr: `Bool.not(${expr})`, world: counterexample.plain })
    } else {
      checks.push({ kind, target, status: 'proven', evidenceKind: 'kernel-proof-finite' })
      obligations.push({ shape: 'forall', law, expr })
    }
  }
  // 같은 좌표·관찰의 유효 세계끼리 묶어 값이 갈리는 묶음을 찾는다 — 모든 쌍을 비교하지 않는다.
  const factor = (kind, target, value, expr) => {
    const groups = new Map()
    for (const world of valid) {
      const id = stableStringify(key.map((name) => world.plain[name]))
      groups.set(id, [...(groups.get(id) ?? []), world])
    }
    let pair = null
    const differing = new Set()
    let conflicts = 0
    for (const members of groups.values()) {
      const holding = members.filter(value)
      const violating = members.filter((world) => !value(world))
      if (holding.length === 0 || violating.length === 0) continue
      conflicts += 1
      const distances = holding.flatMap((a) =>
        violating.map((b) => ({
          a,
          b,
          fields: spec.fields.map(({ name }) => name).filter((name) => a.plain[name] !== b.plain[name]),
        })),
      )
      const nearest = Math.min(...distances.map(({ fields }) => fields.length))
      for (const candidate of distances.filter(({ fields }) => fields.length === nearest)) {
        for (const name of candidate.fields) differing.add(name)
        pair ??= candidate
      }
    }
    const law = lawName(kind, target)
    if (pair) {
      const fields = spec.fields.map(({ name }) => name).filter((name) => differing.has(name))
      checks.push({
        kind,
        target,
        status: 'refuted',
        evidenceKind: 'kernel-witness',
        conflicts,
        pair: { holds: pair.a.plain, violates: pair.b.plain },
        differing: fields.map((name) => ({ field: name, category: spec.categories[name] })),
        suggestions: fields.map((name) => (SUGGESTIONS[spec.categories[name]] ?? SUGGESTIONS.hidden)(name)),
      })
      obligations.push({ shape: 'pair', law, expr, worlds: [pair.a.plain, pair.b.plain] })
    } else {
      checks.push({ kind, target, status: 'proven', evidenceKind: 'kernel-proof-finite' })
      const table = new Map([...groups].map(([id, members]) => [id, value(members[0])]))
      obligations.push({ shape: 'factor', law, expr, table })
    }
  }

  exists('world-nonempty', null, (world) => world.valid, 'Adq.valid(w)')
  exists('card-satisfiable', null, (world) => world.valid && world.card, both)
  for (const { id, kind } of spec.goals) {
    if (kind === 'witness') {
      exists(
        'goal-witness',
        id,
        (world) => world.valid && world.card && world.truth[id],
        `Bool.and(${both}, ${goal(id)})`,
      )
      continue
    }
    exists(
      'goal-falsifiable',
      id,
      (world) => world.valid && !world.truth[id],
      `Bool.and(Adq.valid(w), Bool.not(${goal(id)}))`,
    )
    forall(
      'card-implies-goal',
      id,
      (world) => !(world.valid && world.card) || world.truth[id],
      `Adq.imp(${both}, ${goal(id)})`,
    )
    factor('sufficiency', id, (world) => world.truth[id], goal(id))
  }
  factor('card-observable', null, (world) => world.card, 'Adq.card(w)')

  for (const example of spec.examples) {
    const world = byKey.get(worldKey(example.world.plain))
    const law = lawName('example', example.id)
    if (!world || example.world.errors.length > 0) {
      checks.push({ kind: 'example', target: example.id, status: 'refuted', reason: 'not a world of this type' })
      continue
    }
    const expected = example.verdict === 'holds'
    const holds = world.valid && world.truth[example.goal] === expected
    const reason = world.valid
      ? `${example.goal} ${world.truth[example.goal] ? 'holds' : 'is violated'} in this world`
      : 'the assumptions exclude this world'
    checks.push({
      kind: 'example',
      target: example.id,
      status: holds ? 'proven' : 'refuted',
      evidenceKind: 'kernel-computation',
      ...(holds ? {} : { reason }),
    })
    const literal = { world: example.world.plain }
    const call = `M.${spec.prefix}.${example.goal}(LIT)`
    obligations.push({
      shape: 'value',
      law,
      expr: `Bool.and(Adq.valid(LIT), ${expected ? call : bendNot(call)})`,
      ...literal,
      expect: holds,
    })
  }

  // 뜻이 아직 open인 용어의 필드에 기대는 def — 그 필드만 바꿨을 때 값이 바뀌는 세계 쌍을 찾는다.
  const dependencies = []
  for (const id of defs) {
    for (const name of spec.openFields) {
      const field = spec.fields.find((entry) => entry.name === name)
      for (const world of worlds) {
        const other = field.values
          .map((value) => byKey.get(worldKey({ ...world.plain, [name]: value })))
          .find((candidate) => candidate.truth[id] !== world.truth[id])
        if (!other) continue
        dependencies.push({ def: id, field: name, worlds: [world.plain, other.plain] })
        obligations.push({
          shape: 'value',
          law: lawName('open_term', id, name),
          expr: `Adq.eq(M.${spec.prefix}.${id}(LIT), M.${spec.prefix}.${id}(LIT2))`,
          world: world.plain,
          world2: other.plain,
          expect: false,
        })
        break
      }
    }
  }
  checks.push({
    kind: 'open-terms',
    target: null,
    status: dependencies.length === 0 ? 'proven' : 'refuted',
    evidenceKind: 'enumeration',
    openFields: spec.openFields,
    ...(dependencies.length > 0 ? { dependencies } : {}),
  })

  const minimalPairs = []
  for (const { id, kind } of spec.goals) {
    if (kind !== 'safety') continue
    for (const world of valid) {
      if (!world.truth[id]) continue
      for (const field of spec.fields) {
        for (const value of field.values) {
          const other = byKey.get(worldKey({ ...world.plain, [field.name]: value }))
          if (other?.valid && !other.truth[id])
            minimalPairs.push({ goal: id, field: field.name, holds: world.plain, violates: other.plain })
        }
      }
    }
  }
  const counts = {
    worlds: worlds.length,
    valid: valid.length,
    excluded: worlds.length - valid.length,
    goals: Object.fromEntries(
      spec.goals.map(({ id }) => {
        const holds = valid.filter((world) => world.truth[id]).length
        return [id, { holds, violates: valid.length - holds }]
      }),
    ),
  }
  return {
    checks,
    obligations,
    counts,
    minimalPairs: minimalPairs.slice(0, 50),
    minimalPairsTotal: minimalPairs.length,
  }
}

/** 모든 세계와 각 def(가정·행·목표)의 값 — 컴파일된 def를 세계 값에 적용한다. */
export function evaluateWorlds(model, spec) {
  const defs = [...spec.assumptions, ...spec.rows, ...spec.goals.map(({ id }) => id)]
  return enumerateWorlds(spec.fields).map((world) => {
    const value = {
      $: spec.prefix,
      ...Object.fromEntries(
        spec.fields.map((field) => [
          field.name,
          field.type === 'Bool' ? world.plain[field.name] : { $: world.plain[field.name] },
        ]),
      ),
    }
    const truth = Object.fromEntries(defs.map((id) => [id, evaluate(model, `${spec.prefix}.${id}`, value)]))
    return {
      ...world,
      truth,
      valid: spec.assumptions.every((id) => truth[id]),
      card: spec.rows.every((id) => truth[id]),
    }
  })
}

/** 가정 끄기 결과를 사람이 읽을 한 줄로 — 무엇을 확인할지까지 적는다. */
function sensitivityReading(id, broken, opened, owner) {
  if (/^harness\b/i.test(owner))
    return `${id} is a harness limit — the ${opened} worlds it excludes are untested; keep them in the outside list`
  if (broken.length > 0) return `the goals ${broken.join(', ')} rest on ${id} — monitor or test its falsifier`
  return `no goal depends on ${id} — review the ${opened} worlds it excludes for harm the goals do not name, and check its Owner: if the product guarantees it, it is a goal`
}

/**
 * 가정 끄기 — 가정 하나를 뺐을 때 카드가 새로 허용하는 세계와 그중 깨지는 목표. 목표가 깨지면 그 가정이 목표를
 * 떠받친다(falsifier를 테스트나 운영 감시로). 아무 목표도 안 깨지면 새로 허용된 세계를 사람이 본다: 해로운 세계가 있으면
 * 목표가 빠진 것이다. 판정이 아니라 공간 밖을 들여다보는 도구다(evidenceKind: enumeration).
 */
export function assumptionSensitivity(worlds, spec) {
  // 모든 가정 아래에서 이미 깨지는 목표는 card-implies-goal이 보고한다 — 여기서는 이 가정 하나가 떠받치는 목표만 센다.
  const alreadyBroken = new Set(
    spec.goals
      .filter((goal) => worlds.some((world) => world.valid && world.card && !world.truth[goal.id]))
      .map((goal) => goal.id),
  )
  return spec.assumptions.map((id) => {
    const others = spec.assumptions.filter((other) => other !== id)
    const opened = worlds.filter(
      (world) => others.every((other) => world.truth[other]) && !world.truth[id] && world.card,
    )
    const broken = spec.goals
      .filter(
        (goal) =>
          goal.kind === 'safety' && !alreadyBroken.has(goal.id) && opened.some((world) => !world.truth[goal.id]),
      )
      .map((goal) => goal.id)
    return {
      assumption: id,
      cardAllows: opened.length,
      brokenGoals: broken,
      worlds: opened.slice(0, 10).map(({ plain, truth }) => ({
        world: plain,
        violates: spec.goals.filter((goal) => goal.kind === 'safety' && !truth[goal.id]).map((goal) => goal.id),
      })),
      reading: sensitivityReading(id, broken, opened.length, spec.owners?.[id] ?? ''),
    }
  })
}

const bendValue = (field, value) => {
  if (field.type === 'Bool') return value ? 'True{}' : 'False{}'
  return `M.${value}{}`
}
const bendType = (field) => (field.type === 'Bool' ? 'Bool' : `M.${field.type}`)
const conj = (items) =>
  items.length === 0
    ? 'True{}'
    : items.reduceRight((rest, item) => (rest === null ? item : `Bool.and(${item}, ${rest})`), null)

/**
 * 결론을 Bend 파일 한 장으로 쓴다 — 도우미 def, 점검마다 law 하나와 그 증명. 파일을 만든 쪽은 신뢰할 필요가 없다:
 * 경우를 빠뜨리거나 판정표가 틀리면 커널이 거부한다. law 문장은 카드 표에서 기계적으로 나온다.
 */
export function adequacyProofFile(obligations, spec, importPath) {
  const record = `M.${spec.prefix}`
  const literal = (plain) => `${record}{${spec.fields.map((field) => bendValue(field, plain[field.name])).join(', ')}}`
  const all = enumerateWorlds(spec.fields).map(({ plain }) => plain)
  const cases = (indent) => all.map((plain) => `${indent}case ${literal(plain)}:\n${indent}  {==}`).join('\n')
  const binders = spec.fields.map((_, index) => `v${index}`).join(', ')
  const key = [...spec.coordinates, ...spec.observations].map((name) =>
    spec.fields.find((field) => field.name === name),
  )
  const access = (field, w) => `Adq.k_${field.name}(${w})`
  const out = [
    'import Base',
    `import ${importPath} as M`,
    '',
    'def Adq.imp(a: Bool, b: Bool) -> Bool:',
    '  Bool.or(Bool.not(a), b)',
    '',
    'def Adq.eq(a: Bool, b: Bool) -> Bool:',
    '  Bool.not(Bool.xor(a, b))',
    '',
    `def Adq.valid(+w: ${record}) -> Bool:`,
    `  ${conj(spec.assumptions.map((id) => bendDef(spec.prefix, id, 'w')))}`,
    '',
    `def Adq.card(+w: ${record}) -> Bool:`,
    `  ${conj(spec.rows.map((id) => bendDef(spec.prefix, id, 'w')))}`,
    '',
  ]
  for (const [index, field] of spec.fields.entries()) {
    out.push(
      `def Adq.k_${field.name}(w: ${record}) -> ${bendType(field)}:`,
      '  match w:',
      `    case ${record}{${binders}}:`,
      `      v${index}`,
      '',
    )
  }
  for (const type of new Set(spec.fields.filter((field) => field.type !== 'Bool').map((field) => field.type))) {
    const { values } = spec.fields.find((field) => field.type === type)
    out.push(`def Adq.eq_${type}(a: M.${type}, b: M.${type}) -> Bool:`, '  match a b:')
    for (const x of values)
      for (const y of values) out.push(`    case M.${x}{} M.${y}{}:`, `      ${x === y ? 'True{}' : 'False{}'}`)
    out.push('')
  }
  const eq = (field, a, b) => (field.type === 'Bool' ? `Adq.eq(${a}, ${b})` : `Adq.eq_${field.type}(${a}, ${b})`)
  const at = (expr, w) => expr.replaceAll('(w)', `(${w})`)

  for (const obligation of obligations) {
    const { law, expr } = obligation
    if (obligation.shape === 'exists') {
      out.push(
        `law ${law}:`,
        `  exs w: ${record}`,
        `  {${expr} == True{} : Bool}`,
        '',
        `def ${law}():`,
        `  (${literal(obligation.world)}, {==})`,
        '',
      )
    } else if (obligation.shape === 'forall') {
      out.push(
        `law ${law}:`,
        `  for w: ${record}`,
        `  {${expr} == True{} : Bool}`,
        '',
        `def ${law}(w):`,
        '  match w:',
        cases('    '),
        '',
      )
    } else if (obligation.shape === 'pair') {
      const same = conj(key.map((field) => eq(field, access(field, 'w1'), access(field, 'w2'))))
      const claim = `Bool.and(Bool.and(Adq.valid(w1), Adq.valid(w2)), Bool.and(${same}, Bool.not(Adq.eq(${at(
        expr,
        'w1',
      )}, ${at(expr, 'w2')}))))`
      const [first, second] = obligation.worlds
      out.push(
        `law ${law}:`,
        `  exs w1: ${record}`,
        `  exs w2: ${record}`,
        `  {${claim} == True{} : Bool}`,
        '',
        `def ${law}():`,
        `  (${literal(first)}, (${literal(second)}, {==}))`,
        '',
      )
    } else if (obligation.shape === 'factor') {
      const decided = key.length === 0 ? `${law}_f` : `${law}_f(${key.map((field) => access(field, 'w')).join(', ')})`
      const claim = (f) => `Adq.imp(Adq.valid(w), Adq.eq(${expr}, ${f}))`
      if (key.length === 0) {
        const value = obligation.table.values().next().value ?? true
        out.push(
          `law ${law}:`,
          '  exs f: Bool',
          `  @w:${record} -> {${claim('f')} == True{} : Bool}`,
          '',
          `def ${law}_proof(w: ${record}) -> {${claim(value ? 'True{}' : 'False{}')} == True{} : Bool}:`,
          '  match w:',
          cases('    '),
          '',
          `def ${law}():`,
          `  (${value ? 'True{}' : 'False{}'}, ${law}_proof)`,
          '',
        )
        continue
      }
      const signature = key.map((field, index) => `k${index}: ${bendType(field)}`).join(', ')
      const parameters = key.map((_, index) => `k${index}`).join(' ')
      const applied = claim(['f(', key.map((field) => access(field, 'w')).join(', '), ')'].join(''))
      let combos = [[]]
      for (const field of key) combos = combos.flatMap((combo) => field.values.map((value) => [...combo, value]))
      // 유효 세계에 없는 좌표·관찰 조합은 판정이 무엇이든 법칙이 참이다(전제가 거짓) — True로 채운다.
      const tableValue = (combo) => obligation.table.get(stableStringify(combo)) ?? true
      const table = combos.flatMap((combo) => [
        `    case ${combo.map((entry, index) => bendValue(key[index], entry)).join(' ')}:`,
        `      ${tableValue(combo) ? 'True{}' : 'False{}'}`,
      ])
      out.push(
        `law ${law}:`,
        `  exs f: ${key.map(bendType).join(' -> ')} -> Bool`,
        `  @w:${record} -> {${applied} == True{} : Bool}`,
        '',
        `def ${law}_f(${signature}) -> Bool:`,
        `  match ${parameters}:`,
        ...table,
        '',
        `def ${law}_proof(w: ${record}) -> {${claim(decided)} == True{} : Bool}:`,
        '  match w:',
        cases('    '),
        '',
        `def ${law}():`,
        `  (${law}_f, ${law}_proof)`,
        '',
      )
    } else {
      const text = expr
        .replaceAll('LIT2', literal(obligation.world2 ?? obligation.world))
        .replaceAll('LIT', literal(obligation.world))
      out.push(
        `law ${law}:`,
        `  {${text} == ${obligation.expect ? 'True{}' : 'False{}'} : Bool}`,
        '',
        `def ${law}():`,
        '  {==}',
        '',
      )
    }
  }
  return out.join('\n')
}

/** 결론 파일을 세계 파일의 import 전부와 함께 임시 디렉터리에 두고 `bend ADEQUACY.bend --verdict`를 돌린다. */
export async function certify(search, spec, { worldPath, inputs, bin, timeoutMs = 120_000 }) {
  const text = adequacyProofFile(search.obligations, spec, `./${basename(worldPath)}`)
  const verdict = await verdictBeside({ entry: worldPath, inputs, fileName: 'ADEQUACY.bend', text, bin, timeoutMs })
  return { ...verdict, laws: search.obligations.length, bytes: Buffer.byteLength(text) }
}

/** 커널이 결론 파일 전체를 받아들이지 않으면 어느 점검도 확정하지 않는다 — 열거 결과는 searchStatus로만 남긴다. */
export function mergeKernel(checks, kernel) {
  if (kernel.status === 'proven') return checks
  const where = kernel.failedAt ? ` at ${kernel.failedAt}` : ''
  return checks.map(({ evidenceKind, ...check }) => ({
    ...check,
    searchStatus: check.status,
    status: 'unknown',
    reason: `kernel ${kernel.status}${where}${evidenceKind === 'enumeration' ? '' : ' — conclusion not certified'}`,
  }))
}

/**
 * 카드 한 장의 적절성 점검. status: proven(점검 전부 증명·커널 통과) · refuted(커널이 확인한 반례가 있다) ·
 * unknown(무한 필드·상한 초과·커널 실패) · not-run(Bend 없음). pass는 proven일 때뿐이다.
 */
export async function checkAdequacy({
  card,
  bin,
  cwd = process.cwd(),
  maxWorlds = MAX_WORLDS,
  timeoutMs = 120_000,
  out = null,
}) {
  const loaded = await loadWorld({ card, bin, cwd, maxWorlds, timeoutMs })
  if (loaded.result) return loaded.result
  const { spec, inputs, base, worldPath, model } = loaded
  const search = searchAdequacy(model, spec)
  const kernel = await certify(search, spec, { worldPath, inputs, bin, timeoutMs })
  const checks = mergeKernel(search.checks, kernel)
  let status = 'unknown'
  if (kernel.status === 'proven') status = checks.every((check) => check.status === 'proven') ? 'proven' : 'refuted'
  const result = {
    ...base,
    status,
    pass: status === 'proven',
    counts: search.counts,
    checks,
    minimalPairs: search.minimalPairs,
    minimalPairsTotal: search.minimalPairsTotal,
    sensitivity: assumptionSensitivity(evaluateWorlds(model, spec), spec),
    kernel,
    bend: { bin, version: reportedVersion(bin) },
  }
  if (!out) return result
  // 남긴 파일이 증거다 — 결론 법칙과 증명 전부. 다시 검사: out에서 `bend ADEQUACY.bend --verdict`.
  const header = [
    `# Generated by oracle-adequacy.mjs check from ${base.card} — DO NOT EDIT.`,
    `# inputDigest ${base.inputDigest}; re-check with \`bend ADEQUACY.bend --verdict\` in this directory.`,
    '',
  ].join('\n')
  const kept = await keepArtifact({
    out,
    fileName: 'ADEQUACY.bend',
    entry: worldPath,
    render: (importPath) => `${header}${adequacyProofFile(search.obligations, spec, importPath)}`,
    result,
  })
  return { ...result, artifacts: kept }
}

/**
 * 카드 → 세계 모델 로드(스펙·입력 digest·컴파일된 def). 무한 필드·상한 초과는 unknown, Bend 없음은 not-run 결과를
 * `result`로 돌려준다 — 부르는 쪽은 그 결과를 그대로 낸다.
 */
export async function loadWorld({ card, bin, cwd = process.cwd(), maxWorlds = MAX_WORLDS, timeoutMs = 120_000 }) {
  const cardText = await readFile(card, 'utf8')
  const lines = cardText.split('\n')
  const world = parseAdequacy(lines)?.fields.World?.match(/^(S\d+)\s+([A-Z]\w*)$/)
  const location = world ? sourceLocation(lines, world[1]) : ''
  if (!location.startsWith('repo:'))
    throw new CliError('ADEQUACY_SPEC', 'Adequacy World must cite a repo: Source Registry source')
  const repoPath = location.slice('repo:'.length).split('#')[0]
  const worldPath = resolve(cwd, repoPath)
  const spec = adequacySpec(cardText, await readFile(worldPath, 'utf8'))
  const inputs = await bendInputs(worldPath)
  const base = {
    adequacyVersion: ADEQUACY_VERSION,
    card: relative(cwd, resolve(card)),
    world: { source: spec.source, path: repoPath, prefix: spec.prefix, fields: spec.fields },
    inputDigest: sha256(
      stableStringify({
        version: ADEQUACY_VERSION,
        world: inputs.map(({ path, sha256: digest }) => [relative(dirname(worldPath), path), digest]).sort(),
        card: spec.digestInput,
      }),
    ),
    outside: spec.outside,
    independence: {
      evidence: 'self-reported',
      reason: 'host receipts do not cover the model analyst before the lock yet',
    },
  }
  const unsupported = spec.fields.filter((field) => field.values === null)
  const total = spec.fields.reduce((count, field) => count * (field.values?.length ?? 1), 1)
  if (unsupported.length > 0 || total > maxWorlds) {
    const reason =
      unsupported.length > 0
        ? `fields without a finite domain: ${unsupported.map(({ name, type }) => [name, type].join(': ')).join(', ')}`
        : `${total} worlds exceed max-worlds ${maxWorlds}`
    return { result: { ...base, status: 'unknown', pass: false, reason, checks: [] } }
  }
  let compiled
  try {
    compiled = await compileBend({ entry: worldPath, bin, timeoutMs })
  } catch (error) {
    if (error.code !== 'BEND_UNAVAILABLE') throw error
    return { result: { ...base, status: 'not-run', pass: false, reason: error.message, checks: [] } }
  }
  const model = {
    call: (name, value) => {
      const fn = compiled.exported[name]
      if (typeof fn !== 'function')
        throw new CliError('ADEQUACY_DEF_MISSING', `${basename(worldPath)} does not define ${name}`)
      return fn(structuredClone(value))
    },
  }
  return { spec, inputs, base, worldPath, model, cardText }
}

/**
 * 세계 모델 대응 검사 — 좌표(조작 가능한 필드)의 모든 조합을 adapter.run으로 제품에 걸고, 돌아온 관찰값으로 유효
 * 세계를 찾아 카드 행을 판정한다. 좌표·관찰에 맞는 유효 세계가 없으면 model-gap: 제품이 세계 모델이 불가능하다고 한
 * 결과를 냈다(모델 밖 현상 — 문제 정의를 다시 연다). 가정이 제외한 좌표 조합은 실행하지 않고 excluded로 보고한다.
 * card-observable이 증명된 카드에서만 판정이 좌표·관찰로 정해진다 — 판정이 갈리는 세계가 섞이면 unknown이다.
 */
export async function conformWorld({ card, adapter, bin, cwd = process.cwd(), maxWorlds, timeoutMs }) {
  if (typeof adapter?.run !== 'function')
    throw new CliError('ADAPTER_INTERFACE', 'a world adapter exports run(coordinates) → observations')
  const loaded = await loadWorld({ card, bin, cwd, ...(maxWorlds ? { maxWorlds } : {}), timeoutMs })
  if (loaded.result) return { ...loaded.result, settings: [] }
  const { spec, base, model } = loaded
  const worlds = evaluateWorlds(model, spec).filter((world) => world.valid)
  const field = (name) => spec.fields.find((entry) => entry.name === name)
  let settings = [{}]
  for (const name of spec.coordinates)
    settings = settings.flatMap((partial) => field(name).values.map((value) => ({ ...partial, [name]: value })))
  const results = []
  for (const coordinates of settings) {
    const candidates = worlds.filter((world) =>
      spec.coordinates.every((name) => world.plain[name] === coordinates[name]),
    )
    if (candidates.length === 0) {
      results.push({ coordinates, status: 'excluded', reason: 'the assumptions allow no world with these coordinates' })
      continue
    }
    let observations
    try {
      observations = await adapter.run(structuredClone(coordinates))
      for (const name of spec.observations) {
        if (!field(name).values.includes(observations?.[name]))
          throw new Error(
            `observation ${name} is ${JSON.stringify(observations?.[name])}, not one of ${JSON.stringify(
              field(name).values,
            )}`,
          )
      }
    } catch (error) {
      results.push({ coordinates, status: 'adapter-error', error: error?.message ?? String(error) })
      continue
    }
    const matches = candidates.filter((world) =>
      spec.observations.every((name) => world.plain[name] === observations[name]),
    )
    if (matches.length === 0) {
      results.push({
        coordinates,
        observations,
        status: 'model-gap',
        route:
          'the product produced a result the world model calls impossible — reopen the problem definition (DIMENSION_MISSING or a wrong assumption); never force it into the nearest world',
      })
      continue
    }
    const verdicts = new Set(matches.map((world) => world.card))
    if (verdicts.size > 1) {
      results.push({
        coordinates,
        observations,
        status: 'unknown',
        reason:
          'the rows are not a function of the coordinates and observations — run the check (card-observable) first',
      })
      continue
    }
    const failed = spec.rows.filter((id) => !matches[0].truth[id])
    results.push({
      coordinates,
      observations,
      status: failed.length === 0 ? 'pass' : 'violation',
      ...(failed.length > 0 ? { rows: failed } : {}),
    })
  }
  const run = results.filter((entry) => entry.status !== 'excluded')
  const pass = run.length > 0 && run.every((entry) => entry.status === 'pass')
  return {
    ...base,
    status: pass ? 'pass' : 'fail',
    pass,
    settings: results,
    verification: {
      level: 'conformance-tested',
      strategy: 'exhaustive',
      coordinates: spec.coordinates,
      executed: run.length,
      excluded: results.length - run.length,
      claim:
        'the product satisfies every row on every coordinate setting the assumptions allow; with card-implies-goal proven, the goals follow only while the assumptions hold and the observation paths are faithful — not a proof about the product',
    },
  }
}

function anchoredSection(text, anchor) {
  if (!anchor) return text
  const lines = text.split('\n')
  const start = lines.findIndex((line) => {
    const heading = line.match(/^(#+)\s(.*)$/)
    return heading && heading[2].trim().toLowerCase().replaceAll(/\W+/g, '-') === anchor
  })
  if (start === -1) return text
  const level = lines[start].match(/^#+/)[0].length
  const end = lines.findIndex((line, index) => index > start && new RegExp(`^#{1,${level}}\\s`).test(line))
  return lines.slice(start, end === -1 ? lines.length : end).join('\n')
}

/**
 * 모델 분석가 입력 — 원문과 Outcome Brief, 위험 목록, 세계 모델 작성 규칙만 담는다. 카드의 행·Case space·Terms·
 * Adequacy·Formal Model, 모델 파일, 제품 코드와 테스트는 넣지 않는다: 두 해석이 서로 기대면 대조할 차이가 사라진다.
 */
async function sourceTexts(lines, cwd) {
  const registry = sectionOf(lines, '## Source Registry') ?? []
  const table = tablesOf(registry)[0]
  const column = table?.header.find((name) => /Location|위치/.test(name))
  const sources = []
  for (const row of table?.rows ?? []) {
    const location = row[column] ?? ''
    if (!location.startsWith('repo:')) continue
    const [repoPath, anchor] = location.slice('repo:'.length).split('#')
    if (repoPath.endsWith('.bend')) continue
    const text = await readFile(resolve(cwd, repoPath), 'utf8').catch(() => null)
    sources.push(
      `### ${row.ID} ${location}`,
      '',
      text === null ? '(unreadable)' : anchoredSection(text, anchor).trimEnd(),
      '',
    )
  }
  return { registry, sources }
}

export async function modelInput({ card, cwd = process.cwd() }) {
  const lines = (await readFile(card, 'utf8')).split('\n')
  const { registry, sources } = await sourceTexts(lines, cwd)
  const rules = sectionOf((await readFile(REFERENCE, 'utf8')).split('\n'), '## World model authoring') ?? []
  return [
    '# Model analyst input',
    '',
    'Write the world model, assumptions and goals from this input only. Do not open the Oracle card, its rows, the product code or its tests.',
    '',
    '## Outcome Brief',
    ...(sectionOf(lines, '## Outcome Brief') ?? []),
    '## Source Registry',
    ...registry,
    '## Source text',
    '',
    ...sources,
    '## Hazards',
    '',
    ...Object.entries(HAZARDS).map(([id, text]) => `- ${id}: ${text}`),
    '',
    '## World model authoring',
    ...rules,
  ].join('\n')
}

const EXPLORER_SCHEMA = {
  candidates: [
    {
      id: 'X1',
      kind: 'in-world | new-fact | qualifier',
      scenario: 'the steps, in the user’s terms',
      harm: 'what the user loses, and which source sentence says it matters',
      world: 'in-world only: a world literal, e.g. start !held committed ack reload',
      newFact: {
        name: 'new-fact only',
        category: 'controllable | observable | hidden',
        observedVia: 'the product path that shows it, or —',
      },
      whyOutside: 'new-fact only: why no field of the world expresses it',
      sourceText: 'qualifier only: the exact source words the rows dropped, e.g. "while the retention conditions hold"',
      rows: ['qualifier only: the O* rows that state more or less than the source'],
      sources: ['S1'],
    },
  ],
}

/**
 * AI 탐색가 입력 — 기존 reverse-impossible 리뷰어가 받는다. 모델 분석가와 달리 카드 전체를 본다: 역할이 공격이다.
 * 원문·Outcome Brief·카드 행·Terms·Adequacy에 더해, 가정 끄기 결과와 모델 밖 목록을 붙인다.
 */
export async function exploreInput({ card, bin, cwd = process.cwd(), timeoutMs }) {
  const loaded = await loadWorld({ card, bin, cwd, timeoutMs })
  if (loaded.result) throw new CliError('EXPLORE_WORLD', `the world cannot be enumerated: ${loaded.result.reason}`)
  const { spec, model, cardText, base } = loaded
  const lines = cardText.split('\n')
  const { sources } = await sourceTexts(lines, cwd)
  const worlds = evaluateWorlds(model, spec)
  const section = (heading) => sectionOf(lines, heading) ?? []
  return [
    '# Oracle space explorer input',
    '',
    'Every row of this card passes and the adequacy checks are proven inside the declared world. Your job is to break that:',
    'find situations where every row passes and the user is still harmed. Three kinds count:',
    '',
    '- `in-world`: the harm is expressible with the existing fields. Give the world literal. The tool checks it mechanically.',
    '- `new-fact`: the harm needs a fact the world does not have (another tab, a retry, a cache, an analytics call, a stale token, ...).',
    '  Name the fact, its category and the product path that would show it, and say why no existing field expresses it.',
    '- `qualifier`: a condition of the source text (while, unless, within, except, only if) that the rows dropped, so the card',
    '  promises more or less than the source. Quote the words and name the rows.',
    '',
    'Ground every candidate in the source text; a candidate without a source-backed harm is noise. Return only JSON of this shape:',
    '',
    '```json',
    JSON.stringify(EXPLORER_SCHEMA, null, 2),
    '```',
    '',
    '## Outcome Brief',
    ...section('## Outcome Brief'),
    '## Source text',
    '',
    ...sources,
    '## Behavior Contract',
    ...section('## Behavior Contract'),
    '## Terms',
    ...section('## Terms'),
    '## Adequacy',
    ...section('## Adequacy'),
    '## Assumption sensitivity (computed)',
    '',
    ...assumptionSensitivity(worlds, spec).flatMap((entry) => [
      `- ${entry.assumption}: without it the rows allow ${entry.cardAllows} more worlds; ${entry.reading}.`,
      ...entry.worlds.map(({ world }) => `  - ${literalOf(world, spec.fields)}`),
    ]),
    '',
    '## Outside the world (declared)',
    '',
    `- Rows outside the world: ${base.outside.rows || 'none'}`,
    ...base.outside.hazards.map((row) => `- hazard ${row.Hazard}: ${row.Disposition}`),
    ...base.outside.harness.map((id) => `- ${id} is a harness limit: the worlds it excludes are untested`),
  ].join('\n')
}

function literalOf(plain, fields) {
  return fields
    .map((field) => {
      if (field.type !== 'Bool') return `${field.name}=${plain[field.name]}`
      return plain[field.name] ? field.name : `!${field.name}`
    })
    .join(' ')
}

/**
 * 탐색가 후보 분류 — 기계로 판정할 수 있는 것은 판정하고, 새 사실은 후보 축으로 남긴다. 무엇도 공간에 자동으로
 * 들어가지 않는다: 후보는 Open question·journal로 가고, 승격 게이트와 사람 승인을 거친다.
 */
export async function triageCandidates({ card, candidates, bin, cwd = process.cwd(), timeoutMs }) {
  const loaded = await loadWorld({ card, bin, cwd, timeoutMs })
  if (loaded.result) throw new CliError('EXPLORE_WORLD', `the world cannot be enumerated: ${loaded.result.reason}`)
  const { spec, model } = loaded
  const worlds = new Map(evaluateWorlds(model, spec).map((world) => [worldKey(world.plain), world]))
  const list = candidates?.candidates
  if (!Array.isArray(list)) throw new CliError('EXPLORE_OUTPUT', 'candidates must be {"candidates": [...]}')
  const fieldNames = new Set(spec.fields.map(({ name }) => name))
  const safety = spec.goals.filter((goal) => goal.kind === 'safety')
  const triaged = list.map((candidate) => {
    const base = { id: candidate?.id ?? null, kind: candidate?.kind ?? null, scenario: candidate?.scenario ?? '' }
    const missing = ['id', 'kind', 'scenario', 'harm'].filter(
      (key) => typeof candidate?.[key] !== 'string' || !candidate[key].trim(),
    )
    if (missing.length > 0) return { ...base, verdict: 'invalid', reason: `missing ${missing.join(', ')}` }
    if (!Array.isArray(candidate.sources) || candidate.sources.length === 0)
      return { ...base, verdict: 'invalid', reason: 'a candidate cites the source text (sources)' }
    if (candidate.kind === 'in-world') {
      const { plain, errors } = parseWorldLiteral(candidate.world ?? '', spec.fields)
      if (errors.length > 0) return { ...base, verdict: 'invalid', reason: errors.join('; ') }
      const world = worlds.get(worldKey(plain))
      if (!world.valid) {
        const against = spec.assumptions.filter((id) => !world.truth[id])
        return {
          ...base,
          verdict: 'assumption-challenge',
          assumptions: against,
          owners: Object.fromEntries(against.map((id) => [id, spec.owners?.[id] ?? ''])),
          route: `the assumptions ${against.join(', ')} exclude this world`,
          options: [
            'the source calls it harmful → add a goal and a row; if the product guarantees the assumption, it was a goal all along',
            'the source is silent → a policy question (Open question), not a goal',
            'the assumption only reflects what the harness cannot build (Owner: harness) → the world stays untested and listed outside the space',
          ],
        }
      }
      if (!world.card) {
        const rows = spec.rows.filter((id) => !world.truth[id])
        return { ...base, verdict: 'covered', rows, route: `the rows ${rows.join(', ')} already reject this world` }
      }
      const violated = safety.filter((goal) => !world.truth[goal.id]).map((goal) => goal.id)
      if (violated.length > 0) {
        return {
          ...base,
          verdict: 'contradiction',
          goals: violated,
          route:
            'the rows allow a world that violates a goal — re-run the adequacy check; card-implies-goal should have refuted this card',
        }
      }
      return {
        ...base,
        verdict: 'goal-gap',
        route:
          'the rows allow it and every goal holds, yet the source calls it harmful — a candidate goal: Open question with the source sentence',
      }
    }
    if (candidate.kind === 'new-fact') {
      const fact = candidate.newFact ?? {}
      if (typeof fact.name !== 'string' || !fact.name.trim())
        return { ...base, verdict: 'invalid', reason: 'newFact.name is required' }
      if (fieldNames.has(fact.name))
        return {
          ...base,
          verdict: 'invalid',
          reason: `${fact.name} is already a field — state it as an in-world candidate`,
        }
      if (!['controllable', 'observable', 'hidden'].includes(fact.category))
        return { ...base, verdict: 'invalid', reason: 'newFact.category must be controllable | observable | hidden' }
      if (fact.category === 'observable' && (!fact.observedVia || fact.observedVia === '—'))
        return { ...base, verdict: 'invalid', reason: 'an observable fact names the product path that shows it' }
      return {
        ...base,
        verdict: 'candidate-axis',
        fact,
        question: `Should the world model the ${fact.category} fact "${
          fact.name
        }" (${candidate.scenario.trim()})? Harm: ${candidate.harm.trim()} Sources: ${candidate.sources.join(', ')}.`,
        route:
          'promotion gate (expressible with existing axes? implementation detail? recurs elsewhere? matters to the user? observable?) → Open question → a new revision',
      }
    }
    if (candidate.kind === 'qualifier') {
      const rows = Array.isArray(candidate.rows) ? candidate.rows : []
      if (typeof candidate.sourceText !== 'string' || !candidate.sourceText.trim())
        return { ...base, verdict: 'invalid', reason: 'a qualifier quotes the source words (sourceText)' }
      if (rows.length === 0 || !rows.every((id) => /^O\d+$/.test(id)))
        return { ...base, verdict: 'invalid', reason: 'a qualifier names the O* rows that dropped it (rows)' }
      return {
        ...base,
        verdict: 'dropped-qualifier',
        rows,
        route: `restate the scope of ${rows.join(
          ', ',
        )} with "${candidate.sourceText.trim()}" and define it in ## Terms (open → Open question) — the card must not promise more or less than the source`,
      }
    }
    return { ...base, verdict: 'invalid', reason: 'kind must be in-world | new-fact | qualifier' }
  })
  const summary = {}
  for (const { verdict } of triaged) summary[verdict] = (summary[verdict] ?? 0) + 1
  return {
    triaged,
    summary,
    note: 'nothing enters the space automatically — candidates go to Open questions or the journal',
  }
}

function parseOptions(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]?.replace(/^--/, '')
    const value = args[index + 1]
    if (
      !['card', 'max-worlds', 'timeout-ms', 'output', 'adapter', 'candidates', 'out'].includes(name) ||
      value === undefined
    ) {
      throw new CliError('USAGE', `Unknown or incomplete option: ${args[index]}`, 2)
    }
    options[name] = value
  }
  return options
}

const USAGE = `usage:
  oracle-adequacy.mjs check --card <oracle.md> [--out <dir>] [--max-worlds <n>] [--timeout-ms <n>]
  oracle-adequacy.mjs conform --card <oracle.md> --adapter <world-adapter.mjs>
  oracle-adequacy.mjs model-input --card <oracle.md> --output <file>
  oracle-adequacy.mjs explore-input --card <oracle.md> --output <file>
  oracle-adequacy.mjs triage --card <oracle.md> --candidates <explorer-output.json>`

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!['check', 'conform', 'model-input', 'explore-input', 'triage'].includes(command))
    throw new CliError('USAGE', USAGE, 2)
  const options = parseOptions(args)
  if (!options.card) throw new CliError('USAGE', USAGE, 2)
  if (command === 'model-input') {
    if (!options.output) throw new CliError('USAGE', USAGE, 2)
    await writeFile(options.output, await modelInput({ card: options.card }))
    process.stdout.write(`MODEL_INPUT_WRITTEN ${options.output}\n`)
    return
  }
  const { bin } = await ensureBend()
  const timeoutMs = options['timeout-ms'] ? Number(options['timeout-ms']) : undefined
  if (command === 'explore-input') {
    if (!options.output) throw new CliError('USAGE', USAGE, 2)
    await writeFile(options.output, await exploreInput({ card: options.card, bin, timeoutMs }))
    process.stdout.write(`EXPLORE_INPUT_WRITTEN ${options.output}\n`)
    return
  }
  if (command === 'triage') {
    if (!options.candidates) throw new CliError('USAGE', USAGE, 2)
    const candidates = JSON.parse(await readFile(options.candidates, 'utf8'))
    process.stdout.write(
      `${JSON.stringify(await triageCandidates({ card: options.card, candidates, bin, timeoutMs }))}\n`,
    )
    return
  }
  if (command === 'conform') {
    if (!options.adapter) throw new CliError('USAGE', USAGE, 2)
    const adapter = await import(pathToFileURL(resolve(options.adapter)).href)
    const result = await conformWorld({ card: options.card, adapter, bin, timeoutMs })
    process.stdout.write(`${JSON.stringify(result)}\n`)
    process.exitCode = result.pass ? 0 : 1
    return
  }
  const result = await checkAdequacy({
    card: options.card,
    bin,
    ...(options['max-worlds'] ? { maxWorlds: Number(options['max-worlds']) } : {}),
    ...(timeoutMs ? { timeoutMs } : {}),
    ...(options.out ? { out: options.out } : {}),
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode = result.pass ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    const cliError =
      error instanceof CliError ? error : new CliError(error.code ?? 'ADEQUACY_FAILED', error.message ?? String(error))
    process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
    process.exitCode = cliError.exitCode
  }
}
