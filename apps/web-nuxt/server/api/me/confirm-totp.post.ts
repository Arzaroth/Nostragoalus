import { eq } from 'drizzle-orm'
import { symmetricDecrypt } from 'better-auth/crypto'
import { z } from 'zod'
import { db } from '../../../db'
import { twoFactor } from '../../../db/schema'
import { consumeTotpCode } from '../../utils/auth/totp-consume'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z.object({ code: z.string() })
const responseSchema = z.object({ valid: z.boolean() })

// Confirms the caller's current TOTP code (used as a guard before disabling 2FA).
// defineValidatedHandler applies the same-origin CSRF guard and user-session auth.
export default defineValidatedHandler({ body: bodySchema, response: responseSchema }, async ({ body, user }) => {
  const rows = await db.select().from(twoFactor).where(eq(twoFactor.userId, user.id)).limit(1)
  if (rows.length === 0) throw createError({ statusCode: 400, statusMessage: 'two-factor is not enabled' })

  const key = process.env.BETTER_AUTH_SECRET ?? process.env.NUXT_BETTER_AUTH_SECRET ?? ''
  const secret = await symmetricDecrypt({ key, data: rows[0].secret })
  return { valid: await consumeTotpCode(db, user.id, secret, body.code) }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Account"
    ],
    "summary": "Verify a TOTP code",
    "description": "Check a 6-digit authenticator code against the enrolled secret (used before disabling 2FA).",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "code": {
                "type": "string"
              }
            },
            "required": [
              "code"
            ]
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "{valid: boolean}."
      },
      "401": {
        "description": "Not signed in."
      },
      "400": {
        "description": "2FA not enabled."
      }
    }
  },
})
