import type {
  AppStage,
  MatchDetail,
  MatchStatus,
  NormalizedBracket,
  NormalizedGoal,
  NormalizedMatch,
  Score,
  SquadPlayer,
  SubstitutionEvent,
  Team,
  TeamMatchStats,
  TimelineEvent,
  TimelineEventKind,
  Winner,
} from '../../../shared/types/match'
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
  attendance?: number | null
  venue?: { name?: string | null } | null
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

export function normalizeWorldRugbyMatch(match: WrMatch, eventId?: string): NormalizedMatch {
  const status = mapWorldRugbyStatus(match.status)
  const score = toScore(match, status)
  const stage = mapWorldRugbyStage(match.eventPhaseId, match.eventPhase)
  const [home, away] = match.teams ?? []
  return {
    providerMatchId: String(match.matchId),
    // The feed addresses a match by its own id alone, so there is no stage to
    // carry. The event id goes here anyway because the detail sync selects on
    // `providerStageId IS NOT NULL` - without it every rugby match is skipped
    // silently and no try ever reaches goal_event.
    providerStageId: eventId ?? null,
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

// One timeline entry. Scoring entries carry `points`; `teamIndex` is 0 for the
// home side and 1 for the away side, matching the order of `teams` and `scores`
// on the match itself.
export interface WrTimelineEvent {
  type?: string | null
  typeLabel?: string | null
  group?: string | null
  points?: number | null
  teamIndex?: number | null
  playerId?: string | null
  time?: { secs?: number | null } | null
  // Both halves of a substitution carry the same link id.
  link?: string | number | null
}

interface WrSquadEntry {
  team?: WrTeam | null
  players?: { player?: { id?: string | null; name?: { display?: string | null } | null } | null }[] | null
  // A management entry carries the person's fields inline, with `role` naming
  // the job ("Head Coach", "Scrum Coach", "Logistics Manager", ...).
  management?: { name?: { display?: string | null } | null; role?: string | null }[] | null
}

// Seconds from kick-off to a football-style minute label. 92s is 1:32, which is
// during the second minute, so it reads as 2'.
export function worldRugbyMinute(secs: number | null | undefined): string | null {
  if (secs == null || secs < 0) return null
  return `${Math.floor(secs / 60) + 1}'`
}

// Only a try is credited the way a goal is. Conversions and penalties are kicks,
// almost always by one specialist, so counting them would turn the scorers board
// into a kickers board - the local goal_event aggregation counts rows, not
// points. Their points still move the running score below.
export function isTryEvent(event: WrTimelineEvent): boolean {
  return (event.group ?? '').toLowerCase() === 'try'
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

  async function timelineOf(matchId: string): Promise<WrTimelineEvent[]> {
    const doc = await getJson<{ timeline?: WrTimelineEvent[] | null }>(
      `${baseUrl}/match/${encodeURIComponent(matchId)}/timeline?language=en`,
    )
    return doc.timeline ?? []
  }

  async function teamStatsOf(matchId: string): Promise<{ stats?: Record<string, unknown> | null }[]> {
    const doc = await getJson<{ teamStats?: { stats?: Record<string, unknown> | null }[] | null }>(
      `${baseUrl}/match/${encodeURIComponent(matchId)}/stats`,
    )
    return doc.teamStats ?? []
  }

  // One call for the whole tournament, memoised for the life of the adapter: it
  // serves both the squad list and the id -> name map every timeline needs, and
  // the alternative is a /player/{id} call per actor per match.
  let squadsPromise: Promise<WrSquadEntry[]> | null = null
  function squadsOnce(): Promise<WrSquadEntry[]> {
    squadsPromise ??= getJson<{ squads?: WrSquadEntry[] | null }>(
      `${baseUrl}/event/${encodeURIComponent(eventId)}/squads`,
    )
      .then((doc) => doc.squads ?? [])
      .catch(() => {
        // A tournament whose squads are not named yet answers with empty ones;
        // a failure here must not take the whole detail sync down with it.
        squadsPromise = null
        return []
      })
    return squadsPromise
  }

  async function playerNames(): Promise<Map<string, string>> {
    const names = new Map<string, string>()
    for (const squad of await squadsOnce()) {
      for (const entry of squad.players ?? []) {
        const id = entry.player?.id
        const name = entry.player?.name?.display
        if (id && name) names.set(String(id), name)
      }
    }
    return names
  }

  async function schedule(): Promise<NormalizedMatch[]> {
    const doc = await getJson<{ matches?: WrMatch[] | null }>(
      `${baseUrl}/event/${encodeURIComponent(eventId)}/schedule?language=en`,
    )
    return (doc.matches ?? []).map((m) => normalizeWorldRugbyMatch(m, eventId))
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
      return (doc.content ?? []).map((m) => normalizeWorldRugbyMatch(m, eventId))
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

    async getMatchDetail({ matchId }): Promise<MatchDetail | null> {
      const [match, events, names] = await Promise.all([
        getJson<WrMatch>(`${baseUrl}/match/${encodeURIComponent(matchId)}`),
        timelineOf(matchId),
        playerNames(),
      ])
      const sides = [match.teams?.[0], match.teams?.[1]]
      const cards = { home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } }
      const goals: NormalizedGoal[] = []
      const substitutions: SubstitutionEvent[] = []
      const subsOff = new Map<string, WrTimelineEvent>()

      for (const event of events) {
        const index = event.teamIndex === 1 ? 1 : 0
        const side = index === 1 ? ('AWAY' as const) : ('HOME' as const)
        const team = sides[index]
        const type = (event.type ?? '').toLowerCase()

        if (type === 'yellow') cards[side === 'HOME' ? 'home' : 'away'].yellow += 1
        else if (type === 'red') cards[side === 'HOME' ? 'home' : 'away'].red += 1

        if (isTryEvent(event)) {
          goals.push({
            side,
            teamId: team?.id ?? null,
            teamName: team?.name ?? '',
            teamCode: team?.abbreviation ?? null,
            playerId: event.playerId ?? null,
            playerName: (event.playerId && names.get(event.playerId)) || '',
            minute: worldRugbyMinute(event.time?.secs),
            goalType: event.points ?? null,
            ownGoal: false,
            assistPlayerId: null,
            assistPlayerName: null,
          })
        }

        if (type === 'sub off') subsOff.set(String(event.link ?? `${index}:${event.time?.secs ?? ''}`), event)
      }

      // Both halves of a swap carry the same `link`, and Sub On is emitted
      // before its Sub Off - so the pairing is a second pass, not a running map.
      // An unpaired one still ships (a blood replacement goes off and back on)
      // rather than being dropped.
      for (const event of events) {
        if ((event.type ?? '').toLowerCase() !== 'sub on') continue
        const index = event.teamIndex === 1 ? 1 : 0
        const off = subsOff.get(String(event.link ?? `${index}:${event.time?.secs ?? ''}`))
        substitutions.push({
          side: index === 1 ? 'AWAY' : 'HOME',
          minute: worldRugbyMinute(event.time?.secs),
          playerOffId: off?.playerId ?? null,
          playerOffName: (off?.playerId && names.get(off.playerId)) || '',
          playerOnId: event.playerId ?? null,
          playerOnName: (event.playerId && names.get(event.playerId)) || '',
        })
      }

      const stats = await teamStatsOf(matchId).catch(() => null)
      const possession = (i: number) => {
        const value = stats?.[i]?.stats?.Possession
        return typeof value === 'number' ? Math.round(value * 100) : null
      }

      return {
        possessionHome: possession(0),
        possessionAway: possession(1),
        attendance: typeof match.attendance === 'number' ? match.attendance : null,
        stadium: match.venue?.name ?? null,
        cards,
        goals,
        bookings: [],
        substitutions,
        playerNames: Object.fromEntries(names),
        homeTeamId: sides[0]?.id ?? null,
        awayTeamId: sides[1]?.id ?? null,
        // The per-match stats hang off the same match id, so this is what
        // getMatchStats is handed back.
        ifesId: String(match.matchId ?? matchId),
      }
    },

    async getMatchTimeline({ matchId }): Promise<TimelineEvent[]> {
      const [events, names] = await Promise.all([timelineOf(matchId), playerNames()])
      const out: TimelineEvent[] = []
      const running = [0, 0]

      for (const event of events) {
        const index = event.teamIndex === 1 ? 1 : 0
        const side = index === 1 ? ('AWAY' as const) : ('HOME' as const)
        const type = (event.type ?? '').toLowerCase()
        // Every scoring entry moves the running score, including the conversion
        // that does not get a line of its own.
        if (typeof event.points === 'number' && event.points > 0) running[index] += event.points

        const kind: TimelineEventKind | null = isTryEvent(event)
          ? 'goal'
          : (event.group ?? '').toLowerCase() === 'pen'
            ? 'penalty-goal'
            : (event.group ?? '').toLowerCase() === 'dg'
              ? 'goal'
              : type === 'yellow'
                ? 'yellow'
                : type === 'red'
                  ? 'red'
                  : type === 'sub on'
                    ? 'sub'
                    : null
        // Conversions have no line of their own: they follow a try by seconds
        // and would read as a second score for the same move. Their points are
        // already in the running score above.
        if (!kind) continue

        out.push({
          kind,
          side,
          minute: worldRugbyMinute(event.time?.secs),
          playerName: (event.playerId && names.get(event.playerId)) || null,
          playerInName: kind === 'sub' ? (event.playerId && names.get(event.playerId)) || null : null,
          playerOutName: null,
          periodKind: null,
          text: null,
          homeScore: running[0]!,
          awayScore: running[1]!,
        })
      }
      return out
    },

    async getMatchStats({ ifesId }): Promise<Record<string, TeamMatchStats> | null> {
      const [stats, match] = await Promise.all([
        teamStatsOf(ifesId),
        getJson<WrMatch>(`${baseUrl}/match/${encodeURIComponent(ifesId)}`),
      ])
      if (stats.length === 0) return null
      const out: Record<string, TeamMatchStats> = {}
      stats.forEach((entry, index) => {
        const teamId = match.teams?.[index]?.id
        if (!teamId) return
        const s = entry.stats ?? {}
        const num = (key: string) => (typeof s[key] === 'number' ? (s[key] as number) : null)
        const pct = (key: string) => (typeof s[key] === 'number' ? Math.round((s[key] as number) * 100) : null)
        out[teamId] = {
          possession: pct('Possession'),
          passes: num('Passes'),
          // The nearest honest analogues. The rest of this shape is football -
          // attempts, crosses, corners, offsides have no rugby counterpart, and
          // inventing one would be worse than leaving the row blank.
          fouls: num('PenaltiesConceded'),
          forcedTurnovers: num('TurnoversWon'),
          attempts: null,
          onTarget: null,
          passesCompleted: null,
          crosses: null,
          corners: null,
          offsides: null,
          distanceKm: null,
          pressuresApplied: null,
        }
      })
      return Object.keys(out).length > 0 ? out : null
    },

    async getTeamTournament({ teamRef }) {
      const squads = await squadsOnce()
      const entry = squads.find((sq) => sq.team?.abbreviation === teamRef)
      if (!entry) return { squad: [], coach: null, stats: null }

      const squad: SquadPlayer[] = (entry.players ?? []).flatMap((p) => {
        const id = p.player?.id
        const name = p.player?.name?.display
        if (!id || !name) return []
        return [{
          playerId: String(id),
          name,
          // The feed's `number` is a position code ("SR", "CE"), not a shirt
          // number - squad numbers are handed out per match, not per tournament,
          // so there is none to carry here.
          shirtNumber: null,
          // Deliberately null: the position enum is GK/DF/MF/FW, and a hooker is
          // none of them. The feed's positionLabel has nowhere to go until the
          // shape learns about rugby.
          position: null,
          captain: false,
          pictureUrl: null,
        }]
      })

      // Anchored: the roles also include "Head Strength & Conditioning Coach",
      // "Forwards Coach" and a dozen more.
      const head = (entry.management ?? []).find((m) => /^head coach$/i.test((m.role ?? '').trim()))
      return { squad, coach: head?.name?.display ?? null, stats: null }
    },
  }
}
