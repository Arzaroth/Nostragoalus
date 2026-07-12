import { z } from 'zod'
import { defineValidatedHandler } from '../../utils/validated-handler'

const responseSchema = z.object({ ok: z.literal(true) })

// Forget the "trust this device" cookie for THIS browser, so the next sign-in
// asks for the second factor again. (Trust is cookie-based, per device.)
export default defineValidatedHandler({ response: responseSchema }, async ({ event }) => {
  deleteCookie(event, 'better-auth.trust_device')
  deleteCookie(event, '__Secure-better-auth.trust_device')
  return { ok: true as const }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Account"
    ],
    "summary": "Stop trusting this device",
    "description": "Clears the 2FA trust-device cookie so the next sign-in asks for the second factor again.",
    "responses": {
      "200": {
        "description": "Trust revoked."
      },
      "401": {
        "description": "Not signed in."
      }
    }
  },
})
