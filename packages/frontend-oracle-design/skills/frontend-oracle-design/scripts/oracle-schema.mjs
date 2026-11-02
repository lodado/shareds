/**
 * oracle-schema.mjs — the rule table of the model package (oracle.package.json) and of the Space discovery record (S4).
 *
 * One row per field rule, in decision order: the field path, the graph node that waits for it, whether it must be
 * decided, its allowed values, what must be decided before it, the named predicate that judges it and the line that
 * fixes it. packageIssues (the package node, the card projection, closure), `oracle-package.mjs set` (one field at write
 * time) and the skeleton oracle-step.mjs writes all read these rows: a rule they judge is a row here.
 *
 * An undecided value is `{"todo": "<what to decide>", "oneOf": [...]}` (or `"shape"` for free text). Every judge reads
 * the package without its todos, a row whose fields still hold one is not judged, and the todo itself is the issue:
 * a skeleton names each field once instead of failing every rule on it.
 */

export const PACKAGE_VERSION = 2
export const PACKAGE_VERSIONS = [1, 2]
export const FAMILIES = ['Data', 'Value', 'Async', 'Order', 'Entry', 'Environment', 'Platform', 'Inherited']
// 테스트가 몰아야 하는 입력 계열 — Inherited(이전 정책)는 interaction sweep의 몫이다.
export const INPUT_FAMILIES = FAMILIES.filter((family) => family !== 'Inherited')
export const WORLD_ROLES = ['controllable', 'observable', 'hidden', 'concept', 'derived']
export const GOAL_AUTHORS = ['analyst', 'controller']
export const LAW_KINDS = ['safety', 'effect', 'witness']
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
  'space-cross-check',
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
export const DECISIONS = ['promoted', 'covered', 'out-of-scope', 'equivalent', 'accepted-risk', 'rejected', 'held']
export const HOLD_STATUS = ['open', 'resolved']
export const AXIS_ORIGINS = ['source', 'model', 'counterexample', 'incident', 'analyst', 'review']
export const TESTABILITY = ['tested', 'monitored', 'untestable']
export const ASSUMPTION_STATUS = ['open', 'confirmed', 'refuted']
export const LIFECYCLE_KEYS = ['valid', 'invalid', 'transitions', 'owner', 'lifetime', 'invariant']
export const SOURCE_KINDS = ['product-policy', 'mandatory-constraint', 'project-constraint', 'implementation-reference']
export const RISKS = ['Low', 'Medium', 'High']
/**
 * 비동기 작업마다 모델을 쓰기 전에 처분할 칸 — 원문이 비워 두기 쉬워 Bend 전이를 쓰는 도중에야 질문이 되던 것들이다.
 * 각 칸은 원문(`source`)·승인된 프로젝트 기본 정책(`default`)·해당 없음(`n/a`) 중 하나로 승인된 S*를 인용하거나,
 * `question`으로 Open question Q* 또는 hold H*를 인용한다.
 */
export const ASYNC_CELLS = [
  'late-success-after-cancel',
  'late-failure-after-success',
  'older-response-after-newer',
  'duplicate-completion',
  'lost-response',
  'retry-while-pending',
  'unmount-before-settle',
]
export const CELL_DECISIONS = ['source', 'default', 'n/a', 'question']
const INTENT_TEXT = ['actor', 'observableSuccess', 'nonGoals', 'worstRegression', 'reversibility']
const CONTRACT_TEXT = ['given', 'when', 'then', 'never', 'sideEffects']

// ---- names Bend refuses (Bend 2.0.34 `--check-only`): keywords, and the names Base already declares

export const BEND_KEYWORDS = Object.freeze({
  // a type or constructor name
  types: ['Kind', 'Type', 'Data'],
  // a record field name
  fields: ['type', 'match', 'case', 'for', 'return', 'import', 'def', 'is', 'where', 'do', 'law', 'exs'],
})
// Base's types and constructors: declaring one again is `duplicate declaration`
export const BEND_BASE_NAMES = Object.freeze(
  [
    'Empty Unit Bool Cmp Either Sigma Nat Maybe Result List Word U32 F32 Char String Array Image Event Map IO App',
    'False True LT EQ GT Inl Inr Tuple Zero Succ None Some Fail Done Nil Con WNil WCon Chr SNil SCon ALeaf ANode',
    'Pix Qua Key Mouse Move Look Scroll Close MTip MLeaf MNode Emit Halt',
  ]
    .join(' ')
    .split(' '),
)

/** Why Bend refuses `name` as a type (and namespace) or a record field, or null. */
export function bendNameIssue(name, as) {
  if (as === 'field') return BEND_KEYWORDS.fields.includes(name) ? `${name} is a Bend keyword` : null
  if (BEND_KEYWORDS.types.includes(name)) return `${name} is a Bend keyword`
  return BEND_BASE_NAMES.includes(name) ? `${name} is already declared by Bend's Base` : null
}

// ---- words that leave a verdict open

export const VAGUE_WORDS = Object.freeze({
  // never machine-checkable: the row's Then or Never states the condition a test checks instead
  banned: ['적절히', '적절한', '적당히', '알맞게', '자연스럽게', '부드럽게', '깔끔하게', '유연하게', '빠르게', 'appropriately', 'properly', 'gracefully', 'smoothly'],
  // more than one meaning in a verdict: a row that uses one has a term whose Name holds it
  defined: ['success', 'complete', 'save', 'delete', 'cancel', 'same', 'latest', 'permission', 'change', '성공', '완료', '저장', '삭제', '취소', '동일', '같은', '최신', '권한', '변경'],
})

/**
 * The words of `words` that `text` uses: English at a word start, any case; Korean as a substring. Code spans are names
 * (a def, a world field, `World.successBlocks`), not prose, and are not read.
 */
