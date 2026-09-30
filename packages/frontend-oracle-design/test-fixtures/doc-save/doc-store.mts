// Fixture product code: a document store with a server that checks edit permission when it commits
// and a client that shows "Saved" and reloads. The world conformance check runs this, not the Bend
// world. `revokeBeforeCommit` stands for a permission change that lands while the request is in flight.

export type Server = { version: string; editors: Set<string> }
export type Client = { editor: string; draft: string; saved: boolean; cache: string | null }
export type Save = (server: Server, client: Client, options: { revokeBeforeCommit: boolean }) => Client

export function createServer(version: string, editors: readonly string[]): Server {
  return { version, editors: new Set(editors) }
}

export function createClient(editor: string, draft: string): Client {
  return { editor, draft, saved: false, cache: null }
}

/** The server applies the draft only if the editor still holds permission when it commits. */
function commit(server: Server, editor: string, draft: string): boolean {
  if (!server.editors.has(editor)) return false
  server.version = draft
  return true
}

export const save: Save = (server, client, { revokeBeforeCommit }) => {
  if (!server.editors.has(client.editor)) return { ...client, saved: false }
  if (revokeBeforeCommit) server.editors.delete(client.editor)
  const committed = commit(server, client.editor, client.draft)
  return { ...client, saved: committed }
}

/** A reload reads the server. */
export function reload(server: Server, _client: Client): string {
  return server.version
}
