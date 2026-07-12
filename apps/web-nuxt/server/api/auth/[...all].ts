import { auth } from '~~/lib/auth'
import { db } from '~~/db'
import { isSsoManaged } from '../../utils/auth/sso-managed'
import { isSsoAdminOnlyPath, isSsoLockedPath, ssoCallbackProviderId } from '../../utils/auth/sso-guard-paths'
import { isProviderEnabled } from '../../utils/sso/service'

export default defineEventHandler(async (event) => {
  if (isSsoAdminOnlyPath(event.path)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  // A draft/disabled provider must not complete a sign-in. Gate the callback
  // (where the session is minted) rather than the sign-in body, so the IdP/user
  // is bounced back to login instead of getting a half-finished session.
  const callbackProviderId = ssoCallbackProviderId(event.path)
  if (callbackProviderId && !(await isProviderEnabled(db, callbackProviderId))) {
    return sendRedirect(event, '/login?error=provider_disabled', 302)
  }
  if (isSsoLockedPath(event.path)) {
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
