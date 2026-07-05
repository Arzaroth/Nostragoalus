import type { NormalizedBracket } from '../../../shared/types/match'
import { createTtlCache } from '../cache/ttl-cache'

// The provider bracket structure (rounds, KO scores, winners, who advances) is
// expensive and changes rarely, so it's cached per competition. The projection
// overlay rides live group standings and is recomputed per request - never
// cached. A null entry is a valid "this competition has no knockout structure";
// the cache returns undefined only on a genuine miss, keeping the two distinct.
const cache = createTtlCache<string, NormalizedBracket | null>({ ttlMs: 10 * 60 * 1000 })

// Returns the cached base, or undefined on a miss (so a cached null - "no
// bracket" - is distinguishable from "not cached").
export function getCachedBracket(competitionId: string, now: number): NormalizedBracket | null | undefined {
  return cache.get(competitionId, now)
}

export function setCachedBracket(competitionId: string, now: number, bracket: NormalizedBracket | null): void {
  cache.set(competitionId, bracket, now)
}

// Drop the cached base so the next request rebuilds it. Called when a knockout
// match finishes: the provider now advances the winner into the next slot, and
// the 10-minute TTL would otherwise hide that advancement for too long.
export function invalidateBracketCache(competitionId: string): void {
  cache.invalidate(competitionId)
}
