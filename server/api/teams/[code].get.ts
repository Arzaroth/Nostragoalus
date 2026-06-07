import { and, eq, or } from 'drizzle-orm'
import { db } from '../../../db'
import { competition as competitionTable, goalEvent, match } from '../../../db/schema'
import type { SquadPlayer } from '../../../shared/types/match'
import { resolveCompetition } from '../../utils/competitions/store'
import { getTeamMatches } from '../../utils/matches/service'
import { computeGroupStandings } from '../../utils/stats/standings'
import { getCompetitionTopScorers } from '../../utils/stats/scorers'
import { providerForCompetition } from '../../utils/providers'
import { resolveCompetitionSeason } from '../../utils/sync/competition'

// Squads are unions of match-day rosters (several upstream calls) — cache hard.
const squadCache = new Map<string, { at: number; squad: SquadPlayer[] }>()
const SQUAD_TTL_MS = 6 * 60 * 60 * 1000

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') as string
  const query = getQuery(event)
  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) {
    return { team: null, matches: [], group: null, standings: null, topScorer: null, topAssister: null, teamStats: null, squad: [], competitions: [] }
  }

  const matches = await getTeamMatches(db, competition.id, code)
  let name = code
  for (const m of matches) {
    if (m.homeTeamCode === code) {
      name = m.homeTeam
      break
    }
    if (m.awayTeamCode === code) {
      name = m.awayTeam
      break
    }
  }

  // Every competition this team appears in (for the team-page switcher).
  const competitions = await db
    .selectDistinct({ slug: competitionTable.slug, name: competitionTable.name })
    .from(match)
    .innerJoin(competitionTable, eq(competitionTable.id, match.competitionId))
    .where(or(eq(match.homeTeamCode, code), eq(match.awayTeamCode, code)))

  const groupName = matches.find((m) => m.group)?.group ?? null
  let standings = null
  if (groupName) {
    const groupMatches = await db
      .select()
      .from(match)
      .where(and(eq(match.competitionId, competition.id), eq(match.groupName, groupName)))
    standings = computeGroupStandings(groupMatches)
  }

  // Prefer official FIFA stats (real assists + team aggregates); fall back to goal events.
  let teamScorers: { playerName: string; teamCode: string | null; goals: number; assists: number | null }[] = []
  let teamStats = null
  const provider = providerForCompetition(competition, await resolveCompetitionSeason(db, competition))
  const ownTeamRow = await db
    .select({ teamId: goalEvent.teamId })
    .from(goalEvent)
    .where(and(eq(goalEvent.competitionId, competition.id), eq(goalEvent.teamCode, code)))
    .limit(1)
  if (provider.getTeamSeason && ownTeamRow[0]?.teamId) {
    try {
      const season = await provider.getTeamSeason({ teamId: ownTeamRow[0].teamId })
      teamScorers = season.players.filter((s) => s.teamCode === code)
      teamStats = season.team
    } catch {
      // fall through to local aggregation
    }
  }
  if (teamScorers.length === 0) {
    teamScorers = (await getCompetitionTopScorers(db, competition.id, 500)).filter((s) => s.teamCode === code)
  }
  const topScorer = teamScorers.filter((s) => s.goals > 0).sort((a, b) => b.goals - a.goals)[0] ?? null
  const topAssister = teamScorers
    .filter((s) => (s.assists ?? 0) > 0)
    .sort((a, b) => (b.assists ?? 0) - (a.assists ?? 0))[0] ?? null

  // Squad from match-day rosters, enriched with per-player goals/assists.
  let squad: (SquadPlayer & { goals: number; assists: number })[] = []
  if (provider.getSquad) {
    const cacheKey = `${competition.id}:${code}`
    const cached = squadCache.get(cacheKey)
    let roster = cached && Date.now() - cached.at < SQUAD_TTL_MS ? cached.squad : null
    if (!roster) {
      const refs = await db
        .select({ stageId: match.providerStageId, matchId: match.providerMatchId })
        .from(match)
        .where(
          and(eq(match.competitionId, competition.id), or(eq(match.homeTeamCode, code), eq(match.awayTeamCode, code))),
        )
      try {
        roster = await provider.getSquad({
          teamId: code,
          matches: refs.filter((r) => r.stageId).map((r) => ({ stageId: r.stageId as string, matchId: r.matchId })),
        })
        squadCache.set(cacheKey, { at: Date.now(), squad: roster })
      } catch {
        roster = []
      }
    }
    const statsByName = new Map(teamScorers.map((s) => [s.playerName, s]))
    squad = roster.map((p) => ({
      ...p,
      goals: statsByName.get(p.name)?.goals ?? 0,
      assists: statsByName.get(p.name)?.assists ?? 0,
    }))
  }

  return {
    team: { code, name, competition: competition.slug },
    matches,
    group: groupName,
    standings,
    topScorer,
    topAssister,
    teamStats,
    squad,
    competitions,
  }
})
