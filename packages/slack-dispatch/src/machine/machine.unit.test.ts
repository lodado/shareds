import type { ItemEvent, Outcome, Stage } from './machine'
import { describe, expect, it } from 'vitest'
import { decide, INITIAL_STAGE, nextStage, transition } from './machine'

// Events come from Slack payloads that were validated, but the function is also the last guard before a
// stage change, so values outside its types must fail closed. This is the one place a value of unknown shape is
// handed to decide(), to prove that.
function decideWire(stage: Stage, json: string): Outcome {
  const event: unknown = JSON.parse(json)
  // @ts-expect-error the event is deliberately not an ItemEvent
  return decide(stage, event)
}

const moved = (to: Stage): Outcome => ({ kind: 'moved', to })
const refused = (reason: Extract<Outcome, { kind: 'refused' }>['reason']): Outcome => ({ kind: 'refused', reason })

describe('the initial stage as the stage of a new item', () => {
  it('to be ingested', () => {
    expect(INITIAL_STAGE).toBe('ingested')
  })
})

describe('decide as a frozen event', () => {
  // A frozen event throws on any write in strict mode, so a decision that edits its input fails here.
  const cases: ReadonlyArray<readonly [Stage, ItemEvent, Outcome]> = [
    ['ingested', { type: 'triage', handled: false, confident: true }, moved('planning')],
    ['ingested', { type: 'triage', handled: false, confident: false }, moved('notified')],
    ['ingested', { type: 'triage', handled: true, confident: true }, moved('skipped')],
    ['notified', { type: 'approve', owner: true, card: 'assign', fresh: true }, moved('planning')],
    ['planning', { type: 'plan_ready', current: true }, moved('planned')],
    ['planning', { type: 'revise', owner: true }, { kind: 'stayed' }],
    ['planned', { type: 'approve', owner: true, card: 'plan', fresh: true }, moved('implementing')],
    ['planned', { type: 'revise', owner: true }, moved('planning')],
    ['implementing', { type: 'reject', owner: true }, moved('declined')],
    ['implementing', { type: 'built', ok: true }, moved('pr_open')],
    ['pr_open', { type: 'reject', owner: true }, moved('declined')],
    ['pr_open', { type: 'merge', owner: true, ci: true, review: true }, moved('merged')],
    ['failed', { type: 'retry', owner: true, allowed: true }, moved('planning')],
    ['notified', { type: 'abort' }, moved('failed')],
  ]

  it.each(cases)('to be the same outcome and an untouched event for %s and %j', (stage, event, outcome) => {
    const frozen = Object.freeze({ ...event })
    expect(decide(stage, frozen)).toEqual(outcome)
    expect(frozen).toEqual(event)
  })
})

describe('decide as the reason an event is refused', () => {
  it('to be not_owner for a sender who is not the owner, even on a finished item', () => {
    expect(decide('merged', { type: 'reject', owner: false })).toEqual(refused('not_owner'))
    expect(decide('planned', { type: 'approve', owner: false, card: 'plan', fresh: true })).toEqual(
      refused('not_owner'),
    )
    expect(decide('failed', { type: 'retry', owner: false, allowed: true })).toEqual(refused('not_owner'))
  })

  it("to be finished for the owner's event on a merged, skipped or declined item", () => {
    for (const stage of ['merged', 'skipped', 'declined'] as const) {
      expect(decide(stage, { type: 'reject', owner: true })).toEqual(refused('finished'))
      expect(decide(stage, { type: 'abort' })).toEqual(refused('finished'))
    }
  })

  it('to be wrong_stage for an event the stage does not take, before it is checked for staleness', () => {
    expect(decide('notified', { type: 'approve', owner: true, card: 'plan', fresh: false })).toEqual(
      refused('wrong_stage'),
    )
    expect(decide('planned', { type: 'approve', owner: true, card: 'assign', fresh: true })).toEqual(
      refused('wrong_stage'),
    )
    expect(decide('ingested', { type: 'built', ok: true })).toEqual(refused('wrong_stage'))
    expect(decide('failed', { type: 'abort' })).toEqual(refused('wrong_stage'))
  })

  it('to be stale for an old card or an old plan at the right stage', () => {
    expect(decide('notified', { type: 'approve', owner: true, card: 'assign', fresh: false })).toEqual(refused('stale'))
    expect(decide('planned', { type: 'approve', owner: true, card: 'plan', fresh: false })).toEqual(refused('stale'))
    expect(decide('planning', { type: 'plan_ready', current: false })).toEqual(refused('stale'))
  })

  it('to be gate_not_met when CI or review is missing, or when no retry is left', () => {
    expect(decide('pr_open', { type: 'merge', owner: true, ci: false, review: true })).toEqual(refused('gate_not_met'))
    expect(decide('pr_open', { type: 'merge', owner: true, ci: true, review: false })).toEqual(refused('gate_not_met'))
    expect(decide('failed', { type: 'retry', owner: true, allowed: false })).toEqual(refused('gate_not_met'))
  })
})

