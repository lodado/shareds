// World adapter between World.bend (the Race record, space v4) and the search reducer, for
// `oracle-adequacy.mjs conform --package oracle.package.json`. It sets the coordinates the way the terms'
// Path says — T1: when response 1 arrives (before request 2 is issued, or after it and before or after
// response 2); T2: whether response 2 is delivered at all; T7, T8: whether response 1 or 2 carries an empty
// result list; T9: whether eight earlier requests, never answered, come first so the attempt's requests are
// 9 and 10 — drives the reducer through search.adapter, and reads the observations after every event: the
// request id the list shows (search.adapter observe) for T3 and T4, and the shown results (search.adapter
// snapshot) against the results the harness itself delivered with that response for T6 — the test's own
// input, not a model value. It computes no expected value and re-implements no reducer logic; an unknown
// setting or an id outside the attempt throws.

import { isDeepStrictEqual } from 'node:util'
import { adapterFor, itemsFor } from './search.adapter.mjs'
import { initialSearch, reduceSearch } from './search-reducer.mts'
import { reduceIgnoringResponses, reduceShowingPrevious, reduceWithoutStaleCheck } from './search-reducer.mutants.mts'

const ARRIVALS = ['OldFirst', 'NewFirst', 'OldEarly']
const EARLIER = 8

export function worldAdapterFor(search) {
  return {
    run({ arrival, newAnswers, oldEmpty, newEmpty, longSession }) {
      const flags = [newAnswers, oldEmpty, newEmpty, longSession]
      if (!ARRIVALS.includes(arrival) || flags.some((value) => typeof value !== 'boolean'))
        throw new Error(
          `unmapped coordinates ${JSON.stringify({ arrival, newAnswers, oldEmpty, newEmpty, longSession })}`,
        )
      const older = longSession ? EARLIER + 1 : 1
      const newer = older + 1
      const shownAs = new Map([
        [0, 'NoneShown'],
        [older, 'OldShown'],
        [newer, 'NewShown'],
      ])
      const delivered = new Map([
        [older, oldEmpty ? [] : itemsFor(older)],
        [newer, newEmpty ? [] : itemsFor(newer)],
      ])
      const late = newAnswers ? (arrival === 'NewFirst' ? [newer, older] : [older, newer]) : [older]
      const attempt =
        arrival === 'OldEarly' ? ['issue', older, 'issue', ...(newAnswers ? [newer] : [])] : ['issue', 'issue', ...late]
      let state = search.init()
      for (let index = 0; index < older - 1; index += 1) state = search.step(state, { $: 'Issue' })
      let issued = 0
      let lateOld = false
      let oldShown = false
      let itemsIntact = true
      let shownId = search.observe(state)
      for (const event of attempt) {
        if (event === 'issue') {
          state = search.step(state, { $: 'Issue' })
          issued += 1
        } else {
          state = search.respond(state, event, delivered.get(event))
          // T4 counts response 1 only when it arrives after request 2 was issued; before that it is the latest
          if (event === older && issued === 2) lateOld = true
        }
        shownId = search.observe(state)
        if (lateOld && shownId === older) oldShown = true
        const shown = search.snapshot(state).results
        // nothing shown: no results can be wrong (T6)
        if (shown !== null && !isDeepStrictEqual(shown.items, delivered.get(shown.requestId))) itemsIntact = false
      }
      const final = shownAs.get(shownId)
      if (!final) throw new Error(`unmapped observation ${shownId}`)
      return { final, oldShown, itemsIntact }
    },
  }
}

export const { run } = worldAdapterFor(adapterFor(reduceSearch, initialSearch))
export const mutants = {
  withoutStaleCheck: worldAdapterFor(adapterFor(reduceWithoutStaleCheck, initialSearch)),
  ignoringResponses: worldAdapterFor(adapterFor(reduceIgnoringResponses, initialSearch)),
  showingPrevious: worldAdapterFor(adapterFor(reduceShowingPrevious, initialSearch)),
}
