import type { Agent, AgentCall, AgentResult } from '../agent/claude'
import type { Run } from '../exec/exec'
import type { DevServer, DevServerOptions } from './devserver'
import type { QaDeps, QaInput } from './qa'
import { describe, expect, it } from 'vitest'
import { CommandError } from '../exec/exec'
import { worktreeNameFor } from '../orca/worktree'
import { DevServerError } from './devserver'
import { createQaRunner } from './qa'

const WT = '/wt/a'

const input = (overrides: Partial<QaInput> = {}): QaInput => ({
  itemKey: 'slack:C1:1#web-app',
  worktreePath: WT,
  baseRef: 'origin/develop',
  plan: '1. fix the footer link',
  routes: ['/', '/settings'],
  budgetUsd: 1,
  signal: new AbortController().signal,
  ...overrides,
})

interface Options {
  changed?: string
  files?: Record<string, string>
  lockFiles?: string[]
  statuses?: Record<string, number>
  judge?: AgentResult
  shotFails?: boolean
  serverFails?: Error
  // Files that exist in the worktree besides the lock files, relative to it.
  existing?: string[]
  // What the folder of screenshots holds after a run; one screenshot when not given.
  shots?: readonly string[]
  // The e2e run fails with this.
  e2eFails?: Error
}

const E2E_PACKAGE = {
  [`${WT}/package.json`]: JSON.stringify({ scripts: { dev: 'next dev', 'test:e2e': 'playwright test' } }),
}
const E2E_FILES = ['playwright.config.ts', 'e2e/footer.spec.ts']

interface Rig {
  qa: ReturnType<typeof createQaRunner>
  commands: string[]
  serverStarts: DevServerOptions[]
  stops: number
  judgeCalls: AgentCall[]
  madeDirs: string[]
  // For each screenshot: whether it sees PATH, the claude sign-in key, and a GitHub token.
  shotEnv: (boolean | undefined)[][]
  // How each e2e run was started.
  e2eRuns: {
    line: string
    cwd: string | undefined
    env: Readonly<Record<string, string>> | undefined
    timeoutMs: number | undefined
  }[]
}

function rig(options: Options = {}): Rig {
  const commands: string[] = []
  const serverStarts: DevServerOptions[] = []
  const judgeCalls: AgentCall[] = []
  const madeDirs: string[] = []
  const shotEnv: (boolean | undefined)[][] = []
  const e2eRuns: Rig['e2eRuns'] = []
  const state = { stops: 0 }
  const run: Run = (file, args, runOptions) => {
    const line = `${file} ${args.join(' ')}`
    commands.push(line)
    if (line.includes(' screenshot ')) {
      const sees = runOptions?.inheritEnv
      shotEnv.push([sees?.('PATH'), sees?.('ANTHROPIC_API_KEY'), sees?.('GH_TOKEN')])
    }
    if (line.includes('test:e2e')) {
      e2eRuns.push({ line, cwd: runOptions?.cwd, env: runOptions?.env, timeoutMs: runOptions?.timeoutMs })
      if (options.e2eFails !== undefined) return Promise.reject(options.e2eFails)
    }
    if (line.startsWith('git '))
      return Promise.resolve({ stdout: options.changed ?? 'src/footer.tsx\nREADME.md\n', stderr: '' })
    if (options.shotFails === true) return Promise.reject(new CommandError(file, 1, 'browser is missing'))
    return Promise.resolve({ stdout: '', stderr: '' })
  }
  const agent: Agent = (call) => {
    judgeCalls.push(call)
    return Promise.resolve(
      options.judge ?? { ok: true, text: 'Looks right.\nRESULT: PASS', costUsd: 0.3, subtype: 'success' },
    )
  }
  const server: DevServer = {
    baseUrl: 'http://localhost:4100',
    stop: () => {
      state.stops += 1
      return Promise.resolve()
    },
  }
  const deps: QaDeps = {
    run,
    agent,
    startServer: (startOptions) => {
      serverStarts.push(startOptions)
      return options.serverFails === undefined ? Promise.resolve(server) : Promise.reject(options.serverFails)
    },
    probe: (url) => Promise.resolve(options.statuses?.[url] ?? 200),
    freePort: () => Promise.resolve(4100),
    newSessionId: () => 'session-1',
    qaDir: '/state/qa',
    makeDir: (path) => {
      madeDirs.push(path)
    },
    fileExists: (path) =>
      [...(options.lockFiles ?? ['pnpm-lock.yaml']), ...(options.existing ?? [])].some(
        (name) => path === `${WT}/${name}`,
      ),
    listShots: () => [...(options.shots ?? ['1-desktop.png'])],
    readText: (path) => options.files?.[path] ?? '{"scripts":{"dev":"next dev"}}',
  }
  return {
    qa: createQaRunner(deps),
    commands,
    serverStarts,
    judgeCalls,
    madeDirs,
    shotEnv,
    e2eRuns,
    get stops() {
      return state.stops
    },
  }
}

