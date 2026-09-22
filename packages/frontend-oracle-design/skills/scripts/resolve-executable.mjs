import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import process from 'node:process'

function executableCandidate(candidate) {
  try {
    accessSync(candidate, constants.X_OK)
    return statSync(candidate).isFile()
  } catch (error) {
    if (!['EACCES', 'ENOENT', 'ENOTDIR'].includes(error.code)) throw error
    return false
  }
}

export function resolveExecutable(name, { env = process.env, cwd = process.cwd(), platform = process.platform } = {}) {
  const getEnv = (name) => {
    if (platform !== 'win32') return env[name]
    const key = Object.keys(env).find((candidate) => candidate.toLowerCase() === name.toLowerCase())
    return key ? env[key] : undefined
  }
  const extensions = platform === 'win32' ? (getEnv('PATHEXT') ?? '.EXE;.CMD;.BAT').split(';') : ['']
  const defaultPath = platform === 'win32' ? process.env.PATH ?? '' : '/usr/bin:/bin'
  const pathValue = getEnv('PATH') ?? defaultPath
  const pathDelimiter = platform === 'win32' ? ';' : delimiter
  for (const directory of pathValue.split(pathDelimiter)) {
    for (const extension of extensions) {
      const candidate = resolve(cwd, join(directory || '.', `${name}${extension}`))
      if (executableCandidate(candidate)) return candidate
    }
  }
  const error = new Error(`Unable to resolve ${name} from PATH`)
  error.code = 'ENOENT'
  throw error
}

export function spawnGit(args, options) {
  try {
    const env = options?.env ?? process.env
    const cwd = options?.cwd ?? process.cwd()
    return spawnSync(resolveExecutable('git', { env, cwd }), args, options)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    const empty = options?.encoding ? '' : Buffer.alloc(0)
    const stderr = options?.encoding ? error.message : Buffer.from(error.message)
    return { status: null, stdout: empty, stderr, error }
  }
}
