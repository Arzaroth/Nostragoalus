import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match } from '../../../db/schema'
import { listCoMemberIdsByLeague } from '../leagues/service'
import { getMatchCrowdTotal } from '../predictions/service'
import { publishLeagueCrowdUpdate } from './hub'
import { crowdStepKey, shouldPublishCrowd } from './crowd-step'

// A prediction changed: push the new league totals of that match to each of
// the predictor's leagues - members only (the global broadcast stays separate).
export async function publishLeagueCrowdUpdates(
  db: AppDatabase,
  opts: { userId: string; matchId: string },
): Promise<number> {
  const rows = await db.select({ competitionId: match.competitionId }).from(match).where(eq(match.id, opts.matchId)).limit(1)
  if (!rows[0]) return 0
  const leagues = await listCoMemberIdsByLeague(db, { userId: opts.userId, competitionId: rows[0].competitionId })
  let delivered = 0
  for (const [leagueId, memberIds] of leagues) {
    const totals = await getMatchCrowdTotal(db, opts.matchId, { leagueId })
    // Stepped per league, not per match: a small league is exactly where one
    // save moves the total visibly, so each stream keeps its own counter.
    if (!shouldPublishCrowd(crowdStepKey(opts.matchId, leagueId), totals.count)) continue
    delivered += publishLeagueCrowdUpdate(leagueId, memberIds, opts.matchId, totals)
  }
  return delivered
}
