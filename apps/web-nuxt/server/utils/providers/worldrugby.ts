import type { AppStage, MatchStatus, NormalizedBracket, NormalizedMatch, Score, Team, Winner } from '../../../shared/types/match'
import { RateLimiter } from './rate-limiter'
import { bracketFromKnockoutMatches } from './bracket-order'
import {
  ProviderRateLimitError,
  ProviderUpstreamError,
  type DiscoveredCompetition,
  type ListFixturesOptions,
  type MatchDataProvider,
} from './types'

// World Rugby's own match API - the one rugbyworldcup.com and world.rugby run
// on (Pulselive RIMS), keyless.
// e.g. https://api.wr-rims-prod.pulselive.com/rugby/v3/event/{id}/schedule
//
// Preferred over ESPN's rugby feed because it is the official stream and it
// carries, in one place, the three things the app needs and ESPN does not hand
// over together: typed pool letters, a typed bronze final, and the World Rugby
// rankings that drive champion tiers.

const DEFAULT_BASE_URL = 'https://api.wr-rims-prod.pulselive.com/rugby/v3'

// The feed's sport codes. Union and sevens, men's / women's / age-grade; a
// competition binds to exactly one, and it is what discovery filters on.
export const WORLD_RUGBY_SPORTS = ['mru', 'wru', 'jmu', 'jwu', 'mrs', 'wrs', 'mjs', 'wjs'] as const
export type WorldRugbySport = (typeof WORLD_RUGBY_SPORTS)[number]

interface WrTeam {
  id?: string | null
  name?: string | null
  abbreviation?: string | null
  countryCode?: string | null
}

interface WrPhaseId {
  type?: string | null
  subType?: string | null
}

export interface WrMatch {
  matchId: string
  description?: string | null
  eventPhase?: string | null
  eventPhaseId?: WrPhaseId | null
  time?: { millis?: number | null; label?: string | null } | null
  status?: string | null
  teams?: WrTeam[] | null
  scores?: number[] | null
  sport?: string | null
  competition?: string | null
}

interface WrEvent {
  id: string
  label?: string | null
  sport?: string | null
  start?: { label?: string | null } | null
  end?: { label?: string | null } | null
}

// Only C (complete) and U (upcoming) have been observed on the live feed - no
// match was in play while this was written. The in-play codes are mapped from
// the vocabulary the same Pulselive stack uses elsewhere, and anything
// unrecognised falls through to SCHEDULED rather than inventing a state: an
// unknown code must never read as FINISHED, which would score a match early.
const STATUS: Record<string, MatchStatus> = {
  U: 'SCHEDULED',
  PRE: 'SCHEDULED',
  L: 'LIVE',
  L1: 'LIVE',
  L2: 'LIVE',
  LIVE: 'LIVE',
  HT: 'PAUSED',
  FT: 'FINISHED',
  C: 'FINISHED',
  COMPLETE: 'FINISHED',
  A: 'CANCELLED',
  CANCELLED: 'CANCELLED',
  POSTPONED: 'POSTPONED',
}

export function mapWorldRugbyStatus(status: string | null | undefined): MatchStatus {
  if (!status) return 'SCHEDULED'
  return STATUS[status.toUpperCase()] ?? 'SCHEDULED'
}

// The 2027 Rugby World Cup expands to 24 teams and adds a round of 16, and
// those eight matches arrive with eventPhaseId null - only the eventPhase label
// says what they are. So the typed field is authoritative when present and the
// label is the fallback, rather than the other way round.
export function mapWorldRugbyStage(phaseId: WrPhaseId | null | undefined, phaseLabel: string | null | undefined): AppStage {
  const type = phaseId?.type?.toLowerCase() ?? ''
  const sub = phaseId?.subType?.toLowerCase() ?? ''
  if (type === 'pool' || type === 'group') return 'GROUP'
  if (type === 'quarter') return 'QF'
  if (type === 'semi') return 'SF'
  if (type === 'final') return sub === 'bronze' ? 'THIRD_PLACE' : 'FINAL'

  const label = (phaseLabel ?? '').toLowerCase()
  if (/bronze|3rd place|third place/.test(label)) return 'THIRD_PLACE'
  if (/round of 16|last 16/.test(label)) return 'R16'
  if (/round of 32|last 32/.test(label)) return 'R32'
  if (/quarter/.test(label)) return 'QF'
  if (/semi/.test(label)) return 'SF'
  if (/^final|\bfinal\b/.test(label)) return 'FINAL'
  if (/pool|group/.test(label)) return 'GROUP'
  return 'GROUP'
}

// Pool letter lives in subType ("Pool A" -> subType "A"). Fall back to the
// label so a feed that stops typing pools still groups correctly - a null group
// silently drops every fixture at insert.
export function parseWorldRugbyGroup(phaseId: WrPhaseId | null | undefined, phaseLabel: string | null | undefined): string | null {
  const sub = phaseId?.subType?.trim()
  const type = phaseId?.type?.toLowerCase() ?? ''
  if ((type === 'pool' || type === 'group') && sub && /^[A-Za-z]$/.test(sub)) return sub.toUpperCase()
  const m = /(?:pool|group)\s+([A-Za-z])\b/i.exec(phaseLabel ?? '')
  return m ? m[1]!.toUpperCase() : null
}

function toTeam(team: WrTeam | null | undefined): Team {
  return {
    name: team?.name || 'TBD',
    code: team?.abbreviation ?? team?.countryCode ?? null,
    crest: null,
  }
}

