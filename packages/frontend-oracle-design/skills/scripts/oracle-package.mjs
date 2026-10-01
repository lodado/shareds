#!/usr/bin/env node

// Oracle model package — the model-first input. Source text and the author's reading of it enter here, before any
// card exists: sources (verbatim, located), the Outcome reading, policies, the world record and its terms, goals,
// assumptions, contract predicates named by model symbols, and optionally the Bend behavior model. Everything the
// tools need structurally is read from this one file and the Bend files it names; the Oracle card is projected from
// it (a generated region plus human-edited sections), so the card, the axes and the generated tests share one
// meaning instead of three hand copies. The package never records user approval by itself: approval values are
// copied verbatim from what the author recorded, and User Confirmation stays a human-edited card section.

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { sha256, stableStringify } from './oracle-fs.mjs'
import { parseBendTypesStrict, typeIR } from './oracle-types.mjs'

export const PACKAGE_VERSION = 1
export const DERIVE_VERSION = 1
export const PROJECT_VERSION = 1
export const FAMILIES = ['Data', 'Value', 'Async', 'Order', 'Entry', 'Environment', 'Platform', 'Inherited']
export const WORLD_ROLES = ['controllable', 'observable', 'hidden', 'concept']
export const GOAL_AUTHORS = ['analyst', 'controller']
export const LAW_KINDS = ['safety', 'effect', 'witness']

// 투영된 카드가 init에서 등록해야 하는 필수 검증 스택의 라벨.
export const STACK_LABELS = ['bend-proof:reported', 'bend-adequacy:reported', 'type-contract:reported', 'fast-check:reported']

/**
 * 패키지가 노출 타입 경계 없음을 조사한 경로와 함께 선언하면 카드의 생성 영역에 `## Type Contract` 절이 생기고, 그때만
 * type-contract 라벨을 요구하지 않는다. 생성 영역 밖의 같은 문장은 선언이 아니다(생성 영역은 패키지에서 다시 만들어 비교한다).
 */
export function stackLabelsFor(content = '') {
  return /^## Type Contract\n\n- Not applicable: \S/m.test(content)
    ? STACK_LABELS.filter((label) => label !== 'type-contract:reported')
    : STACK_LABELS
}
// oracle-adequacy.mjs HAZARDS와 같은 목록이다 — 순환 import를 피하려고 이름만 둔다(테스트가 두 목록의 일치를 확인한다).
export const HAZARD_IDS = [
  'permission-change',
  'concurrent-change',
  'display-vs-commit',
  'effect-count',
  'identity-reference',
  'feature-composition',
  'carry-over',
  'order-timing',
]
// Discovery 레지스트리 — 발견 연산자 카탈로그의 ID는 oracle-discovery.mjs의 OPERATORS와 같다(테스트가 일치를 확인한다).
export const OPERATOR_IDS = [
  'requirement-coverage',
  'observation-sufficiency',
  'goal-implication',
  'goal-witness',
  'assumption-sensitivity',
  'temporal-order',
  'trace-extension',
  'boundary-perturbation',
  'order-perturbation',
  'projection-residue',
  'world-model-gap',
  'mutation',
  'metamorphic',
  'dependency-failure',
  'latency',
  'environment-variation',
  'malformed-input',
  'concurrency',
  'ai-explorer',
  'cross-agent',
]
// 도구가 일반적으로 만들어 낼 수 없는 계열 — 모델이 그 현상을 표현하면 `modeled: <축>`, 아니면 출처가 있는 n/a.
export const DECLARED_OPERATORS = ['dependency-failure', 'latency', 'environment-variation', 'malformed-input', 'concurrency']
export const AI_OPERATORS = ['ai-explorer', 'cross-agent']
export const FAULT_CLASSES = [
  'conditional',
  'boundary',
  'state-transition',
  'permission',
  'retry',
  'timeout',
  'error-suppression',
  'ordering',
  'caching',
  'stale-data',
]
export const DECISIONS = ['promoted', 'covered', 'out-of-scope', 'equivalent', 'accepted-risk', 'rejected']
export const AXIS_ORIGINS = ['source', 'model', 'counterexample', 'incident', 'analyst', 'review']
export const TESTABILITY = ['tested', 'monitored', 'untestable']
export const ASSUMPTION_STATUS = ['open', 'confirmed', 'refuted']
export const LIFECYCLE_KEYS = ['valid', 'invalid', 'transitions', 'owner', 'lifetime', 'invariant']
const SOURCE_KINDS = ['product-policy', 'mandatory-constraint', 'project-constraint', 'implementation-reference']
const RISKS = ['Low', 'Medium', 'High']
const BEGIN = '<!-- oracle:generated:begin'
const END = '<!-- oracle:generated:end -->'

export class PackageError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

const nonEmpty = (value) => typeof value === 'string' && value.trim() !== '' && value.trim() !== '—'
const repoPathOf = (location) =>
  typeof location === 'string' && location.startsWith('repo:') ? location.slice('repo:'.length).split('#')[0] : null

/** 객체 안의 모든 문자열 값과 그 경로. */
function stringsOf(value, path = 'package') {
  if (typeof value === 'string') return [[path, value]]
  if (Array.isArray(value)) return value.flatMap((entry, index) => stringsOf(entry, `${path}[${index}]`))
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([key, entry]) => stringsOf(entry, `${path}.${key}`))
  return []
}

/** 계약 행 고정값 검사 — 모델 단계에서도 돈다(행 배정이 잘못된 고정값에서 멈추거나 두 키에 같은 ID를 주지 않게). */
function contractRowIssues(contract) {
  const issues = []
  const pinned = new Set()
  const defs = new Map()
  for (const entry of contract ?? []) {
    if (entry?.row !== undefined) {
      if (typeof entry.row !== 'string' || !/^O\d+$/.test(entry.row) || pinned.has(entry.row))
        issues.push(`package-contract-row: ${entry?.key}: row must be a unique O* ID`)
      pinned.add(entry.row)
    }
    if (entry?.def) {
      if (defs.has(entry.def))
        issues.push(
          `package-contract-def-duplicate: ${entry.key} and ${defs.get(entry.def)} name the same def ${
            entry.def
          } — one predicate is one row`,
        )
      defs.set(entry.def, entry.key)
    }
  }
  return issues
}

/**
 * 패키지 파일 → { pkg, path, dir, root, text }. JSON이 아니면 멈춘다. root는 `repo:` 경로의 기준 — 카드의 Source Registry와
 * 같이 저장소 루트(도구를 부르는 cwd)다. 잠긴 카드가 `.ai/oracles/<id>/`로 복사돼도 같은 경로가 같은 파일을 가리킨다.
 */
export async function loadPackage(path, { root = process.cwd() } = {}) {
  const absolute = resolve(root, path)
  const text = await readFile(absolute, 'utf8').catch((error) => {
    throw new PackageError('PACKAGE_UNREADABLE', `${path}: ${error.message}`)
  })
  let pkg
  try {
    pkg = JSON.parse(text)
  } catch (error) {
    throw new PackageError('PACKAGE_INVALID', `${path}: ${error.message}`)
  }
  return { pkg, path: absolute, dir: dirname(absolute), root: resolve(root), text }
}

/** 패키지의 `repo:` 경로는 저장소 루트 기준이다 — 카드의 Source Registry에 그대로 옮겨도 같은 파일을 가리킨다. */
export function sourcePath(loaded, id) {
  const source = loaded.pkg.sources?.find((entry) => entry.id === id)
  const repoPath = repoPathOf(source?.location)
  return repoPath ? resolve(loaded.root, repoPath) : null
}

/**
 * 구조 검사 — 연결·범주·출처만 본다. 모델 작성 단계에 필요한 것(출처·목표·세계·용어)은 카드 없이 검사되고, 카드 행 ID는
 * 요구하지 않는다: 계약 술어는 모델 심볼(def 이름)로 불리고 O* ID는 투영이 붙인다(`row`로 고정할 수 있다).
 * stage: 'model'(분석·모델 작성 — 계약·투영 필드는 선택) | 'project'(카드 투영 — 전부 필요).
 */
