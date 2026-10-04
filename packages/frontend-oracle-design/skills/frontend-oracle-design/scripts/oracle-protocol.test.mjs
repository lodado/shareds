import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import {
  compileDeliveryProtocol,
  missingObligationFlags,
  nextTargets,
  readNodes,
  requiredFlags,
  targetKind,
} from './oracle-protocol.mjs'

const DOCUMENT = JSON.parse(readFileSync(new URL('../references/delivery.protocol.json', import.meta.url), 'utf8'))
const REFERENCES = [
  'delivery-ledger',
  'delivery-red',
  'delivery-implementation-decision',
  'delivery-green-review',
  'subagent-review',
  'review-checklist',
  'card-confirmation-lock',
]
const compile = (document) => compileDeliveryProtocol(document, { referenceNodeIds: REFERENCES })
const PROTOCOL = compile(DOCUMENT)
const FACTS = { from: 'ORACLE_READY', risk: 'low', milestoneCount: 0, blindMappingRequired: false }
const EDGES = {
  ORACLE_READY: ['VALID_RED', 'IMPLEMENTED_GREEN', 'NEEDS_DECISION', 'FAIL'],
  VALID_RED: ['VALID_RED', 'IMPLEMENTED_GREEN', 'NEEDS_DECISION', 'FAIL'],
  IMPLEMENTED_GREEN: ['REVIEW_VERIFIED', 'PARTIAL_VERIFIED', 'NEEDS_DECISION', 'FAIL'],
  REVIEW_VERIFIED: ['NEEDS_DECISION', 'FAIL'],
  PARTIAL_VERIFIED: ['NEEDS_DECISION', 'FAIL'],
  NEEDS_DECISION: ['ORACLE_READY', 'FAIL'],
  FAIL: [],
}

test('delivery protocol as the canonical packet contract to be ordered and reference-complete', () => {
  for (const [from, targets] of Object.entries(EDGES)) assert.deepEqual(nextTargets(PROTOCOL, from), targets)
  const targets = [
    ['ORACLE_READY', 'resume', ['card-confirmation-lock']],
    ['VALID_RED', 'red', ['delivery-ledger', 'delivery-red']],
    ['IMPLEMENTED_GREEN', 'green', ['delivery-ledger', 'delivery-implementation-decision', 'delivery-green-review']],
    ['REVIEW_VERIFIED', 'review', ['delivery-green-review', 'subagent-review', 'review-checklist']],
    ['PARTIAL_VERIFIED', 'review', ['delivery-green-review', 'subagent-review', 'review-checklist']],
    ['NEEDS_DECISION', 'escape', []],
    ['FAIL', 'escape', []],
  ]
  for (const [target, kind, references] of targets) {
    assert.equal(targetKind(PROTOCOL, target), kind)
    assert.deepEqual(readNodes(PROTOCOL, target), references)
  }
})

test('required flags as RED boundary cases to be exact without unrelated evidence', () => {
  const cases = [
    ['ORACLE_READY', 0, ['--run', '--evidence', '--row']],
    ['ORACLE_READY', 1, ['--run', '--evidence']],
    ['ORACLE_READY', Number.MAX_SAFE_INTEGER, ['--run', '--evidence']],
    ['VALID_RED', 0, ['--run', '--evidence', '--row']],
    ['VALID_RED', 1, ['--run', '--evidence', '--row']],
  ]
  for (const [from, milestoneCount, expected] of cases) {
    assert.deepEqual(requiredFlags(PROTOCOL, 'VALID_RED', { ...FACTS, from, milestoneCount }), expected)
  }
})

