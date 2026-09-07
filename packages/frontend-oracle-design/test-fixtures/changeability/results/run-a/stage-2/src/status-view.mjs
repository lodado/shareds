export function mountBalance(sdk, render, audit) {
  let disposed = false
  const subscription = sdk.watch((event) => {
    if (disposed) return
    if (event.type === 'waiting') {
      render({ kind: 'loading' })
    } else if (event.type === 'settled') {
      render({ kind: 'ready', text: `$${(Number(event.payload.amount.minor) / 100).toFixed(2)}` })
      audit('balance.ready')
    } else if (event.type === 'rejected') {
      render({ kind: 'error', text: event.code === 'DENIED' ? 'Not allowed' : 'Try again' })
    } else {
      throw event.error
    }
  })
  return () => {
    if (disposed) return
    disposed = true
    subscription.cancel()
  }
}
