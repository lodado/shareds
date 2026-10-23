// Pushing the branch, opening the pull request and reading whether it may be merged. The gate is read from GitHub
// each time it is needed: a result remembered from earlier says nothing about the pull request now.

import type { Run } from '../exec/exec.ts'

export interface Gate {
  ci: boolean
  review: boolean
  // The commit the checks and the review were read for. The merge is pinned to it, so a push made after the
  // reading cannot be merged unchecked. Empty when GitHub did not say, which keeps the gate closed.
  headOid: string
}

const PR_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/
const PUSH_TIMEOUT_MS = 180_000

export async function pushBranch(run: Run, worktreePath: string, branch: string): Promise<void> {
  await run('git', ['-C', worktreePath, 'push', '--set-upstream', 'origin', branch], { timeoutMs: PUSH_TIMEOUT_MS })
}

export interface PrInput {
  worktreePath: string
  // The branch the pull request goes into, without the origin/ prefix.
  base: string
  head: string
  title: string
  body: string
}

// `gh pr create` prints the address of the new pull request as its last line.
export async function openPr(run: Run, input: PrInput): Promise<string> {
  const { stdout } = await run(
    'gh',
    ['pr', 'create', '--base', input.base, '--head', input.head, '--title', input.title, '--body', input.body],
    { cwd: input.worktreePath },
  )
  const url = stdout.trim().split('\n').at(-1)?.trim() ?? ''
  if (!PR_URL.test(url)) throw new Error('gh pr create did not print the address of the pull request')
  return url
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const PASSING_CONCLUSIONS: ReadonlySet<string> = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])

// A check run passes when it finished with a passing conclusion; an older-style status passes when it says SUCCESS.
function checkPasses(check: unknown): boolean {
  if (!isRecord(check)) return false
  if (check.__typename === 'StatusContext') return check.state === 'SUCCESS'
  return (
    check.status === 'COMPLETED' && typeof check.conclusion === 'string' && PASSING_CONCLUSIONS.has(check.conclusion)
  )
}

// A pull request with no checks at all is not counted as passing, neither is one nobody approved, and neither is one
// whose head commit is unknown.
export function parseGate(json: string): Gate {
  const data: unknown = JSON.parse(json)
  if (!isRecord(data)) throw new Error('gh pr view: the answer is not an object')
  const checks: unknown[] = Array.isArray(data.statusCheckRollup) ? data.statusCheckRollup : []
  const headOid = typeof data.headRefOid === 'string' ? data.headRefOid : ''
  return {
    ci: headOid !== '' && checks.length > 0 && checks.every(checkPasses),
    review: data.reviewDecision === 'APPROVED',
    headOid,
  }
}

export async function readGate(run: Run, prUrl: string): Promise<Gate> {
  const { stdout } = await run('gh', ['pr', 'view', prUrl, '--json', 'statusCheckRollup,reviewDecision,headRefOid'])
  return parseGate(stdout)
}

// Merges only if the head is still the commit the gate was read for.
export async function mergePr(run: Run, prUrl: string, headOid: string): Promise<void> {
  await run('gh', ['pr', 'merge', prUrl, '--squash', '--match-head-commit', headOid])
}