describe('createQaRunner as a build that changed no screen', () => {
  it('to be skipped, with no server and no model, when no UI file changed', async () => {
    const r = rig({ changed: 'src/model.ts\nREADME.md\npackage.json\n' })
    expect(await r.qa(input())).toStrictEqual({ status: 'skipped', reason: 'UI 파일 변경 없음', costUsd: 0 })
    expect(r.serverStarts).toStrictEqual([])
    expect(r.judgeCalls).toStrictEqual([])
    expect(r.commands).toStrictEqual(['git -C /wt/a diff --name-only origin/develop..HEAD'])
  })

  it.each(['a.tsx', 'a.jsx', 'a.css', 'a.scss', 'a.vue', 'a.svelte', 'index.html', 'A.TSX'])(
    'to be needed for a change to %s',
    async (file) => {
      const r = rig({ changed: `src/${file}\n` })
      expect((await r.qa(input())).status).toBe('passed')
    },
  )

  it('to be skipped when the repository has no dev script', async () => {
    const r = rig({ files: { [`${WT}/package.json`]: '{"scripts":{"test":"vitest"}}' } })
    expect(await r.qa(input())).toMatchObject({ status: 'skipped', reason: 'dev 스크립트가 없어서 건너뜀' })
    expect(r.serverStarts).toStrictEqual([])
  })

  it.each(['not json', '[]', '{"scripts":"x"}', '{"scripts":{"dev":5}}'])(
    'to be skipped for a package.json like %j',
    async (content) => {
      const r = rig({ files: { [`${WT}/package.json`]: content } })
      expect((await r.qa(input())).status).toBe('skipped')
    },
  )
})

describe('createQaRunner as a build whose screens are looked at', () => {
  it('to be passed: the server up on a free port, two screenshots per page, a reviewer that sees only the screenshots', async () => {
    const r = rig()
    const outcome = await r.qa(input())
    expect(outcome).toStrictEqual({ status: 'passed', reason: '', report: 'Looks right.', shots: 4, costUsd: 0.3 })
    expect(r.serverStarts).toMatchObject([
      { cwd: WT, command: 'pnpm', args: ['run', 'dev'], port: 4100, env: {}, timeoutMs: 120_000 },
    ])
    const shotsDir = `/state/qa/${worktreeNameFor('slack:C1:1#web-app')}`
    expect(r.madeDirs).toStrictEqual([shotsDir])
    expect(r.commands.slice(1)).toStrictEqual([
      `pnpm exec playwright screenshot --browser chromium --full-page --viewport-size 1280,800 --wait-for-timeout 6000 http://localhost:4100/ ${shotsDir}/1-desktop.png`,
      `pnpm exec playwright screenshot --browser chromium --full-page --viewport-size 390,844 --wait-for-timeout 6000 http://localhost:4100/ ${shotsDir}/1-mobile.png`,
      `pnpm exec playwright screenshot --browser chromium --full-page --viewport-size 1280,800 --wait-for-timeout 6000 http://localhost:4100/settings ${shotsDir}/2-desktop.png`,
      `pnpm exec playwright screenshot --browser chromium --full-page --viewport-size 390,844 --wait-for-timeout 6000 http://localhost:4100/settings ${shotsDir}/2-mobile.png`,
    ])
    expect(r.judgeCalls).toHaveLength(1)
    expect(r.judgeCalls[0]).toMatchObject({
      cwd: shotsDir,
      mode: 'qa',
      model: 'sonnet',
      resume: false,
      maxBudgetUsd: 1,
    })
    expect(r.judgeCalls[0]?.prompt).toContain(`${shotsDir}/2-mobile.png (/settings, mobile, HTTP 200)`)
    expect(r.judgeCalls[0]?.prompt).toContain('<thread>\n1. fix the footer link\n</thread>')
    expect(r.stops).toBe(1)
  })

  it('to be taken by a browser that sees what a program needs and none of the sign-in variables', async () => {
    const r = rig()
    await r.qa(input({ routes: ['/'] }))
    expect(r.shotEnv).toStrictEqual([
      [true, false, false],
      [true, false, false],
    ])
  })

  it.each([
    [['package-lock.json'], 'npm', ['run', 'dev'], 'npm exec --no -- playwright screenshot'],
    [['yarn.lock'], 'yarn', ['dev'], 'yarn playwright screenshot'],
    [[], 'pnpm', ['run', 'dev'], 'pnpm exec playwright screenshot'],
  ])('to be started with the package manager the repository uses (%j)', async (lockFiles, command, args, shot) => {
    const r = rig({ lockFiles })
    await r.qa(input({ routes: ['/'] }))
    expect(r.serverStarts[0]).toMatchObject({ command, args })
    expect(r.commands[1]?.startsWith(shot)).toBe(true)
  })

  it('to be failed, with no server, when there is no page to check: a review of nothing must not pass', async () => {
    const r = rig()
    expect(await r.qa(input({ routes: [] }))).toMatchObject({ status: 'failed', reason: '확인할 페이지가 없어요' })
    expect(r.serverStarts).toStrictEqual([])
    expect(r.judgeCalls).toStrictEqual([])
  })

  it('to be failed with the reviewer reason, and the server still stopped, when the reviewer says FAIL', async () => {
    const r = rig({
      judge: {
        ok: true,
        text: 'The button overlaps.\nRESULT: FAIL 모바일에서 버튼이 겹침',
        costUsd: 0.4,
        subtype: 'success',
      },
    })
    expect(await r.qa(input())).toStrictEqual({
      status: 'failed',
      reason: '모바일에서 버튼이 겹침',
      report: 'The button overlaps.',
      shots: 4,
      costUsd: 0.4,
    })
    expect(r.stops).toBe(1)
  })

  it('to be failed when the reviewer stopped, keeping what it cost', async () => {
    const r = rig({ judge: { ok: false, text: '', costUsd: 0.9, subtype: 'error_max_budget_usd' } })
    expect(await r.qa(input())).toMatchObject({
      status: 'failed',
      reason: 'the QA reviewer stopped (error_max_budget_usd)',
      costUsd: 0.9,
    })
  })

  it('to be failed when the reviewer gives no verdict line', async () => {
    const r = rig({ judge: { ok: true, text: 'Looks fine to me', costUsd: 0.2, subtype: 'success' } })
    expect(await r.qa(input())).toMatchObject({ status: 'failed', reason: 'the report has no RESULT line' })
  })
})

