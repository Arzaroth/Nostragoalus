import { RateLimiter } from './rate-limiter'
import { ProviderUpstreamError } from './types'

// FIFA men's world ranking via the keyless inside.fifa.com JSON endpoints.
// /api/ranking-overview needs a publication ("schedule") id; the current one is
// not listed anywhere fetchable as JSON, but /api/rankings/by-country answers
// with the latest publication's IdSchedule - so one cheap call resolves the id
// and a second fetches the full ~211-team table.

export interface FifaRankingOverviewResponse {
  rankings?: {
    rankingItem?: {
      rank?: number | null
      countryCode?: string | null
      name?: string | null
    } | null
  }[]
}

export interface FifaRankingByCountryResponse {
  rankings?: {
    IdCountry?: string | null
    Rank?: number | null
    IdSchedule?: string | null
  }[]
}

// countryCode (FIFA 3-letter, same alphabet as match team codes) -> rank.
export function normalizeFifaRanking(data: FifaRankingOverviewResponse): Map<string, number> {
  const ranks = new Map<string, number>()
  for (const entry of data.rankings ?? []) {
    const code = entry.rankingItem?.countryCode
    const rank = entry.rankingItem?.rank
    if (code && rank != null) ranks.set(code, rank)
  }
  return ranks
}

export interface FifaRankingOptions {
  baseUrl?: string
  fetchImpl?: typeof fetch
  rateLimiter?: RateLimiter
  // Any always-ranked country works; only its IdSchedule is read.
  probeCountryCode?: string
}

const DEFAULT_BASE_URL = 'https://inside.fifa.com'
const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export interface FifaRankingProvider {
  getLatestScheduleId(): Promise<string>
  getRanks(scheduleId: string): Promise<Map<string, number>>
  getLatestRanks(): Promise<{ scheduleId: string; ranks: Map<string, number> }>
}

export function fifaRankingProvider(options?: FifaRankingOptions): FifaRankingProvider {
  const baseUrl = options?.baseUrl ?? DEFAULT_BASE_URL
  const doFetch = options?.fetchImpl ?? fetch
  const limiter = options?.rateLimiter ?? new RateLimiter(1000)
  const probe = options?.probeCountryCode ?? 'BRA'

  async function getJson<T>(path: string): Promise<T> {
    await limiter.acquire()
    const response = await doFetch(`${baseUrl}${path}`, { headers: { 'User-Agent': BROWSER_UA } })
    if (!response.ok) throw new ProviderUpstreamError(response.status, await response.text())
    return (await response.json()) as T
  }

  async function getLatestScheduleId(): Promise<string> {
    const data = await getJson<FifaRankingByCountryResponse>(
      `/api/rankings/by-country?gender=male&countryCode=${probe}&footballType=football&locale=en`,
    )
    const id = data.rankings?.[0]?.IdSchedule
    if (!id) throw new ProviderUpstreamError(200, 'fifa ranking by-country answered without an IdSchedule')
    return id
  }

  async function getRanks(scheduleId: string): Promise<Map<string, number>> {
    const data = await getJson<FifaRankingOverviewResponse>(
      `/api/ranking-overview?locale=en&dateId=${encodeURIComponent(scheduleId)}`,
    )
    const ranks = normalizeFifaRanking(data)
    if (ranks.size === 0) throw new ProviderUpstreamError(200, `fifa ranking-overview for ${scheduleId} is empty`)
    return ranks
  }

  return {
    getLatestScheduleId,
    getRanks,
    async getLatestRanks() {
      const scheduleId = await getLatestScheduleId()
      return { scheduleId, ranks: await getRanks(scheduleId) }
    },
  }
}