export function vagueHits(text, words) {
  const prose = String(text ?? '').replace(/`[^`]*`/g, ' ')
  return words.filter((word) => (/^[a-z]/.test(word) ? new RegExp(`\\b${word}`, 'i').test(prose) : prose.includes(word)))
}

// ---- shared helpers

export const nonEmpty = (value) => typeof value === 'string' && value.trim() !== '' && value.trim() !== '—'
export function repoPathOf(location) {
  if (typeof location !== 'string' || !location.startsWith('repo:')) return null
  return location.slice('repo:'.length).split('#')[0]
}
const list = (value) => (Array.isArray(value) ? value : [])
const words = (value) => (value ?? '').split(/[\s,]+/).filter((token) => token && token !== 'none')

/** bva.md의 자동 추가 TC 7종. 계약 행이든 출처가 있는 N/A든 어딘가에는 나와야 한다. */
export const AUTO_TEST_CASES = [
  { kind: '중복', tokens: ['중복', 'duplicate'] },
  { kind: '오류', tokens: ['오류', '에러', 'error'] },
  { kind: '재시도', tokens: ['재시도', 'retry'] },
  { kind: '빈-데이터', tokens: ['빈 ', '0건', 'empty'] },
  { kind: '로딩', tokens: ['로딩', 'loading'] },
  { kind: 'out-of-order', tokens: ['out-of-order', '역전'] },
  { kind: '취소', tokens: ['취소', '이탈', 'cancel'] },
]

/** The auto test-case kinds no contract text or sourced N/A mentions yet. */
export function uncoveredAutoCases(pkg) {
  const text = [
    ...list(pkg?.contract).flatMap((entry) => [...CONTRACT_TEXT, 'bva', 'outside'].map((field) => entry?.[field] ?? '')),
    ...list(pkg?.notApplicable).map((entry) => entry?.text ?? ''),
  ].join(' ')
  return AUTO_TEST_CASES.filter(({ tokens }) => !tokens.some((token) => text.includes(token))).map(({ kind }) => kind)
}

/** 권위 — 승인된 원문. 구현 참고·패키지 자신·Bend 모델 파일은 결정의 근거가 되지 못한다(자기 참조다). */
export function approvedAuthority(source) {
  if (!source || source.self || source.approval !== 'approved') return false
  return source.kind !== 'implementation-reference' && !/\.bend$/.test(repoPathOf(source.location) ?? '')
}

/**
 * 계열 처분 — 매핑은 용어의 family로 하고, 여기는 나머지 둘이다: 행동 모델의 사건이 그 계열을 모는 경우와,
 * 원문이 허락하는 제외(사유가 S*를 인용한다). 그 밖의 문자열은 null.
 */
export function familyDisposition(value) {
  if (typeof value !== 'string') return null
  if (/^modeled:\s*behavior\s*$/.test(value)) return { kind: 'behavior' }
  const excluded = value.match(/^excluded:\s*(\S.*)$/)
  return excluded ? { kind: 'excluded', reason: excluded[1], sources: excluded[1].match(/\bS\d+\b/g) ?? [] } : null
}

/** 시간이 든 요청 — Order나 Async가 공간에 있다(버전 1은 늘). 행동 모델이 필요하고, hazard는 `modeled: behavior`로 처분할 수 있다. */
export function temporalOf(pkg) {
  const confirmedAxes = pkg?.packageVersion >= 2
  return !confirmedAxes || ['Order', 'Async'].some((family) => familyDisposition(pkg?.families?.[family])?.kind !== 'excluded')
}

/** 객체 안의 모든 문자열 값과 그 경로. */
function stringsOf(value, path = 'package') {
  if (typeof value === 'string') return [[path, value]]
  if (Array.isArray(value)) return value.flatMap((entry, index) => stringsOf(entry, `${path}[${index}]`))
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([key, entry]) => stringsOf(entry, `${path}.${key}`))
  return []
}

// ---- merged judges: one predicate each, read by the package and by the card lint

// 입력 계열은 테스트가 모는 축이어야 한다. 관찰 축만 매핑된 계열은 테스트가 그 조건을 만들 수 없으므로 "world로 전부
// 열거됨"이 근거가 되지 못한다 — 몰 수 있는 축(controllable·environment·event)이나 모델 검사 순서 의무가 있어야 매핑이다.
const drivenMember = (member) => member.role === 'controllable' || member.role === 'environment' || String(member.id).startsWith('event.')

/**
 * A family's disposition, judged the same way before the model (members: the terms tagged with it, events unknown) and
 * after it (members: the derived axes, events: the behavior model's). A member drives the family when the test sets it
 * (a controllable or environment axis) or it is a model event; Order also counts its order obligations.
 */
export function familyVerdict(family, declared, members, { events = null, ordered = false } = {}) {
  const mapped = members.map((member) => member.id)
  const driven = members.filter(drivenMember).map((member) => member.id)
  if (familyDisposition(declared)?.kind === 'behavior') {
    if (events === null || events.length > 0) return { family, status: 'mapped', via: 'behavior', axes: [...driven, ...(events ?? [])] }
    return { family, status: 'undispositioned', blocked: 'family-behavior-missing', message: `${family} is "modeled: behavior" but no behavior model event drives it` }
  }
  const observedOnly = mapped.length > 0 && family !== 'Inherited' && driven.length === 0 && !ordered
  if (observedOnly && declared) return { family, status: 'excluded', reason: declared, axes: mapped }
  if (observedOnly)
    return {
      family,
      status: 'undispositioned',
      axes: mapped,
      blocked: 'family-observation-only',
      message: `${family} maps only observed axes (${mapped.join(', ')}); add a controllable or environment axis, an event the model orders, or a sourced exclusion`,
    }
  if (mapped.length > 0) return { family, status: 'mapped', axes: driven.length > 0 ? driven : mapped, ...(declared ? { declared } : {}) }
  if (declared) return { family, status: 'excluded', reason: declared }
  return { family, status: 'undispositioned' }
}

/**
 * A hazard disposition: `modeled: <world fields>` (or `behavior` when the request has a behavior model), `n/a: S<n>
 * <reason>` or `question: Q<n>`. The package passes its term fields, the card its World.bend fields: null when it
 * holds, `{ form: true }` when the shape or its source or question is wrong, `{ fields }` for modeled names that are no
 * field.
 */
export function hazardVerdict(disposition, { fields = null, behavior = false, sourceKnown, questionKnown }) {
  const text = typeof disposition === 'string' ? disposition : ''
  const modeled = text.match(/^modeled:\s*(\S.*)$/)?.[1]
  if (modeled) {
    const unknown = fields === null ? [] : words(modeled).filter((field) => !(fields.has(field) || (behavior && field === 'behavior')))
    return unknown.length > 0 ? { fields: unknown } : null
  }
  const source = text.match(/^n\/a:\s*(S\d+)\s+\S/)?.[1]
  if (source) return sourceKnown(source) ? null : { form: true }
  const question = text.match(/^question:\s*(Q\d+)\s*$/)?.[1]
  return question && questionKnown(question) ? null : { form: true }
}

const lifecycleHolds = (lifecycle) =>
  typeof lifecycle === 'object' &&
  Object.keys(lifecycle ?? {}).every((key) => LIFECYCLE_KEYS.includes(key)) &&
  LIFECYCLE_KEYS.every((key) => nonEmpty(lifecycle?.[key]))

/** One term's verdicts, in the order they are reported. */
function termRules(term, { known, authoritative }) {
  const hasField = nonEmpty(term?.field)
  return [
    !WORLD_ROLES.includes(term?.role) && 'role',
    ['concept', 'derived'].includes(term?.role) === hasField && 'field',
    // derived — 다른 필드에서 계산되는 값: 세계 def를 가리키고, 제품은 그것을 상태로 저장하지 않는다
    (term?.role === 'derived') !== nonEmpty(term?.def) && 'def',
    ['controllable', 'observable'].includes(term?.role) !== nonEmpty(term?.path) && 'path',
    ...['context', 'name', 'definition'].filter((field) => !nonEmpty(term?.[field])),
    hasField && !nonEmpty(term?.not) && 'not',
    !['confirmed', 'open'].includes(term?.status) && 'status',
    term?.family !== undefined && !FAMILIES.includes(term.family) && 'family',
    !known(term?.source) && 'source-unknown',
    term?.status === 'confirmed' && !authoritative(term?.source) && 'source-authority',
    // Ubiquitous Language — 수명주기는 선택이지만, 적으면 여섯 칸 모두 문자열이어야 한다(빠진 용어는 closure가 known
    // unknown으로 보고한다).
    term?.lifecycle !== undefined && !lifecycleHolds(term.lifecycle) && 'lifecycle',
    hasField && bendNameIssue(term.field, 'field') && 'bend',
  ].filter(Boolean)
}

/**
 * The terms, judged the same way in the package (terms[]) and in the card's ## Terms (its columns mapped to the same
 * keys): unique T* IDs, one term per name in a context, the role's field, def and path, a confirmed term's authoritative
 * source, one term per world field. Verdicts only — the package and the card word them: [{ rule, term } | { rule:
 * 'conflated', field, owners }].
 */
export function termVerdicts(terms, rules) {
  const out = []
  const ids = new Set()
  const names = new Set()
  const fields = new Map()
  for (const term of terms) {
    if (!/^T\d+$/.test(term?.id ?? '') || ids.has(term.id)) out.push({ rule: 'id', term })
    ids.add(term?.id)
    const name = `${String(term?.context ?? '').toLowerCase()}/${String(term?.name ?? '').toLowerCase()}`
    if (names.has(name)) out.push({ rule: 'duplicate', term })
    names.add(name)
    out.push(...termRules(term, rules).map((rule) => ({ rule, term })))
    if (nonEmpty(term?.field)) fields.set(term.field, [...(fields.get(term.field) ?? []), term.id])
  }
  for (const [field, owners] of fields) if (owners.length > 1) out.push({ rule: 'conflated', field, owners })
  return out
}

/** A Bend law name — the card's Formal Model rows and the package's behavior.lawRows. */
export const isLawName = (name) => /^[a-z_][\w.]*$/.test(name ?? '')

/**
 * The laws together (the card's Formal Model table and the package's behavior.lawRows, which the card is projected from):
 * an effect law exists (safety alone holds for a model that does nothing), a policy with effect laws has a witness, every
 * policy is a law's or listed under Not formalized. laws: [{ kind, policies: [P*] }] in table order.
 */
export function lawSetIssues(laws, { policies, notFormalized }) {
  const out = []
  const cited = new Map()
  for (const law of laws) for (const id of law.policies) cited.set(id, [...(cited.get(id) ?? []), law.kind])
  // 공허성: 안전 법칙만으로는 아무것도 하지 않는 모델·구현도 통과한다 — 요구된 효과를 법칙으로 두고, 그 효과가 init에서
  // 실제로 일어난다는 exs 법칙을 같은 정책에 요구한다.
  if (laws.length > 0 && !laws.some(({ kind }) => kind === 'effect'))
    out.push(['formal-effect-missing', 'only safety laws — a model that does nothing satisfies them; state the required effect as an effect law'])
  for (const [policy, kinds] of cited)
    if (kinds.includes('effect') && !kinds.includes('witness'))
      out.push(['formal-witness-missing', `${policy} has effect laws but no witness (exs) law showing the effect happens from init`])
  for (const id of policies)
    if (!cited.has(id) && !new RegExp(`\\b${id}\\b`).test(notFormalized ?? ''))
      out.push(['formal-policy-unlisted', `${id} is cited by no law and not listed under Not formalized`])
  return out
}

/**
 * A contract text field's vague words: banned in then/never, and a verdict word another reader could take two ways needs
 * a term whose name holds it. termNames: lowercase names.
 */
export function vagueTextIssue(field, text, termNames) {
  const banned = ['then', 'never'].includes(field) ? vagueHits(text, VAGUE_WORDS.banned) : []
  if (banned.length > 0) return `says "${banned[0]}" — no test can check it; state the condition instead`
  const open = vagueHits(text, VAGUE_WORDS.defined).filter((word) => !termNames.some((name) => name.includes(word)))
  return open.length > 0 ? `says "${open[0]}" — add a term whose name holds it (which meaning), or reword` : null
}

// ---- the context the judges share

/** The ID sets and source predicates every judge reads, from a package without todos. */
export function ruleContext(pkg, { gate = false } = {}) {
  const sources = new Map()
  for (const source of list(pkg?.sources)) sources.set(source?.id, source)
  const ids = (items) => new Set(list(items).map((item) => item?.id))
  const ctx = {
    gate,
    sources,
    confirmedAxes: pkg?.packageVersion >= 2,
    temporal: temporalOf(pkg),
    // 축은 사용자와 확정한 뒤에 세계가 된다 — 그 문답 기록이 원문 출처로 남고 lock이 덮는다.
    sourceText: (id) => approvedAuthority(sources.get(id)),
    authoritative: (id) => Boolean(sources.get(id)) && sources.get(id).kind !== 'implementation-reference',
    questions: ids(pkg?.intent?.openQuestions),
    requirements: ids(pkg?.requirements),
    goals: ids(pkg?.goals),
    policies: ids(pkg?.policies),
    holds: ids(pkg?.holds),
    keys: new Set(list(pkg?.contract).map((entry) => entry?.key)),
    termFields: new Set(list(pkg?.terms).map((term) => term?.field).filter(nonEmpty)),
    termNames: list(pkg?.terms).map((term) => String(term?.name ?? '').toLowerCase()),
  }
  ctx.cite = (where, cited, { authority = false } = {}) => {
    const issues = []
    if (!Array.isArray(cited) || cited.length === 0) issues.push(`package-cite: ${where} must cite at least one S* source`)
    for (const id of list(cited)) {
      if (!sources.has(id)) issues.push(`package-cite-unknown: ${where}: ${id} is not a package source`)
      else if (authority && !ctx.authoritative(id)) issues.push(`package-cite-authority: ${where}: ${id} is an implementation reference, not an authority`)
    }
    return issues
  }
  ctx.citeRequirements = (where, cited) => {
    if (cited === undefined) return []
    const issues = Array.isArray(cited) ? [] : [`package-requirement-ref: ${where}: requirements must be a list of R* IDs`]
    for (const id of list(cited)) if (!ctx.requirements.has(id)) issues.push(`package-requirement-ref: ${where}: ${id} is not a requirement`)
    return issues
  }
  return ctx
}

// ---- the judges, one per row (each reads a package without todos and returns `code: message` issues)

// 패키지 문자열은 카드의 한 줄·한 칸으로 들어간다 — 줄바꿈이나 HTML 주석 표식이 있으면 생성 영역 안에 제목(예: User
// Confirmation)이나 영역 끝 표식을 끼워 넣을 수 있다. 생성기가 승인을 쓰는 통로가 되지 않게 전부 거부한다.
function textIssues(pkg) {
  return stringsOf(pkg)
    .filter(([, value]) => /[\r\n]|<!--|-->/.test(value))
    .map(([path]) => `package-text-unsafe: ${path} contains a line break or an HTML comment marker`)
}

function versionIssues(pkg) {
  return PACKAGE_VERSIONS.includes(pkg?.packageVersion)
    ? []
    : [`package-version: packageVersion must be ${PACKAGE_VERSION} (1 is the earlier shape without Space discovery)`]
}

function idIssues(pkg) {
  return /^[a-z][\w-]*$/.test(pkg?.id ?? '') ? [] : ['package-id: id must be a lowercase identifier']
}

function sourceIssues(pkg) {
  const issues = []
  const seen = new Set()
  for (const source of list(pkg?.sources)) {
    if (!/^S\d+$/.test(source?.id ?? '') || seen.has(source.id)) issues.push(`package-source-id: "${source?.id}" must be a unique S* ID`)
    seen.add(source?.id)
    if (!SOURCE_KINDS.includes(source?.kind)) issues.push(`package-source-kind: ${source?.id}: kind must be ${SOURCE_KINDS.join(' | ')}`)
    for (const field of ['jurisdiction', 'standard', 'location', 'approval'])
      if (!nonEmpty(source?.[field])) issues.push(`package-source-field: ${source?.id}: ${field} is required`)
    // Bend imports only plain names (letters, digits, _ and -): a dotted file name such as World.v1.bend cannot be
    // imported, and the kernel would report a failed proof instead of naming the file.
    const bendPath = repoPathOf(source?.location)
    if (/\.bend$/.test(bendPath ?? '') && !bendPath.replace(/\.bend$/, '').split('/').every((segment) => /^(?:[\w-]+|\.{1,2})$/.test(segment)))
      issues.push(`package-bend-name: ${source?.id}: ${bendPath} — Bend imports only plain names (letters, digits, _ and -) in each path segment`)
  }
  if (seen.size === 0) issues.push('package-sources: list the source text as sources')
  return issues
}

function selfSourceIssues(pkg) {
  return list(pkg?.sources).some((source) => source?.self === true)
    ? []
    : ['package-self: register this package file as a source with "self": true so the lock covers it']
}

// Requirement Inventory — 원문 문장 하나가 요구사항 하나다. quote는 원문에 글자 그대로 있어야 한다(closure가 확인한다).
function requirementIssues(pkg, ctx) {
  const issues = []
  const seen = new Set()
  for (const requirement of list(pkg?.requirements)) {
    if (!/^R\d+$/.test(requirement?.id ?? '') || seen.has(requirement.id)) issues.push(`package-requirement-id: "${requirement?.id}" must be a unique R* ID`)
    seen.add(requirement?.id)
    if (!nonEmpty(requirement?.quote)) issues.push(`package-requirement-quote: ${requirement?.id}: quote the source text`)
    const source = ctx.sources.get(requirement?.source)
    if (!source || source.kind === 'implementation-reference' || source.self || source.approval !== 'approved')
      issues.push(`package-requirement-source: ${requirement?.id}: source must be an authoritative package source`)
    else if (/\.bend$/.test(repoPathOf(source.location) ?? ''))
      issues.push(`package-requirement-source: ${requirement?.id}: a requirement quotes the source text, not a model`)
  }
  if (seen.size === 0) issues.push('package-requirements: list the source requirements as R* entries with verbatim quotes')
  return issues
}

function riskIssues(pkg) {
  return RISKS.includes(pkg?.intent?.risk) ? [] : [`package-intent-risk: intent.risk must be ${RISKS.join(' | ')}`]
}

function intentTextIssues(pkg) {
  return INTENT_TEXT.filter((field) => !nonEmpty(pkg?.intent?.[field])).map((field) => `package-intent-field: intent.${field} is required`)
}

function questionIssues(pkg, ctx) {
  const issues = []
  const seen = new Set()
  for (const question of list(pkg?.intent?.openQuestions)) {
    if (!/^Q\d+$/.test(question?.id ?? '') || seen.has(question.id)) issues.push(`package-question-id: "${question?.id}" must be a unique Q* ID`)
    seen.add(question?.id)
    if (!nonEmpty(question?.text)) issues.push(`package-question-text: ${question?.id}: text is required`)
    issues.push(...ctx.cite(`question ${question?.id}`, question?.sources))
  }
  return issues
}

function spaceDiscoveryIssues(pkg, ctx) {
  return ctx.confirmedAxes && !ctx.sourceText(pkg?.spaceDiscovery)
    ? ['package-space-discovery: name the approved source that records the axes and the counterexample answers the user confirmed — not this package, a model file or an implementation reference']
    : []
}

const FAMILY_FORM = `map it to a controllable field (terms[].family), write "modeled: behavior" or "excluded: <reason citing the S* source text>"`

/** A family value written on its own: the form, and an exclusion citing approved source text. */
function familyValueIssue(family, declared, ctx) {
  const disposition = familyDisposition(declared)
  if (!disposition) return `${family}: "${declared}" — ${FAMILY_FORM}`
  if (disposition.kind === 'excluded' && !disposition.sources.some(ctx.sourceText))
    return `${family}: an exclusion cites the source text that allows it (an S* that is not a model file)`
  return null
}

function familyIssues(pkg, ctx) {
  const issues = []
  const families = pkg?.families ?? {}
  for (const family of Object.keys(families)) if (!FAMILIES.includes(family)) issues.push(`package-family: ${family} is not one of ${FAMILIES.join(', ')}`)
  // every family, Inherited included: the disposition reads only families and terms, so the package node refuses what the
  // projection would — found at the card, its repair would rerun the model
  if (ctx.confirmedAxes)
    for (const family of FAMILIES) {
      const declared = families[family]
      const value = declared === undefined ? null : familyValueIssue(family, declared, ctx)
      if (value) {
        issues.push(`package-family: ${value}`)
        continue
      }
      const tagged = list(pkg?.terms).filter((term) => term?.family === family)
      const driven = tagged.filter((term) => term.role === 'controllable').map((term) => term.id)
      if (familyDisposition(declared)?.kind === 'excluded' && driven.length > 0) {
        issues.push(`package-family: ${family} is mapped by ${driven.join(', ')} and also excluded — keep one`)
        continue
      }
      const verdict = familyVerdict(family, declared, tagged.map((term) => ({ id: term.id, role: term.role })))
      if (verdict.blocked === 'family-observation-only')
        issues.push(`package-family-observation-only: ${family}: ${verdict.axes.join(', ')} only observe — an input family needs a field the test sets; ${FAMILY_FORM}`)
      if (verdict.status === 'undispositioned' && !verdict.blocked) issues.push(`package-family: ${family}: ${FAMILY_FORM}`)
    }
  return issues
}

// a version 1 package declares only the families it disposes of, in the two written forms
function v1FamilyIssues(pkg, ctx) {
  if (ctx.confirmedAxes) return []
  return FAMILIES.filter((family) => pkg?.families?.[family] !== undefined && !familyDisposition(pkg.families[family])).map(
    (family) => `package-family: ${family}: a declared family disposition is "excluded: <reason with S*>" or "modeled: behavior"`,
  )
}

function worldIssues(pkg, ctx) {
  const issues = []
  const world = pkg?.world ?? {}
  if (!ctx.sources.has(world.source) || !repoPathOf(ctx.sources.get(world.source)?.location)?.endsWith('.bend'))
    issues.push('package-world: world.source must name a repo:<path>.bend package source')
  if (!/^[A-Z]\w*$/.test(world.prefix ?? '')) issues.push('package-world: world.prefix must name the world record type')
  else if (bendNameIssue(world.prefix, 'type')) issues.push(`package-bend-reserved: world.prefix ${bendNameIssue(world.prefix, 'type')} — pick another record name`)
  return issues
}

const PACKAGE_TERM_TEXT = {
  id: ({ id }) => `package-term-id: "${id}" must be a unique T* ID`,
  duplicate: ({ id, name, context }) =>
    `package-term-duplicate: ${id}: "${name}" is already a term in context ${context} — the same word in another bounded context gets its own Context`,
  role: ({ id }) => `package-term-role: ${id}: role must be ${WORLD_ROLES.join(' | ')}`,
  field: ({ id }) => `package-term-field: ${id}: a concept or derived term has no field; every other role names one world field`,
  def: ({ id }) => `package-term-def: ${id}: a derived term names the world def that computes it; no other role names a def`,
  path: ({ id }) =>
    `package-term-path: ${id}: a controllable term says how the test sets it and an observable term the product path that reads it; hidden, concept and derived terms have none`,
  context: ({ id }) => `package-term-field: ${id}: context is required`,
  name: ({ id }) => `package-term-field: ${id}: name is required`,
  definition: ({ id }) => `package-term-field: ${id}: definition is required`,
  not: ({ id }) => `package-term-not: ${id}: name the neighbouring meaning (not)`,
  status: ({ id }) => `package-term-status: ${id}: status must be confirmed | open`,
  family: ({ id }) => `package-term-family: ${id}: family must be one of ${FAMILIES.join(', ')}`,
  'source-unknown': ({ id, source }) => `package-cite-unknown: term ${id}: ${source} is not a package source`,
  'source-authority': ({ id }) => `package-term-source: ${id}: a confirmed term cites one approved, non-implementation source`,
  lifecycle: ({ id }) => `package-term-lifecycle: ${id}: lifecycle needs exactly ${LIFECYCLE_KEYS.join(', ')}`,
  bend: ({ id, field }) => `package-bend-reserved: ${id}: field ${bendNameIssue(field, 'field')} — rename the world field`,
}

function termIssues(pkg, ctx) {
  // the card's Source Registry calls a source authoritative when it is approved and not an implementation reference
  const rules = { known: (id) => ctx.sources.has(id), authoritative: (id) => ctx.sources.get(id)?.approval === 'approved' && ctx.authoritative(id) }
  return termVerdicts(list(pkg?.terms), rules).flatMap((verdict) => {
    if (verdict.rule === 'conflated') return [`package-term-conflated: ${verdict.field}: ${verdict.owners.join(', ')} name one world field`]
    // an unknown source is already reported; the authority rule speaks of a source that exists
    if (verdict.rule === 'source-authority' && !ctx.sources.has(verdict.term?.source)) return []
    return [PACKAGE_TERM_TEXT[verdict.rule](verdict.term ?? {})]
  })
}

function assumptionIssues(pkg, ctx) {
  const issues = []
  const seen = new Set()
  for (const assumption of list(pkg?.assumptions)) {
    if (!/^A\d+$/.test(assumption?.id ?? '') || seen.has(assumption.id)) issues.push(`package-assumption-id: "${assumption?.id}" must be a unique A* ID`)
    seen.add(assumption?.id)
    if (!ctx.sources.has(assumption?.source)) issues.push(`package-cite-unknown: assumption ${assumption?.id}: ${assumption?.source} is not a package source`)
    if (!nonEmpty(assumption?.falsifier)) issues.push(`package-assumption-falsifier: ${assumption?.id}: falsifier is required`)
    if (!nonEmpty(assumption?.owner)) issues.push(`package-assumption-owner: ${assumption?.id}: owner is required`)
    else if (/^product\b/i.test(assumption.owner)) issues.push(`package-assumption-owner: ${assumption?.id}: a duty of the product is a goal, not an assumption`)
    // Assumption Registry — 무엇을 근거로 믿는지, 틀리면 무엇이 깨지는지, 검사할 수 있는지, 지금 어떤 상태인지.
    for (const field of ['evidence', 'riskIfFalse'])
      if (!nonEmpty(assumption?.[field])) issues.push(`package-assumption-registry: ${assumption?.id}: ${field} is required`)
    if (!TESTABILITY.includes(assumption?.testability)) issues.push(`package-assumption-registry: ${assumption?.id}: testability must be ${TESTABILITY.join(' | ')}`)
    if (!ASSUMPTION_STATUS.includes(assumption?.status)) issues.push(`package-assumption-registry: ${assumption?.id}: status must be ${ASSUMPTION_STATUS.join(' | ')}`)
    issues.push(...ctx.citeRequirements(`assumption ${assumption?.id}`, assumption?.requirements))
  }
  return issues
}

function goalIssues(pkg, ctx) {
  const issues = []
  const seen = new Set()
  for (const goal of list(pkg?.goals)) {
    issues.push(...ctx.citeRequirements(`goal ${goal?.id}`, goal?.requirements))
    if (!/^G\d+$/.test(goal?.id ?? '') || seen.has(goal.id)) issues.push(`package-goal-id: "${goal?.id}" must be a unique G* ID`)
    seen.add(goal?.id)
    if (!['safety', 'witness'].includes(goal?.kind)) issues.push(`package-goal-kind: ${goal?.id}: kind must be safety | witness`)
    // 목표는 원문에서 온다 — 카드 행이나 행동 모델을 인용하면 모델이 자기 자신과 비교된다.
    issues.push(...ctx.cite(`goal ${goal?.id}`, goal?.cites, { authority: true }))
    for (const id of list(goal?.cites))
      if (/\.bend$/.test(repoPathOf(ctx.sources.get(id)?.location) ?? ''))
        issues.push(`package-goal-source: ${goal?.id}: ${id} is a model file — a goal cites the source text, not a model`)
    if (!GOAL_AUTHORS.includes(goal?.author)) issues.push(`package-goal-author: ${goal?.id}: author must be ${GOAL_AUTHORS.join(' | ')} — who read the source`)
  }
  if (!list(pkg?.goals).some((goal) => goal?.kind === 'safety')) issues.push('package-goal-missing: state at least one safety goal from the source text')
  return issues
}

function exampleIssues(pkg, ctx) {
  const issues = []
  for (const example of list(pkg?.examples)) {
    if (!/^E\d+$/.test(example?.id ?? '')) issues.push(`package-example: "${example?.id}" must be an E* ID`)
    if (!ctx.goals.has(example?.goal)) issues.push(`package-example: ${example?.id}: ${example?.goal} is not a goal`)
    if (!['holds', 'violates'].includes(example?.verdict)) issues.push(`package-example: ${example?.id}: verdict must be holds | violates`)
  }
  return issues
}

const HAZARD_FORM = 'modeled: <fields> | n/a: S<n> <reason> | question: Q<n>'

/** One hazard as the package judges it — the card judges the same disposition against World.bend (hazardVerdict). */
function hazardValueIssue(id, disposition, ctx) {
  const verdict = hazardVerdict(disposition, {
    fields: ctx.termFields,
    behavior: ctx.temporal,
    sourceKnown: (source) => ctx.sources.has(source),
    questionKnown: (question) => ctx.questions.has(question),
  })
  if (!verdict) return null
  if (verdict.form) return `${id}: ${HAZARD_FORM}`
  return `${id}: ${verdict.fields.join(', ')} ${verdict.fields.length > 1 ? 'are not world fields' : 'is not a world field'} — modeled names a terms[].field${ctx.temporal ? ' or behavior' : ''}`
}

function hazardIssues(pkg, ctx) {
  const hazards = pkg?.hazards ?? {}
  const issues = HAZARD_IDS.map((id) => hazardValueIssue(id, hazards[id], ctx)).filter(Boolean).map((text) => `package-hazard: ${text}`)
  for (const id of Object.keys(hazards)) if (!HAZARD_IDS.includes(id)) issues.push(`package-hazard: ${id} is not one of ${HAZARD_IDS.join(', ')}`)
  return issues
}

function cellIssue(where, cell, ctx) {
  if (!CELL_DECISIONS.includes(cell?.decision)) return `${where}: decision must be ${CELL_DECISIONS.join(' | ')}`
  if (cell.decision === 'question')
    return ctx.questions.has(cell.ref) || ctx.holds.has(cell.ref) ? null : `${where}: a question cites an Open question Q* or a hold H*`
  return ctx.sourceText(cell.ref) ? null : `${where}: ${cell.decision} cites an approved authoritative S* — an unapproved recommendation is not a default`
}

/**
 * `asyncCells` 검사. 있으면 모양을 늘 본다. 작성 그래프의 패키지 노드(gate)이면 Async가 공간에 있는 버전 2 패키지에서
 * 작업마다 일곱 칸이 모두 처분돼야 한다 — 모델을 쓰기 전에 열린 칸을 한 번에 묻게 하는 장치다.
 */
function asyncCellsIssues(pkg, ctx) {
  const issues = []
  const operations = pkg?.asyncCells
  const asyncInSpace = ctx.confirmedAxes && familyDisposition(pkg?.families?.Async)?.kind !== 'excluded'
  if (operations === undefined) {
    if (ctx.gate && asyncInSpace)
      issues.push('package-async-cells: Async is in the space — list asyncCells per async operation with all seven cells decided before writing the model')
    return issues
  }
  if (!Array.isArray(operations) || operations.length === 0) return ['package-async-cells: asyncCells is a non-empty list of operations']
  for (const operation of operations) {
    const where = `asyncCells ${operation?.operation}`
    if (!nonEmpty(operation?.operation)) issues.push('package-async-cells: each entry names its operation')
    for (const id of ASYNC_CELLS) {
      const issue = cellIssue(`${where} ${id}`, operation?.cells?.[id], ctx)
      if (issue) issues.push(`package-async-cells: ${issue}`)
    }
  }
  return issues
}

/** `asyncCells` 검사 — `required`는 작성 그래프의 패키지 노드와 같다. */
export function asyncCellIssues(pkg, { required = false } = {}) {
  return asyncCellsIssues(pkg, ruleContext(pkg, { gate: required }))
}

// 교차검증 번역표 — 선언한 차원마다 세계 필드 하나 또는 행동 모델 def 하나, 선언 값마다 그 값이나 생성자
function crossCheckIssues(pkg, ctx) {
  const issues = []
  const cross = pkg?.crossCheck
  if (cross === undefined) return issues
  if (!ctx.confirmedAxes) issues.push('package-cross-check: crossCheck needs a version-2 package with a Space discovery record')
  if (!ctx.sourceText(cross?.declared ?? pkg?.spaceDiscovery))
    issues.push('package-cross-check: crossCheck.declared names the approved source with the declared ## Case space — the Space discovery record by default, never a model file')
  for (const [name, entry] of Object.entries(cross?.dimensions ?? {})) {
    if ([entry?.world, entry?.classify].filter(nonEmpty).length !== 1)
      issues.push(`package-cross-check: ${name}: name exactly one of world (a world field) or classify (a behavior model def)`)
    if (!entry?.values || typeof entry.values !== 'object' || Object.keys(entry.values).length === 0)
      issues.push(`package-cross-check: ${name}: values maps each declared value to a world value or a constructor`)
  }
  for (const field of ['phase', 'step'])
    if (cross?.stateModel !== undefined && !nonEmpty(cross.stateModel?.[field])) issues.push(`package-cross-check: stateModel.${field} names a behavior model def`)
  if (cross?.states !== undefined && !ctx.sourceText(cross.states))
    issues.push('package-cross-check: crossCheck.states names the approved source with the analyst state table, never a model file')
  const review = cross?.reviewedBy
  if (review !== undefined && (!nonEmpty(review?.agent) || !/^[a-f0-9]{64}$/.test(review?.inputDigest ?? '')))
    issues.push('package-cross-check: crossCheck.reviewedBy is {agent, inputDigest: sha256 of the mapping-input it read}')
  return issues
}

/** 계약 행 고정값 검사 — 모델 단계에서도 돈다(행 배정이 잘못된 고정값에서 멈추거나 두 키에 같은 ID를 주지 않게). */
export function contractRowIssues(contract) {
  const issues = []
  const pinned = new Set()
  const defs = new Map()
  for (const entry of list(contract)) {
    if (entry?.row !== undefined) {
      if (typeof entry.row !== 'string' || !/^O\d+$/.test(entry.row) || pinned.has(entry.row))
        issues.push(`package-contract-row: ${entry?.key}: row must be a unique O* ID`)
      pinned.add(entry.row)
    }
    if (entry?.def) {
      if (defs.has(entry.def))
        issues.push(`package-contract-def-duplicate: ${entry.key} and ${defs.get(entry.def)} name the same def ${entry.def} — one predicate is one row`)
      defs.set(entry.def, entry.key)
    }
  }
  return issues
}

const contractPinIssues = (pkg) => contractRowIssues(pkg?.contract)

function policyIssues(pkg, ctx) {
  const issues = []
  const seen = new Set()
  for (const policy of list(pkg?.policies)) {
    if (!/^P\d+$/.test(policy?.id ?? '') || seen.has(policy.id)) issues.push(`package-policy-id: "${policy?.id}" must be a unique P* ID`)
    seen.add(policy?.id)
    if (!nonEmpty(policy?.text)) issues.push(`package-policy-text: ${policy?.id}: text is required`)
    issues.push(...ctx.cite(`policy ${policy?.id}`, policy?.sources, { authority: true }))
    issues.push(...ctx.citeRequirements(`policy ${policy?.id}`, policy?.requirements))
  }
  if (seen.size === 0) issues.push('package-policies: list the decided policies')
  return issues
}

function contractIssues(pkg, ctx) {
  const issues = []
  const keys = new Set()
  const cited = new Set()
  for (const entry of list(pkg?.contract)) {
    if (!/^[a-z_]\w*$/i.test(entry?.key ?? '') || keys.has(entry.key)) issues.push(`package-contract-key: "${entry?.key}" must be a unique model symbol`)
    keys.add(entry?.key)
    const inWorld = entry?.def !== undefined && entry?.def !== null
    if (inWorld === nonEmpty(entry?.outside))
      issues.push(`package-contract-def: ${entry?.key}: name the world def that states it, or say why it is outside the world (outside) — exactly one`)
    if (inWorld && !/^[a-z_]\w*$/i.test(entry.def)) issues.push(`package-contract-def: ${entry?.key}: def must be a symbol`)
    for (const policy of list(entry?.policies)) {
      cited.add(policy)
      if (!ctx.policies.has(policy)) issues.push(`package-contract-policy: ${entry?.key}: ${policy} is not a policy`)
    }
    if (list(entry?.policies).length === 0) issues.push(`package-contract-policy: ${entry?.key}: cite at least one policy`)
    for (const field of CONTRACT_TEXT) if (!nonEmpty(entry?.[field])) issues.push(`package-contract-text: ${entry?.key}: ${field} is required`)
    issues.push(...ctx.citeRequirements(`contract ${entry?.key}`, entry?.requirements))
  }
  if (keys.size === 0) issues.push('package-contract: list the contract predicates')
  for (const policy of ctx.policies) if (!cited.has(policy)) issues.push(`package-policy-unlinked: ${policy} is cited by no contract entry`)
  return issues
}

/** The card lint's vague-word rules on the text the projection copies from each contract entry. */
function contractTextIssues(pkg, ctx) {
  return list(pkg?.contract).flatMap((entry) =>
    [...CONTRACT_TEXT, 'bva', 'outside']
      .map((field) => [field, typeof entry?.[field] === 'string' ? vagueTextIssue(field, entry[field], ctx.termNames) : null])
      .filter(([, issue]) => issue)
      .map(([field, issue]) => `package-contract-vague: ${entry?.key}.${field} ${issue}`),
  )
}

// 노출 타입 경계(Props·공유 API·상태 유니온·신뢰 경계 타입)가 없다는 선언 — 사유와 조사한 파일이 둘 다 있어야 한다.
function typeContractIssues(pkg) {
  if (pkg?.typeContract === undefined) return []
  const { notApplicable, paths } = pkg.typeContract ?? {}
  return !nonEmpty(notApplicable) || !Array.isArray(paths) || paths.length === 0 || !paths.every(nonEmpty)
    ? ['package-type-contract: typeContract needs notApplicable (why no exported Props, shared API, state union or trust-boundary type is involved) and paths (the investigated repo:<path> files)']
    : []
}

function notApplicableIssues(pkg, ctx) {
  return list(pkg?.notApplicable).flatMap((entry) => [
    ...(nonEmpty(entry?.text) ? [] : ['package-na: a notApplicable entry needs text']),
    ...ctx.cite('notApplicable', entry?.sources, { authority: true }),
    ...ctx.citeRequirements('notApplicable', entry?.requirements),
  ])
}

// 시간이 든 요청만 행동 모델(MODEL·LAWS·PROOF)을 쓴다 — Order나 Async가 매핑되면 필수, 둘 다 원문으로 제외되면 세계와
// 적절성 점검과 세계 대응 검사로 충분하다. 버전 1 패키지는 예전처럼 늘 필요하다.
function behaviorIssues(pkg, ctx) {
  const behavior = pkg?.behavior
  if (!behavior)
    return ctx.temporal
      ? [
          `package-behavior-missing: ${
            ctx.confirmedAxes
              ? 'Order or Async is part of the space, so the behavior model is required: behavior: {model, laws, prefix, bound, ...}'
              : 'the mandatory Formal Model needs behavior: {model, laws, prefix, bound, ...}'
          }`,
        ]
      : []
  const issues = []
  for (const field of ['model', 'laws'])
    if (!ctx.sources.has(behavior[field]) || !repoPathOf(ctx.sources.get(behavior[field])?.location)?.endsWith('.bend'))
      issues.push(`package-behavior: behavior.${field} must name a repo:<path>.bend package source`)
  if (!/^[A-Z]\w*$/.test(behavior.prefix ?? '')) issues.push('package-behavior: behavior.prefix must name the model namespace')
  else if (bendNameIssue(behavior.prefix, 'type')) issues.push(`package-bend-reserved: behavior.prefix ${bendNameIssue(behavior.prefix, 'type')} — pick another namespace`)
  if (!Number.isSafeInteger(behavior.bound) || behavior.bound < 1) issues.push('package-behavior: behavior.bound must be a positive safe integer')
  for (const field of ['observation', 'outOfScope', 'notFormalized'])
    if (!nonEmpty(behavior[field])) issues.push(`package-behavior: behavior.${field} is required`)
  if (!ctx.keys.has(behavior.conformance)) issues.push('package-behavior: behavior.conformance must name a contract key')
  const laws = list(behavior.lawRows)
  for (const law of laws) {
    if (!LAW_KINDS.includes(law?.kind)) issues.push(`package-law: ${law?.name}: kind must be ${LAW_KINDS.join(' | ')}`)
    for (const id of list(law?.cites)) if (!ctx.policies.has(id) && !ctx.keys.has(id)) issues.push(`package-law: ${law?.name}: ${id} is neither a policy nor a contract key`)
  }
  if (laws.length === 0) issues.push('package-law: behavior.lawRows lists every law in the laws file')
  // the card's Formal Model table is projected from lawRows: its law rules, found before the model is run
  const composed = laws.map((law) => ({ kind: law?.kind, policies: list(law?.cites).filter((id) => /^P\d+$/.test(id)) }))
  for (const law of laws.filter((entry) => !isLawName(entry?.name))) issues.push(`package-law: ${law?.name || '(empty)'} is not a Bend law name`)
  for (const [index, law] of composed.entries())
    if (law.policies.length === 0) issues.push(`package-law: ${laws[index]?.name} must cite the P* policy it formalizes`)
  const policies = [...ctx.policies].filter((id) => /^P\d+$/.test(id ?? ''))
  if (laws.length > 0)
    for (const [, text] of lawSetIssues(composed, { policies, notFormalized: behavior.notFormalized })) issues.push(`package-law: ${text}`)
  issues.push(...ctx.citeRequirements('behavior', behavior.requirements))
  return issues
}

// ---- Discovery registry: shapes checked whenever present — closure (oracle-discovery.mjs) asks for them, the card does not

const DISPOSITION = /^(?:n\/a:\s*(S\d+)\s+\S.*|modeled:\s*([\w.]+)\s*)$/
const repoFileIssue = (where, value) =>
  !nonEmpty(value) || value.startsWith('/') || value.includes('..') ? [`package-discovery-path: ${where} must be a repository-relative path`] : []

function spaceVersionIssues(pkg) {
  return pkg?.spaceVersion !== undefined && !(Number.isInteger(pkg.spaceVersion) && pkg.spaceVersion >= 1)
    ? ['package-space-version: spaceVersion must be a positive integer']
    : []
}

function axisOriginIssues(pkg) {
  return Object.entries(pkg?.axisOrigins ?? {}).flatMap(([axis, origin]) => [
    ...(AXIS_ORIGINS.includes(origin?.origin) ? [] : [`package-axis-origin: ${axis}: origin must be ${AXIS_ORIGINS.join(' | ')}`]),
    ...['ref', 'reason'].filter((field) => !nonEmpty(origin?.[field])).map((field) => `package-axis-origin: ${axis}: ${field} is required`),
  ])
}

function faultModelIssues(pkg) {
  const issues = []
  const seen = new Set()
  for (const fault of list(pkg?.faultModel)) {
    if (!/^F\d+$/.test(fault?.id ?? '') || seen.has(fault.id)) issues.push(`package-fault-id: "${fault?.id}" must be a unique F* ID`)
    seen.add(fault?.id)
    if (!FAULT_CLASSES.includes(fault?.class)) issues.push(`package-fault-class: ${fault?.id}: class must be one of ${FAULT_CLASSES.join(', ')}`)
    issues.push(...repoFileIssue(`fault ${fault?.id}: file`, fault?.file))
    // 결함은 제품에 심는다 — 어댑터나 하네스를 바꾸면 검사가 스스로 실패해 변이를 "죽인" 것처럼 보인다
    if (Array.isArray(pkg?.product?.files) && !pkg.product.files.includes(fault?.file))
      issues.push(`package-fault-file: ${fault?.id}: ${fault?.file} is not one of product.files`)
    if (typeof fault?.find !== 'string' || fault.find === '' || typeof fault?.replace !== 'string' || fault.find === fault.replace)
      issues.push(`package-fault-edit: ${fault?.id}: find and replace are two different strings`)
  }
  return issues
}

function mutationThresholdIssues(pkg) {
  const value = pkg?.mutationThreshold
  return value !== undefined && !(typeof value === 'number' && value > 0 && value <= 1) ? ['package-mutation-threshold: mutationThreshold is a number in (0, 1]'] : []
}

function metamorphicIssues(pkg, ctx) {
  const metamorphic = pkg?.metamorphic
  if (typeof metamorphic === 'string') {
    const match = metamorphic.match(/^n\/a:\s*(S\d+)\s+\S/)
    return !match || !ctx.sourceText(match[1]) ? ['package-metamorphic: metamorphic is { source, relations } or "n/a: S<n> <reason>"'] : []
  }
  if (metamorphic === undefined) return []
  const issues = []
  if (!/\.bend$/.test(repoPathOf(ctx.sources.get(metamorphic?.source)?.location) ?? ''))
    issues.push('package-metamorphic: metamorphic.source must name a repo:<path>.bend package source')
  const seen = new Set()
  for (const relation of list(metamorphic?.relations)) {
    if (!/^MR\d+$/.test(relation?.id ?? '') || seen.has(relation.id)) issues.push(`package-metamorphic: "${relation?.id}" must be a unique MR* ID`)
    seen.add(relation?.id)
    for (const field of ['transform', 'relation'])
      if (!/^[A-Z]\w*\.\w+$/.test(relation?.[field] ?? '')) issues.push(`package-metamorphic: ${relation?.id}: ${field} must name a def as <Namespace>.<name>`)
    for (const id of list(relation?.requirements)) if (!ctx.requirements.has(id)) issues.push(`package-requirement-ref: metamorphic ${relation?.id}: ${id} is not a requirement`)
  }
  if (list(metamorphic?.relations).length === 0) issues.push('package-metamorphic: metamorphic.relations lists at least one relation')
  return issues
}

function productIssues(pkg) {
  const product = pkg?.product
  if (product === undefined) return []
  const issues = ['adapter', 'worldAdapter'].flatMap((field) => repoFileIssue(`product.${field}`, product?.[field]))
  if (!Array.isArray(product?.files) || product.files.length === 0) issues.push('package-product: product.files lists the product modules under test')
  for (const file of list(product?.files)) issues.push(...repoFileIssue('product.files', file))
  if (!Number.isInteger(product?.runs) || product.runs < 1) issues.push('package-product: product.runs is a positive fast-check run count')
  if (!Number.isInteger(product?.maxLength) || product.maxLength < 2) issues.push('package-product: product.maxLength is the longest sampled trace')
  return issues
}

function operatorIssues(pkg, ctx) {
  const issues = []
  for (const [id, disposition] of Object.entries(pkg?.operators ?? {})) {
    if (!OPERATOR_IDS.includes(id)) issues.push(`package-operator: ${id} is not a discovery operator`)
    const match = typeof disposition === 'string' ? disposition.match(DISPOSITION) : null
    if (!match) issues.push(`package-operator: ${id}: "n/a: S<n> <reason>" or "modeled: <axis id>"`)
    else if (match[1] && !ctx.sourceText(match[1])) issues.push(`package-operator: ${id}: ${match[1]} is not an authoritative source`)
    else if (match[2] && !DECLARED_OPERATORS.includes(id))
      issues.push(`package-operator: ${id} runs mechanically — only ${DECLARED_OPERATORS.join(', ')} are declared as modeled`)
  }
  return issues
}

function residueIssues(pkg, ctx) {
  return Object.entries(pkg?.residue ?? {})
    .filter(([, disposition]) => {
      const match = typeof disposition === 'string' ? disposition.match(DISPOSITION) : null
      return !match || (match[1] && !ctx.sourceText(match[1]))
    })
    .map(([field]) => `package-residue: ${field}: "modeled: <axis id>" or "n/a: S<n> <reason>"`)
}

function aiRunIssues(pkg) {
  return list(pkg?.aiRuns).flatMap((run) => [
    ...(AI_OPERATORS.includes(run?.operator) ? [] : [`package-ai-run: operator must be ${AI_OPERATORS.join(' | ')}`]),
    ...repoFileIssue('aiRuns.file', run?.file),
    ...(nonEmpty(run?.agent) ? [] : ['package-ai-run: name the agent that produced the run']),
    ...(/^[a-f0-9]{64}$/.test(run?.inputDigest ?? '')
      ? []
      : ['package-ai-run: inputDigest is the sha256 of the exact input the agent received (oracle-discovery.mjs ai-input)']),
    ...(/^[a-f0-9]{64}$/.test(run?.outputDigest ?? '')
      ? []
      : ['package-ai-run: outputDigest is the sha256 of the output file as recorded — an edited output is not the run']),
  ])
}

// hold — 답을 미룬 정책 질문. 질문이 막는 범위는 lock 밖에 남고, 나머지는 끝까지 간다. 열린 hold가 있으면 REVIEW_VERIFIED는 없다.
function holdIssues(pkg, ctx) {
  const issues = []
  const seen = new Set()
  for (const hold of list(pkg?.holds)) {
    const where = `hold ${hold?.id}`
    if (!/^H\d+$/.test(hold?.id ?? '') || seen.has(hold.id)) issues.push(`package-hold: "${hold?.id}" must be a unique H<n> ID`)
    seen.add(hold?.id)
    if (!nonEmpty(hold?.question)) issues.push(`package-hold: ${where}: question is required`)
    if (!Array.isArray(hold?.blocks) || hold.blocks.length === 0 || !hold.blocks.every(nonEmpty))
      issues.push(`package-hold: ${where}: blocks names what the question keeps out of the lock (rows, terms, goals or behaviours)`)
    if (!HOLD_STATUS.includes(hold?.status)) issues.push(`package-hold: ${where}: status must be ${HOLD_STATUS.join(' | ')}`)
    // 풀린 hold는 사용자의 답과 승인된 출처를 남긴다 — 답을 지어 닫을 수 없다
    if (hold?.status === 'resolved' && !(nonEmpty(hold?.answer) && ctx.sourceText(hold?.source)))
      issues.push(`package-hold: ${where}: a resolved hold records the answer and an approved authoritative S* source`)
  }
  return issues
}

function decisionIssues(pkg, ctx) {
  const issues = []
  const decided = new Set()
  for (const decision of list(pkg?.discoveryDecisions)) {
    const where = `decision ${decision?.candidate}`
    if (!/^C-[a-f0-9]{10}$/.test(decision?.candidate ?? '') || decided.has(decision.candidate))
      issues.push(`package-decision: ${where}: candidate must be a unique C-<10 hex> ID from a discovery run`)
    decided.add(decision?.candidate)
    if (!DECISIONS.includes(decision?.decision)) issues.push(`package-decision: ${where}: decision must be ${DECISIONS.join(' | ')}`)
    if (!nonEmpty(decision?.reason)) issues.push(`package-decision: ${where}: reason is required`)
    // 범위 밖·위험 수용·기각은 사람의 정책 결정이다 — 승인된 출처나 Open question이 있어야 한다.
    if (['out-of-scope', 'accepted-risk', 'promoted', 'rejected'].includes(decision?.decision)) {
      const source = decision?.source ?? ''
      if (!(ctx.sourceText(source) || ctx.questions.has(source)))
        issues.push(`package-decision: ${where}: ${decision?.decision} cites an authoritative S* or an Open question Q*`)
    }
    if (decision?.decision === 'held' && !ctx.holds.has(decision?.hold)) issues.push(`package-decision: ${where}: held names the hold (H<n>) that defers it`)
    if (decision?.decision === 'promoted' && !nonEmpty(decision?.axis))
      issues.push(`package-decision: ${where}: a promotion names the axis, goal, contract key or assumption it became`)
    // 이미 덮인 후보 — 어느 행(O*·계약 키)이 덮는지 적고, 그 행이 실제로 있어야 한다.
    if (decision?.decision === 'covered') {
      const rows = new Set(list(pkg?.contract).flatMap((entry) => [entry?.key, entry?.row].filter(Boolean)))
      if (!rows.has(decision?.by)) issues.push(`package-decision: ${where}: covered names the contract row (by: O* or key) that already rejects it`)
    }
  }
  return issues
}

// ---- leaf checks: one written value, before the package is judged as a whole (oracle-package.mjs set)

const enumIssue = (key, value, allowed) => (allowed.includes(value) ? null : `${key} must be ${allowed.join(' | ')}`)
const textIssue = (key, value) => (nonEmpty(value) ? null : `${key} is a non-empty line`)
const keysIssue = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const unknown = Object.keys(value).filter((key) => !keys.includes(key))
  return unknown.length > 0 ? `${unknown.join(', ')} ${unknown.length > 1 ? 'are not fields' : 'is not a field'} here (fields: ${keys.join(', ')})` : null
}

const SOURCE_KEYS = ['id', 'kind', 'jurisdiction', 'standard', 'location', 'approval', 'self']
const TERM_KEYS = ['id', 'context', 'name', 'role', 'field', 'def', 'path', 'definition', 'not', 'source', 'status', 'family', 'lifecycle']
const CONTRACT_KEYS = ['key', 'row', 'def', 'outside', 'policies', ...CONTRACT_TEXT, 'requirements', 'bva']
const BEHAVIOR_KEYS = ['model', 'laws', 'prefix', 'bound', 'observation', 'outOfScope', 'notFormalized', 'conformance', 'lawRows', 'requirements']

function sourceLeaf([index, key], value) {
  if (key === undefined) return index === undefined ? null : keysIssue(value, SOURCE_KEYS)
  if (key === 'kind') return enumIssue('kind', value, SOURCE_KINDS)
  if (['jurisdiction', 'standard', 'location', 'approval'].includes(key)) return textIssue(key, value)
  return null
}

// intent's fields are rows of their own: the value is the field itself
const riskLeaf = (rest, value) => (rest.length === 0 ? enumIssue('intent.risk', value, RISKS) : null)
const intentTextLeaf = (rest, value) => (rest.length === 0 ? textIssue('the intent field', value) : null)

function familyLeaf([family], value, ctx) {
  if (family === undefined) return null
  if (!FAMILIES.includes(family)) return `${family} is not one of ${FAMILIES.join(', ')}`
  return familyValueIssue(family, value, ctx)
}

function worldLeaf([key], value) {
  if (key === undefined) return keysIssue(value, ['source', 'prefix'])
  return key === 'prefix' ? prefixIssue('world.prefix', value, 'record') : null
}

function termLeaf([index, key], value) {
  if (index === undefined) return null
  if (key === undefined) return keysIssue(value, TERM_KEYS)
  if (key === 'role') return enumIssue('role', value, WORLD_ROLES)
  if (key === 'status') return enumIssue('status', value, ['confirmed', 'open'])
  if (key === 'family') return enumIssue('family', value, FAMILIES)
  if (key === 'field' && nonEmpty(value)) return bendNameIssue(value, 'field') ? `field ${bendNameIssue(value, 'field')} — rename the world field` : null
  return null
}

function assumptionLeaf([, key], value) {
  if (key === 'testability') return enumIssue('testability', value, TESTABILITY)
  if (key === 'status') return enumIssue('status', value, ASSUMPTION_STATUS)
  return null
}

function goalLeaf([, key], value) {
  if (key === 'kind') return enumIssue('kind', value, ['safety', 'witness'])
  if (key === 'author') return enumIssue('author', value, GOAL_AUTHORS)
  return null
}

function hazardLeaf([id], value, ctx) {
  if (id === undefined) return null
  if (!HAZARD_IDS.includes(id)) return `${id} is not one of ${HAZARD_IDS.join(', ')}`
  return hazardValueIssue(id, value, ctx)
}

function asyncLeaf([, key, cell], value, ctx) {
  if (key !== 'cells' || cell === undefined) return null
  if (!ASYNC_CELLS.includes(cell)) return `${cell} is not one of ${ASYNC_CELLS.join(', ')}`
  return cellIssue(cell, value, ctx)
}

function contractLeaf([index, key], value, ctx) {
  if (index === undefined) return null
  if (key === undefined) return keysIssue(value, CONTRACT_KEYS)
  if ([...CONTRACT_TEXT, 'bva', 'outside'].includes(key) && typeof value === 'string') {
    const issue = vagueTextIssue(key, value, ctx.termNames)
    if (issue) return `${key} ${issue}`
    return CONTRACT_TEXT.includes(key) ? textIssue(key, value) : null
  }
  return null
}

/** A world record or model namespace name: UpperCamel, and a name Bend accepts. */
function prefixIssue(where, value, what) {
  if (!/^[A-Z]\w*$/.test(value ?? '')) return `${where} is an UpperCamel ${what} name`
  const reserved = bendNameIssue(value, 'type')
  return reserved ? `${where} ${reserved} — pick another ${what} name` : null
}

function behaviorLeaf(tokens, value) {
  const [key, index, field] = tokens
  if (key === undefined) return keysIssue(value, BEHAVIOR_KEYS)
  if (key === 'prefix') return prefixIssue('behavior.prefix', value, 'namespace')
  if (key === 'bound') return Number.isSafeInteger(value) && value >= 1 ? null : 'behavior.bound is a positive integer'
  if (key === 'lawRows' && field === 'kind') return enumIssue('kind', value, LAW_KINDS)
  if (key === 'lawRows' && field === 'name') return /^[a-z_][\w.]*$/.test(value ?? '') ? null : `${value} is not a Bend law name`
  return index === undefined || key !== 'lawRows' || field !== undefined ? null : keysIssue(value, ['name', 'kind', 'cites'])
}

function productLeaf([key], value) {
  if (key === 'runs') return Number.isInteger(value) && value >= 1 ? null : 'product.runs is a positive integer'
  if (key === 'maxLength') return Number.isInteger(value) && value >= 2 ? null : 'product.maxLength is an integer of at least 2'
  return key === undefined ? keysIssue(value, ['adapter', 'worldAdapter', 'files', 'runs', 'maxLength']) : null
}

// ---- the rule table

const FAMILY_ONE_OF = ['modeled: behavior', 'excluded: <reason citing an approved S*>']
const HAZARD_ONE_OF = ['modeled: <terms[].field ...>', 'n/a: S<n> <reason>', 'question: Q<n>']
/**
 * node: the graph node that waits for the field's todo (package, model, card; closure waits for no authoring node).
 * stage: when packageIssues judges the row (model: the package node and every later check; project: the card projection
 * and closure). after: decided before this field — `set` refuses the write while one still holds a todo. reads: the row
 * is not judged while one of these holds a todo. complete: issues that say something is still missing (not that a
 * written value is wrong) — `set` refuses them only when the write covered the whole field they name.
 */
export const RULES = Object.freeze(
  [
    { id: 'text', path: '', stage: 'model', codes: ['package-text-unsafe'], judge: textIssues, fix: 'write every value on one line, without <!-- or -->' },
    { id: 'packageVersion', path: '/packageVersion', stage: 'model', node: 'package', required: true, type: 'integer', oneOf: PACKAGE_VERSIONS, value: PACKAGE_VERSION, codes: ['package-version'], judge: versionIssues, fix: 'packageVersion is 2' },
    { id: 'id', path: '/id', stage: 'model', node: 'package', required: true, type: 'string', pattern: '^[a-z][\\w-]*$', codes: ['package-id'], judge: idIssues, fix: 'id is the lowercase oracle folder name' },
    {
      id: 'sources', path: '/sources', stage: 'model', node: 'package', required: true, type: 'list', leaf: sourceLeaf,
      codes: ['package-source-id', 'package-source-kind', 'package-source-field', 'package-bend-name', 'package-sources'],
      judge: sourceIssues, complete: [/^package-sources:/],
      todo: 'every source text the request rests on, the Space discovery record and this package (self: true), each {id S<n>, kind, jurisdiction, standard, location repo:<path>[#anchor], approval}',
      fix: 'each source is {id: unique S<n>, kind, jurisdiction, standard, location: repo:<path>, approval}; a .bend path uses plain names',
    },
    {
      id: 'requirements', path: '/requirements', stage: 'model', node: 'package', required: true, type: 'list', after: ['/sources'], reads: ['/sources'],
      codes: ['package-requirement-id', 'package-requirement-quote', 'package-requirement-source', 'package-requirements'], judge: requirementIssues, complete: [/^package-requirements:/],
      todo: 'one {id R<n>, source S<n>, quote} per source sentence, the whole sentence verbatim with its full stop',
      fix: 'a requirement quotes one whole sentence of an approved source text (never a model or this package)',
    },
    { id: 'intent.risk', path: '/intent/risk', stage: 'model', node: 'package', required: true, type: 'enum', oneOf: RISKS, leaf: riskLeaf, codes: ['package-intent-risk'], judge: riskIssues, todo: 'the risk the user accepted', fix: `intent.risk is ${RISKS.join(' | ')}` },
    ...INTENT_TEXT.map((field) => ({
      id: `intent.${field}`, path: `/intent/${field}`, stage: 'model', node: 'package', required: true, type: 'text', leaf: intentTextLeaf,
      codes: ['package-intent-field'], judge: field === INTENT_TEXT[0] ? intentTextIssues : null, complete: [/^package-intent-field:/],
      // the one judge reads every intent line, so it waits while any of them is still a todo
      reads: field === INTENT_TEXT[0] ? INTENT_TEXT.slice(1).map((other) => `/intent/${other}`) : undefined,
      todo: { actor: 'who acts and in what situation', observableSuccess: 'what the user sees when it works', nonGoals: 'what this change leaves out', worstRegression: 'the worst thing a regression does', reversibility: 'how the change is undone' }[field],
      fix: `intent.${field} is one non-empty line`,
    })),
    {
      id: 'intent.openQuestions', path: '/intent/openQuestions', stage: 'model', node: 'package', type: 'list', value: [], reads: ['/sources'],
      codes: ['package-question-id', 'package-question-text', 'package-cite', 'package-cite-unknown'], judge: questionIssues,
      fix: 'a question is {id: unique Q<n>, text, sources: [S<n>]}',
    },
    {
      id: 'spaceDiscovery', path: '/spaceDiscovery', stage: 'model', node: 'package', required: true, type: 'source-id', after: ['/sources'], reads: ['/sources'],
      codes: ['package-space-discovery'], judge: spaceDiscoveryIssues,
      todo: 'the approved S* that registers sources/space-discovery.md once the user confirmed its Case space',
      fix: 'spaceDiscovery names the approved S* of the Space discovery record — not this package, a model file or an implementation reference',
    },
    {
      id: 'families', path: '/families', stage: 'model', node: 'package', required: true, type: 'map', keys: FAMILIES, oneOf: FAMILY_ONE_OF, leaf: familyLeaf, after: ['/sources'], reads: ['/sources', '/terms'],
      codes: ['package-family', 'package-family-observation-only'], judge: familyIssues, complete: [/^package-family: \w+: map it/],
      // a family a controllable term maps is decided by that term
      open: (pointer, pkg) => !list(pkg?.terms).some((term) => term?.role === 'controllable' && `/families/${term?.family}` === pointer),
      todo: 'the S4 Case space row for this family: modeled by the behavior model, excluded with the S* that allows it, or remove it (set <path> null) when a controllable term maps it (terms[].family)',
      fix: `a family is "modeled: behavior", "excluded: <reason citing an approved S*>" or mapped by a controllable term's family`,
    },
    {
      id: 'world', path: '/world', stage: 'model', node: 'package', required: true, type: 'object', keys: ['source', 'prefix'], leaf: worldLeaf, after: ['/sources'], reads: ['/sources'],
      codes: ['package-world', 'package-bend-reserved'], judge: worldIssues, bendName: 'type',
      todo: { source: "the S* of the analyst's World.bend", prefix: 'the world record type (UpperCamel; not Kind, Type, Data or a name Base declares)' },
      fix: 'world is {source: the S* of a repo:<path>.bend, prefix: an UpperCamel record name Bend accepts}',
    },
    {
      id: 'terms', path: '/terms', stage: 'model', node: 'package', required: true, type: 'list', leaf: termLeaf, after: ['/sources'], reads: ['/sources'], bendName: 'field',
      codes: [...new Set([...Object.values(PACKAGE_TERM_TEXT).map((text) => text({}).split(':')[0]), 'package-term-conflated'])], judge: termIssues,
      todo: 'one term per World.bend field (and the concepts and derived values the rows use), each {id T<n>, context, name, role, field, path, definition, not, source, status}',
      fix: 'a term is {id: unique T<n>, context, name, role, field (none for concept/derived), def (derived only), path (controllable/observable only), definition, not, source, status}',
    },
    {
      id: 'assumptions', path: '/assumptions', stage: 'model', node: 'package', required: true, type: 'list', leaf: assumptionLeaf, after: ['/sources'], reads: ['/sources', '/requirements'],
      codes: ['package-assumption-id', 'package-cite-unknown', 'package-assumption-falsifier', 'package-assumption-owner', 'package-assumption-registry', 'package-requirement-ref'], judge: assumptionIssues,
      todo: 'the world assumptions ([] when none), each {id A<n> (a World.bend def), source, falsifier, owner, evidence, riskIfFalse, testability, status}',
      fix: 'an assumption is {id: unique A<n>, source, falsifier, owner (not the product), evidence, riskIfFalse, testability, status}',
    },
    {
      id: 'goals', path: '/goals', stage: 'model', node: 'package', required: true, type: 'list', leaf: goalLeaf, after: ['/sources'], reads: ['/sources', '/requirements'],
      codes: ['package-goal-id', 'package-goal-kind', 'package-cite', 'package-cite-unknown', 'package-cite-authority', 'package-goal-source', 'package-goal-author', 'package-goal-missing', 'package-requirement-ref'],
      judge: goalIssues, complete: [/^package-goal-missing:/],
      todo: 'the goals read from the source text (one safety goal at least), each {id G<n> (a World.bend def), kind, cites [S*], author}',
      fix: 'a goal is {id: unique G<n>, kind: safety | witness, cites: [approved source S*, never a model], author: analyst | controller}',
    },
    {
      id: 'examples', path: '/examples', stage: 'model', node: 'package', type: 'list', value: [], reads: ['/goals'],
      codes: ['package-example'], judge: exampleIssues, fix: 'an example is {id: E<n>, goal: a G*, verdict: holds | violates}',
    },
    {
      id: 'hazards', path: '/hazards', stage: 'model', node: 'package', required: true, type: 'map', keys: HAZARD_IDS, oneOf: HAZARD_ONE_OF, leaf: hazardLeaf,
      after: ['/sources', '/terms'], reads: ['/sources', '/terms', '/intent/openQuestions'], codes: ['package-hazard'], judge: hazardIssues, complete: [/^package-hazard: [\w-]+: modeled: <fields>/],
      todo: 'decide this hazard: the world fields that model it, n/a with the S* that rules it out, or the Open question that asks it',
      fix: `a hazard is "modeled: <terms[].field ...>" (or behavior when the request has one), "n/a: S<n> <reason>" or "question: Q<n>"`,
    },
    {
      id: 'asyncCells', path: '/asyncCells', stage: 'model', node: 'package', required: 'when Async is in the space', type: 'list', leaf: asyncLeaf, after: ['/sources', '/families'], reads: ['/sources', '/families', '/intent/openQuestions', '/holds'],
      codes: ['package-async-cells'], judge: asyncCellsIssues, complete: [/^package-async-cells: Async is in the space/],
      applies: (pkg) => pkg?.packageVersion >= 2 && familyDisposition(pkg?.families?.Async)?.kind !== 'excluded',
      todo: 'per async operation, all seven cells decided before the model is written: {operation, cells: {<cell>: {decision: source | default | n/a, ref: S*} or {decision: question, ref: Q* | H*}}}',
      fix: `each async operation decides ${ASYNC_CELLS.join(', ')}: source, default or n/a with an approved S*, or question with a Q*/H*`,
    },
    {
      id: 'crossCheck', path: '/crossCheck', stage: 'model', node: 'model', required: 'version 2', type: 'object', after: ['/spaceDiscovery', '/world'], reads: ['/sources', '/spaceDiscovery'],
      codes: ['package-cross-check'], judge: crossCheckIssues, applies: (pkg) => pkg?.packageVersion >= 2,
      todo: 'the translation table: per S4 dimension {world: <field>} or {classify: <behavior model def>} with values {<declared value>: <world value or constructor>}; declared defaults to spaceDiscovery',
      fix: 'crossCheck.dimensions.<S4 dimension> names exactly one of world or classify and maps every declared value',
    },
    { id: 'contract.row', path: '/contract', stage: 'model', codes: ['package-contract-row', 'package-contract-def-duplicate'], judge: contractPinIssues, fix: 'a pinned row is a unique O<n>, and one def is one contract entry' },
    { id: 'spaceVersion', path: '/spaceVersion', stage: 'model', type: 'integer', codes: ['package-space-version'], judge: spaceVersionIssues, fix: 'spaceVersion is a positive integer' },
    { id: 'axisOrigins', path: '/axisOrigins', stage: 'model', type: 'map', codes: ['package-axis-origin'], judge: axisOriginIssues, fix: `an axis origin is {origin: ${AXIS_ORIGINS.join(' | ')}, ref, reason}` },
    {
      id: 'product', path: '/product', stage: 'model', node: 'closure', required: 'Delivery closure', type: 'object', leaf: productLeaf, codes: ['package-discovery-path', 'package-product'], judge: productIssues,
      todo: 'Delivery closure reads it after GREEN and a locked package never changes: {adapter, worldAdapter, files, runs, maxLength} (planned repo paths), or remove it (set <path> null) for a design-only run',
      fix: 'product is {adapter, worldAdapter, files: [repo paths], runs ≥ 1, maxLength ≥ 2}',
    },
    {
      id: 'faultModel', path: '/faultModel', stage: 'model', node: 'closure', type: 'list', reads: ['/product'],
      codes: ['package-fault-id', 'package-fault-class', 'package-discovery-path', 'package-fault-file', 'package-fault-edit'], judge: faultModelIssues,
      todo: 'the faults closure plants in product.files ([] when none): {id F<n>, class, file, find, replace, note}',
      fix: `a fault is {id: unique F<n>, class: ${FAULT_CLASSES.join(' | ')}, file: one of product.files, find, replace (another string), note}`,
    },
    { id: 'mutationThreshold', path: '/mutationThreshold', stage: 'model', type: 'number', codes: ['package-mutation-threshold'], judge: mutationThresholdIssues, fix: 'mutationThreshold is a number in (0, 1]' },
    { id: 'metamorphic', path: '/metamorphic', stage: 'model', type: 'object', reads: ['/sources', '/requirements'], codes: ['package-metamorphic', 'package-requirement-ref'], judge: metamorphicIssues, fix: 'metamorphic is {source: a .bend S*, relations: [{id MR<n>, transform, relation}]} or "n/a: S<n> <reason>"' },
    { id: 'operators', path: '/operators', stage: 'model', type: 'map', reads: ['/sources'], codes: ['package-operator'], judge: operatorIssues, fix: 'an operator is "n/a: S<n> <reason>", or "modeled: <axis id>" for a declared one' },
    { id: 'residue', path: '/residue', stage: 'model', type: 'map', reads: ['/sources'], codes: ['package-residue'], judge: residueIssues, fix: 'a residue field is "modeled: <axis id>" or "n/a: S<n> <reason>"' },
    { id: 'aiRuns', path: '/aiRuns', stage: 'model', type: 'list', codes: ['package-ai-run', 'package-discovery-path'], judge: aiRunIssues, fix: `an AI run is {operator: ${AI_OPERATORS.join(' | ')}, file, agent, inputDigest, outputDigest}` },
    { id: 'holds', path: '/holds', stage: 'model', type: 'list', reads: ['/sources'], codes: ['package-hold'], judge: holdIssues, fix: 'a hold is {id: unique H<n>, question, blocks, status: open | resolved (with answer and an approved S*)}' },
    { id: 'discoveryDecisions', path: '/discoveryDecisions', stage: 'model', type: 'list', reads: ['/sources', '/contract'], codes: ['package-decision'], judge: decisionIssues, fix: `a decision is {candidate: C-<10 hex>, decision: ${DECISIONS.join(' | ')}, reason, source}` },
    {
      id: 'policies', path: '/policies', stage: 'project', node: 'card', required: true, type: 'list', after: ['/sources'], reads: ['/sources', '/requirements'],
      codes: ['package-policy-id', 'package-policy-text', 'package-cite', 'package-cite-unknown', 'package-cite-authority', 'package-requirement-ref', 'package-policies'], judge: policyIssues, complete: [/^package-policies:/],
      todo: 'the decided policies, each {id P<n>, text, sources [approved S*]}',
      fix: 'a policy is {id: unique P<n>, text, sources: [S* that are not implementation references]}',
    },
    {
      id: 'contract', path: '/contract', stage: 'project', node: 'card', required: true, type: 'list', leaf: contractLeaf, after: ['/policies', '/terms'], reads: ['/policies', '/terms', '/requirements'],
      codes: ['package-contract-key', 'package-contract-def', 'package-contract-policy', 'package-contract-text', 'package-requirement-ref', 'package-contract', 'package-policy-unlinked', 'package-contract-vague'],
      judge: (pkg, ctx) => [...contractIssues(pkg, ctx), ...contractTextIssues(pkg, ctx)], complete: [/^package-contract: list/, /^package-policy-unlinked:/],
      banned: VAGUE_WORDS,
      todo: 'the contract predicates, each {key, def (a World.bend def) or outside, policies [P*], given, when, then, never, sideEffects}; then/never name what a test checks, and a verdict word (success, same, change …) needs a term whose name holds it',
      fix: 'a contract entry names its def or why it is outside the world, cites a P*, fills given/when/then/never/sideEffects without vague words',
    },
    {
      id: 'behavior', path: '/behavior', stage: 'project', node: 'model', required: 'when Order or Async is in the space', type: 'object', leaf: behaviorLeaf, bendName: 'type',
      after: ['/asyncCells', '/policies', '/contract'], reads: ['/sources', '/policies', '/contract', '/requirements', '/families'],
      codes: ['package-behavior-missing', 'package-behavior', 'package-bend-reserved', 'package-law', 'package-requirement-ref'], judge: behaviorIssues,
      complete: [/^package-behavior-missing:/, /^package-law: (behavior\.lawRows lists every law|only safety laws|P\d+ has effect laws|P\d+ is cited by no law)/],
      applies: temporalOf,
      todo: 'the behavior model, after asyncCells: {model: S* of MODEL.bend, laws: S* of LAWS.bend, prefix, bound, observation, outOfScope, notFormalized, conformance: a contract key, lawRows: [{name, kind, cites [P*]}]}; an effect law needs a witness law for its policy',
      fix: 'behavior names its .bend model and laws, an UpperCamel prefix Bend accepts, bound ≥ 1, a contract key, and lawRows with an effect law, a witness per effect policy and every policy cited or not formalized',
    },
    {
      id: 'notApplicable', path: '/notApplicable', stage: 'project', node: 'card', type: 'list', reads: ['/sources', '/requirements'], codes: ['package-na', 'package-cite', 'package-cite-unknown', 'package-cite-authority', 'package-requirement-ref'], judge: notApplicableIssues,
      advice: uncoveredAutoCases,
      todo: `a sourced N/A for each auto test case no contract row covers (${AUTO_TEST_CASES.map(({ kind }) => kind).join(', ')}): {text naming it, sources [approved S*]}; [] when the rows cover all seven`,
      fix: 'an N/A entry is {text, sources: [approved S*]}',
    },
    {
      id: 'typeContract', path: '/typeContract', stage: 'project', node: 'card', type: 'object', label: 'type-contract:reported', codes: ['package-type-contract'], judge: typeContractIssues,
      todo: 'no exported Props, shared API, state union or trust-boundary type: {notApplicable: <why>, paths: [repo:<investigated file>]}; otherwise remove it (set <path> null) and run the type-contract:reported label',
      fix: 'typeContract is {notApplicable: the reason, paths: [the investigated repo:<path> files]}',
    },
    { id: 'families.v1', path: '/families', stage: 'project', codes: ['package-family'], judge: v1FamilyIssues, fix: 'a version 1 family is "excluded: <reason with S*>" or "modeled: behavior"' },
    { id: 'self', path: '/sources', stage: 'project', codes: ['package-self'], judge: selfSourceIssues, complete: [/^package-self:/], fix: 'register this package file as a source with "self": true' },
  ].map((row) => Object.freeze({ tokens: tokensOf(row.path), ...row })),
)

