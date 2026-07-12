import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { removeTwoFactor } from '../../../../utils/admin/twofactor'

const responseSchema = z.object({ ok: z.literal(true) })

export default defineValidatedHandler({ admin: true, response: responseSchema }, async ({ event }) => {
  const id = getRouterParam(event, 'id') as string
  await removeTwoFactor(db, id)
  return { ok: true as const }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "Strip 2FA from a user",
    "description": "Internal: removes the TOTP enrollment and backup codes of a locked-out user.",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "description": "User id.",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "2FA removed."
      },
      "401": {
        "description": "Not signed in."
      },
      "403": {
        "description": "Admin session required."
      }
    }
  },
})
