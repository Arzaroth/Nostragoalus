import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../db'
import { user } from '../../../db/schema'
import { defineReadHandler } from '../../utils/read-handler'
import { getSessionUser, isEnvAdmin } from '../../utils/auth-guards'

const responseSchema = z.object({ isAdmin: z.boolean() })

export default defineReadHandler({ response: responseSchema }, async ({ event }) => {
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

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "Admin status",
    "description": "Whether the current session belongs to an admin. Internal: drives the admin UI.",
    "responses": {
      "200": {
        "description": "{admin: boolean}."
      }
    }
  },
})
