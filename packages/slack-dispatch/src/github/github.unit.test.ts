import type { Run } from '../exec/exec'
import { describe, expect, it } from 'vitest'
import {
  approvePr,
  mergePr,
  openPr,
  parseGate,
  pushBranch,
  pushToPrBranch,
  readGate,
  readLogin,
  readPrInfo,
  readPrState,
  readReviewGate,
} from './github'

type Call = [string, readonly string[], string | undefined]

function recording(stdout = ''): { run: Run; calls: Call[] } {
  const calls: Call[] = []
  const run: Run = (file, args, options) => {
    calls.push([file, args, options?.cwd])
    return Promise.resolve({ stdout, stderr: '' })
  }
  return { run, calls }
}

const PR = 'https://github.com/acme/web-app/pull/42'

describe('pushBranch as the first push of an item branch', () => {
  it('to be a push that sets the upstream, from the worktree', async () => {
    const { run, calls } = recording()
    await pushBranch(run, '/work/wt', 'dispatch-abc', 'origin/develop')
    expect(calls).toStrictEqual([
      ['git', ['-C', '/work/wt', 'push', '--set-upstream', 'origin', 'dispatch-abc'], undefined],
    ])
  })

  it('to name the branch the pull request goes into in TEST_BASE, for a hook that cannot infer it', async () => {
    const seen: (Readonly<Record<string, string>> | undefined)[] = []
    const run: Run = (_file, _args, options) => {
      seen.push(options?.env)
      return Promise.resolve({ stdout: '', stderr: '' })
    }
    await pushBranch(run, '/work/wt', 'dispatch-abc', 'origin/develop')
    expect(seen).toStrictEqual([{ TEST_BASE: 'origin/develop' }])
  })
})

describe('openPr as the pull request of an item', () => {
  const input = { worktreePath: '/work/wt', base: 'develop', head: 'dispatch-abc', title: 'T', body: 'B' }

  it('to be the address gh printed last, created from the worktree', async () => {
    const { run, calls } = recording(`Creating pull request\n\n${PR}\n`)
    expect(await openPr(run, input)).toBe(PR)
    expect(calls).toStrictEqual([
      [
        'gh',
        ['pr', 'create', '--base', 'develop', '--head', 'dispatch-abc', '--title', 'T', '--body', 'B'],
        '/work/wt',
      ],
    ])
  })

  it.each([
    '',
    'created it',
    ['http', '://github.com/acme/web-app/pull/1'].join(''),
    'https://evil.test/acme/web-app/pull/1',
    `${PR}/files`,
  ])('to be an error when the last line is %j', async (stdout) => {
    await expect(openPr(recording(stdout).run, input)).rejects.toThrow(
      'gh pr create did not print the address of the pull request',
    )
  })
})

