// An agent that runs `claude -p` inside an Orca terminal tab of the worktree it works in, so the owner can watch it and
// stop it there. Everything the bot relies on stays as with a background run: the same arguments (budget, restricted
// tools), the same environment, the result read from claude's own output, the timeout and the stop button.
//
// Each run has a private folder: the prompt (read on standard input, never on a command line), the script the tab runs,
// claude's stream, its standard error, its pid and, at the end, its exit status. Ctrl+C in the tab stops claude, and the
// same tab then opens the session for the owner to go on with by hand.
//
// The tab and the bot both try to claim the run by making the folder `claim`, which only one of them can. The tab runs
// claude only when it claimed the run; the bot claims a run it gives up on, so a tab that starts late starts nothing.

import type { Run } from '../exec/exec.ts'
import type { Agent, AgentCall, AgentResult } from './claude.ts'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { programEnv } from '../exec/env.ts'
import { closeTerminal, openTerminal } from '../orca/worktree.ts'
import { redact } from '../store/redact.ts'
import {
  AgentAborted,
  AgentSessionBusy,
  AgentStoppedInTab,
  claudeArgs,
  parseStreamOutput,
  switchedSession,
} from './claude.ts'

const PRIVATE_DIR = 0o700
const PRIVATE_FILE = 0o600
const POLL_MS = 1000
// How long the tab may take to start claude before the run goes on in the background instead.
const TAB_START_MS = 30_000
// How long a claude that is gone may go without an exit status before the tab is taken as closed; also how long the
// bot waits for a pid to appear, or for a claude it stopped to be gone.
const EXIT_GRACE_MS = 5000
const STDERR_LENGTH = 500
// What a run the bot ended itself writes as its exit: SIGTERM, not stopped in the tab.
const BOT_ENDED = '143 0\n'

const TITLES: Readonly<Record<AgentCall['mode'], string>> = {
  plan: 'Claude 플랜',
  build: 'Claude 구현',
  text: 'Claude',
  qa: 'Claude QA',
}

// A single quote cannot be inside single quotes: close them, add an escaped quote, open them again.
const QUOTE_INSIDE = "'\\''"

export const shellQuote = (value: string): string => `'${value.replaceAll("'", QUOTE_INSIDE)}'`

const assignments = (env: Readonly<Record<string, string>>): string[] =>
  Object.entries(env).map(([name, value]) => `${name}=${shellQuote(value)}`)

export interface TabScriptInput {
  dir: string
  cwd: string
  args: readonly string[]
  // The whole environment claude gets; nothing of the tab's own shell reaches it.
  env: Readonly<Record<string, string>>
  // How the session is opened for the owner after a Ctrl+C: its arguments, and what is added to the tab's environment.
  resumeArgs: readonly string[]
  resumeEnv: Readonly<Record<string, string>>
  nodePath: string
  viewerPath: string
}

