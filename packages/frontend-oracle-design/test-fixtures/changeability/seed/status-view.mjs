export function mountBalance(sdk, render, audit) {
  let disposed = false
  const stop = sdk.watch(([phase, amount, error]) => {
    if (disposed) return
    if (phase === 'pending') {
      render({ kind: 'loading' })
    } else if (phase === 'ok') {
      render({ kind: 'ready', text: `$${(amount / 100).toFixed(2)}` })
      audit('balance.ready')
    } else if (phase === 'denied') {
      render({ kind: 'error', text: 'Not allowed' })
    } else if (phase === 'offline') {
      render({ kind: 'error', text: 'Try again' })
    } else {
      throw error
    }
  })
  return () => {
    if (disposed) return
    disposed = true
    stop()
  }
}
