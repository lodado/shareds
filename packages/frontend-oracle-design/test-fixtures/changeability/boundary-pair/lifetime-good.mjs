export function subscribe(start, report, onError) {
  let active = true
  const stop = start(
    (value) => { if (active) report(value) },
    (error) => { if (active) onError(error) },
  )
  return () => {
    if (!active) return
    active = false
    stop()
  }
}