test('required flags as GREEN resume and stop actions to be exact', () => {
  const cases = [
    ['IMPLEMENTED_GREEN', 'ORACLE_READY', ['--run', '--evidence', '--reason']],
    ['IMPLEMENTED_GREEN', 'VALID_RED', ['--run', '--evidence']],
    ['ORACLE_READY', 'NEEDS_DECISION', ['--run']],
    ['NEEDS_DECISION', 'REVIEW_VERIFIED', ['--reason']],
    ['FAIL', 'ORACLE_READY', ['--reason']],
  ]
  for (const [to, from, expected] of cases) {
    assert.deepEqual(requiredFlags(PROTOCOL, to, { ...FACTS, from }), expected)
  }
})

test('required flags as review risk and blind mapping truth cases to be stable in order', () => {
  const cases = [
    ['low', false, []],
    ['medium', false, []],
    ['low', true, ['--blind-input', '--blind-map']],
    ['medium', true, ['--blind-input', '--blind-map']],
    ['high', false, ['--intersect', '--mutation-run', '--mutation-row']],
    ['high', true, ['--intersect', '--mutation-run', '--mutation-row', '--blind-input', '--blind-map']],
  ]
  for (const to of ['REVIEW_VERIFIED', 'PARTIAL_VERIFIED']) {
    for (const [risk, blindMappingRequired, additional] of cases) {
      const facts = { ...FACTS, from: 'IMPLEMENTED_GREEN', risk, blindMappingRequired }
      assert.deepEqual(requiredFlags(PROTOCOL, to, facts), [
        '--run',
        '--evidence',
        '--findings',
        '--packet',
        '--revision',
        ...additional,
      ])
    }
  }
})

test('obligations as runtime argument guards to be scoped to referenced facts and camelCase options', () => {
  assert.deepEqual(missingObligationFlags(PROTOCOL, 'FAIL', 'stop-reason', {}, {}), ['--reason'])
  assert.deepEqual(missingObligationFlags(PROTOCOL, 'FAIL', 'stop-reason', {}, { reason: '정책 🚦' }), [])
  assert.deepEqual(missingObligationFlags(PROTOCOL, 'REVIEW_VERIFIED', 'review-mutation', { risk: 'low' }, {}), [])
  assert.deepEqual(
    missingObligationFlags(PROTOCOL, 'REVIEW_VERIFIED', 'review-mutation', { risk: 'high' }, { mutationRun: 'run-1' }),
    ['--mutation-row'],
  )
  assert.deepEqual(
    missingObligationFlags(
      PROTOCOL,
      'REVIEW_VERIFIED',
      'review-blind',
      { blindMappingRequired: true },
      { blindInput: 'input', blindMap: 'map' },
    ),
    [],
  )
  assert.deepEqual(
    missingObligationFlags(PROTOCOL, 'REVIEW_VERIFIED', 'review-packet', {}, { packet: '', revision: 0 }),
    ['--packet', '--revision'],
  )
  assert.throws(
    () => missingObligationFlags(PROTOCOL, 'REVIEW_VERIFIED', 'review-mutation', { risk: 'HIGH' }, {}),
    TypeError,
  )
  assert.throws(() => missingObligationFlags(PROTOCOL, 'REVIEW_VERIFIED', 'missing', {}, {}), TypeError)
})

