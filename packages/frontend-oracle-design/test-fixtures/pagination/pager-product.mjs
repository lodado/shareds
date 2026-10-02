// Fixture product: the paging state an orders table holds. The generated oracle test runs this, not the Bend model.
// `volume` is the number of orders the server has; the page indicator moves at once, the rows only when the
// response for the page now requested arrives.

export function initialPager(volume) {
  return { page: 1, rowsPage: 1, volume }
}

export function reducePager(state, event) {
  if (event.type === 'goTo') return { ...state, page: event.page }
  if (event.type === 'arrive' && event.page === state.page) return { ...state, rowsPage: event.page }
  return state
}

/** Mutant: an empty response always replaces the rows, even one for an older request. */
export function reducePagerApplyingEmpty(state, event) {
  if (event.type === 'arrive' && state.volume === 0) return { ...state, rowsPage: event.page }
  return reducePager(state, event)
}