export function packageIssues(pkg, { stage = 'project' } = {}) {
  const issues = []
  const push = (code, message) => issues.push(`${code}: ${message}`)
  // 패키지 문자열은 카드의 한 줄·한 칸으로 들어간다 — 줄바꿈이나 HTML 주석 표식이 있으면 생성 영역 안에 제목(예: User
  // Confirmation)이나 영역 끝 표식을 끼워 넣을 수 있다. 생성기가 승인을 쓰는 통로가 되지 않게 전부 거부한다.
  for (const [path, value] of stringsOf(pkg))
    if (/[\r\n]|<!--|-->/.test(value))
      push('package-text-unsafe', `${path} contains a line break or an HTML comment marker`)
  if (pkg?.packageVersion !== PACKAGE_VERSION) push('package-version', `packageVersion must be ${PACKAGE_VERSION}`)
  if (!/^[a-z][\w-]*$/.test(pkg?.id ?? '')) push('package-id', 'id must be a lowercase identifier')

  const sources = new Map()
  for (const source of pkg?.sources ?? []) {
    if (!/^S\d+$/.test(source?.id ?? '') || sources.has(source.id))
      push('package-source-id', `"${source?.id}" must be a unique S* ID`)
    sources.set(source?.id, source)
    if (!SOURCE_KINDS.includes(source?.kind))
      push('package-source-kind', `${source?.id}: kind must be ${SOURCE_KINDS.join(' | ')}`)
    for (const field of ['jurisdiction', 'standard', 'location', 'approval'])
      if (!nonEmpty(source?.[field])) push('package-source-field', `${source?.id}: ${field} is required`)
    // Bend imports only plain names (letters, digits, _ and -): a dotted file name such as World.v1.bend cannot be
    // imported, and the kernel would report a failed proof instead of naming the file.
    const bendPath = repoPathOf(source?.location)
    if (/\.bend$/.test(bendPath ?? '') && !bendPath.replace(/\.bend$/, '').split('/').every((segment) => /^(?:[\w-]+|\.{1,2})$/.test(segment)))
      push('package-bend-name', `${source?.id}: ${bendPath} — Bend imports only plain names (letters, digits, _ and -) in each path segment`)
  }
  if (sources.size === 0) push('package-sources', 'list the source text as sources')
  const authoritative = (id) => {
    const source = sources.get(id)
    return Boolean(source) && source.kind !== 'implementation-reference'
  }
  const cite = (where, list, { authority = false } = {}) => {
    if (!Array.isArray(list) || list.length === 0) push('package-cite', `${where} must cite at least one S* source`)
    for (const id of list ?? []) {
      if (!sources.has(id)) push('package-cite-unknown', `${where}: ${id} is not a package source`)
      else if (authority && !authoritative(id))
        push('package-cite-authority', `${where}: ${id} is an implementation reference, not an authority`)
    }
  }

  const intent = pkg?.intent ?? {}
  if (!RISKS.includes(intent.risk)) push('package-intent-risk', `intent.risk must be ${RISKS.join(' | ')}`)
  for (const field of ['actor', 'observableSuccess', 'nonGoals', 'worstRegression', 'reversibility'])
    if (!nonEmpty(intent[field])) push('package-intent-field', `intent.${field} is required`)
  const questions = new Set()
  for (const question of intent.openQuestions ?? []) {
    if (!/^Q\d+$/.test(question?.id ?? '') || questions.has(question.id))
      push('package-question-id', `"${question?.id}" must be a unique Q* ID`)
    questions.add(question?.id)
    if (!nonEmpty(question?.text)) push('package-question-text', `${question?.id}: text is required`)
    cite(`question ${question?.id}`, question?.sources)
  }

  const world = pkg?.world ?? {}
  if (!sources.has(world.source) || !repoPathOf(sources.get(world.source)?.location)?.endsWith('.bend'))
    push('package-world', 'world.source must name a repo:<path>.bend package source')
  if (!/^[A-Z]\w*$/.test(world.prefix ?? '')) push('package-world', 'world.prefix must name the world record type')

  const terms = new Map()
  const fieldOwners = new Map()
  for (const term of pkg?.terms ?? []) {
    if (!/^T\d+$/.test(term?.id ?? '') || terms.has(term.id))
      push('package-term-id', `"${term?.id}" must be a unique T* ID`)
    terms.set(term?.id, term)
    if (!WORLD_ROLES.includes(term?.role))
      push('package-term-role', `${term?.id}: role must be ${WORLD_ROLES.join(' | ')}`)
    const hasField = nonEmpty(term?.field)
    if ((term?.role === 'concept') === hasField)
      push('package-term-field', `${term?.id}: a concept has no field; every other role names one world field`)
    if (hasField) fieldOwners.set(term.field, [...(fieldOwners.get(term.field) ?? []), term.id])
    const hasPath = nonEmpty(term?.path)
    if (['controllable', 'observable'].includes(term?.role) !== hasPath)
      push(
        'package-term-path',
        `${term?.id}: a controllable term says how the test sets it and an observable term the product path that reads it; hidden and concept terms have none`,
      )
    for (const field of ['context', 'name', 'definition'])
      if (!nonEmpty(term?.[field])) push('package-term-field', `${term?.id}: ${field} is required`)
    if (hasField && !nonEmpty(term?.not)) push('package-term-not', `${term?.id}: name the neighbouring meaning (not)`)
    if (!['confirmed', 'open'].includes(term?.status))
      push('package-term-status', `${term?.id}: status must be confirmed | open`)
    if (term?.family !== undefined && !FAMILIES.includes(term.family))
      push('package-term-family', `${term?.id}: family must be one of ${FAMILIES.join(', ')}`)
    if (!sources.has(term?.source))
      push('package-cite-unknown', `term ${term?.id}: ${term?.source} is not a package source`)
    // Ubiquitous Language — 수명주기는 선택이지만, 적으면 여섯 칸 모두 문자열이어야 한다(빠진 용어는 closure가 known
    // unknown으로 보고한다).
    if (term?.lifecycle !== undefined) {
      const keys = Object.keys(term.lifecycle ?? {})
      if (
        typeof term.lifecycle !== 'object' ||
        keys.some((key) => !LIFECYCLE_KEYS.includes(key)) ||
        LIFECYCLE_KEYS.some((key) => !nonEmpty(term.lifecycle[key]))
      )
        push('package-term-lifecycle', `${term?.id}: lifecycle needs exactly ${LIFECYCLE_KEYS.join(', ')}`)
    }
  }
  for (const [field, owners] of fieldOwners)
    if (owners.length > 1) push('package-term-conflated', `${field}: ${owners.join(', ')} name one world field`)

  const assumptions = new Set()
  for (const assumption of pkg?.assumptions ?? []) {
    if (!/^A\d+$/.test(assumption?.id ?? '') || assumptions.has(assumption.id))
      push('package-assumption-id', `"${assumption?.id}" must be a unique A* ID`)
    assumptions.add(assumption?.id)
    if (!sources.has(assumption?.source))
      push('package-cite-unknown', `assumption ${assumption?.id}: ${assumption?.source} is not a package source`)
    if (!nonEmpty(assumption?.falsifier))
      push('package-assumption-falsifier', `${assumption?.id}: falsifier is required`)
    if (!nonEmpty(assumption?.owner)) push('package-assumption-owner', `${assumption?.id}: owner is required`)
    else if (/^product\b/i.test(assumption.owner))
      push('package-assumption-owner', `${assumption?.id}: a duty of the product is a goal, not an assumption`)
    // Assumption Registry — 무엇을 근거로 믿는지, 틀리면 무엇이 깨지는지, 검사할 수 있는지, 지금 어떤 상태인지.
    for (const field of ['evidence', 'riskIfFalse'])
      if (!nonEmpty(assumption?.[field])) push('package-assumption-registry', `${assumption?.id}: ${field} is required`)
    if (!TESTABILITY.includes(assumption?.testability))
      push('package-assumption-registry', `${assumption?.id}: testability must be ${TESTABILITY.join(' | ')}`)
    if (!ASSUMPTION_STATUS.includes(assumption?.status))
      push('package-assumption-registry', `${assumption?.id}: status must be ${ASSUMPTION_STATUS.join(' | ')}`)
  }

  // Requirement Inventory — 원문 문장 하나가 요구사항 하나다. quote는 원문에 글자 그대로 있어야 한다(closure가 확인한다).
  const requirements = new Set()
  for (const requirement of pkg?.requirements ?? []) {
    if (!/^R\d+$/.test(requirement?.id ?? '') || requirements.has(requirement.id))
      push('package-requirement-id', `"${requirement?.id}" must be a unique R* ID`)
    requirements.add(requirement?.id)
    if (!nonEmpty(requirement?.quote)) push('package-requirement-quote', `${requirement?.id}: quote the source text`)
    const source = sources.get(requirement?.source)
    if (!source || source.kind === 'implementation-reference' || source.self || source.approval !== 'approved')
      push('package-requirement-source', `${requirement?.id}: source must be an authoritative package source`)
    else if (/\.bend$/.test(repoPathOf(source.location) ?? ''))
      push('package-requirement-source', `${requirement?.id}: a requirement quotes the source text, not a model`)
  }
  if (requirements.size === 0)
    push('package-requirements', 'list the source requirements as R* entries with verbatim quotes')
  const citeRequirements = (where, list) => {
    if (list === undefined) return
    if (!Array.isArray(list)) push('package-requirement-ref', `${where}: requirements must be a list of R* IDs`)
    for (const id of Array.isArray(list) ? list : [])
      if (!requirements.has(id)) push('package-requirement-ref', `${where}: ${id} is not a requirement`)
  }
  for (const assumption of pkg?.assumptions ?? []) citeRequirements(`assumption ${assumption?.id}`, assumption?.requirements)

  const goals = new Set()
  for (const goal of pkg?.goals ?? []) {
    citeRequirements(`goal ${goal?.id}`, goal?.requirements)
    if (!/^G\d+$/.test(goal?.id ?? '') || goals.has(goal.id))
      push('package-goal-id', `"${goal?.id}" must be a unique G* ID`)
    goals.add(goal?.id)
    if (!['safety', 'witness'].includes(goal?.kind))
      push('package-goal-kind', `${goal?.id}: kind must be safety | witness`)
    // 목표는 원문에서 온다 — 카드 행이나 행동 모델을 인용하면 모델이 자기 자신과 비교된다.
    cite(`goal ${goal?.id}`, goal?.cites, { authority: true })
    for (const id of goal?.cites ?? [])
      if (/\.bend$/.test(repoPathOf(sources.get(id)?.location) ?? ''))
        push('package-goal-source', `${goal?.id}: ${id} is a model file — a goal cites the source text, not a model`)
    if (!GOAL_AUTHORS.includes(goal?.author))
      push('package-goal-author', `${goal?.id}: author must be ${GOAL_AUTHORS.join(' | ')} — who read the source`)
  }
  if (!(pkg?.goals ?? []).some((goal) => goal?.kind === 'safety'))
    push('package-goal-missing', 'state at least one safety goal from the source text')

  const hazards = pkg?.hazards ?? {}
  for (const id of HAZARD_IDS) {
    const disposition = hazards[id]
    const ok =
      /^modeled:\s*\S/.test(disposition ?? '') ||
      (/^n\/a:\s*S\d+\s+\S/.test(disposition ?? '') && sources.has(disposition.match(/S\d+/)[0])) ||
      (/^question:\s*Q\d+\s*$/.test(disposition ?? '') && questions.has(disposition.match(/Q\d+/)[0]))
    if (!ok) push('package-hazard', `${id}: modeled: <fields> | n/a: S<n> <reason> | question: Q<n>`)
  }
  for (const id of Object.keys(hazards))
    if (!HAZARD_IDS.includes(id)) push('package-hazard', `${id} is not one of ${HAZARD_IDS.join(', ')}`)

  for (const example of pkg?.examples ?? []) {
    if (!/^E\d+$/.test(example?.id ?? '')) push('package-example', `"${example?.id}" must be an E* ID`)
    if (!goals.has(example?.goal)) push('package-example', `${example?.id}: ${example?.goal} is not a goal`)
    if (!['holds', 'violates'].includes(example?.verdict))
      push('package-example', `${example?.id}: verdict must be holds | violates`)
  }

  issues.push(...contractRowIssues(pkg?.contract))
  issues.push(...discoveryRegistryIssues(pkg, { sources, requirements, questions }))
  if (stage === 'model') return issues

  const policies = new Set()
  for (const policy of pkg?.policies ?? []) {
    if (!/^P\d+$/.test(policy?.id ?? '') || policies.has(policy.id))
      push('package-policy-id', `"${policy?.id}" must be a unique P* ID`)
    policies.add(policy?.id)
    if (!nonEmpty(policy?.text)) push('package-policy-text', `${policy?.id}: text is required`)
    cite(`policy ${policy?.id}`, policy?.sources, { authority: true })
    citeRequirements(`policy ${policy?.id}`, policy?.requirements)
  }
  if (policies.size === 0) push('package-policies', 'list the decided policies')

  const keys = new Set()
  const cited = new Set()
  for (const entry of pkg?.contract ?? []) {
    if (!/^[a-z_]\w*$/i.test(entry?.key ?? '') || keys.has(entry.key))
      push('package-contract-key', `"${entry?.key}" must be a unique model symbol`)
    keys.add(entry?.key)
    const inWorld = entry?.def !== undefined && entry?.def !== null
    if (inWorld === nonEmpty(entry?.outside))
      push(
        'package-contract-def',
        `${entry?.key}: name the world def that states it, or say why it is outside the world (outside) — exactly one`,
      )
    if (inWorld && !/^[a-z_]\w*$/i.test(entry.def)) push('package-contract-def', `${entry?.key}: def must be a symbol`)
    for (const policy of entry?.policies ?? []) {
      cited.add(policy)
      if (!policies.has(policy)) push('package-contract-policy', `${entry?.key}: ${policy} is not a policy`)
    }
    if ((entry?.policies ?? []).length === 0) push('package-contract-policy', `${entry?.key}: cite at least one policy`)
    for (const field of ['given', 'when', 'then', 'never', 'sideEffects'])
      if (!nonEmpty(entry?.[field])) push('package-contract-text', `${entry?.key}: ${field} is required`)
    citeRequirements(`contract ${entry?.key}`, entry?.requirements)
  }
  if (keys.size === 0) push('package-contract', 'list the contract predicates')
  for (const policy of policies)
    if (!cited.has(policy)) push('package-policy-unlinked', `${policy} is cited by no contract entry`)

  // 노출 타입 경계(Props·공유 API·상태 유니온·신뢰 경계 타입)가 없다는 선언 — 사유와 조사한 파일이 둘 다 있어야 한다.
  if (pkg?.typeContract !== undefined) {
    const { notApplicable, paths } = pkg.typeContract ?? {}
    if (!nonEmpty(notApplicable) || !Array.isArray(paths) || paths.length === 0 || !paths.every(nonEmpty))
      push('package-type-contract', 'typeContract needs notApplicable (why no exported Props, shared API, state union or trust-boundary type is involved) and paths (the investigated repo:<path> files)')
  }

  for (const entry of pkg?.notApplicable ?? []) {
    if (!nonEmpty(entry?.text)) push('package-na', 'a notApplicable entry needs text')
    cite('notApplicable', entry?.sources, { authority: true })
    citeRequirements('notApplicable', entry?.requirements)
  }

  const families = pkg?.families ?? {}
  for (const family of FAMILIES) {
    const declared = families[family]
    if (declared !== undefined && !/^excluded:\s*\S/.test(declared))
      push('package-family', `${family}: a declared family disposition is "excluded: <reason with S*>"`)
  }
  for (const family of Object.keys(families))
    if (!FAMILIES.includes(family)) push('package-family', `${family} is not one of ${FAMILIES.join(', ')}`)

  const selfSource = [...sources.values()].find((source) => source?.self === true)
  if (!selfSource)
    push('package-self', 'register this package file as a source with "self": true so the lock covers it')

  const behavior = pkg?.behavior
  if (!behavior) {
    push('package-behavior-missing', 'the mandatory Formal Model needs behavior: {model, laws, prefix, bound, ...}')
  } else {
    for (const field of ['model', 'laws'])
      if (!sources.has(behavior[field]) || !repoPathOf(sources.get(behavior[field])?.location)?.endsWith('.bend'))
        push('package-behavior', `behavior.${field} must name a repo:<path>.bend package source`)
    if (!/^[A-Z]\w*$/.test(behavior.prefix ?? ''))
      push('package-behavior', 'behavior.prefix must name the model namespace')
    if (!Number.isInteger(behavior.bound) || behavior.bound < 1 || behavior.bound > 8)
      push('package-behavior', 'behavior.bound must be an integer 1..8')
    for (const field of ['observation', 'outOfScope', 'notFormalized'])
      if (!nonEmpty(behavior[field])) push('package-behavior', `behavior.${field} is required`)
    if (!keys.has(behavior.conformance)) push('package-behavior', 'behavior.conformance must name a contract key')
    for (const law of behavior.lawRows ?? []) {
      if (!LAW_KINDS.includes(law?.kind)) push('package-law', `${law?.name}: kind must be ${LAW_KINDS.join(' | ')}`)
      for (const id of law?.cites ?? [])
        if (!policies.has(id) && !keys.has(id))
          push('package-law', `${law?.name}: ${id} is neither a policy nor a contract key`)
    }
    if ((behavior.lawRows ?? []).length === 0) push('package-law', 'behavior.lawRows lists every law in the laws file')
    citeRequirements('behavior', behavior.requirements)
  }
  return issues
}