describe('createQaRunner as an app that needs a backend and a sign-in', () => {
  const files = (scripts: Record<string, string>): Record<string, string> => ({
    [`${WT}/package.json`]: JSON.stringify({ scripts }),
  })

  it.each([
    [{ dev: 'next dev', 'dev:msw': 'NEXT_PUBLIC_USE_MSW=true next dev' }, 'dev:msw'],
    [{ dev: 'next dev', 'dev:mock': 'mock next dev', 'dev:msw': 'x' }, 'dev:msw'],
    [{ dev: 'next dev', 'dev:mock': 'mock next dev' }, 'dev:mock'],
    [{ dev: 'next dev' }, 'dev'],
  ])('to be started in the mock mode the repository has when it has one: %j', async (scripts, script) => {
    const r = rig({ files: files(scripts) })
    await r.qa(input({ routes: ['/'] }))
    expect(r.serverStarts[0]).toMatchObject({ command: 'pnpm', args: ['run', script] })
  })

  it('to be said in the failure which script ran, so a wrong mode is easy to see', async () => {
    const r = rig({ files: files({ 'dev:msw': 'x', dev: 'y' }), statuses: { 'http://localhost:4100/': 500 } })
    expect(await r.qa(input({ routes: ['/'] }))).toMatchObject({ reason: '/가 HTTP 500로 응답했어요 (실행: dev:msw)' })
  })

  it('to be started with yarn and npm the same way', async () => {
    const yarn = rig({ lockFiles: ['yarn.lock'], files: files({ 'dev:msw': 'x' }) })
    await yarn.qa(input({ routes: ['/'] }))
    expect(yarn.serverStarts[0]).toMatchObject({ command: 'yarn', args: ['dev:msw'] })
    const npm = rig({ lockFiles: ['package-lock.json'], files: files({ 'dev:msw': 'x' }) })
    await npm.qa(input({ routes: ['/'] }))
    expect(npm.serverStarts[0]).toMatchObject({ command: 'npm', args: ['run', 'dev:msw'] })
  })
})

