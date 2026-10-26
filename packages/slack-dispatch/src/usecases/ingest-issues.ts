// One pass over the issue tracker: the open issues assigned to the owner that changed in the window become items, the
// same kind a Slack mention makes. They then wait for the next digest, which shows them with their analysis and plan
// and the same approve buttons. Depends on ports only; the tracker and the store are passed in.

import type { Issue, IssueTrackerPort } from '../ports/issue-tracker.ts'
import type { ItemRepositoryPort } from '../ports/item-repository.ts'
import type { RouteConfig } from '../route/route.ts'
import { routeThread } from '../route/route.ts'
import { clip } from '../slack/blocks.ts'
import { extractLinks } from '../slack/text.ts'

export interface IssueIngestDeps {
  tracker: IssueTrackerPort
  items: ItemRepositoryPort
  route: RouteConfig
  // Which repos a tracker project is about, such as { PROJ: ['web-app'] }. Tried before the text rules.
  projectRepos?: Readonly<Record<string, readonly string[]>>
}

export interface IssueIngestOptions {
  since: Date
  until?: Date
  maxIssues?: number
}

export interface IssueIngestSummary {
  issues: number
  created: number
  alreadyKnown: number
  failed: number
}

const SUMMARY_LENGTH = 200
const UNROUTED = 'unrouted'
const URGENT_PRIORITIES: ReadonlySet<string> = new Set(['highest', 'blocker', 'critical', 'urgent'])

export const issueSourceKey = (key: string): string => `jira:${key}`

export function parseIssueSourceKey(sourceKey: string): string | null {
  const match = /^jira:([A-Z][A-Z0-9_]*-\d+)$/.exec(sourceKey)
  return match?.[1] ?? null
}

function routeIssue(issue: Issue, deps: IssueIngestDeps): { repo: string; reason: string } {
  const fromProject = deps.projectRepos?.[issue.project]?.find((repo) => deps.route.knownRepos.includes(repo))
  if (fromProject !== undefined) return { repo: fromProject, reason: `Jira 프로젝트 ${issue.project}: ${fromProject}` }
  const text = `${issue.summary}\n${issue.description}`
  const found = routeThread({ text, links: extractLinks(text) }, deps.route)
  if (found.repo !== null) return { repo: found.repo, reason: found.reason }
  return { repo: UNROUTED, reason: `Jira 프로젝트 ${issue.project}에 연결된 레포 없음 (routes.json jiraProjects)` }
}

function ingestIssue(deps: IssueIngestDeps, issue: Issue): 'created' | 'alreadyKnown' {
  const sourceKey = issueSourceKey(issue.key)
  if (deps.items.isKnown(sourceKey)) return 'alreadyKnown'
  const { repo, reason } = routeIssue(issue, deps)
  const itemKey = deps.items.createTriaged(
    {
      sourceKey,
      repo,
      meta: {
        summary: clip(`[${issue.key}] ${issue.summary}`, SUMMARY_LENGTH),
        url: issue.url,
        route: reason,
        urgent: URGENT_PRIORITIES.has((issue.priority ?? '').toLowerCase()),
      },
    },
    { handled: false },
  )
  deps.items.log({
    itemKey,
    type: 'issue_seen',
    payload: { issue: issue.key, status: issue.status, priority: issue.priority, repo, reason },
  })
  return 'created'
}

export async function ingestIssues(deps: IssueIngestDeps, options: IssueIngestOptions): Promise<IssueIngestSummary> {
  const issues = await deps.tracker.assignedToMe({
    since: options.since,
    ...(options.until === undefined ? {} : { until: options.until }),
    ...(options.maxIssues === undefined ? {} : { maxResults: options.maxIssues }),
  })
  const summary: IssueIngestSummary = { issues: issues.length, created: 0, alreadyKnown: 0, failed: 0 }
  for (const issue of issues) {
    try {
      summary[ingestIssue(deps, issue)] += 1
    } catch (error) {
      summary.failed += 1
      deps.items.log({
        type: 'issue_failed',
        payload: { issue: issue.key, error: error instanceof Error ? error.message : String(error) },
      })
    }
  }
  return summary
}

// The text of the issue an item came from, shaped for an agent prompt, like a Slack thread's text.
export async function loadIssueText(tracker: IssueTrackerPort, sourceKey: string, maxChars = 8000): Promise<string> {
  const key = parseIssueSourceKey(sourceKey)
  if (key === null) return ''
  const issue = await tracker.findIssue(key)
  if (issue === null) return ''
  const priority = issue.priority === null ? '' : `, 우선순위: ${issue.priority}`
  const text = [`[Jira ${issue.key}] ${issue.summary}`, `상태: ${issue.status}${priority}`, issue.description].join('\n')
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n… (이후 내용 생략)` : text
}
