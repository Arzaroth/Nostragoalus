import { eq } from 'drizzle-orm'
import { symmetricDecrypt } from 'better-auth/crypto'
import { db } from '../../../db'
import { twoFactor } from '../../../db/schema'
import { requireUser } from '../../utils/auth-guards'
import { verifyTotpCode } from '../../utils/auth/totp'

// Confirms the caller's current TOTP code (used as a guard before disabling 2FA).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody(event).catch(() => ({}))
  const code = String(body?.code ?? '')

  const rows = await db.select().from(twoFactor).where(eq(twoFactor.userId, user.id)).limit(1)
  if (rows.length === 0) throw createError({ statusCode: 400, statusMessage: 'two-factor is not enabled' })

  const key = process.env.BETTER_AUTH_SECRET ?? process.env.NUXT_BETTER_AUTH_SECRET ?? ''
  const secret = await symmetricDecrypt({ key, data: rows[0].secret })
  return { valid: verifyTotpCode(secret, code, Date.now(), 1, 'raw') }
})
