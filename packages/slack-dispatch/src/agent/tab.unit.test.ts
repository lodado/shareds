import type { Run } from '../exec/exec'
import type { Agent, AgentCall, AgentResult } from './claude'
import { spawn } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  watch,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentAborted, AgentStoppedInTab } from './claude'
import { createTabAgent, reapTabRuns, shellQuote, tabScript } from './tab'

const SESSION = '0b6a6a50-3e51-4c93-9a0a-0d1c2a3b4c5d'
const HANDLE = 'term_5b70a478-6623-408a-8919-d4eced9eb295'
const PID = 4242
const VIEWER = fileURLToPath(new URL('../../scripts/stream-view.mjs', import.meta.url))
// The bot keeps a finished run's folder this long in these tests; a folder a little older is past it.
const KEEP_MS = 60_000
const PAST_KEEP_MS = 120_000
// Past the 30 s the bot gives a tab to start claude, counted in the bot's one-second waits.
const LATE_TICK = 35

const folders: string[] = []
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

function folder(): string {
  const made = mkdtempSync(join(tmpdir(), 'dispatch-tab-'))
  folders.push(made)
  return made
}

const call = (overrides: Partial<AgentCall> = {}): AgentCall => ({
  cwd: '/work/wt',
  prompt: 'plan the footer fix',
  sessionId: SESSION,
  resume: false,
  mode: 'plan',
  model: 'opusplan',
  maxBudgetUsd: 1.5,
  timeoutMs: 60_000,
  ...overrides,
})

const line = (event: unknown): string => `${JSON.stringify(event)}\n`
const INIT = line({ type: 'system', subtype: 'init', model: 'claude-opus-5-5' })
const result = (text: string, cost: number, subtype = 'success'): string =>
  line({ type: 'result', subtype, is_error: subtype !== 'success', result: text, total_cost_usd: cost })

// What the tab does in a test: writes what the script would, in the run's folder.
interface Tab {
  // Right after Orca opened the tab.
  open?: (dir: string, index: number) => void
  // At every second the bot waits; `tick` counts them from 1.
  tick?: (dir: string, tick: number) => void
}

interface Rig {
  agent: Agent
  creates: string[][]
  closes: string[][]
  dirs: string[]
  terminated: number[]
  problems: string[]
  fallbacks: AgentCall[]
  runsDir: string
}

interface RigOptions {
  // Orca fails before it makes a tab, or after it made one and the tab ran the script.
  openFails?: 'before' | 'after'
  alive?: boolean
  env?: Record<string, string>
  startAt?: number
}

function rig(tab: Tab, options: RigOptions = {}): Rig {
  const runsDir = folder()
  const r: Omit<Rig, 'agent'> = {
    creates: [],
    closes: [],
    dirs: [],
    terminated: [],
    problems: [],
    fallbacks: [],
    runsDir,
  }
  const run: Run = (file, args) => {
    if (file !== 'orca') return Promise.reject(new Error(`unexpected ${file}`))
    if (args[1] === 'close') {
      r.closes.push([...args])
      return Promise.resolve({ stdout: '{}', stderr: '' })
    }
    if (options.openFails === 'before') return Promise.reject(new Error('orca is not running'))
    r.creates.push([...args])
    const command = args[args.indexOf('--command') + 1] ?? ''
    const dir = /^bash '(.+)\/run\.sh'$/.exec(command)?.[1] ?? ''
    r.dirs.push(dir)
    tab.open?.(dir, r.dirs.length - 1)
    if (options.openFails === 'after') return Promise.reject(new Error('orca timed out'))
    return Promise.resolve({ stdout: JSON.stringify({ result: { terminal: { handle: HANDLE } } }), stderr: '' })
  }
  let now = options.startAt ?? 0
  let runs = 0
  let ticks = 0
  const agent = createTabAgent({
    run,
    runsDir,
    keepMs: KEEP_MS,
    nodePath: '/opt/node/bin/node',
    viewerPath: '/app/scripts/stream-view.mjs',
    env: options.env ?? { PATH: '/usr/bin:/bin', HOME: '/Users/owner' },
    fallback: (fallbackCall) => {
      r.fallbacks.push(fallbackCall)
      return Promise.resolve({ ok: true, text: 'from the background', costUsd: 0.1, subtype: 'success' })
    },
    newRunId: () => {
      runs += 1
      return `run-${String(runs)}`
    },
    now: () => now,
    sleep: (ms) => {
      now += ms
      ticks += 1
      tab.tick?.(r.dirs.at(-1) ?? '', ticks)
      return Promise.resolve()
    },
    alive: () => options.alive ?? true,
    terminate: (pid) => {
      r.terminated.push(pid)
    },
    onTabProblem: (what) => {
      r.problems.push(what)
    },
  })
  return { ...r, agent }
}