// `stopped` in the exit file: 0 when claude ended by itself or the bot stopped it, 1 for Ctrl+C, 2 when the tab closed
// or the run was stopped before claude started. A Ctrl+C once claude is over changes nothing.
export function tabScript(input: TabScriptInput): string {
  const dir = shellQuote(input.dir)
  const claude = ['env', '-i', ...assignments(input.env), 'claude', ...input.args.map(shellQuote)].join(' ')
  const resume = [
    'exec env',
    ...assignments(input.resumeEnv),
    `PATH=${shellQuote(input.env.PATH ?? '')}:"$PATH"`,
    'claude',
    ...input.resumeArgs.map(shellQuote),
  ].join(' ')
  return `#!/bin/bash
# Written by slack-dispatch for one agent run. Ctrl+C stops the run, and the session then goes on here, with you.
cd ${shellQuote(input.cwd)} || exit 1
D=${dir}
stopped=0
pid=
stop() {
  if [ -z "$pid" ]; then stopped=2; return; fi
  if kill -0 "$pid" 2>/dev/null; then
    stopped=$1
    kill -TERM "$pid" 2>/dev/null
  fi
}
trap 'stop 1' INT
trap 'stop 2' HUP
finish() {
  printf '%s %s\\n' "$1" "$2" > "$D/exit.tmp"
  mv "$D/exit.tmp" "$D/exit"
}
# The bot claims a run it gave up on; then this tab starts nothing.
mkdir "$D/claim" 2>/dev/null || exit 0
if [ "$stopped" != 0 ]; then finish 0 2; exit 0; fi
${claude} < "$D/prompt.txt" > "$D/stream.jsonl" 2> "$D/stderr.txt" &
pid=$!
printf '%s\\n' "$pid" > "$D/pid"
if [ "$stopped" != 0 ]; then stopped=2; kill -TERM "$pid" 2>/dev/null; fi
${shellQuote(input.nodePath)} ${shellQuote(input.viewerPath)} "$D/stream.jsonl" "$pid" &
viewer=$!
wait "$pid"
code=$?
while kill -0 "$pid" 2>/dev/null; do
  wait "$pid"
  code=$?
done
trap '' INT HUP
finish "$code" "$stopped"
wait "$viewer"
if [ "$stopped" = 1 ]; then
  echo
  echo '멈췄어요. 같은 세션을 여기서 이어서 작업할 수 있어요.'
  ${resume}
fi
`
}

// The owner goes on with the protections the run had: a run without the owner's setup also loaded none of the
// repository's (a pull request's own `.claude/` settings or hooks), so the session opens in safe mode again.
const resumeArgs = (call: AgentCall): string[] => [
  '--resume',
  call.sessionId,
  ...(call.ownSetup === true ? [] : ['--safe-mode']),
]

export interface TabAgentDeps {
  run: Run
  // Where the run folders live; made private.
  runsDir: string
  // How long a finished run's folder (it holds the prompt, so Slack text) is kept.
  keepMs: number
  nodePath: string
  viewerPath: string
  // The service's own environment, of which claude gets only what `programEnv` allows.
  env: Readonly<Record<string, string | undefined>>
  // Runs a call the old way, when Orca cannot open a tab.
  fallback: Agent
  newRunId: () => string
  now: () => number
  sleep: (ms: number) => Promise<void>
  alive: (pid: number) => boolean
  // Sends SIGTERM; a process that is gone already is not an error.
  terminate: (pid: number) => void
  // A tab that could not be opened or closed, or a run folder that could not be cleaned up; the run goes on.
  onTabProblem: (what: string, error: unknown) => void
}

interface Exit {
  code: number
  stopped: number
}

type Watched =
  | { kind: 'exit'; exit: Exit }
  | { kind: 'aborted' }
  | { kind: 'timeout' }
  | { kind: 'not_started' }
  | { kind: 'gone' }

// Still going: claude is there (or the tab may still start it), or claude is missing for now.
type Running = { kind: 'there' } | { kind: 'missing' }

const readText = (path: string): string | undefined => (existsSync(path) ? readFileSync(path, 'utf8') : undefined)

function readExit(dir: string): Exit | undefined {
  const text = readText(join(dir, 'exit'))
  if (text === undefined) return undefined
  const [code = '', stopped = ''] = text.trim().split(' ')
  return { code: Number.parseInt(code, 10) || 0, stopped: Number.parseInt(stopped, 10) || 0 }
}

function readPid(dir: string): number | undefined {
  const pid = Number.parseInt(readText(join(dir, 'pid')) ?? '', 10)
  if (!Number.isInteger(pid) || pid <= 0) return undefined
  return pid
}

const streamResult = (dir: string): AgentResult | null => parseStreamOutput(readText(join(dir, 'stream.jsonl')) ?? '')

const isErrorCode = (error: unknown, code: string): boolean =>
  error instanceof Error && 'code' in error && error.code === code

// True when this call made the claim, false when the tab (or an earlier call) had.
function claimRun(dir: string): boolean {
  try {
    mkdirSync(join(dir, 'claim'), { mode: PRIVATE_DIR })
    return true
  } catch (error) {
    if (isErrorCode(error, 'EEXIST')) return false
    throw error
  }
}

