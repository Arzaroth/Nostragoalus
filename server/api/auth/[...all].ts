import { eq } from 'drizzle-orm'
import { auth } from '~~/lib/auth'
import { db } from '~~/db'
import { account } from '~~/db/schema'

// Credential management an SSO-managed account must not touch locally: its
// email, passkeys and 2FA belong to the IdP. (Password endpoints already fail
// naturally - there is no credential account to verify against.)
const SSO_LOCKED = [
  '/api/auth/change-email',
  '/api/auth/passkey/generate-register-options',
  '/api/auth/passkey/verify-registration',
  '/api/auth/two-factor/enable',
]

export default defineEventHandler(async (event) => {
  if (SSO_LOCKED.some((p) => event.path === p || event.path.startsWith(`${p}?`))) {
    const session = await auth.api.getSession({ headers: event.headers })
    if (session) {
      const rows = await db.select({ providerId: account.providerId }).from(account).where(eq(account.userId, session.user.id))
      const ssoManaged = rows.length > 0 && !rows.some((r) => r.providerId === 'credential')
      if (ssoManaged) {
        throw createError({ statusCode: 403, statusMessage: 'This account is managed by your identity provider.' })
      }
    }
  }
  return auth.handler(toWebRequest(event))
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Auth"
    ],
    "summary": "better-auth endpoints",
    "description": "Authentication engine (better-auth): email/password, sessions, 2FA (TOTP, email OTP, backup codes), passkeys/WebAuthn, SSO (OIDC/SAML), admin user management. See better-auth docs for the full surface under /api/auth/*.",
    "responses": {
      "200": {
        "description": "Varies per sub-route."
      }
    }
  },
})
