import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { getMembership } from '../../../../utils/leagues/service'
import { canManageLeague } from '../../../../utils/leagues/permissions'
import { revokeInvite } from '../../../../utils/leagues/invites'

export default defineValidatedHandler({}, async ({ event, user }) => {
  const id = getRouterParam(event, 'id')!
  const inviteId = getRouterParam(event, 'inviteId')!
  const membership = await getMembership(db, id, user.id)
  if (!canManageLeague(membership?.role)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  await revokeInvite(db, id, inviteId)
  return { ok: true }
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