const DISPOSITION = /^(?:n\/a:\s*(S\d+)\s+\S.*|modeled:\s*([\w.]+)\s*)$/

/**
 * Discovery 레지스트리의 구조 검사 — 있으면 모든 단계에서 본다. 이 필드들은 closure(oracle-discovery.mjs)가 요구하고,
 * 카드 투영은 요구하지 않는다: 공간을 공격하는 방법(E)·결함 모델(F)·결정 기록이 여기 있다. 결정(discoveryDecisions)은
 * 사람이 출처와 함께 적는다 — 도구는 쓰지 않는다.
 */
function discoveryRegistryIssues(pkg, { sources, requirements, questions }) {
  const issues = []
  const push = (code, message) => issues.push(`${code}: ${message}`)
  // 권위 — 승인된 원문. 구현 참고·패키지 자신·Bend 모델 파일은 결정이나 n/a의 근거가 되지 못한다(자기 참조다).
  const sourceOk = (id) => {
    const source = sources.get(id)
    return (
      Boolean(source) &&
      source.kind !== 'implementation-reference' &&
      !source.self &&
      source.approval === 'approved' &&
      !/\.bend$/.test(repoPathOf(source.location) ?? '')
    )
  }
  const repoFile = (where, value) => {
    if (!nonEmpty(value) || value.startsWith('/') || value.includes('..'))
      push('package-discovery-path', `${where} must be a repository-relative path`)
  }

  if (pkg?.spaceVersion !== undefined && !(Number.isInteger(pkg.spaceVersion) && pkg.spaceVersion >= 1))
    push('package-space-version', 'spaceVersion must be a positive integer')

  for (const [axis, origin] of Object.entries(pkg?.axisOrigins ?? {})) {
    if (!AXIS_ORIGINS.includes(origin?.origin))
      push('package-axis-origin', `${axis}: origin must be ${AXIS_ORIGINS.join(' | ')}`)
    for (const field of ['ref', 'reason'])
      if (!nonEmpty(origin?.[field])) push('package-axis-origin', `${axis}: ${field} is required`)
  }

  const faults = new Set()
  for (const fault of pkg?.faultModel ?? []) {
    if (!/^F\d+$/.test(fault?.id ?? '') || faults.has(fault.id))
      push('package-fault-id', `"${fault?.id}" must be a unique F* ID`)
    faults.add(fault?.id)
    if (!FAULT_CLASSES.includes(fault?.class))
      push('package-fault-class', `${fault?.id}: class must be one of ${FAULT_CLASSES.join(', ')}`)
    repoFile(`fault ${fault?.id}: file`, fault?.file)
    // 결함은 제품에 심는다 — 어댑터나 하네스를 바꾸면 검사가 스스로 실패해 변이를 "죽인" 것처럼 보인다
    if (Array.isArray(pkg?.product?.files) && !pkg.product.files.includes(fault?.file))
      push('package-fault-file', `${fault?.id}: ${fault?.file} is not one of product.files`)
    if (typeof fault?.find !== 'string' || fault.find === '' || typeof fault?.replace !== 'string' || fault.find === fault.replace)
      push('package-fault-edit', `${fault?.id}: find and replace are two different strings`)
  }
  if (pkg?.mutationThreshold !== undefined && !(typeof pkg.mutationThreshold === 'number' && pkg.mutationThreshold > 0 && pkg.mutationThreshold <= 1))
    push('package-mutation-threshold', 'mutationThreshold is a number in (0, 1]')

  const metamorphic = pkg?.metamorphic
  if (typeof metamorphic === 'string') {
    const match = metamorphic.match(/^n\/a:\s*(S\d+)\s+\S/)
    if (!match || !sourceOk(match[1])) push('package-metamorphic', 'metamorphic is { source, relations } or "n/a: S<n> <reason>"')
  } else if (metamorphic !== undefined) {
    if (!/\.bend$/.test(repoPathOf(sources.get(metamorphic?.source)?.location) ?? ''))
      push('package-metamorphic', 'metamorphic.source must name a repo:<path>.bend package source')
    const ids = new Set()
    for (const relation of metamorphic?.relations ?? []) {
      if (!/^MR\d+$/.test(relation?.id ?? '') || ids.has(relation.id))
        push('package-metamorphic', `"${relation?.id}" must be a unique MR* ID`)
      ids.add(relation?.id)
      for (const field of ['transform', 'relation'])
        if (!/^[A-Z]\w*\.\w+$/.test(relation?.[field] ?? ''))
          push('package-metamorphic', `${relation?.id}: ${field} must name a def as <Namespace>.<name>`)
      for (const id of relation?.requirements ?? [])
        if (!requirements.has(id)) push('package-requirement-ref', `metamorphic ${relation?.id}: ${id} is not a requirement`)
    }
    if ((metamorphic?.relations ?? []).length === 0) push('package-metamorphic', 'metamorphic.relations lists at least one relation')
  }

  const product = pkg?.product
  if (product !== undefined) {
    for (const field of ['adapter', 'worldAdapter']) repoFile(`product.${field}`, product?.[field])
    if (!Array.isArray(product?.files) || product.files.length === 0) push('package-product', 'product.files lists the product modules under test')
    for (const file of product?.files ?? []) repoFile('product.files', file)
    if (!Number.isInteger(product?.runs) || product.runs < 1) push('package-product', 'product.runs is a positive fast-check run count')
    if (!Number.isInteger(product?.maxLength) || product.maxLength < 2)
      push('package-product', 'product.maxLength is the longest sampled trace')
  }

  for (const [id, disposition] of Object.entries(pkg?.operators ?? {})) {
    if (!OPERATOR_IDS.includes(id)) push('package-operator', `${id} is not a discovery operator`)
    const match = typeof disposition === 'string' ? disposition.match(DISPOSITION) : null
    if (!match) push('package-operator', `${id}: "n/a: S<n> <reason>" or "modeled: <axis id>"`)
    else if (match[1] && !sourceOk(match[1])) push('package-operator', `${id}: ${match[1]} is not an authoritative source`)
    else if (match[2] && !DECLARED_OPERATORS.includes(id))
      push('package-operator', `${id} runs mechanically — only ${DECLARED_OPERATORS.join(', ')} are declared as modeled`)
  }
  for (const [field, disposition] of Object.entries(pkg?.residue ?? {})) {
    const match = typeof disposition === 'string' ? disposition.match(DISPOSITION) : null
    if (!match || (match[1] && !sourceOk(match[1])))
      push('package-residue', `${field}: "modeled: <axis id>" or "n/a: S<n> <reason>"`)
  }

  for (const run of pkg?.aiRuns ?? []) {
    if (!AI_OPERATORS.includes(run?.operator)) push('package-ai-run', `operator must be ${AI_OPERATORS.join(' | ')}`)
    repoFile('aiRuns.file', run?.file)
    if (!nonEmpty(run?.agent)) push('package-ai-run', 'name the agent that produced the run')
    if (!/^[a-f0-9]{64}$/.test(run?.inputDigest ?? ''))
      push('package-ai-run', 'inputDigest is the sha256 of the exact input the agent received (oracle-discovery.mjs ai-input)')
    if (!/^[a-f0-9]{64}$/.test(run?.outputDigest ?? ''))
      push('package-ai-run', 'outputDigest is the sha256 of the output file as recorded — an edited output is not the run')
  }

  const decided = new Set()
  for (const decision of pkg?.discoveryDecisions ?? []) {
    const where = `decision ${decision?.candidate}`
    if (!/^C-[a-f0-9]{10}$/.test(decision?.candidate ?? '') || decided.has(decision.candidate))
      push('package-decision', `${where}: candidate must be a unique C-<10 hex> ID from a discovery run`)
    decided.add(decision?.candidate)
    if (!DECISIONS.includes(decision?.decision)) push('package-decision', `${where}: decision must be ${DECISIONS.join(' | ')}`)
    if (!nonEmpty(decision?.reason)) push('package-decision', `${where}: reason is required`)
    // 범위 밖·위험 수용·기각은 사람의 정책 결정이다 — 승인된 출처나 Open question이 있어야 한다.
    if (['out-of-scope', 'accepted-risk', 'promoted', 'rejected'].includes(decision?.decision)) {
      const source = decision?.source ?? ''
      if (!(sourceOk(source) || questions.has(source)))
        push('package-decision', `${where}: ${decision?.decision} cites an authoritative S* or an Open question Q*`)
    }
    if (decision?.decision === 'promoted' && !nonEmpty(decision?.axis))
      push('package-decision', `${where}: a promotion names the axis, goal, contract key or assumption it became`)
    // 이미 덮인 후보 — 어느 행(O*·계약 키)이 덮는지 적고, 그 행이 실제로 있어야 한다.
    if (decision?.decision === 'covered') {
      const rows = new Set((pkg?.contract ?? []).flatMap((entry) => [entry?.key, entry?.row].filter(Boolean)))
      if (!rows.has(decision?.by)) push('package-decision', `${where}: covered names the contract row (by: O* or key) that already rejects it`)
    }
  }
  return issues
}