/**
 * The order judges report in — the order the checks ran before the table, so a package's issue list reads as it did. The
 * table itself stays in decision order (the skeleton and the todos).
 */
export const REPORT_ORDER = [
  'text',
  'packageVersion',
  'id',
  'sources',
  'spaceDiscovery',
  'intent.risk',
  // intent.actor judges every intent line; the other line rows check only the value written
  'intent.actor',
  'intent.openQuestions',
  'world',
  'terms',
  'assumptions',
  'requirements',
  'goals',
  'hazards',
  'examples',
  'families',
  'crossCheck',
  'contract.row',
  'spaceVersion',
  'axisOrigins',
  'faultModel',
  'mutationThreshold',
  'metamorphic',
  'product',
  'operators',
  'residue',
  'aiRuns',
  'holds',
  'discoveryDecisions',
  'asyncCells',
  'policies',
  'contract',
  'typeContract',
  'notApplicable',
  'families.v1',
  'self',
  'behavior',
]

function tokensOf(path) {
  return path === '' ? [] : path.slice(1).split('/')
}

/** Every top-level package key the table knows. */
export const PACKAGE_KEYS = [...new Set(RULES.map((row) => row.tokens[0]).filter(Boolean))]

// ---- todos

export const isTodo = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && typeof value.todo === 'string'

