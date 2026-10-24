// A look at one past day: every thread that tagged the owner then. The ones worth a decision come as a normal digest
// with the model's reading; the rest (bot posts, threads the owner answered, rooms that cannot be read) are listed in a
// reply under it, so that nothing the owner was tagged in is missing from the picture.

import type { IngestDeps, IngestSummary, SkippedThread, SkipReason } from './ingest.ts'
import { clip, escapeMrkdwn } from '../slack/blocks.ts'
import { ingestMentions } from './ingest.ts'

const DAY_MS = 86_400_000
// A day with more threads than this is cut, oldest first, like any pass.
const MAX_THREADS = 100
const LABEL_SHOWN = 60
const TEXT_LIMIT = 3500
// Room kept for the closing lines (how many more, what failed, what was cut).
const FOOTER_ROOM = 200

const REASON_TEXT: Record<SkipReason, string> = {
  answered: '이미 직접 답함',
  unreadable: '읽을 권한이 없는 대화',
  known: '이전 알림에 이미 있음',
}

// A link text must not close the link, open another one or make a mention.
const linkLabel = (text: string): string => escapeMrkdwn(clip(text, LABEL_SHOWN)).replaceAll('|', ' ')

function skippedLine(thread: SkippedThread): string {
  const label = thread.summary === '' ? '(내용 없음)' : thread.summary
  const reason = REASON_TEXT[thread.reason]
  return thread.url === '' ? `• ${linkLabel(label)} — ${reason}` : `• <${thread.url}|${linkLabel(label)}> — ${reason}`
}

export interface Unseen {
  // Threads that could not be read this time.
  failed: number
  // Threads beyond the limit of the pass, not looked at.
  cut: number
}

function unseenLines(unseen: Unseen): string[] {
  return [
    ...(unseen.failed > 0 ? [`• 읽다가 실패한 쓰레드 ${unseen.failed}개 (로그에 남았어요)`] : []),
    ...(unseen.cut > 0 ? [`• 하루에 ${MAX_THREADS}개까지만 봐서 못 본 쓰레드 ${unseen.cut}개`] : []),
  ]
}

// Whole lines only, so a link is never cut in half; what does not fit is counted. The threads that were not looked at
// are told as well, because a list that hides them reads as if nothing is missing.
export function describeSkipped(
  day: string,
  threads: readonly SkippedThread[],
  unseen: Unseen = { failed: 0, cut: 0 },
): string {
  const head = `${day}에 목록에서 뺀 쓰레드 ${threads.length}개`
  const lines: string[] = []
  let used = head.length + FOOTER_ROOM
  for (const thread of threads) {
    const line = skippedLine(thread)
    if (used + line.length + 1 > TEXT_LIMIT) break
    lines.push(line)
    used += line.length + 1
  }
  const more = threads.length - lines.length
  return [head, ...lines, ...(more > 0 ? [`… 외 ${more}개`] : []), ...unseenLines(unseen)].join('\n')
}

export interface CatchUp {
  // The day as month/day, for the messages.
  day: string
  summary: IngestSummary
}

// `startOfDay` is the first moment of the day to look at, in the owner's time.
export async function catchUp(deps: IngestDeps, startOfDay: Date): Promise<CatchUp> {
  const day = `${startOfDay.getMonth() + 1}/${startOfDay.getDate()}`
  const summary = await ingestMentions(deps, {
    since: startOfDay,
    until: new Date(startOfDay.getTime() + DAY_MS),
    dryRun: false,
    maxThreads: MAX_THREADS,
  })
  const unseen = { failed: summary.failedThreads, cut: summary.cutThreads }
  if (summary.skipped.length > 0 || unseen.failed > 0 || unseen.cut > 0) {
    const channel = await deps.slack.openDm(deps.ownerId)
    // Under the digest of this pass when it made new items, so the owner reads the two together. With none, the digest
    // that went out is an older one sent again, and the list stands on its own.
    const threadTs = summary.created > 0 ? summary.sent[0]?.slackRef.split(':')[1] : undefined
    await deps.slack.postMessage({
      channel,
      text: describeSkipped(day, summary.skipped, unseen),
      ...(threadTs ? { threadTs } : {}),
    })
  }
  return { day, summary }
}
