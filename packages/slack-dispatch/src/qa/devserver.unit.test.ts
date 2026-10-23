import type { DevServerDeps, DevServerOptions, ServerProcess } from './devserver'
import { describe, expect, it } from 'vitest'
import { createDevServerStarter, DevServerError, printedPort } from './devserver'

// A program the test drives by hand, and a clock that moves only when the starter sleeps.
class FakeProcess implements ServerProcess {
  readonly signals: string[] = []
  private output: (text: string) => void = () => undefined
  private exit: (code: number | null) => void = () => undefined
  // Whether the program ends when it is told to.
  obeys = true

  onOutput(listener: (text: string) => void): void {
    this.output = listener
  }

  onExit(listener: (code: number | null) => void): void {
    this.exit = listener
  }

  kill(signal: 'SIGTERM' | 'SIGKILL'): void {
    this.signals.push(signal)
    if (this.obeys || signal === 'SIGKILL') this.exit(null)
  }

  print(text: string): void {
    this.output(text)
  }

  end(code: number | null): void {
    this.exit(code)
  }
}

interface Rig {
  start: ReturnType<typeof createDevServerStarter>
  process: FakeProcess
  started: { command: string; args: readonly string[]; cwd: string; env: Readonly<Record<string, string>> }[]
  probed: string[]
  clock: { now: number }
}

function rig(probe: (url: string, call: number) => Promise<number>, onSleep?: (clock: { now: number }) => void): Rig {
  const process = new FakeProcess()
  const started: Rig['started'] = []
  const probed: string[] = []
  const clock = { now: 0 }
  const deps: DevServerDeps = {
    start: (command, args, options) => {
      started.push({ command, args, ...options })
      return process
    },
    probe: (url) => {
      probed.push(url)
      return probe(url, probed.length)
    },
    sleep: (ms) => {
      clock.now += ms
      onSleep?.(clock)
      return Promise.resolve()
    },
    now: () => clock.now,
  }
  return { start: createDevServerStarter(deps), process, started, probed, clock }
}

const options = (overrides: Partial<DevServerOptions> = {}): DevServerOptions => ({
  cwd: '/work/wt',
  command: 'pnpm',
  args: ['run', 'dev'],
  port: 4100,
  env: { EXTRA: 'x' },
  timeoutMs: 10_000,
  ...overrides,
})

describe('printedPort as the address a dev server says it listens on', () => {
  it.each([
    ['  ▲ Next.js\n  - Local:        http://localhost:3001\n', 3001],
    ['Local: http://127.0.0.1:5173/', 5173],
    ['listening on https://localhost:8443', 8443],
  ])('to be the port in %j', (output, port) => {
    expect(printedPort(output)).toBe(port)
  })

  it.each(['', 'ready', 'http://example.com:3000', 'http://localhost', 'http://localhost:0', 'http://localhost:70000'])(
    'to be nothing in %j',
    (output) => {
      expect(printedPort(output)).toBeNull()
    },
  )
})

describe('createDevServerStarter as the start of a dev server', () => {
  it('to be ready at the asked-for port once the address answers, started with the port in its environment', async () => {
    const r = rig(() => Promise.resolve(200))
    const server = await r.start(options())
    expect(server.baseUrl).toBe('http://localhost:4100')
    expect(r.started).toStrictEqual([
      { command: 'pnpm', args: ['run', 'dev'], cwd: '/work/wt', env: { EXTRA: 'x', PORT: '4100' } },
    ])
  })

  it('to be at the port the program printed when that differs from the one asked for', async () => {
    const r = rig(
      (url) => (url.endsWith(':4100') ? Promise.reject(new Error('refused')) : Promise.resolve(200)),
      () => {
        r.process.print('Local: http://localhost:3999\n')
      },
    )
    const server = await r.start(options())
    expect(server.baseUrl).toBe('http://localhost:3999')
    expect(r.probed).toStrictEqual(['http://localhost:4100', 'http://localhost:3999'])
  })

  it('to be waited for while nothing answers or the answer is a server error, then ready', async () => {
    const answers = [Promise.reject(new Error('refused')), Promise.resolve(502), Promise.resolve(404)]
    const r = rig((_url, call) => answers[call - 1] ?? Promise.resolve(200))
    const server = await r.start(options())
    expect(r.probed).toHaveLength(3)
    expect(server.baseUrl).toBe('http://localhost:4100')
    expect(r.clock.now).toBe(1000)
  })

  it('to be an error with the last of its output when the program exits before it is ready', async () => {
    const r = rig(
      () => Promise.reject(new Error('refused')),
      () => {
        r.process.print('Error: next: command not found\n')
        r.process.end(127)
      },
    )
    await expect(r.start(options())).rejects.toThrow(
      'the dev server exited with code 127: Error: next: command not found',
    )
  })

  it('to be an error, with the program stopped, when it does not answer in time', async () => {
    const r = rig(() => Promise.reject(new Error('refused')))
    const failure = await r.start(options({ timeoutMs: 3000 })).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(DevServerError)
    expect(failure).toMatchObject({ message: 'the dev server did not answer within 3 seconds: ' })
    expect(r.process.signals).toStrictEqual(['SIGTERM'])
  })

  it('to be an error, with the program stopped, when the QA run was stopped meanwhile', async () => {
    const controller = new AbortController()
    const r = rig(
      () => Promise.reject(new Error('refused')),
      () => {
        controller.abort()
      },
    )
    await expect(r.start(options({ signal: controller.signal }))).rejects.toThrow(
      'the dev server was stopped before it was ready',
    )
    expect(r.process.signals).toStrictEqual(['SIGTERM'])
  })
})

describe('createDevServerStarter as the stop of a dev server', () => {
  it('to be a polite stop that is enough when the program obeys', async () => {
    const r = rig(() => Promise.resolve(200))
    const server = await r.start(options())
    await server.stop()
    expect(r.process.signals).toStrictEqual(['SIGTERM'])
  })

  it('to be a forced stop after five seconds when the program ignores the polite one', async () => {
    const r = rig(() => Promise.resolve(200))
    r.process.obeys = false
    const server = await r.start(options())
    await server.stop()
    expect(r.process.signals).toStrictEqual(['SIGTERM', 'SIGKILL'])
    expect(r.clock.now).toBeGreaterThanOrEqual(5000)
  })

  it('to be nothing to do when the program already ended', async () => {
    const r = rig(() => Promise.resolve(200))
    const server = await r.start(options())
    r.process.end(0)
    await server.stop()
    expect(r.process.signals).toStrictEqual([])
  })
})
