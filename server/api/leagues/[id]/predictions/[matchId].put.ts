import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { upsertLeaguePrediction } from '../../../../utils/predictions/service'

const bodySchema = z.object({
  home: z.number().int().min(0).max(99),
  away: z.number().int().min(0).max(99),
  isOutcomeOnly: z.boolean().optional(),
  wager: z.number().int().min(0).max(999).nullable().optional(),
})

// Save a per-league override pick (moded leagues only). Switches the membership
// off sync. Service rejects non-members (403), NORMAL leagues (400), locked or
// TBD matches, and over-budget stakes.
export default defineValidatedHandler({ body: bodySchema }, async ({ event, body, user }) => {
  const leagueId = getRouterParam(event, 'id')!
  const matchId = getRouterParam(event, 'matchId')!
  const id = await upsertLeaguePrediction(db, {
    leagueId,
    userId: user.id,
    matchId,
    home: body.home,
    away: body.away,
    isOutcomeOnly: body.isOutcomeOnly,
    wager: body.wager,
  })
  return { id }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Save a per-league override pick",
    "description": "Moded leagues only. Keeping a league-specific pick switches that membership off sync so the league stops mirroring your base pick.",
    "responses": {
      "200": { "description": "The stored override id." },
      "400": { "description": "NORMAL league or invalid scores." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Not a league member." },
      "409": { "description": "Match already kicked off." },
      "422": { "description": "Invalid body." }
    }
  },
})