/** Every todo in the package with its JSON pointer, in file order. */
export function todoEntries(pkg, tokens = []) {
  if (isTodo(pkg)) return [{ tokens, pointer: `/${tokens.join('/')}`, todo: pkg.todo, oneOf: pkg.oneOf }]
  if (Array.isArray(pkg)) return pkg.flatMap((value, index) => todoEntries(value, [...tokens, String(index)]))
  if (pkg && typeof pkg === 'object') return Object.entries(pkg).flatMap(([key, value]) => todoEntries(value, [...tokens, key]))
  return []
}

/** The package without its todos — what every judge, derive and the projection read. */
export function decidedView(pkg) {
  if (Array.isArray(pkg)) return pkg.filter((value) => !isTodo(value)).map(decidedView)
  if (pkg && typeof pkg === 'object' && !isTodo(pkg))
    return Object.fromEntries(Object.entries(pkg).filter(([, value]) => !isTodo(value)).map(([key, value]) => [key, decidedView(value)]))
  return pkg
}

const startsWith = (tokens, prefix) => prefix.every((token, index) => tokens[index] === token)
const related = (a, b) => startsWith(a, b) || startsWith(b, a)

/** The row a field belongs to: the longest row path that starts the pointer. */
export function rowOf(tokens) {
  let best = null
  for (const row of RULES) {
    if (row.tokens.length === 0 || !startsWith(tokens, row.tokens)) continue
    // the field's own row (the one a graph node waits for) before a rule that only reads the same field
    const longer = !best || row.tokens.length > best.tokens.length
    if (longer || (row.tokens.length === best.tokens.length && row.node && !best.node)) best = row
  }
  return best
}

