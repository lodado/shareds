import { afterEach, describe, expect, it, vi } from 'vitest'
import { every } from './loop'

afterEach(() => {
  vi.useRealTimers()
})

describe('every as a job that repeats', () => {
  it('to be run at once and then again after each pause', async () => {
    vi.useFakeTimers()
    let runs = 0
    const stop = every(
      1000,
      () => {
        runs += 1
        return Promise.resolve()
      },
      () => undefined,
    )
    expect(runs).toBe(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(runs).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(runs).toBe(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(runs).toBe(3)
    stop()
  })

  it('to be never overlapping: the pause starts only when the run ends', async () => {
    vi.useFakeTimers()
    const gates: (() => void)[] = []
    let running = 0
    let peak = 0
    let runs = 0
    const stop = every(
      100,
      async () => {
        runs += 1
        running += 1
        peak = Math.max(peak, running)
        await new Promise<void>((resolve) => gates.push(resolve))
        running -= 1
      },
      () => undefined,
    )
    await vi.advanceTimersByTimeAsync(1000)
    expect([runs, peak]).toStrictEqual([1, 1])
    gates[0]?.()
    await vi.advanceTimersByTimeAsync(99)
    expect(runs).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect([runs, peak]).toStrictEqual([2, 1])
    stop()
  })

  it('to be kept going, with the error reported, when a run throws', async () => {
    vi.useFakeTimers()
    const errors: string[] = []
    let runs = 0
    const stop = every(
      10,
      () => {
        runs += 1
        return runs === 1 ? Promise.reject(new Error('first failed')) : Promise.resolve()
      },
      (error) => errors.push(error instanceof Error ? error.message : String(error)),
    )
    await vi.advanceTimersByTimeAsync(25)
    expect(errors).toStrictEqual(['first failed'])
    expect(runs).toBe(3)
    stop()
  })

  it('to be stopped for good by the returned function', async () => {
    vi.useFakeTimers()
    let runs = 0
    const stop = every(
      10,
      () => {
        runs += 1
        return Promise.resolve()
      },
      () => undefined,
    )
    await vi.advanceTimersByTimeAsync(10)
    stop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(runs).toBe(2)
  })

  it('to be stopped even if the stop comes while a run is going', async () => {
    vi.useFakeTimers()
    const gates: (() => void)[] = []
    let runs = 0
    const stop = every(
      10,
      async () => {
        runs += 1
        await new Promise<void>((resolve) => gates.push(resolve))
      },
      () => undefined,
    )
    stop()
    gates[0]?.()
    await vi.advanceTimersByTimeAsync(1000)
    expect(runs).toBe(1)
  })
})
