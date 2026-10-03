// Closed data language for ledger edges, input obligations and reference roots. Evidence
// authenticity remains the runner's job; predicates cannot execute code or inspect paths.
const STATES = [
  'ORACLE_READY',
  'VALID_RED',
  'IMPLEMENTED_GREEN',
  'REVIEW_VERIFIED',
  'PARTIAL_VERIFIED',
  'NEEDS_DECISION',
  'FAIL',
]
const FACTS = ['from', 'risk', 'milestoneCount', 'blindMappingRequired']
const OPTION_KEYS = {
  '--run': 'run',
  '--reason': 'reason',
  '--evidence': 'evidence',
  '--row': 'row',
  '--findings': 'findings',
  '--packet': 'packet',
  '--revision': 'revision',
  '--intersect': 'intersect',
  '--mutation-run': 'mutationRun',
  '--mutation-row': 'mutationRow',
  '--blind-input': 'blindInput',
  '--blind-map': 'blindMap',
}
// These are interpreter bindings to existing check sites, not a second transition table.
// A misspelled or new obligation must not appear in guidance without an executing check.
const SITES = {
  resume: ['run'],
  red: ['run', 'red-evidence', 'red-row'],
  green: ['run', 'green-evidence', 'skip-red-reason'],
  review: ['run', 'review-evidence', 'review-packet', 'review-intersect', 'review-mutation', 'review-blind'],
  escape: ['stop-reason'],
}
const KINDS = ['resume', 'red', 'green', 'review', 'review', 'escape', 'escape']

function invalid(message) {
  throw new TypeError(`Invalid delivery protocol: ${message}`)
}

function record(value, where) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid(`${where} must be an object`)
  }
}

function exactKeys(value, keys, where) {
  record(value, where)
  const actual = Object.keys(value)
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key)))
    invalid(`${where} has unknown or missing keys`)
}

function uniqueList(value, allowed, where, nonempty = false) {
  if (!Array.isArray(value) || (nonempty && value.length === 0))
    invalid(`${where} must be ${nonempty ? 'a nonempty' : 'an'} array`)
  if (new Set(value).size !== value.length || value.some((item) => !allowed.includes(item)))
    invalid(`${where} contains duplicate or unknown entries`)
}

function validateFact(name, value) {
  let valid = false
  if (name === 'from') valid = STATES.includes(value)
  else if (name === 'risk') valid = ['low', 'medium', 'high'].includes(value)
  else if (name === 'milestoneCount') valid = Number.isSafeInteger(value) && value >= 0
  else if (name === 'blindMappingRequired') valid = typeof value === 'boolean'
  else invalid(`unknown fact ${String(name)}`)
  if (!valid) invalid(`invalid fact ${String(name)}`)
}

