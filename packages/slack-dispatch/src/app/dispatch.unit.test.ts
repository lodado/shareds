import type { InteractDeps } from '../interact/interact'
import type { Store } from '../store/store'
import { afterEach, describe, expect, it } from 'vitest'
import { closeStore, listEvents, openStore } from '../store/store'
import { dispatchEnvelope } from './dispatch'

const OWNER = 'UOWNER'

const opened: Store[] = []
afterEach(() => {
  for (const store of opened.splice(0)) closeStore(store)
})

function deps(): { deps: InteractDeps; store: Store; posted: string[] } {
  const store = openStore(':memory:')
  opened.push(store)
  const posted: string[] = []
  return {
    store,
    posted,
    deps: {
      store,
      ownerId: OWNER,
      slack: {
        postMessage: (args) => {
          posted.push(args.text)
          return Promise.resolve({ channel: args.channel, ts: '1.1' })
        },
      },
      knownRepos: () => ['web-app'],
      splitPrompt: () => Promise.resolve({ tasks: [] }),
      checkGate: () => Promise.resolve({ ci: false, review: false, headOid: '' }),
      mergePr: () => Promise.resolve(),
      retriesLeft: () => true,
      abortWork: () => undefined,
      locks: new Set(),
    },
  }
}

describe('dispatchEnvelope as the router of Socket Mode messages', () => {
  it('to be a button click handled by the interaction handler', async () => {
    const h = deps()
    await dispatchEnvelope(h.deps, {
      envelopeId: 'e1',
      type: 'interactive',
      payload: { type: 'block_actions', user: { id: 'UOTHER' }, actions: [] },
    })
    expect(listEvents(h.store).map((event) => event.type)).toStrictEqual(['click_refused'])
  })

  it('to be a DM event handled by the message handler', async () => {
    const h = deps()
    await dispatchEnvelope(h.deps, {
      envelopeId: 'e2',
      type: 'events_api',
      payload: { event: { type: 'message', channel_type: 'im', user: OWNER, channel: 'D1', ts: '5.5', text: '대기' } },
    })
    expect(h.posted).toStrictEqual(['대기 중인 항목이 없어요.'])
  })

  it('to be logged and otherwise ignored for a type the bot does not use', async () => {
    const h = deps()
    await dispatchEnvelope(h.deps, { envelopeId: 'e3', type: 'slash_commands', payload: { command: '/x' } })
    expect(h.posted).toStrictEqual([])
    expect(listEvents(h.store)[0]).toMatchObject({ type: 'envelope_ignored', payload: '{"type":"slash_commands"}' })
  })
})
