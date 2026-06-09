import { auth } from '~~/lib/auth'
import { db } from '~~/db'
import { isSsoManaged } from '../../utils/auth/sso-managed'

// Credential management an SSO-managed account must not touch locally: its
// email, passkeys and 2FA belong to the IdP. (Password endpoints already fail
// naturally - there is no credential account to verify against.)
const SSO_LOCKED = [
  '/api/auth/change-email',
  '/api/auth/passkey/generate-register-options',
  '/api/auth/passkey/verify-registration',
  '/api/auth/two-factor/enable',
]

// The SSO plugin ships its own provider-management endpoints gated only by a
// session; registering a provider captures email domains (and trusts the IdP
// for account linking), so over HTTP they are admin-surface only. Our
// /api/admin/sso/* routes call auth.api directly and bypass this handler.
const SSO_ADMIN_ONLY = [
  '/api/auth/sso/register',
  '/api/auth/sso/update-provider',
  '/api/auth/sso/delete-provider',
]

export default defineEventHandler(async (event) => {
  if (SSO_ADMIN_ONLY.some((p) => event.path === p || event.path.startsWith(`${p}?`))) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  if (SSO_LOCKED.some((p) => event.path === p || event.path.startsWith(`${p}?`))) {
    const session = await auth.api.getSession({ headers: event.headers })
    if (session && (await isSsoManaged(db, session.user.id))) {
      throw createError({ statusCode: 403, statusMessage: 'This account is managed by your identity provider.' })
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
