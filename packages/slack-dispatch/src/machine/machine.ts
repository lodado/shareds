// Item state machine: one item is one Slack thread in one repo. Pure functions, so the worker can replay any
// event any number of times. __test__/formal holds the Bend model: its laws are proven about the model, and
// the generated tests compare these functions with it.
//
// An event is never ignored silently. decide() says whether it moved the item, was accepted without moving
// it, or was refused and why, so the worker can answer the sender and log the reason.
//
// Callers build events from validated Slack payloads, so every flag is a real boolean. The flags are
// still compared with `=== true`: anything else counts as false, so a malformed event fails closed. The one flag with a
// negative sense, `handled`, is compared with `!== false` for the same reason.

export type Stage =
  | 'ingested'
  | 'notified'
  | 'planning'
  | 'planned'
  | 'implementing'
  | 'pr_open'
  | 'merged'
  | 'skipped'
  | 'declined'
  | 'failed'

// Record<Stage, true> makes the compiler reject a stage added to the union but missing here.
const STAGE_FLAGS: Record<Stage, true> = {
  ingested: true,
  notified: true,
  planning: true,
  planned: true,
  implementing: true,
  pr_open: true,
  merged: true,
  skipped: true,
  declined: true,
  failed: true,
}

export const isStage = (value: unknown): value is Stage =>
  typeof value === 'string' && Object.hasOwn(STAGE_FLAGS, value)

// In lifecycle order.
export const STAGES: readonly Stage[] = Object.keys(STAGE_FLAGS).filter(isStage)

export type Card = 'assign' | 'plan'

// Readonly, so a transition can never change the event it was given and a replay sees the same event.
//   triage.handled: someone else already took the thread. triage.confident: routing picked one repo by rule.
//   approve.fresh: the card is the latest one sent for the item. plan_ready.current: the plan answers the
//   latest instruction. merge.ci/review: gate inputs (Visual QA passed before the PR was opened).
//   retry.allowed: retries are left in the budget.
export type ItemEvent = Readonly<
  | { type: 'triage'; handled: boolean; confident: boolean }
  | { type: 'approve'; owner: boolean; card: Card; fresh: boolean }
  | { type: 'reject'; owner: boolean }
  | { type: 'revise'; owner: boolean }
  | { type: 'plan_ready'; current: boolean }
  | { type: 'built'; ok: boolean }
  | { type: 'merge'; owner: boolean; ci: boolean; review: boolean }
  | { type: 'retry'; owner: boolean; allowed: boolean }
  | { type: 'abort' }
>

// Checked in this order, so a sender who is not the owner learns nothing about the item's stage.
export type Reason = 'not_owner' | 'finished' | 'wrong_stage' | 'stale' | 'gate_not_met'

export type Outcome =
  | Readonly<{ kind: 'moved'; to: Stage }>
  | Readonly<{ kind: 'stayed' }>
  | Readonly<{ kind: 'refused'; reason: Reason }>

export const INITIAL_STAGE: Stage = 'ingested'

type EventOf<T extends ItemEvent['type']> = Extract<ItemEvent, { type: T }>

const FINISHED: ReadonlySet<Stage> = new Set(['merged', 'skipped', 'declined'])
// Stages from which the owner may call the item off.
const CANCELLABLE: ReadonlySet<Stage> = new Set(['notified', 'planning', 'planned', 'implementing', 'pr_open'])
const ABORTABLE: ReadonlySet<Stage> = new Set([...CANCELLABLE, 'ingested'])

const moved = (to: Stage): Outcome => ({ kind: 'moved', to })
const refused = (reason: Reason): Outcome => ({ kind: 'refused', reason })
const STAYED: Outcome = { kind: 'stayed' }

// An event this stage does not take at all.
const notHere = (stage: Stage): Outcome => refused(FINISHED.has(stage) ? 'finished' : 'wrong_stage')

