import { reduceBoard, reduceBoardOverwritesFar } from './board.mjs'

export function adapterFor(reduce) {
  return {
    concretize: (state) => ({ items: [...state.items] }),
    step: (state, command) => {
      if (command.$ !== 'Drag') throw new Error(`unmapped model command ${JSON.stringify(command)}`)
      return reduce(state, { type: 'drag', at: command.at })
    },
    project: (state) => ({ $: 'Board', items: [...state.items] }),
  }
}

export const { concretize, step, project } = adapterFor(reduceBoard)
export const mutants = { overwritesFar: adapterFor(reduceBoardOverwritesFar) }