function toScore(match: WrMatch, status: MatchStatus): Score {
  const started = status !== 'SCHEDULED' && status !== 'CANCELLED' && status !== 'POSTPONED'
  const home = match.scores?.[0]
  const away = match.scores?.[1]
  // A not-yet-played match reports [0, 0] rather than nulls, which would
  // otherwise read as a genuine goalless draw and settle predictions.
  const full = started && typeof home === 'number' && typeof away === 'number' ? { home, away } : { home: null, away: null }
  // No halfTime or penalties: the schedule document carries neither, and rugby
  // union has no shootout - a drawn knockout goes to extra time then a kicking
  // competition, which the feed reports in the running score.
  return { fullTime: full }
}

function toWinner(score: Score, status: MatchStatus): Winner {
  if (status !== 'FINISHED') return null
  const { home, away } = score.fullTime
  if (home === null || away === null) return null
  if (home > away) return 'HOME'
  if (away > home) return 'AWAY'
  return 'DRAW'
}

export function normalizeWorldRugbyMatch(match: WrMatch): NormalizedMatch {
  const status = mapWorldRugbyStatus(match.status)
  const score = toScore(match, status)
  const stage = mapWorldRugbyStage(match.eventPhaseId, match.eventPhase)
  const [home, away] = match.teams ?? []
  return {
    providerMatchId: String(match.matchId),
    stage,
    group: stage === 'GROUP' ? parseWorldRugbyGroup(match.eventPhaseId, match.eventPhase) : null,
    matchday: null,
    homeTeam: toTeam(home),
    awayTeam: toTeam(away),
    kickoffTime: new Date(match.time?.millis ?? 0).toISOString(),
    status,
    score,
    winner: toWinner(score, status),
  }
}

export interface WorldRugbyOptions {
  // The feed's event id: numeric for legacy seasons ("1893"), a uuid for 2025
  // onwards. Both resolve on the same route, so this stays opaque text.
  eventId: string
  sport?: WorldRugbySport | null
  baseUrl?: string
  fetchImpl?: typeof fetch
  rateLimiter?: RateLimiter
}

export function worldRugbyProvider(options: WorldRugbyOptions): MatchDataProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const eventId = options.eventId
  const sport = options.sport ?? 'mru'
  const doFetch = options.fetchImpl ?? fetch
  const limiter = options.rateLimiter ?? new RateLimiter(1000)

  async function getJson<T>(url: string): Promise<T> {
    await limiter.acquire()
    const response = await doFetch(url, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } })
    if (response.status === 429) throw new ProviderRateLimitError()
    if (!response.ok) throw new ProviderUpstreamError(response.status, await response.text())
    return (await response.json()) as T
  }

  async function schedule(): Promise<NormalizedMatch[]> {
    const doc = await getJson<{ matches?: WrMatch[] | null }>(
      `${baseUrl}/event/${encodeURIComponent(eventId)}/schedule?language=en`,
    )
    return (doc.matches ?? []).map(normalizeWorldRugbyMatch)
  }

  return {
    meta: { name: 'worldrugby', rateLimitPerMin: 60, dailyCap: null },

    async discoverCompetitions(): Promise<DiscoveredCompetition[]> {
      const out: DiscoveredCompetition[] = []
      // The catalog is ~2400 events deep and mostly historical. Newest first,
      // capped: the admin is choosing a season to run, not browsing an archive.
      for (let page = 0; page < 5; page++) {
        const doc = await getJson<{ content?: WrEvent[] | null; pageInfo?: { numPages?: number } | null }>(
          `${baseUrl}/event?page=${page}&pageSize=100&sort=desc`,
        )
        const content = doc.content ?? []
        for (const event of content) {
          // `sport` always has a value (mru by default), so this filters
          // always; an event the feed left untagged is kept rather than guessed.
          if (event.sport && event.sport.toLowerCase() !== sport) continue
          out.push({
            externalCompetitionId: String(event.id),
            name: event.label ?? String(event.id),
            seasonHint: event.start?.label?.slice(0, 4) ?? null,
            // The feed says nothing about shape, and guessing from the name is
            // exactly the kind of claim the dry-run probe exists to replace.
            isTournament: null,
          })
        }
        if (content.length === 0 || page + 1 >= (doc.pageInfo?.numPages ?? 0)) break
      }
      return out
    },

    // The whole tournament arrives in one document, so the season argument is
    // not a filter here - the event id already pins the season.
    async listFixtures(_opts: ListFixturesOptions): Promise<NormalizedMatch[]> {
      return await schedule()
    },

    async getMatchesByDate(date: string): Promise<NormalizedMatch[]> {
      const doc = await getJson<{ content?: WrMatch[] | null }>(
        `${baseUrl}/match?startDate=${encodeURIComponent(date)}&endDate=${encodeURIComponent(date)}&sort=asc&pageSize=100`,
      )
      return (doc.content ?? []).map(normalizeWorldRugbyMatch)
    },

    async getLiveMatches(): Promise<NormalizedMatch[]> {
      const all = await schedule()
      return all.filter((m) => m.status === 'LIVE' || m.status === 'PAUSED')
    },

    async getBracket(): Promise<NormalizedBracket | null> {
      const all = await schedule()
      const knockout = all.filter((m) => m.stage !== 'GROUP')
      if (knockout.length === 0) return null
      return bracketFromKnockoutMatches(knockout)
    },
  }
}