describe('createQaRunner as a page or a program that does not work', () => {
  it.each([500, 503, 0])('to be failed, without asking the reviewer, when a page answers %s', async (status) => {
    const r = rig({ statuses: { 'http://localhost:4100/settings': status } })
    const outcome = await r.qa(input())
    expect(outcome).toMatchObject({ status: 'failed', reason: `/settings가 HTTP ${status}로 응답했어요 (실행: dev)` })
    expect(r.judgeCalls).toStrictEqual([])
    expect(r.stops).toBe(1)
  })

  it.each([401, 403])(
    'to be failed, without asking the reviewer, for a page that asks for a sign-in (%s)',
    async (status) => {
      const r = rig({ statuses: { 'http://localhost:4100/': status } })
      expect(await r.qa(input())).toMatchObject({
        status: 'failed',
        reason: `/가 HTTP ${status}로 응답했어요 (실행: dev)`,
      })
      expect(r.judgeCalls).toStrictEqual([])
    },
  )

  it('to be failed, saying the page does not exist, for a route the app does not have', async () => {
    // A listed route that is not in the app was once photographed anyway: the reviewer saw a loading screen and guessed.
    const r = rig({ statuses: { 'http://localhost:4100/missing-page': 404 } })
    const outcome = await r.qa(input({ routes: ['/missing-page'] }))
    expect(outcome).toMatchObject({
      status: 'failed',
      reason: '/missing-page 주소에 페이지가 없어요 (HTTP 404). 앱의 실제 라우트를 알려줘야 해요 (실행: dev)',
    })
    expect(r.judgeCalls).toStrictEqual([])
    expect(r.stops).toBe(1)
  })

  it('to be passed for a page that answers 200 after a redirect: the reviewer decides', async () => {
    const r = rig({ statuses: { 'http://localhost:4100/': 200, 'http://localhost:4100/settings': 200 } })
    expect((await r.qa(input())).status).toBe('passed')
    expect(r.judgeCalls[0]?.prompt).toContain('(/, desktop, HTTP 200)')
  })

  it('to be failed with the reason when the dev server cannot be started', async () => {
    const r = rig({ serverFails: new DevServerError('the dev server exited with code 127: next: command not found') })
    expect(await r.qa(input())).toStrictEqual({
      status: 'failed',
      reason: 'the dev server exited with code 127: next: command not found',
      report: '',
      shots: 0,
      costUsd: 0,
    })
    expect(r.judgeCalls).toStrictEqual([])
  })

  it('to be an error, not a QA failure, for anything else that goes wrong when starting', async () => {
    const r = rig({ serverFails: new TypeError('bad options') })
    await expect(r.qa(input())).rejects.toThrow('bad options')
  })

  it('to be an error with the server stopped when a screenshot cannot be taken', async () => {
    const r = rig({ shotFails: true })
    await expect(r.qa(input())).rejects.toThrow('browser is missing')
    expect(r.stops).toBe(1)
    expect(r.judgeCalls).toStrictEqual([])
  })

  it('to be failed, with no server, when less than a run is left of the money', async () => {
    const r = rig()
    expect(await r.qa(input({ budgetUsd: 0.1 }))).toMatchObject({
      status: 'failed',
      reason: 'Visual QA를 돌릴 비용이 남지 않았어요',
    })
    expect(r.serverStarts).toStrictEqual([])
  })
})

