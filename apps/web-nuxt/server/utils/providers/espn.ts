import type { MatchStatus, NormalizedMatch, Score, ScorePair, Team, Winner } from '../../../shared/types/match'
import { RateLimiter } from './rate-limiter'
import { mapStageFromName } from './stage'
import { ProviderRateLimitError, ProviderUpstreamError, type ListFixturesOptions, type MatchDataProvider } from './types'

// ESPN's public site API - keyless, undocumented, no announced quota.
// e.g. https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=2026
// One request returns a whole tournament (104 events for the 2026 World Cup),
// so a fixtures sync costs one call plus one for the group letters.

export interface EspnTeam {
  id?: string | null
  displayName?: string | null
  shortDisplayName?: string | null
  abbreviation?: string | null
  logo?: string | null
}

export interface EspnCompetitor {
  homeAway?: string | null
  score?: string | null
  winner?: boolean | null
  shootoutScore?: number | null
  team?: EspnTeam | null
}

export interface EspnDetail {
  scoringPlay?: boolean | null
  shootout?: boolean | null
  scoreValue?: number | null
  clock?: { displayValue?: string | null } | null
  team?: { id?: string | null } | null
}

export interface EspnStatus {
  period?: number | null
  type?: {
    name?: string | null
    state?: string | null
    completed?: boolean | null
  } | null
}

export interface EspnCompetition {
  date?: string | null
  status?: EspnStatus | null
  competitors?: EspnCompetitor[] | null
  details?: EspnDetail[] | null
}

export interface EspnEvent {
  id: string
  date?: string | null
  season?: { slug?: string | null } | null
  competitions?: EspnCompetition[] | null
}

// Names that mean "in play but the clock is stopped". Anything else in the
// `in` state is treated as running - an unknown name must never read as final.
const PAUSED_STATUS_NAMES = new Set([
  'STATUS_HALFTIME',
  'STATUS_EXTRA_TIME_HALFTIME',
  'STATUS_END_PERIOD',
  'STATUS_END_OF_PERIOD',
  'STATUS_INTERMISSION',
])

const POST_STATUS_NAMES: Record<string, MatchStatus> = {
  STATUS_POSTPONED: 'POSTPONED',
  STATUS_CANCELED: 'CANCELLED',
  STATUS_CANCELLED: 'CANCELLED',
  STATUS_ABANDONED: 'CANCELLED',
  STATUS_SUSPENDED: 'SUSPENDED',
  STATUS_FORFEIT: 'AWARDED',
}

// ESPN announces a postponed or abandoned match as `post`, exactly like a
// finished one - reading the state alone would show a full-time card for a
// match that never kicked off, so the name decides inside `post`.
export function mapEspnStatus(status: EspnStatus | null | undefined): MatchStatus {
  const type = status?.type ?? {}
  const name = type.name ?? ''

  if (type.state === 'pre') return 'SCHEDULED'
  if (type.state === 'in') return PAUSED_STATUS_NAMES.has(name) ? 'PAUSED' : 'LIVE'
  if (type.state === 'post') {
    const mapped = POST_STATUS_NAMES[name]
    if (mapped) return mapped
    return type.completed ? 'FINISHED' : 'SUSPENDED'
  }
  return 'SCHEDULED'
}

// `season.slug` carries the round: group-stage, round-of-32, quarterfinals,
// 3rd-place-match, final... Hyphens out, and the shared ladder reads it.
export function mapEspnStage(slug: string | null | undefined) {
  return mapStageFromName((slug ?? '').replace(/-/g, ' '))
}

// Strict on purpose: the standings children of a domestic league are named
// after the league ("Premier League"), and a trailing-letter match would read
// that as group E.
export function parseEspnGroupName(name: string | null | undefined): string | null {
  return name?.match(/^group\s+([a-l])$/i)?.[1]?.toUpperCase() ?? null
}

// "23'", "45'+2'", "90'+6'" - the leading number is the minute.
export function espnMinute(clock: string | null | undefined): number | null {
  const found = String(clock ?? '').match(/(\d+)/)
  return found ? Number(found[1]) : null
}

