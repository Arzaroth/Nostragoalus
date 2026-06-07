import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { resolveCompetition } from '../../utils/competitions/store'
import { setChampionPick } from '../../utils/champion/service'
import { toHttpError } from '../../utils/http'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody(event)
  const competition = await resolveCompetition(db, body?.competition || null)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'competition not found' })

  try {
    await setChampionPick(db, {
      userId: user.id,
      competitionId: competition.id,
      teamCode: String(body?.teamCode),
      teamName: String(body?.teamName),
    })
    return { ok: true }
  } catch (error) {
    throw toHttpError(error)
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Predictions"
    ],
    "summary": "Pick the champion",
    "description": "Set the tournament-winner pick. Locked from the first kickoff of the competition.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "teamCode": {
                "type": "string",
                "example": "FRA"
              },
              "competition": {
                "type": "string"
              }
            },
            "required": [
              "teamCode"
            ]
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "Stored pick."
      },
      "401": {
        "description": "Not signed in."
      },
      "409": {
        "description": "Tournament already started."
      }
    }
  },
})