describe('createQaRunner as a repository with Playwright end-to-end tests', () => {
  const e2e = (overrides: Options = {}): Options => ({ files: E2E_PACKAGE, existing: E2E_FILES, ...overrides })
  const SPEC = 'e2e/footer.spec.ts'
  const shotsDir = `/state/qa/${worktreeNameFor('slack:C1:1#web-app')}/session-1`

  it('to be checked by its own e2e script on the spec of the build, with no dev server of ours', async () => {
    const r = rig(e2e())
    const outcome = await r.qa(input({ spec: SPEC }))
    expect(outcome).toStrictEqual({ status: 'passed', reason: '', report: 'Looks right.', shots: 1, costUsd: 0.3 })
    expect(r.e2eRuns).toStrictEqual([
      { line: `pnpm run test:e2e ${SPEC}`, cwd: WT, env: { QA_SHOTS_DIR: shotsDir }, timeoutMs: 20 * 60_000 },
    ])
    expect(r.serverStarts).toStrictEqual([])
    expect(r.madeDirs).toStrictEqual([shotsDir])
  })

  it('to be judged on the screenshots the spec saved, named by the spec and the file, with no page status', async () => {
    const r = rig(e2e({ shots: ['1-dialog-open.png', '2-dialog-duplicate-names.png'] }))
    await r.qa(input({ spec: SPEC }))
    expect(r.judgeCalls).toHaveLength(1)
    expect(r.judgeCalls[0]).toMatchObject({ cwd: shotsDir, mode: 'qa', model: 'sonnet', maxBudgetUsd: 1 })
    const prompt = r.judgeCalls[0]?.prompt ?? ''
    expect(prompt).toContain(`${shotsDir}/1-dialog-open.png (${SPEC}, 1-dialog-open.png)`)
    expect(prompt).toContain(`${shotsDir}/2-dialog-duplicate-names.png (${SPEC}, 2-dialog-duplicate-names.png)`)
    expect(prompt).not.toContain(', HTTP ')
  })

  it('to be failed, asking for a spec, when the build named none: a page photograph cannot log in', async () => {
    const r = rig(e2e())
    const outcome = await r.qa(input())
    expect(outcome).toMatchObject({ status: 'failed' })
    expect(outcome.reason).toContain('QA-SPEC')
    expect(r.e2eRuns).toStrictEqual([])
    expect(r.judgeCalls).toStrictEqual([])
    expect(r.serverStarts).toStrictEqual([])
  })

  it('to be failed when the spec named is not in the worktree', async () => {
    const r = rig(e2e())
    expect(await r.qa(input({ spec: 'e2e/missing.spec.ts' }))).toMatchObject({
      status: 'failed',
      reason: 'QA-SPEC 파일이 없어요: e2e/missing.spec.ts',
    })
    expect(r.e2eRuns).toStrictEqual([])
  })

  it('to be failed with the end of the output when the spec fails, without asking the reviewer', async () => {
    const error = new CommandError('pnpm', 1, 'warning: x', `${'noise\n'.repeat(400)}1 failed: dialog never opened`)
    const r = rig(e2e({ e2eFails: error }))
    const outcome = await r.qa(input({ spec: SPEC }))
    expect(outcome.status).toBe('failed')
    expect(outcome.reason).toContain(`e2e 스펙이 실패했어요 (${SPEC}): `)
    expect(outcome.reason).toContain('1 failed: dialog never opened')
    expect(outcome.reason.length).toBeLessThan(1000)
    expect(r.judgeCalls).toStrictEqual([])
  })

  it('to be failed, not passed, when the spec passes but saved no screenshot: nothing would be looked at', async () => {
    const r = rig(e2e({ shots: [] }))
    const outcome = await r.qa(input({ spec: SPEC }))
    expect(outcome).toMatchObject({ status: 'failed' })
    expect(outcome.reason).toContain('QA_SHOTS_DIR')
    expect(r.judgeCalls).toStrictEqual([])
  })

  it('to be an error, not a QA failure, for anything that is not the spec failing', async () => {
    const r = rig(e2e({ e2eFails: new TypeError('bad options') }))
    await expect(r.qa(input({ spec: SPEC }))).rejects.toThrow('bad options')
  })

  it('to be at most twelve screenshots to the reviewer', async () => {
    const shots = Array.from({ length: 20 }, (_unused, n) => `${String(n).padStart(2, '0')}.png`)
    const r = rig(e2e({ shots }))
    expect(await r.qa(input({ spec: SPEC }))).toMatchObject({ status: 'passed', shots: 12 })
  })

  it.each([
    [['package-lock.json'], `npm run test:e2e -- ${SPEC}`],
    [['yarn.lock'], `yarn test:e2e ${SPEC}`],
    [[], `pnpm run test:e2e ${SPEC}`],
  ])('to be run with the package manager of the repository (%j)', async (lockFiles, line) => {
    const r = rig(e2e({ lockFiles }))
    await r.qa(input({ spec: SPEC }))
    expect(r.e2eRuns[0]?.line).toBe(line)
  })

  it('to be left to the page photographs when there is a script but no Playwright config', async () => {
    const r = rig({ files: E2E_PACKAGE })
    await r.qa(input({ routes: ['/'] }))
    expect(r.e2eRuns).toStrictEqual([])
    expect(r.serverStarts).toHaveLength(1)
  })

  it('to be left to the page photographs when there is a Playwright config but no e2e script', async () => {
    const r = rig({ existing: ['playwright.config.ts'] })
    await r.qa(input({ routes: ['/'] }))
    expect(r.e2eRuns).toStrictEqual([])
    expect(r.serverStarts).toHaveLength(1)
  })

  it('to be skipped when no UI file changed, with the e2e script left alone', async () => {
    const r = rig(e2e({ changed: 'README.md\n' }))
    expect(await r.qa(input({ spec: SPEC }))).toMatchObject({ status: 'skipped' })
    expect(r.e2eRuns).toStrictEqual([])
  })

  it('to be failed, with nothing run, when less than a run is left of the money', async () => {
    const r = rig(e2e())
    expect(await r.qa(input({ spec: SPEC, budgetUsd: 0.1 }))).toMatchObject({ status: 'failed' })
    expect(r.e2eRuns).toStrictEqual([])
  })
})
