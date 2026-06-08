import { and, eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { championPick, user } from '../../../../db/schema'
import { getUserPublicPredictions } from '../../../utils/predictions/service'
import { resolveCompetition } from '../../../utils/competitions/store'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const rows = await db.select({ name: user.name, image: user.image }).from(user).where(eq(user.id, id)).limit(1)
  if (rows.length === 0) throw createError({ statusCode: 404, statusMessage: 'user not found' })

  // 'global' shows the player across every competition
  const requested = (getQuery(event).competition as string) || null
  const global = requested === 'global'
  const competition = global ? null : await resolveCompetition(db, requested)

  const championRows = await db
    .select({ teamCode: championPick.teamCode, teamName: championPick.teamName, competitionId: championPick.competitionId })
    .from(championPick)
    .where(
      competition
        ? and(eq(championPick.userId, id), eq(championPick.competitionId, competition.id))
        : eq(championPick.userId, id),
    )
  const champion = competition ? (championRows[0] ?? null) : null

  return {
    user: { id, name: rows[0].name, image: rows[0].image },
    champion,
    champions: global ? championRows : undefined,
    global,
    predictions: await getUserPublicPredictions(db, id, new Date(), competition?.id),
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Users"
    ],
    "summary": "A player's picks",
    "description": "Another player's predictions - only for matches that have kicked off (pending picks stay private).",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "description": "User id.",
        "schema": {
          "type": "string"
        }
      },
      {
        "in": "query",
        "name": "competition",
        "required": false,
        "description": "Competition slug (e.g. 'world-cup-2026'). Defaults to the current tournament.",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Locked predictions with points."
      }
    }
  },
})
