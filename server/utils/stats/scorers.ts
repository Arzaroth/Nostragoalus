import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { goalEvent } from '../../../db/schema'
import type { TopScorer } from '../../../shared/types/match'

// Aggregate top scorers from stored goal events (own goals excluded from a
// player's tally; assists counted from the assisting player).
export async function getCompetitionTopScorers(
  db: AppDatabase,
  competitionId: string,
  limit = 20,
): Promise<TopScorer[]> {
  const rows = await db.select().from(goalEvent).where(eq(goalEvent.competitionId, competitionId))

  const assistsByPlayer = new Map<string, number>()
  for (const r of rows) {
    if (r.assistPlayerId) assistsByPlayer.set(r.assistPlayerId, (assistsByPlayer.get(r.assistPlayerId) ?? 0) + 1)
  }

  const scorers = new Map<string, TopScorer & { playerId: string }>()
  for (const r of rows) {
    if (r.ownGoal || !r.playerId) continue
    const existing = scorers.get(r.playerId)
    if (existing) existing.goals += 1
    else
      scorers.set(r.playerId, {
        playerId: r.playerId,
        playerName: r.playerName,
        teamName: r.teamName,
        teamCode: r.teamCode,
        goals: 1,
        assists: 0,
        penalties: null,
      })
  }

  return [...scorers.values()]
    .map((s) => ({
      playerName: s.playerName,
      teamName: s.teamName,
      teamCode: s.teamCode,
      goals: s.goals,
      assists: assistsByPlayer.get(s.playerId) ?? 0,
      penalties: null,
    }))
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.playerName.localeCompare(b.playerName))
    .slice(0, limit)
}

export async function getMatchGoals(db: AppDatabase, matchId: string) {
  return db.select().from(goalEvent).where(eq(goalEvent.matchId, matchId))
}
