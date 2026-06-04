import { and, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match, prediction } from '../../../db/schema'

const LIVE_WINDOW_MS = 4 * 60 * 60 * 1000

export async function hasLiveWindow(db: AppDatabase, now: Date = new Date()): Promise<boolean> {
  const windowStart = new Date(now.getTime() - LIVE_WINDOW_MS)
  const rows = await db
    .select({ id: match.id })
    .from(match)
    .where(
      or(
        eq(match.status, 'IN_PLAY'),
        eq(match.status, 'PAUSED'),
        and(eq(match.status, 'SCHEDULED'), lte(match.kickoffTime, now), gt(match.kickoffTime, windowStart)),
      ),
    )
    .limit(1)
  return rows.length > 0
}

export async function lockDuePredictions(db: AppDatabase, now: Date = new Date()): Promise<number> {
  const due = await db
    .select({ id: prediction.id, kickoff: match.kickoffTime })
    .from(prediction)
    .innerJoin(match, eq(prediction.matchId, match.id))
    .where(and(isNull(prediction.lockedAt), lte(match.kickoffTime, now)))

  for (const row of due) {
    await db.update(prediction).set({ lockedAt: row.kickoff }).where(eq(prediction.id, row.id))
  }
  return due.length
}

export async function unlockFuturePredictions(db: AppDatabase, now: Date = new Date()): Promise<number> {
  const future = await db
    .select({ id: prediction.id })
    .from(prediction)
    .innerJoin(match, eq(prediction.matchId, match.id))
    .where(and(isNotNull(prediction.lockedAt), gt(match.kickoffTime, now)))

  for (const row of future) {
    await db.update(prediction).set({ lockedAt: null }).where(eq(prediction.id, row.id))
  }
  return future.length
}