const write = (dir: string, name: string, text: string): void => {
  writeFileSync(join(dir, name), text)
}

// The tab's script claims the run before it starts claude.
const claimed = (dir: string): void => {
  mkdirSync(join(dir, 'claim'), { recursive: true })
}

const started = (dir: string): void => {
  claimed(dir)
  write(dir, 'pid', `${String(PID)}\n`)
}

// A tab whose claude prints `stream` and ends with `exit` (code and how it was stopped).
const finishing =
  (stream: string, exit: string, stderr = '') =>
  (dir: string): void => {
    started(dir)
    write(dir, 'stream.jsonl', stream)
    write(dir, 'stderr.txt', stderr)
    write(dir, 'exit', `${exit}\n`)
  }

const read = (dir: string, name: string): string => readFileSync(join(dir, name), 'utf8')

describe('tabScript as the script an Orca tab runs for one agent run', () => {
  const script = tabScript({
    dir: '/state/runs/run-1',
    cwd: "/work/o'brien",
    args: ['-p', '--model', 'opusplan'],
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_COUNT: '1' },
    resumeArgs: ['--resume', SESSION, '--safe-mode'],
    resumeEnv: { GIT_CONFIG_COUNT: '1' },
    nodePath: '/opt/node/bin/node',
    viewerPath: '/app/scripts/stream-view.mjs',
  })

  it('to quote every value it was given, a single quote included', () => {
    expect(shellQuote("o'brien")).toBe(`'o'\\''brien'`)
    expect(script).toContain(`cd '/work/o'\\''brien' || exit 1`)
  })

  it('to start claude with only the environment it was given, and the prompt on standard input', () => {
    expect(script).toContain(
      `env -i PATH='/usr/bin:/bin' GIT_CONFIG_COUNT='1' claude '-p' '--model' 'opusplan' < "$D/prompt.txt"`,
    )
  })

  it('to open the same session for the owner only after a Ctrl+C, with what the run added to the environment', () => {
    expect(script).toContain(`if [ "$stopped" = 1 ]; then`)
    expect(script).toContain(
      `exec env GIT_CONFIG_COUNT='1' PATH='/usr/bin:/bin':"$PATH" claude '--resume' '${SESSION}' '--safe-mode'`,
    )
  })
})

