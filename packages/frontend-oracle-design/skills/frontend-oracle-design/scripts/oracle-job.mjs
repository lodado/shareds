#!/usr/bin/env node

// 긴 명령의 job — 호스트 명령 한도(Claude Bash 기본 2분, 최대 10분)를 넘는 실행(oracle-run exec·red, emit-trace,
// model space, cross-check, 전체 스위트)을 손으로 짠 `until … sleep` 루프나 파일 mailbox 없이 기다린다. start는 명령을 분리된
// 감독 프로세스에 맡기고 곧바로 job id를 돌려준다. wait는 최대 N초 막다가, 끝났으면 로그 꼬리와 그 명령의 종료 코드를 그대로
// 돌려주고, 아직이면 JOB_RUNNING(종료 코드 75)으로 돌아온다 — 같은 wait를 다시 부른다. 명령 자신의 75는 1로 바꿔 돌려주므로
// 75는 언제나 "아직"이다. 멈춘 명령은 --timeout-seconds(기본 1시간)에 프로세스 그룹째 멈추고, cancel로도 멈출 수 있다.
// 판정은 바꾸지 않는다: 감싼 명령이 원장·상태를 쓴다. 기록과 로그는 사용자 전용 tmp 디렉터리에 둔다(lint 영수증과 같은
// 소유·권한 검사) — 로그는 도구가 출력을 돌려주는 통로일 뿐 run 디렉터리에는 아무것도 만들지 않는다.

