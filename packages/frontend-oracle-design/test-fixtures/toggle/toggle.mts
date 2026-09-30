// Fixture product code: the toggle state a switch component would reduce its events with. The
// generated oracle test runs this, not the Bend model. `revision` is operational metadata the
// projection leaves out.

export type ToggleState = {
  readonly checked: boolean
  readonly disabled: boolean
  readonly loading: boolean
  readonly revision: number
}
export type ToggleCommand =
  | { readonly type: 'set'; readonly next: boolean }
  | { readonly type: 'load'; readonly on: boolean }
  | { readonly type: 'disable'; readonly on: boolean }

export function reduceToggle(state: ToggleState, command: ToggleCommand): ToggleState {
  if (command.type === 'load') return { ...state, loading: command.on }
  if (command.type === 'disable') return { ...state, disabled: command.on }
  if (state.disabled || state.loading) return state
  return { ...state, checked: command.next, revision: state.revision + 1 }
}
