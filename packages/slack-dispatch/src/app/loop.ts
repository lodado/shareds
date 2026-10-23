// Runs a job again and again with a pause after each run ends, so two runs of the same job never overlap and a job
// that throws does not stop the loop.

export function every(ms: number, job: () => Promise<void>, onError: (error: unknown) => void): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (): void => {
    if (stopped) return
    timer = setTimeout(run, ms)
  }
  function run(): void {
    job().then(schedule, (error: unknown) => {
      onError(error)
      schedule()
    })
  }
  run()
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}
