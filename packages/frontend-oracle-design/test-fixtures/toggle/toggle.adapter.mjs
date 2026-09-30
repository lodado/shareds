// Projection boundary between the Bend model and the toggle reducer — the one hand-written piece of the
// generated test. concretize builds a product state from a model state, project reads the model state
// back (checked, disabled, loading; revision is operational metadata), step maps a model command to a
// product call. An unmapped command throws — an adapter that guesses would turn a harness gap into a pass.

import { reduceToggle } from './toggle.mts'
import { reduceToggleBlockedOnlyWhenBoth } from './toggle.mutants.mts'

const COMMANDS = {
  Set: (command) => ({ type: 'set', next: command.next }),
  Load: (command) => ({ type: 'load', on: command.on }),
  Disable: (command) => ({ type: 'disable', on: command.on }),
}

export function adapterFor(reduce) {
  return {
    concretize: (state) => ({ checked: state.checked, disabled: state.disabled, loading: state.loading, revision: 0 }),
    step(state, command) {
      const toProduct = COMMANDS[command.$]
      if (!toProduct) throw new Error(`unmapped model command ${JSON.stringify(command)}`)
      return reduce(state, toProduct(command))
    },
    project: (state) => ({ $: 'Toggle', checked: state.checked, disabled: state.disabled, loading: state.loading }),
  }
}

export const { concretize, step, project } = adapterFor(reduceToggle)
export const mutants = { blockedOnlyWhenBoth: adapterFor(reduceToggleBlockedOnlyWhenBoth) }
