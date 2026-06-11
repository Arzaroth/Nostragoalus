import { fifaRankingProvider, type FifaRankingProvider } from '../providers/fifa-ranking'

// FIFA publishes rankings roughly monthly - a long in-memory cache keeps pick
// requests from hammering (or stalling on) the FIFA endpoints.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000

interface RankCache {
  ranks: Map<string, number>
  fetchedAt: number
}

let cache: RankCache | null = null

export function resetFifaRankCache(): void {
  cache = null
}

// Best-effort: returns null when FIFA is unreachable so a pick can still be
// saved (it then falls back to the flat champion bonus).
export async function getFifaRanks(
  provider: FifaRankingProvider = fifaRankingProvider(),
  now: Date = new Date(),
): Promise<Map<string, number> | null> {
  if (cache && now.getTime() - cache.fetchedAt < CACHE_TTL_MS) return cache.ranks
  try {
    const { ranks } = await provider.getLatestRanks()
    cache = { ranks, fetchedAt: now.getTime() }
    return ranks
  } catch (error) {
    console.warn('[champion] FIFA ranking fetch failed, falling back to flat bonus:', error)
    return cache?.ranks ?? null
  }
}
