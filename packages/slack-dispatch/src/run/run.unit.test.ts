import type { RunEvent, RunState } from './run'
import { describe, expect, it } from 'vitest'
import { INITIAL_RUN_STATE, isRunState, RUN_STATES, runTransition } from './run'

// The flags are computed by the server, but a value outside the types must fail closed. This is the one place a
// value of unknown shape is handed to runTransition(), to prove that.
function runWire(state: string, eventJson: string): RunState {
  const event: unknown = JSON.parse(eventJson)
  // @ts-expect-error the state and the event are deliberately not a RunState and a RunEvent
  return runTransition(state, event)
}

describe('the initial run state as the state of a new run', () => {
  it('to be requested', () => {
    expect(INITIAL_RUN_STATE).toBe('requested')
  })
})

describe('runTransition as a frozen event', () => {
  // A frozen event throws on any write in strict mode, so a transition that edits its input fails here.
  const cases: ReadonlyArray<readonly [RunState, RunEvent, RunState]> = [
    ['requested', { type: 'start', registered: true, allowed: true, valid: true, free: true }, 'running'],
    ['requested', { type: 'start', registered: true, allowed: true, valid: true, free: false }, 'rejected'],
    ['running', { type: 'finish', ok: true, valid: true }, 'succeeded'],
    ['running', { type: 'cancel' }, 'failed'],
    ['running', { type: 'finish', ok: false, valid: true }, 'failed'],
    ['running', { type: 'finish', ok: true, valid: false }, 'failed'],
    ['requested', { type: 'cancel' }, 'rejected'],
  ]

  it.each(cases)('to be %s -> the same next state and an untouched event for %j', (state, event, next) => {
    const frozen = Object.freeze({ ...event })
    expect(runTransition(state, frozen)).toBe(next)
    expect(frozen).toEqual(event)
  })
})

describe('runTransition as an event whose flags are not booleans', () => {
  it.each([
    ['a string registered flag', '{"type":"start","registered":"true","allowed":true,"valid":true,"free":true}'],
    ['a missing free flag', '{"type":"start","registered":true,"allowed":true,"valid":true}'],
    ['a numeric allowed flag', '{"type":"start","registered":true,"allowed":1,"valid":true,"free":true}'],
    ['a string valid flag', '{"type":"start","registered":true,"allowed":true,"valid":"true","free":true}'],
    ['a string free flag', '{"type":"start","registered":true,"allowed":true,"valid":true,"free":"true"}'],
  ])('to be rejected for %s', (_name, json) => {
    expect(runWire('requested', json)).toBe('rejected')
  })

  it('to be a failed run for a finish whose ok or valid is not the boolean true', () => {
    expect(runWire('running', '{"type":"finish","ok":"true","valid":true}')).toBe('failed')
    expect(runWire('running', '{"type":"finish","ok":true,"valid":"true"}')).toBe('failed')
    expect(runWire('running', '{"type":"finish","ok":true}')).toBe('failed')
  })

  it('to be a run that a cancel before the start keeps from ever starting', () => {
    const cancelled = runWire('requested', '{"type":"cancel"}')
    expect(cancelled).toBe('rejected')
    expect(runWire(cancelled, '{"type":"start","registered":true,"allowed":true,"valid":true,"free":true}')).toBe(
      'rejected',
    )
  })
})

describe('runTransition as a state outside the known five', () => {
  it('to be an error that names the state', () => {
    expect(() => runWire('paused', '{"type":"cancel"}')).toThrow('unknown run state "paused"')
  })
})

describe('isRunState as the guard on a state read from the store', () => {
  it('to be true for every state of the lifecycle, in lifecycle order', () => {
    expect(RUN_STATES).toStrictEqual(['requested', 'running', 'succeeded', 'failed', 'rejected'])
    expect(RUN_STATES.every(isRunState)).toBe(true)
  })

  it.each(['', 'Running', 'done', 'toString', '__proto__', 'constructor', 5, null, undefined])(
    'to be false for %j, which is not a state',
    (value) => {
      expect(isRunState(value)).toBe(false)
    },
  )
})
