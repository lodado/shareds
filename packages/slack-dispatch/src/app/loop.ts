// Runs a job again and again with a pause after each run ends, so two runs of the same job never overlap and a job
// that throws does not stop the loop.

export interface EveryOptions {
  // After a run that threw, wait this long first and double it for each failure in a row, up to the usual pause. Left
  // out, a failed run waits as long as a good one. A Mac that just woke has no network for the first seconds, and
  // waiting a whole pause for that is how a morning of tags arrives hours late.
  retryFromMs?: number
}

export function every(
  ms: number,
  job: () => Promise<void>,
  onError: (error: unknown) => void,
  options: EveryOptions = {},
): () => void {
  let stopped = false
  let failures = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (delay: number): void => {
    if (stopped) return
    timer = setTimeout(run, delay)
  }
  const afterFailure = (): number => {
    failures += 1
    if (options.retryFromMs === undefined) return ms
    return Math.min(ms, options.retryFromMs * 2 ** (failures - 1))
  }
  function run(): void {
    job().then(
      () => {
        failures = 0
        schedule(ms)
      },
      (error: unknown) => {
        onError(error)
        schedule(afterFailure())
      },
    )
  }
  run()
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}

// Runs jobs one at a time, in the order they were asked for. A job that fails does not stop the ones after it.
export function createSerial(): <T>(job: () => Promise<T>) => Promise<T> {
  let last: Promise<unknown> = Promise.resolve()
  return <T>(job: () => Promise<T>): Promise<T> => {
    const result = last.then(job, job)
    last = result.catch(() => undefined)
    return result
  }
}
