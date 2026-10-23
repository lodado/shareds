import type { Run, RunOptions } from '../exec/exec'
import type { AgentCall } from './claude'
import { describe, expect, it } from 'vitest'
import { CommandError } from '../exec/exec'
import { AgentAborted, claudeArgs, createClaudeAgent, parseAgentOutput } from './claude'

const SESSION = '0b6a6a50-3e51-4c93-9a0a-0d1c2a3b4c5d'

const call = (overrides: Partial<AgentCall> = {}): AgentCall => ({
  cwd: '/work/wt',
  prompt: 'do the thing',
  sessionId: SESSION,
  resume: false,
  mode: 'plan',
  model: 'opusplan',
  maxBudgetUsd: 1.5,
  timeoutMs: 60_000,
  ...overrides,
})

const success = (result: string, cost = 0.25): string =>
  JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result, total_cost_usd: cost })

describe('claudeArgs as the command line of a call', () => {
  it('to be a plan call: read-only tools, a new session, lean settings, no prompt on the line', () => {
    expect(claudeArgs(call())).toStrictEqual([
      '-p',
      '--output-format',
      'json',
      '--model',
      'opusplan',
      '--max-budget-usd',
      '1.5',
      '--safe-mode',
      '--permission-prompts',
      'none',
      '--permission-mode',
      'plan',
      '--allowedTools',
      'Read,Glob,Grep',
      '--session-id',
      SESSION,
    ])
  })

  it('to be a build call: edits accepted and only the repo checks and a commit allowed, in the session that planned', () => {
    const args = claudeArgs(call({ mode: 'build', resume: true }))
    expect(args).toContain('acceptEdits')
    expect(args.slice(-2)).toStrictEqual(['--resume', SESSION])
    const allowed = args[args.indexOf('--allowedTools') + 1]?.split(',') ?? []
    expect(allowed.filter((tool) => tool.startsWith('Bash'))).toStrictEqual([
      'Bash(pnpm lint)',
      'Bash(pnpm run lint)',
      'Bash(pnpm typecheck)',
      'Bash(pnpm run typecheck)',
      'Bash(pnpm test)',
      'Bash(pnpm test:*)',
      'Bash(pnpm run test)',
      'Bash(pnpm run test:*)',
      'Bash(pnpm build)',
      'Bash(pnpm run build)',
      'Bash(git status:*)',
      'Bash(git diff:*)',
      'Bash(git log:*)',
      'Bash(git add:*)',
      'Bash(git commit:*)',
      'Bash(ls:*)',
    ])
    expect(allowed).toEqual(expect.arrayContaining(['Read', 'Glob', 'Grep', 'Edit', 'Write']))
  })

  it.each(['node', 'npx', 'npm', 'pnpm exec', 'pnpm dlx', 'git push', 'gh', 'curl', 'security'])(
    'to be unable to run %s, which could run anything or reach a remote',
    (program) => {
      const args = claudeArgs(call({ mode: 'build' }))
      const allowed = args[args.indexOf('--allowedTools') + 1]?.split(',') ?? []
      expect(allowed.some((tool) => tool.startsWith(`Bash(${program}`) || tool === 'Bash')).toBe(false)
    },
  )

  it('to be a QA call that can only read: images are looked at with Read, nothing is run or changed', () => {
    const args = claudeArgs(call({ mode: 'qa', model: 'sonnet' }))
    expect(args.slice(args.indexOf('--permission-mode'), args.indexOf('--permission-mode') + 4)).toStrictEqual([
      '--permission-mode',
      'plan',
      '--allowedTools',
      'Read',
    ])
    expect(args).not.toContain('--disallowedTools')
    expect(args).toContain('--safe-mode')
  })

  it('to be unable to change the files that run at a commit or on a server', () => {
    const args = claudeArgs(call({ mode: 'build' }))
    const denied = args[args.indexOf('--disallowedTools') + 1]?.split(',') ?? []
    expect(denied).toStrictEqual(['Edit(.husky/**)', 'Write(.husky/**)', 'Edit(.github/**)', 'Write(.github/**)'])
    expect(claudeArgs(call({ mode: 'plan' }))).not.toContain('--disallowedTools')
  })

  it('to be run without anything of the owner own setup', () => {
    for (const mode of ['plan', 'build', 'text'] as const) {
      const args = claudeArgs(call({ mode }))
      expect(args).toContain('--safe-mode')
      expect(args).toContain('--permission-prompts')
    }
  })

  it('to be a text call that cannot write', () => {
    const args = claudeArgs(call({ mode: 'text', model: 'haiku' }))
    expect(args).toContain('plan')
    expect(args).not.toContain('Edit')
    expect(args[args.indexOf('--model') + 1]).toBe('haiku')
  })
})

