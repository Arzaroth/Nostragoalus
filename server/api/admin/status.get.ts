import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { user } from '../../../db/schema'
import { getSessionUser, isEnvAdmin } from '../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  const u = await getSessionUser(event)
  if (!u) return { isAdmin: false }
  // Self-heal: env-configured admins are promoted to role=admin so the
  // (role-based) better-auth admin plugin recognises them for user management.
  if (isEnvAdmin(u) && (u as { role?: string }).role !== 'admin') {
    await db.update(user).set({ role: 'admin' }).where(eq(user.id, u.id))
    return { isAdmin: true }
  }
  return { isAdmin: (u as { role?: string }).role === 'admin' || isEnvAdmin(u) }
})
