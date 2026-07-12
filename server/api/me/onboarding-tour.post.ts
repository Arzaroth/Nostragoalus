import { z } from 'zod'
import { db } from '../../../db'
import { dismissOnboardingTour } from '../../utils/onboarding/service'
import { defineValidatedHandler } from '../../utils/validated-handler'

const responseSchema = z.object({ ok: z.literal(true) })

export default defineValidatedHandler({ response: responseSchema }, async ({ user }) => {
  await dismissOnboardingTour(db, user.id)
  return { ok: true as const }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Onboarding"],
    "summary": "Finish or skip the one-time onboarding tour",
    "description": "Idempotent; the spotlight tour never auto-starts again on any device.",
    "responses": {
      "200": { "description": "Dismissed." },
      "401": { "description": "Not signed in." }
    }
  },
})
