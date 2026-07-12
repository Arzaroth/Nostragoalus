import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { leaveLeague } from '../../../utils/leagues/service'

const responseSchema = z.object({ ok: z.literal(true) })

export default defineValidatedHandler({ response: responseSchema }, async ({ event, user }) => {
  const id = getRouterParam(event, 'id')!
  await leaveLeague(db, { leagueId: id, userId: user.id })
  return { ok: true as const }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Leave a league",
    "description": "Leaving is remembered: SSO auto-join will not re-add this user. An owner with members must transfer ownership or delete instead; the last member leaving keeps the (empty) league alive - its next joiner becomes owner.",
    "responses": {
      "200": { "description": "Left." },
      "401": { "description": "Not signed in." },
      "404": { "description": "Not a member." },
      "409": { "description": "Owner with remaining members." }
    }
  },
})
