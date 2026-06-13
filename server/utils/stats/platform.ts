import { sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { prediction, user } from '../../../db/schema'

export interface PlatformStats {
  players: number
  predictions: number
}

// Aggregate, name-free social proof for the signed-out landing teaser: how many,
// never who.
export async function getPlatformStats(db: AppDatabase): Promise<PlatformStats> {
  // count(*) always returns exactly one row, so the destructure is never empty.
  const [players] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(user)
  const [predictions] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(prediction)
  return { players: players!.n, predictions: predictions!.n }
}
