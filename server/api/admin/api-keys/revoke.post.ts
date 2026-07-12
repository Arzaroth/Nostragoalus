import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { revokeApiKey } from '../../../utils/api-keys/service'

const bodySchema = z.object({ id: z.string().min(1) })

const responseSchema = z.object({ revoked: z.boolean() })

export default defineValidatedHandler({ admin: true, body: bodySchema, response: responseSchema }, async ({ body }) => {
  return { revoked: await revokeApiKey(db, body.id) }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "Revoke an API key",
    "description": "Internal: delete any API key by id (admin can revoke keys owned by anyone, including CLI-minted bot keys).",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "description": "Id of the key to revoke."
              }
            },
            "required": [
              "id"
            ]
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "Whether a key was removed."
      },
      "403": {
        "description": "Not an admin."
      },
      "422": {
        "description": "Missing id."
      }
    }
  },
})
