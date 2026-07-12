import { and, eq } from 'drizzle-orm'
import { symmetricDecrypt, verifyPassword } from 'better-auth/crypto'
import { z } from 'zod'
import { db } from '../../../db'
import { account, twoFactor, user } from '../../../db/schema'
import { consumeTotpCode } from '../../utils/auth/totp-consume'
import { issueReauth } from '../../utils/auth/reauth'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z.object({ password: z.string(), code: z.string().optional() })
const responseSchema = z.object({ valid: z.boolean() })

// Sudo mode: confirm the password (and a TOTP code when 2FA is on) and issue a
// short-lived re-auth cookie required by sensitive actions (passkey registration).
// defineValidatedHandler applies the same-origin CSRF guard (this sets the sudo
// cookie) and the user-session auth.
export default defineValidatedHandler({ body: bodySchema, response: responseSchema }, async ({ event, body, user: sessionUser }) => {
  const accounts = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, sessionUser.id), eq(account.providerId, 'credential')))
    .limit(1)
  if (!accounts[0]?.password) throw createError({ statusCode: 400, statusMessage: 'no password account' })

  const passwordOk = await verifyPassword({ hash: accounts[0].password, password: body.password })
  if (!passwordOk) return { valid: false }

  const [u] = await db.select({ twoFactorEnabled: user.twoFactorEnabled }).from(user).where(eq(user.id, sessionUser.id))
  if (u?.twoFactorEnabled) {
    const rows = await db.select().from(twoFactor).where(eq(twoFactor.userId, sessionUser.id)).limit(1)
    const key = process.env.BETTER_AUTH_SECRET ?? process.env.NUXT_BETTER_AUTH_SECRET ?? ''
    const secret = rows[0] ? await symmetricDecrypt({ key, data: rows[0].secret }) : ''
    if (!rows[0] || !(await consumeTotpCode(db, sessionUser.id, secret, body.code ?? ''))) {
      return { valid: false }
    }
  }

  setCookie(event, 'ng_reauth', issueReauth(sessionUser.id), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 300 })
  return { valid: true }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Account"
    ],
    "summary": "Confirm credentials (sudo)",
    "description": "Re-verify password (and TOTP when 2FA is on) to open a 5-minute re-auth window, required for sensitive actions like registering a passkey.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "password": {
                "type": "string"
              },
              "code": {
                "type": "string",
                "description": "6-digit TOTP, required when 2FA is enabled."
              }
            },
            "required": [
              "password"
            ]
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "{valid: boolean}; sets the re-auth cookie when valid."
      },
      "401": {
        "description": "Not signed in."
      }
    }
  },
})
