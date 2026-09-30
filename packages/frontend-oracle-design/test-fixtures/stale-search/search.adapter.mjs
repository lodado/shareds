// Observation adapter between the Bend model and a search reducer. Its semantic contract is the card's
// Observation line: the observation is the request id whose results are displayed, 0 when none.
// Unknown events and unmapped states throw — an adapter that guesses would turn a harness gap into a pass.

import { initialSearch, reduceSearch } from './search-reducer.mts'

// The harness delivers these results with response `id` — the world adapter reads them back from the product.
export const itemsFor = (id) => [`result ${id}`]

export function adapterFor(reduce, initial) {
  return {
    init: () => initial,
    step(state, event) {
      if (event.$ === 'Issue') return reduce(state, { type: 'issue' })
      if (event.$ === 'Respond' && Number.isInteger(event.id)) {
        return reduce(state, { type: 'respond', requestId: event.id, items: itemsFor(event.id) })
      }
      throw new Error(`unmapped model event ${JSON.stringify(event)}`)
    },
    // The world adapter delivers a response with the results it chose (T7, T8: an empty list); the model's
    // events carry no results, so step always delivers itemsFor(id).
    respond(state, id, items) {
      if (!Number.isInteger(id) || !Array.isArray(items))
        throw new Error(`unmapped delivery ${JSON.stringify({ id, items })}`)
      return reduce(state, { type: 'respond', requestId: id, items })
    },
    observe(state) {
      if (state?.results === null) return 0
      const requestId = state?.results?.requestId
      if (!Number.isInteger(requestId) || requestId < 1)
        throw new Error(`unmapped reducer state ${JSON.stringify(state)}`)
      return requestId
    },
    // the whole reducer state, for the projection residue report — never compared, only diffed
    snapshot: (state) => state,
  }
}

// The product reducer, for `oracle-model.mjs conform --impl search.adapter.mjs`.
export const { init, step, observe, snapshot } = adapterFor(reduceSearch, initialSearch)
