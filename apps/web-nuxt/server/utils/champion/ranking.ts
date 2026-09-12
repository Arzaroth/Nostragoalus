import { fifaRankingProvider, type FifaRankingProvider } from '../providers/fifa-ranking'
import { worldRugbyRankingProvider } from '../providers/worldrugby-ranking'

// Rankings publish roughly monthly - a long in-memory cache keeps pick requests
// from hammering (or stalling on) the ranking endpoints.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000

interface RankCache {
  ranks: Map<string, number>
  fetchedAt: number
}

// After a failure, serve a stale cache (or null) for this long before retrying,
// so an outage / Cloudflare block isn't hammered on every pick request.
const FAIL_BACKOFF_MS = 5 * 60 * 1000

interface SourceState {
  cache: RankCache | null
  inflight: Promise<Map<string, number> | null> | null
  failedUntil: number
}

// Keyed per ranking source, not global: a competition's sport decides which
// table it reads, and one shared slot would serve football ranks to a rugby
// competition for the whole TTL - silently, since the codes are the same shape.
const states = new Map<string, SourceState>()

function stateFor(key: string): SourceState {
  let state = states.get(key)
  if (!state) {
    state = { cache: null, inflight: null, failedUntil: 0 }
    states.set(key, state)
  }
  return state
}

export function resetFifaRankCache(): void {
  states.clear()
}

interface RankSource {
  key: string
  fetch: () => Promise<{ ranks: Map<string, number> }>
}

// Best-effort: returns null when the source is unreachable so a pick can still
// be saved (the caller then falls back to the flat champion bonus). Concurrent
// callers on a cold cache share one in-flight fetch (no stampede).
async function getRanks(source: RankSource, now: Date): Promise<Map<string, number> | null> {
  const state = stateFor(source.key)
  if (state.cache && now.getTime() - state.cache.fetchedAt < CACHE_TTL_MS) return state.cache.ranks
  if (now.getTime() < state.failedUntil) return state.cache?.ranks ?? null
  if (state.inflight) return state.inflight
  state.inflight = (async () => {
    try {
      const { ranks } = await source.fetch()
      state.cache = { ranks, fetchedAt: now.getTime() }
      return ranks
    } catch (error) {
      console.warn(`[champion] ${source.key} ranking fetch failed, falling back to flat bonus:`, error)
      state.failedUntil = now.getTime() + FAIL_BACKOFF_MS
      return state.cache?.ranks ?? null
    } finally {
      state.inflight = null
    }
  })()
  return state.inflight
}

export async function getFifaRanks(
  provider: FifaRankingProvider = fifaRankingProvider(),
  now: Date = new Date(),
): Promise<Map<string, number> | null> {
  return getRanks({ key: 'fifa', fetch: () => provider.getLatestRanks() }, now)
}

export interface RankedCompetition {
  sport?: string | null
  providerSport?: string | null
}

// The ranking table behind a competition's champion tiers. Football reads FIFA;
// rugby reads World Rugby's own, per sub-feed (the men's and women's tables are
// different, and the sevens feeds have none at all - that 400 surfaces as null
// ranks, which the champion routes already treat as "use the flat bonus").
export async function getRanksForCompetition(
  competition: RankedCompetition,
  now: Date = new Date(),
): Promise<Map<string, number> | null> {
  if (competition.sport !== 'RUGBY_UNION') return getFifaRanks(undefined, now)
  const sport = competition.providerSport || 'mru'
  return getRanks(
    { key: `worldrugby:${sport}`, fetch: () => worldRugbyRankingProvider({ sport }).getLatestRanks() },
    now,
  )
}