// A button only counts for the card it was issued with, so pressing it twice moves nothing twice.
function approvalTarget(stage: Stage, card: Card): Stage | undefined {
  if (stage === 'notified' && card === 'assign') return 'planning'
  if (stage === 'planned' && card === 'plan') return 'implementing'
  return undefined
}

const gatePasses = (event: EventOf<'merge'>): boolean => event.ci === true && event.review === true

const finishedCleanly = (event: EventOf<'built'>): boolean => event.ok === true

function decideTriage(stage: Stage, event: EventOf<'triage'>): Outcome {
  if (stage !== 'ingested') return notHere(stage)
  // `handled` has a negative sense: only an explicit false lets the item go on, so a malformed value skips it.
  if (event.handled !== false) return moved('skipped')
  return event.confident === true ? moved('planning') : moved('notified')
}

function decideApprove(stage: Stage, event: EventOf<'approve'>): Outcome {
  if (event.owner !== true) return refused('not_owner')
  const target = approvalTarget(stage, event.card)
  if (target === undefined) return notHere(stage)
  return event.fresh === true ? moved(target) : refused('stale')
}

function decideReject(stage: Stage, event: EventOf<'reject'>): Outcome {
  if (event.owner !== true) return refused('not_owner')
  return CANCELLABLE.has(stage) ? moved('declined') : notHere(stage)
}

function decideRevise(stage: Stage, event: EventOf<'revise'>): Outcome {
  if (event.owner !== true) return refused('not_owner')
  if (stage === 'planned') return moved('planning')
  // Asking again while a plan is being made is accepted: the worker restarts the plan with the new text.
  return stage === 'planning' ? STAYED : notHere(stage)
}

function decidePlanReady(stage: Stage, event: EventOf<'plan_ready'>): Outcome {
  if (stage !== 'planning') return notHere(stage)
  return event.current === true ? moved('planned') : refused('stale')
}

function decideBuilt(stage: Stage, event: EventOf<'built'>): Outcome {
  if (stage !== 'implementing') return notHere(stage)
  return finishedCleanly(event) ? moved('pr_open') : moved('failed')
}

function decideMerge(stage: Stage, event: EventOf<'merge'>): Outcome {
  if (event.owner !== true) return refused('not_owner')
  if (stage !== 'pr_open') return notHere(stage)
  return gatePasses(event) ? moved('merged') : refused('gate_not_met')
}

function decideRetry(stage: Stage, event: EventOf<'retry'>): Outcome {
  if (event.owner !== true) return refused('not_owner')
  if (stage !== 'failed') return notHere(stage)
  return event.allowed === true ? moved('planning') : refused('gate_not_met')
}

// Finished items are refused; a failed item is already failed.
const decideAbort = (stage: Stage): Outcome => (ABORTABLE.has(stage) ? moved('failed') : notHere(stage))

function unknownEvent(event: never): never {
  throw new Error(`unknown item event ${JSON.stringify(event)}`)
}

export function decide(stage: Stage, event: ItemEvent): Outcome {
  switch (event.type) {
    case 'triage':
      return decideTriage(stage, event)
    case 'approve':
      return decideApprove(stage, event)
    case 'reject':
      return decideReject(stage, event)
    case 'revise':
      return decideRevise(stage, event)
    case 'plan_ready':
      return decidePlanReady(stage, event)
    case 'built':
      return decideBuilt(stage, event)
    case 'merge':
      return decideMerge(stage, event)
    case 'retry':
      return decideRetry(stage, event)
    case 'abort':
      return decideAbort(stage)
  }
  // The switch above is exhaustive, so only an event from outside the type system gets here.
  return unknownEvent(event)
}

export function nextStage(stage: Stage, outcome: Outcome): Stage {
  return outcome.kind === 'moved' ? outcome.to : stage
}

export function transition(stage: Stage, event: ItemEvent): Stage {
  return nextStage(stage, decide(stage, event))
}
