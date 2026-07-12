import { z } from 'zod'
import { db } from '../../../../db'
import { defineReadHandler } from '../../../utils/read-handler'
import { listScoringConfigs } from '../../../utils/scoring/admin'
import { scoringRulesSchema } from '../../../utils/scoring/schema'

// Mirrors ScoringConfigList (server/utils/scoring/admin.ts): the default config
// plus every per-competition override, and the competitions available to
// override. rules reuses scoringRulesSchema (its output matches ScoringRules).
const compRefSchema = z.object({ id: z.string(), slug: z.string(), name: z.string() })
const responseSchema = z.object({
  entries: z.array(
    z.object({
      competitionId: z.string().nullable(),
      competition: compRefSchema.nullable(),
      version: z.number(),
      rules: scoringRulesSchema,
    }),
  ),
  competitions: z.array(
    z.object({ id: z.string(), slug: z.string(), name: z.string(), hasOverride: z.boolean() }),
  ),
})

export default defineReadHandler({ response: responseSchema, auth: 'admin' }, async () => {
  return listScoringConfigs(db)
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "List scoring configs",
    "description": "The default scoring config and every per-competition override, plus the competitions available to override.",
    "responses": {
      "200": {
        "description": "Default config and overrides."
      },
      "403": {
        "description": "Not an admin."
      }
    }
  },
})
