#!/usr/bin/env node

// Bend 증명 경로의 실행 파일을 확보한다. 고정 버전이 이미 있으면 그대로 쓰고, 없으면 GitHub 릴리스 tar를 받아
// 이 파일에 고정한 sha256으로 검증한 뒤 스킬 전용 캐시에 푼다. bend-lang.com의 `curl | sh`를 거치지 않고,
// 사용자의 ~/.bend·PATH·셸 파일은 건드리지 않는다. 이후 명령은 출력된 절대 경로를 BEND_NO_TELEMETRY=1로 부른다.

import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { resolveExecutable } from './resolve-executable.mjs'

export const BEND_VERSION = '2.0.34'
// bend-lang.com/install.sh v2.0.34가 싣는 릴리스 해시와 같다 (2026-09-30 대조, darwin-arm64는 내려받아 재확인)
export const BEND_SHA256 = {
  'darwin-arm64': 'a60c820c0ced758d8ace839507ff6c508a204ce4ef0f45e1089ed7bc73e8c267',
  'darwin-x64': '066d4a07a1871a2946be8f42f926582bfda5f13ff728c234ffe79635bd240650',
  'linux-arm64': '416a17d282a9fd05ab9637a238b51d5ca508114d9773c37d1c11cad595440ed1',
  'linux-x64': '78106a97af242429dcc057258eb8d10f69cddebcd5e263022185a52d003e09bf',
}

class CliError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

function platformKey(platform, arch) {
  const os = { darwin: 'darwin', linux: 'linux' }[platform]
  const cpu = { arm64: 'arm64', x64: 'x64' }[arch]
  if (!os || !cpu) {
    throw new CliError(
      'BEND_UNSUPPORTED_PLATFORM',
      `${platform}-${arch}: Bend ships only for darwin·linux on arm64·x64`,
    )
  }
  return `${os}-${cpu}`
}

function reportedVersion(bin, env) {
  const probe = spawnSync(bin, ['version'], {
    encoding: 'utf8',
    env: { ...env, BEND_NO_TELEMETRY: '1' },
    timeout: 10_000,
  })
  return probe.status === 0 ? probe.stdout.trim().match(/^bend (\S+)$/)?.[1] ?? null : null
}

function onPath(env) {
  try {
    return [resolveExecutable('bend', { env })]
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return []
  }
}

async function fetchRelease(url) {
  let response
  try {
    response = await fetch(url, { redirect: 'follow' })
  } catch (error) {
    throw new CliError('BEND_DOWNLOAD_FAILED', `${url}: ${error.cause?.message ?? error.message}`)
  }
  if (!response.ok) throw new CliError('BEND_DOWNLOAD_FAILED', `${url}: HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

export async function ensureBend({
  cacheDir = join(homedir(), '.cache', 'frontend-oracle-design', `bend-${BEND_VERSION}`),
  env = process.env,
  platform = process.platform,
  arch = process.arch,
  checksums = BEND_SHA256,
  download = fetchRelease,
} = {}) {
  const bin = join(cacheDir, 'bin', 'bend')
  const userHome = env.BEND_HOME || join(homedir(), '.bend')
  for (const candidate of [...onPath(env), join(userHome, 'bin', 'bend'), bin]) {
    if (reportedVersion(candidate, env) === BEND_VERSION) return { bin: candidate, installed: false }
  }

  const key = platformKey(platform, arch)
  const name = `bend-${BEND_VERSION}-${key}.tar.gz`
  const archive = await download(`https://github.com/bendlang/bend/releases/download/v${BEND_VERSION}/${name}`)
  const actual = createHash('sha256').update(archive).digest('hex')
  if (actual !== checksums[key]) {
    throw new CliError(
      'BEND_CHECKSUM_MISMATCH',
      `${name} has sha256 ${actual}, pinned ${checksums[key]}; nothing installed`,
    )
  }

  await mkdir(cacheDir, { recursive: true })
  const staging = await mkdtemp(join(cacheDir, 'tmp.'))
  try {
    await writeFile(join(staging, name), archive)
    const unpacked = spawnSync(resolveExecutable('tar', { env }), ['-xzf', join(staging, name), '-C', staging], {
      encoding: 'utf8',
    })
    if (unpacked.status !== 0)
      throw new CliError('BEND_INSTALL_FAILED', unpacked.stderr.trim() || `tar exited ${unpacked.status}`)
    await mkdir(join(cacheDir, 'bin'), { recursive: true })
    for (const directory of ['bend2', 'guide']) {
      await rm(join(cacheDir, directory), { recursive: true, force: true })
      await rename(join(staging, 'bend', directory), join(cacheDir, directory))
    }
    await rename(join(staging, 'bend', 'bin', 'bend'), bin)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }

  const installed = reportedVersion(bin, env)
  if (installed !== BEND_VERSION) {
    throw new CliError(
      'BEND_INSTALL_FAILED',
      `${bin} reports ${installed ?? 'no version'} after install, pinned ${BEND_VERSION}`,
    )
  }
  return { bin, installed: true }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 2) throw new CliError('USAGE', 'ensure-bend.mjs takes no arguments', 2)
    const { bin, installed } = await ensureBend()
    process.stdout.write(`BEND_READY ${bin} version:${BEND_VERSION} installed:${installed}\n`)
  } catch (error) {
    const cliError =
      error instanceof CliError ? error : new CliError('BEND_INSTALL_FAILED', error.message ?? String(error))
    process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
    process.exitCode = cliError.exitCode
  }
}
