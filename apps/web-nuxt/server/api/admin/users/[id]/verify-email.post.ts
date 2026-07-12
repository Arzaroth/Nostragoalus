import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { forceVerifyUserEmail } from '../../../../utils/admin/email-verify'

const responseSchema = z.object({ ok: z.literal(true) })

export default defineValidatedHandler({ admin: true, response: responseSchema }, async ({ event }) => {
  const id = getRouterParam(event, 'id') as string
  await forceVerifyUserEmail(db, id)
  return { ok: true as const }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "Force-verify a user's email",
    "description": "Internal: mark a user's email verified by hand (mail never arrived, or a rescue).",
    "parameters": [{ "in": "path", "name": "id", "required": true, "description": "User id.", "schema": { "type": "string" } }],
    "responses": {
      "200": { "description": "Email marked verified." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." },
      "404": { "description": "Unknown user." }
    }
  },
})
