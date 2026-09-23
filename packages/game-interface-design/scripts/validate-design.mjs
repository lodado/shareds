#!/usr/bin/env node
// Check design declarations and local files; not actual gameplay or Figma execution.
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import Ajv from 'ajv/dist/2020.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCHEMA = path.join(ROOT, 'skills/reference-driven-game-design/schemas/game-delivery.schema.json')

const TRACE_FIELDS = [
  ['rule_ids', 'rules'],
  ['screen_ids', 'screens'],
  ['transition_ids', 'transitions'],
  ['feedback_ids', 'feedback'],
  ['experiment_ids', 'experiments'],
]
const OBSERVATION_KINDS = new Set(['playable_test', 'usability_session', 'fun_session', 'business_observation'])
const REQUIRED_ARTIFACT_KINDS = ['game_design', 'ux_flow', 'visual_feel', 'validation_handoff', 'reference_log']
const OBSERVED_DIMENSIONS = [
  ['playable', 'tested', 'playable_test'],
  ['usability', 'observed', 'usability_session'],
  ['fun', 'observed', 'fun_session'],
  ['business', 'observed', 'business_observation'],
]

function reachable(machine) {
  let seen = new Set([machine.initial_state])
  for (;;) {
    const next = new Set(seen)
    for (const t of machine.transitions) if (seen.has(t.from)) next.add(t.to)
    if (next.size === seen.size) return seen
    seen = next
  }
}

function stateMachineErrors(machine) {
  const errors = []
  const states = new Set(machine.states)
  if (states.size !== machine.states.length) errors.push('duplicate states')
  if (!states.has(machine.initial_state)) errors.push('unknown initial state')
  for (const t of machine.transitions) {
    if (!states.has(t.from) || !states.has(t.to)) errors.push(`dangling state: ${t.id}`)
  }
  const seen = reachable(machine)
  if ([...states].some((s) => !seen.has(s))) errors.push(`unreachable states: ${machine.id}`)
  return errors
}

function duplicateErrors(ids) {
  const counts = new Map()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  return [...counts].filter(([, c]) => c > 1).map(([id]) => `duplicate ID: ${id}`)
}

function collectGroups(data) {
  const keys = ['artifacts', 'rules', 'screens', 'feedback', 'experiments', 'evidence', 'issues']
  const groups = Object.fromEntries(keys.map((key) => [key, new Set(data[key].map((x) => x.id))]))
  const transitions = data.state_machines.flatMap((m) => m.transitions)
  groups.transitions = new Set(transitions.map((t) => t.id))
  const actions = data.screens.flatMap((s) => s.primary_actions)
  const ids = [
    ...keys.flatMap((key) => data[key].map((x) => x.id)),
    ...data.state_machines.map((m) => m.id),
    ...transitions.map((t) => t.id),
    ...actions.map((a) => a.id),
    ...data.trace.map((t) => t.journey_id),
  ]
  return { groups, ids, actions }
}

function crossReferenceErrors(data, { groups, ids, actions }) {
  const errors = data.state_machines.flatMap(stateMachineErrors)
  for (const a of actions) {
    if (a.transition_ids.some((id) => !groups.transitions.has(id))) errors.push(`dangling primary action: ${a.id}`)
  }
  errors.push(...duplicateErrors(ids))
  for (const t of data.trace) {
    for (const [field, group] of TRACE_FIELDS) {
      if (t[field].some((id) => !groups[group].has(id))) errors.push(`dangling trace ${field}`)
    }
  }
  return errors
}

function evidenceErrors(data, ev) {
  const errors = []
  for (const item of [...data.artifacts, ...data.experiments, data.figma]) {
    if (item.evidence_ids.some((id) => !ev.has(id))) errors.push('dangling evidence')
  }
  for (const x of data.experiments) {
    const hasObservation = x.evidence_ids.some((id) => OBSERVATION_KINDS.has(ev.get(id)?.kind))
    if (x.status === 'observed' && !hasObservation) errors.push('observed experiment lacks observation evidence')
  }
  return errors
}

function planReadyErrors(data, groups) {
  if (data.readiness.planning !== 'PLAN_READY') return []
  const errors = []
  const complete = new Set(data.artifacts.filter((a) => a.status === 'complete').map((a) => a.kind))
  if (REQUIRED_ARTIFACT_KINDS.some((k) => !complete.has(k))) errors.push('missing complete artifact kinds')
  if (data.artifacts.some((a) => a.status !== 'complete')) errors.push('stale/draft artifacts in ready plan')
  for (const field of ['rules', 'state_machines', 'screens', 'feedback', 'experiments', 'trace']) {
    if (data[field].length === 0) errors.push(`ready plan requires ${field}`)
  }
  for (const [field, group] of TRACE_FIELDS) {
    const covered = new Set(data.trace.flatMap((t) => t[field]))
    if ([...groups[group]].some((id) => !covered.has(id))) errors.push(`untraced ${group}`)
  }
  return errors
}

const isFigmaReady = (rd) => rd.figma === 'PILOT_READY' || rd.figma === 'FIGMA_READY'

function figmaModeErrors(data) {
  const { mode, readiness: rd, figma: fg } = data
  if (mode !== 'PLAN_ONLY') return rd.figma === 'not_requested' ? ['FIGMA mode silently downgraded'] : []
  const errors = []
  if (rd.figma !== 'not_requested') errors.push('PLAN_ONLY cannot claim Figma readiness')
  if (fg.artifacts.length > 0 || Object.values(fg.checks).includes('verified')) {
    errors.push('PLAN_ONLY cannot report Figma production')
  }
  return errors
}

