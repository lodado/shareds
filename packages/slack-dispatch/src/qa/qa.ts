// Visual QA, before the pull request is opened. Code decides whether it is needed (a UI file changed) and how the
// screens are reached. A repository with Playwright end-to-end tests is checked by its own e2e script, in its mock mode
// (login and mock APIs handled by its own helpers), running the spec the build wrote for the change and collecting the
// screenshots the spec saves. Any other repository gets its dev server started and its pages photographed, with the
// HTTP status of each checked. A model then looks at the screenshots and says whether the change shows up and nothing
// is visibly broken. A server that was started is always stopped.

import type { Agent } from '../agent/claude.ts'
import type { Screenshot } from '../agent/prompts.ts'
import type { Run } from '../exec/exec.ts'
import type { StartDevServer } from './devserver.ts'
import { join } from 'node:path'
import { judgePrompt, parseBuildResult } from '../agent/prompts.ts'
import { programEnv } from '../exec/env.ts'
import { CommandError } from '../exec/exec.ts'
import { worktreeNameFor } from '../orca/worktree.ts'
import { DevServerError } from './devserver.ts'

export interface QaInput {
  itemKey: string
  worktreePath: string
  baseRef: string
  plan: string
  // The pages the build says show its change; the home page when it named none.
  routes: readonly string[]
  // The Playwright spec the build wrote to reach the changed screen, when it named one.
  spec?: string | null
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
  // The names of the PNG files in a folder, in order.
  listShots: (dir: string) => string[]
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
// A page in mock mode registers its service worker, signs in and loads data before it shows what it is for; a shorter
// wait photographs the loading screen.
const SETTLE_MS = '6000'
// The repository's own way to run without a backend and a sign-in (mocked authentication and APIs), tried in this order
// before the plain `dev` script: against a plain dev server every page waits for an API that is not there.
const START_SCRIPTS = ['dev:msw', 'dev:mock', 'dev'] as const
// A repository's e2e run builds the app, starts it and runs the spec: minutes, not seconds.
const E2E_TIMEOUT_MS = 20 * 60_000
// What is kept of a failed e2e run's output for the report.
const E2E_OUTPUT_SHOWN = 800
const MAX_E2E_SHOTS = 12
const E2E_SCRIPT = 'test:e2e'
const PLAYWRIGHT_CONFIGS = [
  'playwright.config.ts',
  'playwright.config.mjs',
  'playwright.config.js',
  'playwright.config.cjs',
]

const skipped = (reason: string): QaOutcome => ({ status: 'skipped', reason, costUsd: 0 })

function brokenPage(route: string, status: number, script: string): string {
  if (status === 404)
    return `${route} 주소에 페이지가 없어요 (HTTP 404). 앱의 실제 라우트를 알려줘야 해요 (실행: ${script})`
  return `${route}가 HTTP ${status}로 응답했어요 (실행: ${script})`
}

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
const START: Record<Manager, (script: string) => { file: string; args: readonly string[] }> = {
  pnpm: (script) => ({ file: 'pnpm', args: ['run', script] }),
  npm: (script) => ({ file: 'npm', args: ['run', script] }),
  yarn: (script) => ({ file: 'yarn', args: [script] }),
}

const EXEC: Record<Manager, readonly string[]> = {
  pnpm: ['pnpm', 'exec'],
  npm: ['npm', 'exec', '--no', '--'],
  yarn: ['yarn'],
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// The script that starts the app for QA: the repository's mock mode when it has one, else `dev`.
function startScript(deps: QaDeps, path: string): (typeof START_SCRIPTS)[number] | undefined {
  try {
    const parsed: unknown = JSON.parse(deps.readText(join(path, 'package.json')))
    if (!isRecord(parsed) || !isRecord(parsed.scripts)) return undefined
    const { scripts } = parsed
    return START_SCRIPTS.find((name) => typeof scripts[name] === 'string')
  } catch {
    return undefined
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
        { cwd: input.worktreePath, timeoutMs: SHOT_TIMEOUT_MS, inheritEnv: programEnv, signal: input.signal },
      )
      shots.push({ route, viewport: viewport.name, file, status })
    }
  }
  return shots
}