/**
 * 계약 키 → O* 행. 고정된 `row`는 그대로 쓰고, 나머지는 고정된 번호 뒤로 선언 순서대로 붙인다. 새 계약이 늘어도 기존
 * 행의 ID(와 그 행에 붙은 증거)는 움직이지 않는다 — 고정하지 않은 행은 `unpinned`로 보고해 다음 리비전 전에 고정하게 한다.
 */
export function assignRows(contract) {
  const invalid = contractRowIssues(contract).filter((issue) => issue.startsWith('package-contract-row'))
  if (invalid.length > 0) throw new PackageError('PACKAGE_ROW_INVALID', invalid.join('; '))
  const used = new Set(contract.map((entry) => entry.row).filter(Boolean))
  let next = Math.max(0, ...[...used].map((id) => Number(id.slice(1)))) + 1
  const rows = new Map()
  const unpinned = []
  for (const entry of contract) {
    if (entry.row) {
      rows.set(entry.key, entry.row)
      continue
    }
    while (used.has(`O${next}`)) next += 1
    const id = `O${next}`
    used.add(id)
    rows.set(entry.key, id)
    unpinned.push({ key: entry.key, row: id })
  }
  return { rows, unpinned }
}

/**
 * 패키지 + 세계 파일 → oracle-adequacy.mjs의 점검 입력(adequacySpec과 같은 모양). 좌표·관찰은 따로 적지 않는다:
 * 용어의 역할(controllable·observable)에서 나온다 — 좌표 목록과 용어 범주가 두 번 적혀 어긋나는 일이 없다.
 * rows는 세계 def 이름이고, rowIds는 그 def의 카드 행 ID다.
 */
export function packageSpec(pkg, worldText, parseWorld) {
  const prefix = pkg.world.prefix
  const fields = parseWorld(worldText, prefix)
  if (!fields) throw new PackageError('PACKAGE_WORLD_TYPE', `the world file declares no record type ${prefix}`)
  const termOf = new Map((pkg.terms ?? []).filter((term) => nonEmpty(term.field)).map((term) => [term.field, term]))
  const byRole = (role) => fields.map(({ name }) => name).filter((name) => termOf.get(name)?.role === role)
  const contract = pkg.contract ?? []
  const { rows: rowOf } = assignRows(contract)
  const inWorld = contract.filter((entry) => entry.def)
  return {
    source: pkg.world.source,
    prefix,
    fields,
    coordinates: byRole('controllable'),
    observations: byRole('observable'),
    rows: inWorld.map((entry) => entry.def),
    rowIds: Object.fromEntries(inWorld.map((entry) => [entry.def, rowOf.get(entry.key)])),
    assumptions: (pkg.assumptions ?? []).map((row) => row.id),
    goals: (pkg.goals ?? []).map((row) => ({ id: row.id, kind: row.kind })),
    goalAuthors: Object.fromEntries((pkg.goals ?? []).map((row) => [row.id, row.author])),
    examples: [],
    rawExamples: pkg.examples ?? [],
    categories: Object.fromEntries(fields.map(({ name }) => [name, termOf.get(name)?.role ?? 'hidden'])),
    openFields: fields.map(({ name }) => name).filter((name) => termOf.get(name)?.status === 'open'),
    unmapped: fields.map(({ name }) => name).filter((name) => !termOf.has(name)),
    outside: {
      rows: contract
        .filter((entry) => !entry.def)
        .map((entry) => `${rowOf.get(entry.key)} (${entry.outside})`)
        .join('; '),
      hazards: Object.entries(pkg.hazards ?? {})
        .filter(([, disposition]) => !disposition.startsWith('modeled:'))
        .map(([Hazard, Disposition]) => ({ Hazard, Disposition })),
      harness: (pkg.assumptions ?? []).filter((row) => /^harness\b/i.test(row.owner ?? '')).map((row) => row.id),
    },
    owners: Object.fromEntries((pkg.assumptions ?? []).map((row) => [row.id, row.owner ?? ''])),
    digestInput: { package: pkg },
  }
}

/** 목표의 독립성 증거 — 누가 원문을 읽었는지는 패키지에 기록되지만, 기록은 증명이 아니다. */
export function independenceOf(pkg) {
  const authors = new Set((pkg.goals ?? []).map((goal) => goal.author))
  if (authors.has('controller'))
    return {
      evidence: 'none',
      reason:
        'at least one goal was written by the controller that wrote the contract — the goal/contract comparison is a self-check, not an independent reading',
    }
  return {
    evidence: 'self-reported',
    reason: 'goals are recorded as the analyst’s; host receipts do not cover the model analyst before the lock yet',
  }
}

// ── derivation ────────────────────────────────────────────────────────────────────────────────────────────────

/** 유한 도메인의 값 이름 — Bool은 false/true, 인자 없는 생성자만 가진 타입은 생성자 이름. 무한·복합이면 null. */
function finiteNames(ir) {
  if (ir.kind === 'bool') return ['false', 'true']
  if (ir.kind === 'data' && ir.constructors.every((entry) => entry.fields.length === 0))
    return ir.constructors.map((entry) => entry.name)
  return null
}

function axisStatus(ir, values, term) {
  if (!ir) return 'unsupported'
  return values && term ? 'derived' : 'unresolved'
}

