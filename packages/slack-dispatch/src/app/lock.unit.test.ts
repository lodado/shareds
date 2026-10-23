import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { acquireLock } from './lock'

const directories: string[] = []
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function lockPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'slack-dispatch-lock-'))
  directories.push(dir)
  return join(dir, 'dispatch.lock')
}

// A process id that no process has: the largest id a 32-bit system hands out is far below it.
const GONE = 2_000_000_000

describe('acquireLock as the one-service-per-folder rule', () => {
  it('to be a file holding the pid, removed again when the lock is given back', () => {
    const path = lockPath()
    const release = acquireLock(path, 4242)
    expect(readFileSync(path, 'utf8')).toBe('4242')
    release()
    expect(existsSync(path)).toBe(false)
  })

  it('to be refused while another live process holds it', () => {
    const path = lockPath()
    writeFileSync(path, String(process.ppid))
    expect(() => acquireLock(path, process.pid)).toThrow(
      `another service is already running with this state folder (pid ${process.ppid})`,
    )
    expect(readFileSync(path, 'utf8')).toBe(String(process.ppid))
  })

  it('to be taken over from a process that is gone', () => {
    const path = lockPath()
    writeFileSync(path, String(GONE))
    const release = acquireLock(path, 4242)
    expect(readFileSync(path, 'utf8')).toBe('4242')
    release()
  })

  it.each(['', 'not a number', '-5', '1.5'])('to be taken over from a lock file that says %j', (content) => {
    const path = lockPath()
    writeFileSync(path, content)
    acquireLock(path, 4242)()
    expect(existsSync(path)).toBe(false)
  })

  it('to be left alone by the release of a service that no longer holds it', () => {
    const path = lockPath()
    const release = acquireLock(path, 4242)
    writeFileSync(path, '777')
    release()
    expect(readFileSync(path, 'utf8')).toBe('777')
  })

  it('to be an error for a folder that does not exist', () => {
    expect(() => acquireLock(join(lockPath(), 'missing', 'dispatch.lock'))).toThrow('ENOENT')
  })
})
