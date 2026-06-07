import { auth } from '~~/lib/auth'

export default defineEventHandler((event) => {
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
