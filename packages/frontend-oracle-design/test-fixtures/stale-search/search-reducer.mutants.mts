// Deliberately wrong reducers. The conformance check must reject each one without any change to the
// model, the laws or the generated expectations.

import type { SearchEvent, SearchState } from './search-reducer.mts'

/** Drops the stale-response check: every response is shown. */
export function reduceWithoutStaleCheck(state: SearchState, event: SearchEvent): SearchState {
  if (event.type === 'issue') return { ...state, latestRequestId: state.latestRequestId + 1 }
  return { ...state, results: { requestId: event.requestId, items: event.items } }
}

/** Ignores every response: passes the stale-response law and nothing else. */
export function reduceIgnoringResponses(state: SearchState, event: SearchEvent): SearchState {
  if (event.type === 'issue') return { ...state, latestRequestId: state.latestRequestId + 1 }
  return state
}

/** Shows the previous request's result instead of the latest one. */
export function reduceShowingPrevious(state: SearchState, event: SearchEvent): SearchState {
  if (event.type === 'issue') return { ...state, latestRequestId: state.latestRequestId + 1 }
  if (event.requestId !== state.latestRequestId - 1) return state
  return { ...state, results: { requestId: event.requestId, items: event.items } }
}
