import { fifaRankingProvider, type FifaRankingProvider } from '../providers/fifa-ranking'

// FIFA publishes rankings roughly monthly - a long in-memory cache keeps pick
// requests from hammering (or stalling on) the FIFA endpoints.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000

interface RankCache {
  ranks: Map<string, number>
  fetchedAt: number
}

// After a failure, serve a stale cache (or null) for this long before retrying,
// so a FIFA outage / Cloudflare block isn't hammered on every pick request.
const FAIL_BACKOFF_MS = 5 * 60 * 1000

let cache: RankCache | null = null
let inflight: Promise<Map<string, number> | null> | null = null
let failedUntil = 0

export function resetFifaRankCache(): void {
  cache = null
  inflight = null
  failedUntil = 0
}

// Best-effort: returns null when FIFA is unreachable so a pick can still be
// saved (the caller then falls back to the flat champion bonus). Concurrent
// callers on a cold cache share one in-flight fetch (no stampede).
export async function getFifaRanks(
  provider: FifaRankingProvider = fifaRankingProvider(),
  now: Date = new Date(),
): Promise<Map<string, number> | null> {
  if (cache && now.getTime() - cache.fetchedAt < CACHE_TTL_MS) return cache.ranks
  if (now.getTime() < failedUntil) return cache?.ranks ?? null
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const { ranks } = await provider.getLatestRanks()
      cache = { ranks, fetchedAt: now.getTime() }
      return ranks
    } catch (error) {
      console.warn('[champion] FIFA ranking fetch failed, falling back to flat bonus:', error)
      failedUntil = now.getTime() + FAIL_BACKOFF_MS
      return cache?.ranks ?? null
    } finally {
      inflight = null
    }
  })()
  return inflight
}
