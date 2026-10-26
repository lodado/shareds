// IssueTrackerPort on the Jira Cloud REST API v3, on the built-in fetch. Answers are checked for their shape before
// anything else sees them, and no error carries the token.

import type { Issue, IssueQuery, IssueTrackerPort } from '../ports/issue-tracker.ts'
import { Buffer } from 'node:buffer'

export interface JiraCredentials {
  // https://your-site.atlassian.net, with no trailing slash needed.
  baseUrl: string
  email: string
  apiToken: string
}

export interface JiraOptions {
  // Extra JQL joined with AND, such as `project = PROJ`.
  extraJql?: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  maxRetries?: number
}

export class JiraApiError extends Error {
  readonly status: number

  constructor(what: string, status: number) {
    super(`jira ${what} failed with HTTP ${status}`)
    this.name = 'JiraApiError'
    this.status = status
  }
}

const FIELDS = ['summary', 'description', 'status', 'priority', 'project', 'updated']
const DEFAULT_MAX_RESULTS = 50
const DEFAULT_RETRIES = 3
const DEFAULT_RETRY_MS = 2000
const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

const pad = (n: number): string => String(n).padStart(2, '0')
// JQL takes "yyyy-MM-dd HH:mm" in the user's own time zone; this machine's zone is assumed to be the same.
export const jqlDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`

export function assignedJql(query: IssueQuery, extraJql = ''): string {
  const parts = ['assignee = currentUser()', 'statusCategory != Done', `updated >= "${jqlDate(query.since)}"`]
  if (query.until !== undefined) parts.push(`updated < "${jqlDate(query.until)}"`)
  if (extraJql.trim() !== '') parts.push(`(${extraJql.trim()})`)
  return `${parts.join(' AND ')} ORDER BY updated ASC`
}

// Atlassian Document Format to plain text: text nodes joined, block nodes on their own lines.
const BLOCKS = new Set(['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote', 'rule', 'tableRow'])
export function adfToText(node: unknown): string {
  if (typeof node === 'string') return node
  if (!isRecord(node)) return ''
  if (node.type === 'text') return str(node.text)
  if (node.type === 'hardBreak') return '\n'
  if (node.type === 'mention') return str(isRecord(node.attrs) ? node.attrs.text : '')
  const inner = Array.isArray(node.content) ? node.content.map(adfToText).join('') : ''
  return BLOCKS.has(str(node.type)) ? `${inner}\n` : inner
}

export function parseIssue(raw: unknown, baseUrl: string): Issue | null {
  if (!isRecord(raw) || !isRecord(raw.fields)) return null
  const key = str(raw.key)
  if (!ISSUE_KEY.test(key)) return null
  const fields = raw.fields
  const updated = new Date(str(fields.updated))
  const project = isRecord(fields.project) ? str(fields.project.key) : key.split('-')[0] ?? ''
  return {
    key,
    project,
    summary: str(fields.summary),
    description: adfToText(fields.description).trim(),
    status: isRecord(fields.status) ? str(fields.status.name) : '',
    priority: isRecord(fields.priority) ? str(fields.priority.name) || null : null,
    url: `${baseUrl}/browse/${key}`,
    updatedAt: Number.isNaN(updated.getTime()) ? new Date(0) : updated,
  }
}

function retryDelayMs(response: Response): number {
  const seconds = Number(response.headers.get('retry-after'))
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_RETRY_MS
  return seconds * 1000
}

function issuesOf(body: unknown): unknown[] {
  if (!isRecord(body) || !Array.isArray(body.issues)) return []
  return body.issues
}

const stripTrailingSlashes = (url: string): string => {
  let end = url.length
  while (end > 0 && url[end - 1] === '/') end -= 1
  return url.slice(0, end)
}

const basicAuth = (email: string, token: string): string => {
  const pair = `${email}:${token}`
  return `Basic ${Buffer.from(pair).toString('base64')}`
}

export function createJiraIssueTracker(credentials: JiraCredentials, options: JiraOptions = {}): IssueTrackerPort {
  const baseUrl = stripTrailingSlashes(credentials.baseUrl)
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const maxRetries = options.maxRetries ?? DEFAULT_RETRIES
  const auth = basicAuth(credentials.email, credentials.apiToken)

  async function call(what: string, path: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' },
      })
      if (response.status !== 429 || attempt >= maxRetries) return response
      await sleep(retryDelayMs(response))
    }
  }

  return {
    assignedToMe: async (query) => {
      const response = await call('search', '/rest/api/3/search/jql', {
        method: 'POST',
        body: JSON.stringify({
          jql: assignedJql(query, options.extraJql),
          fields: FIELDS,
          maxResults: query.maxResults ?? DEFAULT_MAX_RESULTS,
        }),
      })
      if (!response.ok) throw new JiraApiError('search', response.status)
      const issues = issuesOf(await response.json())
      return issues.flatMap((raw) => {
        const issue = parseIssue(raw, baseUrl)
        return issue === null ? [] : [issue]
      })
    },
    findIssue: async (key) => {
      if (!ISSUE_KEY.test(key)) return null
      const response = await call('issue', `/rest/api/3/issue/${key}?fields=${FIELDS.join(',')}`)
      if (response.status === 404 || response.status === 403) return null
      if (!response.ok) throw new JiraApiError('issue', response.status)
      return parseIssue(await response.json(), baseUrl)
    },
  }
}

// Used when Jira is not configured: it never has anything, so the service behaves as before.
export const noIssueTracker: IssueTrackerPort = {
  assignedToMe: () => Promise.resolve([]),
  findIssue: () => Promise.resolve(null),
}
