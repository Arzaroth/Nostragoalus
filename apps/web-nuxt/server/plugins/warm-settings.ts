import { db } from '../../db'
import { loadEmailVerificationFlag } from '../utils/auth/email-verification'
import { ensureDefaultScoringConfig } from '../utils/scoring/store'

// Warm the email-verification flag cache before the first request: the sync
// getter better-auth reads serves a default-false cache until the first async
// load resolves, so a sign-in/sign-up right after a (re)start could otherwise
// slip past verification. Runs after migrate.ts (alphabetical plugin order), so
// app_setting exists; a missing table on a not-yet-migrated DB is caught and the
// cache self-corrects on the next TTL refresh.
//
// Also seed the default scoring config: a fresh, migrated DB (before any
// fixtures:import) has no scoring_config row, so every scoring-dependent route
// (the champion/best-scorer pickers, finalize) 500s with "no active scoring
// config". ensureDefaultScoringConfig is idempotent - a no-op once a config
// exists - so this just makes the app usable from an empty DB.
export default defineNitroPlugin(async () => {
  await loadEmailVerificationFlag(db).catch(() => {})
  await ensureDefaultScoringConfig(db).catch(() => {})
})
