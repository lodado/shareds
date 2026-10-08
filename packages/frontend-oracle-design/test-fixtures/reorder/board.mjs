// Fixture product: a drag moves the item at `at` one place toward the back.
export function reduceBoard(state, command) {
  const items = [...state.items]
  if (command.at + 1 < items.length) [items[command.at], items[command.at + 1]] = [items[command.at + 1], items[command.at]]
  return { ...state, items }
}

/** Mutant: on a long board a drag past the third place overwrites the neighbour instead of swapping. */
export function reduceBoardOverwritesFar(state, command) {
  const items = [...state.items]
  if (command.at + 1 < items.length && items.length > 4 && command.at >= 3) items[command.at + 1] = items[command.at]
  else if (command.at + 1 < items.length) [items[command.at], items[command.at + 1]] = [items[command.at + 1], items[command.at]]
  return { ...state, items }
}