describe('parseAgentOutput as the answer of claude -p', () => {
  it('to be ok with the text and the cost on a success', () => {
    expect(parseAgentOutput(success('the plan'))).toStrictEqual({
      ok: true,
      text: 'the plan',
      costUsd: 0.25,
      subtype: 'success',
    })
  })

  it('to be read from the last result of a list of events', () => {
    const events = [{ type: 'system' }, JSON.parse(success('first', 0.1)), JSON.parse(success('last', 0.4))]
    expect(parseAgentOutput(JSON.stringify(events))).toMatchObject({ text: 'last', costUsd: 0.4 })
  })

  it('to be not ok for an error result, keeping its reason', () => {
    const output = JSON.stringify({
      type: 'result',
      subtype: 'error_max_budget_usd',
      is_error: true,
      total_cost_usd: 1.5,
    })
    expect(parseAgentOutput(output)).toStrictEqual({
      ok: false,
      text: '',
      costUsd: 1.5,
      subtype: 'error_max_budget_usd',
    })
  })

  it('to be not ok when is_error is set even though the subtype says success', () => {
    const output = JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'x' })
    expect(parseAgentOutput(output)?.ok).toBe(false)
  })

  it('to be without a secret in the text', () => {
    const token = ['xoxb', '1234567890', 'abcdefABCDEF'].join('-')
    expect(parseAgentOutput(success(`the token is ${token}`))?.text).toBe('the token is [REDACTED]')
  })

  it.each(['not json', '[]', '{}', '{"type":"system"}', 'null', '"text"'])('to be null for %s', (output) => {
    expect(parseAgentOutput(output)).toBeNull()
  })
})

interface Seen {
  file: string
  args: readonly string[]
  options: RunOptions | undefined
}

function fakeRun(answer: () => Promise<{ stdout: string; stderr: string }>): { run: Run; seen: Seen[] } {
  const seen: Seen[] = []
  const run: Run = (file, args, options) => {
    seen.push({ file, args, options })
    return answer()
  }
  return { run, seen }
}

function sequence(answers: (() => Promise<{ stdout: string; stderr: string }>)[]): { run: Run; seen: Seen[] } {
  const seen: Seen[] = []
  const run: Run = (file, args, options) => {
    seen.push({ file, args, options })
    const answer = answers[seen.length - 1]
    if (answer === undefined) return Promise.reject(new Error('called more often than expected'))
    return answer()
  }
  return { run, seen }
}

const failing = (stderr: string) => (): Promise<never> => Promise.reject(new CommandError('claude', 1, stderr))
const succeeding = (text: string) => (): Promise<{ stdout: string; stderr: string }> =>
  Promise.resolve({ stdout: success(text), stderr: '' })

