import { and, desc, eq, or } from 'drizzle-orm'
import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { db } from '../../../db'
import { competition as competitionTable, goalEvent, match } from '../../../db/schema'
import type { SquadPlayer, TeamSeasonStats, TopScorer } from '../../../shared/types/match'
import { matchRowSchema, standingRowSchema } from '../../schemas/match'
import { resolveCompetition } from '../../utils/competitions/store'
import { getTeamMatches } from '../../utils/matches/service'
import { computeGroupStandings } from '../../utils/stats/standings'
import { getCompetitionTopScorers } from '../../utils/stats/scorers'
import { providerForCompetition } from '../../utils/providers'
import { defineReadHandler } from '../../utils/read-handler'
import { resolveCompetitionSeason } from '../../utils/sync/competition'

const competitionCols = createSelectSchema(competitionTable)
// The narrow scorer projection the route surfaces (extra provider fields like
// teamName/penalties are stripped by the response parse).
const teamScorerSchema = z.object({
  playerName: z.string(),
  teamCode: z.string().nullable(),
  goals: z.number(),
  assists: z.number().nullable(),
})
const teamSeasonStatsSchema = z.object({
  goals: z.number().nullable(),
  conceded: z.number().nullable(),
  assists: z.number().nullable(),
  possession: z.number().nullable(),
  attempts: z.number().nullable(),
  onTarget: z.number().nullable(),
  passes: z.number().nullable(),
  passAccuracy: z.number().nullable(),
  crosses: z.number().nullable(),
  corners: z.number().nullable(),
  offsides: z.number().nullable(),
  yellowCards: z.number().nullable(),
  redCards: z.number().nullable(),
})
const squadPlayerSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  shirtNumber: z.number().nullable(),
  position: z.enum(['GK', 'DF', 'MF', 'FW']).nullable(),
  captain: z.boolean(),
  pictureUrl: z.string().nullable(),
  x: z.number().nullable().optional(),
  y: z.number().nullable().optional(),
  goals: z.number(),
  assists: z.number(),
})
const querySchema = z.object({ competition: z.string().optional(), lite: z.string().optional() })
const responseSchema = z.object({
  team: z.object({ code: z.string(), name: z.string(), competition: z.string() }).nullable(),
  matches: z.array(matchRowSchema),
  group: z.string().nullable(),
  standings: z.array(standingRowSchema).nullable(),
  topScorer: teamScorerSchema.nullable(),
  topAssister: teamScorerSchema.nullable(),
  teamStats: teamSeasonStatsSchema.nullable(),
  squad: z.array(squadPlayerSchema),
  coach: z.string().nullable(),
  competitions: z.array(z.object({ slug: competitionCols.shape.slug, name: competitionCols.shape.name, seasonHint: competitionCols.shape.seasonHint })),
})

// The FIFA statistics document is season-wide (same for every team) and heavy -
// cache it per competition. The tournament sweep (squad/coach/stats) is many
// upstream calls - cache it per team, long.
const playersCache = new Map<string, { at: number; players: TopScorer[] }>()
const PLAYERS_TTL_MS = 10 * 60 * 1000
const tournamentCache = new Map<string, { at: number; data: { squad: SquadPlayer[]; coach: string | null; stats: TeamSeasonStats | null } }>()
const TOURNAMENT_TTL_MS = 6 * 60 * 60 * 1000

