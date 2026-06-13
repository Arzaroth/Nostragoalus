import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { isSmtpConfigured, setEmailVerificationRequired } from '../../../utils/auth/email-verification'

const bodySchema = z.object({ enabled: z.boolean() })

export default defineValidatedHandler({ admin: true, body: bodySchema }, async ({ body }) => {
  // Enabling without a mail transport would lock every new sign-up out (the
  // verification mail can never be sent), so refuse it.
  if (body.enabled && !isSmtpConfigured()) {
    throw createError({ statusCode: 409, statusMessage: 'Configure SMTP (NUXT_SMTP_URL) before requiring email verification.' })
  }
  await setEmailVerificationRequired(db, body.enabled)
  return { emailVerificationRequired: body.enabled }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "Toggle signup email verification",
    "description": "Internal: require new sign-ups to confirm their email. Enabling needs SMTP configured and grandfathers existing accounts as verified.",
    "requestBody": {
      "required": true,
      "content": { "application/json": { "schema": { "type": "object", "properties": { "enabled": { "type": "boolean" } }, "required": ["enabled"] } } },
    },
    "responses": {
      "200": { "description": "Updated." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." },
      "409": { "description": "SMTP not configured." },
      "422": { "description": "Invalid body." }
    }
  },
})
