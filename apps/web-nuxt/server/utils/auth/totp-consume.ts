import { and, eq, lt, or, isNull } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { twoFactor } from '../../../db/schema'
import { matchedTotpStep, type TotpEncoding } from './totp'

// Verify a TOTP code AND consume it, so the same code can't be replayed inside its
// +/-1 validity window (~90s). Matches the code to a step, then atomically advances
// two_factor.last_totp_step only if the matched step is strictly greater than the
// stored one. The conditional UPDATE is the concurrency guard: two requests racing
// the same code both compute the same step, but only the first row-update (stored <
// step) lands - the second sees stored == step and updates nothing, so it fails.
// Returns true only when the code both matched and was newly consumed.
export async function consumeTotpCode(
  db: AppDatabase,
  userId: string,
  secret: string,
  code: string,
  timeMs: number = Date.now(),
  encoding: TotpEncoding = 'raw',
): Promise<boolean> {
  const step = matchedTotpStep(secret, code, timeMs, 1, encoding)
  if (step === null) return false
  const updated = await db
    .update(twoFactor)
    .set({ lastTotpStep: step })
    .where(and(eq(twoFactor.userId, userId), or(isNull(twoFactor.lastTotpStep), lt(twoFactor.lastTotpStep, step))))
    .returning({ id: twoFactor.id })
  return updated.length > 0
}
