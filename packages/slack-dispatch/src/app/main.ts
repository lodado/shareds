// The real service: reads the settings and the tokens, opens the store, and starts the app with the real Slack
// client, the real programs and the real agent.

import type { App } from './app.ts'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { createClaudeAgent } from '../agent/claude.ts'
import { loadBaseBranches, loadChannelRepos, loadConfig, loadJiraProjectRepos, loadJiraSettings, loadTokens, parseJiraProjectRepos } from '../config/config.ts'
import { run } from '../exec/exec.ts'
import { createJiraIssueTracker } from '../infra/jira.ts'
import { createDevServerStarter } from '../qa/devserver.ts'
import { createQaRunner } from '../qa/qa.ts'
import { freePort, realDevServerDeps } from '../qa/spawn.ts'
import { createSlackClient } from '../slack/client.ts'
import { redact } from '../store/redact.ts'
import { openStore } from '../store/store.ts'
import { createApp } from './app.ts'
import { acquireLock } from './lock.ts'

type Env = Readonly<Record<string, string | undefined>>

const PRIVATE_DIR_MODE = 0o700

function logLine(event: string, detail?: unknown): void {
  const text = detail === undefined ? '' : ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
  process.stderr.write(`${new Date().toISOString()} ${event}${redact(text)}\n`)
}

export async function startApp(env: Env): Promise<App> {
  const config = loadConfig(env)
  mkdirSync(config.stateDir, { recursive: true, mode: PRIVATE_DIR_MODE })
  mkdirSync(dirname(config.dbPath), { recursive: true, mode: PRIVATE_DIR_MODE })
  const release = acquireLock(join(config.stateDir, 'dispatch.lock'))
  const scratchDir = join(config.stateDir, 'agent-scratch')
  mkdirSync(scratchDir, { recursive: true, mode: PRIVATE_DIR_MODE })
  try {
    const tokens = await loadTokens(env, run)
    if (tokens.app === null) throw new Error('the Slack app token is not in the keychain or the environment')
    const slack = createSlackClient(tokens)
    const ownerId = config.ownerId ?? (await slack.authUserId())
    const agent = createClaudeAgent(run)
    const jira = await loadJiraSettings(env, run)
    const qaDir = join(config.stateDir, 'qa')
    mkdirSync(qaDir, { recursive: true, mode: PRIVATE_DIR_MODE })
    const qa = createQaRunner({
      run,
      agent,
      startServer: createDevServerStarter(realDevServerDeps),
      probe: realDevServerDeps.probe,
      freePort,
      newSessionId: randomUUID,
      qaDir,
      makeDir: (path) => {
        mkdirSync(path, { recursive: true, mode: PRIVATE_DIR_MODE })
      },
      fileExists: existsSync,
      readText: (path) => readFileSync(path, 'utf8'),
      listShots: (dir) =>
        readdirSync(dir)
          .filter((name) => name.endsWith('.png'))
          .toSorted((a, b) => a.localeCompare(b)),
    })
    const app = await createApp({
      config,
      ownerId,
      slack,
      run,
      agent,
      qa,
      statusPort: config.statusPort,
      store: openStore(config.dbPath),
      newSessionId: randomUUID,
      now: () => new Date(),
      baseBranches: loadBaseBranches(config.routesPath),
      // Read again at every poll, so a new channel route needs no restart.
      channelRepos: () => loadChannelRepos(config.routesPath),
      ...(jira === null
        ? {}
        : {
            issueTracker: createJiraIssueTracker(jira, { extraJql: jira.extraJql }),
            projectRepos: () => ({
              ...loadJiraProjectRepos(config.routesPath),
              ...parseJiraProjectRepos(env.JIRA_PROJECT_REPOS),
            }),
          }),
      scratchDir,
      log: logLine,
    })
    return {
      ready: app.ready,
      statusPort: app.statusPort,
      async stop() {
        await app.stop()
        release()
      },
    }
  } catch (error) {
    release()
    throw error
  }
}
