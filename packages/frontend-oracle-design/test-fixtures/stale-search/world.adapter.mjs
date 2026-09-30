// World adapter between World.bend (the Race record) and the search reducer, for
// `oracle-adequacy.mjs conform --package oracle.package.json`. It sets the coordinates the way the terms'
// Path says (T1: which response the adapter delivers first; T2: whether response 2 is delivered at all),
// drives the reducer through search.adapter's step, and reads both observations through search.adapter's
// observe — the request id the list shows — after every event from the second issue on (T4) and at the end
// (T3). It computes no expected value and re-implements no reducer logic; an unknown setting throws.

import { adapterFor } from './search.adapter.mjs'
import { initialSearch, reduceSearch } from './search-reducer.mts'
import { reduceIgnoringResponses, reduceShowingPrevious, reduceWithoutStaleCheck } from './search-reducer.mutants.mts'

const SHOWN = { 0: 'NoneShown', 1: 'OldShown', 2: 'NewShown' }

export function worldAdapterFor(search) {
  return {
    run({ arrival, newAnswers }) {
      if (!['OldFirst', 'NewFirst'].includes(arrival) || typeof newAnswers !== 'boolean')
        throw new Error(`unmapped coordinates ${JSON.stringify({ arrival, newAnswers })}`)
      const responses = newAnswers ? (arrival === 'OldFirst' ? [1, 2] : [2, 1]) : [1]
      const events = [{ $: 'Issue' }, { $: 'Issue' }, ...responses.map((id) => ({ $: 'Respond', id }))]
      let state = search.init()
      const seen = []
      for (const [index, event] of events.entries()) {
        state = search.step(state, event)
        if (index >= 1) seen.push(search.observe(state))
      }
      const final = SHOWN[seen.at(-1)]
      if (!final) throw new Error(`unmapped observation ${seen.at(-1)}`)
      return { final, oldShown: seen.includes(1) }
    },
  }
}

export const { run } = worldAdapterFor(adapterFor(reduceSearch, initialSearch))
export const mutants = {
  withoutStaleCheck: worldAdapterFor(adapterFor(reduceWithoutStaleCheck, initialSearch)),
  ignoringResponses: worldAdapterFor(adapterFor(reduceIgnoringResponses, initialSearch)),
  showingPrevious: worldAdapterFor(adapterFor(reduceShowingPrevious, initialSearch)),
}