import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { lstat, mkdir, open, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { runCli } from './oracle-cli.mjs'

class CliError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

const SCRIPT = fileURLToPath(import.meta.url)
const WINDOWS = process.platform === 'win32'
// 10분 최대 한도 아래에 머문다 — 한도에 잘린 wait는 결과를 잃는다
export const MAX_WAIT_SECONDS = 570
// 기본 wait는 Claude Code의 기본 Bash 한도(120초) 안에서 돌아온다. 길게 막으려면 --max-seconds와 호스트 한도를 함께 늘린다
const DEFAULT_WAIT_SECONDS = 110
const HEARTBEAT_SECONDS = 60
const DEFAULT_TAIL = 80
const TAIL_PRINT_LIMIT = 12_000
export const RUNNING_EXIT = 75
const DEFAULT_TIMEOUT_SECONDS = 3600
const MAX_TIMEOUT_SECONDS = 6 * 3600
const KILL_GRACE_MS = 10_000
// 감독 프로세스가 pid를 적기 전 잠깐은 살아 있는 것으로 본다
const STARTUP_GRACE_MS = 30_000
const TAIL_BYTES = 256 * 1024
const ID = /^j-\d{8}t\d{6}-[0-9a-f]{6}$/

const now = () => new Date().toISOString() // oracle:nondeterminism job 기록은 실제 시각을 남긴다

export function jobDirectory() {
  return resolve(process.env.ORACLE_JOB_DIR || join(tmpdir(), `oracle-jobs-${process.getuid?.() ?? 'user'}`))
}

/** 내 디렉터리인가 — 링크가 아니고, 같은 사용자 소유이고, 다른 사용자가 쓸 수 없다(공용 tmp에 심어 둔 것을 따라가지 않는다). */
async function ownDirectory(directory) {
  try {
    const entry = await lstat(directory)
    if (!entry.isDirectory()) return false
    // Windows에는 uid가 없고 모드 비트가 쓰기 권한을 말하지 않는다 — 사용자별 %TEMP%를 믿는다
    if (WINDOWS) return true
    if (process.getuid && entry.uid !== process.getuid()) return false
    return (entry.mode & 0o022) === 0
  } catch {
    return false
  }
}

async function privateDirectory() {
  const directory = jobDirectory()
  await mkdir(directory, { recursive: true, mode: 0o700 })
  if (!(await ownDirectory(directory))) throw new CliError('JOB_DIR_UNSAFE', `${directory} is not a private directory owned by this user`)
  return directory
}

/** 임시 파일(`wx`: 이미 있으면 실패하고 링크를 따르지 않는다)에 쓴 뒤 이름을 바꾼다 — 읽는 쪽은 반쯤 쓴 기록을 보지 않는다. */
async function writeRecord(directory, record) {
  const temporary = join(directory, `.${record.id}.${process.pid}.${randomBytes(4).toString('hex')}`)
  await writeFile(temporary, `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 })
  await rename(temporary, join(directory, `${record.id}.json`))
}

async function readRecord(directory, id) {
  if (!ID.test(id ?? '')) throw new CliError('USAGE', `not a job id: ${id}`, 2)
  const path = join(directory, `${id}.json`)
  const entry = await lstat(path).catch(() => null)
  if (!entry) throw new CliError('JOB_UNKNOWN', `no job ${id} in ${directory}`)
  if (!entry.isFile() || (!WINDOWS && process.getuid && entry.uid !== process.getuid())) throw new CliError('JOB_DIR_UNSAFE', `${path} is not this user's regular file`)
  return JSON.parse(await readFile(path, 'utf8'))
}

function alive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

/** 명령은 자기 프로세스 그룹의 우두머리로 뜬다 — 셸과 그 자식까지 한 번에 멈춘다(Windows는 그 프로세스만). */
function signalGroup(pid, signal) {
  if (!pid) return
  try {
    process.kill(WINDOWS ? pid : -pid, signal)
  } catch {
    // 이미 끝났다
  }
}

function newId(date = new Date()) {
  // 2026-10-21T03:15:00.123Z → 20261021T031500.123Z → 20261021t031500
  const stamp = date.toISOString().replace(/[-:]/g, '').slice(0, 15).toLowerCase()
  return `j-${stamp}-${randomBytes(3).toString('hex')}`
}

/**
 * 큰 로그도 끝부분만 읽는다 — 마지막 줄들이 실패 원인과 요약을 담는다. 창이 줄 가운데서 시작하면 그 조각 줄은 버리고,
 * 한 줄짜리 거대한 출력(JSON 리포터)이 맥락을 덮지 않게 찍는 양에도 상한을 둔다.
 */
async function tailOf(path, lines) {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const length = Math.min(size, TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, size - length)
    const text = buffer.toString('utf8')
    const body = text.endsWith('\n') ? text.slice(0, -1) : text
    const all = body.split('\n')
    if (length < size) all.shift()
    const shown = all.slice(-lines).join('\n')
    return shown.length > TAIL_PRINT_LIMIT ? `… (tail cut to the last ${TAIL_PRINT_LIMIT} characters)\n${shown.slice(-TAIL_PRINT_LIMIT)}` : shown
  } finally {
    await handle.close()
  }
}

function seconds(from, to = Date.now()) {
  return Math.max(0, Math.round((to - Date.parse(from)) / 1000))
}

function state(record) {
  if (record.finishedAt) return 'done'
  if (record.supervisorPid) return alive(record.supervisorPid) ? 'running' : 'lost'
  return Date.now() - Date.parse(record.startedAt) < STARTUP_GRACE_MS ? 'running' : 'lost'
}

/**
 * 명령 하나를 job으로 띄운다. 인자가 하나면 셸 한 줄로(`NODE_OPTIONS=… pnpm vitest run x | tail` 같은 것), 여럿이면 셸 없이
 * 그대로 실행한다. 감독이 실제로 떴는지 확인한 뒤에야 성공을 알린다.
 */
export async function startJob(command, { name = null, cwd = process.cwd(), timeoutSeconds = DEFAULT_TIMEOUT_SECONDS } = {}) {
  if (command.length === 0) throw new CliError('USAGE', 'start needs a command after --', 2)
  const directory = resolve(cwd)
  if (!(await stat(directory).catch(() => null))?.isDirectory()) throw new CliError('USAGE', `--cwd is not a directory: ${directory}`, 2)
  const jobs = await privateDirectory()
  const id = newId()
  const log = join(jobs, `${id}.log`)
  await (await open(log, 'wx', 0o600)).close()
  const record = {
    schemaVersion: 1,
    id,
    name,
    command,
    cwd: directory,
    log,
    timeoutSeconds,
    startedAt: now(),
    supervisorPid: null,
    pid: null,
    finishedAt: null,
    exitCode: null,
    signal: null,
    timedOut: false,
    error: null,
  }
  await writeRecord(jobs, record)
  // 감독의 stderr도 같은 로그로 — 감독이 무너지면 그 이유가 로그 꼬리에 남는다
  const errors = await open(log, 'a')
  const supervisor = spawn(process.execPath, [SCRIPT, 'supervise', '--job', id], {
    cwd: directory,
    detached: true,
    stdio: ['ignore', 'ignore', errors.fd],
    env: { ...process.env, ORACLE_JOB_DIR: jobs },
  })
  try {
    await new Promise((started, failed) => {
      supervisor.once('spawn', started)
      supervisor.once('error', failed)
    })
  } catch (error) {
    await writeRecord(jobs, { ...record, exitCode: 127, error: `supervisor did not start: ${error.message}`, finishedAt: now() })
    throw new CliError('JOB_START_FAILED', `${id}: supervisor did not start: ${error.message}`)
  } finally {
    await errors.close()
  }
  supervisor.unref()
  return record
}

/** 감독 — 명령을 띄워 pid를 적고, 끝나면 종료 코드·신호를 적는다. start만 이것을 부른다. */
async function supervise(id) {
  const directory = await privateDirectory()
  let record = await readRecord(directory, id)
  try {
    const output = await open(record.log, 'a')
    const [file, ...args] = record.command
    const options = { cwd: record.cwd, stdio: ['ignore', output.fd, output.fd], env: process.env, detached: !WINDOWS }
    const child = record.command.length === 1 ? spawn(file, { ...options, shell: true }) : spawn(file, args, options)
    // 기록을 쓰는 동안 명령이 끝나거나 실패할 수 있다 — 결과를 받을 자리는 await 전에 만든다
    const outcome = new Promise((done) => {
      child.once('error', (error) => done({ exitCode: 127, signal: null, error: `spawn failed: ${error.message}` }))
      child.once('close', (exitCode, signal) => done({ exitCode, signal, error: null }))
    })
    let timedOut = false
    const limit = setTimeout(() => {
      timedOut = true
      signalGroup(child.pid, 'SIGTERM')
      setTimeout(signalGroup, KILL_GRACE_MS, child.pid, 'SIGKILL').unref()
    }, record.timeoutSeconds * 1000)
    record = { ...record, supervisorPid: process.pid, pid: child.pid ?? null }
    await writeRecord(directory, record)
    const result = await outcome
    clearTimeout(limit)
    await output.close()
    await writeRecord(directory, { ...record, ...result, timedOut, finishedAt: now() })
  } catch (error) {
    await writeRecord(directory, { ...record, supervisorPid: process.pid, exitCode: 127, error: `supervisor failed: ${error.message}`, finishedAt: now() })
  }
}

const exitText = (record) => (record.exitCode === null ? `signal ${record.signal}` : String(record.exitCode))

async function finish(record, tail) {
  const shown = await tailOf(record.log, tail)
  if (shown) process.stdout.write(`${shown}\n`)
  const notes = [
    record.exitCode === RUNNING_EXIT ? 'reported as 1: 75 means still running' : null,
    record.timedOut ? `timed out after ${record.timeoutSeconds}s` : null,
    record.error,
  ].filter(Boolean)
  const line = [
    `JOB_DONE ${record.id} exit:${exitText(record)}`,
    notes.length ? `(${notes.join('; ')})` : null,
    `after ${seconds(record.startedAt, Date.parse(record.finishedAt))}s · full log ${record.log}`,
  ].filter(Boolean).join(' ')
  process.stdout.write(`${line}\n`)
  process.exitCode = record.exitCode === RUNNING_EXIT ? 1 : (record.exitCode ?? 1)
}

function lostMessage(record) {
  const command = alive(record.pid)
    ? `its command (pid ${record.pid}) is still running — stop it with oracle-job.mjs cancel --job ${record.id} before running it again`
    : 'its command is gone'
  return `${record.id} stopped without recording an exit; ${command}; read ${record.log}`
}

/** 최대 maxSeconds 동안 막는다 — 끝났으면 꼬리와 종료 코드, 감독이 사라졌으면 JOB_LOST, 시간이 다 되면 JOB_RUNNING. */
async function waitJob(id, { maxSeconds, tail }) {
  const directory = await privateDirectory()
  const deadline = Date.now() + maxSeconds * 1000
  let beat = Date.now()
  for (;;) {
    const record = await readRecord(directory, id)
    if (record.finishedAt) {
      await finish(record, tail)
      return
    }
    if (state(record) === 'lost') {
      // 감독이 종료 코드를 쓰고 막 사라졌을 수 있다 — 한 번 더 읽는다
      const again = await readRecord(directory, id)
      if (!again.finishedAt) throw new CliError('JOB_LOST', lostMessage(again))
      await finish(again, tail)
      return
    }
    if (Date.now() >= deadline) {
      process.stdout.write(`JOB_RUNNING ${id} after ${seconds(record.startedAt)}s · log ${record.log} — run oracle-job.mjs wait --job ${id} again\n`)
      process.exitCode = RUNNING_EXIT
      return
    }
    if (Date.now() - beat >= HEARTBEAT_SECONDS * 1000) {
      const last = (await tailOf(record.log, 1)).slice(0, 120)
      const beatLine = [`JOB_HEARTBEAT ${id} ${seconds(record.startedAt)}s`, last].filter(Boolean).join(' · ')
      process.stdout.write(`${beatLine}\n`)
      beat = Date.now()
    }
    await sleep(Math.min(1000, Math.max(0, deadline - Date.now())))
  }
}

/** 멈춘 job을 그룹째 멈춘다 — 감독이 살아 있으면 감독이 신호를 기록하고, 사라졌으면 여기서 끝을 적는다. */
async function cancelJob(id) {
  const directory = await privateDirectory()
  const record = await readRecord(directory, id)
  if (record.finishedAt) {
    process.stdout.write(`JOB_DONE ${id} already finished with exit:${exitText(record)}\n`)
    return
  }
  signalGroup(record.pid, 'SIGTERM')
  const deadline = Date.now() + KILL_GRACE_MS
  while (alive(record.pid) && Date.now() < deadline) await sleep(200)
  if (alive(record.pid)) signalGroup(record.pid, 'SIGKILL')
  const current = await readRecord(directory, id)
  if (!current.finishedAt && !alive(current.supervisorPid))
    await writeRecord(directory, { ...current, signal: 'SIGTERM', error: 'cancelled after its supervisor was gone', finishedAt: now() })
  process.stdout.write(`JOB_CANCELLED ${id}\n`)
}

async function listJobs(limit = 20) {
  const directory = await privateDirectory()
  const ids = (await readdir(directory)).filter((name) => name.endsWith('.json') && ID.test(name.slice(0, -5))).map((name) => name.slice(0, -5))
  const records = []
  for (const id of ids) records.push(await readRecord(directory, id))
  return records.sort((left, right) => right.startedAt.localeCompare(left.startedAt)).slice(0, limit)
}

const USAGE = `usage:
  oracle-job.mjs start [--name <label>] [--cwd <dir>] [--timeout-seconds <n ≤ ${MAX_TIMEOUT_SECONDS}, default ${DEFAULT_TIMEOUT_SECONDS}>] -- <command…>   (one argument runs as a shell line)
  oracle-job.mjs wait --job <id> [--max-seconds <n ≤ ${MAX_WAIT_SECONDS}, default ${DEFAULT_WAIT_SECONDS}>] [--tail <lines, default ${DEFAULT_TAIL}>]
  oracle-job.mjs cancel --job <id>
  oracle-job.mjs status --job <id>
  oracle-job.mjs list`

function parse(args) {
  const separator = args.indexOf('--')
  const head = separator === -1 ? args : args.slice(0, separator)
  const options = { command: separator === -1 ? [] : args.slice(separator + 1) }
  for (let index = 0; index < head.length; index += 2) {
    const name = head[index]?.replace(/^--/, '')
    if (!['name', 'cwd', 'job', 'max-seconds', 'tail', 'timeout-seconds'].includes(name) || head[index + 1] === undefined) throw new CliError('USAGE', USAGE, 2)
    options[name] = head[index + 1]
  }
  return options
}

function positive(value, fallback, limit, flag) {
  if (value === undefined) return fallback
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1 || number > limit) throw new CliError('USAGE', `${flag} must be an integer from 1 to ${limit}`, 2)
  return number
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const options = parse(args)
  if (command === 'start') {
    const record = await startJob(options.command, {
      name: options.name ?? null,
      cwd: options.cwd,
      timeoutSeconds: positive(options['timeout-seconds'], DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS, '--timeout-seconds'),
    })
    process.stdout.write(`JOB_STARTED ${record.id} · wait with: oracle-job.mjs wait --job ${record.id}\n`)
    return
  }
  if (command === 'supervise') {
    await supervise(options.job)
    return
  }
  if (command === 'wait') {
    await waitJob(options.job, {
      maxSeconds: positive(options['max-seconds'], DEFAULT_WAIT_SECONDS, MAX_WAIT_SECONDS, '--max-seconds'),
      tail: positive(options.tail, DEFAULT_TAIL, 2000, '--tail'),
    })
    return
  }
  if (command === 'cancel') {
    await cancelJob(options.job)
    return
  }
  if (command === 'status') {
    const record = await readRecord(await privateDirectory(), options.job)
    process.stdout.write(`${JSON.stringify({ ...record, state: state(record) })}\n`)
    return
  }
  if (command === 'list') {
    const lines = (await listJobs()).map((record) => [record.id, state(record), record.name, record.command.join(' ').slice(0, 80)].filter(Boolean).join(' '))
    process.stdout.write(lines.length ? `${lines.join('\n')}\n` : 'no jobs\n')
    return
  }
  throw new CliError('USAGE', USAGE, 2)
}

runCli(import.meta, main, { CliError, fallback: 'JOB_FAILED' })
