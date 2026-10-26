import type { Issue, IssueTrackerPort } from '../ports/issue-tracker'
import type { Store } from '../store/store'
import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it } from 'vitest'
import { adfToText, assignedJql, createJiraIssueTracker, parseIssue } from '../infra/jira'
import { createSqliteItemRepository } from '../infra/sqlite-item-repository'
import { closeStore, getItem, listEvents, openStore, pendingForDigest } from '../store/store'
import { ingestIssues, issueSourceKey, loadIssueText, parseIssueSourceKey } from './ingest-issues'

const SINCE = new Date(2026, 9, 26, 0, 0)
const opened: Store[] = []
afterEach(() => {
  for (const store of opened.splice(0)) closeStore(store)
})

function issue(key: string, overrides: Partial<Issue> = {}): Issue {
  return {
    key,
    project: key.split('-')[0] ?? '',
    summary: `fix ${key}`,
    description: 'the login page breaks',
    status: 'To Do',
    priority: 'Medium',
    url: `https://x.atlassian.net/browse/${key}`,
    updatedAt: SINCE,
    ...overrides,
  }
}

function fakeTracker(issues: Issue[]): IssueTrackerPort & { queries: unknown[] } {
  const queries: unknown[] = []
  return {
    queries,
    assignedToMe: (query) => {
      queries.push(query)
      return Promise.resolve(issues)
    },
    findIssue: (key) => Promise.resolve(issues.find((i) => i.key === key) ?? null),
  }
}

function setup(issues: Issue[]) {
  const store = openStore(':memory:')
  opened.push(store)
  const tracker = fakeTracker(issues)
  const deps = {
    tracker,
    items: createSqliteItemRepository(store),
    route: { knownRepos: ['web-app', 'api-server'] },
    projectRepos: { WEB: ['web-app'] },
  }
  return { store, tracker, deps }
}

describe('ingestIssues', () => {
  it('makes one item per issue that waits for the digest, like a mention', async () => {
    const { store, tracker, deps } = setup([issue('WEB-1'), issue('OPS-2', { priority: 'Highest' })])
    const summary = await ingestIssues(deps, { since: SINCE })
    expect(summary).toEqual({ issues: 2, created: 2, alreadyKnown: 0, failed: 0 })
    expect(tracker.queries).toEqual([{ since: SINCE }])
    const web = getItem(store, 'jira:WEB-1#web-app')
    expect(web?.stage).toBe('notified')
    expect(web?.source).toBe('mention')
    expect(web?.meta.summary).toBe('[WEB-1] fix WEB-1')
    expect(web?.meta.url).toBe('https://x.atlassian.net/browse/WEB-1')
    expect(getItem(store, 'jira:OPS-2#unrouted')?.meta.urgent).toBe(true)
    expect(new Set(pendingForDigest(store).map((item) => item.key))).toEqual(
      new Set(['jira:OPS-2#unrouted', 'jira:WEB-1#web-app']),
    )
    expect(listEvents(store).some((event) => event.type === 'issue_seen')).toBe(true)
  })

  it('routes by text when the project has no mapping', async () => {
    const { store, deps } = setup([issue('OPS-3', { description: 'api-server returns 500' })])
    await ingestIssues(deps, { since: SINCE })
    expect(getItem(store, 'jira:OPS-3#api-server')).toBeDefined()
  })

  it('does not list the same issue twice', async () => {
    const { deps } = setup([issue('WEB-1')])
    await ingestIssues(deps, { since: SINCE })
    expect(await ingestIssues(deps, { since: SINCE })).toEqual({ issues: 1, created: 0, alreadyKnown: 1, failed: 0 })
  })
})

describe('issue text', () => {
  it('round-trips the source key and reads the issue for the agent', async () => {
    expect(parseIssueSourceKey(issueSourceKey('WEB-1'))).toBe('WEB-1')
    expect(parseIssueSourceKey('slack:C1:1.2')).toBeNull()
    const text = await loadIssueText(fakeTracker([issue('WEB-1')]), 'jira:WEB-1')
    expect(text).toContain('[Jira WEB-1] fix WEB-1')
    expect(text).toContain('the login page breaks')
  })
})

describe('jira adapter', () => {
  it('builds the JQL for today', () => {
    expect(assignedJql({ since: SINCE }, 'project = WEB')).toBe(
      'assignee = currentUser() AND statusCategory != Done AND updated >= "2026-10-26 00:00" AND (project = WEB) ORDER BY updated ASC',
    )
  })

  it('flattens ADF and parses an issue', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] }
    expect(adfToText(doc)).toBe('hello\n')
    const parsed = parseIssue(
      {
        key: 'WEB-9',
        fields: { summary: 's', description: doc, status: { name: 'Open' }, project: { key: 'WEB' }, updated: '2026-10-26T01:00:00.000+0900' },
      },
      'https://x.atlassian.net',
    )
    expect(parsed?.description).toBe('hello')
    expect(parseIssue({ key: 'bad key', fields: {} }, '')).toBeNull()
  })

  it('searches with basic auth and retries a 429', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = []
    let first = true
    const fetchImpl: typeof fetch = (input, init) => {
      calls.push({ url: String(input), init })
      if (first) {
        first = false
        return Promise.resolve(new Response('', { status: 429, headers: { 'retry-after': '1' } }))
      }
      return Promise.resolve(
        Response.json({ issues: [{ key: 'WEB-1', fields: { summary: 'a', project: { key: 'WEB' } } }] }),
      )
    }
    const tracker = createJiraIssueTracker(
      { baseUrl: 'https://x.atlassian.net/', email: 'me@x', apiToken: 't' },
      { fetchImpl, sleep: () => Promise.resolve() },
    )
    const found = await tracker.assignedToMe({ since: SINCE })
    expect(found.map((i) => i.key)).toEqual(['WEB-1'])
    expect(calls).toHaveLength(2)
    expect(calls[0]?.url).toBe('https://x.atlassian.net/rest/api/3/search/jql')
    expect(calls[0]?.init?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from('me@x:t').toString('base64')}`,
    })
  })
})
