import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { toggleVote } from '../../../utils/roadmap/service'

const responseSchema = z.object({ voted: z.boolean(), voteCount: z.number() })

// No body: the target is the route id and the action is a toggle. The non-admin
// handler still requires a signed-in user, whose id owns the vote.
export default defineValidatedHandler({ response: responseSchema }, async ({ event, user }) => {
  const id = getRouterParam(event, 'id')!
  const result = await toggleVote(db, { itemId: id, userId: user.id })
  return result
})

defineRouteMeta({
  openAPI: {
    "tags": ["Roadmap"],
    "summary": "Toggle an upvote on a roadmap item",
    "description": "Signed-in users upvote a roadmap item or suggestion; calling again removes the vote. Returns whether the caller now has a vote and the fresh total.",
    "responses": {
      "200": {
        "description": "The toggled vote state and fresh count.",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "voted": { "type": "boolean" },
                "voteCount": { "type": "integer" }
              }
            }
          }
        }
      },
      "401": { "description": "Not signed in." },
      "404": { "description": "Unknown or hidden item." },
      "409": { "description": "Voting is closed: the item is in progress or shipped." }
    }
  },
})
