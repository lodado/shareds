// Whether a Slack text asks the owner to review a pull request the service may take on. Decided in this order, the
// cheap and certain checks first: a pull request link (a rule), what GitHub says about it (open, not a draft, not from a
// fork, not the owner's own, in a repo Orca knows), and only then the intent. Only a pull request that names the owner
// as a reviewer on GitHub is reviewed and merged by itself: naming a reviewer takes write access to the repo, while
// anybody in Slack can write a tag. When the cheapest model only reads the text as a review request, the owner is shown
// the suggestion and starts it with a button. A button or a command from the owner skips the intent check, never the
// GitHub one.

import type { PrInfo, PrRef, ReviewIntent, ReviewMeta } from './review.ts'
import { eligibility, isReviewRequested, prLinksIn, reviewMetaOf } from './review.ts'

export interface ReviewDetectDeps {
  readPr: (url: string) => Promise<PrInfo>
  classify: (text: string) => Promise<ReviewIntent>
  ownerLogin: () => Promise<string>
  knownRepos: () => readonly string[]
}

export interface DetectInput {
  // The text the intent is read from, cleaned of Slack markup.
  text: string
  // Every link in the text, raw; the pull request links are taken from these.
  links: readonly string[]
  // The owner asked for it.
  manual: boolean
}

export type Detection =
  | { kind: 'review'; repo: string; review: ReviewMeta }
  // Reads as a review request, but GitHub does not name the owner as a reviewer: the owner decides.
  | { kind: 'suggest'; prUrl: string }
  | { kind: 'none' }
  | { kind: 'refused'; prUrl: string; reason: string }

export type DetectReview = (input: DetectInput) => Promise<Detection>

// The repo Orca knows under the name of the GitHub repo, matched like the router matches links.
function knownRepoOf(ref: PrRef, knownRepos: readonly string[]): string | undefined {
  const wanted = ref.repo.toLowerCase()
  return knownRepos.find((repo) => repo.toLowerCase() === wanted)
}

// The last pull request in the text: the newest tag is at the end, and it is the one the owner was asked about.
export function createReviewDetector(deps: ReviewDetectDeps): DetectReview {
  return async (input) => {
    const ref = prLinksIn(input.links).at(-1)
    if (ref === undefined) return { kind: 'none' }
    const repo = knownRepoOf(ref, deps.knownRepos())
    if (repo === undefined) return { kind: 'refused', prUrl: ref.url, reason: `${ref.repo}는 등록된 레포가 아니에요` }
    const [info, login] = await Promise.all([deps.readPr(ref.url), deps.ownerLogin()])
    const allowed = eligibility(info, login)
    if (!allowed.ok) return { kind: 'refused', prUrl: ref.url, reason: allowed.reason }
    if (input.manual || isReviewRequested(info, login)) {
      return { kind: 'review', repo, review: reviewMetaOf(ref, info, input.manual) }
    }
    return (await deps.classify(input.text)) === 'review' ? { kind: 'suggest', prUrl: ref.url } : { kind: 'none' }
  }
}
