import { z } from 'zod'
import { db } from '../../../../../db'
import { resolveLeagueManage } from '../../../../utils/leagues/service'
import { inviteStatus, listInvites, pruneSpentInvites } from '../../../../utils/leagues/invites'
import { defineReadHandler } from '../../../../utils/read-handler'
import { inviteViewSchema } from '../../../../schemas/league'

const responseSchema = z.object({ invites: z.array(inviteViewSchema) })

export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ event, user }) => {
  const id = getRouterParam(event, 'id')!
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
