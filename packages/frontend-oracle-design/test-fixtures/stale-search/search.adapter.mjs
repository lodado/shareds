// Observation adapter between the Bend model and a search reducer. Its semantic contract is the card's
// Observation line: the observation is the request id whose results are displayed, 0 when none.
// Unknown events and unmapped states throw — an adapter that guesses would turn a harness gap into a pass.

import { initialSearch, reduceSearch } from './search-reducer.mts'

export function adapterFor(reduce, initial) {
  return {
    init: () => initial,
    step(state, event) {
      if (event.$ === 'Issue') return reduce(state, { type: 'issue' })
      if (event.$ === 'Respond' && Number.isInteger(event.id)) {
        return reduce(state, { type: 'respond', requestId: event.id, items: [`result ${event.id}`] })
      }
      throw new Error(`unmapped model event ${JSON.stringify(event)}`)
    },
    observe(state) {
      if (state?.results === null) return 0
      const requestId = state?.results?.requestId
      if (!Number.isInteger(requestId) || requestId < 1)
        throw new Error(`unmapped reducer state ${JSON.stringify(state)}`)
      return requestId
    },
  }
}

// The product reducer, for `oracle-model.mjs conform --impl search.adapter.mjs`.
export const { init, step, observe } = adapterFor(reduceSearch, initialSearch)
