import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { user } from '../../../db/schema'
import { botPersonaParam, botUserId, parseBotPersona, type ConsensusMethod } from '../../../shared/types/bot'
import { getBotOverviewCached } from '../../utils/bot/service'
import { getCompetitionById, resolveCompetition } from '../../utils/competitions/store'
import { getSessionUser, isAdmin, requireUser } from '../../utils/auth-guards'
import { canViewProfile, resolveLeagueView, type LeagueRow } from '../../utils/leagues/service'
import { toHttpError } from '../../utils/http'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const persona = parseBotPersona(query.persona)
  const method: ConsensusMethod = query.method === 'mean' ? 'MEAN' : 'MODE'
  // Admins also see the consensus for matches that haven't kicked off yet;
  // everyone else gets the same kickoff privacy rule as user predictions.
  const admin = await isAdmin(event)
  // The evil twin is one player's picks swapped: the ?user target on a profile
  // page, else the signed-in viewer's own. Without any target it returns empty.
  const viewer = persona === 'EVIL_TWIN' ? await getSessionUser(event) : null
  let twinUserId = viewer?.id
  if (persona === 'EVIL_TWIN' && query.user) {
    const wanted = String(query.user)
    // Same private-profile guard as /api/users/[id]/predictions: a private
    // player's twin is visible only to league mates, admins, or themselves.
    const [target] = await db.select({ profilePrivate: user.profilePrivate }).from(user).where(eq(user.id, wanted)).limit(1)
    if (!target) throw createError({ statusCode: 404, statusMessage: 'user not found' })
    if (target.profilePrivate) {
      const allowed = viewer && (await canViewProfile(db, { viewerId: viewer.id, targetUserId: wanted, isAdmin: admin }))
      if (!allowed) throw createError({ statusCode: 404, statusMessage: 'user not found' })
    }
    twinUserId = wanted
  }

  // Same league guard as /api/leaderboard: members, public leagues, or admins.
  let league: LeagueRow | null = null
  let competition = null
  let includePrivate = false
  if (query.league) {
    const user = await requireUser(event)
    let resolved
    try {
      resolved = await resolveLeagueView(db, String(query.league), user.id, { resolveAdmin: () => admin })
    } catch (error) {
      throw toHttpError(error)
    }
    league = resolved.league
    includePrivate = !!resolved.membership || admin
    competition = await getCompetitionById(db, league.competitionId)
  } else {
    competition = await resolveCompetition(db, (query.competition as string) || null)
  }
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'competition not found' })

  const overview = await getBotOverviewCached(db, competition.id, {
    persona,
    method,
    userId: twinUserId,
    leagueId: league?.id,
    includeUpcoming: admin,
    includePrivate,
  })

  return {
    bot: { id: botUserId(persona) },
    persona: botPersonaParam(persona),
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
    "summary": "Bot picks",
    "description": "Per-match picks of a bot persona with the points it would have scored. Personas: consensus (the crowd's pick), evil-twin (that pick inverted), equalizer (always a draw). Upcoming matches are admin-only.",
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
        "name": "persona",
        "required": false,
        "description": "Which bot: 'consensus' (default, the crowd), 'evil-twin' (a player's picks swapped) or 'equalizer' (always a draw).",
        "schema": {
          "type": "string",
          "enum": ["consensus", "evil-twin", "equalizer"]
        }
      },
      {
        "in": "query",
        "name": "user",
        "required": false,
        "description": "For 'evil-twin': the player whose picks to swap (a profile view). Defaults to the signed-in viewer. Private profiles follow the usual visibility rules.",
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
