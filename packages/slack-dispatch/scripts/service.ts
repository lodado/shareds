// Has macOS start the service when the owner logs in. Run: node --no-warnings scripts/service.ts install|uninstall|status
// It only touches one file, ~/Library/LaunchAgents/com.<user>.slack-dispatch.plist, and the launchd job of that name.

import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { findOnPath, labelFor, renderPlist, REQUIRED_PROGRAMS, servicePath } from '../src/service/launchd.ts'

const exec = promisify(execFile)
const LAUNCHCTL = '/bin/launchctl'
const STATUS_PORT = process.env.STATUS_PORT ?? '9814'

const label = labelFor(userInfo().username)
const domain = `gui/${process.getuid?.() ?? 501}`
const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`)
const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const logPath = join(homedir(), '.slack-dispatch', 'service.log')

async function launchctl(...args: string[]): Promise<string> {
  const { stdout } = await exec(LAUNCHCTL, args)
  return stdout
}

// Stops the job if it is loaded; there is nothing to stop when it is not.
async function unload(): Promise<void> {
  try {
    await launchctl('bootout', `${domain}/${label}`)
  } catch {
    // Not loaded.
  }
}

function programPaths(): string[] {
  const found = REQUIRED_PROGRAMS.map((name) => ({
    name,
    file: name === 'node' ? process.execPath : findOnPath(name, process.env.PATH ?? '', existsSync),
  }))
  const missing = found.filter((program) => program.file === undefined).map((program) => program.name)
  if (missing.length > 0) throw new Error(`these programs are not on the PATH: ${missing.join(', ')}`)
  return found.flatMap((program) => (program.file === undefined ? [] : [program.file]))
}

async function install(): Promise<void> {
  mkdirSync(dirname(logPath), { recursive: true, mode: 0o700 })
  mkdirSync(dirname(plistPath), { recursive: true })
  const plist = renderPlist({
    label,
    node: process.execPath,
    packageDir,
    logPath,
    path: servicePath(programPaths()),
    home: homedir(),
  })
  await unload()
  writeFileSync(plistPath, plist, { mode: 0o644 })
  await launchctl('bootstrap', domain, plistPath)
  console.warn(`installed ${plistPath}\nlog: ${logPath}\nstatus: http://localhost:${STATUS_PORT}/status`)
}

async function uninstall(): Promise<void> {
  await unload()
  rmSync(plistPath, { force: true })
  console.warn(`removed ${plistPath}`)
}

async function status(): Promise<void> {
  console.warn(existsSync(plistPath) ? `installed: ${plistPath}` : 'not installed')
  try {
    const printed = await launchctl('print', `${domain}/${label}`)
    const keep = printed.split('\n').filter((line) => /state =|pid =|last exit code|runs =/.test(line))
    console.warn(keep.map((line) => line.trim()).join('\n'))
  } catch {
    console.warn('not loaded in launchd')
  }
  try {
    const response = await fetch(`http://localhost:${STATUS_PORT}/health`, { signal: AbortSignal.timeout(3000) })
    console.warn(`health: ${response.status}`)
  } catch {
    console.warn('health: no answer')
  }
}

const commands: Record<string, () => Promise<void>> = { install, uninstall, status }
const command = commands[process.argv[2] ?? '']
if (command === undefined) {
  console.warn('usage: node --no-warnings scripts/service.ts install|uninstall|status')
  process.exitCode = 1
} else {
  await command()
}
