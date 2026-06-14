import { eq, isNull } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { championPick } from '../../../db/schema'
import type { FifaRankingProvider } from '../providers/fifa-ranking'
import { getActiveScoringConfig } from '../scoring/store'
import { championPointsForRank } from '../scoring/config'
import { FIFA_RANKING_SNAPSHOT } from './fifa-ranking-snapshot'

export interface ChampionBackfillResult {
  source: 'live' | 'snapshot'
  scanned: number
  changed: number
}

// Repair champion picks saved with a null FIFA rank: the live ranking fetch was
// Cloudflare-blocked during the pick window, so they snapshotted no rank and got
// the flat champion bonus instead of the rank-based tier. Re-resolve the ranking
// for that publication and recompute each pick's tier points. Idempotent: only
// touches null-rank picks, and a re-resolved (mapped) rank drops the pick out of
// the null set on the next run.
export async function backfillChampionRanks(
  db: AppDatabase,
  provider: FifaRankingProvider,
): Promise<ChampionBackfillResult> {
  let ranks: Map<string, number>
  let source: 'live' | 'snapshot'
  try {
    ranks = await provider.getRanks(FIFA_RANKING_SNAPSHOT.scheduleId)
    source = 'live'
  } catch {
    // Same block that caused the bug can block this fetch too - fall back to the
    // bundled snapshot of the exact pick-window publication.
    ranks = new Map(Object.entries(FIFA_RANKING_SNAPSHOT.ranks))
    source = 'snapshot'
  }

  const { rules } = await getActiveScoringConfig(db)
  const picks = await db
    .select({ id: championPick.id, teamCode: championPick.teamCode, potentialPoints: championPick.potentialPoints })
    .from(championPick)
    .where(isNull(championPick.fifaRank))

  let changed = 0
  for (const pick of picks) {
    // teamCode is nullable (placeholder picks); without a team there's no rank.
    const rank = pick.teamCode ? ranks.get(pick.teamCode) ?? null : null
    const points = championPointsForRank(rank, rules)
    // Persist whenever the payout moves OR we resolved a real rank (so the pick
    // leaves the null-rank set); count "changed" only when the payout moves.
    if (points !== pick.potentialPoints || rank !== null) {
      await db.update(championPick).set({ fifaRank: rank, potentialPoints: points }).where(eq(championPick.id, pick.id))
      if (points !== pick.potentialPoints) changed++
    }
  }
  return { source, scanned: picks.length, changed }
}
