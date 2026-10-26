// The port the work-intake use cases store items through. It speaks in the domain's words (a source, a repo, a
// triage), not in tables; the SQLite adapter in infra/sqlite-item-repository.ts is the one real implementation.

import type { ItemMeta } from '../store/store.ts'

export interface NewIntakeItem {
  // Where the work came from, such as `jira:PROJ-123`. One source may become several items, one per repo.
  sourceKey: string
  repo: string
  meta: ItemMeta
}

export interface IntakeLog {
  itemKey?: string
  type: string
  payload: Record<string, unknown>
}

export interface ItemRepositoryPort {
  // Whether any item was already made from this source.
  isKnown: (sourceKey: string) => boolean
  // Makes the item and records the triage in one step. Returns the new item's key.
  createTriaged: (item: NewIntakeItem, triage: { handled: boolean }) => string
  log: (entry: IntakeLog) => void
}
