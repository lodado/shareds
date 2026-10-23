import type { ItemEvent, Stage } from '../machine/machine'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { INITIAL_STAGE, transition } from '../machine/machine'
import { applyEvent, closeStore, createItems, getItem, itemKeyOf, listEvents, openStore } from './store'

const THREAD = 'slack:C1:1730000000.000100'
const REPOS = ['web-app', 'api-server', 'docs'] as const
const bools = [true, false]

// Every event the machine knows, with every combination of its flags.
const EVENTS: readonly ItemEvent[] = [
  ...bools.flatMap((handled) => bools.map((confident): ItemEvent => ({ type: 'triage', handled, confident }))),
  ...bools.flatMap((owner) =>
    bools.flatMap((fresh) =>
      (['assign', 'plan'] as const).map((card): ItemEvent => ({ type: 'approve', owner, card, fresh })),
    ),
  ),
  ...bools.map((owner): ItemEvent => ({ type: 'reject', owner })),
  ...bools.map((owner): ItemEvent => ({ type: 'revise', owner })),
  ...bools.map((current): ItemEvent => ({ type: 'plan_ready', current })),
  ...bools.map((ok): ItemEvent => ({ type: 'built', ok })),
  ...bools.flatMap((owner) =>
    bools.flatMap((ci) => bools.map((review): ItemEvent => ({ type: 'merge', owner, ci, review }))),
  ),
  ...bools.flatMap((owner) => bools.map((allowed): ItemEvent => ({ type: 'retry', owner, allowed }))),
  { type: 'abort' },
]

const aStep = fc.record({ repo: fc.constantFrom(...REPOS), event: fc.constantFrom(...EVENTS) })

describe('applyEvent as events of several items arriving in any order', () => {
  it('to be the same stage per item as folding only that item events, in order', () => {
    fc.assert(
      fc.property(fc.array(aStep, { maxLength: 40 }), (steps) => {
        const store = openStore(':memory:')
        try {
          createItems(store, THREAD, REPOS)
          for (const { repo, event } of steps) applyEvent(store, itemKeyOf(THREAD, repo), event)
          for (const repo of REPOS) {
            const own = steps.filter((step) => step.repo === repo).map((step) => step.event)
            const expected = own.reduce<Stage>((stage, event) => transition(stage, event), INITIAL_STAGE)
            expect(getItem(store, itemKeyOf(THREAD, repo))?.stage).toBe(expected)
          }
        } finally {
          closeStore(store)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('to be one log row per event, per item in the order sent, and no row lost', () => {
    fc.assert(
      fc.property(fc.array(aStep, { maxLength: 40 }), (steps) => {
        const store = openStore(':memory:')
        try {
          createItems(store, THREAD, REPOS)
          for (const { repo, event } of steps) applyEvent(store, itemKeyOf(THREAD, repo), event)
          for (const repo of REPOS) {
            const logged = listEvents(store, { itemKey: itemKeyOf(THREAD, repo), limit: 1000 })
              .filter((row) => row.kind === 'item_event')
              .map((row) => row.payload)
            const sent = steps.filter((step) => step.repo === repo).map((step) => JSON.stringify(step.event))
            expect(logged).toEqual(sent)
          }
          expect(listEvents(store, { limit: 1000 })).toHaveLength(REPOS.length + steps.length)
        } finally {
          closeStore(store)
        }
      }),
      { numRuns: 200 },
    )
  })
})
