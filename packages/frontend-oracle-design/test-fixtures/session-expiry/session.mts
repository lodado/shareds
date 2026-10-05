// Fixture product code: a checkout session that expires after SESSION_MS of wall-clock time. The
// generated oracle test runs this, not the Bend model. The clock is injected so the adapter can advance
// it by the source constant instead of sleeping.

export const SESSION_MS = 30 * 60 * 1000

export type Clock = { now(): number }
export type SessionState = { readonly startedAt: number; readonly paymentRequests: number }
export const systemClock: Clock = { now: () => Date.now() }

export function submit(state: SessionState, clock: Clock = systemClock): SessionState {
  if (clock.now() - state.startedAt >= SESSION_MS) return state
  return { ...state, paymentRequests: state.paymentRequests + 1 }
}
