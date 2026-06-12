import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { getCompetitionById } from '../../../../utils/competitions/store'
import { acceptInvite } from '../../../../utils/leagues/invites'
import { createRateLimiter } from '../../../../utils/rate-limit'

// Tokens are 96-bit (unguessable), but probing is free to block anyway.
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 })

export default defineValidatedHandler({}, async ({ event, user }) => {
  if (!limiter.allow(user.id)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts, try again in a minute' })
  }
  const token = getRouterParam(event, 'token')!
  const { league, role } = await acceptInvite(db, { token, userId: user.id })
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
    "summary": "Accept an invite link",
    "description": "Joins the league behind the token. Consumes one use; expired/exhausted invites 409.",
    "responses": {
      "200": { "description": "Joined; the league (same shape as join-by-code)." },
      "401": { "description": "Not signed in." },
      "404": { "description": "Unknown token." },
      "409": { "description": "Already a member, invite expired, or invite exhausted." },
      "429": { "description": "More than 10 attempts within a minute." }
    }
  },
})
