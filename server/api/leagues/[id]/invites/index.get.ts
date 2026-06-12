import { db } from '../../../../../db'
import { requireUser } from '../../../../utils/auth-guards'
import { getMembership } from '../../../../utils/leagues/service'
import { canManageLeague } from '../../../../utils/leagues/permissions'
import { inviteStatus, listInvites, pruneSpentInvites } from '../../../../utils/leagues/invites'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const membership = await getMembership(db, id, user.id)
  if (!canManageLeague(membership?.role)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  await pruneSpentInvites(db, id)
  const invites = await listInvites(db, id)
  return {
    invites: invites.map((i) => ({
      id: i.id,
      token: i.token,
      expiresAt: i.expiresAt,
      maxUses: i.maxUses,
      uses: i.uses,
      createdAt: i.createdAt,
      status: inviteStatus(i),
    })),
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "List a league's invite links",
    "description": "Owner/moderator only. Spent (expired/exhausted) invites are pruned on read.",
    "responses": {
      "200": { "description": "Active invites with token, expiry, use counts." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Not an owner or moderator of this league." }
    }
  },
})
