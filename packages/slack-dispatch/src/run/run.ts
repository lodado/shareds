// Lifecycle of one script run. A pure function, so the server can replay any event any number of times.
// __test__/formal holds the Bend model: its laws are proven about the model, and the generated tests
// compare this function with it.
//
// Callers build events from the admission checks and the process result, so every flag is a real boolean.
// The flags are still compared with `=== true`: anything else counts as false, so a malformed event
// fails closed.

export type RunState = 'requested' | 'running' | 'succeeded' | 'failed' | 'rejected'

// Listing every state here makes the compiler refuse a state that is added to the type but not to the list.
const RUN_STATE_FLAGS: Record<RunState, true> = {
  requested: true,
  running: true,
  succeeded: true,
  failed: true,
  rejected: true,
}

// In lifecycle order.
export const RUN_STATES: readonly RunState[] = Object.keys(RUN_STATE_FLAGS).filter(isRunState)

export function isRunState(value: unknown): value is RunState {
  return typeof value === 'string' && Object.hasOwn(RUN_STATE_FLAGS, value)
}

// Readonly, so a transition can never change the event it was given and a replay sees the same event.
export type RunEvent = Readonly<
  | { type: 'start'; registered: boolean; allowed: boolean; valid: boolean; free: boolean }
  | { type: 'finish'; ok: boolean; valid: boolean }
  | { type: 'cancel' }
>

export const INITIAL_RUN_STATE: RunState = 'requested'

const isAdmitted = (event: Extract<RunEvent, { type: 'start' }>): boolean =>
  event.registered === true && event.allowed === true && event.valid === true && event.free === true

const finishedCleanly = (event: Extract<RunEvent, { type: 'finish' }>): boolean =>
  event.ok === true && event.valid === true

function whileRequested(state: RunState, event: RunEvent): RunState {
  // A cancel before the start means it must never start, so the run is rejected.
  if (event.type === 'cancel') return 'rejected'
  if (event.type !== 'start') return state
  return isAdmitted(event) ? 'running' : 'rejected'
}

function whileRunning(state: RunState, event: RunEvent): RunState {
  if (event.type === 'cancel') return 'failed'
  if (event.type === 'finish') return finishedCleanly(event) ? 'succeeded' : 'failed'
  return state
}

function unknownState(state: never): never {
  throw new Error(`unknown run state ${JSON.stringify(state)}`)
}

export function runTransition(state: RunState, event: RunEvent): RunState {
  switch (state) {
    case 'requested':
      return whileRequested(state, event)
    case 'running':
      return whileRunning(state, event)
    case 'succeeded':
    case 'failed':
    case 'rejected':
      return state
  }
  return unknownState(state)
}
