// Turning a detected review into an item the worker picks up. A review goes straight to planning (the review step):
// either the owner asked for it, or the pull request passed the GitHub check and names the owner or reads as a review
// request. The state machine is the same as for any item: the worker sends the approval the owner gave in advance.

import type { Stage } from '../machine/machine.ts'
import type { ItemSource } from '../store/schema.ts'
import type { ItemRow, Store } from '../store/store.ts'
import type { ReviewMeta } from './review.ts'
import { STAGES } from '../machine/machine.ts'
import {
  applyEvent,
  createItems,
  getItem,
  itemsOfSlackThread,
  listOpenItems,
  moveToRepo,
  setReview,
  setRunChoice,
} from '../store/store.ts'

const FINISHED: ReadonlySet<Stage> = new Set(['merged', 'skipped', 'declined'])
const UNFINISHED = STAGES.filter((stage) => !FINISHED.has(stage))
const REVIEW_ROUTE = 'PR 리뷰 요청'
// The review and its fixes both run on Sonnet, at the owner's choice.
const REVIEW_MODEL = 'sonnet'

export interface NewReview {
  repo: string
  review: ReviewMeta
  summary: string
  // The Slack message the request came from; empty for one typed to the bot.
  url: string
  source: ItemSource
  // Names a later review of the same pull request, after an earlier one is over (a Slack ts or a clock reading).
  at: string
}

// Whether a failed item may still be tried again; one that may not is over.
export type RetriesLeft = (itemKey: string) => boolean

export type Started =
  | { kind: 'started'; key: string }
  | { kind: 'already'; key: string }
  | { kind: 'refused'; reason: string }

// `pr:<owner>/<repo>/<number>`: the key of a review asked for by a tag, a button under a notice or a command.
export const reviewThreadKey = (review: ReviewMeta): string => `pr:${review.slug}/${review.number}`

const isUnderWay = (item: ItemRow, retriesLeft: RetriesLeft): boolean =>
  !FINISHED.has(item.stage) && (item.stage !== 'failed' || retriesLeft(item.key))

// The review of the pull request that is still under way, wherever it was started: under its own key, or a digest item
// sent to review. A failed one counts while the owner can still try it again from its card.
function openReviewOf(store: Store, prUrl: string, retriesLeft: RetriesLeft): ItemRow | undefined {
  return listOpenItems(store, UNFINISHED).find(
    (item) => item.meta.review?.prUrl === prUrl && isUnderWay(item, retriesLeft),
  )
}

// A new item for the pull request, unless a review of it is still under way. One review at a time per pull request.
export function createReviewItem(store: Store, input: NewReview, retriesLeft: RetriesLeft): Started {
  const open = openReviewOf(store, input.review.prUrl, retriesLeft)
  if (open !== undefined) return { kind: 'already', key: open.key }
  const base = reviewThreadKey(input.review)
  const earlier = itemsOfSlackThread(store, base)
  const threadKey = earlier.length === 0 ? base : `${base}:${input.at}`
  const [made] = createItems(store, threadKey, [input.repo], {
    source: input.source,
    meta: {
      [input.repo]: {
        summary: input.summary,
        url: input.url,
        route: REVIEW_ROUTE,
        urgent: false,
        review: input.review,
        model: REVIEW_MODEL,
      },
    },
  })
  if (made === undefined) return { kind: 'refused', reason: '항목을 만들지 못했어요' }
  if (!made.created) return { kind: 'already', key: made.key }
  applyEvent(store, made.key, { type: 'triage', handled: false, confident: true })
  return { kind: 'started', key: made.key }
}

// An item that waits in a digest becomes the review: moved to the pull request's repo if the router chose another one,
// marked, and approved the way the owner's digest click approves it.
export function startReviewOf(
  store: Store,
  item: ItemRow,
  repo: string,
  review: ReviewMeta,
  retriesLeft: RetriesLeft,
): Started {
  if (item.stage !== 'notified') return { kind: 'refused', reason: '이미 처리 중이거나 끝난 항목이에요' }
  const open = openReviewOf(store, review.prUrl, retriesLeft)
  if (open !== undefined) return { kind: 'already', key: open.key }
  const key = moveToRepo(store, item.key, repo)
  if (key === null || getItem(store, key) === undefined) return { kind: 'refused', reason: '항목을 옮기지 못했어요' }
  setReview(store, key, review)
  setRunChoice(store, key, { model: REVIEW_MODEL, direct: false })
  const applied = applyEvent(store, key, { type: 'approve', owner: true, card: 'assign', fresh: true })
  if (applied.outcome.kind !== 'moved') return { kind: 'refused', reason: '항목이 더는 대기 중이 아니에요' }
  return { kind: 'started', key }
}
