// Every outside program (orca, git, gh, claude, security) is started through one function, so tests can replace it
// and no command line or error ever carries a secret.

import { execFile } from 'node:child_process'
import process from 'node:process'
import { redact } from '../store/redact.ts'

export interface RunOptions {
  cwd?: string
  timeoutMs?: number
  input?: string
  env?: Readonly<Record<string, string>>
  // Stops the program when aborted; the call then fails like any other failed program.
  signal?: AbortSignal
  // When given, the program inherits only the environment variables this accepts, by name. Without it everything is
  // inherited.
  inheritEnv?: (name: string) => boolean
}

export interface RunResult {
  stdout: string
  stderr: string
}

export type Run = (file: string, args: readonly string[], options?: RunOptions) => Promise<RunResult>

function describeExit(exitCode: number | null): string {
  if (exitCode === null) return ''
  return ` with exit code ${String(exitCode)}`
}

export class CommandError extends Error {
  readonly file: string
  readonly exitCode: number | null
  readonly stderr: string
  // Some programs (claude, for one) print their verdict on standard output even when they fail.
  readonly stdout: string

  constructor(file: string, exitCode: number | null, stderr: string, stdout = '') {
    super(`${file} failed${describeExit(exitCode)}: ${redact(stderr).slice(0, 500)}`)
    this.name = 'CommandError'
    this.file = file
    this.exitCode = exitCode
    this.stderr = redact(stderr)
    this.stdout = redact(stdout)
  }
}

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024

// The environment the program starts with: ours (all of it, or only what the caller accepts) plus what the caller added.
function childEnv(options: RunOptions): NodeJS.ProcessEnv {
  const { inheritEnv } = options
  const inherited =
    inheritEnv === undefined
      ? process.env
      : Object.fromEntries(Object.entries(process.env).filter(([name]) => inheritEnv(name)))
  return options.env ? { ...inherited, ...options.env } : inherited
}

export const run: Run = (file, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      file,
      [...args],
      {
        cwd: options.cwd,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        signal: options.signal,
        env: childEnv(options),
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ stdout, stderr })
          return
        }
        const code = typeof error.code === 'number' ? error.code : null
        reject(new CommandError(file, code, stderr || error.message, stdout))
      },
    )
    if (options.input !== undefined) child.stdin?.end(options.input)
  })
