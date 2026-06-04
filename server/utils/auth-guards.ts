import type { H3Event } from 'h3'
import { auth } from '../../lib/auth'

export async function getSessionUser(event: H3Event) {
  const session = await auth.api.getSession({ headers: event.headers })
  return session?.user ?? null
}

export async function requireUser(event: H3Event) {
  const user = await getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return user
}

export async function requireAdmin(event: H3Event) {
  const user = await requireUser(event)
  const admins = (useRuntimeConfig().adminEmails || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  if (!admins.includes(user.email.toLowerCase())) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return user
}
