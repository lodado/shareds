// A wrong toggle the generated oracle test must reject: it blocks Set only when disabled and loading
// hold together, instead of when either holds.

import type { ToggleCommand, ToggleState } from './toggle.mts'

export function reduceToggleBlockedOnlyWhenBoth(state: ToggleState, command: ToggleCommand): ToggleState {
  if (command.type === 'load') return { ...state, loading: command.on }
  if (command.type === 'disable') return { ...state, disabled: command.on }
  if (state.disabled && state.loading) return state
  return { ...state, checked: command.next, revision: state.revision + 1 }
}
