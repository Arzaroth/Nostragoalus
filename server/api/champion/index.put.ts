import { z } from 'zod'
import { db } from '../../../db'
import { resolveCompetition } from '../../utils/competitions/store'
import { setChampionPick } from '../../utils/champion/service'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z.object({
  teamCode: z.string().min(1).max(8),
  teamName: z.string().min(1).max(64),
  competition: z.string().optional(),
})

export default defineValidatedHandler({ body: bodySchema }, async ({ body, user }) => {
  const competition = await resolveCompetition(db, body.competition || null)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'competition not found' })

  await setChampionPick(db, {
    userId: user.id,
    competitionId: competition.id,
    teamCode: body.teamCode,
    teamName: body.teamName,
  })
  return { ok: true }
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
