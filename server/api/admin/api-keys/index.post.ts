import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { createApiKey, isGrantableScope } from '../../../utils/api-keys/service'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(64),
  scopes: z.array(z.string().refine(isGrantableScope, 'unknown scope')).min(1),
  expiresInSeconds: z.number().int().positive().nullable().optional(),
})

const responseSchema = z.object({ key: z.string() })

// Minted server-side (the plugin rejects client-supplied scope), owned by the
// creating admin so the consume-side admin-owner check passes for admin routes.
export default defineValidatedHandler({ admin: true, body: bodySchema, response: responseSchema }, async ({ body, user }) => {
  return createApiKey(db, {
    name: body.name,
    scopes: body.scopes,
    referenceId: user.id,
    expiresInSeconds: body.expiresInSeconds ?? null,
  })
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "Mint an API key",
    "description": "Internal: create a scoped machine key owned by the calling admin. Returns the plaintext key exactly once (stored hashed thereafter).",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "name": {
                "type": "string",
                "description": "Label for the key (1-64 chars)."
              },
              "scopes": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "Grantable scopes, e.g. [\"media:write\"]."
              },
              "expiresInSeconds": {
                "type": "integer",
                "nullable": true,
                "description": "Lifetime in seconds, or null for no expiry."
              }
            },
            "required": [
              "name",
              "scopes"
            ]
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "The plaintext key (shown once)."
      },
      "403": {
        "description": "Not an admin."
      },
      "422": {
        "description": "Invalid name, scope or expiry."
      }
    }
  },
})