/** The todos still to decide: those of a row that applies, and only the fields it still waits for. */
export function openTodos(pkg) {
  const decided = decidedView(pkg)
  return todoEntries(pkg)
    .map((entry) => ({ ...entry, row: rowOf(entry.tokens) }))
    .filter(({ row, pointer }) => (row?.applies?.(decided) ?? true) && (row?.open?.(pointer, decided) ?? true))
    .sort((a, b) => RULES.indexOf(a.row) - RULES.indexOf(b.row))
}

const NODE_STAGES = { package: ['model', 'project'], model: ['project'], card: ['project'] }

/** `package-todo` issues — the set command, its path and, when it has them, the allowed values. */
const allowedOf = (oneOf) => (Array.isArray(oneOf) ? `; one of: ${oneOf.join(' | ')}` : '')

export function todoIssue({ pointer, todo, oneOf }) {
  return `package-todo: set ${pointer} <value> — ${todo}${allowedOf(oneOf)}`
}

/** The todos a graph node waits for (package, model or card). */
export function nodeTodos(pkg, node) {
  return openTodos(pkg).filter(({ row }) => (row?.node ?? 'package') === node)
}

/**
 * 구조 검사 — 연결·범주·출처만 본다. 모델 작성 단계에 필요한 것(출처·목표·세계·용어)은 카드 없이 검사되고, 카드 행 ID는
 * 요구하지 않는다: 계약 술어는 모델 심볼(def 이름)로 불리고 O* ID는 투영이 붙인다(`row`로 고정할 수 있다).
 * stage: 'model'(분석·모델 작성 — 계약·투영 필드는 선택) | 'project'(카드 투영 — 전부 필요). gate: 작성 그래프의 패키지
 * 노드 — 비동기 칸이 비면 거절한다. todo는 그 노드가 기다리는 것만 문제가 되고, todo가 남은 행은 판정하지 않는다.
 */
