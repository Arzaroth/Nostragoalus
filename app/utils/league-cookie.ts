// The ng-league cookie holds one map of competition slug -> selected league id.
// A single cookie keeps the SSR read in one place and never leaks stale
// per-competition cookie names. These helpers tolerate garbage cookie values.

export type LeagueSelections = Record<string, string>

function asMap(value: unknown): LeagueSelections {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const out: LeagueSelections = {}
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string' && v) out[k] = v
  }
  return out
}

export function selectedLeagueFor(map: unknown, slug: string): string | null {
  return asMap(map)[slug] ?? null
}

// Immutable update; null clears the selection for that competition.
export function withLeagueSelection(map: unknown, slug: string, id: string | null): LeagueSelections {
  const next = { ...asMap(map) }
  if (id === null) delete next[slug]
  else next[slug] = id
  return next
}

// Drops a stored selection the user can no longer use (left/kicked/deleted).
export function pruneLeagueSelection(map: unknown, slug: string, validIds: string[]): LeagueSelections {
  const current = asMap(map)
  const selected = current[slug]
  if (selected === undefined || validIds.includes(selected)) return current
  return withLeagueSelection(current, slug, null)
}
