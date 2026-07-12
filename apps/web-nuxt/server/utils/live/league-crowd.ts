import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match } from '../../../db/schema'
import { listCoMemberIdsByLeague } from '../leagues/service'
import { getMatchCrowdTotal } from '../predictions/service'
import { publishLeagueCrowdUpdate } from './hub'

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
    delivered += publishLeagueCrowdUpdate(leagueId, memberIds, opts.matchId, totals)
  }
  return delivered
}