function worldAxes(pkg, worldText) {
  const axes = []
  const diagnostics = []
  const { types, diagnostics: typeDiagnostics } = parseBendTypesStrict(worldText)
  diagnostics.push(...typeDiagnostics.map((entry) => ({ ...entry, file: 'world' })))
  const record = types.get(pkg.world.prefix)
  if (record?.length !== 1 || record[0].name !== pkg.world.prefix) {
    diagnostics.push({
      code: 'world-record-missing',
      symbol: pkg.world.prefix,
      message: `the world declares no one-constructor record ${pkg.world.prefix}{...}`,
    })
    return { axes, diagnostics }
  }
  const termOf = new Map((pkg.terms ?? []).filter((term) => nonEmpty(term.field)).map((term) => [term.field, term]))
  for (const field of record[0].fields) {
    const symbol = `${pkg.world.prefix}.${field.name}`
    const term = termOf.get(field.name)
    let ir = null
    try {
      ir = typeIR(field.type, types)
    } catch (error) {
      diagnostics.push({ code: 'axis-type-unsupported', symbol, message: error.message })
    }
    const values = ir ? finiteNames(ir) : null
    if (ir && !values)
      diagnostics.push({
        code: 'axis-domain-infinite',
        symbol,
        message: `${field.type} has no finite value list — the world checks report unknown, never a pass`,
      })
    if (!term)
      diagnostics.push({ code: 'axis-term-missing', symbol, message: `${symbol} has no term — its role is unknown` })
    const limitations = []
    if (!term?.productDomain)
      limitations.push('product domain not stated — the model domain is not a claim about the product')
    if (term?.status === 'open') limitations.push('term meaning is open — judgments that depend on it are unresolved')
    if (term?.role === 'hidden') limitations.push('hidden — no product path reads it; tests never set or read it')
    axes.push({
      id: `world.${symbol}`,
      role: term?.role ?? 'unknown',
      modelRefs: [symbol],
      termRefs: term ? [term.id] : [],
      sourceRefs: term ? [term.source] : [],
      domainRef: field.type,
      derivation: 'structural',
      status: axisStatus(ir, values, term),
      ...(term?.path ? { realizationRef: term.path } : {}),
      ...(term?.family ? { family: term.family } : {}),
      domain: {
        model: field.type,
        product: term?.productDomain ?? 'unstated',
        enumerated: values ? { values, by: 'type' } : null,
      },
      limitations,
    })
  }
  return { axes, diagnostics }
}

/**
 * 행동 모델의 축 — step의 사건 타입(환경이 만드는 사건)과 observe의 반환 타입(관찰), 상태 타입(숨은 사실). 합 타입은
 * 생성자별로 나눈다: 한 생성자에만 있는 필드는 그 생성자 아래의 조건부 축이 된다(생성자끼리 곱하지 않는다).
 */
function behaviorAxes(behavior, modelText, sourceIds) {
  const axes = []
  const diagnostics = []
  const { types, diagnostics: typeDiagnostics } = parseBendTypesStrict(modelText)
  diagnostics.push(...typeDiagnostics.map((entry) => ({ ...entry, file: 'model' })))
  const signature = (name) => {
    const escaped = `${behavior.prefix}.${name}`.replaceAll('.', String.raw`\.`)
    const match = modelText.match(new RegExp(String.raw`^def\s+${escaped}\((.*)\)\s*->\s*(.+?):\s*$`, 'm'))
    return match
      ? {
          params: match[1]
            .split(',')
            .map((part) => part.split(':').slice(1).join(':').trim().replace(/^\+/, ''))
            .filter(Boolean),
          returns: match[2].trim(),
        }
      : null
  }
  const step = signature('step')
  const observe = signature('observe')
  for (const [name, found] of [
    ['step', step],
    ['observe', observe],
    ['init', signature('init')],
    ['next', signature('next')],
  ])
    if (!found)
      diagnostics.push({ code: 'behavior-interface', symbol: `${behavior.prefix}.${name}`, message: 'not defined' })
  const add = (id, role, typeText, extra = {}) => {
    let ir = null
    try {
      ir = typeIR(typeText, types)
    } catch (error) {
      diagnostics.push({ code: 'axis-type-unsupported', symbol: id, message: error.message })
    }
    const values = ir ? finiteNames(ir) : null
    axes.push({
      id,
      role,
      ...(ir?.kind === 'data' && !values ? { constructors: ir.constructors.map((entry) => entry.name) } : {}),
      modelRefs: [extra.modelRef ?? typeText],
      termRefs: [],
      sourceRefs: sourceIds,
      domainRef: typeText,
      derivation: 'structural',
      status: ir ? 'derived' : 'unsupported',
      domain: { model: typeText, product: 'unstated', enumerated: values ? { values, by: 'type' } : null },
      limitations: [
        ...(ir && !values ? ['infinite or compound domain — enumerated only up to the trace bound'] : []),
        ...(extra.limitations ?? []),
      ],
      ...(extra.conditionalOn ? { conditionalOn: extra.conditionalOn } : {}),
    })
    return ir
  }
  if (step?.params?.[1]) {
    const eventType = step.params[1]
    const ir = add(`event.${eventType}`, 'environment', eventType, {
      modelRef: `${behavior.prefix}.next`,
      limitations: [
        'events come from the environment next(history); the test drives them, the product must handle each',
      ],
    })
    if (ir?.kind === 'data') {
      for (const variant of ir.constructors) {
        const raw = types.get(eventType)?.find((entry) => entry.name === variant.name)
        for (const field of raw?.fields ?? [])
          add(`event.${eventType}.${variant.name}.${field.name}`, 'environment', field.type, {
            modelRef: `${eventType}.${variant.name}`,
            conditionalOn: `${eventType}=${variant.name}`,
          })
      }
    }
  }
  if (step?.params?.[0]) {
    const stateType = step.params[0]
    const record = types.get(stateType)
    for (const variant of record ?? [])
      for (const field of variant.fields)
        add(`state.${stateType}.${variant.name}.${field.name}`, 'hidden', field.type, {
          modelRef: `${stateType}.${variant.name}`,
          ...(record.length > 1 ? { conditionalOn: `${stateType}=${variant.name}` } : {}),
          limitations: ['model state — only what observe projects is compared with the product'],
        })
  }
  if (observe?.returns)
    add(`observation.${behavior.prefix}.observe`, 'observable', observe.returns, {
      modelRef: `${behavior.prefix}.observe`,
      limitations: ['read through the adapter’s observe — the Observation line names the product path'],
    })
  return { axes, diagnostics }
}

/**
 * 사건 순서 의무 — 같은 사건 묶음을 다른 순서로 적용한 trace끼리 비교한다. 끝 관찰이 다르면 순서가 결과를 바꾼다
 * (`order-sensitive`). 끝 관찰은 같은데 중간 관찰이 다르면, 끝 상태만 보는 세계로는 구별할 수 없는 시간적 의무다
 * (`history-sensitive`). 모델이 계산한 것이다(model-checked) — 선언한 bound 안의 trace에 대해서만.
 */
export function orderObligations(space, { limit = 50 } = {}) {
  const groups = new Map()
  for (const entry of space.cases) {
    const bag = stableStringify(entry.trace.map((event) => stableStringify(event)).sort())
    groups.set(bag, [...(groups.get(bag) ?? []), entry])
  }
  const obligations = []
  for (const members of groups.values()) {
    if (members.length < 2) continue
    const finals = new Set(members.map((entry) => stableStringify(entry.observations.at(-1))))
    const histories = new Set(members.map((entry) => stableStringify(entry.observations)))
    if (histories.size < 2) continue
    const kind = finals.size > 1 ? 'order-sensitive' : 'history-sensitive'
    const traces = members.map((entry) => entry.id).sort()
    obligations.push({
      id: `ORD-${sha256(stableStringify(traces)).slice(0, 10)}`,
      kind,
      derivation: 'model-checked',
      events: members[0].trace.map((event) => stableStringify(event)).sort(),
      traces: members
        .map(({ id, label, observations }) => ({ id, label, observations }))
        .sort((a, b) => (a.id < b.id ? -1 : 1)),
      claim:
        kind === 'order-sensitive'
          ? 'the same events in another order end in a different observation — the order is part of the contract'
          : 'the same events end alike but pass through different observations — an end-state world cannot check this; the trace conformance does',
    })
  }
  obligations.sort((left, right) => (left.id < right.id ? -1 : 1))
  return {
    obligations: obligations.slice(0, limit),
    total: obligations.length,
    bound: space.bound,
    complete: space.complete,
  }
}

/**
 * 무한·복합 도메인 축에, 선언한 bound 안의 trace 공간이 실제로 만든 값을 적는다. 모델 도메인(예: Nat)과 제품 도메인은
 * 그대로 두고 `enumerated.by: trace-space`로 구분한다 — 0..3만 열거했다고 제품이 0..3만 받는다는 뜻이 아니다.
 */
function enumeratedBySpace(axes, space) {
  const seen = new Map()
  const note = (id, value) => {
    const set = seen.get(id) ?? new Map()
    set.set(stableStringify(value), value)
    seen.set(id, set)
  }
  for (const entry of space.cases) {
    for (const event of entry.trace) {
      for (const axis of axes.filter((candidate) => candidate.id.startsWith('event.') && !candidate.conditionalOn)) {
        note(axis.id, event.$)
        for (const [key, value] of Object.entries(event)) if (key !== '$') note(`${axis.id}.${event.$}.${key}`, value)
      }
    }
    for (const value of [space.initial, ...entry.observations])
      for (const axis of axes.filter((candidate) => candidate.id.startsWith('observation.'))) note(axis.id, value)
  }
  for (const axis of axes) {
    if (axis.domain.enumerated || !seen.has(axis.id)) continue
    const values = [...seen.get(axis.id).values()].sort((left, right) =>
      stableStringify(left) < stableStringify(right) ? -1 : 1,
    )
    axis.domain.enumerated = {
      values: values.map((value) => (typeof value === 'string' ? value : stableStringify(value))),
      by: 'trace-space',
      bound: space.bound,
    }
  }
}

/**
 * 누락 감사 — 여덟 계열을 도출된 축에 잇는다. 축이 없는 계열은 패키지가 적은 excluded 사유가 있어야 한다: 모델에
 * 없다는 사실만으로 excluded를 쓰지 않는다(`family-undispositioned`는 사람의 결정이 필요한 자리다).
 */
// Order·Async는 입력의 순서·시점이다. 관찰 축만 매핑된 계열은 테스트가 그 순서를 몰 수 없으므로 "world로 전부 열거됨"이
// 근거가 되지 못한다 — 몰 수 있는 축(controllable·environment·event)이나 모델 검사 순서 의무가 있어야 매핑으로 인정한다.
const DRIVEN_FAMILIES = new Set(['Order', 'Async'])
const drivable = (axis) => axis.role === 'controllable' || axis.role === 'environment' || axis.id.startsWith('event.')

