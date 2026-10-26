import type { Run, RunResult } from '../exec/exec'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadBaseBranches, loadChannelRepos, loadConfig, loadTokens, parseJiraProjectRepos } from './config'

const directories: string[] = []
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'slack-dispatch-config-'))
  directories.push(dir)
  const path = join(dir, 'routes.json')
  writeFileSync(path, content)
  return path
}

interface Call {
  file: string
  args: readonly string[]
}

// A keychain that holds the given secrets by service name, and remembers how it was asked.
function fakeKeychain(secrets: Record<string, string>): { run: Run; calls: Call[] } {
  const calls: Call[] = []
  const run: Run = (file, args) => {
    calls.push({ file, args })
    const service = args[args.indexOf('-s') + 1] ?? ''
    const secret = Object.hasOwn(secrets, service) ? secrets[service] : undefined
    if (secret === undefined) return Promise.reject(new Error('could not be found'))
    return Promise.resolve<RunResult>({ stdout: `${secret}\n`, stderr: '' })
  }
  return { run, calls }
}

describe('loadConfig as the places the bot keeps its state', () => {
  it('to be folders under the home folder by default', () => {
    expect(loadConfig({}, '/home/me')).toEqual({
      stateDir: '/home/me/.slack-dispatch',
      dbPath: '/home/me/.slack-dispatch/state.db',
      routesPath: '/home/me/.slack-dispatch/routes.json',
      ownerId: null,
      pollIntervalMs: 300_000,
      issuePollIntervalMs: 300_000,
      ingestDays: 0,
      prEnabled: false,
      statusPort: 9814,
      ownSetup: false,
    })
  })

  it('to be whatever the environment says', () => {
    expect(
      loadConfig(
        { STATE_DIR: '/s', STATE_DB_PATH: '/db/x.db', ROUTES_PATH: '/r.json', OWNER_SLACK_USER_ID: 'U1' },
        '/home/me',
      ),
    ).toEqual({
      stateDir: '/s',
      dbPath: '/db/x.db',
      routesPath: '/r.json',
      ownerId: 'U1',
      pollIntervalMs: 300_000,
      issuePollIntervalMs: 300_000,
      ingestDays: 0,
      prEnabled: false,
      statusPort: 9814,
      ownSetup: false,
    })
  })

  it('to be no owner for an empty setting', () => {
    expect(loadConfig({ OWNER_SLACK_USER_ID: '' }, '/h').ownerId).toBeNull()
  })
})

describe('loadTokens as the secrets the bot needs', () => {
  it('to be the three tokens read from the keychain with the default service names', async () => {
    const { run, calls } = fakeKeychain({
      'slack-dispatch-xoxp': 'USER',
      'slack-dispatch-xoxb': 'BOT',
      'slack-dispatch-xapp': 'APP',
    })
    expect(await loadTokens({}, run, 'me')).toEqual({ user: 'USER', bot: 'BOT', app: 'APP' })
    expect(calls).toHaveLength(3)
    expect(calls[0]).toEqual({
      file: 'security',
      args: ['find-generic-password', '-a', 'me', '-s', 'slack-dispatch-xoxp', '-w'],
    })
  })

  it('to be the service names from the environment when they are set', async () => {
    const { run } = fakeKeychain({ 'my-user': 'U', 'my-bot': 'B' })
    const tokens = await loadTokens({ KEYCHAIN_SERVICE_USER: 'my-user', KEYCHAIN_SERVICE_BOT: 'my-bot' }, run, 'me')
    expect(tokens).toEqual({ user: 'U', bot: 'B', app: null })
  })

  it('to be an environment variable that wins over the keychain', async () => {
    const { run, calls } = fakeKeychain({ 'slack-dispatch-xoxp': 'FROM-KEYCHAIN', 'slack-dispatch-xoxb': 'BOT' })
    const tokens = await loadTokens({ SLACK_USER_TOKEN: 'FROM-ENV' }, run, 'me')
    expect(tokens.user).toBe('FROM-ENV')
    expect(calls.map((call) => call.args[call.args.indexOf('-s') + 1])).not.toContain('slack-dispatch-xoxp')
  })

  it('to be an error that names no secret when the user or the bot token is missing', async () => {
    const { run } = fakeKeychain({ 'slack-dispatch-xoxb': 'BOT' })
    await expect(loadTokens({}, run, 'me')).rejects.toThrow(
      'the Slack user and bot tokens are not in the keychain or the environment',
    )
  })

  it('to be no app token, without an error, when only Socket Mode would need it', async () => {
    const { run } = fakeKeychain({ 'slack-dispatch-xoxp': 'U', 'slack-dispatch-xoxb': 'B' })
    expect((await loadTokens({}, run, 'me')).app).toBeNull()
  })
})

