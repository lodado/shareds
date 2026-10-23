// Projection boundary between the Bend model and decide()/nextStage() in ../../machine.ts. The model's
// values arrive in the compiled Bend shape (`{$: <constructor>, ...fields}`); only this file converts them.
// An unmapped event, card, flag, reason or stage throws — an adapter that guesses would turn a harness gap
// into a pass.
//
// The product state here is the stage plus how the last event ended, so the model's outcome (moved, stayed,
// refused and why) is compared with the product's, not only the stage.

import { decide, INITIAL_STAGE, nextStage } from '../../machine.ts'

const STAGES = {
  Ingested: 'ingested',
  Notified: 'notified',
  Planning: 'planning',
  Planned: 'planned',
  Implementing: 'implementing',
  PrOpen: 'pr_open',
  Merged: 'merged',
  Skipped: 'skipped',
  Declined: 'declined',
  Failed: 'failed',
}

const CARDS = { Assign: 'assign', Plan: 'plan' }

const REASONS = {
  NotOwner: 'not_owner',
  Finished: 'finished',
  WrongStage: 'wrong_stage',
  Stale: 'stale',
  GateNotMet: 'gate_not_met',
}

const lookup = (table, model, what) => {
  const mapped = table[model?.$]
  if (!mapped) throw new Error(`unmapped model ${what} ${JSON.stringify(model)}`)
  return mapped
}

const flag = (value, field) => {
  if (typeof value !== 'boolean') throw new Error(`unmapped model flag ${field}: ${JSON.stringify(value)}`)
  return value
}

const nameOf = (table, value, what) => {
  const name = Object.keys(table).find((key) => table[key] === value)
  if (!name) throw new Error(`unmapped product ${what} ${JSON.stringify(value)}`)
  return name
}

const EVENTS = {
  Triage: (m) => ({ type: 'triage', handled: flag(m.handled, 'handled'), confident: flag(m.confident, 'confident') }),
  Approve: (m) => ({
    type: 'approve',
    owner: flag(m.owner, 'owner'),
    card: lookup(CARDS, m.card, 'card'),
    fresh: flag(m.fresh, 'fresh'),
  }),
  Reject: (m) => ({ type: 'reject', owner: flag(m.owner, 'owner') }),
  Revise: (m) => ({ type: 'revise', owner: flag(m.owner, 'owner') }),
  PlanReady: (m) => ({ type: 'plan_ready', current: flag(m.current, 'current') }),
  Built: (m) => ({ type: 'built', ok: flag(m.ok, 'ok') }),
  Merge: (m) => ({
    type: 'merge',
    owner: flag(m.owner, 'owner'),
    ci: flag(m.ci, 'ci'),
    review: flag(m.review, 'review'),
  }),
  Retry: (m) => ({ type: 'retry', owner: flag(m.owner, 'owner'), allowed: flag(m.allowed, 'allowed') }),
  Abort: () => ({ type: 'abort' }),
}

// How the last event ended, as the product reports it: began | moved | stayed | { refused: reason }.
const lastFromModel = (last) => {
  switch (last?.$) {
    case 'Began':
      return 'began'
    case 'Moved':
      return 'moved'
    case 'Stayed':
      return 'stayed'
    case 'Refused':
      return { refused: lookup(REASONS, last.why, 'reason') }
    default:
      throw new Error(`unmapped model last ${JSON.stringify(last)}`)
  }
}

const lastToModel = (last) => {
  if (last === 'began') return { $: 'Began' }
  if (last === 'moved') return { $: 'Moved' }
  if (last === 'stayed') return { $: 'Stayed' }
  if (last && typeof last === 'object' && 'refused' in last) {
    return { $: 'Refused', why: { $: nameOf(REASONS, last.refused, 'reason') } }
  }
  throw new Error(`unmapped product last ${JSON.stringify(last)}`)
}

const lastOfOutcome = (outcome) => {
  switch (outcome.kind) {
    case 'moved':
      return 'moved'
    case 'stayed':
      return 'stayed'
    case 'refused':
      return { refused: outcome.reason }
    default:
      throw new Error(`unmapped product outcome ${JSON.stringify(outcome)}`)
  }
}

export function concretize(model) {
  if (model?.$ !== 'Item') throw new Error(`unmapped model state ${JSON.stringify(model)}`)
  return { stage: lookup(STAGES, model.stage, 'stage'), last: lastFromModel(model.last) }
}

export function init() {
  return { stage: INITIAL_STAGE, last: 'began' }
}

export function step(state, message) {
  const toEvent = EVENTS[message?.$]
  if (!toEvent) throw new Error(`unmapped model event ${JSON.stringify(message)}`)
  const outcome = decide(state.stage, toEvent(message))
  return { stage: nextStage(state.stage, outcome), last: lastOfOutcome(outcome) }
}

export function observe(state) {
  return { $: 'Item', stage: { $: nameOf(STAGES, state.stage, 'stage') }, last: lastToModel(state.last) }
}

export const project = observe
