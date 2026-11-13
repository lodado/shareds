import { AgentSessionBusy } from '../agent/claude.ts'

export interface SessionCheck {
  // Whether a claude of the session runs now (the owner's, in an Orca tab after a Ctrl+C); not asked when not given.
  sessionBusy?: (sessionId: string) => Promise<boolean>
}

// Before a job touches an item's worktree (a reset, an install): with a claude still on the item's session there, the
// run does not start at all, so the owner's work in progress is left as it is.
export async function ensureSessionFree(deps: SessionCheck, sessionId: string): Promise<void> {
  if (deps.sessionBusy !== undefined && (await deps.sessionBusy(sessionId))) throw new AgentSessionBusy()
}
