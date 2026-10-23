// Visual QA, before the pull request is opened. Code decides whether it is needed (a UI file changed), starts the
// repository's own dev server, takes the screenshots and checks the HTTP status of each page; a model then looks at
// the screenshots and says whether the change shows up and nothing is visibly broken. The server is always stopped.

import type { Agent } from '../agent/claude.ts'
import type { Run } from '../exec/exec.ts'
import type { StartDevServer } from './devserver.ts'
import { join } from 'node:path'
import { judgePrompt, parseBuildResult } from '../agent/prompts.ts'
import { repoCodeEnv } from '../exec/env.ts'
import { worktreeNameFor } from '../orca/worktree.ts'
import { DevServerError } from './devserver.ts'

export interface QaInput {
  itemKey: string
  worktreePath: string
  baseRef: string
  plan: string
  // The pages the build says show its change; the home page when it named none.
  routes: readonly string[]
  budgetUsd: number
  signal: AbortSignal
}

export type QaOutcome =
  | { status: 'skipped'; reason: string; costUsd: number }
  | { status: 'passed' | 'failed'; reason: string; report: string; shots: number; costUsd: number }

export type RunQa = (input: QaInput) => Promise<QaOutcome>

export interface QaDeps {
  run: Run
  agent: Agent
  startServer: StartDevServer
  // Answers the HTTP status of an address.
  probe: (url: string) => Promise<number>
  freePort: () => Promise<number>
  newSessionId: () => string
  // Where the screenshots of all items are kept, outside every repository.
  qaDir: string
  makeDir: (path: string) => void
  fileExists: (path: string) => boolean
  readText: (path: string) => string
}

interface Viewport {
  name: string
  size: string
}

const VIEWPORTS: readonly Viewport[] = [
  { name: 'desktop', size: '1280,800' },
  { name: 'mobile', size: '390,844' },
]

// Files that change what a user sees.
const UI_FILE = /\.(?:tsx|jsx|css|scss|sass|less|vue|svelte|html|astro)$/i
const MIN_QA_BUDGET_USD = 0.25
const SERVER_TIMEOUT_MS = 120_000
const SHOT_TIMEOUT_MS = 90_000
const JUDGE_TIMEOUT_MS = 300_000
const SETTLE_MS = '1500'

const skipped = (reason: string): QaOutcome => ({ status: 'skipped', reason, costUsd: 0 })

const failed = (reason: string, costUsd = 0): QaOutcome => ({
  status: 'failed',
  reason,
  report: '',
  shots: 0,
  costUsd,
})

type Manager = 'pnpm' | 'npm' | 'yarn'

function managerOf(path: string, exists: (file: string) => boolean): Manager {
  if (exists(join(path, 'package-lock.json'))) return 'npm'
  if (exists(join(path, 'yarn.lock'))) return 'yarn'
  return 'pnpm'
}

// How each package manager starts a script and runs a program the repository has installed.
const START: Record<Manager, { file: string; args: readonly string[] }> = {
  pnpm: { file: 'pnpm', args: ['run', 'dev'] },
  npm: { file: 'npm', args: ['run', 'dev'] },
  yarn: { file: 'yarn', args: ['dev'] },
}

const EXEC: Record<Manager, readonly string[]> = {
  pnpm: ['pnpm', 'exec'],
  npm: ['npm', 'exec', '--no', '--'],
  yarn: ['yarn'],
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function hasDevScript(deps: QaDeps, path: string): boolean {
  try {
    const parsed: unknown = JSON.parse(deps.readText(join(path, 'package.json')))
    if (!isRecord(parsed) || !isRecord(parsed.scripts)) return false
    return typeof parsed.scripts.dev === 'string'
  } catch {
    return false
  }
}

async function changedUiFiles(deps: QaDeps, input: QaInput): Promise<string[]> {
  const { stdout } = await deps.run('git', ['-C', input.worktreePath, 'diff', '--name-only', `${input.baseRef}..HEAD`])
  return stdout.split('\n').filter((file) => UI_FILE.test(file))
}

interface Shot {
  route: string
  viewport: string
  file: string
  status: number
}

async function takeShots(
  deps: QaDeps,
  input: QaInput,
  manager: Manager,
  baseUrl: string,
  shotsDir: string,
): Promise<Shot[]> {
  const [program, ...prefix] = EXEC[manager]
  const shots: Shot[] = []
  for (const [index, route] of input.routes.entries()) {
    const url = `${baseUrl}${route}`
    const status = await deps.probe(url).catch(() => 0)
    for (const viewport of VIEWPORTS) {
      const file = join(shotsDir, `${index + 1}-${viewport.name}.png`)
      await deps.run(
        program ?? manager,
        [
          ...prefix,
          'playwright',
          'screenshot',
          '--browser',
          'chromium',
          '--full-page',
          '--viewport-size',
          viewport.size,
          '--wait-for-timeout',
          SETTLE_MS,
          url,
          file,
        ],
        { cwd: input.worktreePath, timeoutMs: SHOT_TIMEOUT_MS, inheritEnv: repoCodeEnv, signal: input.signal },
      )
      shots.push({ route, viewport: viewport.name, file, status })
    }
  }
  return shots
}

async function judge(deps: QaDeps, input: QaInput, shots: readonly Shot[], shotsDir: string): Promise<QaOutcome> {
  const result = await deps.agent({
    cwd: shotsDir,
    prompt: judgePrompt(input.plan, shots),
    sessionId: deps.newSessionId(),
    resume: false,
    mode: 'qa',
    model: 'sonnet',
    maxBudgetUsd: input.budgetUsd,
    timeoutMs: JUDGE_TIMEOUT_MS,
    signal: input.signal,
  })
  if (!result.ok) return failed(`the QA reviewer stopped (${result.subtype})`, result.costUsd)
  const verdict = parseBuildResult(result.text)
  return {
    status: verdict.ok ? 'passed' : 'failed',
    reason: verdict.reason,
    report: verdict.report,
    shots: shots.length,
    costUsd: result.costUsd,
  }
}

export function createQaRunner(deps: QaDeps): RunQa {
  return async (input) => {
    if ((await changedUiFiles(deps, input)).length === 0) return skipped('UI 파일 변경 없음')
    if (!hasDevScript(deps, input.worktreePath)) return skipped('dev 스크립트가 없어서 건너뜀')
    if (input.budgetUsd < MIN_QA_BUDGET_USD) return failed('Visual QA를 돌릴 비용이 남지 않았어요')
    // A review of no screenshots would pass without having looked at anything.
    if (input.routes.length === 0) return failed('확인할 페이지가 없어요')
    const manager = managerOf(input.worktreePath, deps.fileExists)
    const shotsDir = join(deps.qaDir, worktreeNameFor(input.itemKey))
    deps.makeDir(shotsDir)
    const start = START[manager]
    let server: Awaited<ReturnType<StartDevServer>>
    try {
      server = await deps.startServer({
        cwd: input.worktreePath,
        command: start.file,
        args: start.args,
        port: await deps.freePort(),
        env: {},
        timeoutMs: SERVER_TIMEOUT_MS,
        signal: input.signal,
      })
    } catch (error) {
      if (error instanceof DevServerError) return failed(error.message)
      throw error
    }
    try {
      const shots = await takeShots(deps, input, manager, server.baseUrl, shotsDir)
      const broken = shots.find((shot) => shot.status === 0 || shot.status >= 500)
      if (broken !== undefined) return failed(`${broken.route} answered HTTP ${broken.status}`)
      return await judge(deps, input, shots, shotsDir)
    } finally {
      await server.stop()
    }
  }
}
