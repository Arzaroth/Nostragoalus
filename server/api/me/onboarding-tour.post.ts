import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { dismissOnboardingTour } from '../../utils/onboarding/service'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  await dismissOnboardingTour(db, user.id)
  return { ok: true }
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