export function judgePackage(pkg, { stage = 'project', gate = false } = {}) {
  const todos = openTodos(pkg)
  const pending = todoEntries(pkg)
  const decided = decidedView(pkg)
  const ctx = ruleContext(decided, { gate })
  const issues = todos.filter(({ row }) => NODE_STAGES[row?.node ?? 'package']?.includes(stage)).map(todoIssue)
  for (const row of REPORT_ORDER.map((id) => RULES.find((candidate) => candidate.id === id))) {
    if (!row.judge || (row.stage === 'project' && stage !== 'project')) continue
    if (row.tokens.length > 0 && [row.tokens, ...(row.reads ?? []).map(tokensOf)].some((tokens) => pending.some((todo) => startsWith(todo.tokens, tokens)))) continue
    issues.push(...row.judge(decided, ctx))
  }
  return issues
}

// ---- set: one write judged before it lands

function leavesOf(tokens, value) {
  const here = [[tokens, value]]
  if (Array.isArray(value)) return [...here, ...value.flatMap((entry, index) => leavesOf([...tokens, String(index)], entry))]
  if (value && typeof value === 'object') return [...here, ...Object.entries(value).flatMap(([key, entry]) => leavesOf([...tokens, key], entry))]
  return here
}

const containsTodo = (value) => todoEntries(value).length > 0