describe('createTabAgent as a run in an Orca tab of its worktree', () => {
  it('to open a background tab in the worktree and answer with the result claude streamed', async () => {
    const r = rig({ open: finishing(INIT + result('the plan', 0.3), '0 0') })
    expect(await r.agent(call())).toStrictEqual({ ok: true, text: 'the plan', costUsd: 0.3, subtype: 'success' })
    const dir = r.dirs[0] ?? ''
    expect(r.creates).toStrictEqual([
      [
        'terminal',
        'create',
        '--worktree',
        'path:/work/wt',
        '--title',
        'Claude 플랜',
        '--command',
        `bash '${dir}/run.sh'`,
        '--json',
      ],
    ])
    expect(read(dir, 'prompt.txt')).toBe('plan the footer fix')
    expect(read(dir, 'terminal')).toBe(HANDLE)
    const script = read(dir, 'run.sh')
    expect(script).not.toContain('plan the footer fix')
    expect(script).toContain(`'--output-format' 'stream-json' '--verbose'`)
    expect(script).toContain(`'/opt/node/bin/node' '/app/scripts/stream-view.mjs' "$D/stream.jsonl" "$pid"`)
  })

  it('to give claude only the allowed environment and what the call adds, never the service secrets', async () => {
    const r = rig(
      { open: finishing(result('ok', 0.1), '0 0') },
      { env: { PATH: '/usr/bin', HOME: '/Users/owner', SLACK_BOT_TOKEN: 'xoxb-secret' } },
    )
    await r.agent(call({ env: { GIT_CONFIG_COUNT: '1' } }))
    const script = read(r.dirs[0] ?? '', 'run.sh')
    expect(script).toContain(`env -i PATH='/usr/bin' HOME='/Users/owner' GIT_CONFIG_COUNT='1' claude`)
    expect(script).not.toContain('xoxb-secret')
  })

  it.each([
    ['without the owner setup, in safe mode again', false, `claude '--resume' '${SESSION}' '--safe-mode'\n`],
    ['with the owner setup, as it ran', true, `claude '--resume' '${SESSION}'\n`],
  ])('to open the session for the owner %s', async (_name, ownSetup, resume) => {
    const r = rig({ open: finishing(result('ok', 0.1), '0 0') })
    await r.agent(call({ ownSetup }))
    expect(read(r.dirs[0] ?? '', 'run.sh')).toContain(resume)
  })

  it('to report a run that a budget stopped as not ok, with what it cost', async () => {
    const r = rig({ open: finishing(result('', 1.5, 'error_max_budget_usd'), '1 0') })
    expect(await r.agent(call())).toStrictEqual({
      ok: false,
      text: '',
      costUsd: 1.5,
      subtype: 'error_max_budget_usd',
    })
  })

  it('to be stopped by the owner, with the session to go on with, when Ctrl+C ended it', async () => {
    const stopped = rig({ open: finishing(INIT, '143 1') })
    await expect(stopped.agent(call())).rejects.toStrictEqual(new AgentStoppedInTab(undefined, 'continued'))
    const reported = rig({ open: finishing(INIT + result('', 0.2, 'error_during_execution'), '143 1') })
    const error = await reported.agent(call()).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(AgentStoppedInTab)
    expect(error).toMatchObject({ costUsd: 0.2, reason: 'continued' })
  })

  it('to be stopped with no session to go on with when the tab closed or claude was stopped before it started', async () => {
    const r = rig({ open: finishing('', '0 2') })
    await expect(r.agent(call())).rejects.toMatchObject({ name: 'AgentStoppedInTab', reason: 'ended' })
  })

  it('to be stopped by the owner when claude is gone and the tab never wrote an exit, as when it was closed', async () => {
    const r = rig({ open: started }, { alive: false })
    await expect(r.agent(call())).rejects.toMatchObject({ name: 'AgentStoppedInTab', reason: 'ended' })
  })

  it('to answer with what claude finished with when the tab closed before it wrote the exit', async () => {
    const r = rig(
      {
        open: (dir) => {
          started(dir)
          write(dir, 'stream.jsonl', INIT + result('the plan', 0.3))
        },
      },
      { alive: false },
    )
    expect(await r.agent(call())).toStrictEqual({ ok: true, text: 'the plan', costUsd: 0.3, subtype: 'success' })
  })

  it('to end claude and throw the stop when the bot stops the run', async () => {
    const controller = new AbortController()
    const r = rig({
      open: started,
      tick: () => {
        controller.abort()
      },
    })
    await expect(r.agent(call({ signal: controller.signal }))).rejects.toBeInstanceOf(AgentAborted)
    expect(r.terminated).toStrictEqual([PID])
  })

  it('to claim a run the bot stops before the tab did, so the tab starts nothing, and close the tab', async () => {
    const controller = new AbortController()
    const r = rig({
      tick: () => {
        controller.abort()
      },
    })
    await expect(r.agent(call({ signal: controller.signal }))).rejects.toBeInstanceOf(AgentAborted)
    const dir = r.dirs[0] ?? ''
    expect(existsSync(join(dir, 'claim'))).toBe(true)
    expect(read(dir, 'exit')).toBe('143 0\n')
    expect(r.terminated).toStrictEqual([])
    expect(r.closes).toStrictEqual([['terminal', 'close', '--terminal', HANDLE, '--tab', '--json']])
  })

  it('to wait for the pid and end that claude when the bot stops a run the tab has claimed but not started', async () => {
    const controller = new AbortController()
    const r = rig({
      open: claimed,
      tick: (dir, tick) => {
        controller.abort()
        if (tick === 2) write(dir, 'pid', `${String(PID)}\n`)
      },
    })
    await expect(r.agent(call({ signal: controller.signal }))).rejects.toBeInstanceOf(AgentAborted)
    expect(r.terminated).toStrictEqual([PID])
  })

  it('to end claude and say so when it runs past the time limit', async () => {
    const r = rig({ open: started })
    const answer: AgentResult = await r.agent(call({ timeoutMs: 3000 }))
    expect(answer).toMatchObject({ ok: false, subtype: 'timeout', costUsd: 0 })
    expect(r.terminated).toStrictEqual([PID])
  })

  it('to run the call in the background when Orca cannot open a tab, after claiming it', async () => {
    const r = rig({}, { openFails: 'before' })
    expect(await r.agent(call())).toMatchObject({ text: 'from the background' })
    expect(r.fallbacks).toHaveLength(1)
    expect(r.problems).toStrictEqual(['open'])
  })

  it('to follow the tab rather than run the call twice when Orca failed after the tab claimed the run', async () => {
    const r = rig({ open: finishing(result('from the tab', 0.2), '0 0') }, { openFails: 'after' })
    expect(await r.agent(call())).toMatchObject({ ok: true, text: 'from the tab' })
    expect(r.fallbacks).toStrictEqual([])
    expect(r.problems).toStrictEqual(['open'])
  })

  it('to claim and close a tab that never started, and run the call in the background', async () => {
    const r = rig({})
    expect(await r.agent(call())).toMatchObject({ text: 'from the background' })
    const dir = r.dirs[0] ?? ''
    expect(existsSync(join(dir, 'claim'))).toBe(true)
    expect(read(dir, 'exit')).toBe('143 0\n')
    expect(r.closes).toStrictEqual([['terminal', 'close', '--terminal', HANDLE, '--tab', '--json']])
  })

  it('to wait for a tab that claimed the run in time even when its claude starts late', async () => {
    const r = rig({
      open: claimed,
      tick: (dir, tick) => {
        if (tick === LATE_TICK) finishing(result('late plan', 0.2), '0 0')(dir)
      },
    })
    expect(await r.agent(call())).toMatchObject({ ok: true, text: 'late plan' })
    expect(r.fallbacks).toStrictEqual([])
  })

  it('to switch once to the session on disk, in a new tab, when claude says the id is in use', async () => {
    const r = rig({
      open: (dir, index) => {
        if (index === 0) finishing('', '1 0', 'Error: Session ID is already in use')(dir)
        else finishing(result('resumed plan', 0.2), '0 0')(dir)
      },
    })
    expect(await r.agent(call())).toMatchObject({ ok: true, text: 'resumed plan' })
    expect(r.creates).toHaveLength(2)
    expect(read(r.dirs[1] ?? '', 'run.sh')).toContain(`'--resume' '${SESSION}'`)
  })

  it('to report a claude that failed with no result, with its standard error', async () => {
    const r = rig({ open: finishing('', '2 0', 'boom') })
    expect(await r.agent(call())).toStrictEqual({
      ok: false,
      text: 'claude failed with exit code 2: boom',
      costUsd: 0,
      subtype: 'process_failed',
    })
  })

  it('to remove the folders of runs over for longer than it keeps them when it starts a run', async () => {
    const now = Date.now()
    const r = rig({ open: finishing(result('ok', 0.1), '0 0') }, { startAt: now })
    const old = join(r.runsDir, 'run-old')
    mkdirSync(old)
    write(old, 'exit', '0 0\n')
    const longAgo = new Date(now - PAST_KEEP_MS)
    utimesSync(join(old, 'exit'), longAgo, longAgo)
    await r.agent(call())
    expect(existsSync(old)).toBe(false)
  })
})