function toTeam(team: EspnTeam | null | undefined): Team {
  return {
    name: team?.displayName ?? team?.shortDisplayName ?? 'TBD',
    code: team?.abbreviation ?? null,
    crest: team?.logo ?? null,
    providerTeamId: team?.id != null ? String(team.id) : null,
  }
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// Goals up to the break, summed off `details`. ESPN credits an own goal to the
// side it benefits, so no side-swap is needed here. Without a home team id
// there is no way to tell the sides apart, so nothing is claimed.
function halfTimeFrom(details: EspnDetail[], homeTeamId: string | null): ScorePair | null {
  if (homeTeamId == null) return null

  const pair = { home: 0, away: 0 }
  for (const goal of details) {
    if (!goal.scoringPlay || goal.shootout) continue
    const minute = espnMinute(goal.clock?.displayValue)
    if (minute == null || minute > 45) continue
    const side = goal.team?.id === homeTeamId ? 'home' : 'away'
    pair[side] += goal.scoreValue ?? 1
  }
  return pair
}

export function normalizeEspnEvent(event: EspnEvent, groups?: Map<string, string>): NormalizedMatch | null {
  const competition = event.competitions?.[0]
  const competitors = competition?.competitors ?? []
  if (!competition || competitors.length < 2) return null

  const home = competitors.find((c) => c.homeAway === 'home') ?? competitors[0]
  const away = competitors.find((c) => c.homeAway === 'away') ?? competitors[1]

  const status = mapEspnStatus(competition.status)
  const started = status !== 'SCHEDULED'

  // A scheduled match reports score "0" on both sides - writing that through
  // would stamp every unplayed fixture 0-0.
  const score: Score = {
    fullTime: {
      home: started ? toNumber(home.score) : null,
      away: started ? toNumber(away.score) : null,
    },
  }

  const homePens = home.shootoutScore
  const awayPens = away.shootoutScore
  if (homePens != null || awayPens != null) {
    score.penalties = { home: homePens ?? null, away: awayPens ?? null }
  }

  const period = competition.status?.period ?? 0
  if (started && (period >= 2 || status === 'FINISHED')) {
    const halfTime = halfTimeFrom(competition.details ?? [], home.team?.id ?? null)
    if (halfTime) score.halfTime = halfTime
  }

  let winner: Winner = null
  if (home.winner) winner = 'HOME'
  else if (away.winner) winner = 'AWAY'
  else if (status === 'FINISHED') winner = 'DRAW'

  const homeTeamId = home.team?.id
  const group = homeTeamId != null ? (groups?.get(String(homeTeamId)) ?? null) : null

  return {
    providerMatchId: String(event.id),
    stage: mapEspnStage(event.season?.slug),
    group,
    matchday: null,
    homeTeam: toTeam(home.team),
    awayTeam: toTeam(away.team),
    kickoffTime: competition.date ?? event.date ?? '',
    status,
    score,
    winner,
  }
}

interface EspnScoreboard {
  events?: EspnEvent[] | null
}

interface EspnStandings {
  children?:
    | {
        name?: string | null
        abbreviation?: string | null
        standings?: { entries?: { team?: { id?: string | null } | null }[] | null } | null
      }[]
    | null
}

export interface EspnOptions {
  league: string
  season?: string | null
  baseUrl?: string
  standingsBaseUrl?: string
  fetchImpl?: typeof fetch
  rateLimiter?: RateLimiter
}

const DEFAULT_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer'
// Standings live on apis/v2, not apis/site/v2. The site path also answers 200,
// with an almost empty object - a wrong address that looks like a working one.
const DEFAULT_STANDINGS_BASE_URL = 'https://site.api.espn.com/apis/v2/sports/soccer'

// An Akamai in front of the API 403s on the User-Agent, in HTML rather than
// JSON. Branded and browser-shaped agents are refused; a plain tool agent passes.
const USER_AGENT = 'curl/8.0'

export function espnProvider(options: EspnOptions): MatchDataProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const standingsBaseUrl = options.standingsBaseUrl ?? DEFAULT_STANDINGS_BASE_URL
  const league = options.league
  const doFetch = options.fetchImpl ?? fetch
  const limiter = options.rateLimiter ?? new RateLimiter(1000)

  async function getJson<T>(url: string): Promise<T> {
    await limiter.acquire()
    const response = await doFetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } })
    if (response.status === 429) throw new ProviderRateLimitError()
    if (!response.ok) throw new ProviderUpstreamError(response.status, await response.text())
    return (await response.json()) as T
  }

  let groupsCache: Promise<Map<string, string>> | null = null

  // The scoreboard has no group letter; the standings tree does, keyed by team.
  async function fetchGroups(): Promise<Map<string, string>> {
    const season = options.season
    const query = season ? `?season=${encodeURIComponent(season)}` : ''
    const data = await getJson<EspnStandings>(`${standingsBaseUrl}/${league}/standings${query}`)
    const byTeam = new Map<string, string>()
    for (const child of data.children ?? []) {
      const letter = parseEspnGroupName(child.abbreviation) ?? parseEspnGroupName(child.name)
      if (!letter) continue
      for (const entry of child.standings?.entries ?? []) {
        if (entry.team?.id != null) byTeam.set(String(entry.team.id), letter)
      }
    }
    return byTeam
  }

  function teamGroups(): Promise<Map<string, string>> {
    if (!groupsCache) {
      groupsCache = fetchGroups().catch(() => {
        // Group letters are a nicety; a standings outage must not fail the sync.
        groupsCache = null
        return new Map<string, string>()
      })
    }
    return groupsCache
  }

  async function fetchScoreboard(dates: string | null): Promise<NormalizedMatch[]> {
    const params = new URLSearchParams({ limit: '500' })
    if (dates) params.set('dates', dates)
    const data = await getJson<EspnScoreboard>(`${baseUrl}/${league}/scoreboard?${params}`)
    const events = data.events ?? []

    const bare = events.map((event) => normalizeEspnEvent(event)).filter((m): m is NormalizedMatch => m !== null)
    if (!bare.some((m) => m.stage === 'GROUP')) return bare

    const groups = await teamGroups()
    if (!groups.size) return bare
    return events.map((event) => normalizeEspnEvent(event, groups)).filter((m): m is NormalizedMatch => m !== null)
  }

  return {
    meta: { name: 'espn', rateLimitPerMin: 60, dailyCap: null },

    listFixtures({ season }: ListFixturesOptions) {
      // Without `dates` the scoreboard serves the current day only.
      return fetchScoreboard(options.season || season || null)
    },

    getMatchesByDate(date: string) {
      return fetchScoreboard(date.replace(/-/g, ''))
    },

    async getLiveMatches() {
      const today = await fetchScoreboard(null)
      return today.filter((m) => m.status === 'LIVE' || m.status === 'PAUSED')
    },
  }
}
