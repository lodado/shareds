import type { Store } from '../store/store'
import type { ReviewMeta } from './review'
import { afterEach, describe, expect, it } from 'vitest'
import { applyEvent, closeStore, createItems, getItem, itemKeyOf, listItems, openStore } from '../store/store'
import { createReviewItem, reviewThreadKey, startReviewOf } from './start'

const REVIEW: ReviewMeta = {
  prUrl: 'https://github.com/acme/web-app/pull/7',
  slug: 'acme/web-app',
  number: 7,
  head: 'feature/login',
  base: 'develop',
  title: 'Add login',
  manual: false,
}

const opened: Store[] = []
afterEach(() => {
  for (const store of opened.splice(0)) closeStore(store)
})

function itemOf(s: Store, key: string) {
  const item = getItem(s, key)
  if (item === undefined) throw new Error(`no item ${key}`)
  return item
}

function store(): Store {
  const made = openStore(':memory:')
  opened.push(made)
  return made
}

// Whether a failed item may be tried again: yes, unless a test says otherwise.
const RETRIES = (): boolean => true
const NO_RETRIES = (): boolean => false

const newReview = (at: string) => ({
  repo: 'web-app',
  review: REVIEW,
  summary: 'PR 리뷰: Add login',
  url: 'https://example.slack.com/archives/C1/p1',
  source: 'mention' as const,
  at,
})

describe('createReviewItem as the first request to review a pull request', () => {
  it('to be one item in planning, on Sonnet, that keeps the review', () => {
    const s = store()
    const started = createReviewItem(s, newReview('1'), RETRIES)
    expect(started).toStrictEqual({ kind: 'started', key: itemKeyOf('pr:acme/web-app/7', 'web-app') })
    const item = getItem(s, itemKeyOf(reviewThreadKey(REVIEW), 'web-app'))
    expect(item?.stage).toBe('planning')
    expect(item?.meta.model).toBe('sonnet')
    expect(item?.meta.review).toStrictEqual(REVIEW)
    expect(item?.meta.url).toBe('https://example.slack.com/archives/C1/p1')
  })
})

describe('createReviewItem as a second request while the first review is under way', () => {
  it('to be the item already there, and no new one', () => {
    const s = store()
    const first = createReviewItem(s, newReview('1'), RETRIES)
    expect(createReviewItem(s, newReview('2'), RETRIES)).toStrictEqual({
      kind: 'already',
      key: first.kind === 'refused' ? '' : first.key,
    })
    expect(listItems(s, {})).toHaveLength(1)
  })
})

describe('createReviewItem as a request after the first review is over', () => {
  it('to be a new item that carries the time of the request', () => {
    const s = store()
    const first = createReviewItem(s, newReview('1'), RETRIES)
    if (first.kind !== 'started') throw new Error('the first review did not start')
    applyEvent(s, first.key, { type: 'reject', owner: true })
    expect(getItem(s, first.key)?.stage).toBe('declined')
    expect(createReviewItem(s, newReview('2'), RETRIES)).toStrictEqual({
      kind: 'started',
      key: itemKeyOf('pr:acme/web-app/7:2', 'web-app'),
    })
  })
})

describe('createReviewItem as a request after the first review failed', () => {
  function failedFirst(s: Store): string {
    const first = createReviewItem(s, newReview('1'), RETRIES)
    if (first.kind !== 'started') throw new Error('the first review did not start')
    applyEvent(s, first.key, { type: 'abort' })
    expect(getItem(s, first.key)?.stage).toBe('failed')
    return first.key
  }

  it('to be the failed item while the owner can still try it again', () => {
    const s = store()
    const key = failedFirst(s)
    expect(createReviewItem(s, newReview('2'), RETRIES)).toStrictEqual({ kind: 'already', key })
  })

  it('to be a new item once the failed one has no tries left', () => {
    const s = store()
    failedFirst(s)
    expect(createReviewItem(s, newReview('2'), NO_RETRIES).kind).toBe('started')
    expect(listItems(s, {})).toHaveLength(2)
  })
})

function waiting(s: Store, repo: string, ts = '1.1'): string {
  createItems(s, `slack:C1:${ts}`, [repo], { meta: { [repo]: { summary: 'look at this' } } })
  const key = itemKeyOf(`slack:C1:${ts}`, repo)
  applyEvent(s, key, { type: 'triage', handled: false, confident: false })
  return key
}

describe('one review per pull request, however it was started', () => {
  it('to be refused as already under way when a digest item is sent to review a pull request a tag started', () => {
    const s = store()
    const tagged = createReviewItem(s, newReview('1'), RETRIES)
    const key = waiting(s, 'web-app')
    expect(startReviewOf(s, itemOf(s, key), 'web-app', REVIEW, RETRIES)).toStrictEqual({
      kind: 'already',
      key: tagged.kind === 'started' ? tagged.key : '',
    })
    expect(getItem(s, key)).toMatchObject({ stage: 'notified' })
    expect(getItem(s, key)?.meta.review).toBeUndefined()
  })

  it('to be refused as already under way when a command asks for a pull request a digest item reviews', () => {
    const s = store()
    const key = waiting(s, 'web-app')
    startReviewOf(s, itemOf(s, key), 'web-app', REVIEW, RETRIES)
    expect(createReviewItem(s, newReview('2'), RETRIES)).toStrictEqual({ kind: 'already', key })
    expect(listItems(s, {})).toHaveLength(1)
  })
})

describe('startReviewOf as a digest item the owner sends to review', () => {
  it("to be moved to the pull request's repo and planning, on Sonnet, with the review kept", () => {
    const s = store()
    waiting(s, 'unrouted')
    const started = startReviewOf(s, itemOf(s, itemKeyOf('slack:C1:1.1', 'unrouted')), 'web-app', REVIEW, RETRIES)
    const key = itemKeyOf('slack:C1:1.1', 'web-app')
    expect(started).toStrictEqual({ kind: 'started', key })
    expect(getItem(s, key)).toMatchObject({ stage: 'planning', meta: { model: 'sonnet', review: REVIEW } })
  })

  it('to be refused for an item that no longer waits, which stays where it is', () => {
    const s = store()
    const key = waiting(s, 'web-app')
    applyEvent(s, key, { type: 'reject', owner: true })
    expect(startReviewOf(s, itemOf(s, key), 'web-app', REVIEW, RETRIES).kind).toBe('refused')
    expect(getItem(s, key)?.stage).toBe('declined')
    expect(getItem(s, key)?.meta.review).toBeUndefined()
  })
})