describe('reapTabRuns as the start of a service that may have left runs in tabs', () => {
  const runFolder = (runsDir: string, name: string, files: Record<string, string>, claim = true): string => {
    const dir = join(runsDir, name)
    mkdirSync(dir)
    if (claim) mkdirSync(join(dir, 'claim'))
    for (const [file, text] of Object.entries(files)) write(dir, file, text)
    return dir
  }

  function reaper(runsDir: string, command: string) {
    const terminated: number[] = []
    const runs: string[][] = []
    const problems: string[] = []
    const run: Run = (file, args) => {
      runs.push([file, ...args])
      return Promise.resolve({ stdout: file === 'ps' ? command : '{}', stderr: '' })
    }
    const reap = () =>
      reapTabRuns({
        run,
        runsDir,
        now: Date.now,
        terminate: (pid) => {
          terminated.push(pid)
        },
        keepMs: KEEP_MS,
        onProblem: (what) => {
          problems.push(what)
        },
      })
    return { terminated, runs, problems, reap }
  }

  it('to stop the claude of an unfinished run, close its tab and mark it over', async () => {
    const runsDir = folder()
    const dir = runFolder(runsDir, 'run-1', { pid: '4242\n', session: SESSION, terminal: HANDLE })
    const r = reaper(runsDir, `claude -p --output-format stream-json --session-id ${SESSION}\n`)
    expect(await r.reap()).toBe(1)
    expect(r.terminated).toStrictEqual([PID])
    expect(r.runs).toContainEqual(['orca', 'terminal', 'close', '--terminal', HANDLE, '--tab', '--json'])
    expect(existsSync(join(dir, 'exit'))).toBe(true)
    expect(await r.reap()).toBe(0)
  })

  it('to claim a run whose tab never ran the script, so it never starts, and close that tab', async () => {
    const runsDir = folder()
    const dir = runFolder(runsDir, 'run-1', { session: SESSION, terminal: HANDLE }, false)
    const r = reaper(runsDir, '')
    expect(await r.reap()).toBe(0)
    expect(existsSync(join(dir, 'claim'))).toBe(true)
    expect(read(dir, 'exit')).toBe('143 0\n')
    expect(r.runs).toStrictEqual([['orca', 'terminal', 'close', '--terminal', HANDLE, '--tab', '--json']])
  })

  it.each([
    ['another program', '/usr/bin/vim notes.txt\n'],
    ['the claude of another session', 'claude --resume 11111111-1111-4111-8111-111111111111\n'],
  ])('to leave alone %s that took the pid of a run', async (_name, command) => {
    const runsDir = folder()
    runFolder(runsDir, 'run-1', { pid: '4242\n', session: SESSION })
    const r = reaper(runsDir, command)
    expect(await r.reap()).toBe(0)
    expect(r.terminated).toStrictEqual([])
  })

  it('to remove the folders of runs over for longer than it keeps them, and only those', async () => {
    const runsDir = folder()
    const old = runFolder(runsDir, 'run-old', { exit: '0 0\n', 'prompt.txt': 'slack text' })
    const recent = runFolder(runsDir, 'run-new', { exit: '0 0\n' })
    const longAgo = new Date(Date.now() - PAST_KEEP_MS)
    utimesSync(join(old, 'exit'), longAgo, longAgo)
    await reaper(runsDir, '').reap()
    expect([existsSync(old), existsSync(recent)]).toStrictEqual([false, true])
  })

  it('to skip what is not a run folder and report a folder it cannot read, and still handle the rest', async () => {
    const runsDir = folder()
    write(runsDir, '.DS_Store', '')
    const locked = runFolder(runsDir, 'run-locked', { session: SESSION })
    const dir = runFolder(runsDir, 'run-2', { session: SESSION, terminal: HANDLE }, false)
    chmodSync(locked, 0o000)
    const r = reaper(runsDir, '')
    try {
      await r.reap()
    } finally {
      chmodSync(locked, 0o700)
    }
    expect(r.problems).toStrictEqual(['reap'])
    expect(read(dir, 'exit')).toBe('143 0\n')
  })
})

