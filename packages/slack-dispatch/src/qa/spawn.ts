// The real process, port and HTTP behind the dev server starter. Kept apart from the starter so that its tests can
// use fakes, and tested on their own with a tiny server of their own.

import type { Buffer } from 'node:buffer'
import type { DevServerDeps, ServerProcess } from './devserver.ts'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import process from 'node:process'
import { agentEnv } from '../exec/env.ts'

const PROBE_TIMEOUT_MS = 5000

function startProcess(
  command: string,
  args: readonly string[],
  options: { cwd: string; env: Readonly<Record<string, string>> },
): ServerProcess {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => agentEnv(name)))
  // Its own process group, so that stopping it also stops what a package script started.
  const child = spawn(command, [...args], {
    cwd: options.cwd,
    env: { ...inherited, ...options.env },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return {
    onOutput: (listener) => {
      child.stdout.on('data', (chunk: Buffer) => {
        listener(chunk.toString())
      })
      child.stderr.on('data', (chunk: Buffer) => {
        listener(chunk.toString())
      })
    },
    onExit: (listener) => {
      child.on('exit', listener)
      // A program that cannot even start is an exit too.
      child.on('error', () => {
        listener(null)
      })
    },
    kill: (signal) => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, signal)
      } catch {
        // It is gone already.
      }
    },
  }
}

export const realDevServerDeps: DevServerDeps = {
  start: startProcess,
  probe: async (url) => {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    return response.status
  },
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms)
    }),
  now: () => Date.now(),
}

// A port nobody listens on right now.
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address !== null && typeof address === 'object') resolve(address.port)
        else reject(new Error('could not find a free port'))
      })
    })
  })
}
