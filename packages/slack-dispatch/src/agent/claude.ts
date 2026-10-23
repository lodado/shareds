// The one place `claude -p` is started. A call says what it needs (directory, prompt, session, mode, model, budget) and
// gets back plain data; the permission flags, the lean settings and the output parsing live here so no caller can
// forget them. The prompt goes in through standard input, never on the command line.

import type { Run } from '../exec/exec.ts'
import { agentEnv } from '../exec/env.ts'
import { CommandError } from '../exec/exec.ts'
import { redact } from '../store/redact.ts'

// plan: reads only, writes a plan. build: may edit and run the repo's own tooling. text: answers a question, no
// repo is involved. qa: looks at screenshots (images are read with the Read tool) and judges them.
type AgentMode = 'plan' | 'build' | 'text' | 'qa'

// opusplan plans on the strongest model and builds on the cheaper one inside the same session.
type AgentModel = 'opusplan' | 'sonnet' | 'haiku'

export interface AgentCall {
  cwd: string
  prompt: string
  sessionId: string
  // The session exists already: continue it instead of starting it.
  resume: boolean
  mode: AgentMode
  model: AgentModel
  maxBudgetUsd: number
  timeoutMs: number
  signal?: AbortSignal
}

export interface AgentResult {
  ok: boolean
  text: string
  costUsd: number
  // The reason the run stopped, as claude reports it ("success", "error_max_budget_usd", …).
  subtype: string
}

export type Agent = (call: AgentCall) => Promise<AgentResult>

export class AgentAborted extends Error {
  constructor() {
    super('the agent was stopped')
    this.name = 'AgentAborted'
  }
}

const READ_TOOLS = ['Read', 'Glob', 'Grep']

// What a build may run without asking: edit files, run the repository's own checks, and commit. Anything else would
// need an answer, and nobody answers in a headless run. Programs that run whatever they are given (node, npx, npm,
// pnpm exec, pnpm dlx) and anything that talks to a remote (git push, gh) are deliberately not here.
const BUILD_TOOLS = [
  ...READ_TOOLS,
  'Edit',
  'Write',
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
]

// Files that run on their own at a commit or on a server. A build that rewrote them could make the next commit, or the
// pull request, run anything, so a change there is for the owner to make.
const NEVER_CHANGED = ['Edit(.husky/**)', 'Write(.husky/**)', 'Edit(.github/**)', 'Write(.github/**)']

const MODE_FLAGS: Record<AgentMode, readonly string[]> = {
  plan: ['--permission-mode', 'plan', '--allowedTools', READ_TOOLS.join(',')],
  build: [
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    BUILD_TOOLS.join(','),
    '--disallowedTools',
    NEVER_CHANGED.join(','),
  ],
  text: ['--permission-mode', 'plan', '--allowedTools', READ_TOOLS.join(',')],
  qa: ['--permission-mode', 'plan', '--allowedTools', 'Read'],
}

export function claudeArgs(call: AgentCall): string[] {
  return [
    '-p',
    '--output-format',
    'json',
    '--model',
    call.model,
    '--max-budget-usd',
    String(call.maxBudgetUsd),
    // None of the owner's own setup (global rules, plugins, hooks, MCP servers, skills) is loaded: it would only add
    // tokens and side effects to a run that has one job. The repository's own rules are read by the agent itself.
    '--safe-mode',
    // Nobody answers a permission prompt here, so anything not allowed above is denied at once.
    '--permission-prompts',
    'none',
    ...MODE_FLAGS[call.mode],
    ...(call.resume ? ['--resume', call.sessionId] : ['--session-id', call.sessionId]),
  ]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// The answer is one result object, or a list of events that ends with it. Secrets are removed before the text goes
// anywhere: it ends up in Slack and in the log.
export function parseAgentOutput(stdout: string): AgentResult | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return null
  }
  const events: unknown[] = Array.isArray(parsed) ? parsed : [parsed]
  const entry = events.findLast((event) => isRecord(event) && event.type === 'result')
  if (!isRecord(entry)) return null
  const subtype = typeof entry.subtype === 'string' ? entry.subtype : 'unknown'
  return {
    ok: entry.is_error !== true && subtype === 'success',
    text: redact(typeof entry.result === 'string' ? entry.result : ''),
    costUsd: typeof entry.total_cost_usd === 'number' ? entry.total_cost_usd : 0,
    subtype,
  }
}

// What claude says on standard error when the session id does not match what is on disk.
const ALREADY_IN_USE = /is already in use/i
const NOT_FOUND = /no conversation found/i

export function createClaudeAgent(run: Run): Agent {
  async function attempt(call: AgentCall, mayRetry: boolean): Promise<AgentResult> {
    // Read through a function: the signal can be aborted while the program runs.
    const wasStopped = (): boolean => call.signal?.aborted === true
    if (wasStopped()) throw new AgentAborted()
    try {
      const { stdout } = await run('claude', claudeArgs(call), {
        cwd: call.cwd,
        input: call.prompt,
        timeoutMs: call.timeoutMs,
        signal: call.signal,
        inheritEnv: agentEnv,
      })
      const result = parseAgentOutput(stdout)
      if (result === null) return { ok: false, text: 'claude printed no result', costUsd: 0, subtype: 'no_result' }
      return result
    } catch (error) {
      if (wasStopped()) throw new AgentAborted()
      if (!(error instanceof CommandError)) throw error
      // A first call that died after claude saved the session, or a resume of a session that was never saved: the
      // session on disk, not our bookkeeping, has the last word, so switch once.
      if (mayRetry && !call.resume && ALREADY_IN_USE.test(error.stderr))
        return attempt({ ...call, resume: true }, false)
      if (mayRetry && call.resume && NOT_FOUND.test(error.stderr)) return attempt({ ...call, resume: false }, false)
      // claude exits non-zero when a budget or turn limit stops it, but still reports the cost on standard output.
      const reported = parseAgentOutput(error.stdout)
      if (reported !== null) return { ...reported, ok: false }
      return { ok: false, text: error.message, costUsd: 0, subtype: 'process_failed' }
    }
  }
  return (call) => attempt(call, true)
}
