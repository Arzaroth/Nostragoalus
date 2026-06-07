import type { AppStage, MatchStatus, NormalizedMatch, Score, Team, Winner } from '../../../shared/types/match'
import { RateLimiter } from './rate-limiter'
import { ProviderRateLimitError, ProviderUpstreamError, type ListFixturesOptions, type MatchDataProvider } from './types'

// UEFA's public match API (the one uefa.com itself uses) - keyless.
// e.g. https://match.uefa.com/v5/matches?competitionId=3&seasonYear=2024

interface UefaTeam {
  id?: string | null
  internationalName?: string | null
  countryCode?: string | null
  bigLogoUrl?: string | null
}

export interface UefaMatch {
  id: string
  status?: string | null
  kickOffTime?: { dateTime?: string | null } | null
  homeTeam?: UefaTeam | null
  awayTeam?: UefaTeam | null
  score?: {
    total?: { home?: number | null; away?: number | null } | null
    penalty?: { home?: number | null; away?: number | null } | null
  } | null
  round?: { id?: string | null; metaData?: { name?: string | null } | null } | null
  group?: { metaData?: { groupName?: string | null } | null } | null
  matchday?: { name?: string | null; phase?: string | null } | null
  winner?: { match?: { team?: { id?: string | null } | null } | null } | null
}

export function mapUefaStatus(status: string | null | undefined): MatchStatus {
  switch (status) {
    case 'FINISHED':
      return 'FINISHED'
    case 'LIVE':
      return 'LIVE'
    case 'HALF_TIME_BREAK':
      return 'PAUSED'
    default:
      return 'SCHEDULED'
  }
}

export function mapUefaStage(roundName: string | null | undefined): AppStage {
  const s = (roundName ?? '').toLowerCase()
  // "Final tournament" is the group stage - test before the bare "final".
  if (s.includes('final tournament')) return 'GROUP'
  if (s.includes('round of 32')) return 'R32'
  if (s.includes('round of 16')) return 'R16'
  if (s.includes('quarter')) return 'QF'
  if (s.includes('semi')) return 'SF'
  if (s.includes('third')) return 'THIRD_PLACE'
  if (s.includes('final')) return 'FINAL'
  return 'GROUP'
}

function toTeam(team: UefaTeam | null | undefined): Team {
  return {
    name: team?.internationalName || 'TBD',
    code: team?.countryCode ?? null,
    crest: team?.bigLogoUrl ?? null,
    providerTeamId: team?.id ?? null,
  }
}

export function normalizeUefaMatch(m: UefaMatch): NormalizedMatch {
  const total = m.score?.total
  const penalty = m.score?.penalty
  const score: Score = { fullTime: { home: total?.home ?? null, away: total?.away ?? null } }
  if (((penalty?.home ?? 0) + (penalty?.away ?? 0)) > 0) {
    score.penalties = { home: penalty?.home ?? null, away: penalty?.away ?? null }
  }

  const stage = mapUefaStage(m.round?.metaData?.name)
  const groupName = m.group?.metaData?.groupName ?? null
  const mdMatch = /^MD(\d+)$/.exec(m.matchday?.name ?? '')

  let winner: Winner = null
  const winnerTeamId = m.winner?.match?.team?.id ?? null
  if (winnerTeamId && winnerTeamId === m.homeTeam?.id) winner = 'HOME'
  else if (winnerTeamId && winnerTeamId === m.awayTeam?.id) winner = 'AWAY'
  else if (total?.home != null && total.home === total.away) winner = 'DRAW'

  return {
    providerMatchId: m.id,
    providerStageId: m.round?.id ?? null,
    stage,
    group: groupName ? (groupName.match(/([A-L])\s*$/i)?.[1]?.toUpperCase() ?? null) : null,
    matchday: stage === 'GROUP' && mdMatch ? Number(mdMatch[1]) : null,
    homeTeam: toTeam(m.homeTeam),
    awayTeam: toTeam(m.awayTeam),
    kickoffTime: m.kickOffTime?.dateTime ?? '',
    status: mapUefaStatus(m.status),
    score,
    winner,
  }
}

export interface UefaOptions {
  seasonYear: string
  competitionId?: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  rateLimiter?: RateLimiter
}

const DEFAULT_BASE_URL = 'https://match.uefa.com'

export function uefaProvider(options: UefaOptions): MatchDataProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const competitionId = options.competitionId ?? '3' // EURO
  const doFetch = options.fetchImpl ?? fetch
  const limiter = options.rateLimiter ?? new RateLimiter(1000)

  async function fetchAll(): Promise<NormalizedMatch[]> {
    const out: NormalizedMatch[] = []
    const limit = 100
    for (let offset = 0; ; offset += limit) {
      await limiter.acquire()
      const response = await doFetch(
        `${baseUrl}/v5/matches?competitionId=${competitionId}&seasonYear=${options.seasonYear}&limit=${limit}&offset=${offset}`,
        { headers: { 'user-agent': 'Mozilla/5.0' } },
      )
      if (response.status === 429) throw new ProviderRateLimitError()
      if (!response.ok) throw new ProviderUpstreamError(response.status, await response.text())
      const page = (await response.json()) as UefaMatch[]
      // Only the final tournament - qualifying play-offs share the season.
      out.push(...page.filter((m) => m.matchday?.phase === 'TOURNAMENT').map(normalizeUefaMatch))
      if (page.length < limit) break
    }
    return out
  }

  return {
    meta: { name: 'uefa', rateLimitPerMin: 60, dailyCap: null },
    listFixtures(_opts: ListFixturesOptions) {
      return fetchAll()
    },
    async getMatchesByDate(date: string) {
      return (await fetchAll()).filter((m) => m.kickoffTime.startsWith(date))
    },
    async getLiveMatches() {
      return (await fetchAll()).filter((m) => m.status === 'LIVE' || m.status === 'PAUSED')
    },
  }
}
