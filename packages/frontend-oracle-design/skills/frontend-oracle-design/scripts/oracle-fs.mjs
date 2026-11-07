import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function stableStringify(value) {
  return serialize(value, null)
}

/**
 * 같은 결과, 한 번의 호출 안에서 같은 객체 참조를 한 번만 직렬화한다 — 공간의 trace·관찰은 접두를 공유하므로 수십만 case가
 * 같은 객체를 가리킨다. 호출 중에는 값을 바꾸지 않는다는 전제다(캐시는 호출이 끝나면 사라진다).
 */
export function stableStringifyShared(value) {
  return serialize(value, new WeakMap())
}

function serializeArray(value, memo) {
  let text = '['
  for (let index = 0; index < value.length; index += 1) {
    if (index > 0) text += ','
    // 구멍은 Array#map·join이 빈 문자열로 내던 그대로 둔다
    if (index in value) text += serialize(value[index], memo) ?? 'null'
  }
  return `${text}]`
}

function serializeObject(value, memo) {
  let text = '{'
  let first = true
  for (const key of Object.keys(value).sort()) {
    const serialized = serialize(value[key], memo)
    if (serialized === undefined) continue
    text += `${first ? '' : ','}${JSON.stringify(key)}:${serialized}`
    first = false
  }
  return `${text}}`
}

function serialize(value, memo) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  const known = memo?.get(value)
  if (known !== undefined) return known
  const text = Array.isArray(value) ? serializeArray(value, memo) : serializeObject(value, memo)
  memo?.set(value, text)
  return text
}

function isPathInside(base, target) {
  const path = relative(resolve(base), resolve(target))
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

function reject(options, message, cause) {
  const error = options.fail ? options.fail(message) : new Error(message)
  if (cause !== undefined && error.cause === undefined) error.cause = cause
  throw error
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
}

async function pathState(path, options) {
  try {
    return await lstat(path)
  } catch (error) {
    return reject(options, `${options.label}: cannot stat ${path}: ${error.message}`, error)
  }
}

export async function snapshotRegularFile(path, options = {}) {
  const target = resolve(path)
  const settings = { allowHardlinks: true, label: 'file', ...options }
  const before = await pathState(target, settings)
  if (before.isSymbolicLink() || !before.isFile()) {
    reject(settings, `${settings.label}: ${target} must be a regular non-symlink file`)
  }
  if (!settings.allowHardlinks && before.nlink !== 1) {
    reject(settings, `${settings.label}: ${target} must not have hardlink aliases`)
  }

  let realBase = null
  let realTarget
  try {
    ;[realBase, realTarget] = await Promise.all([
      settings.base ? realpath(resolve(settings.base)) : Promise.resolve(null),
      realpath(target),
    ])
  } catch (error) {
    reject(settings, `${settings.label}: cannot resolve ${target}: ${error.message}`, error)
  }
  if (realBase && !isPathInside(realBase, realTarget)) {
    reject(settings, `${settings.label}: ${target} must stay inside ${realBase}`)
  }

  let handle
  try {
    handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  } catch (error) {
    reject(settings, `${settings.label}: cannot open ${target} without following links: ${error.message}`, error)
  }

  try {
    const opened = await handle.stat()
    if (!opened.isFile() || !sameIdentity(before, opened)) {
      reject(settings, `${settings.label}: ${target} changed while it was opened`)
    }
    if (!settings.allowHardlinks && opened.nlink !== 1) {
      reject(settings, `${settings.label}: ${target} gained hardlink aliases while it was opened`)
    }
    const bytes = await handle.readFile()
    const afterRead = await handle.stat()
    if (!sameIdentity(opened, afterRead)) {
      reject(settings, `${settings.label}: ${target} changed while it was read`)
    }
    if (!settings.allowHardlinks && afterRead.nlink !== 1) {
      reject(settings, `${settings.label}: ${target} gained hardlink aliases while it was read`)
    }
    const [afterPath, finalRealTarget] = await Promise.all([stat(target), realpath(target)])
    if (!sameIdentity(opened, afterPath) || finalRealTarget !== realTarget) {
      reject(settings, `${settings.label}: ${target} changed during verification`)
    }
    if (!settings.allowHardlinks && afterPath.nlink !== 1) {
      reject(settings, `${settings.label}: ${target} gained hardlink aliases during verification`)
    }
    return {
      path: target,
      realPath: realTarget,
      bytes,
      sha256: sha256(bytes),
      size: opened.size,
      dev: opened.dev,
      ino: opened.ino,
      nlink: opened.nlink,
    }
  } finally {
    await handle.close()
  }
}

export async function assertSnapshotUnchanged(snapshot, options = {}) {
  const current = await snapshotRegularFile(snapshot.path, {
    allowHardlinks: options.allowHardlinks ?? false,
    label: options.label ?? 'file',
    base: options.base,
    fail: options.fail,
  })
  if (
    current.realPath !== snapshot.realPath ||
    current.dev !== snapshot.dev ||
    current.ino !== snapshot.ino ||
    current.size !== snapshot.size ||
    current.sha256 !== snapshot.sha256
  ) {
    reject(options, `${options.label ?? 'file'}: ${snapshot.path} changed during verification`)
  }
  return current
}