// The script itself, run by bash with a stand-in for claude: the parts that only a real shell can show.
describe('tabScript as a real bash run', () => {
  const FAKE_CLAUDE = `#!/bin/bash
if [ "$1" != "-p" ]; then
  printf '%s\\n' "$*" > "$MARK_DIR/resumed"
  env > "$MARK_DIR/resumed-env"
  exit 0
fi
printf '%s\\n' '{"type":"system","subtype":"init","model":"fake"}'
env > "$MARK_DIR/env"
if [ "$FAKE_MODE" = finish ]; then
  printf '%s\\n' '{"type":"result","subtype":"success","is_error":false,"result":"done","total_cost_usd":0.1}'
  exit 0
fi
trap 'exit 143' TERM
while :; do sleep 0.05; done
`
  // A viewer that never ends on its own, and says where it is so the test can end it.
  const STUCK_VIEWER = `import { writeFileSync } from 'node:fs'
import process from 'node:process'
writeFileSync(process.argv[2] + '.viewer', String(process.pid))
setInterval(() => {}, 1000)
`

  // Resolves once `name` is in `dir`.
  function appeared(dir: string, name: string): Promise<void> {
    return new Promise((resolve) => {
      const watcher = watch(dir, () => {
        if (!existsSync(join(dir, name))) return
        watcher.close()
        resolve()
      })
      if (existsSync(join(dir, name))) {
        watcher.close()
        resolve()
      }
    })
  }

  function start(mode: 'hang' | 'finish', options: { viewer?: string; claim?: boolean } = {}) {
    const dir = folder()
    const bin = join(dir, 'bin')
    mkdirSync(bin)
    writeFileSync(join(bin, 'claude'), FAKE_CLAUDE)
    chmodSync(join(bin, 'claude'), 0o755)
    write(dir, 'prompt.txt', 'the prompt')
    if (options.claim === true) mkdirSync(join(dir, 'claim'))
    const path = `${bin}:/usr/bin:/bin`
    write(
      dir,
      'run.sh',
      tabScript({
        dir,
        cwd: dir,
        args: ['-p', '--session-id', SESSION],
        env: { PATH: path, FAKE_MODE: mode, MARK_DIR: dir },
        resumeArgs: ['--resume', SESSION, '--safe-mode'],
        resumeEnv: { GIT_CONFIG_COUNT: '1' },
        nodePath: process.execPath,
        viewerPath: options.viewer ?? VIEWER,
      }),
    )
    // The tab's own shell has more in its environment than claude may see.
    const child = spawn('/bin/bash', [join(dir, 'run.sh')], {
      env: { PATH: path, MARK_DIR: dir, OWNER_SECRET: 'not for claude' },
      stdio: 'ignore',
    })
    const exited = new Promise<void>((resolve) => {
      child.on('exit', () => {
        resolve()
      })
    })
    return { dir, child, exited }
  }

  it('to write how claude ended and open nothing more when it ended by itself', async () => {
    const { dir, exited } = start('finish')
    await exited
    expect(read(dir, 'exit')).toBe('0 0\n')
    expect(read(dir, 'stream.jsonl')).toContain('"result":"done"')
    expect(existsSync(join(dir, 'resumed'))).toBe(false)
    expect(read(dir, 'env')).not.toContain('OWNER_SECRET')
  })

  it('to stop claude on Ctrl+C, write that the owner stopped it, then open the session as the run had it', async () => {
    const { dir, child, exited } = start('hang')
    await appeared(dir, 'env')
    child.kill('SIGINT')
    await exited
    expect(read(dir, 'exit')).toMatch(/^\d+ 1\n$/)
    expect(read(dir, 'resumed')).toBe(`--resume ${SESSION} --safe-mode\n`)
    expect(read(dir, 'resumed-env')).toContain('GIT_CONFIG_COUNT=1\n')
  })

  it('to only stop claude, without opening the session, when the bot ends it', async () => {
    const { dir, exited } = start('hang')
    await appeared(dir, 'env')
    process.kill(Number(read(dir, 'pid')), 'SIGTERM')
    await exited
    expect(read(dir, 'exit')).toBe('143 0\n')
    expect(existsSync(join(dir, 'resumed'))).toBe(false)
  })

  it('to write the exit as soon as claude ends, while the tab is still showing its output', async () => {
    const viewers = folder()
    const viewer = join(viewers, 'stuck-viewer.mjs')
    writeFileSync(viewer, STUCK_VIEWER)
    const { dir, exited } = start('finish', { viewer })
    await appeared(dir, 'exit')
    expect(read(dir, 'exit')).toBe('0 0\n')
    await appeared(dir, 'stream.jsonl.viewer')
    process.kill(Number(read(dir, 'stream.jsonl.viewer')), 'SIGTERM')
    await exited
  })

  it('to start nothing when the bot claimed the run first', async () => {
    const { dir, exited } = start('finish', { claim: true })
    await exited
    expect(existsSync(join(dir, 'pid'))).toBe(false)
    expect(existsSync(join(dir, 'exit'))).toBe(false)
  })
})
