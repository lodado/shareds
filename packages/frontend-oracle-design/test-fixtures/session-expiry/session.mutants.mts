// A wrong session the generated oracle test must reject: it compares with `>` instead of `>=`, so a
// submit at exactly SESSION_MS still issues a payment request.

import { type Clock, SESSION_MS, type SessionState } from './session.mts'

export function submitOffByOne(state: SessionState, clock: Clock): SessionState {
  if (clock.now() - state.startedAt > SESSION_MS) return state
  return { ...state, paymentRequests: state.paymentRequests + 1 }
}
