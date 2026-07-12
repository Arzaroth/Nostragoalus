import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { regenerateJoinCode, resolveLeagueManage } from '../../../utils/leagues/service'

const responseSchema = z.object({ joinCode: z.string() })

export default defineValidatedHandler({ response: responseSchema }, async ({ event, user }) => {
  const id = getRouterParam(event, 'id')!
  await resolveLeagueManage(db, id, user.id)
  return { joinCode: await regenerateJoinCode(db, id) }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Regenerate the join code",
    "description": "Owner or moderator. Invalidates the previous code - the way to revoke a leaked invitation.",
    "responses": {
      "200": { "description": "The new join code." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Insufficient league role." },
      "404": { "description": "Unknown league." }
    }
  },
})
