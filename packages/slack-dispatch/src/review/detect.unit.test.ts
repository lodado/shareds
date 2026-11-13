import type { DetectInput, ReviewDetectDeps } from './detect'
import type { PrInfo, ReviewIntent } from './review'
import { describe, expect, it } from 'vitest'
import { createReviewDetector } from './detect'

const HEAD = 'a'.repeat(40)
const PR = 'https://github.com/acme/Web-App/pull/7'
// The same address as the service keeps it: GitHub names are not case sensitive, so one pull request has one key.
const KEPT_PR = 'https://github.com/acme/web-app/pull/7'

const openPr: PrInfo = {
  url: PR,
  state: 'OPEN',
  isDraft: false,
  author: 'teammate',
  reviewRequests: [],
  isCrossRepository: false,
  headRefName: 'feature/login',
  headRefOid: HEAD,
  baseRefName: 'develop',
  title: 'Add login',
  body: 'body',
}

interface Rig {
  detect: ReturnType<typeof createReviewDetector>
  reads: string[]
  classified: string[]
}

function rig(options: { pr?: Partial<PrInfo>; intent?: ReviewIntent } = {}): Rig {
  const reads: string[] = []
  const classified: string[] = []
  const deps: ReviewDetectDeps = {
    readPr: (url) => {
      reads.push(url)
      return Promise.resolve({ ...openPr, ...options.pr })
    },
    classify: (text) => {
      classified.push(text)
      return Promise.resolve(options.intent ?? 'review')
    },
    ownerLogin: () => Promise.resolve('owner-login'),
    knownRepos: () => ['web-app', 'api-server'],
  }
  return { detect: createReviewDetector(deps), reads, classified }
}

const input = (links: string[], manual = false): DetectInput => ({ text: '리뷰 부탁해요', links, manual })

describe('createReviewDetector as a tag with no pull request link', () => {
  it('to be none without asking GitHub or the model', async () => {
    const r = rig()
    expect(await r.detect(input(['https://example.test/x']))).toStrictEqual({ kind: 'none' })
    expect(r.reads).toHaveLength(0)
    expect(r.classified).toHaveLength(0)
  })
})

describe('createReviewDetector as a tag with a pull request link', () => {
  it('to be refused for a repo Orca does not know, without asking GitHub', async () => {
    const r = rig()
    const detection = await r.detect(input(['https://github.com/acme/other/pull/1']))
    expect(detection.kind).toBe('refused')
    expect(r.reads).toHaveLength(0)
  })

  it('to be refused when GitHub says the pull request may not be taken on, without asking the model', async () => {
    const r = rig({ pr: { author: 'owner-login' } })
    expect(await r.detect(input([PR]))).toStrictEqual({
      kind: 'refused',
      prUrl: KEPT_PR,
      reason: '내가 올린 PR이에요',
    })
    expect(r.classified).toHaveLength(0)
  })

  it('to be a review, without the model, in the known repo, for the last link, when the owner is a requested reviewer', async () => {
    const r = rig({ pr: { reviewRequests: ['Owner-Login'] }, intent: 'other' })
    const detection = await r.detect(input(['https://github.com/acme/api-server/pull/1', PR]))
    expect(detection).toStrictEqual({
      kind: 'review',
      repo: 'web-app',
      review: {
        prUrl: KEPT_PR,
        slug: 'acme/web-app',
        number: 7,
        head: 'feature/login',
        base: 'develop',
        title: 'Add login',
        manual: false,
      },
    })
    expect(r.reads).toStrictEqual([KEPT_PR])
    expect(r.classified).toHaveLength(0)
  })

  it('to be only a suggestion to the owner when the model reads a review request but GitHub names nobody', async () => {
    const r = rig({ intent: 'review' })
    expect(await r.detect(input([PR]))).toStrictEqual({ kind: 'suggest', prUrl: KEPT_PR })
    expect(r.classified).toStrictEqual(['리뷰 부탁해요'])
  })

  it('to be only a suggestion when GitHub names another reviewer and not the owner', async () => {
    const r = rig({ pr: { reviewRequests: ['someone-else'] }, intent: 'review' })
    expect((await r.detect(input([PR]))).kind).toBe('suggest')
  })

  it.each(['build', 'other'] as const)('to be none when the model reads the text as %s', async (intent) => {
    const r = rig({ intent })
    expect(await r.detect(input([PR]))).toStrictEqual({ kind: 'none' })
    expect(r.classified).toHaveLength(1)
  })
})

describe('createReviewDetector as a review the owner asked for', () => {
  it('to skip the model but still ask GitHub', async () => {
    const r = rig({ intent: 'other' })
    const detection = await r.detect(input([PR], true))
    expect(detection.kind === 'review' && detection.review.manual).toBe(true)
    expect(r.classified).toHaveLength(0)
    expect(r.reads).toHaveLength(1)
  })

  it('to be refused for a draft all the same', async () => {
    const r = rig({ pr: { isDraft: true } })
    expect((await r.detect(input([PR], true))).kind).toBe('refused')
  })
})
