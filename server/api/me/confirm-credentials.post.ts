import { and, eq } from 'drizzle-orm'
import { symmetricDecrypt, verifyPassword } from 'better-auth/crypto'
import { db } from '../../../db'
import { account, twoFactor, user } from '../../../db/schema'
import { requireUser } from '../../utils/auth-guards'
import { verifyTotpCode } from '../../utils/auth/totp'
import { issueReauth } from '../../utils/auth/reauth'

// Sudo mode: confirm the password (and a TOTP code when 2FA is on) and issue a
// short-lived re-auth cookie required by sensitive actions (passkey registration).
export default defineEventHandler(async (event) => {
  const sessionUser = await requireUser(event)
  const body = await readBody(event).catch(() => ({}))

  const accounts = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, sessionUser.id), eq(account.providerId, 'credential')))
    .limit(1)
  if (!accounts[0]?.password) throw createError({ statusCode: 400, statusMessage: 'no password account' })

  const passwordOk = await verifyPassword({ hash: accounts[0].password, password: String(body?.password ?? '') })
  if (!passwordOk) return { valid: false }

  const [u] = await db.select({ twoFactorEnabled: user.twoFactorEnabled }).from(user).where(eq(user.id, sessionUser.id))
  if (u?.twoFactorEnabled) {
    const rows = await db.select().from(twoFactor).where(eq(twoFactor.userId, sessionUser.id)).limit(1)
    const key = process.env.BETTER_AUTH_SECRET ?? process.env.NUXT_BETTER_AUTH_SECRET ?? ''
    const secret = rows[0] ? await symmetricDecrypt({ key, data: rows[0].secret }) : ''
    if (!rows[0] || !verifyTotpCode(secret, String(body?.code ?? ''), Date.now(), 1, 'raw')) {
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
