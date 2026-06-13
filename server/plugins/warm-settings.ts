import { db } from '../../db'
import { loadEmailVerificationFlag } from '../utils/auth/email-verification'

// Warm the email-verification flag cache before the first request: the sync
// getter better-auth reads serves a default-false cache until the first async
// load resolves, so a sign-in/sign-up right after a (re)start could otherwise
// slip past verification. Runs after migrate.ts (alphabetical plugin order), so
// app_setting exists; a missing table on a not-yet-migrated DB is caught and the
// cache self-corrects on the next TTL refresh.
export default defineNitroPlugin(async () => {
  await loadEmailVerificationFlag(db).catch(() => {})
})
