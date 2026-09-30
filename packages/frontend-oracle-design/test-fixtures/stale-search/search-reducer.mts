// Fixture product code: the pure search-state transition a search box would call from its event
// handlers. The conformance check runs this, not the Bend model.

export type SearchResults = { readonly requestId: number; readonly items: readonly string[] }
export type SearchState = { readonly latestRequestId: number; readonly results: SearchResults | null }
export type SearchEvent =
  | { readonly type: 'issue' }
  | { readonly type: 'respond'; readonly requestId: number; readonly items: readonly string[] }

export const initialSearch: SearchState = { latestRequestId: 0, results: null }

export function reduceSearch(state: SearchState, event: SearchEvent): SearchState {
  if (event.type === 'issue') return { ...state, latestRequestId: state.latestRequestId + 1 }
  if (event.requestId !== state.latestRequestId) return state
  return { ...state, results: { requestId: event.requestId, items: event.items } }
}
