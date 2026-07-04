import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import type { PlayerRankings, TopScorer } from '../../../shared/types/match'
import { goalEvent, match } from '../../../db/schema'

// Every player with a goal or assist in the competition (own goals excluded from
// the scorer's tally; the assist credits the assisting player, who is on the
// scoring team, so a pure assister still earns a row). Unsorted and unsliced -
// callers rank and trim for their board.
async function aggregatePlayers(db: AppDatabase, competitionId: string): Promise<TopScorer[]> {
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
  for (const r of rows) {
    if (r.assistPlayerId) ensure(r.assistPlayerId, r.assistPlayerName || 'Unknown', r.teamName, r.teamCode).assists += 1
  }

  return [...players.values()].map((s) => ({
    playerName: s.playerName,
    teamName: s.teamName,
    teamCode: s.teamCode,
    goals: s.goals,
    assists: s.assists,
    penalties: null,
  }))
}

const byGoals = (a: TopScorer, b: TopScorer) =>
  b.goals - a.goals || (b.assists ?? 0) - (a.assists ?? 0) || a.playerName.localeCompare(b.playerName)
const byAssists = (a: TopScorer, b: TopScorer) =>
  (b.assists ?? 0) - (a.assists ?? 0) || b.goals - a.goals || a.playerName.localeCompare(b.playerName)

// Split a player set into the two Stats boards. The assist board is sorted and
// sliced on its own metric, so a high-assist/low-goal player who never made the
// goals top-N still surfaces (re-ranking the goals-sliced set used to hide them).
export function rankPlayers(players: TopScorer[], limit = 20): PlayerRankings {
  return {
    scorers: [...players].filter((s) => s.goals > 0).sort(byGoals).slice(0, limit),
    assists: [...players].filter((s) => (s.assists ?? 0) > 0).sort(byAssists).slice(0, limit),
  }
}

// Both Stats boards scoped to a set of team codes, unsliced. The competition
// boards are a global top-N leaderboard; a single match's Players tab needs every
// contributor of its two teams, not just the ones ranking in the tournament-wide
// top-N (else a team with only low-tally scorers looks like it scored nothing).
export async function getTeamsPlayerRankings(
  db: AppDatabase,
  competitionId: string,
  teamCodes: (string | null)[],
): Promise<PlayerRankings> {
  const codes = new Set(teamCodes.filter((c): c is string => !!c))
  if (codes.size === 0) return { scorers: [], assists: [] }
  const players = (await aggregatePlayers(db, competitionId)).filter((p) => p.teamCode && codes.has(p.teamCode))
  return rankPlayers(players, Number.POSITIVE_INFINITY)
}

// Goal-ranked players from stored goal events (assist tie-break). Includes pure
// assisters so per-team callers see a team's full contribution.
export async function getCompetitionTopScorers(
  db: AppDatabase,
  competitionId: string,
  limit = 20,
): Promise<TopScorer[]> {
  return (await aggregatePlayers(db, competitionId)).sort(byGoals).slice(0, limit)
}

// Both Stats boards (top scorers + top assists) from stored goal events.
export async function getCompetitionPlayerRankings(
  db: AppDatabase,
  competitionId: string,
  limit = 20,
): Promise<PlayerRankings> {
  return rankPlayers(await aggregatePlayers(db, competitionId), limit)
}

// The two Stats boards for a single fixture's Players tab: every contributor of
// the match's home and away teams (goals + assists), unsliced. Empty rankings if
// the match is unknown.
export async function getMatchPlayerRankings(db: AppDatabase, matchId: string): Promise<PlayerRankings> {
  const rows = await db
    .select({ competitionId: match.competitionId, homeTeamCode: match.homeTeamCode, awayTeamCode: match.awayTeamCode })
    .from(match)
    .where(eq(match.id, matchId))
    .limit(1)
  const m = rows[0]
  if (!m) return { scorers: [], assists: [] }
  return getTeamsPlayerRankings(db, m.competitionId, [m.homeTeamCode, m.awayTeamCode])
}

export async function getMatchGoals(db: AppDatabase, matchId: string) {
  return db.select().from(goalEvent).where(eq(goalEvent.matchId, matchId))
}
