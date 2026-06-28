import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import type { PlayerRankings } from '../../../shared/types/match'
import { providerForCompetition } from '../../utils/providers'
import { resolveCompetition } from '../../utils/competitions/store'
import { resolveCompetitionSeason } from '../../utils/sync/competition'
import { getCompetitionPlayerRankings, rankPlayers } from '../../utils/stats/scorers'
import { goalEvent } from '../../../db/schema'

const EMPTY: PlayerRankings = { scorers: [], assists: [] }
const cache = new Map<string, { at: number; rankings: PlayerRankings }>()
const TTL_MS = 10 * 60 * 1000

export default defineEventHandler(async (event): Promise<PlayerRankings> => {
  const query = getQuery(event)
  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return EMPTY

  const cached = cache.get(competition.id)
  if (cached && Date.now() - cached.at < TTL_MS) return cached.rankings

  const provider = providerForCompetition(competition, await resolveCompetitionSeason(db, competition))

  // Official FIFA player stats (goals + assists), keyless - needs any team id seen this season.
  if (provider.getPlayerStats) {
    const teamRow = await db
      .select({ teamId: goalEvent.teamId })
      .from(goalEvent)
      .where(eq(goalEvent.competitionId, competition.id))
      .limit(1)
    const teamId = teamRow[0]?.teamId
    if (teamId) {
      try {
        const players = await provider.getPlayerStats({ teamId })
        // FIFA hasn't published aggregated player stats for an in-progress edition
        // (the array comes back empty); fall through to the local goal-event
        // aggregation rather than blanking the rankings.
        if (players.length > 0) {
          const rankings = rankPlayers(players)
          cache.set(competition.id, { at: Date.now(), rankings })
          return rankings
        }
      } catch {
        // fall through to local / football-data
      }
    }
  }

  // Local goal-event aggregation (goals + assists). This is the live path while
  // FIFA's official aggregate is empty, so cache it like the official one - the
  // empty official result used to populate the cache and no longer does.
  const local = await getCompetitionPlayerRankings(db, competition.id)
  if (local.scorers.length > 0 || local.assists.length > 0) {
    cache.set(competition.id, { at: Date.now(), rankings: local })
    return local
  }

  // A provider that exposes scorers directly (e.g. football-data); goals only.
  if (provider.getTopScorers) {
    try {
      const rankings = rankPlayers(await provider.getTopScorers({ season: competition.seasonHint ?? '' }))
      cache.set(competition.id, { at: Date.now(), rankings })
      return rankings
    } catch {
      return EMPTY
    }
  }

  return EMPTY
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Competitions"
    ],
    "summary": "Player rankings",
    "description": "Top scorers and top assists for the competition, each ranked on its own metric, from official sources (FIFA player stats or UEFA rankings) with a local goal-event fallback.",
    "parameters": [
      {
        "in": "query",
        "name": "competition",
        "required": false,
        "description": "Competition slug (e.g. 'world-cup-2026'). Defaults to the current tournament.",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "{ scorers, assists }, each an array of {playerName, teamName, teamCode, goals, assists}."
      }
    }
  },
})