const markEnded = (dir: string): void => {
  writeFileSync(join(dir, 'exit'), BOT_ENDED, { mode: PRIVATE_FILE })
}

const SESSION_FLAGS = new Set(['--resume', '-r', '--session-id'])
const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

// A process's command line is a claude of that session: the program is claude (or node running claude), and the
// session is the value of its `--resume`/`--session-id`, as in the bot's own run and the `claude --resume` the tab opens
// for the owner. Anything else that only mentions the id (a dev server logging into that session's scratchpad) is not.
function isClaudeOf(command: string, sessionId: string): boolean {
  const words = command.trim().split(/\s+/)
  const program = baseName(words[0] ?? '')
  // An npm install runs as `node …/@anthropic-ai/claude-code/cli.js`: the script's path names claude, not its file.
  const claude = program === 'claude' || (program.startsWith('node') && (words[1] ?? '').includes('claude'))
  if (!claude) return false
  return words.some(
    (word, index) =>
      (SESSION_FLAGS.has(word) && words[index + 1] === sessionId) ||
      word === `--resume=${sessionId}` ||
      word === `--session-id=${sessionId}`,
  )
}

// Whether a claude of this session runs now. A `ps` that fails is reported and taken as no, as before this check; a
// claude found is reported with its pid and command line, so the owner can find it.
export async function sessionRunning(
  run: Run,
  sessionId: string,
  onProblem: (what: string, error: unknown) => void,
): Promise<boolean> {
  let listed: string
  try {
    // `-ww`: whole command lines, however long.
    listed = (await run('ps', ['-ww', '-axo', 'pid=,command='])).stdout
  } catch (error) {
    onProblem('ps', error)
    return false
  }
  const found = listed.split('\n').find((line) => isClaudeOf(line.trim().replace(/^\d+\s+/, ''), sessionId))
  if (found === undefined) return false
  onProblem('session_busy', new Error(found.trim()))
  return true
}

const isAllowed = (name: string, value: string | undefined): value is string => value !== undefined && programEnv(name)

const allowedEnv = (env: TabAgentDeps['env'], extra: Readonly<Record<string, string>>): Record<string, string> => ({
  ...Object.fromEntries(
    Object.entries(env).flatMap(([name, value]) => (isAllowed(name, value) ? [[name, value]] : [])),
  ),
  ...extra,
})

