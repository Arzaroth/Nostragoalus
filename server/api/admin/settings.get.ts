import { z } from 'zod'
import { db } from '../../../db'
import { defineReadHandler } from '../../utils/read-handler'
import { isEmailVerificationRequired, isSmtpConfigured } from '../../utils/auth/email-verification'

const responseSchema = z.object({ emailVerificationRequired: z.boolean(), smtpConfigured: z.boolean() })

export default defineReadHandler({ response: responseSchema, auth: 'admin' }, async () => {
  return {
    emailVerificationRequired: await isEmailVerificationRequired(db),
    smtpConfigured: isSmtpConfigured(),
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "Runtime settings",
    "description": "Internal: admin-toggleable flags and whether the mail transport is configured.",
    "responses": {
      "200": { "description": "{ emailVerificationRequired, smtpConfigured }." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." }
    }
  },
})