test('compiler as a closed typed language to reject invalid document shapes', () => {
  for (const document of [null, undefined, [], '', true, 1, {}]) assert.throws(() => compile(document), TypeError)
  const mutations = [
    (doc) => {
      doc.extra = true
    },
    (doc) => {
      doc.language = 'oracle-delivery/v2'
    },
    (doc) => {
      delete doc.targets
    },
    (doc) => {
      doc.transitions.UNKNOWN = []
    },
    (doc) => {
      delete doc.transitions.FAIL
    },
    (doc) => {
      doc.transitions.FAIL = ['UNKNOWN']
    },
    (doc) => {
      doc.transitions.ORACLE_READY.push('VALID_RED')
    },
    (doc) => {
      doc.targets.UNKNOWN = doc.targets.FAIL
    },
    (doc) => {
      delete doc.targets.FAIL
    },
    (doc) => {
      doc.targets.FAIL.kind = 'execute'
    },
    (doc) => {
      doc.targets.VALID_RED.kind = 'escape'
    },
    (doc) => {
      doc.targets.FAIL.extra = true
    },
    (doc) => {
      doc.targets.FAIL.readNodes = ['unknown-reference']
    },
    (doc) => {
      doc.targets.VALID_RED.readNodes.push('delivery-ledger')
    },
    (doc) => {
      doc.targets.FAIL.obligations[0].extra = true
    },
    (doc) => {
      doc.targets.FAIL.obligations.push(doc.targets.FAIL.obligations[0])
    },
    (doc) => {
      doc.targets.FAIL.obligations = []
    },
    (doc) => {
      doc.targets.FAIL.obligations[0].id = 'unknown-site'
    },
    (doc) => {
      doc.targets.FAIL.obligations[0].flags = []
    },
    (doc) => {
      doc.targets.FAIL.obligations[0].flags = ['--execute']
    },
    (doc) => {
      doc.targets.FAIL.obligations[0].flags = ['--reason', '--reason']
    },
  ]
  for (const mutate of mutations) {
    const document = structuredClone(DOCUMENT)
    mutate(document)
    assert.throws(() => compile(document), TypeError)
  }
})

test('predicate grammar as typed data to reject executable strings and ill-typed terms', () => {
  const invalid = [
    'globalThis.__oracleProtocolExecuted = true',
    null,
    [],
    1,
    {},
    { eval: 'true' },
    { eq: ['unknown', true] },
    { eq: ['risk', 'extreme'] },
    { eq: ['risk', true] },
    { eq: ['from', 'UNKNOWN'] },
    { eq: ['milestoneCount', -1] },
    { eq: ['milestoneCount', 0.5] },
    { eq: ['milestoneCount', Number.MAX_SAFE_INTEGER + 1] },
    { eq: ['blindMappingRequired', 'true'] },
    { eq: ['risk'] },
    { eq: ['risk', 'low', 'high'] },
    { eq: ['risk', 'low'], not: false },
    { all: [] },
    { any: [] },
    { all: true },
    { any: [true, 'true'] },
    { not: null },
  ]
  for (const when of invalid) {
    const document = structuredClone(DOCUMENT)
    document.targets.FAIL.obligations[0].when = when
    assert.throws(() => compile(document), TypeError)
  }
  assert.equal(Object.hasOwn(globalThis, '__oracleProtocolExecuted'), false)
})

test('predicate boundaries as nesting and fact completeness to be checked before short-circuiting', () => {
  const document = structuredClone(DOCUMENT)
  let when = true
  for (let depth = 0; depth < 32; depth += 1) when = { not: when }
  document.targets.FAIL.obligations[0].when = when
  assert.deepEqual(requiredFlags(compile(document), 'FAIL', FACTS), ['--reason'])
  document.targets.FAIL.obligations[0].when = { not: when }
  assert.throws(() => compile(document), TypeError)
  document.targets.FAIL.obligations[0].when = { any: [true, { eq: ['risk', 'high'] }] }
  const protocol = compile(document)
  assert.throws(() => missingObligationFlags(protocol, 'FAIL', 'stop-reason', {}, {}), TypeError)
  assert.throws(() => missingObligationFlags(protocol, 'FAIL', 'stop-reason', { risk: 'HIGH' }, {}), TypeError)
  assert.throws(
    () => missingObligationFlags(protocol, 'FAIL', 'stop-reason', { risk: 'high', unknown: true }, {}),
    TypeError,
  )
  assert.throws(() => missingObligationFlags(protocol, 'FAIL', 'stop-reason', { risk: 'high' }, null), TypeError)
  assert.throws(() => compileDeliveryProtocol(DOCUMENT), TypeError)
  assert.throws(() => compileDeliveryProtocol(DOCUMENT, { referenceNodeIds: [1] }), TypeError)
})

