import { z } from 'zod'
import { db } from '../../../db'
import { botPersonaParam, botUserId, parseBotPersona, type ConsensusMethod } from '../../../shared/types/bot'
import { getBotOverviewCached } from '../../utils/bot/service'
import { getCompetitionById, resolveCompetition } from '../../utils/competitions/store'
import { getSessionUser, isAdmin, requireUser } from '../../utils/auth-guards'
import { resolveLeagueView, type LeagueRow } from '../../utils/leagues/service'
import { defineReadHandler } from '../../utils/read-handler'

const rowSchema = z.object({
  rank: z.number(),
  userId: z.string(),
  totalPoints: z.number(),
  predictionPoints: z.number(),
  championPoints: z.number(),
  championCode: z.string().nullable(),
  championName: z.string().nullable(),
  bestScorerPoints: z.number(),
  bestScorerName: z.string().nullable(),
  bestScorerCode: z.string().nullable(),
  exactCount: z.number(),
  outcomeCount: z.number(),
  gdCount: z.number(),
})
const responseSchema = z.object({
  competition: z.object({ id: z.string(), slug: z.string(), name: z.string() }).nullable(),
  row: rowSchema.nullable(),
  persona: z.enum(['consensus', 'evil-twin', 'equalizer']),
  method: z.enum(['MODE', 'MEAN']),
  modeAvailable: z.boolean(),
})

export default defineReadHandler({ response: responseSchema }, async ({ event }) => {
  const query = getQuery(event)
  const persona = parseBotPersona(query.persona)
  const method: ConsensusMethod = query.method === 'mean' ? 'MEAN' : 'MODE'
  // The evil twin ranks the signed-in viewer's own picks swapped; no viewer, no row.
  const viewer = persona === 'EVIL_TWIN' ? await getSessionUser(event) : null

  // Same league guard as /api/leaderboard: members, public leagues, or admins.
  let league: LeagueRow | null = null
  let competition = null
  let includePrivate = false
  if (query.league) {
    const user = await requireUser(event)
    const resolved = await resolveLeagueView(db, String(query.league), user.id, { resolveAdmin: () => isAdmin(event) })
    league = resolved.league
    includePrivate = !!resolved.membership || (await isAdmin(event))
    competition = await getCompetitionById(db, league.competitionId)
  } else {
    competition = await resolveCompetition(db, (query.competition as string) || null)
  }
  if (!competition) return { competition: null, row: null, persona: botPersonaParam(persona), method, modeAvailable: false }

  const overview = await getBotOverviewCached(db, competition.id, { persona, method, userId: viewer?.id, leagueId: league?.id, includePrivate })
  // Shown as soon as the bot has a rank (anyone has predicted), even at 0 pts
  // pre-scoring, so the toggle always reveals it.
  const row = overview.summary.rank !== null
    ? {
        rank: overview.summary.rank,
        userId: botUserId(persona),
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
    persona: botPersonaParam(persona),
    method: overview.method,
    modeAvailable: overview.modeAvailable,
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Bot"
    ],
    "summary": "Bot ranking row",
    "description": "Where a bot persona would rank against the real board. Display-only: real ranks are untouched.",
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
        "description": "Which bot: 'consensus' (default, the crowd), 'evil-twin' (your own picks swapped; needs sign-in) or 'equalizer' (always a draw).",
        "schema": {
          "type": "string",
          "enum": ["consensus", "evil-twin", "equalizer"]
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
