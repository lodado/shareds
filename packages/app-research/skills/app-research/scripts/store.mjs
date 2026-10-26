import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'

const LOCK_ATTEMPTS = 100
const LOCK_WAIT_MS = 50

export const pad = (n, width) => String(n).padStart(width, '0')

export async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) return fallback
    if (error.code === 'ENOENT') throw new Error(`Missing file: ${path}`, { cause: error })
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON in ${path}: ${error.message}`, { cause: error })
    throw error
  }
}

export async function writeJson(path, value) {
  const temp = `${path}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`)
  await rename(temp, path)
}

export async function readJsonl(path) {
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch (error) {
        throw new Error(`Invalid JSON on line ${index + 1} of ${path}: ${error.message}`, { cause: error })
      }
    })
}

export const appendJsonl = (path, value) => appendFile(path, `${JSON.stringify(value)}\n`)

/** Runs `work` while holding an exclusive lock on the run, so two commands never interleave their writes. */
export async function withRunLock(runDir, work) {
  const lock = join(resolve(runDir), '.lock')
  for (let attempt = 1; ; attempt += 1) {
    try {
      await mkdir(lock)
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (attempt >= LOCK_ATTEMPTS) {
        throw new Error(`Run is locked by another command (${lock}). If no command is running, remove that folder.`, {
          cause: error,
        })
      }
      await sleep(LOCK_WAIT_MS)
    }
  }
  try {
    return await work()
  } finally {
    await rm(lock, { recursive: true, force: true })
  }
}
