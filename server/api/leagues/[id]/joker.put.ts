import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { setLeagueJoker } from '../../../utils/predictions/service'

const bodySchema = z.object({ matchId: z.string().uuid(), isJoker: z.boolean() })

// Place/clear the joker on a per-league override (custom moded leagues). Creates
// an override from the base pick if needed; one joker per (league, round).
export default defineValidatedHandler({ body: bodySchema }, async ({ event, body, user }) => {
  const leagueId = getRouterParam(event, 'id')!
  await setLeagueJoker(db, { leagueId, userId: user.id, matchId: body.matchId, isJoker: body.isJoker })
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Set the joker on a league override",
    "responses": {
      "200": { "description": "Updated." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Not a league member." },
      "404": { "description": "No pick on that match." },
      "409": { "description": "Match (or the round's joker) already kicked off." },
      "422": { "description": "Invalid body or single-match round." }
    }
  },
})
