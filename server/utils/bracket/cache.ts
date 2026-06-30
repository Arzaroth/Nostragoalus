import type { NormalizedBracket } from '../../../shared/types/match'

// The provider bracket structure (rounds, KO scores, winners, who advances) is
// expensive and changes rarely, so it's cached per competition. The projection
// overlay rides live group standings and is recomputed per request - never
// cached. A null entry is a valid "this competition has no knockout structure".
const cache = new Map<string, { at: number; bracket: NormalizedBracket | null }>()
const TTL_MS = 10 * 60 * 1000

// Returns the cached base, or undefined on a miss (so a cached null - "no
// bracket" - is distinguishable from "not cached").
export function getCachedBracket(competitionId: string, now: number): NormalizedBracket | null | undefined {
  const entry = cache.get(competitionId)
  if (entry && now - entry.at < TTL_MS) return entry.bracket
  return undefined
}

export function setCachedBracket(competitionId: string, now: number, bracket: NormalizedBracket | null): void {
  cache.set(competitionId, { at: now, bracket })
}

// Drop the cached base so the next request rebuilds it. Called when a knockout
// match finishes: the provider now advances the winner into the next slot, and
// the 10-minute TTL would otherwise hide that advancement for too long.
export function invalidateBracketCache(competitionId: string): void {
  cache.delete(competitionId)
}
