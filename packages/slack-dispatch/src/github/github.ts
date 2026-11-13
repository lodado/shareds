// Pushing the branch, opening the pull request and reading whether it may be merged. The gate is read from GitHub
// each time it is needed: a result remembered from earlier says nothing about the pull request now.

import type { Run } from '../exec/exec.ts'
import type { PrInfo, ReviewGate } from '../review/review.ts'
import { parsePrInfo, parseReviewGate, PR_INFO_FIELDS, REVIEW_GATE_FIELDS } from '../review/review.ts'

export interface Gate {
  ci: boolean
  review: boolean
  // The commit the checks and the review were read for. The merge is pinned to it, so a push made after the
  // reading cannot be merged unchecked. Empty when GitHub did not say, which keeps the gate closed.
  headOid: string
}

const PR_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/
// A repository's pre-push hook may run its whole test suite (about 6 minutes in one of them), so the push gets room.
const PUSH_TIMEOUT_MS = 900_000

// `base` is the ref the pull request goes into. A pre-push hook cannot infer that on a branch's first push, and some
// repositories stop the push until it is named in TEST_BASE, so it is always passed along.
export async function pushBranch(run: Run, worktreePath: string, branch: string, base: string): Promise<void> {
  await run('git', ['-C', worktreePath, 'push', '--set-upstream', 'origin', branch], {
    timeoutMs: PUSH_TIMEOUT_MS,
    env: { TEST_BASE: base },
  })
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

export type PrState = 'open' | 'merged' | 'closed'

const PR_STATES: Readonly<Record<string, PrState>> = { OPEN: 'open', MERGED: 'merged', CLOSED: 'closed' }

function prStateOf(value: unknown): PrState | undefined {
  if (typeof value !== 'string' || !Object.hasOwn(PR_STATES, value)) return undefined
  return PR_STATES[value]
}

// Where a pull request stands on the host now: still open, merged, or closed without a merge. Read from GitHub each
// time, because it can change without this service: a person may merge it there.
export async function readPrState(run: Run, prUrl: string): Promise<PrState> {
  const { stdout } = await run('gh', ['pr', 'view', prUrl, '--json', 'state'])
  const parsed: unknown = JSON.parse(stdout)
  const known = prStateOf(isRecord(parsed) ? parsed.state : undefined)
  if (known === undefined) throw new Error('gh pr view did not say whether the pull request is open')
  return known
}

export async function readGate(run: Run, prUrl: string): Promise<Gate> {
  const { stdout } = await run('gh', ['pr', 'view', prUrl, '--json', 'statusCheckRollup,reviewDecision,headRefOid'])
  return parseGate(stdout)
}

// Merges only if the head is still the commit the gate was read for.
export async function mergePr(run: Run, prUrl: string, headOid: string): Promise<void> {
  await run('gh', ['pr', 'merge', prUrl, '--squash', '--match-head-commit', headOid])
}

// The pull request a review is about, read again at every step that acts on it.
export async function readPrInfo(run: Run, prUrl: string): Promise<PrInfo> {
  const { stdout } = await run('gh', ['pr', 'view', prUrl, '--json', PR_INFO_FIELDS])
  return parsePrInfo(stdout)
}

export async function readReviewGate(run: Run, prUrl: string): Promise<ReviewGate> {
  const { stdout } = await run('gh', ['pr', 'view', prUrl, '--json', REVIEW_GATE_FIELDS])
  return parseReviewGate(stdout)
}

const SLUG = /^[\w.-]+\/[\w.-]+$/
const COMMIT = /^[0-9a-f]{40}$/

// Approves one commit as the signed-in GitHub user, with no text: the owner asked for no comment on the pull request.
// The commit is named, so the approval is of the code that was reviewed, not of whatever the head is by then.
export async function approvePr(run: Run, slug: string, number: number, commit: string): Promise<void> {
  if (!SLUG.test(slug) || !Number.isSafeInteger(number) || number <= 0 || !COMMIT.test(commit)) {
    throw new RangeError('not a pull request and commit to approve')
  }
  await run('gh', [
    'api',
    '--method',
    'POST',
    `repos/${slug}/pulls/${number}/reviews`,
    '-f',
    'event=APPROVE',
    '-f',
    `commit_id=${commit}`,
  ])
}

const LOGIN = /^[\da-z][\da-z-]{0,38}$/i

// The GitHub login the gh on this machine signs in as: the person a review request names.
export async function readLogin(run: Run): Promise<string> {
  const { stdout } = await run('gh', ['api', 'user', '--jq', '.login'])
  const login = stdout.trim()
  if (!LOGIN.test(login)) throw new Error('gh api user did not print a login')
  return login
}

// Git without the repository's hooks: in a pull request somebody else wrote, a hook is code from that pull request.
export const NO_HOOKS: Readonly<Record<string, string>> = {
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'core.hooksPath',
  GIT_CONFIG_VALUE_0: '/dev/null',
}

// Pushes the reviewed fixes onto the branch of somebody else's pull request, with its hooks off (CI checks the push).
// Never forced: if the author pushed in the meantime the push is refused, and the fixes are not merged over their work.
export async function pushToPrBranch(run: Run, worktreePath: string, head: string): Promise<void> {
  await run('git', ['-C', worktreePath, 'push', 'origin', `HEAD:refs/heads/${head}`], {
    timeoutMs: PUSH_TIMEOUT_MS,
    env: NO_HOOKS,
  })
}