function validateExpression(expression, availableFacts, depth = 0) {
  if (depth > 32) invalid('predicate nesting exceeds 32')
  if (typeof expression === 'boolean') return
  record(expression, 'predicate')
  const keys = Object.keys(expression)
  if (keys.length !== 1) invalid('predicate needs exactly one operator')
  const [operator] = keys
  const operand = expression[operator]
  if (operator === 'eq') {
    if (!Array.isArray(operand) || operand.length !== 2 || !FACTS.includes(operand[0]))
      invalid('eq needs [fact, literal]')
    if (!availableFacts.includes(operand[0])) invalid(`fact ${operand[0]} is unavailable at this obligation`)
    validateFact(operand[0], operand[1])
  } else if (operator === 'not') {
    validateExpression(operand, availableFacts, depth + 1)
  } else if (operator === 'all' || operator === 'any') {
    if (!Array.isArray(operand) || operand.length === 0) invalid(`${operator} needs a nonempty expression array`)
    for (const child of operand) validateExpression(child, availableFacts, depth + 1)
  } else invalid(`unknown predicate operator ${operator}`)
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

export function compileDeliveryProtocol(document, { referenceNodeIds } = {}) {
  exactKeys(document, ['language', 'transitions', 'targets'], 'document')
  if (document.language !== 'oracle-delivery/v1') invalid('unsupported language')
  if (!Array.isArray(referenceNodeIds) || referenceNodeIds.some((id) => typeof id !== 'string'))
    invalid('referenceNodeIds must be strings')
  exactKeys(document.transitions, STATES, 'transitions')
  exactKeys(document.targets, STATES, 'targets')
  for (const [index, state] of STATES.entries()) {
    uniqueList(document.transitions[state], STATES, `${state}.transitions`)
    const target = document.targets[state]
    exactKeys(target, ['kind', 'readNodes', 'obligations'], state)
    if (target.kind !== KINDS[index]) invalid(`${state} has an unsupported interpreter kind`)
    uniqueList(target.readNodes, referenceNodeIds, `${state}.readNodes`)
    if (!Array.isArray(target.obligations)) invalid(`${state}.obligations must be an array`)
    uniqueList(
      target.obligations.map((obligation) => obligation?.id),
      SITES[target.kind],
      `${state}.obligation IDs`,
    )
    if (target.obligations.length !== SITES[target.kind].length) invalid(`${state} has missing interpreter obligations`)
    for (const obligation of target.obligations) {
      exactKeys(obligation, ['id', 'when', 'flags'], `${state}.obligation`)
      uniqueList(obligation.flags, Object.keys(OPTION_KEYS), `${state}.${obligation.id}.flags`, true)
      // Blind applicability is derived only after trusted review evidence has been checked.
      // Earlier sites cannot read it without reordering security gates.
      const availableFacts =
        obligation.id === 'review-blind' ? FACTS : FACTS.filter((name) => name !== 'blindMappingRequired')
      validateExpression(obligation.when, availableFacts)
    }
  }
  return freeze(structuredClone(document))
}

function targetOf(protocol, to) {
  if (!STATES.includes(to)) invalid(`unknown target ${String(to)}`)
  return protocol.targets[to]
}

export function nextTargets(protocol, from) {
  if (!STATES.includes(from)) invalid(`unknown state ${String(from)}`)
  return protocol.transitions[from]
}

export function targetKind(protocol, to) {
  return targetOf(protocol, to).kind
}

export function readNodes(protocol, to) {
  return targetOf(protocol, to).readNodes
}

function validateReferencedFacts(expression, facts) {
  if (typeof expression === 'boolean') return
  if (Object.hasOwn(expression, 'eq')) {
    const [name] = expression.eq
    if (!Object.hasOwn(facts, name)) invalid(`missing fact ${name}`)
    validateFact(name, facts[name])
  } else if (Object.hasOwn(expression, 'not')) validateReferencedFacts(expression.not, facts)
  else for (const child of expression.all ?? expression.any) validateReferencedFacts(child, facts)
}

function evaluate(expression, facts) {
  if (typeof expression === 'boolean') return expression
  if (Object.hasOwn(expression, 'eq')) return facts[expression.eq[0]] === expression.eq[1]
  if (Object.hasOwn(expression, 'not')) return !evaluate(expression.not, facts)
  if (Object.hasOwn(expression, 'all')) return expression.all.every((child) => evaluate(child, facts))
  return expression.any.some((child) => evaluate(child, facts))
}

export function requiredFlags(protocol, to, facts) {
  exactKeys(facts, FACTS, 'facts')
  for (const name of FACTS) validateFact(name, facts[name])
  return [
    ...new Set(
      targetOf(protocol, to)
        .obligations.filter(({ when }) => evaluate(when, facts))
        .flatMap(({ flags }) => flags),
    ),
  ]
}

export function missingObligationFlags(protocol, to, id, facts, options) {
  const obligation = targetOf(protocol, to).obligations.find((entry) => entry.id === id)
  if (!obligation) invalid(`unknown obligation ${String(id)} for ${to}`)
  record(facts, 'facts')
  record(options, 'options')
  if (Object.keys(facts).some((name) => !FACTS.includes(name))) invalid('unknown facts')
  // Validate every referenced fact before boolean short-circuiting: unknown is not false.
  validateReferencedFacts(obligation.when, facts)
  if (!evaluate(obligation.when, facts)) return []
  return obligation.flags.filter((flag) => !Object.hasOwn(options, OPTION_KEYS[flag]) || !options[OPTION_KEYS[flag]])
}
