import { RateLimiter } from './rate-limiter'
import { ProviderRateLimitError, ProviderUpstreamError } from './types'

// World Rugby's own rankings, keyless, one call per sub-feed:
// https://api.wr-rims-prod.pulselive.com/rugby/v3/rankings/mru
//
// Unlike FIFA's, no publication id has to be resolved first - the route always
// answers with the current table. Union only: the sevens feeds answer 400, and
// that surfaces as an upstream error the champion path already treats as "no
// ranks", falling back to the flat bonus.

const DEFAULT_BASE_URL = 'https://api.wr-rims-prod.pulselive.com/rugby/v3/rankings'

export interface WorldRugbyRankingResponse {
  label?: string | null
  entries?: {
    team?: { abbreviation?: string | null; countryCode?: string | null; name?: string | null } | null
    pos?: number | null
  }[] | null
}

// abbreviation (RSA, NZL, ...) -> position. Same three-letter alphabet the match
// feed uses for team codes, so a champion pick's code looks up directly.
export function normalizeWorldRugbyRanking(data: WorldRugbyRankingResponse): Map<string, number> {
  const ranks = new Map<string, number>()
  for (const entry of data.entries ?? []) {
    // Same fallback the match normalizer uses for a team code (toTeam in
    // worldrugby.ts). Keying only on abbreviation would miss any side whose
    // entry carries just a countryCode, and a missed lookup is indistinguishable
    // from an unranked team - which the tiers pay at the long-shot rate.
    const code = entry.team?.abbreviation ?? entry.team?.countryCode
    const pos = entry.pos
    if (code && pos != null) ranks.set(code, pos)
  }
  return ranks
}

export interface WorldRugbyRankingOptions {
  sport?: string | null
  baseUrl?: string
  fetchImpl?: typeof fetch
  rateLimiter?: RateLimiter
}

export interface WorldRugbyRankingProvider {
  getLatestRanks(): Promise<{ ranks: Map<string, number> }>
}

export function worldRugbyRankingProvider(options: WorldRugbyRankingOptions = {}): WorldRugbyRankingProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const sport = options.sport || 'mru'
  const doFetch = options.fetchImpl ?? fetch
  const limiter = options.rateLimiter ?? new RateLimiter(1000)

  return {
    async getLatestRanks() {
      await limiter.acquire()
      const response = await doFetch(`${baseUrl}/${encodeURIComponent(sport)}`, {
        headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
      })
      if (response.status === 429) throw new ProviderRateLimitError()
      if (!response.ok) throw new ProviderUpstreamError(response.status, await response.text())
      const ranks = normalizeWorldRugbyRanking((await response.json()) as WorldRugbyRankingResponse)
      // An empty table is a failure, not an answer. Returned as success it would
      // be cached for the full 12h instead of taking the short failure backoff,
      // and every champion pick in that window would resolve to a null rank -
      // which the tiers read as a long shot and pay at the top rate.
      if (ranks.size === 0) throw new ProviderUpstreamError(200, `world rugby rankings for ${sport} are empty`)
      return { ranks }
    },
  }
}
