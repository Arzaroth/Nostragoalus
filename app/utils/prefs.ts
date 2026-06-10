// Per-user display preferences stored as better-auth additionalFields. The
// session user object is loosely typed, so the default rules live here once
// instead of as scattered `as any` casts.

// Bookmaker odds are opt-OUT: shown unless the user explicitly disabled them.
export function showOddsEnabled(user: unknown): boolean {
  return (user as { showOdds?: boolean | null } | null | undefined)?.showOdds !== false
}
