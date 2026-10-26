// ItemRepositoryPort on the SQLite store. Items from an outside source are made as mentions: work somebody else asked
// for, which waits for the owner's approval in a digest, the same as a Slack mention.

import type { ItemRepositoryPort } from '../ports/item-repository.ts'
import type { Store } from '../store/store.ts'
import { applyEvent, createItems, itemKeyOf, itemsOfThread, logEvent } from '../store/store.ts'

export function createSqliteItemRepository(store: Store): ItemRepositoryPort {
  return {
    isKnown: (sourceKey) => itemsOfThread(store, sourceKey).length > 0,
    // Both steps take their own transaction, as the Slack intake does; a crash between them leaves an `ingested` item
    // that the next pass sees as known, the same as for a mention.
    createTriaged: (item, triage) => {
      createItems(store, item.sourceKey, [item.repo], { source: 'mention', meta: { [item.repo]: item.meta } })
      const key = itemKeyOf(item.sourceKey, item.repo)
      // Policy: outside work always waits for the owner's approval, however sure the routing is.
      applyEvent(store, key, { type: 'triage', handled: triage.handled, confident: false })
      return key
    },
    log: (entry) => {
      logEvent(store, {
        ...(entry.itemKey === undefined ? {} : { itemKey: entry.itemKey }),
        kind: entry.itemKey === undefined ? 'system' : 'inbound',
        type: entry.type,
        payload: entry.payload,
      })
    },
  }
}