export default defineReadHandler({ response: responseSchema, query: querySchema }, async ({ event, query }) => {
  const code = getRouterParam(event, 'code') as string
  const lite = query.lite === '1' // map panel: skip the expensive tournament sweep
  const competition = await resolveCompetition(db, query.competition || null)
  if (!competition) {
    return { team: null, matches: [], group: null, standings: null, topScorer: null, topAssister: null, teamStats: null, squad: [], coach: null, competitions: [] }
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
    .selectDistinct({ slug: competitionTable.slug, name: competitionTable.name, seasonHint: competitionTable.seasonHint })
    .from(match)
    .innerJoin(competitionTable, eq(competitionTable.id, match.competitionId))
    .where(or(eq(match.homeTeamCode, code), eq(match.awayTeamCode, code)))
    .orderBy(desc(competitionTable.seasonHint))

  const groupName = matches.find((m) => m.group)?.group ?? null
  let standings = null
  if (groupName) {
    const groupMatches = await db
      .select()
      .from(match)
      .where(and(eq(match.competitionId, competition.id), eq(match.groupName, groupName)))
    standings = computeGroupStandings(groupMatches)
  }

  // Player stats: official FIFA aggregates (real assists) with goal-event fallback.
  const provider = providerForCompetition(competition, await resolveCompetitionSeason(db, competition))
  let allPlayers: TopScorer[] = []
  if (provider.getPlayerStats) {
    const cached = playersCache.get(competition.id)
    if (cached && Date.now() - cached.at < PLAYERS_TTL_MS) {
      allPlayers = cached.players
    } else {
      const anyTeamRow = await db
        .select({ teamId: goalEvent.teamId })
        .from(goalEvent)
        .where(eq(goalEvent.competitionId, competition.id))
        .limit(1)
      // FIFA needs any real team id to address the stats doc; UEFA's ranking doesn't.
      if (anyTeamRow[0]?.teamId || competition.provider === 'uefa') {
        try {
          allPlayers = await provider.getPlayerStats({ teamId: anyTeamRow[0]?.teamId ?? '' })
          playersCache.set(competition.id, { at: Date.now(), players: allPlayers })
        } catch {
          // fall through to local aggregation
        }
      }
    }
  }
  let teamScorers: { playerName: string; teamCode: string | null; goals: number; assists: number | null }[] =
    allPlayers.filter((s) => s.teamCode === code)
  if (teamScorers.length === 0) {
    teamScorers = (await getCompetitionTopScorers(db, competition.id, 500)).filter((s) => s.teamCode === code)
  }
  const topScorer = teamScorers.filter((s) => s.goals > 0).sort((a, b) => b.goals - a.goals)[0] ?? null
  const topAssister = teamScorers
    .filter((s) => (s.assists ?? 0) > 0)
    .sort((a, b) => (b.assists ?? 0) - (a.assists ?? 0))[0] ?? null

  // Squad + coach + season totals (skipped in lite mode - the map doesn't show them).
  let squad: (SquadPlayer & { goals: number; assists: number })[] = []
  let coach: string | null = null
  let teamStats: TeamSeasonStats | null = null
  if (!lite && provider.getTeamTournament) {
    const cacheKey = `${competition.id}:${code}`
    const cached = tournamentCache.get(cacheKey)
    let data = cached && Date.now() - cached.at < TOURNAMENT_TTL_MS ? cached.data : null
    if (!data) {
      const refs = await db
        .select({ stageId: match.providerStageId, matchId: match.providerMatchId })
        .from(match)
        .where(
          and(eq(match.competitionId, competition.id), or(eq(match.homeTeamCode, code), eq(match.awayTeamCode, code))),
        )
      try {
        data = await provider.getTeamTournament({
          teamRef: code,
          matches: refs.filter((r) => r.stageId).map((r) => ({ stageId: r.stageId as string, matchId: r.matchId })),
        })
        tournamentCache.set(cacheKey, { at: Date.now(), data })
      } catch {
        data = { squad: [], coach: null, stats: null }
      }
    }
    coach = data.coach
    const statsByName = new Map(teamScorers.map((s) => [s.playerName, s]))
    squad = data.squad.map((p) => ({
      ...p,
      goals: statsByName.get(p.name)?.goals ?? 0,
      assists: statsByName.get(p.name)?.assists ?? 0,
    }))
    // Goals for/against come from our stored results; assists from player stats.
    if (data.stats) {
      let gf = 0
      let ga = 0
      for (const m of matches) {
        if (m.fullTimeHome == null || m.fullTimeAway == null) continue
        const isHome = m.homeTeamCode === code
        gf += isHome ? m.fullTimeHome : m.fullTimeAway
        ga += isHome ? m.fullTimeAway : m.fullTimeHome
      }
      teamStats = {
        ...data.stats,
        goals: gf,
        conceded: ga,
        assists: teamScorers.reduce((a, s) => a + (s.assists ?? 0), 0) || null,
      }
    }
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
    coach,
    competitions,
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Teams"
    ],
    "summary": "Team page data",
    "description": "Squad with positions and per-player goal involvement, coach, season stats, matches, group standings and the competitions the team appears in. lite=1 skips the expensive squad/stats sweep (used by the map).",
    "parameters": [
      {
        "in": "path",
        "name": "code",
        "required": true,
        "description": "3-letter team code.",
        "schema": {
          "type": "string"
        }
      },
      {
        "in": "query",
        "name": "competition",
        "required": false,
        "description": "Competition slug (e.g. 'world-cup-2026'). Defaults to the current tournament.",
        "schema": {
          "type": "string"
        }
      },
      {
        "in": "query",
        "name": "lite",
        "required": false,
        "description": "1 to skip squad/coach/season stats.",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Team bundle."
      }
    }
  },
})
