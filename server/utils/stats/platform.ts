import type { AppDatabase } from '../../../db/types'
import { prediction, user } from '../../../db/schema'

export interface PlatformStats {
  players: number
  predictions: number
}

// Aggregate, name-free social proof for the signed-out landing teaser: how many,
// never who.
export async function getPlatformStats(db: AppDatabase): Promise<PlatformStats> {
  const [players, predictions] = await Promise.all([db.$count(user), db.$count(prediction)])
  return { players, predictions }
}
