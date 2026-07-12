import { desc, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { apikey, user } from '../../../db/schema'
import { mintApiKey } from './mint'
// The grantable-scope list, validator and permission mapping live in the shared
// registry (one source of truth for the server and the admin picker). Re-exported
// so existing importers (the mint route, tests) keep their import path.
import { GRANTABLE_SCOPES, isGrantableScope, permsFromScopes } from '../../../shared/api-scopes'

export { GRANTABLE_SCOPES, isGrantableScope, permsFromScopes }

export interface ApiKeyView {
  id: string
  name: string | null
  start: string | null
  enabled: boolean | null
  permissions: Record<string, string[]> | null
  expiresAt: string | null
  lastRequest: string | null
  createdAt: string
  ownerEmail: string | null
}

function parsePermissions(raw: string | null): Record<string, string[]> | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as Record<string, string[]>
  } catch {
    return null
  }
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)

// Mint a key in SERVER context and persist it. The @better-auth/api-key plugin
// forbids a client request from setting `permissions`/`rateLimitEnabled`, so the
// admin UI can't call the plugin's create directly; minting here (admin-gated
// route) via the shared mintApiKey format keeps admin-UI keys and CLI keys
// byte-identical and both verifiable through the plugin. The plaintext is
// returned ONCE - it is stored only as a hash and can never be retrieved again.
export async function createApiKey(
  db: AppDatabase,
  input: { name: string; scopes: string[]; referenceId: string; expiresInSeconds?: number | null },
): Promise<{ key: string }> {
  const minted = mintApiKey({
    name: input.name,
    permissions: permsFromScopes(input.scopes),
    referenceId: input.referenceId,
    expiresInSeconds: input.expiresInSeconds ?? null,
  })
  await db.insert(apikey).values(minted.row)
  return { key: minted.plaintext }
}

// Every key across all owners (admin view), newest first, with the owner's email
// so an admin can tell a CLI-minted bot key from a colleague's. The secret hash
// is never selected.
export async function listApiKeys(db: AppDatabase): Promise<ApiKeyView[]> {
  const rows = await db
    .select({
      id: apikey.id,
      name: apikey.name,
      start: apikey.start,
      enabled: apikey.enabled,
      permissions: apikey.permissions,
      expiresAt: apikey.expiresAt,
      lastRequest: apikey.lastRequest,
      createdAt: apikey.createdAt,
      ownerEmail: user.email,
    })
    .from(apikey)
    .leftJoin(user, eq(user.id, apikey.referenceId))
    .orderBy(desc(apikey.createdAt))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    start: r.start,
    enabled: r.enabled,
    permissions: parsePermissions(r.permissions),
    expiresAt: iso(r.expiresAt),
    lastRequest: iso(r.lastRequest),
    createdAt: r.createdAt.toISOString(),
    ownerEmail: r.ownerEmail ?? null,
  }))
}

// Owner-agnostic revoke: an admin can drop any key (incl. CLI-minted ones the
// plugin's own delete - scoped to the caller's referenceId - cannot reach).
export async function revokeApiKey(db: AppDatabase, id: string): Promise<boolean> {
  const deleted = await db.delete(apikey).where(eq(apikey.id, id)).returning({ id: apikey.id })
  return deleted.length > 0
}
