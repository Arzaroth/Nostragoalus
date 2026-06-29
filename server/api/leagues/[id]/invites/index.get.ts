import { db } from '../../../../../db'
import { requireUser } from '../../../../utils/auth-guards'
import { toHttpError } from '../../../../utils/http'
import { resolveLeagueManage } from '../../../../utils/leagues/service'
import { inviteStatus, listInvites, pruneSpentInvites } from '../../../../utils/leagues/invites'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  try {
    await resolveLeagueManage(db, id, user.id)
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
  } catch (error) {
    throw toHttpError(error)
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
      "403": { "description": "Not an owner or moderator of this league." },
      "404": { "description": "Unknown league." }
    }
  },
})
