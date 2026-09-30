#!/usr/bin/env node

// 오라클 공간 적절성 — 카드의 좌표·관찰이 원문 목표를 가려낼 만큼 충분한지, 카드가 목표보다 약하지 않은지를 잠긴 세계
// 모델(유한 레코드) 위에서 검사한다. 모든 세계를 열거해 증명 또는 반례를 찾고, 그 결론을 Bend 커널이 다시 검사하는
// 파일로 쓴다. 세계 모델에 없는 현상은 찾지 못한다 — 결론은 선언한 세계 안에서만 성립한다.

import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { ensureBend, reportedVersion } from './ensure-bend.mjs'
import { sha256, stableStringify } from './oracle-fs.mjs'
import { bendInputs, compileBend, lockScopeIssues, toPlain, verdictOf } from './oracle-model.mjs'

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
const TERM_COLUMNS = [
  'Term',
  'Context',
  'Name',
  'Category',
  'Field',
  'Observed via',
  'Definition',
  'Not',
  'Source',
  'Status',
]
const ADEQUACY_FIELDS = ['World', 'Coordinates', 'Observations', 'Rows', 'Rows outside the world']
const REFERENCE = fileURLToPath(new URL('../references/adequacy.md', import.meta.url))
const SUGGESTIONS = {
  controllable: (field) => `add ${field} to Coordinates — the test sets it`,
  observable: (field) => `add ${field} to Observations — the test reads it`,
  hidden: (field) =>
    `${field} is hidden — register a product observation path for it in ## Terms (observable + Observed via) or record an Open question; never read it from a test double (OBSERVATION_GAP)`,
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
  return { header: table?.header ?? [], rows: table?.rows ?? [] }
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
      const observed = Boolean(row['Observed via']) && row['Observed via'] !== '—'
      if ((row.Category === 'observable') !== observed)
        issues.push(
          `terms-observed-via: ${id}: an observable term names the product path that reads it; other terms have —`,
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
    },
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
  const worlds = enumerateWorlds(spec.fields).map((world) => {
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

function commonDirectory(directories) {
  return directories.reduce((common, directory) => {
    const left = common.split(sep)
    const right = directory.split(sep)
    let index = 0
    while (index < left.length && left[index] === right[index]) index += 1
    return left.slice(0, index).join(sep) || sep
  })
}

/** 결론 파일을 세계 파일의 import 전부와 함께 임시 디렉터리에 두고 `bend ADEQUACY.bend --verdict`를 돌린다. */
export async function certify(search, spec, { worldPath, inputs, bin, timeoutMs = 120_000 }) {
  const text = adequacyProofFile(search.obligations, spec, `./${basename(worldPath)}`)
  const directory = await mkdtemp(join(tmpdir(), 'oracle-adequacy-'))
  try {
    const root = commonDirectory(inputs.map(({ path }) => dirname(path)))
    for (const { path } of inputs) {
      const target = join(directory, relative(root, path))
      await mkdir(dirname(target), { recursive: true })
      await copyFile(path, target)
    }
    const cwd = join(directory, relative(root, dirname(worldPath)))
    await writeFile(join(cwd, 'ADEQUACY.bend'), text)
    const run = spawnSync(bin, ['ADEQUACY.bend', '--verdict'], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, BEND_NO_TELEMETRY: '1' },
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
    })
    return { ...verdictOf(run, { bin, timeoutMs }), laws: search.obligations.length, bytes: Buffer.byteLength(text) }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
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
export async function checkAdequacy({ card, bin, cwd = process.cwd(), maxWorlds = MAX_WORLDS, timeoutMs = 120_000 }) {
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
    return { ...base, status: 'unknown', pass: false, reason, checks: [] }
  }
  let compiled
  try {
    compiled = await compileBend({ entry: worldPath, bin, timeoutMs })
  } catch (error) {
    if (error.code !== 'BEND_UNAVAILABLE') throw error
    return { ...base, status: 'not-run', pass: false, reason: error.message, checks: [] }
  }
  const model = {
    call: (name, value) => {
      const fn = compiled.exported[name]
      if (typeof fn !== 'function')
        throw new CliError('ADEQUACY_DEF_MISSING', `${basename(worldPath)} does not define ${name}`)
      return fn(structuredClone(value))
    },
  }
  const search = searchAdequacy(model, spec)
  const kernel = await certify(search, spec, { worldPath, inputs, bin, timeoutMs })
  const checks = mergeKernel(search.checks, kernel)
  let status = 'unknown'
  if (kernel.status === 'proven') status = checks.every((check) => check.status === 'proven') ? 'proven' : 'refuted'
  return {
    ...base,
    status,
    pass: status === 'proven',
    counts: search.counts,
    checks,
    minimalPairs: search.minimalPairs,
    minimalPairsTotal: search.minimalPairsTotal,
    kernel,
    bend: { bin, version: reportedVersion(bin) },
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
export async function modelInput({ card, cwd = process.cwd() }) {
  const lines = (await readFile(card, 'utf8')).split('\n')
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

function parseOptions(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]?.replace(/^--/, '')
    const value = args[index + 1]
    if (!['card', 'max-worlds', 'timeout-ms', 'output'].includes(name) || value === undefined) {
      throw new CliError('USAGE', `Unknown or incomplete option: ${args[index]}`, 2)
    }
    options[name] = value
  }
  return options
}

const USAGE = `usage:
  oracle-adequacy.mjs check --card <oracle.md> [--max-worlds <n>] [--timeout-ms <n>]
  oracle-adequacy.mjs model-input --card <oracle.md> --output <file>`

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!['check', 'model-input'].includes(command)) throw new CliError('USAGE', USAGE, 2)
  const options = parseOptions(args)
  if (!options.card) throw new CliError('USAGE', USAGE, 2)
  if (command === 'model-input') {
    if (!options.output) throw new CliError('USAGE', USAGE, 2)
    await writeFile(options.output, await modelInput({ card: options.card }))
    process.stdout.write(`MODEL_INPUT_WRITTEN ${options.output}\n`)
    return
  }
  const { bin } = await ensureBend()
  const result = await checkAdequacy({
    card: options.card,
    bin,
    ...(options['max-worlds'] ? { maxWorlds: Number(options['max-worlds']) } : {}),
    ...(options['timeout-ms'] ? { timeoutMs: Number(options['timeout-ms']) } : {}),
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
