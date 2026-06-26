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

  type Tally = { playerId: string; playerName: string; teamName: string; teamCode: string | null; goals: number; assists: number }
  const players = new Map<string, Tally>()
  const ensure = (id: string, name: string, teamName: string, teamCode: string | null) => {
    let p = players.get(id)
    if (!p) {
      p = { playerId: id, playerName: name, teamName, teamCode, goals: 0, assists: 0 }
      players.set(id, p)
    }
    return p
  }

  // Score goals first so a player's own name is authoritative; an assister seen
  // before they score must not get stuck with the assist-row placeholder name.
  for (const r of rows) {
    if (!r.ownGoal && r.playerId) ensure(r.playerId, r.playerName, r.teamName, r.teamCode).goals += 1
  }
  // The assist credits the assisting player, who is on the scoring team - so a
  // pure assister (no goals of their own) still earns a ranking row.
  for (const r of rows) {
    if (r.assistPlayerId) ensure(r.assistPlayerId, r.assistPlayerName ?? 'Unknown', r.teamName, r.teamCode).assists += 1
  }

  return [...players.values()]
    .map((s) => ({
      playerName: s.playerName,
      teamName: s.teamName,
      teamCode: s.teamCode,
      goals: s.goals,
      assists: s.assists,
      penalties: null,
    }))
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.playerName.localeCompare(b.playerName))
    .slice(0, limit)
}

export async function getMatchGoals(db: AppDatabase, matchId: string) {
  return db.select().from(goalEvent).where(eq(goalEvent.matchId, matchId))
}
