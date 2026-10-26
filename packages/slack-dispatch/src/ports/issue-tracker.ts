// The port the application asks issue trackers through. Use cases depend on this interface only; the Jira REST
// adapter (or a fake in tests) is chosen at the composition root and passed in.

export interface Issue {
  // The tracker's own key, such as PROJ-123. Never contains '#' or ':'.
  key: string
  // The project the issue belongs to, such as PROJ.
  project: string
  summary: string
  // Plain text, already flattened from the tracker's rich format.
  description: string
  status: string
  priority: string | null
  url: string
  // When the issue was last changed, as the tracker reports it.
  updatedAt: Date
}

export interface IssueQuery {
  // Issues changed at or after this moment.
  since: Date
  // And before this one, when it is given.
  until?: Date
  maxResults?: number
}

export interface IssueTrackerPort {
  // Open issues assigned to the authenticated user, oldest change first.
  assignedToMe: (query: IssueQuery) => Promise<Issue[]>
  // One issue, or null when it does not exist or cannot be read.
  findIssue: (key: string) => Promise<Issue | null>
}
