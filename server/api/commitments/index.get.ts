import { db } from '../../../db'
import { getCommitmentChain } from '../../utils/commitment/service'

// Public: a page of the prediction commitment ledger. Each entry always carries
// its commitment + chain links; the opening (score + salt) appears only once the
// entry's match has kicked off, so picks stay hidden until lock while integrity
// stays verifiable throughout. Page forward with ?afterSeq=<nextSeq>.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const opts: { afterSeq?: number; limit?: number } = {}
  const afterSeq = Number(q.afterSeq)
  const limit = Number(q.limit)
  if (q.afterSeq !== undefined && Number.isFinite(afterSeq)) opts.afterSeq = afterSeq
  if (q.limit !== undefined && Number.isFinite(limit)) opts.limit = limit
  return getCommitmentChain(db, opts)
})

defineRouteMeta({
  openAPI: {
    "tags": ["Commitments"],
    "summary": "Commitment ledger page",
    "description": "An ordered page of the tamper-evident prediction ledger. Every entry exposes its commitment, prevHash and entryHash (so the hash chain verifies); the opening (homeGoals, awayGoals, salt) is included only for entries whose match has kicked off. Predictors appear as an opaque subject hash, never their user id. Use nextSeq as ?afterSeq to fetch the next page.",
    "parameters": [
      { "in": "query", "name": "afterSeq", "required": false, "description": "Return entries with seq greater than this (pagination cursor).", "schema": { "type": "integer" } },
      { "in": "query", "name": "limit", "required": false, "description": "Page size (1-1000, default 500).", "schema": { "type": "integer" } }
    ],
    "responses": {
      "200": {
        "description": "A page of ledger entries plus the current chain head and the next cursor (null at the tail).",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "entries": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "seq": { "type": "integer" },
                      "prevHash": { "type": "string" },
                      "commitment": { "type": "string" },
                      "entryHash": { "type": "string" },
                      "subject": { "type": "string" },
                      "matchId": { "type": "string" },
                      "createdAt": { "type": "string", "format": "date-time" },
                      "opened": { "type": "boolean" },
                      "homeGoals": { "type": "integer", "nullable": true },
                      "awayGoals": { "type": "integer", "nullable": true },
                      "salt": { "type": "string", "nullable": true }
                    }
                  }
                },
                "head": {
                  "type": "object",
                  "properties": {
                    "seq": { "type": "integer" },
                    "headHash": { "type": "string" }
                  }
                },
                "nextSeq": { "type": "integer", "nullable": true }
              }
            }
          }
        }
      }
    }
  },
})
