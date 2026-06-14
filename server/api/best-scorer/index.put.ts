import { z } from 'zod'
import { db } from '../../../db'
import { resolveCompetition } from '../../utils/competitions/store'
import { repickBestScorer, setBestScorerPick } from '../../utils/bestscorer/service'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z.object({
  playerId: z.string().min(1).max(32),
  playerName: z.string().min(1).max(64),
  teamCode: z.string().min(1).max(8).nullable().optional(),
  teamName: z.string().min(1).max(64),
  competition: z.string().optional(),
  // True = one-time second-chance switch (halves the points).
  repick: z.boolean().optional(),
})

export default defineValidatedHandler({ body: bodySchema }, async ({ body, user }) => {
  const competition = await resolveCompetition(db, body.competition || null)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'competition not found' })

  const input = {
    userId: user.id,
    competitionId: competition.id,
    playerId: body.playerId,
    playerName: body.playerName,
    teamCode: body.teamCode ?? null,
    teamName: body.teamName,
  }
  await (body.repick ? repickBestScorer(db, input) : setBestScorerPick(db, input))
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Predictions"
    ],
    "summary": "Pick the best scorer",
    "description": "Set the Golden Boot pick. Locked from the first kickoff of the competition.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "playerId": {
                "type": "string"
              },
              "playerName": {
                "type": "string",
                "example": "Kylian MBAPPE"
              },
              "teamCode": {
                "type": "string",
                "example": "FRA"
              },
              "teamName": {
                "type": "string",
                "example": "France"
              },
              "competition": {
                "type": "string"
              },
              "repick": {
                "type": "boolean",
                "description": "Use the one-time second-chance window (halves the points) instead of the normal pre-lock edit."
              }
            },
            "required": [
              "playerId",
              "playerName",
              "teamName"
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
