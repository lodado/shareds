import type { PrInfo, Review, ReviewGate } from './review'
import { describe, expect, it } from 'vitest'
import {
  eligibility,
  isReviewRequested,
  mergeStep,
  parsePrInfo,
  parsePrUrl,
  parseReview,
  parseReviewGate,
  parseReviewIntent,
  parseUnfixed,
  prLinksIn,
  readReviewMeta,
  readStoredReview,
  remainingBlockers,
  remoteMatches,
} from './review'

const HEAD = 'a'.repeat(40)
const OWNER_LOGIN = 'owner-login'

const openPr = (overrides: Partial<PrInfo> = {}): PrInfo => ({
  url: 'https://github.com/acme/web-app/pull/7',
  state: 'OPEN',
  isDraft: false,
  author: 'teammate',
  reviewRequests: [],
  isCrossRepository: false,
  headRefName: 'feature/login',
  headRefOid: HEAD,
  baseRefName: 'develop',
  title: 'Add login',
  body: '',
  ...overrides,
})

describe('parsePrUrl as a link from a Slack message', () => {
  it('to be the pull request with anything after the number dropped', () => {
    expect(parsePrUrl('https://github.com/acme/web-app/pull/7/files#diff-1')).toStrictEqual({
      url: 'https://github.com/acme/web-app/pull/7',
      owner: 'acme',
      repo: 'web-app',
      number: 7,
    })
  })

  it.each([
    ['an issue link', 'https://github.com/acme/web-app/issues/7'],
    ['another host', 'https://gitlab.com/acme/web-app/pull/7'],
    ['a scheme other than https', 'git://github.com/acme/web-app/pull/7'],
    ['number 0', 'https://github.com/acme/web-app/pull/0'],
    ['a dot-leading repo', 'https://github.com/acme/..git/pull/7'],
  ])('to be null for %s', (_name, link) => {
    expect(parsePrUrl(link)).toBeNull()
  })
})

describe('prLinksIn as the links of a thread', () => {
  it('to be the pull requests in order, each once whatever its case', () => {
    const refs = prLinksIn([
      'https://github.com/acme/web-app/pull/1',
      'https://example.test/x',
      'https://github.com/ACME/web-app/pull/1',
      'https://github.com/acme/api/pull/2',
    ])
    expect(refs.map((ref) => ref.url)).toStrictEqual([
      'https://github.com/acme/web-app/pull/1',
      'https://github.com/acme/api/pull/2',
    ])
  })
})

describe('parsePrInfo as what gh pr view printed', () => {
  it('to be read as a draft from a fork in an unknown state when the fields are missing', () => {
    expect(parsePrInfo('{}')).toMatchObject({ state: 'UNKNOWN', isDraft: true, isCrossRepository: true, author: '' })
  })

  it('to keep only the people asked to review, not the teams', () => {
    const json = JSON.stringify({ reviewRequests: [{ login: 'owner-login' }, { name: 'team-a' }] })
    expect(parsePrInfo(json).reviewRequests).toStrictEqual(['owner-login'])
  })
})

describe('eligibility as the check before the service touches a pull request', () => {
  it('to be ok for an open pull request of a teammate from the same repo', () => {
    expect(eligibility(openPr(), OWNER_LOGIN)).toStrictEqual({ ok: true })
  })

  it.each([
    ['merged', { state: 'MERGED' as const }],
    ['a draft', { isDraft: true }],
    ['from a fork', { isCrossRepository: true }],
    ["the owner's own, in another case", { author: 'Owner-Login' }],
    ['a head branch that is an option', { headRefName: '-x' }],
    ['a base branch going up the tree', { baseRefName: 'a/../b' }],
    ['a short head commit', { headRefOid: 'a'.repeat(39) }],
  ])('to be refused when it is %s', (_name, overrides) => {
    expect(eligibility(openPr(overrides), OWNER_LOGIN).ok).toBe(false)
  })
})

