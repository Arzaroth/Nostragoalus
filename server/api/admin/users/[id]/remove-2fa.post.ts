import { db } from '../../../../../db'
import { requireAdmin } from '../../../../utils/auth-guards'
import { removeTwoFactor } from '../../../../utils/admin/twofactor'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id') as string
  await removeTwoFactor(db, id)
  return { ok: true }
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