describe('nextStage and transition as the stage after an outcome', () => {
  it('to be the target of a move and the same stage for a stay or a refusal', () => {
    expect(nextStage('planned', moved('implementing'))).toBe('implementing')
    expect(nextStage('planning', { kind: 'stayed' })).toBe('planning')
    expect(nextStage('merged', refused('finished'))).toBe('merged')
  })

  it('to be the decided stage of the event', () => {
    expect(transition('pr_open', { type: 'merge', owner: true, ci: true, review: true })).toBe('merged')
    expect(transition('pr_open', { type: 'merge', owner: true, ci: false, review: true })).toBe('pr_open')
  })
})

describe('decide as an event whose flags are not booleans', () => {
  it.each([
    [
      'a string owner on approve',
      'notified',
      '{"type":"approve","owner":"true","card":"assign","fresh":true}',
      refused('not_owner'),
    ],
    [
      'a numeric owner on approve',
      'notified',
      '{"type":"approve","owner":1,"card":"assign","fresh":true}',
      refused('not_owner'),
    ],
    ['a missing owner on reject', 'notified', '{"type":"reject"}', refused('not_owner')],
    ['a string owner on reject', 'notified', '{"type":"reject","owner":"true"}', refused('not_owner')],
    ['a string owner on revise', 'planned', '{"type":"revise","owner":"true"}', refused('not_owner')],
    [
      'a string owner on merge',
      'pr_open',
      '{"type":"merge","owner":"true","ci":true,"review":true}',
      refused('not_owner'),
    ],
    ['a string owner on retry', 'failed', '{"type":"retry","owner":"true","allowed":true}', refused('not_owner')],
    [
      'a string fresh on approve',
      'notified',
      '{"type":"approve","owner":true,"card":"assign","fresh":"true"}',
      refused('stale'),
    ],
    ['a missing fresh on approve', 'planned', '{"type":"approve","owner":true,"card":"plan"}', refused('stale')],
    ['a string current on plan_ready', 'planning', '{"type":"plan_ready","current":"true"}', refused('stale')],
    [
      'a string ci on merge',
      'pr_open',
      '{"type":"merge","owner":true,"ci":"yes","review":true}',
      refused('gate_not_met'),
    ],
    ['a missing review on merge', 'pr_open', '{"type":"merge","owner":true,"ci":true}', refused('gate_not_met')],
    [
      'a string review on merge',
      'pr_open',
      '{"type":"merge","owner":true,"ci":true,"review":"true"}',
      refused('gate_not_met'),
    ],
    ['a string allowed on retry', 'failed', '{"type":"retry","owner":true,"allowed":"true"}', refused('gate_not_met')],
    ['a string ok on built', 'implementing', '{"type":"built","ok":"true"}', moved('failed')],
    ['a string handled on triage', 'ingested', '{"type":"triage","handled":"true","confident":true}', moved('skipped')],
    ['a missing handled on triage', 'ingested', '{"type":"triage","confident":true}', moved('skipped')],
    ['a numeric handled on triage', 'ingested', '{"type":"triage","handled":0,"confident":true}', moved('skipped')],
    [
      'a string confident on triage',
      'ingested',
      '{"type":"triage","handled":false,"confident":"true"}',
      moved('notified'),
    ],
  ] as const)('to be the fail-closed outcome for %s', (_name, stage, json, outcome) => {
    expect(decideWire(stage, json)).toEqual(outcome)
  })
})

describe('decide as an abort that carries an owner flag', () => {
  it('to be a failed item whatever the extra owner value says', () => {
    expect(decideWire('planned', '{"type":"abort","owner":false}')).toEqual(moved('failed'))
  })
})

describe('decide as an event of an unknown type', () => {
  it('to be an error that names the event, at any stage', () => {
    expect(() => decideWire('notified', '{"type":"launch"}')).toThrow('unknown item event {"type":"launch"}')
    expect(() => decideWire('merged', '{"type":"launch"}')).toThrow('unknown item event {"type":"launch"}')
  })
})
