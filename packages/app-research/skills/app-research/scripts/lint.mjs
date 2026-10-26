import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { FILES, findInconsistencies, loadRun, MODES, PLATFORMS, usedActions } from './state.mjs'
import { readJson } from './store.mjs'

export const POLICY_CATEGORIES = ['auth', 'account', 'permission', 'billing', 'data', 'usage', 'exception']
export const POLICY_STATUSES = ['observed', 'documented', 'code-backed', 'inferred', 'unknown']
const FEATURE_ID = /^[A-Z]{2,6}-\d{3}$/
const POLICY_ID = /^POL-\d{3}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}.*)?$/
const SOLID_RESULTS = new Set(['ok', 'no-change'])
const REQUIRED_KIND = { observed: 'observation', documented: 'document', 'code-backed': 'code' }
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const isHttpUrl = (value) => isText(value) && /^https?:\/\/\S+$/.test(value)
const isIsoDate = (value) => isText(value) && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const fileExists = (path) =>
  stat(path).then(
    (info) => info.isFile(),
    () => false,
  )

function checkRunShape({ state, fail }) {
  const { run } = state
  if (!PLATFORMS.includes(run.platform) || !MODES.includes(run.mode))
    fail('RUN_INVALID', FILES.run, 'platform or mode is not a known value')
  const used = usedActions(state)
  if (used > run.maxActions)
    fail('BUDGET_EXCEEDED', FILES.observations, `${used} actions exceed the budget ${run.maxActions}`)
  for (const [kind, ids] of [
    ['screen', state.screens.map((item) => item.id)],
    ['transition', state.transitions.map((item) => item.id)],
    ['observation', state.observations.map((item) => item.id)],
    ['gate', state.gates.map((item) => item.gateId)],
  ]) {
    if (new Set(ids).size !== ids.length) fail('DUPLICATE_ID', kind, `duplicate ${kind} id`)
  }
  for (const problem of findInconsistencies(state)) fail('INCONSISTENT_STATE', problem.where, problem.message)
}

function checkTransitions({ state, fail, screens }) {
  for (const transition of state.transitions) {
    for (const end of [transition.from, transition.to]) {
      if (!screens.has(end)) fail('GRAPH_DANGLING', transition.id, `transition points at missing screen ${end}`)
    }
  }
}

function checkGateUse({ state, fail }) {
  const uses = new Map()
  for (const observation of state.observations.filter((item) => item.gateId)) {
    uses.set(observation.gateId, [...(uses.get(observation.gateId) ?? []), observation.id])
  }
  for (const [gateId, ids] of uses) {
    if (ids.length > 1) fail('GATE_REUSED', gateId, `one receipt was used for more than one action (${ids.join(', ')})`)
  }
}

function checkReceipt(observation, gates, fail) {
  const gate = gates.get(observation.gateId)
  if (gate?.decision !== 'allow') {
    fail('OBSERVATION_UNGATED', observation.id, 'observation has no allowing gate receipt')
    return
  }
  if (gate.action !== observation.action.type)
    fail('OBSERVATION_UNGATED', observation.id, 'observation action differs from its receipt')
  if (gate.screenId !== observation.beforeState?.screenId) {
    fail(
      'OBSERVATION_UNGATED',
      observation.id,
      `receipt was issued on ${gate.screenId} but the action started on ${observation.beforeState?.screenId}`,
    )
  }
}

async function checkObservations({ state, dir, fail, screens, gates }) {
  for (const observation of state.observations) {
    if (!screens.has(observation.screenId))
      fail('GRAPH_DANGLING', observation.id, `observation is on missing screen ${observation.screenId}`)
    if (!observation.anchor) checkReceipt(observation, gates, fail)
    for (const field of ['snapshotPath', 'screenshotPath']) {
      const path = observation[field]
      if (path && !(await fileExists(join(dir, path))))
        fail('EVIDENCE_PATH_MISSING', observation.id, `${field} ${path} does not exist`)
    }
  }
}

