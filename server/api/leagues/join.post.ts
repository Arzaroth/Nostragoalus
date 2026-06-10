import { z } from 'zod'
import { db } from '../../../db'
import { defineValidatedHandler } from '../../utils/validated-handler'
import { getCompetitionById } from '../../utils/competitions/store'
import { joinLeagueByCode } from '../../utils/leagues/service'
import { createRateLimiter } from '../../utils/rate-limit'

const bodySchema = z.object({ code: z.string().trim().min(4).max(16) })

// Join codes are guessable inputs: cap attempts per user so brute force is
// pointless (30^8 code space makes 10/min astronomically insufficient anyway).
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 })

export default defineValidatedHandler({ body: bodySchema }, async ({ body, user }) => {
  if (!limiter.allow(user.id)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts, try again in a minute' })
  }
  const { league, role } = await joinLeagueByCode(db, { userId: user.id, code: body.code })
  const competition = await getCompetitionById(db, league.competitionId)
  return {
    league: {
      id: league.id,
      name: league.name,
      visibility: league.visibility,
      role,
      competition: competition ? { id: competition.id, slug: competition.slug, name: competition.name } : null,
    },
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Join a league with a code",
    "description": "Code matching is case-insensitive and ignores spaces and dashes. Re-joining clears a previous leave, so SSO auto-join applies again.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": { "code": { "type": "string", "description": "4-16 chars; case and separators are ignored." } },
            "required": ["code"]
          }
        }
      }
    },
    "responses": {
      "200": { "description": "The joined league." },
      "401": { "description": "Not signed in." },
      "404": { "description": "No league matches this code." },
      "409": { "description": "Already a member." },
      "422": { "description": "Invalid body." },
      "429": { "description": "More than 10 attempts within a minute." }
    }
  },
})
