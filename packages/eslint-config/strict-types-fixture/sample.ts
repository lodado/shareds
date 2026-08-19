type State = { status: 'editing' } | { status: 'submitting' } | { status: 'failure' }

export function label(state: State) {
  switch (state.status) {
    case 'editing':
      return 'editing'
  }
  return 'unknown'
}
