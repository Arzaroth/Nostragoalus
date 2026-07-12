import { z } from 'zod'
import { db } from '../../../db'
import { saveSubscription } from '../../utils/push/service'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})

const responseSchema = z.object({ ok: z.boolean() })

export default defineValidatedHandler({ body: bodySchema, response: responseSchema }, async ({ body, user, event }) => {
  await saveSubscription(db, user.id, body, getRequestHeader(event, 'user-agent') ?? null)
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Push"],
    "summary": "Register a push subscription",
    "description": "Store this browser's web-push subscription for the signed-in user (upserted on the endpoint).",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": ["endpoint", "keys"],
            "properties": {
              "endpoint": { "type": "string", "format": "uri" },
              "keys": {
                "type": "object",
                "required": ["p256dh", "auth"],
                "properties": { "p256dh": { "type": "string" }, "auth": { "type": "string" } }
              }
            }
          }
        }
      }
    },
    "responses": {
      "200": { "description": "Subscription stored." },
      "401": { "description": "Not signed in." },
      "409": { "description": "Endpoint already registered to another account." },
      "422": { "description": "Invalid subscription body." }
    }
  },
})