function checkObservationRef(owner, ref, { observations, gates, fail }) {
  const observation = observations.get(ref)
  if (!observation) {
    const why = gates.has(ref)
      ? 'a gate receipt is not an observation; blocked paths are not evidence'
      : 'it does not exist'
    fail('EVIDENCE_REF_MISSING', owner, `observation ${ref}: ${why}`)
    return
  }
  if (!SOLID_RESULTS.has(observation.result))
    fail('EVIDENCE_NOT_SOLID', owner, `observation ${ref} ended in ${observation.result}`)
}

function checkDocument(owner, item, fail) {
  if (!isHttpUrl(item.url) || !isIsoDate(item.fetchedAt))
    fail('EVIDENCE_INCOMPLETE', owner, 'document evidence needs url and fetchedAt (ISO 8601 date)')
  for (const field of ['appVersion', 'region']) {
    if (!isText(item[field]))
      fail('EVIDENCE_INCOMPLETE', owner, `document evidence needs ${field} (use "unknown" when not stated)`)
  }
}

/** Validates each evidence item and returns the list (empty when the field is malformed). */
function checkEvidence(owner, evidence, ctx) {
  const { fail } = ctx
  if (!Array.isArray(evidence)) {
    fail('SCHEMA', owner, 'evidence must be an array')
    return []
  }
  for (const item of evidence) {
    if (item?.kind === 'observation') checkObservationRef(owner, item.ref, ctx)
    else if (item?.kind === 'document') checkDocument(owner, item, fail)
    else if (item?.kind === 'code') {
      if (!isText(item.ref) || !isText(item.appVersion))
        fail('EVIDENCE_INCOMPLETE', owner, 'code evidence needs ref and appVersion')
    } else fail('SCHEMA', owner, `evidence kind must be observation, document or code (got ${item?.kind})`)
  }
  return evidence
}

/** Features and policies share one status vocabulary and the same evidence the status demands. */
function checkClaimStatus(owner, claim, kinds, fail) {
  const needs = REQUIRED_KIND[claim.status]
  if (needs && !kinds.has(needs)) fail('CLAIM_UNSUPPORTED', owner, `a ${claim.status} claim needs ${needs} evidence`)
  if (claim.status === 'inferred' && !isText(claim.basis))
    fail('CLAIM_UNSUPPORTED', owner, 'an inferred claim needs a basis')
  if (claim.serverSide !== undefined && typeof claim.serverSide !== 'boolean')
    fail('SCHEMA', owner, 'serverSide must be true or false')
  if (claim.serverSide === true && ['observed', 'code-backed'].includes(claim.status) && !kinds.has('document')) {
    fail(
      'SERVER_SIDE_UNCONFIRMED',
      owner,
      'a server-side rule cannot be confirmed from the client alone; add a document or mark it inferred',
    )
  }
}

/** An observed feature may only claim the screens and transitions its cited observations actually touched. */
function checkFeatureCoverage(owner, feature, evidence, { observations, screens, transitions, fail }) {
  const cited = evidence
    .filter((item) => item?.kind === 'observation' && observations.has(item.ref))
    .map((item) => item.ref)
  const touched = new Set(
    cited.flatMap((ref) => {
      const observation = observations.get(ref)
      return [observation.screenId, observation.beforeState?.screenId]
    }),
  )
  for (const screenId of feature.screenIds ?? []) {
    if (screens.has(screenId) && !touched.has(screenId))
      fail('CLAIM_UNSUPPORTED', owner, `no cited observation touched screen ${screenId}`)
  }
  for (const transitionId of feature.transitionIds ?? []) {
    const transition = transitions.get(transitionId)
    if (transition && !transition.observationIds.some((ref) => cited.includes(ref))) {
      fail('CLAIM_UNSUPPORTED', owner, `no cited observation produced transition ${transitionId}`)
    }
  }
}