export function createTabAgent(deps: TabAgentDeps): Agent {
  async function close(handle: string | undefined): Promise<void> {
    if (handle === undefined) return
    try {
      await closeTerminal(deps.run, handle)
    } catch (error) {
      deps.onTabProblem('close', error)
    }
  }

  // Polls until `read` has an answer, for at most EXIT_GRACE_MS.
  async function soon<T>(read: () => T | undefined): Promise<T | undefined> {
    const until = deps.now() + EXIT_GRACE_MS
    for (;;) {
      const value = read()
      if (value !== undefined || deps.now() > until) return value
      await deps.sleep(POLL_MS)
    }
  }

  // Ends a run the bot gives up on. A tab that has not claimed it never will; a tab that has gets its claude stopped,
  // and the bot waits for it to be gone, so a retry does not find the session still in use.
  async function giveUp(dir: string, handle: string | undefined): Promise<void> {
    if (claimRun(dir)) {
      markEnded(dir)
      await close(handle)
      return
    }
    const pid = await soon(() => readPid(dir))
    if (pid === undefined) return
    deps.terminate(pid)
    await soon(() => (deps.alive(pid) ? undefined : true))
  }

  // One look at the run: how it ended, or whether its claude is there.
  function look(dir: string, call: AgentCall, started: number): Watched | Running {
    const exit = readExit(dir)
    if (exit !== undefined) return { kind: 'exit', exit }
    if (call.signal?.aborted === true) return { kind: 'aborted' }
    if (deps.now() - started > call.timeoutMs) return { kind: 'timeout' }
    const pid = readPid(dir)
    if (pid !== undefined) return { kind: deps.alive(pid) ? 'there' : 'missing' }
    if (deps.now() - started <= TAB_START_MS) return { kind: 'there' }
    // No claude yet: a tab that did not claim the run in time is given up on; one that did is about to start it.
    return claimRun(dir) ? { kind: 'not_started' } : { kind: 'missing' }
  }

  async function watch(dir: string, call: AgentCall): Promise<Watched> {
    const started = deps.now()
    let goneSince: number | undefined
    for (;;) {
      const seen = look(dir, call, started)
      if (seen.kind !== 'there' && seen.kind !== 'missing') return seen
      goneSince = seen.kind === 'missing' ? goneSince ?? deps.now() : undefined
      if (goneSince !== undefined && deps.now() - goneSince > EXIT_GRACE_MS) return { kind: 'gone' }
      await deps.sleep(POLL_MS)
    }
  }

  function prepare(call: AgentCall): string {
    pruneTabRuns({ runsDir: deps.runsDir, now: deps.now, keepMs: deps.keepMs, onProblem: deps.onTabProblem })
    const dir = join(deps.runsDir, deps.newRunId())
    mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR })
    writeFileSync(join(dir, 'prompt.txt'), call.prompt, { mode: PRIVATE_FILE })
    writeFileSync(join(dir, 'session'), call.sessionId, { mode: PRIVATE_FILE })
    const script = tabScript({
      dir,
      cwd: call.cwd,
      args: claudeArgs(call, 'stream-json'),
      env: allowedEnv(deps.env, call.env ?? {}),
      resumeArgs: resumeArgs(call),
      resumeEnv: call.env ?? {},
      nodePath: deps.nodePath,
      viewerPath: deps.viewerPath,
    })
    writeFileSync(join(dir, 'run.sh'), script, { mode: PRIVATE_DIR })
    return dir
  }

  function finished(call: AgentCall, dir: string, exit: Exit, mayRetry: boolean): AgentResult | AgentCall {
    const result = streamResult(dir)
    if (exit.stopped !== 0) throw new AgentStoppedInTab(result?.costUsd, exit.stopped === 1 ? 'continued' : 'ended')
    if (exit.code === 0)
      return result ?? { ok: false, text: 'claude printed no result', costUsd: 0, subtype: 'no_result' }
    const stderr = redact(readText(join(dir, 'stderr.txt')) ?? '')
    const switched = mayRetry ? switchedSession(call, stderr) : undefined
    if (switched !== undefined) return switched
    // claude exits non-zero when a budget or turn limit stops it, but still reports the cost.
    if (result !== null) return { ...result, ok: false }
    const text = `claude failed with exit code ${String(exit.code)}: ${stderr.slice(0, STDERR_LENGTH)}`
    return { ok: false, text, costUsd: 0, subtype: 'process_failed' }
  }

  // claude is gone and the tab wrote no exit: it was closed. A claude that had finished still counts.
  function goneResult(dir: string): AgentResult {
    const result = streamResult(dir)
    if (result !== null) return result
    throw new AgentStoppedInTab(undefined, 'ended')
  }

  async function attempt(call: AgentCall, mayRetry: boolean): Promise<AgentResult> {
    if (call.signal?.aborted === true) throw new AgentAborted()
    // The jobs check before they touch the worktree; this is the last check, right before claude would start.
    if (await sessionRunning(deps.run, call.sessionId, deps.onTabProblem)) throw new AgentSessionBusy()
    const dir = prepare(call)
    let handle: string | undefined
    try {
      handle = await openTerminal(deps.run, call.cwd, TITLES[call.mode], `bash ${shellQuote(join(dir, 'run.sh'))}`)
    } catch (error) {
      deps.onTabProblem('open', error)
      // Orca may have made the tab before it failed. Unless that tab runs the call already, it never will.
      if (claimRun(dir)) {
        markEnded(dir)
        return deps.fallback(call)
      }
    }
    if (handle !== undefined) writeFileSync(join(dir, 'terminal'), handle, { mode: PRIVATE_FILE })
    const watched = await watch(dir, call)
    switch (watched.kind) {
      case 'aborted':
        await giveUp(dir, handle)
        throw new AgentAborted()
      case 'timeout':
        await giveUp(dir, handle)
        return { ok: false, text: 'claude ran past its time limit', costUsd: 0, subtype: 'timeout' }
      case 'not_started':
        // The tab never ran the script, and now never will: it is closed, and the run goes on in the background.
        markEnded(dir)
        await close(handle)
        return deps.fallback(call)
      case 'gone':
        return goneResult(dir)
      case 'exit': {
        const outcome = finished(call, dir, watched.exit, mayRetry)
        return 'prompt' in outcome ? attempt(outcome, false) : outcome
      }
    }
  }

  return (call) => attempt(call, true)
}

