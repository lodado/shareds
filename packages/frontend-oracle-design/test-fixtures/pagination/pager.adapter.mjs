// Projection boundary between the paging model and the fixture product — the one hand-written piece of the
// generated test. init takes the world coordinates of a joint case: the volume sets the server fixture; entry and
// the page parameter open on page 1 in this fixture. Without coordinates it uses a full first page.

import { initialPager, reducePager } from './pager-product.mjs'

const VOLUME = { Empty: 0, One: 1, Full: 20, FullPlusOne: 21 }
const PAGE = { P1: 1, P2: 2, P3: 3 }
const NAME = { 1: 'P1', 2: 'P2', 3: 'P3' }

export function adapterFor(reduce) {
  return {
    init: (coordinates) => initialPager(VOLUME[coordinates?.volume ?? 'Full']),
    step(state, event) {
      if (event.$ === 'GoTo') return reduce(state, { type: 'goTo', page: PAGE[event.pg.$] })
      if (event.$ === 'Arrive') return reduce(state, { type: 'arrive', page: PAGE[event.pg.$] })
      throw new Error(`unmapped model event ${JSON.stringify(event)}`)
    },
    observe: (state) => ({ $: 'Grid', page: { $: NAME[state.page] }, rows: { $: NAME[state.rowsPage] } }),
  }
}

export const { init, step, observe } = adapterFor(reducePager)
