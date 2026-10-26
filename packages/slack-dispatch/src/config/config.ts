// Settings and secrets. Tokens come from the macOS keychain (or an environment variable on other systems) and are
// never written anywhere; the private routes file lives outside the repo.

import type { Run } from '../exec/exec.ts'
import type { SlackTokens } from '../slack/client.ts'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface Config {
  stateDir: string
  dbPath: string
  routesPath: string
  // null until it is read from Slack with the user token
  ownerId: string | null
  pollIntervalMs: number
  // How often the issue tracker is asked for new issues, which cannot be pushed here.
  issuePollIntervalMs: number
  // How many days before today a mention may be and still be picked up; 0 is today only.
  ingestDays: number
  // Whether a finished build is pushed and opened as a pull request. Off by default: the work stays a local commit.
  prEnabled: boolean
  // The port of the read-only status address on this machine; null turns it off.
  statusPort: number | null
  // Whether the plan and the build run with the owner's own claude setup. Off unless OWN_SETUP is exactly 1.
  ownSetup: boolean
}

type Env = Readonly<Record<string, string | undefined>>

const DEFAULT_POLL_SECONDS = 300
const DEFAULT_ISSUE_POLL_SECONDS = 300

// A whole number of at least `min`; anything else (missing, empty, text, a fraction) is the fallback.
function wholeNumber(value: string | undefined, min: number, fallback: number): number {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min) return fallback
  return parsed
}

const DEFAULT_STATUS_PORT = 9814

// A port from 1024 up, or 0 to switch the address off; anything else is the default.
function statusPortOf(value: string | undefined): number | null {
  if (value === '0') return null
  return wholeNumber(value, 1024, DEFAULT_STATUS_PORT) > 65_535
    ? DEFAULT_STATUS_PORT
    : wholeNumber(value, 1024, DEFAULT_STATUS_PORT)
}

export function loadConfig(env: Env, home = homedir()): Config {
  const stateDir = env.STATE_DIR || join(home, '.slack-dispatch')
  return {
    stateDir,
    dbPath: env.STATE_DB_PATH || join(stateDir, 'state.db'),
    routesPath: env.ROUTES_PATH || join(stateDir, 'routes.json'),
    ownerId: env.OWNER_SLACK_USER_ID || null,
    pollIntervalMs: wholeNumber(env.POLL_INTERVAL_SECONDS, 10, DEFAULT_POLL_SECONDS) * 1000,
    issuePollIntervalMs: wholeNumber(env.JIRA_POLL_INTERVAL_SECONDS, 30, DEFAULT_ISSUE_POLL_SECONDS) * 1000,
    ingestDays: wholeNumber(env.INGEST_DAYS, 0, 0),
    prEnabled: env.ENABLE_PR === '1',
    statusPort: statusPortOf(env.STATUS_PORT),
    // Only an exact 1 turns it on: it gives up the protection of `--restricted`, so a typo must not enable it.
    ownSetup: env.OWN_SETUP === '1',
  }
}

const SERVICES = {
  user: { env: 'SLACK_USER_TOKEN', service: 'KEYCHAIN_SERVICE_USER', fallback: 'slack-dispatch-xoxp' },
  bot: { env: 'SLACK_BOT_TOKEN', service: 'KEYCHAIN_SERVICE_BOT', fallback: 'slack-dispatch-xoxb' },
  app: { env: 'SLACK_APP_TOKEN', service: 'KEYCHAIN_SERVICE_APP', fallback: 'slack-dispatch-xapp' },
} as const

async function readSecret(which: keyof typeof SERVICES, env: Env, run: Run, account: string): Promise<string | null> {
  const names = SERVICES[which]
  const fromEnv = env[names.env]
  if (fromEnv) return fromEnv
  try {
    const { stdout } = await run('security', [
      'find-generic-password',
      '-a',
      account,
      '-s',
      env[names.service] || names.fallback,
      '-w',
    ])
    return stdout.trim() || null
  } catch {
    return null
  }
}