describe('loadChannelRepos as the private file that says which repos a channel is about', () => {
  it('to be the channels with their repos', () => {
    const path = tempFile('{"channels":{"dev-web":["web-app"],"dev-all":["web-app","api-server"]}}')
    expect(loadChannelRepos(path)).toEqual({ 'dev-web': ['web-app'], 'dev-all': ['web-app', 'api-server'] })
  })

  it('to be nothing for a file that does not exist', () => {
    expect(loadChannelRepos('/no/such/routes.json')).toEqual({})
  })

  it('to be only the entries that are lists of names', () => {
    const path = tempFile('{"channels":{"ok":["a"],"text":"a","mixed":["a",1],"empty":[]}}')
    expect(loadChannelRepos(path)).toEqual({ ok: ['a'], empty: [] })
  })

  it.each([['[]'], ['{"channels":[]}'], ['{"other":1}'], ['{"channels":"x"}']])('to be nothing for %s', (json) => {
    expect(loadChannelRepos(tempFile(json))).toEqual({})
  })

  it('to be an error for a file that is not JSON, so a typo is not silently ignored', () => {
    expect(() => loadChannelRepos(tempFile('{not json'))).toThrow()
  })
})

describe('loadConfig as the pace and the switches of the worker', () => {
  it('to be the poll interval in milliseconds and the days to look back', () => {
    const config = loadConfig({ POLL_INTERVAL_SECONDS: '60', INGEST_DAYS: '2' }, '/h')
    expect([config.pollIntervalMs, config.ingestDays]).toStrictEqual([60_000, 2])
  })

  it('to be asking Jira every five minutes by default, and never under 30 seconds', () => {
    expect(loadConfig({}, '/h').issuePollIntervalMs).toBe(300_000)
    expect(loadConfig({ JIRA_POLL_INTERVAL_SECONDS: '45' }, '/h').issuePollIntervalMs).toBe(45_000)
    expect(loadConfig({ JIRA_POLL_INTERVAL_SECONDS: '5' }, '/h').issuePollIntervalMs).toBe(300_000)
  })

  it.each(['', 'soon', '5', '1.5', '-60'])('to be the default interval for %j', (value) => {
    expect(loadConfig({ POLL_INTERVAL_SECONDS: value }, '/h').pollIntervalMs).toBe(300_000)
  })

  it.each(['', 'x', '-1', '0.5'])('to be today only for the look-back %j', (value) => {
    expect(loadConfig({ INGEST_DAYS: value }, '/h').ingestDays).toBe(0)
  })

  it('to be pull requests only when ENABLE_PR is exactly 1', () => {
    expect(loadConfig({ ENABLE_PR: '1' }, '/h').prEnabled).toBe(true)
    for (const value of ['', '0', 'true', 'yes', '11']) {
      expect(loadConfig({ ENABLE_PR: value }, '/h').prEnabled).toBe(false)
    }
  })
})

describe('loadBaseBranches as the repos with a branch of their own', () => {
  it('to be the repo and branch pairs that are text', () => {
    const path = tempFile('{"baseBranches":{"web-app":"stage","api":5,"empty":"","ok":"develop"}}')
    expect(loadBaseBranches(path)).toStrictEqual({ 'web-app': 'stage', ok: 'develop' })
  })

  it('to be empty for a missing file or a file without the table', () => {
    expect(loadBaseBranches('/no/such/file.json')).toStrictEqual({})
    expect(loadBaseBranches(tempFile('{"channels":{}}'))).toStrictEqual({})
    expect(loadBaseBranches(tempFile('{"baseBranches":["x"]}'))).toStrictEqual({})
  })
})

describe('loadConfig as the port of the status address', () => {
  it('to be 9814 unless told otherwise', () => {
    expect(loadConfig({}, '/h').statusPort).toBe(9814)
  })

  it('to be the port in STATUS_PORT when it is one the owner may use', () => {
    expect(loadConfig({ STATUS_PORT: '9000' }, '/h').statusPort).toBe(9000)
    expect(loadConfig({ STATUS_PORT: '1024' }, '/h').statusPort).toBe(1024)
    expect(loadConfig({ STATUS_PORT: '65535' }, '/h').statusPort).toBe(65_535)
  })

  it('to be switched off by 0', () => {
    expect(loadConfig({ STATUS_PORT: '0' }, '/h').statusPort).toBeNull()
  })

  it.each(['', 'x', '80', '1023', '65536', '99999', '-1', '9000.5'])(
    'to be 9814 for %j, which is not a port to use',
    (value) => {
      expect(loadConfig({ STATUS_PORT: value }, '/h').statusPort).toBe(9814)
    },
  )
})

describe('loadConfig as the use of the owner own claude setup', () => {
  it.each([undefined, '', '0', 'true', 'yes', 'on', ' 1', '11'])(
    'to be off for OWN_SETUP %j: it must be switched on on purpose',
    (value) => {
      expect(loadConfig(value === undefined ? {} : { OWN_SETUP: value }, '/h').ownSetup).toBe(false)
    },
  )

  it('to be on only for OWN_SETUP exactly 1', () => {
    expect(loadConfig({ OWN_SETUP: '1' }, '/h').ownSetup).toBe(true)
  })
})

describe('parseJiraProjectRepos as the project map written in .env', () => {
  it('to be each project with its repos, skipping broken pairs', () => {
    expect(parseJiraProjectRepos(' JUNGLETFT:Deep-Agent , OPS:infra|tools ,bad, :x, Y: ')).toStrictEqual({
      JUNGLETFT: ['Deep-Agent'],
      OPS: ['infra', 'tools'],
    })
  })

  it('to be empty when unset', () => {
    expect(parseJiraProjectRepos(undefined)).toStrictEqual({})
  })
})
