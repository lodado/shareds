// The parts of Slack text and button clicks that the digest and the cards share.

export function clip(text: string, limit: number): string {
  const flat = text.replaceAll(/\s+/g, ' ').trim()
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`
}

// Slack reads <, > and & in a message as markup. Text from a thread or an agent is shown as text, so it cannot make a
// link or a mention.
export function escapeMrkdwn(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

// Whole lines only, so a code span or a link is not cut in the middle; what does not fit is said, not hidden.
export function fitText(text: string, limit: number): string {
  if (text.length <= limit) return text
  const note = '\n… (이하 생략)'
  const kept: string[] = []
  let used = note.length
  for (const line of text.split('\n')) {
    if (used + line.length + 1 > limit) break
    kept.push(line)
    used += line.length + 1
  }
  return `${kept.join('\n')}${note}`
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

interface Failure {
  ok: false
  error: string
}

export type FirstAction = { ok: true; payload: Record<string, unknown>; actionId: string; value: unknown } | Failure

// A click carries a list of actions; the first one is the button that was pressed. Nothing in it is trusted yet.
export function firstAction(payload: unknown): FirstAction {
  if (!isRecord(payload) || payload.type !== 'block_actions') return { ok: false, error: 'not a block_actions payload' }
  const first: unknown = Array.isArray(payload.actions) ? payload.actions[0] : undefined
  if (!isRecord(first) || typeof first.action_id !== 'string') return { ok: false, error: 'no action in the payload' }
  return { ok: true, payload, actionId: first.action_id, value: first.value }
}

const ACTION_ID_LENGTH_SHOWN = 60

// Reads `<action>:<number>` ids: the action must be one the caller knows, and the number is returned as text.
export function matchAction<A extends string>(
  actionId: string,
  pattern: RegExp,
  isKnown: (value: string) => value is A,
  kind: string,
): { ok: true; action: A; id: string } | Failure {
  const match = pattern.exec(actionId)
  const action = match?.[1]
  const id = match?.[2]
  if (action === undefined || id === undefined || !isKnown(action)) {
    return { ok: false, error: `not ${kind}: ${clip(actionId, ACTION_ID_LENGTH_SHOWN)}` }
  }
  return { ok: true, action, id }
}
