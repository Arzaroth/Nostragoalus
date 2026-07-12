import { z } from 'zod'
import { defineReadHandler } from '../../utils/read-handler'

const responseSchema = z.object({ trusted: z.boolean() })

// The trust cookie is HttpOnly; report its presence so the UI can reflect it.
export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ event }) => {
  const trusted = !!(getCookie(event, 'better-auth.trust_device') || getCookie(event, '__Secure-better-auth.trust_device'))
  return { trusted }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Account"
    ],
    "summary": "Device trust status",
    "description": "Whether this browser currently holds a 2FA trust-device cookie.",
    "responses": {
      "200": {
        "description": "{trusted: boolean}."
      },
      "401": {
        "description": "Not signed in."
      }
    }
  },
})
