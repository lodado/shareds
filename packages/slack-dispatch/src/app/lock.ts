// One service per state folder. A second one would call off the first one's runs as left over from a crash and then
// work the same worktrees, so it must not start.

import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import process from 'node:process'

const LOCK_MODE = 0o600

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // No permission to signal it still means the process exists.
    return error instanceof Error && 'code' in error && error.code === 'EPERM'
  }
}

function holderOf(path: string): number | null {
  try {
    const pid = Number(readFileSync(path, 'utf8').trim())
    if (!Number.isInteger(pid) || pid <= 0) return null
    return pid
  } catch {
    return null
  }
}

// Takes the lock or throws; returns the function that gives it back. A lock left by a process that is gone is taken
// over.
export function acquireLock(path: string, pid = process.pid): () => void {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(path, String(pid), { flag: 'wx', mode: LOCK_MODE })
      return () => {
        if (holderOf(path) === pid) rmSync(path, { force: true })
      }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
      const holder = holderOf(path)
      if (holder !== null && holder !== pid && isAlive(holder)) {
        throw new Error(`another service is already running with this state folder (pid ${holder})`, { cause: error })
      }
      rmSync(path, { force: true })
    }
  }
  throw new Error(`could not take the lock ${path}`)
}
