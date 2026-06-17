import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match } from '../../../db/schema'
import { listCoMemberIdsByLeague } from '../leagues/service'
import { getMatchReactionTotals } from '../reactions/service'
import { publishLeagueReactionUpdate } from './hub'

// A reaction changed: push the new league counts of that match to each of the
// reactor's leagues - members only (the global broadcast stays separate).
export async function publishLeagueReactionUpdates(
  db: AppDatabase,
  opts: { userId: string; matchId: string },
): Promise<number> {
  const rows = await db.select({ competitionId: match.competitionId }).from(match).where(eq(match.id, opts.matchId)).limit(1)
  if (!rows[0]) return 0
  const leagues = await listCoMemberIdsByLeague(db, { userId: opts.userId, competitionId: rows[0].competitionId })
  let delivered = 0
  for (const [leagueId, memberIds] of leagues) {
    const totals = await getMatchReactionTotals(db, opts.matchId, { leagueId })
    delivered += publishLeagueReactionUpdate(leagueId, memberIds, opts.matchId, totals)
  }
  return delivered
}
