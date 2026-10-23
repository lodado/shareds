// Sends each Socket Mode envelope to the handler that knows it. Envelope types this bot does not use are ignored.

import type { InteractDeps } from '../interact/interact.ts'
import type { SocketEnvelope } from '../socket/socket.ts'
import { handleInteractive, handleMessage } from '../interact/interact.ts'
import { logEvent } from '../store/store.ts'

export async function dispatchEnvelope(deps: InteractDeps, envelope: SocketEnvelope): Promise<void> {
  switch (envelope.type) {
    case 'interactive':
      await handleInteractive(deps, envelope.payload)
      return
    case 'events_api':
      await handleMessage(deps, envelope.payload)
      return
    default:
      logEvent(deps.store, { kind: 'inbound', type: 'envelope_ignored', payload: { type: envelope.type } })
  }
}