describe('createClaudeAgent as the call to claude', () => {
  it.each(['PATH', 'HOME', 'LANG', 'TMPDIR', 'HTTPS_PROXY', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'])(
    'to be started with %s, which it needs to work and to sign in',
    async (name) => {
      const { run, seen } = fakeRun(() => Promise.resolve({ stdout: success('plan'), stderr: '' }))
      await createClaudeAgent(run)(call())
      expect(seen[0]?.options?.inheritEnv?.(name)).toBe(true)
    },
  )

  it.each([
    'SLACK_BOT_TOKEN',
    'SLACK_USER_TOKEN',
    'SLACK_APP_TOKEN',
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'AWS_SECRET_ACCESS_KEY',
    'NPM_TOKEN',
    'NODE_OPTIONS',
    'OPENAI_API_KEY',
    '',
  ])('to be started without %j, which is the service own and nothing the agent needs', async (name) => {
    const { run, seen } = fakeRun(() => Promise.resolve({ stdout: success('plan'), stderr: '' }))
    await createClaudeAgent(run)(call())
    expect(seen[0]?.options?.inheritEnv?.(name)).toBe(false)
  })

  it('to be resumed, once, when claude says the session id is already in use', async () => {
    const { run, seen } = sequence([failing(`Session ID ${SESSION} is already in use.`), succeeding('plan')])
    const result = await createClaudeAgent(run)(call({ resume: false }))
    expect(result).toMatchObject({ ok: true, text: 'plan' })
    expect(seen.map((one) => one.args.slice(-2))).toStrictEqual([
      ['--session-id', SESSION],
      ['--resume', SESSION],
    ])
  })

  it('to be started as a new session, once, when claude finds no conversation to resume', async () => {
    const { run, seen } = sequence([failing(`No conversation found with session ID: ${SESSION}`), succeeding('plan')])
    const result = await createClaudeAgent(run)(call({ resume: true }))
    expect(result).toMatchObject({ ok: true, text: 'plan' })
    expect(seen.map((one) => one.args.slice(-2))).toStrictEqual([
      ['--resume', SESSION],
      ['--session-id', SESSION],
    ])
  })

  it('to be failed, not retried again, when the switched call fails the same way', async () => {
    const { run, seen } = sequence([failing('is already in use'), failing('is already in use')])
    const result = await createClaudeAgent(run)(call({ resume: false }))
    expect(result).toMatchObject({ ok: false, subtype: 'process_failed' })
    expect(seen).toHaveLength(2)
  })

  it('to be failed at once, without a second call, for any other error', async () => {
    const { run, seen } = sequence([failing('rate limited')])
    expect(await createClaudeAgent(run)(call({ resume: false }))).toMatchObject({ ok: false })
    expect(seen).toHaveLength(1)
  })

  it('to be the result, with the prompt on standard input and the folder and time limit passed on', async () => {
    const { run, seen } = fakeRun(() => Promise.resolve({ stdout: success('plan'), stderr: '' }))
    const result = await createClaudeAgent(run)(call({ prompt: 'secret thread text' }))
    expect(result).toMatchObject({ ok: true, text: 'plan' })
    expect(seen).toHaveLength(1)
    expect(seen[0]?.file).toBe('claude')
    expect(seen[0]?.options).toMatchObject({ cwd: '/work/wt', input: 'secret thread text', timeoutMs: 60_000 })
    expect(seen[0]?.args).not.toContain('secret thread text')
  })

  it('to be not ok, with the cost, when claude fails but printed its verdict', async () => {
    const verdict = JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true, total_cost_usd: 0.7 })
    const { run } = fakeRun(() => Promise.reject(new CommandError('claude', 1, 'stopped', verdict)))
    expect(await createClaudeAgent(run)(call())).toStrictEqual({
      ok: false,
      text: '',
      costUsd: 0.7,
      subtype: 'error_max_turns',
    })
  })

  it('to be not ok even if the verdict printed with a failing exit says success', async () => {
    const { run } = fakeRun(() => Promise.reject(new CommandError('claude', 1, 'x', success('looks fine'))))
    expect((await createClaudeAgent(run)(call())).ok).toBe(false)
  })

  it('to be not ok with the error text when claude failed and printed nothing', async () => {
    const { run } = fakeRun(() => Promise.reject(new CommandError('claude', 2, 'spawn problem')))
    expect(await createClaudeAgent(run)(call())).toStrictEqual({
      ok: false,
      text: 'claude failed with exit code 2: spawn problem',
      costUsd: 0,
      subtype: 'process_failed',
    })
  })

  it('to be not ok when claude printed something that is not a result', async () => {
    const { run } = fakeRun(() => Promise.resolve({ stdout: 'oops', stderr: '' }))
    expect(await createClaudeAgent(run)(call())).toStrictEqual({
      ok: false,
      text: 'claude printed no result',
      costUsd: 0,
      subtype: 'no_result',
    })
  })

  it('to be an AgentAborted, without starting claude, when the signal was aborted already', async () => {
    const { run, seen } = fakeRun(() => Promise.resolve({ stdout: success('x'), stderr: '' }))
    const controller = new AbortController()
    controller.abort()
    await expect(createClaudeAgent(run)(call({ signal: controller.signal }))).rejects.toBeInstanceOf(AgentAborted)
    expect(seen).toStrictEqual([])
  })

  it('to be an AgentAborted when the signal was aborted while claude ran', async () => {
    const controller = new AbortController()
    const { run } = fakeRun(() => {
      controller.abort()
      return Promise.reject(new CommandError('claude', null, 'aborted'))
    })
    await expect(createClaudeAgent(run)(call({ signal: controller.signal }))).rejects.toBeInstanceOf(AgentAborted)
  })

  it('to be rethrown when the failure is not a failed program', async () => {
    const { run } = fakeRun(() => Promise.reject(new TypeError('bad call')))
    await expect(createClaudeAgent(run)(call())).rejects.toThrow('bad call')
  })
})
