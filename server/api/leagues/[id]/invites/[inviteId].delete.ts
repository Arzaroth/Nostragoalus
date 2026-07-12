import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { resolveLeagueManage } from '../../../../utils/leagues/service'
import { revokeInvite } from '../../../../utils/leagues/invites'

const responseSchema = z.object({ ok: z.literal(true) })

export default defineValidatedHandler({ response: responseSchema }, async ({ event, user }) => {
  const id = getRouterParam(event, 'id')!
  const inviteId = getRouterParam(event, 'inviteId')!
  await resolveLeagueManage(db, id, user.id)
  await revokeInvite(db, id, inviteId)
  return { ok: true as const }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Revoke a league invite link",
    "description": "Owner/moderator only. The link stops working immediately.",
    "responses": {
      "200": { "description": "Revoked." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Not an owner or moderator of this league." },
      "404": { "description": "Unknown invite." }
    }
  },
})
