// Projection boundary between the Bend model and runTransition() in ../../run.ts. The model's Stage and
// Msg values arrive in the compiled Bend shape (`{$: <constructor>, ...fields}`); only this file converts
// them. An unmapped event, flag or state throws — an adapter that guesses would turn a harness gap into a
// pass.

import { INITIAL_RUN_STATE, runTransition } from '../../run.ts'

const STATES = {
  Requested: 'requested',
  Running: 'running',
  Succeeded: 'succeeded',
  Failed: 'failed',
  Rejected: 'rejected',
}

const flag = (value, field) => {
  if (typeof value !== 'boolean') throw new Error(`unmapped model flag ${field}: ${JSON.stringify(value)}`)
  return value
}

const EVENTS = {
  Start: (m) => ({
    type: 'start',
    registered: flag(m.registered, 'registered'),
    allowed: flag(m.allowed, 'allowed'),
    valid: flag(m.valid, 'valid'),
    free: flag(m.free, 'free'),
  }),
  Finish: (m) => ({ type: 'finish', ok: flag(m.ok, 'ok'), valid: flag(m.valid, 'valid') }),
  Cancel: () => ({ type: 'cancel' }),
}

const toState = (model) => {
  const state = STATES[model?.$]
  if (!state) throw new Error(`unmapped model stage ${JSON.stringify(model)}`)
  return state
}

export function concretize(model) {
  return toState(model)
}

export function init() {
  return INITIAL_RUN_STATE
}

export function step(state, message) {
  const toEvent = EVENTS[message?.$]
  if (!toEvent) throw new Error(`unmapped model event ${JSON.stringify(message)}`)
  return runTransition(state, toEvent(message))
}

export function observe(state) {
  const name = Object.keys(STATES).find((key) => STATES[key] === state)
  if (!name) throw new Error(`unmapped product state ${JSON.stringify(state)}`)
  return { $: name }
}

export const project = observe
