import { z } from 'zod'
import { db } from '../../../db'
import { getChainHead } from '../../utils/commitment/service'
import { defineReadHandler } from '../../utils/read-handler'

const responseSchema = z.object({
  seq: z.number(),
  headHash: z.string(),
  updatedAt: z.date().nullable(),
})

// Public: the current head of the prediction commitment chain. Anyone can snapshot
// this and later detect a retro-edit (the recomputed head would no longer match).
export default defineReadHandler({ response: responseSchema }, async () => {
  const head = await getChainHead(db)
  return { seq: head.seq, headHash: head.headHash, updatedAt: head.updatedAt }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Commitments"],
    "summary": "Commitment chain head",
    "description": "The current head of the tamper-evident prediction ledger: the running seq and hash of the last committed pick change. Public and unauthenticated so anyone can snapshot it and later verify the history still reproduces it.",
    "responses": {
      "200": {
        "description": "The chain head. seq 0 / all-zero hash means an empty ledger.",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "seq": { "type": "integer" },
                "headHash": { "type": "string" },
                "updatedAt": { "type": "string", "format": "date-time", "nullable": true }
              }
            }
          }
        }
      }
    }
  },
})
