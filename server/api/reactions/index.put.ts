import { z } from 'zod'
import { db } from '../../../db'
import { REACTION_EMOJIS } from '../../../shared/reactions'
import { getMatchReactionTotals, setReaction } from '../../utils/reactions/service'
import { publishReactionUpdate } from '../../utils/live/hub'
import { publishLeagueReactionUpdates } from '../../utils/live/league-reactions'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z.object({
  matchId: z.string().uuid(),
  // null clears the caller's reaction (toggle off).
  emoji: z.enum(REACTION_EMOJIS).nullable(),
})

export default defineValidatedHandler({ body: bodySchema }, async ({ body, user }) => {
  await setReaction(db, { userId: user.id, matchId: body.matchId, emoji: body.emoji })
  // Live counts for everyone viewing the match.
  publishReactionUpdate(body.matchId, await getMatchReactionTotals(db, body.matchId))
  // League-scoped counts to the reactor's league mates - fire and forget so a
  // per-league fan-out can't add latency to (or fail) the reaction itself.
  void publishLeagueReactionUpdates(db, { userId: user.id, matchId: body.matchId }).catch(() => {})
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Reactions"],
    "summary": "Set a match reaction",
    "description": "Set, change, or clear (emoji: null) the caller's reaction on one match. Reactions open at kickoff and stay open after full-time; pre-kickoff reactions are rejected.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "matchId": { "type": "string", "format": "uuid" },
              "emoji": { "type": ["string", "null"], "enum": ["FIRE", "GOAL", "WOW", "LAUGH", "SAD", "ANGRY", null] }
            },
            "required": ["matchId", "emoji"]
          }
        }
      }
    },
    "responses": {
      "200": { "description": "Reaction stored." },
      "401": { "description": "Not signed in." },
      "404": { "description": "Unknown match." },
      "400": { "description": "Invalid body, unknown reaction, or match not yet kicked off." }
    }
  },
})
