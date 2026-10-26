// Reads today's Jira issues assigned to the owner with the real settings and adapter, and prints them. Changes nothing.
//   node --env-file-if-exists=.env --no-warnings scripts/jira-today.ts [daysBack]

import process from 'node:process'
import { loadJiraSettings } from '../src/config/config.ts'
import { run } from '../src/exec/exec.ts'
import { createJiraIssueTracker } from '../src/infra/jira.ts'

const settings = await loadJiraSettings(process.env, run)
if (settings === null) {
  process.stderr.write('Jira is not configured: set JIRA_BASE_URL, JIRA_EMAIL and the keychain token\n')
  process.exit(1)
}
const since = new Date()
since.setHours(0, 0, 0, 0)
since.setDate(since.getDate() - Number(process.argv[2] ?? 0))
const tracker = createJiraIssueTracker(settings, { extraJql: settings.extraJql })
const issues = await tracker.assignedToMe({ since })
process.stdout.write(`${issues.length} issue(s) since ${since.toISOString()}\n`)
for (const issue of issues) {
  const priority = issue.priority === null ? '' : `/${issue.priority}`
  process.stdout.write(`- ${issue.key} [${issue.status}${priority}] ${issue.summary}\n  ${issue.url}\n`)
}
