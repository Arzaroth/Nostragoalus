import { db } from '../../../db'
import { requireAdmin } from '../../utils/auth-guards'
import { isEmailVerificationRequired, isSmtpConfigured } from '../../utils/auth/email-verification'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
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