// The user and bot tokens are required; the app token is only needed for Socket Mode.
export async function loadTokens(env: Env, run: Run, account = env.USER ?? ''): Promise<SlackTokens> {
  const [user, bot, app] = await Promise.all([
    readSecret('user', env, run, account),
    readSecret('bot', env, run, account),
    readSecret('app', env, run, account),
  ])
  if (user === null || bot === null)
    throw new Error('the Slack user and bot tokens are not in the keychain or the environment')
  return { user, bot, app }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// { "channels": { "dev-web": ["web-app"] } } — which repos a channel is about. A missing file means no routes.
export function loadChannelRepos(path: string): Record<string, string[]> {
  if (!existsSync(path)) return {}
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const channels = isRecord(parsed) ? parsed.channels : null
  if (!isRecord(channels)) return {}
  const table: Record<string, string[]> = {}
  for (const [name, repos] of Object.entries(channels)) {
    if (Array.isArray(repos) && repos.every((repo) => typeof repo === 'string')) table[name] = repos
  }
  return table
}

// { "baseBranches": { "web-app": "stage" } } — a repo whose work starts from a branch other than develop, main or master.
export function loadBaseBranches(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const branches = isRecord(parsed) ? parsed.baseBranches : null
  if (!isRecord(branches)) return {}
  const table: Record<string, string> = {}
  for (const [repo, branch] of Object.entries(branches)) {
    if (typeof branch === 'string' && branch !== '') table[repo] = branch
  }
  return table
}

// Jira is on only when the site, the email and the API token are all there; the token, like the Slack ones, comes from
// the environment or the keychain and is never written anywhere.
export interface JiraSettings {
  baseUrl: string
  email: string
  apiToken: string
  // Extra JQL joined with AND, such as `project = PROJ`.
  extraJql: string
}

export async function loadJiraSettings(env: Env, run: Run, account = env.USER ?? ''): Promise<JiraSettings | null> {
  const baseUrl = env.JIRA_BASE_URL ?? ''
  const email = env.JIRA_EMAIL ?? ''
  if (baseUrl === '' || email === '') return null
  let apiToken = env.JIRA_API_TOKEN ?? ''
  if (apiToken === '') {
    try {
      const service = env.KEYCHAIN_SERVICE_JIRA || 'slack-dispatch-jira'
      const { stdout } = await run('security', ['find-generic-password', '-a', account, '-s', service, '-w'])
      apiToken = stdout.trim()
    } catch {
      apiToken = ''
    }
  }
  if (apiToken === '') return null
  return { baseUrl, email, apiToken, extraJql: env.JIRA_JQL ?? '' }
}

// JIRA_PROJECT_REPOS="PROJ:web-app,OPS:infra|tools" — the same map kept in .env. A project named here wins over
// routes.json.
export function parseJiraProjectRepos(value: string | undefined): Record<string, string[]> {
  const table: Record<string, string[]> = {}
  for (const pair of (value ?? '').split(',')) {
    const [project = '', repos = ''] = pair.split(':').map((part) => part.trim())
    const names = repos
      .split('|')
      .map((repo) => repo.trim())
      .filter((repo) => repo !== '')
    if (project !== '' && names.length > 0) table[project] = names
  }
  return table
}

// { "jiraProjects": { "PROJ": ["web-app"] } } — which repos a Jira project is about.
export function loadJiraProjectRepos(path: string): Record<string, string[]> {
  if (!existsSync(path)) return {}
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const projects = isRecord(parsed) ? parsed.jiraProjects : null
  if (!isRecord(projects)) return {}
  const table: Record<string, string[]> = {}
  for (const [name, repos] of Object.entries(projects)) {
    if (Array.isArray(repos) && repos.every((repo) => typeof repo === 'string')) table[name] = repos
  }
  return table
}
