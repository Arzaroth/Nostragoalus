import { eq } from 'drizzle-orm'
import { symmetricDecrypt } from 'better-auth/crypto'
import { db } from '../../../db'
import { twoFactor } from '../../../db/schema'
import { requireUser } from '../../utils/auth-guards'
import { verifyTotpCode } from '../../utils/auth/totp'

// Confirms the caller's current TOTP code (used as a guard before disabling 2FA).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody(event).catch(() => ({}))
  const code = String(body?.code ?? '')

  const rows = await db.select().from(twoFactor).where(eq(twoFactor.userId, user.id)).limit(1)
  if (rows.length === 0) throw createError({ statusCode: 400, statusMessage: 'two-factor is not enabled' })

  const key = process.env.BETTER_AUTH_SECRET ?? process.env.NUXT_BETTER_AUTH_SECRET ?? ''
  const secret = await symmetricDecrypt({ key, data: rows[0].secret })
  return { valid: verifyTotpCode(secret, code, Date.now(), 1, 'raw') }
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