export function familyAudit(pkg, axes, order = null) {
  return FAMILIES.map((family) => {
    const members = axes.filter((axis) => axis.family === family)
    const mapped = members.map((axis) => axis.id)
    const declared = pkg.families?.[family] ?? null
    const driven = members.some(drivable) || (family === 'Order' && (order?.total ?? 0) > 0)
    if (mapped.length > 0 && DRIVEN_FAMILIES.has(family) && !driven) {
      if (declared) return { family, status: 'excluded', reason: declared, axes: mapped }
      return {
        family,
        status: 'undispositioned',
        axes: mapped,
        blocked: 'family-observation-only',
        message: `${family} maps only observed axes (${mapped.join(', ')}); add a controllable or environment axis, an event the model orders, or a sourced exclusion`,
      }
    }
    if (mapped.length > 0) return { family, status: 'mapped', axes: mapped, ...(declared ? { declared } : {}) }
    if (declared) return { family, status: 'excluded', reason: declared }
    return { family, status: 'undispositioned' }
  })
}

/** 파생 IR의 결정적 digest — 실행 시각·runId 없이 입력과 생성기 버전만. */
export function deriveDigest(inputs) {
  return sha256(stableStringify({ version: DERIVE_VERSION, inputs }))
}

/**
 * 패키지 → 파생 축 IR. texts: { world, model? } 파일 원문. space(선택)는 enumerateSpace 결과다(Bend가 있을 때 CLI가
 * 넘긴다). 구조적으로 알 수 있는 것만 structural로, 공간에서 계산한 것은 model-checked로 표시한다. 지원하지 않는
 * 입력은 조용히 빠지지 않고 diagnostics에 남는다.
 */
export function derive(pkg, texts, { space = null, inputs = [] } = {}) {
  const world = worldAxes(pkg, texts.world)
  const behavior = pkg.behavior && texts.model ? behaviorAxes(pkg.behavior, texts.model, [pkg.behavior.model]) : null
  const axes = [...world.axes, ...(behavior?.axes ?? [])]
  const diagnostics = [...world.diagnostics, ...(behavior?.diagnostics ?? [])]
  if (pkg.behavior && !texts.model)
    diagnostics.push({
      code: 'behavior-unread',
      symbol: pkg.behavior.prefix,
      message: 'the behavior model was not read',
    })
  const termFields = new Set(world.axes.map((axis) => axis.modelRefs[0].split('.').at(-1)))
  for (const term of pkg.terms ?? [])
    if (nonEmpty(term.field) && !termFields.has(term.field))
      diagnostics.push({
        code: 'term-field-unknown',
        symbol: term.id,
        message: `${term.field} is not a field of ${pkg.world.prefix}`,
      })
  const order = space ? orderObligations(space) : null
  if (space) enumeratedBySpace(axes, space)
  if (!space && pkg.behavior)
    diagnostics.push({
      code: 'order-unchecked',
      symbol: pkg.behavior.prefix,
      message: 'no trace space was enumerated (Bend not run) — order obligations are unknown, not absent',
    })
  const families = familyAudit(pkg, axes, order)
  for (const entry of families.filter((candidate) => candidate.blocked))
    diagnostics.push({ code: entry.blocked, symbol: entry.family, message: entry.message })
  const { rows, unpinned } = assignRows(pkg.contract ?? [])
  const byRole = (role) =>
    world.axes.filter((axis) => axis.role === role).map((axis) => axis.modelRefs[0].split('.').at(-1))
  const summary = {
    fields: world.axes.length,
    worldAxes: world.axes.length,
    behaviorAxes: behavior?.axes.length ?? 0,
    coordinates: byRole('controllable'),
    observations: byRole('observable'),
    hidden: byRole('hidden'),
    rawCombinations: world.axes.reduce((count, axis) => count * (axis.domain.enumerated?.values.length ?? Infinity), 1),
  }
  const result = {
    deriveVersion: DERIVE_VERSION,
    package: pkg.id,
    axes,
    order,
    families,
    contractRows: Object.fromEntries(rows),
    unpinnedRows: unpinned,
    diagnostics,
    summary,
    status: diagnostics.some((entry) => /unsupported|missing|unknown|interface/.test(entry.code))
      ? 'incomplete'
      : 'derived',
  }
  return { ...result, digest: deriveDigest({ result, inputs }) }
}

// ── card projection ───────────────────────────────────────────────────────────────────────────────────────────

const cell = (value) =>
  String(value ?? '')
    .replaceAll('|', String.raw`\|`)
    .replaceAll('\n', ' ')
function table(header, rows) {
  const widths = header.map((name, index) => Math.max(3, name.length, ...rows.map((row) => cell(row[index]).length)))
  const line = (cells) => `| ${cells.map((value, index) => cell(value).padEnd(widths[index])).join(' | ')} |`
  return [line(header), `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`, ...rows.map(line)]
}

/**
 * 요구사항 → 그것을 담은 오라클 요소(목표·정책·가정·계약 행·N/A·행동 모델·metamorphic 관계). L1 Requirement Closure의
 * 재료다. N/A만으로 담긴 요구사항은 명시적으로 범위 밖으로 둔 것이다(scoped-out) — 누락과 구별한다.
 */
export function requirementMapping(pkg) {
  let rows = new Map()
  try {
    ;({ rows } = assignRows(pkg.contract ?? []))
  } catch {
    rows = new Map()
  }
  const mapping = new Map((pkg.requirements ?? []).map((requirement) => [requirement.id, []]))
  const add = (list, label) => {
    for (const id of list ?? []) mapping.get(id)?.push(label)
  }
  for (const goal of pkg.goals ?? []) add(goal.requirements, goal.id)
  for (const policy of pkg.policies ?? []) add(policy.requirements, policy.id)
  for (const assumption of pkg.assumptions ?? []) add(assumption.requirements, assumption.id)
  for (const entry of pkg.contract ?? []) add(entry.requirements, rows.get(entry.key) ?? entry.key)
  for (const entry of pkg.notApplicable ?? []) add(entry.requirements, 'N/A')
  add(pkg.behavior?.requirements, 'behavior')
  if (typeof pkg.metamorphic === 'object') for (const relation of pkg.metamorphic?.relations ?? []) add(relation.requirements, relation.id)
  return mapping
}

function orderSummary(order) {
  if (!order) return 'unchecked — no trace space was enumerated'
  const counts = {}
  for (const entry of order.obligations) counts[entry.kind] = (counts[entry.kind] ?? 0) + 1
  const kinds = Object.entries(counts)
    .map(([kind, count]) => `${kind} ${count}`)
    .join(', ')
  const detail = kinds ? ` (${kinds})` : ''
  const incomplete = order.complete ? '' : ' — space incomplete'
  return `${order.total} within bound ${order.bound}${detail}${incomplete}`
}

/** 사용자가 함께 승인하는 공격 방법 — Fault Model F, metamorphic 관계, 연산자·잔여 필드 처분, 기본값이 아닌 축 기원. */
function discoverySpaceSection(pkg) {
  const faults = pkg.faultModel ?? []
  const relations = typeof pkg.metamorphic === 'object' ? pkg.metamorphic?.relations ?? [] : []
  const operators = Object.entries(pkg.operators ?? {})
  const residue = Object.entries(pkg.residue ?? {})
  const origins = Object.entries(pkg.axisOrigins ?? {})
  if (faults.length + relations.length + operators.length + residue.length + origins.length === 0 && !pkg.metamorphic)
    return []
  const out = ['## Discovery Space', '', `- Space version: ${pkg.spaceVersion ?? 1}`]
  if (typeof pkg.metamorphic === 'string') out.push(`- Metamorphic: ${pkg.metamorphic}`)
  if (pkg.mutationThreshold !== undefined) out.push(`- Mutation threshold: ${pkg.mutationThreshold}`)
  out.push('')
  if (faults.length > 0)
    out.push(...table(['Fault', 'Class', 'File', 'Mutation'], faults.map((fault) => [fault.id, fault.class, fault.file, fault.note ?? '—'])), '')
  if (relations.length > 0)
    out.push(
      ...table(
        ['Relation', 'Transform', 'Holds', 'Requirements'],
        relations.map((relation) => [relation.id, relation.transform, relation.relation, (relation.requirements ?? []).join(' ') || '—']),
      ),
      '',
    )
  if (operators.length > 0) out.push(...table(['Operator', 'Disposition'], operators), '')
  if (residue.length > 0) out.push(...table(['Residue field', 'Disposition'], residue), '')
  if (origins.length > 0)
    out.push(
      ...table(
        ['Axis', 'Origin', 'Ref', 'Reason'],
        origins.map(([axis, origin]) => [axis, origin.origin, origin.ref, origin.reason]),
      ),
      '',
    )
  return out
}