// Whether a process is there. Signal 0 only checks; a process of another user counts as there.
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return isErrorCode(error, 'EPERM')
  }
}

// Asks a process to end. One that is gone already is fine; anything else is a real failure.
export function terminateProcess(pid: number): void {
  try {
    process.kill(pid, 'SIGTERM')
  } catch (error) {
    if (!isErrorCode(error, 'ESRCH')) throw error
  }
}

interface PruneDeps {
  runsDir: string
  now: () => number
  // How long a finished run's folder (it holds the prompt, so Slack text) is kept.
  keepMs: number
  // A folder that could not be read or removed; the others are still handled.
  onProblem: (what: string, error: unknown) => void
}

export interface ReapDeps extends PruneDeps {
  run: Run
  terminate: (pid: number) => void
}

// The run folders; anything else in the folder (a `.DS_Store`) is not one.
function runFolders(deps: PruneDeps): string[] {
  try {
    if (!existsSync(deps.runsDir)) return []
    return readdirSync(deps.runsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(deps.runsDir, entry.name))
  } catch (error) {
    deps.onProblem('runs', error)
    return []
  }
}

// Removes the folders of runs over for longer than `keepMs`.
function pruneTabRuns(deps: PruneDeps): void {
  for (const dir of runFolders(deps)) {
    try {
      const exitPath = join(dir, 'exit')
      if (existsSync(exitPath) && deps.now() - statSync(exitPath).mtimeMs > deps.keepMs)
        rmSync(dir, { recursive: true, force: true })
    } catch (error) {
      deps.onProblem('prune', error)
    }
  }
}

// At start: a run the last service left in a tab is still spending money, so its claude is stopped (only when the
// process with that pid is really that session's claude) and its tab closed; folders of runs long over are removed.
export async function reapTabRuns(deps: ReapDeps): Promise<number> {
  pruneTabRuns(deps)
  let stopped = 0
  for (const dir of runFolders(deps)) {
    try {
      if (existsSync(join(dir, 'exit'))) continue
      if (await stopLeftover(deps, dir)) stopped += 1
    } catch (error) {
      deps.onProblem('reap', error)
    }
  }
  return stopped
}

async function stopLeftover(deps: ReapDeps, dir: string): Promise<boolean> {
  // A tab that has not run the script yet never will.
  const unstarted = claimRun(dir)
  const pid = readPid(dir)
  const session = readText(join(dir, 'session')) ?? ''
  let stopped = false
  if (!unstarted && pid !== undefined && session !== '') {
    const command = await deps.run('ps', ['-ww', '-p', String(pid), '-o', 'command=']).then(
      (result) => result.stdout,
      () => '',
    )
    if (isClaudeOf(command, session)) {
      deps.terminate(pid)
      stopped = true
    }
  }
  const handle = readText(join(dir, 'terminal'))?.trim()
  if (handle !== undefined && handle !== '') await closeTerminal(deps.run, handle).catch(() => undefined)
  markEnded(dir)
  return stopped
}
