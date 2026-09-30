// World adapter between World.bend and the document store. It sets the coordinates the way the card's
// Terms Path says (T1: the server is created with or without the editor's permission; T2: the server
// revokes after its own permission check, before it commits), runs one save and a reload, and reads the
// observations through the product's own paths — the server version (T3: GET /documents/1), the "Saved"
// flag (T4) and the reloaded text (T5).
// A coordinate setting the product cannot build throws; an adapter that guesses would hide a harness gap.

import { createClient, createServer, reload, save } from './doc-store.mts'
import { reloadFromCache, saveAcknowledgingEarly, saveCheckingAtSubmit, withStaleCache } from './doc-store.mutants.mts'

const OLD = 'old text'
const NEW = 'new text'

export function adapterFor({ saveWith = save, reloadWith = reload, prepare = (client) => client } = {}) {
  return {
    run({ start, held }) {
      if (held && !start) throw new Error('permission regained in flight is not a setting this store can build')
      const server = createServer(OLD, start ? ['editor'] : [])
      const client = prepare(createClient('editor', NEW), server)
      const after = saveWith(server, client, { revokeBeforeCommit: start && !held })
      return { committed: server.version === NEW, ack: after.saved, reload: reloadWith(server, after) === NEW }
    },
  }
}

export const { run } = adapterFor()
export const mutants = {
  checkingAtSubmit: adapterFor({ saveWith: saveCheckingAtSubmit }),
  acknowledgingEarly: adapterFor({ saveWith: saveAcknowledgingEarly }),
  reloadingFromCache: adapterFor({ reloadWith: reloadFromCache, prepare: withStaleCache }),
}
