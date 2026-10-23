// The workspace of an item: an Orca-managed worktree on a branch made from the repo's main line. Everything goes
// through the orca and git programs (never `git worktree add`), started by the injected `Run`.

import type { Run } from '../exec/exec.ts'
import type { Stage } from '../machine/machine.ts'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { agentEnv } from '../exec/env.ts'
import { CommandError } from '../exec/exec.ts'

export interface Worktree {
  id: string
  path: string
  branch: string
}

// First match wins: development usually happens on develop, and a repo without one uses main, then master.
const BASE_CANDIDATES = ['develop', 'main', 'master'] as const
const FETCH_TIMEOUT_MS = 180_000
const BRANCH_PREFIX = 'refs/heads/'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function field(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined
}

// A name Orca and git accept, the same for the same item every time.
export function worktreeNameFor(itemKey: string): string {
  return `dispatch-${createHash('sha256').update(itemKey).digest('hex').slice(0, 10)}`
}

async function refExists(run: Run, repoPath: string, ref: string): Promise<boolean> {
  try {
    await run('git', ['-C', repoPath, 'rev-parse', '--verify', '--quiet', ref])
    return true
  } catch (error) {
    // `rev-parse --verify --quiet` says "not there" with exit code 1; anything else is a real failure.
    if (error instanceof CommandError && error.exitCode === 1) return false
    throw error
  }
}

// Always fetches first, so the branch is made from what the remote has now. `override` is the owner's choice for
// a repo (for example a `stage` branch); it must exist on origin or the call fails instead of falling back.
export async function resolveBaseBranch(run: Run, repoPath: string, override?: string): Promise<string> {
  await run('git', ['-C', repoPath, 'fetch', 'origin', '--prune'], { timeoutMs: FETCH_TIMEOUT_MS })
  if (override !== undefined) {
    const name = override.replace(/^origin\//, '')
    if (!(await refExists(run, repoPath, `refs/remotes/origin/${name}`))) {
      throw new Error(`the base branch origin/${name} does not exist in ${repoPath}`)
    }
    return `origin/${name}`
  }
  for (const name of BASE_CANDIDATES) {
    if (await refExists(run, repoPath, `refs/remotes/origin/${name}`)) return `origin/${name}`
  }
  throw new Error(`origin has no develop, main or master branch in ${repoPath}`)
}

// `orca worktree create --json` prints { result: { worktree: { id, path, branch, ... } } }.
export function parseWorktree(json: string): Worktree {
  const result = field(JSON.parse(json), 'result')
  const worktree = field(result, 'worktree') ?? result
  const id = field(worktree, 'id')
  const path = field(worktree, 'path')
  const branch = field(worktree, 'branch')
  if (typeof id !== 'string' || typeof path !== 'string')
    throw new Error('orca worktree create: the answer has no worktree')
  const name = typeof branch === 'string' ? branch.replace(BRANCH_PREFIX, '') : ''
  return { id, path, branch: name }
}

export interface CreateOptions {
  repoPath: string
  name: string
  baseRef: string
  // Shown in Orca next to the worktree, for whoever opens it. A free text: Orca only accepts issue links as references.
  comment?: string
}

export async function createWorktree(run: Run, options: CreateOptions): Promise<Worktree> {
  const args = [
    'worktree',
    'create',
    '--name',
    options.name,
    '--repo',
    `path:${options.repoPath}`,
    '--base-branch',
    options.baseRef,
    '--no-parent',
    ...(options.comment ? ['--comment', options.comment] : []),
    '--json',
  ]
  const { stdout } = await run('orca', args)
  return parseWorktree(stdout)
}

// Orca's board column for each stage; a stage that is not worked on keeps whatever the column was.
const STATUS: Partial<Record<Stage, string>> = {
  planning: 'in-progress',
  planned: 'in-progress',
  implementing: 'in-progress',
  pr_open: 'in-review',
  merged: 'completed',
}

export const statusForStage = (stage: Stage): string | undefined => STATUS[stage]

export async function setWorkspaceStatus(run: Run, path: string, status: string): Promise<void> {
  await run('orca', ['worktree', 'set', '--worktree', `path:${path}`, '--workspace-status', status, '--json'])
}

export interface Removal {
  removed: boolean
  // Why the worktree was kept.
  reason?: string
}

// Work that exists only in this worktree is not thrown away unless the owner declined it.
async function unsavedWork(run: Run, path: string): Promise<string | undefined> {
  const dirty = await run('git', ['-C', path, 'status', '--porcelain'])
  if (dirty.stdout.trim() !== '') return 'there are uncommitted changes'
  try {
    const ahead = await run('git', ['-C', path, 'rev-list', '--count', '@{upstream}..HEAD'])
    return ahead.stdout.trim() === '0' ? undefined : 'there are commits that were not pushed'
  } catch (error) {
    if (error instanceof CommandError) return 'the branch was never pushed'
    throw error
  }
}

export async function removeWorktree(run: Run, path: string, options: { discard: boolean }): Promise<Removal> {
  if (!options.discard) {
    const reason = await unsavedWork(run, path)
    if (reason !== undefined) return { removed: false, reason }
  }
  await run('orca', ['worktree', 'rm', '--worktree', `path:${path}`, ...(options.discard ? ['--force'] : []), '--json'])
  return { removed: true }
}

// What code can check about a build the agent says is done: it stayed on the worktree's branch, a commit exists on top
// of the base and nothing is left uncommitted. The branch is the one that gets pushed, so work on another one is lost.
export async function commitProblem(
  run: Run,
  path: string,
  baseRef: string,
  branch: string,
): Promise<string | undefined> {
  const current = await run('git', ['-C', path, 'symbolic-ref', '--short', 'HEAD'])
  if (current.stdout.trim() !== branch) return `the agent left the branch ${branch}`
  const dirty = await run('git', ['-C', path, 'status', '--porcelain'])
  if (dirty.stdout.trim() !== '') return 'the agent left uncommitted changes in the worktree'
  const ahead = await run('git', ['-C', path, 'rev-list', '--count', `${baseRef}..HEAD`])
  return ahead.stdout.trim() === '0' ? 'the agent made no commit' : undefined
}

const INSTALL_TIMEOUT_MS = 15 * 60_000

interface Installer {
  file: string
  args: readonly string[]
}

// By the lock file the repository keeps; a repository with none is left as it is.
function installerFor(path: string, exists: (file: string) => boolean): Installer | undefined {
  if (exists(join(path, 'pnpm-lock.yaml')))
    return { file: 'pnpm', args: ['install', '--frozen-lockfile', '--prefer-offline'] }
  if (exists(join(path, 'package-lock.json')))
    return { file: 'npm', args: ['ci', '--prefer-offline', '--no-audit', '--no-fund'] }
  if (exists(join(path, 'yarn.lock'))) return { file: 'yarn', args: ['install', '--frozen-lockfile'] }
  return undefined
}

// A new worktree has the repository's files but not its installed packages, and a build or a QA run needs them.
// The install runs the repository's own scripts, so it gets the same limited environment as the agent.
export async function installDependencies(
  run: Run,
  path: string,
  signal?: AbortSignal,
  exists: (file: string) => boolean = existsSync,
): Promise<'present' | 'installed' | 'none'> {
  if (exists(join(path, 'node_modules'))) return 'present'
  const installer = installerFor(path, exists)
  if (installer === undefined) return 'none'
  await run(installer.file, installer.args, { cwd: path, timeoutMs: INSTALL_TIMEOUT_MS, inheritEnv: agentEnv, signal })
  return 'installed'
}