test('predicate evaluator as compositional typed terms to follow the supplied model', () => {
  const document = structuredClone(DOCUMENT)
  const obligation = document.targets.REVIEW_VERIFIED.obligations.find((entry) => entry.id === 'review-blind')
  obligation.when = {
    all: [
      { any: [{ eq: ['risk', 'high'] }, { eq: ['milestoneCount', 0] }] },
      { not: { eq: ['blindMappingRequired', true] } },
    ],
  }
  const protocol = compile(document)
  const cases = [
    ['low', 0, false, ['--blind-input', '--blind-map']],
    ['low', 1, false, []],
    ['high', 1, false, ['--blind-input', '--blind-map']],
    ['high', 1, true, []],
  ]
  for (const [risk, milestoneCount, blindMappingRequired, expected] of cases) {
    assert.deepEqual(
      missingObligationFlags(
        protocol,
        'REVIEW_VERIFIED',
        'review-blind',
        { ...FACTS, risk, milestoneCount, blindMappingRequired },
        {},
      ),
      expected,
    )
  }
  obligation.when = false
  assert.deepEqual(missingObligationFlags(compile(document), 'REVIEW_VERIFIED', 'review-blind', FACTS, {}), [])
})

test('blind mapping facts as evidence-dependent input to be rejected at every earlier interpreter site', () => {
  for (const [target, definition] of Object.entries(DOCUMENT.targets)) {
    for (const obligation of definition.obligations.filter((entry) => entry.id !== 'review-blind')) {
      const document = structuredClone(DOCUMENT)
      document.targets[target].obligations.find((entry) => entry.id === obligation.id).when = {
        any: [true, { not: { eq: ['blindMappingRequired', false] } }],
      }
      assert.throws(() => compile(document), TypeError)
    }
  }
})

test('runtime facts as closed typed input to reject missing invalid and unknown values', () => {
  const invalid = [
    null,
    undefined,
    [],
    {},
    { ...FACTS, extra: true },
    { ...FACTS, from: 'UNKNOWN' },
    { ...FACTS, risk: 'HIGH' },
    { ...FACTS, milestoneCount: -1 },
    { ...FACTS, milestoneCount: 0.5 },
    { ...FACTS, milestoneCount: Number.MAX_SAFE_INTEGER + 1 },
    { ...FACTS, milestoneCount: Number.NaN },
    { ...FACTS, milestoneCount: Infinity },
    { ...FACTS, blindMappingRequired: 'false' },
  ]
  for (const facts of invalid) assert.throws(() => requiredFlags(PROTOCOL, 'FAIL', facts), TypeError)
  for (const state of [null, undefined, '', 'UNKNOWN']) {
    assert.throws(() => nextTargets(PROTOCOL, state), TypeError)
    assert.throws(() => targetKind(PROTOCOL, state), TypeError)
    assert.throws(() => readNodes(PROTOCOL, state), TypeError)
    assert.throws(() => requiredFlags(PROTOCOL, state, FACTS), TypeError)
  }
})

test('compiled protocol as an immutable snapshot to resist source and consumer mutation', () => {
  const document = structuredClone(DOCUMENT)
  const protocol = compile(document)
  document.transitions.ORACLE_READY.length = 0
  document.targets.VALID_RED.readNodes.length = 0
  document.targets.FAIL.obligations[0].flags[0] = '--run'
  assert.deepEqual(nextTargets(protocol, 'ORACLE_READY'), EDGES.ORACLE_READY)
  assert.deepEqual(readNodes(protocol, 'VALID_RED'), ['delivery-ledger', 'delivery-red'])
  assert.deepEqual(requiredFlags(protocol, 'FAIL', FACTS), ['--reason'])
  assert.equal(Object.isFrozen(protocol), true)
  assert.equal(Object.isFrozen(protocol.transitions.ORACLE_READY), true)
  assert.equal(Object.isFrozen(protocol.targets.FAIL.obligations[0].flags), true)
})
