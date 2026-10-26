import { join, resolve } from 'node:path'
import { readJson, readJsonl } from './store.mjs'

export const FILES = {
  run: 'run.json',
  screens: 'screens.json',
  transitions: 'transitions.json',
  observations: 'observations.jsonl',
  gates: 'gates.jsonl',
  features: 'features.json',
  policies: 'policies.json',
}

export const PLATFORMS = ['ios', 'android', 'web']
export const SCOPES = ['all', 'onboarding', 'auth', 'payment', 'custom']
export const MODES = ['public', 'interactive', 'static']

// A gate is consumed when an observation cites it, so the observation line is the only commit record.
function withConsumption(gates, observations) {
  const byGate = new Map(observations.filter((o) => o.gateId).map((o) => [o.gateId, o.id]))
  return gates.map((gate) => ({ ...gate, consumedBy: byGate.get(gate.gateId) }))
}

export async function loadRun(runDir) {
  const dir = resolve(runDir)
  const run = await readJson(join(dir, FILES.run))
  const [screens, transitions, observations, gateEntries] = await Promise.all([
    readJson(join(dir, FILES.screens), { screens: [] }),
    readJson(join(dir, FILES.transitions), { transitions: [] }),
    readJsonl(join(dir, FILES.observations)),
    readJsonl(join(dir, FILES.gates)),
  ])
  return {
    dir,
    run,
    screens: screens.screens,
    transitions: transitions.transitions,
    observations,
    gateEntries,
    gates: withConsumption(
      gateEntries.filter((entry) => entry.kind === 'gate'),
      observations,
    ),
  }
}

/** The newest allowing receipt, if no observation has used it yet. */
export function pendingGate(state) {
  const latest = state.gates.findLast((gate) => gate.decision === 'allow')
  if (!latest || latest.consumedBy) return null
  return latest
}

/**
 * Actions that spent budget: observed actions, receipts that were issued and then replaced without being
 * observed, and every relaunch after the first screen.
 */
export function usedActions(state) {
  const observed = state.observations.filter((observation) => !observation.anchor).length
  const relaunches = Math.max(0, state.observations.filter((observation) => observation.anchor).length - 1)
  const pending = pendingGate(state)
  const abandoned = state.gates.filter(
    (gate) => gate.decision === 'allow' && !gate.consumedBy && gate !== pending,
  ).length
  return observed + relaunches + abandoned
}

export function currentScreen(state) {
  const last = state.observations.at(-1)
  if (!last) throw new Error('Run has no observation yet; record the first screen with `observe --anchor`.')
  return state.screens.find((screen) => screen.id === last.screenId)
}

/** One entry per blocked (screen, action); a retry with the missing context does not keep the old block. */
export function blockedGates(state) {
  const seen = new Set()
  return state.gates.filter((gate, index) => {
    if (gate.decision !== 'blocked') return false
    const key = `${gate.screenId}|${gate.actionKey}`
    const retried = state.gates.some(
      (later, laterIndex) =>
        laterIndex > index && later.decision === 'allow' && `${later.screenId}|${later.actionKey}` === key,
    )
    if (retried || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Keys of `screenId|actionKey` pairs already executed or formally blocked. */
export function handledKeys(state) {
  const settled = state.gates.filter(
    (gate) => gate.consumedBy || (gate.decision === 'blocked' && gate.category !== 'context-required'),
  )
  return new Set(settled.map((gate) => `${gate.screenId}|${gate.actionKey}`))
}

export const unexploredOf = (state, screen, handled = handledKeys(state)) =>
  screen.candidates.filter((candidate) => !handled.has(`${screen.id}|${candidate.key}`))

/** Structural problems a half-finished write leaves behind. Empty when the run is consistent. */
export function findInconsistencies(state) {
  const observations = new Set(state.observations.map((observation) => observation.id))
  const problems = []
  for (const screen of state.screens) {
    const refs = [
      screen.firstObservation,
      screen.parent?.observationId,
      ...screen.states.map((item) => item.firstObservation),
    ]
    for (const ref of refs.filter(Boolean)) {
      if (!observations.has(ref))
        problems.push({ where: screen.id, message: `screen references missing observation ${ref}` })
    }
  }
  for (const transition of state.transitions) {
    for (const ref of transition.observationIds) {
      if (!observations.has(ref))
        problems.push({ where: transition.id, message: `transition cites missing observation ${ref}` })
    }
  }
  return problems
}

export function assertConsistent(state) {
  const [first] = findInconsistencies(state)
  if (first) {
    throw new Error(
      `Run state is inconsistent (${first.where}: ${first.message}); an earlier command was interrupted. Repair or start a new run.`,
    )
  }
}