async function judge(deps: QaDeps, input: QaInput, shots: readonly Screenshot[], shotsDir: string): Promise<QaOutcome> {
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

// How each package manager runs the repository's e2e script on one spec.
const E2E: Record<Manager, (spec: string) => { file: string; args: readonly string[] }> = {
  pnpm: (spec) => ({ file: 'pnpm', args: ['run', E2E_SCRIPT, spec] }),
  npm: (spec) => ({ file: 'npm', args: ['run', E2E_SCRIPT, '--', spec] }),
  yarn: (spec) => ({ file: 'yarn', args: [E2E_SCRIPT, spec] }),
}

// A repository is checked by its e2e script when it has one and a Playwright config: its helpers log in and mock the
// APIs, which a photograph of a page cannot do.
function hasPlaywrightE2e(deps: QaDeps, path: string): boolean {
  try {
    const parsed: unknown = JSON.parse(deps.readText(join(path, 'package.json')))
    if (!isRecord(parsed) || !isRecord(parsed.scripts)) return false
    if (typeof parsed.scripts[E2E_SCRIPT] !== 'string') return false
  } catch {
    return false
  }
  return PLAYWRIGHT_CONFIGS.some((name) => deps.fileExists(join(path, name)))
}

const tail = (text: string): string => text.trim().slice(-E2E_OUTPUT_SHOWN)

async function runE2e(deps: QaDeps, input: QaInput): Promise<QaOutcome> {
  if (input.budgetUsd < MIN_QA_BUDGET_USD) return failed('Visual QA를 돌릴 비용이 남지 않았어요')
  const spec = input.spec ?? null
  if (spec === null) {
    return failed('이 레포는 Playwright e2e로 화면을 확인해요. 바뀐 화면을 여는 스펙을 만들고 QA-SPEC 줄에 적어야 해요')
  }
  if (!deps.fileExists(join(input.worktreePath, spec))) return failed(`QA-SPEC 파일이 없어요: ${spec}`)
  // A folder of its own per run, so screenshots of an earlier try are never judged as this one's.
  const shotsDir = join(deps.qaDir, worktreeNameFor(input.itemKey), deps.newSessionId())
  deps.makeDir(shotsDir)
  const command = E2E[managerOf(input.worktreePath, deps.fileExists)](spec)
  try {
    await deps.run(command.file, command.args, {
      cwd: input.worktreePath,
      timeoutMs: E2E_TIMEOUT_MS,
      inheritEnv: programEnv,
      env: { QA_SHOTS_DIR: shotsDir },
      signal: input.signal,
    })
  } catch (error) {
    if (!(error instanceof CommandError)) throw error
    const output = tail(`${error.stdout}\n${error.stderr}`)
    return failed(`e2e 스펙이 실패했어요 (${spec}): ${output}`)
  }
  const files = deps.listShots(shotsDir).slice(0, MAX_E2E_SHOTS)
  if (files.length === 0) {
    return failed(`스펙은 통과했지만 스크린샷이 없어요. page.screenshot으로 QA_SHOTS_DIR에 저장해야 해요 (${spec})`)
  }
  const shots = files.map((name) => ({ route: spec, viewport: name, file: join(shotsDir, name) }))
  return judge(deps, input, shots, shotsDir)
}

export function createQaRunner(deps: QaDeps): RunQa {
  return async (input) => {
    if ((await changedUiFiles(deps, input)).length === 0) return skipped('UI 파일 변경 없음')
    if (hasPlaywrightE2e(deps, input.worktreePath)) return runE2e(deps, input)
    const script = startScript(deps, input.worktreePath)
    if (script === undefined) return skipped('dev 스크립트가 없어서 건너뜀')
    if (input.budgetUsd < MIN_QA_BUDGET_USD) return failed('Visual QA를 돌릴 비용이 남지 않았어요')
    // A review of no screenshots would pass without having looked at anything.
    if (input.routes.length === 0) return failed('확인할 페이지가 없어요')
    const manager = managerOf(input.worktreePath, deps.fileExists)
    const shotsDir = join(deps.qaDir, worktreeNameFor(input.itemKey))
    deps.makeDir(shotsDir)
    const start = START[manager](script)
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
      // A page that does not exist, asks for a sign-in or fails cannot show the change, and a reviewer would only be
      // guessing at it, so the run stops here and says which page.
      const broken = shots.find((shot) => shot.status === 0 || shot.status >= 400)
      if (broken !== undefined) return failed(brokenPage(broken.route, broken.status, script))
      return await judge(deps, input, shots, shotsDir)
    } finally {
      await server.stop()
    }
  }
}
