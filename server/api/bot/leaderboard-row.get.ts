import { db } from '../../../db'
import { BOT_USER_ID, type ConsensusMethod } from '../../../shared/types/bot'
import { getBotOverviewCached } from '../../utils/bot/service'
import { getCompetitionById, resolveCompetition } from '../../utils/competitions/store'
import { isAdmin, requireUser } from '../../utils/auth-guards'
import { canViewLeague, getLeague, getMembership, type LeagueRow } from '../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const method: ConsensusMethod = query.method === 'mean' ? 'MEAN' : 'MODE'

  // Same league guard as /api/leaderboard: members, public leagues, or admins.
  let league: LeagueRow | null = null
  let competition = null
  let includePrivate = false
  if (query.league) {
    const user = await requireUser(event)
    league = await getLeague(db, String(query.league))
    if (!league) throw createError({ statusCode: 404, statusMessage: 'League not found' })
    const membership = await getMembership(db, league.id, user.id)
    if (!canViewLeague(league, membership, membership ? false : await isAdmin(event))) {
      throw createError({ statusCode: 404, statusMessage: 'League not found' })
    }
    includePrivate = !!membership || (await isAdmin(event))
    competition = await getCompetitionById(db, league.competitionId)
  } else {
    competition = await resolveCompetition(db, (query.competition as string) || null)
  }
  if (!competition) return { competition: null, row: null, method, modeAvailable: false }

  const overview = await getBotOverviewCached(db, competition.id, { method, leagueId: league?.id, includePrivate })
  // Shown as soon as the bot has a rank (anyone has predicted), even at 0 pts
  // pre-scoring, so the toggle always reveals it.
  const row = overview.summary.rank !== null
    ? {
        rank: overview.summary.rank,
        userId: BOT_USER_ID,
        totalPoints: overview.summary.totalPoints,
        predictionPoints: overview.summary.predictionPoints,
        championPoints: overview.summary.championPoints,
        championCode: overview.champion?.teamCode ?? null,
        championName: overview.champion?.teamName ?? null,
        // The bot does not pick a best scorer.
        bestScorerPoints: 0,
        bestScorerName: null,
        bestScorerCode: null,
        exactCount: overview.summary.exactCount,
        outcomeCount: overview.summary.outcomeCount,
        gdCount: overview.summary.gdCount,
      }
    : null

  return {
    competition: { id: competition.id, slug: competition.slug, name: competition.name },
    row,
    method: overview.method,
    modeAvailable: overview.modeAvailable,
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Bot"
    ],
    "summary": "Consensus bot ranking row",
    "description": "Where a bot averaging everyone's predictions would rank. Display-only: real ranks are untouched.",
    "parameters": [
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
        "name": "method",
        "required": false,
        "description": "Consensus method: 'mode' (most picked scoreline, default) or 'mean' (rounded average). Falls back to mean below 5 predictors.",
        "schema": {
          "type": "string",
          "enum": ["mode", "mean"]
        }
      },
      {
        "in": "query",
        "name": "league",
        "required": false,
        "description": "League id: consensus and rank over that league's members only.",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "The bot's would-be leaderboard row, or null before any match is scored."
      },
      "401": {
        "description": "League view requires being signed in."
      },
      "404": {
        "description": "Unknown league, or private league the caller is not in."
      }
    }
  },
})
