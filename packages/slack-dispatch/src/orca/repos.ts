// The repos Orca knows on this machine: what the bot may route work to.

import type { Run } from '../exec/exec.ts'

export interface OrcaRepo {
  name: string
  path: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function field(value: unknown, key: string): unknown {
  if (!isRecord(value)) return null
  return value[key]
}

// `orca repo list --json` prints { result: { repos: [{ displayName, path, ... }] } }.
export function parseRepoList(json: string): OrcaRepo[] {
  const repos = field(field(JSON.parse(json), 'result'), 'repos')
  if (!Array.isArray(repos)) throw new Error('orca repo list: the answer has no repos list')
  const entries: unknown[] = repos
  return entries.flatMap((entry) => {
    const name = field(entry, 'displayName')
    const path = field(entry, 'path')
    if (typeof name !== 'string' || typeof path !== 'string') return []
    return [{ name, path }]
  })
}

export async function listRepos(run: Run): Promise<OrcaRepo[]> {
  const { stdout } = await run('orca', ['repo', 'list', '--json'])
  return parseRepoList(stdout)
}