const passing = { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' }
const HEAD = '0123456789abcdef0123456789abcdef01234567'

describe('parseGate as the answer of gh pr view', () => {
  it('to be open, for that head commit, when every check passed and the pull request was approved', () => {
    const json = JSON.stringify({
      statusCheckRollup: [
        passing,
        { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'NEUTRAL' },
        { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SKIPPED' },
        { __typename: 'StatusContext', state: 'SUCCESS' },
      ],
      reviewDecision: 'APPROVED',
      headRefOid: HEAD,
    })
    expect(parseGate(json)).toStrictEqual({ ci: true, review: true, headOid: HEAD })
  })

  it.each([
    ['a failed check', { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' }],
    ['a check still running', { __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: '' }],
    ['a pending status', { __typename: 'StatusContext', state: 'PENDING' }],
    ['a malformed check', 'nonsense'],
  ])('to be closed for CI with %s among passing ones', (_name, bad) => {
    const json = JSON.stringify({
      statusCheckRollup: [passing, bad],
      reviewDecision: 'APPROVED',
      headRefOid: HEAD,
    })
    expect(parseGate(json)).toStrictEqual({ ci: false, review: true, headOid: HEAD })
  })

  it('to be closed for CI when there are no checks at all', () => {
    const none = JSON.stringify({ statusCheckRollup: [], reviewDecision: 'APPROVED', headRefOid: HEAD })
    expect(parseGate(none)).toStrictEqual({ ci: false, review: true, headOid: HEAD })
    expect(parseGate(JSON.stringify({ reviewDecision: 'APPROVED', headRefOid: HEAD })).ci).toBe(false)
  })

  it('to be closed for CI when GitHub did not say which commit the checks were for', () => {
    const json = JSON.stringify({ statusCheckRollup: [passing], reviewDecision: 'APPROVED' })
    expect(parseGate(json)).toStrictEqual({ ci: false, review: true, headOid: '' })
  })

  it.each(['CHANGES_REQUESTED', 'REVIEW_REQUIRED', '', null])(
    'to be closed for review when the decision is %j',
    (decision) => {
      const json = JSON.stringify({ statusCheckRollup: [passing], reviewDecision: decision, headRefOid: HEAD })
      expect(parseGate(json)).toStrictEqual({ ci: true, review: false, headOid: HEAD })
    },
  )

  it.each(['[]', 'null', '"x"'])('to be an error for %s', (json) => {
    expect(() => parseGate(json)).toThrow('gh pr view: the answer is not an object')
  })
})

describe('readGate and mergePr as the calls to gh', () => {
  it('to be a fresh read of the checks, the review decision and the head commit', async () => {
    const answer = JSON.stringify({ statusCheckRollup: [passing], reviewDecision: 'APPROVED', headRefOid: HEAD })
    const { run, calls } = recording(answer)
    expect(await readGate(run, PR)).toStrictEqual({ ci: true, review: true, headOid: HEAD })
    expect(calls).toStrictEqual([
      ['gh', ['pr', 'view', PR, '--json', 'statusCheckRollup,reviewDecision,headRefOid'], undefined],
    ])
  })

  it('to be a squash merge pinned to the commit that was checked', async () => {
    const { run, calls } = recording()
    await mergePr(run, PR, HEAD)
    expect(calls).toStrictEqual([['gh', ['pr', 'merge', PR, '--squash', '--match-head-commit', HEAD], undefined]])
  })
})

describe('readPrState as what the host says about a pull request', () => {
  it.each([
    ['OPEN', 'open'],
    ['MERGED', 'merged'],
    ['CLOSED', 'closed'],
  ])('to be %s read as %s, asked with the address and only the state', async (state, expected) => {
    const { run, calls } = recording(JSON.stringify({ state }))
    expect(await readPrState(run, PR)).toBe(expected)
    expect(calls).toStrictEqual([['gh', ['pr', 'view', PR, '--json', 'state'], undefined]])
  })

  it.each([
    JSON.stringify({ state: 'DRAFT' }),
    JSON.stringify({ state: 'merged' }),
    JSON.stringify({ state: 5 }),
    JSON.stringify({}),
    JSON.stringify([]),
    JSON.stringify({ state: '__proto__' }),
  ])('to be an error, not a guess, for the answer %s', async (answer) => {
    const { run } = recording(answer)
    await expect(readPrState(run, PR)).rejects.toThrow('did not say whether the pull request is open')
  })

  it('to be an error for an answer that is not JSON', async () => {
    const { run } = recording('not json')
    await expect(readPrState(run, PR)).rejects.toThrow()
  })
})

describe('the calls a review makes to gh and git', () => {
  it('to approve exactly one commit with no text, as the signed-in user', async () => {
    const { run, calls } = recording()
    await approvePr(run, 'acme/web-app', 7, 'b'.repeat(40))
    expect(calls).toStrictEqual([
      [
        'gh',
        [
          'api',
          '--method',
          'POST',
          'repos/acme/web-app/pulls/7/reviews',
          '-f',
          'event=APPROVE',
          '-f',
          `commit_id=${'b'.repeat(40)}`,
        ],
        undefined,
      ],
    ])
  })

  it.each([
    ['a slug with a space', 'acme/web app', 7, 'b'.repeat(40)],
    ['no number', 'acme/web-app', 0, 'b'.repeat(40)],
    ['a short commit', 'acme/web-app', 7, 'b'.repeat(39)],
  ])('to be refused, with nothing run, for %s', async (_name, slug, number, commit) => {
    const { run, calls } = recording()
    await expect(approvePr(run, slug, number, commit)).rejects.toThrow('not a pull request and commit to approve')
    expect(calls).toHaveLength(0)
  })

  it("to push the fixes onto the pull request branch, never forced, with the repository's hooks off", async () => {
    const seen: [readonly string[], Readonly<Record<string, string>> | undefined][] = []
    const run: Run = (_file, args, options) => {
      seen.push([args, options?.env])
      return Promise.resolve({ stdout: '', stderr: '' })
    }
    await pushToPrBranch(run, '/work/wt', 'feature/login')
    expect(seen).toStrictEqual([
      [
        ['-C', '/work/wt', 'push', 'origin', 'HEAD:refs/heads/feature/login'],
        { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: '/dev/null' },
      ],
    ])
  })

  it('to read the pull request and its checks with the fields the parsers know', async () => {
    const { run, calls } = recording('{}')
    await readPrInfo(run, PR)
    await readReviewGate(run, PR)
    expect(calls.map(([, args]) => args.at(-1))).toStrictEqual([
      'url,state,isDraft,author,reviewRequests,isCrossRepository,headRefName,headRefOid,baseRefName,title,body',
      'state,statusCheckRollup,reviewDecision,headRefOid',
    ])
  })

  it('to be the login gh signs in as, and an error for anything that is not a login', async () => {
    expect(await readLogin(recording('owner-login\n').run)).toBe('owner-login')
    await expect(readLogin(recording('not a login\n').run)).rejects.toThrow('gh api user did not print a login')
  })
})