/** The row issues of a package, when the row is judged at all (no todo in its fields or the ones it reads). */
function rowIssues(row, pkg) {
  const pending = todoEntries(pkg)
  if ([row.tokens, ...(row.reads ?? []).map(tokensOf)].some((tokens) => pending.some((todo) => startsWith(todo.tokens, tokens)))) return []
  const decided = decidedView(pkg)
  return row.judge(decided, ruleContext(decided))
}

/**
 * Judge writes before they land. writes: [{tokens (resolved), value, remove}]; before/after: the package as it is and
 * as the writes leave it. Refused: a todo written back, a field written before what it is decided after, a value its
 * row refuses, and an issue the writes add to a row they touch — except that something is still missing elsewhere.
 * Remaining: the todos left in decision order, the missing pieces the writes did not cover and the auto test cases no
 * contract text or N/A names yet.
 */
export function writeIssues(before, after, writes) {
  const refused = []
  const open = openTodos(before)
  for (const write of writes) {
    const pointer = `/${write.tokens.join('/')}`
    // the rows the write lands in: the field's own, or those under a container written whole (`/intent`)
    const rows = RULES.filter((row) => row.tokens.length > 0 && related(write.tokens, row.tokens))
    if (rows.length === 0) {
      refused.push(`${pointer}: not a package field (${PACKAGE_KEYS.join(', ')})`)
      continue
    }
    if (!write.remove && containsTodo(write.value)) refused.push(`${pointer}: set writes a decided value — a todo is the skeleton's`)
    const waiting = [...new Set(rows.flatMap((row) => row.after ?? []))].filter(
      (dep) => open.some((todo) => startsWith(todo.tokens, tokensOf(dep))) && !writes.some((other) => related(other.tokens, tokensOf(dep))),
    )
    if (waiting.length > 0) refused.push(`${pointer}: decide ${waiting.join(', ')} first — ${pointer} is decided after ${waiting.length > 1 ? 'them' : 'it'}`)
  }
  if (refused.length > 0) return { refused, remaining: [] }
  const ctx = ruleContext(decidedView(after))
  for (const write of writes.filter((entry) => !entry.remove)) {
    for (const [tokens, value] of leavesOf(write.tokens, write.value)) {
      const row = rowOf(tokens)
      const issue = row?.leaf?.(tokens.slice(row.tokens.length), value, ctx)
      if (issue) refused.push(`/${tokens.join('/')}: ${issue}`)
    }
  }
  if (refused.length > 0) return { refused: [...new Set(refused)], remaining: [] }
  const touched = RULES.filter(
    (row) => row.judge && writes.some((write) => related(write.tokens, row.tokens) || (row.reads ?? []).some((path) => related(write.tokens, tokensOf(path)))),
  )
  const remaining = []
  for (const row of touched) {
    const was = new Set(rowIssues(row, before))
    for (const issue of rowIssues(row, after).filter((text) => !was.has(text))) {
      const missing = (row.complete ?? []).some((pattern) => pattern.test(issue))
      const whole = writes.some((write) => startsWith(row.tokens, write.tokens) && write.tokens.length <= row.tokens.length)
      if (missing && !whole) remaining.push(issue)
      else refused.push(issue)
    }
  }
  const advice = writes.some((write) => ['contract', 'notApplicable'].includes(write.tokens[0])) ? uncoveredAutoCases(decidedView(after)) : []
  return { refused: [...new Set(refused)], remaining: [...new Set(remaining)], advice }
}

