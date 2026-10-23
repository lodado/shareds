// A prompt the owner types in the bot DM is cut into per-repo tasks by a cheap agent. The agent's answer is
// not trusted: this module keeps only tasks for repos that really exist, bounds the fan-out, and says what it
// dropped so the owner can see it. Pure functions only.

export interface SplitTask {
  repo: string
  task: string
}

export type DropReason = 'unknown_repo' | 'empty_task' | 'too_long' | 'not_an_object'

export interface SplitDrop {
  repo: string
  reason: DropReason
}

export type SplitResult =
  | { ok: true; tasks: SplitTask[]; dropped: SplitDrop[] }
  | { ok: false; error: string; dropped: SplitDrop[] }

// A request that names more repos than this is more likely a mistake or an injection than a plan.
export const MAX_REPOS_PER_REQUEST = 8
const MAX_TASK_LENGTH = 4000
const SHOWN_REPO_LENGTH = 40

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const shown = (value: unknown): string => (typeof value === 'string' ? value.slice(0, SHOWN_REPO_LENGTH) : '?')

type Checked = { task: SplitTask } | { drop: SplitDrop }

function check(item: unknown, knownRepos: ReadonlySet<string>): Checked {
  if (!isRecord(item)) return { drop: { repo: '?', reason: 'not_an_object' } }
  const { repo, task } = item
  if (typeof repo !== 'string' || !knownRepos.has(repo)) return { drop: { repo: shown(repo), reason: 'unknown_repo' } }
  const text = typeof task === 'string' ? task.trim() : ''
  if (text === '') return { drop: { repo, reason: 'empty_task' } }
  if (text.length > MAX_TASK_LENGTH) return { drop: { repo, reason: 'too_long' } }
  return { task: { repo, task: text } }
}

// Two tasks for the same repo become one item with both tasks, in the order the agent gave them.
function mergeByRepo(tasks: readonly SplitTask[]): SplitTask[] {
  const merged = new Map<string, string>()
  for (const { repo, task } of tasks) merged.set(repo, [merged.get(repo), task].filter(Boolean).join('\n'))
  return [...merged].map(([repo, task]) => ({ repo, task }))
}

export function validateSplit(raw: unknown, knownRepos: readonly string[]): SplitResult {
  if (!isRecord(raw) || !Array.isArray(raw.tasks))
    return { ok: false, error: 'the output has no tasks list', dropped: [] }
  const known = new Set(knownRepos)
  const kept: SplitTask[] = []
  const dropped: SplitDrop[] = []
  const items: readonly unknown[] = raw.tasks
  for (const item of items) {
    const result = check(item, known)
    if ('task' in result) kept.push(result.task)
    else dropped.push(result.drop)
  }
  const tasks = mergeByRepo(kept)
  if (tasks.length === 0) return { ok: false, error: 'no task names a known repo', dropped }
  if (tasks.length > MAX_REPOS_PER_REQUEST) {
    return { ok: false, error: `too many repos (${tasks.length}, at most ${MAX_REPOS_PER_REQUEST})`, dropped }
  }
  return { ok: true, tasks, dropped }
}

const DROP_TEXT: Record<DropReason, string> = {
  unknown_repo: '등록되지 않은 레포',
  empty_task: '작업 내용 없음',
  too_long: '작업 문구가 너무 김',
  not_an_object: '형식이 맞지 않음',
}

const firstLine = (text: string, limit: number): string => {
  const line = text.split('\n')[0] ?? ''
  return line.length <= limit ? line : `${line.slice(0, limit - 1)}…`
}

// What the owner reads before planning starts: one line per repo, then anything that was left out.
export function describeSplit(tasks: readonly SplitTask[], dropped: readonly SplitDrop[]): string {
  const lines = tasks.map(({ repo, task }) => `• ${repo}: ${firstLine(task, 100)}`)
  const left = dropped.map(({ repo, reason }) => `• ${repo} (${DROP_TEXT[reason]})`)
  return [`${tasks.length}개 레포로 나눴어요.`, ...lines, ...(left.length > 0 ? ['제외한 항목:', ...left] : [])].join(
    '\n',
  )
}