function checkFeature(feature, ctx, featureIds) {
  const { fail, screens, transitions } = ctx
  if (!isRecord(feature)) {
    fail('SCHEMA', '(feature)', 'each feature must be an object')
    return
  }
  const owner = feature.id ?? '(feature)'
  if (!FEATURE_ID.test(feature.id ?? '') || !isText(feature.name))
    fail('SCHEMA', owner, 'feature needs id like AUTH-001 and a name')
  if (featureIds.has(feature.id)) fail('DUPLICATE_ID', owner, 'duplicate feature id')
  featureIds.add(feature.id)
  for (const screenId of feature.screenIds ?? [])
    if (!screens.has(screenId)) fail('GRAPH_DANGLING', owner, `missing screen ${screenId}`)
  for (const transitionId of feature.transitionIds ?? []) {
    if (!transitions.has(transitionId)) fail('GRAPH_DANGLING', owner, `missing transition ${transitionId}`)
  }
  const evidence = checkEvidence(owner, feature.evidence ?? [], ctx)
  if (!POLICY_STATUSES.includes(feature.status)) {
    fail('SCHEMA', owner, `feature status must be one of ${POLICY_STATUSES.join(', ')}`)
    return
  }
  checkClaimStatus(owner, feature, new Set(evidence.map((item) => item?.kind)), fail)
  if (feature.status === 'observed') checkFeatureCoverage(owner, feature, evidence, ctx)
}

function checkPolicy(policy, ctx, { policyIds, featureIds }) {
  const { fail } = ctx
  if (!isRecord(policy)) {
    fail('SCHEMA', '(policy)', 'each policy must be an object')
    return
  }
  const owner = policy.id ?? '(policy)'
  if (!POLICY_ID.test(policy.id ?? '') || !isText(policy.statement))
    fail('SCHEMA', owner, 'policy needs id like POL-001 and a statement')
  if (policyIds.has(policy.id)) fail('DUPLICATE_ID', owner, 'duplicate policy id')
  policyIds.add(policy.id)
  if (!POLICY_CATEGORIES.includes(policy.category))
    fail('SCHEMA', owner, `category must be one of ${POLICY_CATEGORIES.join(', ')}`)
  const knownStatus = POLICY_STATUSES.includes(policy.status)
  if (!knownStatus) fail('SCHEMA', owner, `status must be one of ${POLICY_STATUSES.join(', ')}`)
  for (const featureId of policy.featureIds ?? [])
    if (!featureIds.has(featureId)) fail('GRAPH_DANGLING', owner, `missing feature ${featureId}`)
  const evidence = checkEvidence(owner, policy.evidence ?? [], ctx)
  if (knownStatus) checkClaimStatus(owner, policy, new Set(evidence.map((item) => item?.kind)), fail)
}

async function readClaims(dir, file, key, fail) {
  const data = await readJson(join(dir, file), { [key]: [] })
  if (!isRecord(data) || !Array.isArray(data[key])) {
    fail('SCHEMA', file, `${file} must be an object with a "${key}" array`)
    return []
  }
  return data[key]
}

/** Checks a run for structural integrity and for claims that outrun their evidence. */
export async function lint(runDir) {
  const state = await loadRun(runDir)
  const errors = []
  const ctx = {
    state,
    dir: state.dir,
    fail: (code, where, message) => errors.push({ code, where, message }),
    screens: new Map(state.screens.map((screen) => [screen.id, screen])),
    transitions: new Map(state.transitions.map((transition) => [transition.id, transition])),
    observations: new Map(state.observations.map((observation) => [observation.id, observation])),
    gates: new Map(state.gates.map((gate) => [gate.gateId, gate])),
  }
  checkRunShape(ctx)
  checkTransitions(ctx)
  checkGateUse(ctx)
  await checkObservations(ctx)

  const features = await readClaims(state.dir, FILES.features, 'features', ctx.fail)
  const policies = await readClaims(state.dir, FILES.policies, 'policies', ctx.fail)
  const featureIds = new Set()
  for (const feature of features) checkFeature(feature, ctx, featureIds)
  const seen = { policyIds: new Set(), featureIds }
  for (const policy of policies) checkPolicy(policy, ctx, seen)
  return { ok: errors.length === 0, errors }
}
