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
}

interface Rig {
  qa: ReturnType<typeof createQaRunner>
  commands: string[]
  serverStarts: DevServerOptions[]
  stops: number
  judgeCalls: AgentCall[]
  madeDirs: string[]
}

function rig(options: Options = {}): Rig {
  const commands: string[] = []
  const serverStarts: DevServerOptions[] = []
  const judgeCalls: AgentCall[] = []
  const madeDirs: string[] = []
  const state = { stops: 0 }
  const run: Run = (file, args) => {
    const line = `${file} ${args.join(' ')}`
    commands.push(line)
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
    fileExists: (path) => (options.lockFiles ?? ['pnpm-lock.yaml']).some((name) => path === `${WT}/${name}`),
    readText: (path) => options.files?.[path] ?? '{"scripts":{"dev":"next dev"}}',
  }
  return {
    qa: createQaRunner(deps),
    commands,
    serverStarts,
    judgeCalls,
    madeDirs,
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
      `pnpm exec playwright screenshot --browser chromium --full-page --viewport-size 1280,800 --wait-for-timeout 1500 http://localhost:4100/ ${shotsDir}/1-desktop.png`,
      `pnpm exec playwright screenshot --browser chromium --full-page --viewport-size 390,844 --wait-for-timeout 1500 http://localhost:4100/ ${shotsDir}/1-mobile.png`,
      `pnpm exec playwright screenshot --browser chromium --full-page --viewport-size 1280,800 --wait-for-timeout 1500 http://localhost:4100/settings ${shotsDir}/2-desktop.png`,
      `pnpm exec playwright screenshot --browser chromium --full-page --viewport-size 390,844 --wait-for-timeout 1500 http://localhost:4100/settings ${shotsDir}/2-mobile.png`,
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

describe('createQaRunner as a page or a program that does not work', () => {
  it.each([500, 503, 0])('to be failed, without asking the reviewer, when a page answers %s', async (status) => {
    const r = rig({ statuses: { 'http://localhost:4100/settings': status } })
    const outcome = await r.qa(input())
    expect(outcome).toMatchObject({ status: 'failed', reason: `/settings answered HTTP ${status}` })
    expect(r.judgeCalls).toStrictEqual([])
    expect(r.stops).toBe(1)
  })

  it('to be passed for a page that answers a redirect or a not found: the reviewer decides', async () => {
    const r = rig({ statuses: { 'http://localhost:4100/': 307, 'http://localhost:4100/settings': 404 } })
    expect((await r.qa(input())).status).toBe('passed')
    expect(r.judgeCalls[0]?.prompt).toContain('(/, desktop, HTTP 307)')
    expect(r.judgeCalls[0]?.prompt).toContain('(/settings, mobile, HTTP 404)')
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