/** 생성 영역 본문. 같은 패키지·세계·모델 원문이면 같은 바이트다. */
export function renderGenerated(pkg, derived) {
  const { rows } = assignRows(pkg.contract ?? [])
  const rowOf = (key) => rows.get(key) ?? key
  const intent = pkg.intent
  const out = []
  out.push(
    '## Outcome Brief',
    '',
    `- Actor and context: ${intent.actor}`,
    `- Observable success: ${intent.observableSuccess}`,
    `- Non-goals: ${intent.nonGoals}`,
    `- Worst regression: ${intent.worstRegression}`,
    `- Reversibility: ${intent.reversibility}`,
    `- Risk: ${intent.risk}`,
    `- Sources: ${[...new Set((pkg.policies ?? []).flatMap((policy) => policy.sources))].join(', ')}`,
    '',
    '## Source Registry',
    '',
    ...table(
      ['ID', 'Kind', 'Jurisdiction', 'Standard', 'Location·version', 'Approval status'],
      pkg.sources.map((source) => [
        source.id,
        source.kind,
        source.jurisdiction,
        source.standard,
        source.location,
        source.approval,
      ]),
    ),
    '',
  )
  if ((pkg.requirements ?? []).length > 0) {
    const mapping = requirementMapping(pkg)
    out.push(
      '## Requirements',
      '',
      ...table(
        ['ID', 'Source', 'Quote', 'Mapped by'],
        pkg.requirements.map((requirement) => [
          requirement.id,
          requirement.source,
          requirement.quote,
          mapping.get(requirement.id).join(' ') || 'unmapped',
        ]),
      ),
      '',
    )
  }
  out.push('## Decided policies', '')
  for (const policy of pkg.policies) {
    const linked = (pkg.contract ?? [])
      .filter((entry) => entry.policies.includes(policy.id))
      .map((entry) => rowOf(entry.key))
    out.push(`- ${policy.id}: ${policy.text} (source: ${policy.sources.join(', ')}) (rows: ${linked.join(', ')})`)
  }
  out.push(
    '',
    '## Behavior Contract',
    '',
    ...table(
      ['ID', 'Policy', 'Formal', 'Given', 'When', 'Then', 'Never', 'Side effects', 'BVA'],
      (pkg.contract ?? []).map((entry) => [
        rowOf(entry.key),
        entry.policies.join(', '),
        entry.def ? `\`${pkg.world.prefix}.${entry.def}\`` : `outside the world: ${entry.outside}`,
        entry.given,
        entry.when,
        entry.then,
        entry.never,
        entry.sideEffects,
        entry.bva ?? '—',
      ]),
    ),
    '',
    '- The Formal column is the meaning; the prose columns explain it and never override it.',
    ...(pkg.notApplicable ?? []).map((entry) => `- N/A: ${entry.text} (source: ${entry.sources.join(', ')})`),
    '',
    '## Case space',
    '',
  )
  out.push(
    ...table(
      ['Family', 'Dimension', 'Choices'],
      // 사유 없는 계열은 행을 쓰지 않는다 — 기존 lint가 family-undispositioned로 막고, 생성기는 제외 사유를 지어내지 않는다.
      derived.families
        .filter((entry) => entry.status !== 'undispositioned')
        .map((entry) => {
          if (entry.status === 'excluded') return [entry.family, '—', entry.reason]
          const fields = entry.axes.map((id) => id.split('.').at(-1)).join(', ')
          return [
            entry.family,
            '—',
            `excluded: enumerated exhaustively as the derived world axes ${fields} (${pkg.world.source})`,
          ]
        }),
    ),
    '',
    '## Terms',
    '',
    ...table(
      ['Term', 'Context', 'Name', 'Category', 'Field', 'Path', 'Definition', 'Not', 'Source', 'Status'],
      pkg.terms.map((term) => [
        term.id,
        term.context,
        term.name,
        term.role,
        nonEmpty(term.field) ? term.field : '—',
        nonEmpty(term.path) ? term.path : '—',
        term.definition,
        nonEmpty(term.not) ? term.not : '—',
        term.source,
        term.status,
      ]),
    ),
    '',
    '## Adequacy',
    '',
    `- World: ${pkg.world.source} ${pkg.world.prefix}`,
    `- Coordinates: ${derived.summary.coordinates.join(' ') || 'none'}`,
    `- Observations: ${derived.summary.observations.join(' ') || 'none'}`,
    `- Rows: ${(pkg.contract ?? [])
      .filter((entry) => entry.def)
      .map((entry) => (entry.def === rowOf(entry.key) ? entry.def : `${rowOf(entry.key)}=${entry.def}`))
      .join(' ')}`,
    `- Rows outside the world: ${
      (pkg.contract ?? [])
        .filter((entry) => !entry.def)
        .map((entry) => `${rowOf(entry.key)} (${entry.outside})`)
        .join('; ') || 'none'
    }`,
    '',
  )
  if ((pkg.assumptions ?? []).length > 0)
    out.push(
      ...table(
        ['Assumption', 'Source', 'Owner', 'Falsifier'],
        pkg.assumptions.map((row) => [row.id, row.source, row.owner, row.falsifier]),
      ),
      '',
    )
  out.push(
    ...table(
      ['Goal', 'Kind', 'Cites'],
      pkg.goals.map((goal) => [goal.id, goal.kind, goal.cites.join(' ')]),
    ),
    '',
  )
  if ((pkg.examples ?? []).length > 0)
    out.push(
      ...table(
        ['Example', 'Goal', 'World', 'Verdict'],
        pkg.examples.map((row) => [row.id, row.goal, row.world, row.verdict]),
      ),
      '',
    )
  out.push(
    ...table(
      ['Hazard', 'Disposition'],
      HAZARD_IDS.map((id) => [id, pkg.hazards[id]]),
    ),
    '',
  )
  const behavior = pkg.behavior
  if (behavior) {
    out.push(
      '## Formal Model',
      '',
      `- Model: ${behavior.model}`,
      `- Laws: ${behavior.laws}`,
      `- Prefix: ${behavior.prefix}`,
      `- Bound: ${behavior.bound}`,
      `- Observation: ${behavior.observation}`,
      `- Out of scope: ${behavior.outOfScope}`,
      `- Not formalized: ${behavior.notFormalized}`,
      `- Conformance row: ${rowOf(behavior.conformance)}`,
      '',
      ...table(
        ['Law', 'Kind', 'Cites'],
        (behavior.lawRows ?? []).map((law) => [
          law.name,
          law.kind,
          law.cites.map((id) => (/^P\d+$/.test(id) ? id : rowOf(id))).join(' '),
        ]),
      ),
      '',
    )
  }
  if (pkg.typeContract)
    out.push('## Type Contract', '', `- Not applicable: ${pkg.typeContract.notApplicable}`, `- Investigated: ${pkg.typeContract.paths.join(', ')}`, '')
  out.push(...discoverySpaceSection(pkg))
  out.push(
    '## Derived Axes',
    '',
    `- Derivation: oracle-package.mjs derive v${DERIVE_VERSION} · digest ${derived.digest} · status ${derived.status}`,
    `- Order obligations: ${orderSummary(derived.order)}`,
    `- Diagnostics: ${derived.diagnostics.map((entry) => [entry.code, entry.symbol].join(' ')).join('; ') || 'none'}`,
    '',
    ...table(
      ['Axis', 'Role', 'Derivation', 'Status', 'Domain', 'Model refs', 'Terms', 'Sources', 'Limitations'],
      derived.axes.map((axis) => [
        axis.id,
        axis.role,
        axis.derivation,
        axis.status,
        axis.domain.enumerated ? axis.domain.enumerated.values.join(' ') : axis.domain.model,
        axis.modelRefs.join(' '),
        axis.termRefs.join(' ') || '—',
        axis.sourceRefs.join(' ') || '—',
        axis.limitations.join('; ') || '—',
      ]),
    ),
  )
  if ((intent.openQuestions ?? []).length > 0) {
    out.push('', '## Open questions', '')
    for (const question of intent.openQuestions)
      out.push(`### ${question.id} ${question.text}`, '', `- Sources: ${question.sources.join(', ')}`, '')
    out.pop()
  }
  return `${out.join('\n')}\n`
}

const markerOf = ({ packagePath, inputsDigest, contentDigest }) =>
  `${BEGIN} generator=oracle-package@${PROJECT_VERSION}.${DERIVE_VERSION} package=${packagePath} inputs-sha256=${inputsDigest} content-sha256=${contentDigest} -->`

/**
 * 카드 전체를 만든다. 생성 영역은 표식으로 감싸고 그 본문의 digest를 표식에 적는다. 사람이 쓰는 절(User Confirmation과
 * 그 밖의 설명)은 기존 카드에서 그대로 옮긴다 — 처음이면 승인 대기 상태로 둔다. 생성기는 승인을 쓰지 않는다.
 */
export function projectCard(pkg, derived, { packagePath, inputsDigest, existing = null, title = null }) {
  if (/\s/.test(packagePath))
    throw new PackageError('PACKAGE_PATH_INVALID', 'the package path must not contain whitespace')
  const content = renderGenerated(pkg, derived).replace(/\n$/, '')
  const marker = markerOf({ packagePath, inputsDigest, contentDigest: sha256(content) })
  const block = `${marker}\n\n${content}\n\n${END}`
  if (existing) {
    const found = generatedBlock(existing)
    if (!found.present) throw new PackageError('CARD_NOT_GENERATED', 'the existing card has no generated region')
    return `${existing.slice(0, found.start)}${block}${existing.slice(found.end)}`
  }
  return [
    `# ${title ?? [pkg.id, 'Oracle'].join(' ')}`,
    '',
    '> Projected from the Oracle model package. Edit the package and regenerate; the region between the',
    '> `oracle:generated` markers is checked against its digest and the package on every lint.',
    '',
    block,
    '',
    '## User Confirmation',
    '',
    '- Status: pending',
    '- Source: none yet — record the approving user response here after the Draft is confirmed',
    '',
  ].join('\n')
}

/** 카드 안의 생성 영역 — 표식·본문·digest. 없으면 present: false. */
export function generatedBlock(card) {
  const start = card.indexOf(BEGIN)
  if (start === -1) return { present: false }
  const markerEnd = card.indexOf('-->', start)
  const endMarker = card.indexOf(END, markerEnd)
  const marker = card.slice(start, markerEnd + 3)
  const fields = Object.fromEntries(
    marker
      .split(/\s+/)
      .map((token) => token.split('='))
      .filter((pair) => pair.length === 2 && /^[\w-]+$/.test(pair[0]))
      .map(([key, value]) => [key, value]),
  )
  if (markerEnd === -1 || endMarker === -1) return { present: true, malformed: true, start, end: card.length, fields }
  const body = card.slice(markerEnd + 3, endMarker)
  const content = body.replace(/^\n\n/, '').replace(/\n\n$/, '')
  return { present: true, start, end: endMarker + END.length, fields, content }
}

/**
 * 생성 영역 검사 — card lint가 부른다. 표식에 적힌 digest는 같은 파일 안에 있어 누구나 다시 계산할 수 있다 — 그것만으로는
 * 손 편집을 막지 못한다. 그래서 regenerate가 있으면 패키지와 Bend 파일에서 본문을 다시 만들어 바이트로 비교한다:
 * 입력이 바뀌었으면 stale, 입력은 같은데 본문이 다르면 drift(손 편집)다. 다시 만들 수 없으면(Bend 없음) unverified로
 * 막는다 — 확인하지 못한 영역을 통과시키지 않는다.
 */
