// Reads the mentions of today with the owner's Slack token and shows the digest DM that would be sent. It keeps
// everything in memory and posts nothing. Run: node --no-warnings scripts/dry-run.ts [days-back]

import process from 'node:process'
import { loadChannelRepos, loadConfig, loadTokens } from '../src/config/config.ts'
import { run } from '../src/exec/exec.ts'
import { ingestMentions } from '../src/ingest/ingest.ts'
import { listRepos } from '../src/orca/repos.ts'
import { createSlackClient } from '../src/slack/client.ts'
import { closeStore, listItems, openStore } from '../src/store/store.ts'

const config = loadConfig(process.env)
const tokens = await loadTokens(process.env, run)
const slack = createSlackClient(tokens)
const ownerId = config.ownerId ?? (await slack.authUserId())
const repos = await listRepos(run)

const daysBack = Number(process.argv[2] ?? 0)
const since = new Date()
since.setHours(0, 0, 0, 0)
since.setDate(since.getDate() - daysBack)

const store = openStore(':memory:')
const summary = await ingestMentions(
  {
    store,
    slack,
    ownerId,
    route: { knownRepos: repos.map((repo) => repo.name), channelRepos: loadChannelRepos(config.routesPath) },
  },
  { since, dryRun: true },
)

console.log(`since ${since.toISOString()} | repos known: ${repos.length} | owner: ${ownerId.slice(0, 3)}…`)
console.log(
  `mentions ${summary.mentions}, threads ${summary.threads} -> new items ${summary.created}, ` +
    `already known ${summary.alreadyKnown}, answered by the owner ${summary.handledByOwner}, ` +
    `bot posts skipped ${summary.skippedBots}, unreadable skipped ${summary.skippedUnreadable}, ` +
    `failed ${summary.failedThreads}`,
)
for (const item of listItems(store)) {
  const flag = item.meta.urgent === true ? ' [URGENT]' : ''
  console.log(`\n[${item.stage}] ${item.repo}${flag}`)
  console.log(`  ${item.meta.summary ?? ''}`)
  console.log(`  why this repo: ${item.meta.route ?? ''}`)
  console.log(`  ${item.meta.url ?? ''}`)
}
for (const message of summary.preview) {
  console.log(`\n--- digest DM (not sent): "${message.text}", ${message.blocks.length} blocks ---`)
}
closeStore(store)
