export function subscribe(start, report, onError) {
  const stop = start(report, onError)
  return () => stop()
}
