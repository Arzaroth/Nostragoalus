import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { auth } from '../../lib/auth'
import { db } from '../../db'
import { user as userTable } from '../../db/schema'

export async function getSessionUser(event: H3Event) {
  // API keys authenticate ONLY through requireApiKey. The api-key plugin would
  // otherwise resolve an x-api-key header into a full session on every guard, so
  // strip it here to keep session guards strictly session-based.
  const headers = new Headers(event.headers)
  headers.delete('x-api-key')
  const session = await auth.api.getSession({ headers })
  return session?.user ?? null
}

export interface ApiKeyActor {
  id: string
  email: string
  role?: string | null
}

// Authenticate a request by its API key, requiring the given permissions (e.g.
// { media: ['write'] }). The key's owner is loaded and, for admin routes, must
// itself be an admin - so a non-admin's self-minted key can never reach an admin
// route even though anyone may create keys.
export async function requireApiKey(
  key: string,
  permissions: Record<string, string[]>,
  mustBeAdmin: boolean,
): Promise<ApiKeyActor> {
  const res = await auth.api.verifyApiKey({ body: { key, permissions } })
  const owner = res.valid && res.key ? (res.key as { referenceId?: string }).referenceId : undefined
  if (!owner) throw createError({ statusCode: 401, statusMessage: 'Invalid API key' })
  const rows = await db
    .select({ id: userTable.id, email: userTable.email, role: userTable.role })
    .from(userTable)
    .where(eq(userTable.id, owner))
    .limit(1)
  if (!rows[0]) throw createError({ statusCode: 401, statusMessage: 'Invalid API key' })
  if (mustBeAdmin && !isAdminUser(rows[0])) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  return rows[0]
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
