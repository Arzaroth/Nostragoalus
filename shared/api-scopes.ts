// Single source of truth for API-key scopes. The mint route validates grants
// against this list, the admin picker renders (grouped) from it, and the server
// converts a key's granted scopes into the resource/action permission map the
// better-auth verifier checks. To add a capability: add a scope here, then gate
// the route that needs it (defineValidatedHandler's `apiKey` option, or
// requireUserOrApiKey for a session-or-key read). A scope only narrows access if
// the route it names actually enforces it - granting alone gates nothing.

export interface ApiScopeDef {
  resource: string
  action: 'read' | 'write'
  // i18n label key under admin.apiKeys.* (e.g. 'scopeMediaWrite').
  labelKey: string
}

export const API_SCOPES: readonly ApiScopeDef[] = [
  { resource: 'leaderboard', action: 'read', labelKey: 'scopeLeaderboardRead' },
  { resource: 'media', action: 'write', labelKey: 'scopeMediaWrite' },
] as const

// The grantable scope strings ('resource:action'), e.g. ['leaderboard:read', ...].
export const GRANTABLE_SCOPES: readonly string[] = API_SCOPES.map((s) => `${s.resource}:${s.action}`)

export function isGrantableScope(scope: string): boolean {
  return GRANTABLE_SCOPES.includes(scope)
}

// 'media:write' -> { media: ['write'] }: the shape better-auth's verifier (and
// requireApiKey) expects. Unparseable entries are skipped, so a stray value can
// never widen a key's permissions.
export function permsFromScopes(scopes: string[]): Record<string, string[]> {
  const perms: Record<string, string[]> = {}
  for (const s of scopes) {
    const [resource, action] = s.split(':')
    if (resource && action) (perms[resource] ??= []).push(action)
  }
  return perms
}

// Scopes grouped by resource, declared order preserved, for the categorized
// admin picker (one heading per resource, a checkbox per action).
export function scopesByResource(): { resource: string; scopes: ApiScopeDef[] }[] {
  const resources = [...new Set(API_SCOPES.map((s) => s.resource))]
  return resources.map((resource) => ({ resource, scopes: API_SCOPES.filter((s) => s.resource === resource) }))
}
