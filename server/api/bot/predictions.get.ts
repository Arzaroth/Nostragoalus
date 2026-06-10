import { db } from '../../../db'
import { BOT_USER_ID, type ConsensusMethod } from '../../../shared/types/bot'
import { getBotOverview } from '../../utils/bot/service'
import { getCompetitionById, resolveCompetition } from '../../utils/competitions/store'
import { isAdmin, requireUser } from '../../utils/auth-guards'
import { canViewLeague, getLeague, getMembership, type LeagueRow } from '../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const method: ConsensusMethod = query.method === 'mean' ? 'MEAN' : 'MODE'
  // Admins also see the consensus for matches that haven't kicked off yet;
  // everyone else gets the same kickoff privacy rule as user predictions.
  const admin = await isAdmin(event)

  // Same league guard as /api/leaderboard: members, public leagues, or admins.
  let league: LeagueRow | null = null
  let competition = null
  let includePrivate = false
  if (query.league) {
    const user = await requireUser(event)
    league = await getLeague(db, String(query.league))
    if (!league) throw createError({ statusCode: 404, statusMessage: 'League not found' })
    const membership = await getMembership(db, league.id, user.id)
    if (!canViewLeague(league, membership, membership ? false : admin)) {
      throw createError({ statusCode: 404, statusMessage: 'League not found' })
    }
    includePrivate = !!membership || admin
    competition = await getCompetitionById(db, league.competitionId)
  } else {
    competition = await resolveCompetition(db, (query.competition as string) || null)
  }
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'competition not found' })

  const overview = await getBotOverview(db, competition.id, {
    method,
    leagueId: league?.id,
    includeUpcoming: admin,
    includePrivate,
  })

  return {
    bot: { id: BOT_USER_ID },
    competition: { id: competition.id, slug: competition.slug, name: competition.name },
    league: league ? { id: league.id, name: league.name } : null,
    champion: overview.champion,
    summary: overview.summary,
    admin,
    method: overview.method,
    modeAvailable: overview.modeAvailable,
    population: overview.population,
    predictions: overview.rows,
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Bot"
    ],
    "summary": "Consensus bot picks",
    "description": "Per-match consensus of everyone's predictions with the points the bot would have scored. Upcoming matches are admin-only.",
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
        "description": "League id: consensus over that league's members only.",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Consensus picks per kicked-off match (plus upcoming ones for admins), summary totals and rank."
      },
      "401": {
        "description": "League view requires being signed in."
      },
      "404": {
        "description": "Unknown competition or league."
      }
    }
  },
})
