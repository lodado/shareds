// Wrong document stores the world conformance check must reject.

import type { Client, Save, Server } from './doc-store.mts'

/** Checks permission at submit only, so a revocation in flight still commits. */
export const saveCheckingAtSubmit: Save = (server, client, { revokeBeforeCommit }) => {
  if (!server.editors.has(client.editor)) return { ...client, saved: false }
  if (revokeBeforeCommit) server.editors.delete(client.editor)
  server.version = client.draft
  return { ...client, saved: true }
}

/** Shows "Saved" as soon as the request is sent, whatever the server did. */
export const saveAcknowledgingEarly: Save = (server, client, { revokeBeforeCommit }) => {
  if (!server.editors.has(client.editor)) return { ...client, saved: true }
  if (revokeBeforeCommit) server.editors.delete(client.editor)
  const committed = server.editors.has(client.editor)
  if (committed) server.version = client.draft
  return { ...client, saved: true }
}

/** Reloads from a client cache filled before the save. */
export function reloadFromCache(server: Server, client: Client): string {
  return client.cache ?? server.version
}

export function withStaleCache(client: Client, server: Server): Client {
  return { ...client, cache: server.version }
}
