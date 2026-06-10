import { inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match } from '../../../db/schema'

export interface LiveSubscriber {
  matchIds: Set<string>
  // Resolved from the session cookie at WS open; null for guests. Lets
  // league-scoped pushes go to members only.
  userId?: string | null
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

// A prediction changed: broadcast the new crowd totals for that match to every
// connected client (the client ignores it unless the preference is on).
export function publishCrowdUpdate(matchId: string, totals: { home: number; away: number; count: number }): number {
  let delivered = 0
  for (const sub of subscribers) {
    sub.send({ type: 'crowd:update', matchId, totals })
    delivered += 1
  }
  return delivered
}

// League crowd totals are gated data (private leagues): deliver only to the
// league's members, however many connections each of them has open.
export function publishLeagueCrowdUpdate(
  leagueId: string,
  memberIds: readonly string[],
  matchId: string,
  totals: { home: number; away: number; count: number },
): number {
  const members = new Set(memberIds)
  let delivered = 0
  for (const sub of subscribers) {
    if (sub.userId && members.has(sub.userId)) {
      sub.send({ type: 'crowd:update', leagueId, matchId, totals })
      delivered += 1
    }
  }
  return delivered
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