describe('isReviewRequested as the reviewers of a pull request', () => {
  it('to be true only when the owner is among them', () => {
    expect(isReviewRequested(openPr({ reviewRequests: ['OWNER-LOGIN'] }), OWNER_LOGIN)).toBe(true)
    expect(isReviewRequested(openPr({ reviewRequests: ['someone'] }), OWNER_LOGIN)).toBe(false)
  })
})

describe('parseReviewIntent as the classifier answer', () => {
  it.each([
    [{ kind: 'review' }, 'review'],
    [{ kind: 'build' }, 'build'],
    [{ kind: 'REVIEW' }, 'other'],
    ['review', 'other'],
  ])('to read %j as %s', (raw, intent) => {
    expect(parseReviewIntent(raw)).toBe(intent)
  })
})

describe('readReviewMeta as a review kept in an item', () => {
  const kept = {
    prUrl: 'https://github.com/acme/web-app/pull/7',
    slug: 'acme/web-app',
    number: 7,
    head: 'feature/login',
    base: 'develop',
    title: 'Add login',
    manual: false,
  }

  it('to be read back with the optional fields that have the right type', () => {
    expect(readReviewMeta({ ...kept, pushedOid: HEAD, pushedAt: 5, unfixed: [2], report: 'r' })).toStrictEqual({
      ...kept,
      pushedOid: HEAD,
      pushedAt: 5,
      unfixed: [2],
      report: 'r',
    })
    expect(readReviewMeta({ ...kept, pushedOid: 'abc', unfixed: [0] })).toStrictEqual(kept)
  })

  it('to be nothing when the link and the slug disagree', () => {
    expect(readReviewMeta({ ...kept, slug: 'acme/other' })).toBeUndefined()
  })
})

describe('parseReview as the review agent JSON', () => {
  it('to number the findings it keeps and read a made-up severity as major', () => {
    const review = parseReview({
      summary: ' ok ',
      findings: [
        { severity: 'nit', file: 'a.ts', line: 3, issue: 'x', fix: 'y' },
        { severity: 'odd', file: 'b.ts', line: 0, issue: 'z', fix: '' },
        { severity: 'major', issue: '   ' },
      ],
    })
    expect(review).toStrictEqual({
      summary: 'ok',
      findings: [
        { id: 1, severity: 'nit', file: 'a.ts', line: 3, issue: 'x', fix: 'y' },
        { id: 2, severity: 'major', file: 'b.ts', line: null, issue: 'z', fix: '' },
      ],
    })
  })

  it('to keep at most 30 findings', () => {
    const findings = Array.from({ length: 31 }, () => ({ severity: 'minor', issue: 'x' }))
    expect(parseReview({ findings }).findings).toHaveLength(30)
  })

  it('to throw when there is no findings list', () => {
    expect(() => parseReview({ summary: 'x' })).toThrow('the review has no findings list')
  })
})

describe('readStoredReview as the review kept in the workspace', () => {
  it('to be nothing when a stored finding no longer reads', () => {
    expect(readStoredReview(JSON.stringify({ findings: [{ issue: 'x' }, { issue: '' }] }))).toBeUndefined()
    expect(readStoredReview('not json')).toBeUndefined()
  })
})

describe('parseUnfixed as the line the fixing agent writes', () => {
  it.each([
    ['UNFIXED: none', []],
    ['UNFIXED: 없음', []],
    ['UNFIXED: 2, 5 2', [2, 5]],
    ['UNFIXED: 2, x', null],
    ['no line at all', null],
  ])('to read %j as %j', (line, ids) => {
    expect(parseUnfixed(`did things\n${line}`).ids).toStrictEqual(ids)
  })

  it('to take the line out of the report', () => {
    expect(parseUnfixed('fixed 1\nUNFIXED: none\nmore').report).toBe('fixed 1\nmore')
  })
})

