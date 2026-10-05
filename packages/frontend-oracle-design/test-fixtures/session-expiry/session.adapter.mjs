// Projection boundary between the Bend model and the session product. Time is an event in the model; the
// duration lives only here: `Expire` advances the injected clock by the source constant SESSION_MS, never
// by sleeping. An expired model state starts exactly at the boundary, so `>=` versus `>` is observable.
// An unmapped command throws — an adapter that guesses would turn a harness gap into a pass.

import { SESSION_MS, submit } from './session.mts'
import { submitOffByOne } from './session.mutants.mts'

export function adapterFor(submitWith) {
  const COMMANDS = {
    Submit(world) {
      const session = submitWith(world.session, { now: () => world.now })
      return { ...world, session, sent: session.paymentRequests - world.session.paymentRequests === 1 }
    },
    Expire: (world) => ({ ...world, now: world.now + SESSION_MS, sent: false }),
  }
  return {
    concretize: (state) => ({
      session: { startedAt: 0, paymentRequests: state.sent ? 1 : 0 },
      now: state.expired ? SESSION_MS : 0,
      sent: state.sent,
    }),
    step(world, command) {
      const apply = COMMANDS[command.$]
      if (!apply) throw new Error(`unmapped model command ${JSON.stringify(command)}`)
      return apply(world)
    },
    project: (world) => ({
      $: 'Session',
      expired: world.now - world.session.startedAt >= SESSION_MS,
      sent: world.sent,
    }),
  }
}

export const { concretize, step, project } = adapterFor(submit)
export const mutants = { offByOne: adapterFor(submitOffByOne) }
