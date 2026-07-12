import { z } from 'zod'
import { db } from '../../../db'
import { deleteSubscription } from '../../utils/push/service'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z.object({ endpoint: z.string().min(1) })

const responseSchema = z.object({ removed: z.number() })

export default defineValidatedHandler({ body: bodySchema, response: responseSchema }, async ({ body, user }) => {
  const removed = await deleteSubscription(db, user.id, body.endpoint)
  return { removed }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Push"],
    "summary": "Remove a push subscription",
    "description": "Delete this browser's stored web-push subscription for the signed-in user.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": ["endpoint"],
            "properties": { "endpoint": { "type": "string" } }
          }
        }
      }
    },
    "responses": {
      "200": { "description": "Number removed (0 or 1)." },
      "401": { "description": "Not signed in." },
      "422": { "description": "Invalid body." }
    }
  },
})