describe('remainingBlockers as what stops a merge', () => {
  const review: Review = {
    summary: '',
    findings: [
      { id: 1, severity: 'blocker', file: '', line: null, issue: 'a', fix: '' },
      { id: 2, severity: 'major', file: '', line: null, issue: 'b', fix: '' },
      { id: 3, severity: 'minor', file: '', line: null, issue: 'c', fix: '' },
    ],
  }

  it('to be the blocker and major findings left unfixed, and all of them when the agent did not say', () => {
    expect(remainingBlockers(review, [2, 3]).map((finding) => finding.id)).toStrictEqual([2])
    expect(remainingBlockers(review, []).map((finding) => finding.id)).toStrictEqual([])
    expect(remainingBlockers(review, null).map((finding) => finding.id)).toStrictEqual([1, 2])
  })
})

describe('parseReviewGate as the checks of a pull request', () => {
  const gate = (checks: unknown[]): ReviewGate =>
    parseReviewGate(
      JSON.stringify({ state: 'OPEN', statusCheckRollup: checks, reviewDecision: null, headRefOid: HEAD }),
    )

  it('to pass with no checks at all', () => {
    expect(gate([])).toStrictEqual({ state: 'OPEN', ci: 'pass', decision: '', headOid: HEAD })
  })

  it('to let a failed check outweigh a running one', () => {
    const running = { __typename: 'CheckRun', status: 'IN_PROGRESS' }
    const failed = { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' }
    expect(gate([running]).ci).toBe('pending')
    expect(gate([running, failed]).ci).toBe('fail')
  })

  it('to read a status context by its state', () => {
    expect(gate([{ __typename: 'StatusContext', state: 'SUCCESS' }]).ci).toBe('pass')
    expect(gate([{ __typename: 'StatusContext', state: 'EXPECTED' }]).ci).toBe('pending')
    expect(gate([{ __typename: 'StatusContext', state: 'ERROR' }]).ci).toBe('fail')
  })
})

describe('mergeStep as an approved pull request waiting for CI', () => {
  const SETTLE = 300
  const MAX = 1000
  const step = (gate: Partial<ReviewGate>, waited: number) =>
    mergeStep({
      gate: { state: 'OPEN', ci: 'pass', decision: '', headOid: HEAD, ...gate },
      expectedHead: HEAD,
      pushedAt: 0,
      now: waited,
      settleMs: SETTLE,
      maxWaitMs: MAX,
    })

  it('to wait until the settle time is up, then merge the approved commit', () => {
    expect(step({}, SETTLE - 1)).toStrictEqual({ kind: 'wait' })
    expect(step({}, SETTLE)).toStrictEqual({ kind: 'merge', headOid: HEAD })
  })

  it('to stop at once when a new commit came, even before the settle time', () => {
    expect(step({ headOid: 'b'.repeat(40) }, 0).kind).toBe('stop')
  })

  it('to wait for running checks up to the longest wait, and stop after it', () => {
    expect(step({ ci: 'pending' }, MAX)).toStrictEqual({ kind: 'wait' })
    expect(step({ ci: 'pending' }, MAX + 1).kind).toBe('stop')
  })

  it.each([
    [{ ci: 'fail' as const }, 'stop'],
    [{ decision: 'CHANGES_REQUESTED' }, 'stop'],
    [{ decision: 'REVIEW_REQUIRED' }, 'stop'],
    [{ decision: 'APPROVED' }, 'merge'],
    [{ state: 'MERGED' as const }, 'merged_on_host'],
    [{ state: 'CLOSED' as const }, 'closed'],
    [{ state: 'UNKNOWN' as const }, 'stop'],
  ])('to answer %j with %s', (gate, kind) => {
    expect(step(gate, SETTLE).kind).toBe(kind)
  })
})

describe('remoteMatches as the origin of a clone', () => {
  it.each([
    ['https://github.com/acme/web-app.git', true],
    ['git@github.com:ACME/web-app.git', true],
    ['https://github.com/acme/web-app/', true],
    ['https://github.com/acme/web-app-old.git', false],
    ['https://example.test/acme/web-app.git', false],
  ])('to match %s: %s', (remote, matches) => {
    expect(remoteMatches(remote, 'acme/web-app')).toBe(matches)
  })
})
