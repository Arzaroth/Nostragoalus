import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { user } from '../../../db/schema'
import { getBoolSetting, setAppSetting } from '../settings/service'

export const EMAIL_VERIFICATION_KEY = 'require_email_verification'

// better-auth reads emailAndPassword.requireEmailVerification synchronously on
// every sign-in/sign-up (never captured at init - verified against 1.6.14), so
// the runtime toggle is exposed as a getter backed by this in-memory cache. The
// getter can't await, so reads are served from cache and a stale cache triggers
// a fire-and-forget refresh for the next call. Admin writes update the cache
// synchronously, so a single instance is always immediately correct; the TTL
// only bounds staleness across multiple instances.
const TTL_MS = 30_000
let cached = { value: false, at: 0 }

export function isSmtpConfigured(): boolean {
  return !!process.env.NUXT_SMTP_URL
}

export async function loadEmailVerificationFlag(db: AppDatabase): Promise<boolean> {
  const value = await getBoolSetting(db, EMAIL_VERIFICATION_KEY, false)
  cached = { value, at: Date.now() }
  return value
}

// Synchronous read for the better-auth option getter.
export function emailVerificationRequiredSync(db: AppDatabase): boolean {
  if (Date.now() - cached.at > TTL_MS) {
    // Don't block the auth request on a settings query; refresh for next time.
    void loadEmailVerificationFlag(db).catch(() => {})
  }
  return cached.value
}

export async function setEmailVerificationRequired(db: AppDatabase, enabled: boolean): Promise<void> {
  await setAppSetting(db, EMAIL_VERIFICATION_KEY, enabled ? 'true' : 'false')
  cached = { value: enabled, at: Date.now() }
  // Grandfather: everyone who already has an account when verification is
  // switched on is treated as verified, so only sign-ups from here on must
  // confirm. Avoids retro-locking existing players out.
  if (enabled) {
    await db.update(user).set({ emailVerified: true }).where(eq(user.emailVerified, false))
  }
}
