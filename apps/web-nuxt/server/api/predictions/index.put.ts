import { z } from 'zod'
import { db } from '../../../db'
import { getMatchCrowdTotal, upsertPrediction } from '../../utils/predictions/service'
import { publishCrowdUpdate } from '../../utils/live/hub'
import { publishLeagueCrowdUpdates } from '../../utils/live/league-crowd'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z.object({
  matchId: z.string().uuid(),
  home: z.number().int().min(0).max(99),
  away: z.number().int().min(0).max(99),
  // Entered via the W/D/L quick-pick (easy/hardcore) - stored as a canonical
  // scoreline but flagged so NORMAL leagues nudge for a real score.
  isOutcomeOnly: z.boolean().optional(),
  // HARD-league confidence stake; null clears it.
  wager: z.number().int().min(0).max(999).nullable().optional(),
})

const responseSchema = z.object({ id: z.string() })

export default defineValidatedHandler({ body: bodySchema, response: responseSchema }, async ({ body, user }) => {
  const id = await upsertPrediction(db, {
    userId: user.id,
    matchId: body.matchId,
    home: body.home,
    away: body.away,
    isOutcomeOnly: body.isOutcomeOnly,
    wager: body.wager,
  })
  // live crowd totals for everyone with the preference on
  publishCrowdUpdate(body.matchId, await getMatchCrowdTotal(db, body.matchId))
  // and the league-scoped totals to the predictor's league mates - fire and
  // forget: it is a per-league fan-out of queries that must not add latency to
  // (or fail) the save itself.
  void publishLeagueCrowdUpdates(db, { userId: user.id, matchId: body.matchId }).catch(() => {})
  return { id }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Predictions"],
    "summary": "Save a prediction",
    "description": "Create or update the score prediction for one match. Rejected once the match has kicked off (server-side lock) or while the teams are unconfirmed.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "matchId": { "type": "string", "format": "uuid" },
              "home": { "type": "integer", "minimum": 0, "maximum": 99 },
              "away": { "type": "integer", "minimum": 0, "maximum": 99 }
            },
            "required": ["matchId", "home", "away"]
          }
        }
      }
    },
    "responses": {
      "200": { "description": "The stored prediction id." },
      "401": { "description": "Not signed in." },
      "409": { "description": "Match already kicked off." },
      "422": { "description": "Invalid body, invalid scores, or unconfirmed teams." }
    }
  },
})
