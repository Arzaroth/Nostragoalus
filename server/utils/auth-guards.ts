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

function adminEmails(): string[] {
  return (useRuntimeConfig().adminEmails || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

export function isEnvAdmin(user: { email: string }): boolean {
  return adminEmails().includes(user.email.toLowerCase())
}

function isAdminUser(user: { email: string; role?: string | null }): boolean {
  return user.role === 'admin' || isEnvAdmin(user)
}

export async function isAdmin(event: H3Event): Promise<boolean> {
  const user = await getSessionUser(event)
  return !!user && isAdminUser(user)
}

export async function requireAdmin(event: H3Event) {
  const user = await requireUser(event)
  if (!isAdminUser(user)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return user
}
