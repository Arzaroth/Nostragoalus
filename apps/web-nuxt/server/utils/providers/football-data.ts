import type { NormalizedMatch, Score, ScorePair, Team, TopScorer, Winner } from '../../../shared/types/match'
import { mapFootballDataStage, mapFootballDataStatus, parseFootballDataGroup } from './status-map'
import { RateLimiter } from './rate-limiter'
import { ProviderRateLimitError, ProviderUpstreamError, type ListFixturesOptions, type MatchDataProvider } from './types'

interface FdScorePair {
  home?: number | null
  away?: number | null
}

interface FdTeam {
  id?: number | null
  name?: string | null
  tla?: string | null
  crest?: string | null
}

export interface FdMatch {
  id: number
  utcDate: string
  status: string
  matchday?: number | null
  stage: string
  group?: string | null
  lastUpdated?: string
  homeTeam?: FdTeam | null
  awayTeam?: FdTeam | null
  score?: {
    winner?: string | null
    fullTime?: FdScorePair
    halfTime?: FdScorePair
    extraTime?: FdScorePair
    penalties?: FdScorePair
  }
}

function toPair(pair: FdScorePair | undefined): ScorePair {
  return { home: pair?.home ?? null, away: pair?.away ?? null }
}

function toTeam(team: FdTeam | null | undefined): Team {
  return {
    name: team?.name ?? 'TBD',
    code: team?.tla ?? null,
    crest: team?.crest ?? null,
    providerTeamId: team?.id != null ? String(team.id) : null,
  }
}

function toWinner(winner: string | null | undefined): Winner {
  if (winner === 'HOME_TEAM') return 'HOME'
  if (winner === 'AWAY_TEAM') return 'AWAY'
  if (winner === 'DRAW') return 'DRAW'
  return null
}

export function normalizeFootballDataMatch(match: FdMatch): NormalizedMatch {
  const rawScore = match.score ?? {}
  const score: Score = { fullTime: toPair(rawScore.fullTime), halfTime: toPair(rawScore.halfTime) }
  if (rawScore.extraTime) score.extraTime = toPair(rawScore.extraTime)
  if (rawScore.penalties) score.penalties = toPair(rawScore.penalties)

  return {
    providerMatchId: String(match.id),
    stage: mapFootballDataStage(match.stage),
    group: parseFootballDataGroup(match.group),
    matchday: match.matchday ?? null,
    homeTeam: toTeam(match.homeTeam),
    awayTeam: toTeam(match.awayTeam),
    kickoffTime: match.utcDate,
    status: mapFootballDataStatus(match.status),
    score,
    winner: toWinner(rawScore.winner),
    lastUpdated: match.lastUpdated,
  }
}

interface FdScorer {
  player?: { name?: string | null }
  team?: { name?: string | null; tla?: string | null }
  goals?: number | null
  assists?: number | null
  penalties?: number | null
}

export function normalizeFdScorer(scorer: FdScorer): TopScorer {
  return {
    playerName: scorer.player?.name ?? 'Unknown',
    teamName: scorer.team?.name ?? '',
    teamCode: scorer.team?.tla ?? null,
    goals: scorer.goals ?? 0,
    assists: scorer.assists ?? null,
    penalties: scorer.penalties ?? null,
  }
}

export interface FootballDataOptions {
  token: string
  baseUrl?: string
  competition?: string
  fetchImpl?: typeof fetch
  rateLimiter?: RateLimiter
}

const DEFAULT_BASE_URL = 'https://api.football-data.org/v4'

export function footballDataProvider(options: FootballDataOptions): MatchDataProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const competition = options.competition ?? 'WC'
  const doFetch = options.fetchImpl ?? fetch
  const limiter = options.rateLimiter ?? new RateLimiter(6500)

  async function getMatches(query: string): Promise<NormalizedMatch[]> {
    await limiter.acquire()
    const response = await doFetch(`${baseUrl}/competitions/${competition}/matches${query}`, {
      headers: { 'X-Auth-Token': options.token },
    })

    if (response.status === 429) throw new ProviderRateLimitError()
    if (!response.ok) throw new ProviderUpstreamError(response.status, await response.text())

    const data = (await response.json()) as { matches?: FdMatch[] }
    return (data.matches ?? []).map(normalizeFootballDataMatch)
  }

  async function getScorers(season: string): Promise<TopScorer[]> {
    await limiter.acquire()
    const response = await doFetch(`${baseUrl}/competitions/${competition}/scorers?season=${season}&limit=20`, {
      headers: { 'X-Auth-Token': options.token },
    })
    if (response.status === 429) throw new ProviderRateLimitError()
    if (!response.ok) throw new ProviderUpstreamError(response.status, await response.text())
    const data = (await response.json()) as { scorers?: FdScorer[] }
    return (data.scorers ?? []).map(normalizeFdScorer)
  }

  return {
    meta: { name: 'football-data', rateLimitPerMin: 10, dailyCap: null },
    listFixtures: ({ season }: ListFixturesOptions) => getMatches(`?season=${season}`),
    getMatchesByDate: (date: string) => getMatches(`?dateFrom=${date}&dateTo=${date}`),
    getLiveMatches: () => getMatches('?status=IN_PLAY,PAUSED'),
    getTopScorers: ({ season }: ListFixturesOptions) => getScorers(season),
  }
}
