// Starts the repository's own dev server for Visual QA and stops it again. It is the one place that keeps a program
// running, so the process, the clock and the HTTP call are passed in and the tests never start anything.

export interface ServerProcess {
  onOutput: (listener: (text: string) => void) => void
  onExit: (listener: (code: number | null) => void) => void
  // Ends the program and everything it started.
  kill: (signal: 'SIGTERM' | 'SIGKILL') => void
}

export interface DevServerDeps {
  start: (
    command: string,
    args: readonly string[],
    options: { cwd: string; env: Readonly<Record<string, string>> },
  ) => ServerProcess
  // Resolves to the HTTP status of the address, or rejects when nothing answers.
  probe: (url: string) => Promise<number>
  sleep: (ms: number) => Promise<void>
  now: () => number
}

export interface DevServerOptions {
  cwd: string
  command: string
  args: readonly string[]
  // The port asked for with the PORT variable; the address the program prints wins if it differs.
  port: number
  env: Readonly<Record<string, string>>
  timeoutMs: number
  signal?: AbortSignal
}

export interface DevServer {
  baseUrl: string
  stop: () => Promise<void>
}

export class DevServerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DevServerError'
  }
}

export type StartDevServer = (options: DevServerOptions) => Promise<DevServer>

const POLL_MS = 500
const STOP_GRACE_MS = 5000
const OUTPUT_TAIL = 400
const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/

const tail = (text: string): string => text.slice(-OUTPUT_TAIL).replaceAll(/\s+/g, ' ').trim()

// The address the program says it listens on, if it said one.
export function printedPort(output: string): number | null {
  const port = Number(LOCAL_URL.exec(output)?.[1])
  if (!Number.isInteger(port) || port <= 0 || port >= 65_536) return null
  return port
}

interface Running {
  output: string
  exited: boolean
  // The exit code once it exited; null when a signal ended it.
  exitCode: number | null
}

export function createDevServerStarter(deps: DevServerDeps): StartDevServer {
  return async (options) => {
    // Written by the listeners below, and read through functions so the compiler does not take the first value for
    // the only one.
    const running: Running = { output: '', exited: false, exitCode: null }
    const hasExited = (): boolean => running.exited
    const child = deps.start(options.command, options.args, {
      cwd: options.cwd,
      env: { ...options.env, PORT: String(options.port) },
    })
    child.onOutput((text) => {
      running.output += text
    })
    child.onExit((code) => {
      running.exited = true
      running.exitCode = code
    })
    const stop = async (): Promise<void> => {
      if (hasExited()) return
      child.kill('SIGTERM')
      const waitedUntil = deps.now() + STOP_GRACE_MS
      while (!hasExited() && deps.now() < waitedUntil) await deps.sleep(100)
      if (!hasExited()) child.kill('SIGKILL')
    }
    const deadline = deps.now() + options.timeoutMs
    while (deps.now() < deadline) {
      if (options.signal?.aborted === true) {
        await stop()
        throw new DevServerError('the dev server was stopped before it was ready')
      }
      if (hasExited()) {
        throw new DevServerError(`the dev server exited with code ${running.exitCode}: ${tail(running.output)}`)
      }
      const baseUrl = `http://localhost:${printedPort(running.output) ?? options.port}`
      const status = await deps.probe(baseUrl).catch(() => null)
      // Any answer below 500 means the server is up; a page that errors is for the review to see.
      if (status !== null && status < 500) return { baseUrl, stop }
      await deps.sleep(POLL_MS)
    }
    await stop()
    const seconds = Math.round(options.timeoutMs / 1000)
    throw new DevServerError(`the dev server did not answer within ${seconds} seconds: ${tail(running.output)}`)
  }
}
