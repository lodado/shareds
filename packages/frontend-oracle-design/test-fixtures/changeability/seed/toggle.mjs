export function toggleDetails(state) {
  return {
    ...state,
    open: !state.open,
    label: state.open ? 'Show details' : 'Hide details',
  }
}
