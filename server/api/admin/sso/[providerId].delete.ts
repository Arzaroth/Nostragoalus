import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { ssoProvider } from '../../../../db/schema'
import { requireAdmin } from '../../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'providerId') as string
  await db.delete(ssoProvider).where(eq(ssoProvider.providerId, id))
  return { ok: true }
})
