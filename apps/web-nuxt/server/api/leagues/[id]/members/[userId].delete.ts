import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { kickMember, resolveLeagueManage } from '../../../../utils/leagues/service'

const responseSchema = z.object({ ok: z.literal(true) })

export default defineValidatedHandler({ response: responseSchema }, async ({ event, user }) => {
  const id = getRouterParam(event, 'id')!
  const targetUserId = getRouterParam(event, 'userId')!
  await resolveLeagueManage(db, id, user.id)
  await kickMember(db, { leagueId: id, actorUserId: user.id, targetUserId })
  return { ok: true as const }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Kick a member",
    "description": "Owners kick moderators and members; moderators kick members. Kicks are remembered so SSO auto-join cannot undo them.",
    "responses": {
      "200": { "description": "Removed." },
      "400": { "description": "Tried to kick yourself (use leave)." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Insufficient league role." },
      "404": { "description": "Unknown league or target not a member." }
    }
  },
})