export async function generatedIssues(card, { regenerate = null } = {}) {
  const found = generatedBlock(card)
  if (!found.present) return []
  if (found.malformed) return ['card-generated-malformed: the generated region has no end marker']
  const issues = []
  if (sha256(found.content) !== found.fields['content-sha256'])
    issues.push(
      'card-generated-drift: the generated region differs from its recorded digest — it was edited by hand; edit the package and regenerate',
    )
  if (/^## User Confirmation\s*$/m.test(found.content) || found.content.includes('oracle:generated'))
    issues.push(
      'card-generated-forbidden: the generated region contains a User Confirmation heading or a region marker',
    )
  if (found.fields.generator !== `oracle-package@${PROJECT_VERSION}.${DERIVE_VERSION}`)
    issues.push(
      `card-generated-version: generated by ${found.fields.generator}, this tool is oracle-package@${PROJECT_VERSION}.${DERIVE_VERSION} — regenerate (and treat a changed meaning as a new revision)`,
    )
  if (!regenerate) return issues
  const fresh = await regenerate(found.fields.package)
  if (fresh.unreadable)
    issues.push(`card-generated-package: ${found.fields.package} cannot be read — ${fresh.unreadable}`)
  else if (fresh.inputsDigest !== found.fields['inputs-sha256'])
    issues.push(
      `card-generated-stale: ${found.fields.package} or a Bend file it names changed since projection — run oracle-package.mjs project-card again (a changed meaning is a new revision)`,
    )
  else if (fresh.unverified)
    issues.push(`card-generated-unverified: the generated region could not be regenerated — ${fresh.unverified}`)
  else if (fresh.content !== found.content)
    issues.push(
      'card-generated-drift: regenerating from the package does not reproduce the generated region — it was edited by hand (even with a recomputed digest); edit the package and regenerate',
    )
  return issues
}

/** 패키지 파일과 그것이 부르는 세계·모델·법칙 Bend 파일 전부(전이 import 포함)의 경로·digest — 정렬, 시각 없음. */
export async function packageInputs(loaded) {
  const { bendInputs } = await import('./oracle-model.mjs')
  const { pkg } = loaded
  const portable = (path) => relative(loaded.root, path).split('\\').join('/')
  const entries = [{ path: portable(loaded.path), sha256: sha256(loaded.text) }]
  const metamorphic = typeof pkg.metamorphic === 'object' ? pkg.metamorphic?.source : undefined
  for (const id of [pkg.world?.source, pkg.behavior?.model, pkg.behavior?.laws, metamorphic]) {
    const path = id ? sourcePath(loaded, id) : null
    if (!path) continue
    for (const input of await bendInputs(path)) entries.push({ path: portable(input.path), sha256: input.sha256 })
  }
  const unique = [...new Map(entries.map((entry) => [entry.path, entry])).values()]
  return unique.sort((left, right) => (left.path < right.path ? -1 : 1))
}

export const inputsDigestOf = (inputs) => sha256(stableStringify(inputs))

/**
 * card lint용 — 저장소 루트(cwd)에서 패키지를 읽어 생성 영역을 다시 만든다. 행동 모델이 있으면 설치된 Bend로 모델을
 * 컴파일해 순서 의무까지 다시 계산한다(내려받지 않는다 — 없으면 unverified).
 */
export function regenerateAtRoot(root = process.cwd()) {
  return async (packagePath) => {
    let loaded
    let inputsDigest
    try {
      loaded = await loadPackage(packagePath, { root })
      inputsDigest = inputsDigestOf(await packageInputs(loaded))
    } catch (error) {
      return { unreadable: error.message }
    }
    let bin = null
    if (loaded.pkg.behavior) {
      try {
        const { ensureBend } = await import('./ensure-bend.mjs')
        ;({ bin } = await ensureBend({
          download: () => {
            throw Object.assign(new Error('card lint never downloads Bend'), { code: 'BEND_NOT_INSTALLED' })
          },
        }))
      } catch (error) {
        return { inputsDigest, unverified: `Bend is not installed (${error.code ?? error.message})` }
      }
    }
    try {
      const { derived } = await derivePackage(loaded, { bin })
      return { inputsDigest, content: renderGenerated(loaded.pkg, derived).replace(/\n$/, '') }
    } catch (error) {
      return { inputsDigest, unverified: `${error.code ?? 'DERIVE_FAILED'}: ${error.message}` }
    }
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** 패키지 → 파생 결과. 세계·모델 원문을 읽고, bin이 있으면 행동 모델 공간을 열거해 순서 의무를 계산한다. */
export async function derivePackage(loaded, { bin = null, timeoutMs } = {}) {
  const { pkg } = loaded
  const worldPath = sourcePath(loaded, pkg.world?.source)
  const modelPath = pkg.behavior ? sourcePath(loaded, pkg.behavior.model) : null
  if (!worldPath) throw new PackageError('PACKAGE_WORLD', 'world.source is not a repo: source')
  const texts = {
    world: await readFile(worldPath, 'utf8').catch(() => {
      throw new PackageError('PACKAGE_WORLD', `${worldPath} cannot be read`)
    }),
    model: modelPath ? await readFile(modelPath, 'utf8').catch(() => null) : null,
  }
  const { enumerateSpace, loadModel } = await import('./oracle-model.mjs')
  const inputs = await packageInputs(loaded)
  let space = null
  if (bin && modelPath && texts.model) {
    const model = await loadModel({ model: modelPath, prefix: pkg.behavior.prefix, bin, timeoutMs })
    space = enumerateSpace(model, { bound: pkg.behavior.bound })
  }
  return { derived: derive(pkg, texts, { space, inputs }), texts, inputs, inputsDigest: inputsDigestOf(inputs) }
}

function parseOptions(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]?.replace(/^--/, '')
    if (name === 'no-bend') {
      options['no-bend'] = true
      continue
    }
    const value = args[index + 1]
    if (!['package', 'out', 'card', 'stage', 'title', 'timeout-ms'].includes(name) || value === undefined)
      throw new PackageError('USAGE', `Unknown or incomplete option: ${args[index]}`, 2)
    options[name] = value
    index += 1
  }
  return options
}

const USAGE = `usage:
  oracle-package.mjs validate --package <oracle.package.json> [--stage model|project]
  oracle-package.mjs derive --package <oracle.package.json> [--out <derived.json>] [--no-bend]
  oracle-package.mjs project-card --package <oracle.package.json> --out <oracle.md> [--title <text>] [--no-bend]
  oracle-package.mjs check-card --package <oracle.package.json> --card <oracle.md> [--no-bend]`

async function binFor(options) {
  if (options['no-bend']) return null
  const { ensureBend } = await import('./ensure-bend.mjs')
  return (await ensureBend()).bin
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!['validate', 'derive', 'project-card', 'check-card'].includes(command)) throw new PackageError('USAGE', USAGE, 2)
  const options = parseOptions(args)
  if (!options.package) throw new PackageError('USAGE', USAGE, 2)
  const loaded = await loadPackage(options.package)
  const stage = options.stage ?? (command === 'derive' ? 'model' : 'project')
  if (!['model', 'project'].includes(stage)) throw new PackageError('USAGE', USAGE, 2)
  const issues = packageIssues(loaded.pkg, { stage })
  if (command === 'validate' || issues.length > 0) {
    process.stdout.write(`${JSON.stringify({ stage, issues })}\n`)
    if (issues.length > 0) throw new PackageError('PACKAGE_INVALID', `${issues.length} issue(s)`)
    return
  }
  const timeoutMs = options['timeout-ms'] ? Number(options['timeout-ms']) : undefined
  const { derived, inputsDigest } = await derivePackage(loaded, { bin: await binFor(options), timeoutMs })
  if (command === 'derive') {
    const text = `${JSON.stringify(derived, null, 2)}\n`
    if (options.out) await writeFile(options.out, text)
    process.stdout.write(options.out ? `DERIVED ${options.out} ${derived.digest} ${derived.status}\n` : text)
    process.exitCode = derived.status === 'derived' ? 0 : 1
    return
  }
  const cardPath = options.out ?? options.card
  if (!cardPath) throw new PackageError('USAGE', USAGE, 2)
  const packagePath = relative(loaded.root, loaded.path).split('\\').join('/')
  const existing = await readFile(cardPath, 'utf8').catch(() => null)
  if (command === 'project-card') {
    if (existing !== null && !generatedBlock(existing).present)
      throw new PackageError(
        'CARD_NOT_GENERATED',
        `${cardPath} exists and has no generated region — project into a new file; never overwrite a hand-written card`,
      )
    const card = projectCard(loaded.pkg, derived, {
      packagePath,
      inputsDigest,
      existing,
      title: options.title ?? null,
    })
    await writeFile(cardPath, card)
    process.stdout.write(`CARD_PROJECTED ${cardPath} ${derived.status}\n`)
    return
  }
  if (existing === null) throw new PackageError('CARD_UNREADABLE', `${cardPath} cannot be read`)
  // 전체 재생성 비교 — 본문을 다시 만들어 카드의 생성 영역과 바이트로 비교한다(생성기 코드의 비결정성도 여기서 드러난다).
  const found = generatedBlock(existing)
  const content = renderGenerated(loaded.pkg, derived).replace(/\n$/, '')
  const result = found.present
    ? await generatedIssues(existing, {
        regenerate: async () =>
          loaded.pkg.behavior && !derived.order
            ? { inputsDigest, unverified: 'Bend was not run (--no-bend)' }
            : { inputsDigest, content },
      })
    : ['card-generated-missing: the card has no generated region']
  process.stdout.write(`${JSON.stringify({ issues: result })}\n`)
  process.exitCode = result.length === 0 ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    const cliError =
      error instanceof PackageError
        ? error
        : new PackageError(error.code ?? 'PACKAGE_FAILED', error.message ?? String(error))
    process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
    process.exitCode = cliError.exitCode
  }
}