// ---- the skeleton oracle-step.mjs writes when the oracle folder has no package

const todoOf = (todo, oneOf) => ({ todo, ...(oneOf ? { oneOf } : {}) })

/** The package skeleton: every key the lock path needs, in decision order, each undecided value a todo. */
export function packageSkeleton({ id }) {
  const skeleton = {}
  for (const row of RULES) {
    const [key, sub] = row.tokens
    if (row.id === 'id') skeleton.id = id
    // a row with neither a todo nor a fixed value is optional and stays out (the self row only judges sources)
    if (!key || row.id === 'self' || (!row.todo && row.value === undefined)) continue
    if (sub) {
      skeleton[key] ??= {}
      skeleton[key][sub] = row.value !== undefined ? row.value : todoOf(row.todo, row.oneOf)
      continue
    }
    if (row.value !== undefined) skeleton[key] = row.value
    else if (row.keys && row.type === 'map') skeleton[key] = Object.fromEntries(row.keys.map((name) => [name, todoOf(row.todo, row.oneOf)]))
    else if (row.keys && typeof row.todo === 'object') skeleton[key] = Object.fromEntries(row.keys.map((name) => [name, todoOf(row.todo[name])]))
    else skeleton[key] = todoOf(row.todo, row.oneOf)
  }
  return skeleton
}

// ---- the Space discovery record (S4): the user's confirmed declaration, values flow from it into the package

export const SPACE_DISCOVERY_FILE = 'sources/space-discovery.md'
export const CASE_SPACE_HEADER = ['Family', 'Dimension', 'Choices']

/** The record's skeleton: its Case space grammar fixed (the header and the eight family rows), no State Model. */
export function spaceDiscoverySkeleton() {
  return [
    '# Space discovery',
    '',
    "Each question to the user and their answer, verbatim. The model analyst writes the flow's State Model as its own",
    'source; this record has none.',
    '',
    '## Questions and answers',
    '',
    '## Case space',
    '',
    '- Strength: 2',
    '',
    `| ${CASE_SPACE_HEADER.join(' | ')} |`,
    '| --- | --- | --- |',
    ...FAMILIES.map((family) => `| ${family} | todo | todo |`),
    '',
  ].join('\n')
}

/** A Case space row: a dimension with its choices, or `—` with `excluded: <reason>`. */
function caseRowHolds(dimension, choices) {
  if (choices.startsWith('excluded:')) return /^[—-]$/.test(dimension) && /^excluded:\s*\S/.test(choices)
  return !/^[—-]?$/.test(dimension) && choices !== ''
}

/**
 * S4 rules — the Case space table the cross-check reads: the header `Family | Dimension | Choices` (a `Touches` column
 * may follow), every family on at least one row and no other, an excluded family as `—` and `excluded: <reason>`, no cell
 * left `todo`. A record without a Case space has nothing to check here (the cross-check reports it).
 */
export function spaceRecordIssues(text) {
  const lines = String(text ?? '').split('\n')
  const start = lines.findIndex((line) => line.trim() === '## Case space')
  if (start === -1) return []
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  const rows = lines
    .slice(start + 1, end === -1 ? lines.length : end)
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()))
    .filter((cells) => !cells.every((cell) => /^:?-+:?$/.test(cell)))
  if (rows.length === 0) return []
  const issues = []
  const [header, ...body] = rows
  const touches = header.length === 4 && header[3] === 'Touches'
  if (!CASE_SPACE_HEADER.every((name, index) => header[index] === name) || !(header.length === 3 || touches))
    issues.push(`s4-case-space-header: the Case space header is | ${CASE_SPACE_HEADER.join(' | ')} | (then | Touches |), not | ${header.join(' | ')} |`)
  for (const cells of body) {
    const [family, dimension = '', choices = ''] = cells
    if (!FAMILIES.includes(family)) issues.push(`s4-case-space-family: ${family} is not one of ${FAMILIES.join(', ')}`)
    const open = cells.some((cell) => /^todo$/i.test(cell))
    if (open) issues.push(`s4-case-space-todo: ${family}: write the confirmed dimension and choices, or — and excluded: <reason>`)
    if (!open && !caseRowHolds(dimension, choices)) issues.push(`s4-case-space-row: ${family}: a row is <dimension> | <choices>, or — | excluded: <reason>`)
  }
  for (const family of FAMILIES)
    if (!body.some(([name]) => name === family)) issues.push(`s4-case-space-family: ${family} has no row — every family is decided, an excluded one with its reason`)
  return issues
}

export const SPACE_RULES = Object.freeze([
  { id: 's4.header', path: 'S4 ## Case space', codes: ['s4-case-space-header'], fix: `the header is | ${CASE_SPACE_HEADER.join(' | ')} |` },
  { id: 's4.families', path: 'S4 ## Case space', codes: ['s4-case-space-family'], fix: 'one row or more per family, no other family' },
  { id: 's4.rows', path: 'S4 ## Case space', codes: ['s4-case-space-todo', 's4-case-space-row'], fix: 'each row is <dimension> | <choices>, or — | excluded: <reason>' },
])
