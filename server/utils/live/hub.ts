import { inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match } from '../../../db/schema'

export interface LiveSubscriber {
  matchIds: Set<string>
  send: (payload: unknown) => void
}

// In-process registry of connected live subscribers (single long-running server).
const subscribers = new Set<LiveSubscriber>()

export function addLiveSubscriber(sub: LiveSubscriber): void {
  subscribers.add(sub)
}

export function removeLiveSubscriber(sub: LiveSubscriber): void {
  subscribers.delete(sub)
}

export function liveSubscriberCount(): number {
  return subscribers.size
}

const liveColumns = {
  id: match.id,
  status: match.status,
  fullTimeHome: match.fullTimeHome,
  fullTimeAway: match.fullTimeAway,
  winner: match.winner,
  kickoffTime: match.kickoffTime,
}

// Push the current state of the given matches to every subscriber watching them.
export async function publishMatchUpdates(db: AppDatabase, matchIds: string[]): Promise<number> {
  if (matchIds.length === 0 || subscribers.size === 0) return 0

  const rows = await db.select(liveColumns).from(match).where(inArray(match.id, matchIds))
  let delivered = 0
  for (const row of rows) {
    for (const sub of subscribers) {
      if (sub.matchIds.has(row.id)) {
        sub.send({ type: 'match:update', match: row })
        delivered += 1
      }
    }
  }
  return delivered
}
