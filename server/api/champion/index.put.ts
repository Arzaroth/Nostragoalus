import { z } from 'zod'
import { db } from '../../../db'
import { resolveCompetition } from '../../utils/competitions/store'
import { repickChampion, setChampionPick } from '../../utils/champion/service'
import { getFifaRanks } from '../../utils/champion/ranking'
import { championPointsForRank } from '../../utils/scoring/config'
import { getActiveScoringConfig } from '../../utils/scoring/store'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z.object({
  teamCode: z.string().min(1).max(8),
  teamName: z.string().min(1).max(64),
  competition: z.string().optional(),
  // True = use the one-time second-chance window (halves the points) instead
  // of the normal pre-lock edit.
  repick: z.boolean().optional(),
})

export default defineValidatedHandler({ body: bodySchema }, async ({ body, user }) => {
  const competition = await resolveCompetition(db, body.competition || null)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'competition not found' })

  const [ranks, config] = await Promise.all([getFifaRanks(), getActiveScoringConfig(db)])
  const fifaRank = ranks?.get(body.teamCode) ?? null
  // Ranks known -> tier by rank (an absent team is a catch-all long shot).
  // Ranking fetch failed (ranks null) -> flat fallback so a pick still saves.
  const potentialPoints = ranks ? championPointsForRank(fifaRank, config.rules) : config.rules.championBonus

  const input = {
    userId: user.id,
    competitionId: competition.id,
    teamCode: body.teamCode,
    teamName: body.teamName,
    fifaRank,
    potentialPoints,
  }
  await (body.repick ? repickChampion(db, input) : setChampionPick(db, input))
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
