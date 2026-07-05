import type { AppDatabase } from '../../../db/types'
import { stampUserFlagOnce } from '../user-flags/service'

// Stamp the one-time onboarding tour as done. Idempotent (see stampUserFlagOnce):
// a re-run (finish then skip, two tabs) never moves an already-set timestamp, so
// the tour never re-auto-starts once resolved.
export async function dismissOnboardingTour(db: AppDatabase, userId: string): Promise<void> {
  await stampUserFlagOnce(db, userId, 'onboardingTourDismissedAt')
}