function figmaReadyErrors(data, ev) {
  const { readiness: rd, figma: fg } = data
  if (!isFigmaReady(rd)) return []
  const errors = []
  if (fg.artifacts.length === 0) errors.push('Figma requires artifact locators')
  for (const check of ['source', 'structure', 'visual']) {
    if (fg.checks[check] !== 'verified') errors.push(`Figma missing verified ${check}`)
  }
  if (rd.figma === 'FIGMA_READY' && fg.unverified.length > 0) errors.push('unverified Figma scope')
  return [...errors, ...figmaEvidenceErrors(fg, ev)]
}

function figmaEvidenceErrors(fg, ev) {
  const errors = []
  const kinds = new Set(fg.evidence_ids.filter((id) => ev.has(id)).map((id) => ev.get(id).kind))
  if (!kinds.has('figma_structure') || !kinds.has('figma_visual'))
    errors.push('Figma missing structure/visual evidence')
  const prototypeVerified = fg.checks.prototype === 'verified' && kinds.has('figma_prototype')
  if (fg.interaction_required && !prototypeVerified) errors.push('Figma missing prototype readback')
  if (!fg.interaction_required && fg.checks.prototype === 'not_run') {
    errors.push('static Figma prototype must be explicitly not_required')
  }
  return errors
}

function observationErrors(data) {
  const rd = data.readiness
  const kinds = new Set(data.evidence.map((e) => e.kind))
  const errors = OBSERVED_DIMENSIONS.filter(([dim, status, kind]) => rd[dim] === status && !kinds.has(kind)).map(
    ([dim, , kind]) => `${dim} lacks ${kind}`,
  )
  if (['accepted', 'rejected'].includes(rd.user_acceptance) && !kinds.has('user_response')) {
    errors.push('acceptance lacks user response')
  }
  return errors
}

function interruptionErrors({ interruption_policy: ip }) {
  const errors = ip.resume_when_hidden ? ['cannot resume while hidden'] : []
  if (!ip.ads_enabled) return errors
  if (ip.independent_pause_reasons.length === 0) errors.push('ads need independent pause reasons')
  for (const key of ['reward_idempotency_key', 'decline_path']) {
    if (typeof ip[key] !== 'string' || !ip[key].trim()) errors.push(`ads require ${key}`)
  }
  return errors
}

function blockingIssueErrors({ readiness: rd, issues }) {
  const ready = {
    planning: rd.planning === 'PLAN_READY',
    figma: isFigmaReady(rd),
    rights: isFigmaReady(rd),
    playable: rd.playable === 'tested',
    usability: rd.usability === 'observed',
    fun: rd.fun === 'observed',
    business: rd.business === 'observed',
  }
  const blocking = issues.some((i) => i.status === 'open' && i.severity === 'blocking' && ready[i.scope])
  return blocking ? ['open blocking issue in ready scope'] : []
}

function artifactPathError(artifact, baseDir, checkFiles) {
  const rel = artifact.path
  if (path.isAbsolute(rel) || rel.split('/').includes('..') || rel.includes('\\')) return 'unsafe artifact path'
  if (!checkFiles) return null
  const root = realpathSync(baseDir)
  const target = path.join(root, rel)
  let resolved
  try {
    resolved = realpathSync(target)
  } catch {
    return `missing artifact: ${rel}`
  }
  if (!resolved.startsWith(root + path.sep)) return 'artifact symlink escape'
  return lstatSync(resolved).isFile() ? null : `missing artifact: ${rel}`
}

export function validateReport(data, baseDir, { checkFiles = true } = {}) {
  const ajv = new Ajv({ strict: false, allErrors: true })
  const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA, 'utf8')))
  if (!validate(data)) return validate.errors.map((e) => `schema${e.instancePath}: ${e.message}`)
  if (checkFiles && baseDir === undefined) return ['base_dir required']
  const collected = collectGroups(data)
  const ev = new Map(data.evidence.map((e) => [e.id, e]))
  return [
    ...crossReferenceErrors(data, collected),
    ...evidenceErrors(data, ev),
    ...planReadyErrors(data, collected.groups),
    ...figmaModeErrors(data),
    ...figmaReadyErrors(data, ev),
    ...observationErrors(data),
    ...interruptionErrors(data),
    ...blockingIssueErrors(data),
    ...data.artifacts.map((a) => artifactPathError(a, baseDir, checkFiles)).filter(Boolean),
  ]
}

function main(argv) {
  const manifest = argv[0]
  if (!manifest) {
    console.error('usage: validate-design.mjs <delivery.json>')
    return 2
  }
  let errors
  try {
    errors = validateReport(JSON.parse(readFileSync(manifest, 'utf8')), path.dirname(manifest))
  } catch (error) {
    console.error('ERROR:', error.message)
    return 2
  }
  for (const e of errors) console.log('FAIL:', e)
  if (errors.length > 0) return 1
  console.log('PASS: schema, local files, IDs, references and declared evidence/readiness consistency.')
  console.log(
    'NOT CHECKED: evidence truth, external links, tool execution, actual gameplay, usability, fun or business.',
  )
  return 0
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
