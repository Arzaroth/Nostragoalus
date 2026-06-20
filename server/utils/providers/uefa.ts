import type {
  AppStage,
  BookingEvent,
  MatchDetail,
  SubstitutionEvent,
  MatchStatus,
  NormalizedGoal,
  NormalizedMatch,
  PeriodKind,
  Score,
  SquadPlayer,
  Team,
  TeamMatchStats,
  TeamSeasonStats,
  TimelineEvent,
  TimelineEventKind,
  TopScorer,
  Winner,
} from '../../../shared/types/match'
import { RateLimiter } from './rate-limiter'
import { mapStageFromName, parseGroupLetter } from './stage'
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
  matchAttendance?: number | null
  stadium?: { translations?: { name?: Record<string, string> | null } | null } | null
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
  return mapStageFromName(roundName)
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
    group: parseGroupLetter(groupName),
    matchday: stage === 'GROUP' && mdMatch ? Number(mdMatch[1]) : null,
    homeTeam: toTeam(m.homeTeam),
    awayTeam: toTeam(m.awayTeam),
    kickoffTime: m.kickOffTime?.dateTime ?? '',
    status: mapUefaStatus(m.status),
    score,
    winner,
  }
}

interface UefaEventPerson {
  id?: string | null
  internationalName?: string | null
  countryCode?: string | null
  // Coach actors nest one level deeper, with translated names only.
  person?: { id?: string | null; translations?: { name?: Record<string, string> | null } | null } | null
}

export interface UefaEvent {
  type?: string | null
  // Own goals and penalties are type 'GOAL' with subType 'OWN' / 'PENALTY'.
  subType?: string | null
  phase?: string | null
  time?: { minute?: number | null; injuryMinute?: number | null } | null
  // ISO instant - the only reliable chronological order (the final whistle and
  // some markers carry no minute).
  timestamp?: string | null
  // VAR decision messages ride ADDITIONAL_INFORMATION events as free text.
  freeText?: string | null
  primaryActor?: {
    type?: string | null
    person?: UefaEventPerson | null
    team?: { id?: string | null } | null
  } | null
  secondaryActor?: {
    person?: UefaEventPerson | null
  } | null
}

export function actorName(person: UefaEventPerson | null | undefined): string {
  return person?.internationalName ?? person?.person?.translations?.name?.EN ?? '?'
}

export function actorId(person: UefaEventPerson | null | undefined): string | null {
  return person?.id ?? person?.person?.id ?? null
}

export interface UefaMatchStatRow {
  teamId?: string | null
  statistics?: { name?: string | null; value?: string | null }[] | null
}

export function normalizeUefaMatchStats(row: UefaMatchStatRow): TeamMatchStats {
  const num = (name: string): number | null => {
    const v = (row.statistics ?? []).find((s) => s.name === name)?.value
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return {
    possession: num('ball_possession'),
    attempts: num('attempts'),
    onTarget: num('attempts_on_target'),
    passes: num('passes_attempted'),
    passesCompleted: num('passes_completed'),
    crosses: num('cross_attempted'),
    corners: num('corners'),
    fouls: num('fouls_committed'),
    offsides: num('offsides'),
    distanceKm: num('distance_covered'),
    pressuresApplied: null,
    forcedTurnovers: null,
  }
}

export interface UefaPlayerRow {
  id?: string | null
  internationalName?: string | null
  countryCode?: string | null
  nationalFieldPosition?: string | null
  fieldPosition?: string | null
  nationalJerseyNumber?: string | null
}

export interface UefaRankingRow {
  statistics?: { name?: string | null; value?: string | null }[] | null
  player?: { internationalName?: string | null } | null
  team?: { countryCode?: string | null; internationalName?: string | null } | null
}

export function eventMinute(e: UefaEvent): string | null {
  const minute = e.time?.minute
  if (minute == null) return null
  const injury = e.time?.injuryMinute
  return injury ? `${minute}'+${injury}` : `${minute}'`
}

export function mapUefaPosition(pos: string | null | undefined): SquadPlayer['position'] {
  switch (pos) {
    case 'GOALKEEPER':
      return 'GK'
    case 'DEFENDER':
      return 'DF'
    case 'MIDFIELDER':
      return 'MF'
    case 'FORWARD':
      return 'FW'
    default:
      return null
  }
}

const SHOT_TYPES = new Set(['GOAL', 'OWN_GOAL', 'SHOT_ON_GOAL', 'SHOT_WIDE', 'SHOT_BLOCKED'])
const ON_TARGET_TYPES = new Set(['GOAL', 'SHOT_ON_GOAL'])

export function aggregateUefaEvents(events: UefaEvent[], teamId: string | null): TeamMatchStats {
  const mine = events.filter(
    (e) => e.phase !== 'PENALTY_SHOOTOUT' && e.primaryActor?.team?.id != null && e.primaryActor.team.id === teamId,
  )
  const count = (pred: (t: string) => boolean) => mine.filter((e) => e.type != null && pred(e.type)).length
  return {
    possession: null,
    attempts: count((t) => SHOT_TYPES.has(t)),
    onTarget: count((t) => ON_TARGET_TYPES.has(t)),
    passes: null,
    passesCompleted: null,
    crosses: null,
    corners: count((t) => t === 'CORNER'),
    fouls: count((t) => t === 'FOUL'),
    offsides: count((t) => t === 'OFFSIDE'),
    distanceKm: null,
    pressuresApplied: null,
    forcedTurnovers: null,
  }
}

// START_PHASE / END_PHASE name the half in `phase`; map each to the period
// marker the localized client labels. CHANGE_PHASE duplicates START_PHASE at the
// same minute, so it's dropped.
const UEFA_PERIOD_START: Record<string, PeriodKind> = {
  FIRST_HALF: 'kickoff',
  SECOND_HALF: 'second-half',
  EXTRA_TIME_FIRST_HALF: 'extra-time',
  EXTRA_TIME_SECOND_HALF: 'extra-time',
}
const UEFA_PERIOD_END: Record<string, PeriodKind> = {
  FIRST_HALF: 'half-time',
  SECOND_HALF: 'second-half-end',
  EXTRA_TIME_FIRST_HALF: 'extra-time-end',
  EXTRA_TIME_SECOND_HALF: 'extra-time-end',
}

// UEFA's events feed ships no ready commentary, so the client phrases each line
// from the structured kind + names (the `pbp.*` i18n keys). The one exception is
// the VAR decision, which can't be rebuilt from structure: it rides a separate
// ADDITIONAL_INFORMATION event as free text (English-only), surfaced when the
// request locale is English - mirroring the FIFA path. The bare VAR review-step
// markers carry no text and would duplicate the decision, so they're dropped.
export function normalizeUefaTimeline(
  events: UefaEvent[],
  homeId?: string | null,
  awayId?: string | null,
  language?: string | null,
): TimelineEvent[] {
  const sideOf = (e: UefaEvent): 'HOME' | 'AWAY' | null => {
    const tid = e.primaryActor?.team?.id ?? null
    if (tid && tid === homeId) return 'HOME'
    if (tid && tid === awayId) return 'AWAY'
    return null
  }
  const mk = (
    kind: TimelineEventKind,
    side: 'HOME' | 'AWAY' | null,
    e: UefaEvent,
    over: Partial<TimelineEvent> = {},
  ): TimelineEvent => ({
    kind,
    side,
    minute: eventMinute(e),
    playerName: null,
    playerInName: null,
    playerOutName: null,
    periodKind: null,
    text: null,
    homeScore: null,
    awayScore: null,
    ...over,
  })

  const out: TimelineEvent[] = []
  let home = 0
  let away = 0
  const yellowsSeen = new Set<string>()
  // Ascending so the running score and second-yellow tracking accrue correctly;
  // reversed to newest-first at the end (what the UI renders). UEFA stamps the
  // FINAL score on every goal, so the running score is counted here, not read.
  // Stable: an event with no parseable timestamp (the final whistle and some
  // markers) carries the previous event's time so it holds its feed position
  // instead of jumping to the front, and the feed index breaks ties so
  // co-incident events (a goal and its assist) keep their feed order.
  let carriedTs = 0
  const ordered = events
    .map((e, idx) => {
      const t = e.timestamp ? Date.parse(e.timestamp) : NaN
      const ts = Number.isNaN(t) ? carriedTs : (carriedTs = t)
      return { e, ts, idx }
    })
    .sort((a, b) => a.ts - b.ts || a.idx - b.idx)
    .map((d) => d.e)
  for (const e of ordered) {
    switch (e.type) {
      case 'GOAL':
      case 'OWN_GOAL': {
        if (e.phase === 'PENALTY_SHOOTOUT') break
        const actor = sideOf(e)
        if (!actor) break
        const own = e.type === 'OWN_GOAL' || e.subType === 'OWN'
        const side = own ? (actor === 'HOME' ? 'AWAY' : 'HOME') : actor
        if (side === 'HOME') home++
        else away++
        const kind: TimelineEventKind = own ? 'own-goal' : e.subType === 'PENALTY' ? 'penalty-goal' : 'goal'
        out.push(mk(kind, side, e, { playerName: actorName(e.primaryActor?.person), homeScore: home, awayScore: away }))
        break
      }
      case 'ASSIST': {
        const side = sideOf(e)
        if (side) out.push(mk('assist', side, e, { playerName: actorName(e.primaryActor?.person) }))
        break
      }
      case 'YELLOW_CARD': {
        const side = sideOf(e)
        if (!side) break
        const id = actorId(e.primaryActor?.person)
        // A player's second booking is a sending-off even when the feed sends a
        // plain YELLOW_CARD rather than the explicit second-yellow type.
        let kind: TimelineEventKind = 'yellow'
        if (id) {
          if (yellowsSeen.has(id)) kind = 'second-yellow'
          yellowsSeen.add(id)
        }
        out.push(mk(kind, side, e, { playerName: actorName(e.primaryActor?.person) }))
        break
      }
      case 'YELLOW_CARD_SECOND': {
        const side = sideOf(e)
        if (side) out.push(mk('second-yellow', side, e, { playerName: actorName(e.primaryActor?.person) }))
        break
      }
      case 'RED_CARD': {
        const side = sideOf(e)
        if (side) out.push(mk('red', side, e, { playerName: actorName(e.primaryActor?.person) }))
        break
      }
      case 'SUBSTITUTION': {
        const side = sideOf(e)
        if (!side) break
        // primaryActor is the player going off, secondaryActor the one coming on.
        out.push(
          mk('sub', side, e, {
            playerOutName: actorName(e.primaryActor?.person),
            playerInName: e.secondaryActor?.person ? actorName(e.secondaryActor.person) : null,
          }),
        )
        break
      }
      case 'SHOT_ON_GOAL':
      case 'SHOT_WIDE':
      case 'SHOT_BLOCKED': {
        const side = sideOf(e)
        if (side) out.push(mk('shot', side, e, { playerName: actorName(e.primaryActor?.person) }))
        break
      }
      case 'FOUL': {
        const side = sideOf(e)
        if (side) out.push(mk('foul', side, e, { playerName: actorName(e.primaryActor?.person) }))
        break
      }
      case 'CORNER': {
        const side = sideOf(e)
        if (side) out.push(mk('corner', side, e, { playerName: actorName(e.primaryActor?.person) }))
        break
      }
      case 'START_PHASE': {
        const pk = UEFA_PERIOD_START[e.phase ?? '']
        if (pk) out.push(mk('period', null, e, { periodKind: pk }))
        break
      }
      case 'END_PHASE': {
        const pk = UEFA_PERIOD_END[e.phase ?? '']
        if (pk) out.push(mk('period', null, e, { periodKind: pk }))
        break
      }
      case 'FULL_TIME': {
        out.push(mk('period', null, e, { periodKind: 'full-time' }))
        break
      }
      case 'ADDITIONAL_INFORMATION': {
        const raw = (e.freeText ?? '').replace(/\s+/g, ' ').trim()
        // The standing "VAR messages shown in grey" notice is not a decision.
        if (!raw || raw.includes('SHOWN IN GREY')) break
        out.push(mk('var', null, e, { text: language === 'en' ? raw : null }))
        break
      }
      default:
        break
    }
  }
  return out.reverse()
}

function statValue(row: UefaRankingRow, name: string): number | null {
  const v = (row.statistics ?? []).find((s) => s.name === name)?.value
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export interface UefaOptions {
  seasonYear: string
  competitionId?: string
  baseUrl?: string
  statsBaseUrl?: string
  matchStatsBaseUrl?: string
  compBaseUrl?: string
  fetchImpl?: typeof fetch
  rateLimiter?: RateLimiter
}

const DEFAULT_BASE_URL = 'https://match.uefa.com'
const DEFAULT_STATS_BASE_URL = 'https://compstats.uefa.com'
const DEFAULT_MATCH_STATS_BASE_URL = 'https://matchstats.uefa.com'
const DEFAULT_COMP_BASE_URL = 'https://comp.uefa.com'

export function uefaProvider(options: UefaOptions): MatchDataProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const statsBaseUrl = options.statsBaseUrl ?? DEFAULT_STATS_BASE_URL
  const matchStatsBaseUrl = options.matchStatsBaseUrl ?? DEFAULT_MATCH_STATS_BASE_URL
  const compBaseUrl = options.compBaseUrl ?? DEFAULT_COMP_BASE_URL
  const competitionId = options.competitionId ?? '3' // EURO
  const doFetch = options.fetchImpl ?? fetch
  const limiter = options.rateLimiter ?? new RateLimiter(1000)

  async function getJson<T>(url: string): Promise<T> {
    await limiter.acquire()
    const response = await doFetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })
    if (response.status === 429) throw new ProviderRateLimitError()
    if (!response.ok) throw new ProviderUpstreamError(response.status, await response.text())
    return (await response.json()) as T
  }

  function fetchEvents(matchId: string) {
    return getJson<UefaEvent[]>(`${baseUrl}/v5/matches/${matchId}/events?filter=ALL&limit=500&offset=0`)
  }

  // The official per-match team statistics feed (what uefa.com's match centre shows).
  async function fetchMatchStats(matchId: string): Promise<Record<string, TeamMatchStats> | null> {
    try {
      const rows = await getJson<UefaMatchStatRow[]>(`${matchStatsBaseUrl}/v1/team-statistics/${matchId}`)
      const out: Record<string, TeamMatchStats> = {}
      for (const row of rows) {
        if (row.teamId) out[row.teamId] = normalizeUefaMatchStats(row)
      }
      return Object.keys(out).length ? out : null
    } catch {
      return null
    }
  }

  async function fetchRanking(kind: 'player-ranking' | 'team-ranking', stats: string, limit: number, offset = 0) {
    return getJson<UefaRankingRow[]>(
      `${statsBaseUrl}/v1/${kind}?competitionId=${competitionId}&seasonYear=${options.seasonYear}&phase=TOURNAMENT&stats=${stats}&order=DESC&limit=${limit}&offset=${offset}&optionalFields=PLAYER,TEAM`,
    )
  }

  async function fetchScorerRanking(): Promise<TopScorer[]> {
    // Page the whole ranking - cutting at one page loses every player past ~200.
    const rows: UefaRankingRow[] = []
    const pageSize = 200
    for (let offset = 0; ; offset += pageSize) {
      const page = await fetchRanking('player-ranking', 'goals,assists', pageSize, offset)
      rows.push(...page)
      if (page.length < pageSize) break
    }
    return rows.map((r) => ({
      playerName: r.player?.internationalName ?? '?',
      teamName: r.team?.internationalName ?? '?',
      teamCode: r.team?.countryCode ?? null,
      goals: statValue(r, 'goals') ?? 0,
      assists: statValue(r, 'assists'),
      penalties: null,
    }))
  }

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

    async getMatchDetail({ matchId }: { stageId?: string; matchId: string }): Promise<MatchDetail | null> {
      const m = await getJson<UefaMatch | null>(`${baseUrl}/v5/matches/${matchId}`)
      if (!m) return null
      let events: UefaEvent[] = []
      try {
        events = await fetchEvents(matchId)
      } catch {
        // events are richer but optional - the match doc alone still yields a detail
      }
      const homeId = m.homeTeam?.id ?? null
      const awayId = m.awayTeam?.id ?? null
      const sideOf = (e: UefaEvent): 'HOME' | 'AWAY' | null => {
        const tid = e.primaryActor?.team?.id ?? null
        if (tid && tid === homeId) return 'HOME'
        if (tid && tid === awayId) return 'AWAY'
        return null
      }
      const teamFor = (side: 'HOME' | 'AWAY') => (side === 'HOME' ? m.homeTeam : m.awayTeam)

      // The assist is its own ASSIST event (the goal event's secondaryActor is
      // the beaten goalkeeper, not the assister). Pair them by match minute -
      // each goal consumes at most one assist at that minute; penalties have none.
      const minuteKey = (e: UefaEvent) => `${e.time?.minute ?? ''}:${e.time?.injuryMinute ?? ''}`
      const assistsByMinute = new Map<string, UefaEvent[]>()
      for (const e of events) {
        if (e.type !== 'ASSIST') continue
        const bucket = assistsByMinute.get(minuteKey(e)) ?? []
        bucket.push(e)
        assistsByMinute.set(minuteKey(e), bucket)
      }

      const goals: NormalizedGoal[] = []
      for (const e of events) {
        if ((e.type !== 'GOAL' && e.type !== 'OWN_GOAL') || e.phase === 'PENALTY_SHOOTOUT') continue
        const actorSide = sideOf(e)
        if (!actorSide) continue
        // UEFA marks own goals as a GOAL with subType 'OWN' (the legacy OWN_GOAL
        // type is kept for safety). Credit them to the opposite side of the scorer.
        const isOwnGoal = e.type === 'OWN_GOAL' || e.subType === 'OWN'
        const side = isOwnGoal ? (actorSide === 'HOME' ? 'AWAY' : 'HOME') : actorSide
        const team = teamFor(side)
        const assist = assistsByMinute.get(minuteKey(e))?.shift() ?? null
        goals.push({
          side,
          teamId: team?.id ?? null,
          teamName: team?.internationalName ?? '?',
          teamCode: team?.countryCode ?? null,
          playerId: actorId(e.primaryActor?.person),
          playerName: actorName(e.primaryActor?.person),
          minute: eventMinute(e),
          goalType: null,
          ownGoal: isOwnGoal,
          assistPlayerId: actorId(assist?.primaryActor?.person),
          assistPlayerName: assist?.primaryActor?.person ? actorName(assist.primaryActor.person) : null,
        })
      }

      const bookings: BookingEvent[] = []
      const yellowsSeen = new Set<string>()
      for (const e of events) {
        // RED_YELLOW_CARD is the dismissal paired with YELLOW_CARD_SECOND one
        // second earlier - keeping both would duplicate the same incident.
        if (e.type !== 'YELLOW_CARD' && e.type !== 'RED_CARD' && e.type !== 'YELLOW_CARD_SECOND') continue
        const side = sideOf(e)
        if (!side) continue
        const playerId = actorId(e.primaryActor?.person)
        let card: BookingEvent['card'] =
          e.type === 'RED_CARD' ? 'RED' : e.type === 'YELLOW_CARD_SECOND' ? 'SECOND_YELLOW' : 'YELLOW'
        if (e.type === 'YELLOW_CARD' && playerId) {
          if (yellowsSeen.has(playerId)) card = 'SECOND_YELLOW'
          yellowsSeen.add(playerId)
        }
        bookings.push({
          side,
          playerId,
          playerName: actorName(e.primaryActor?.person),
          minute: eventMinute(e),
          card,
          coach: e.primaryActor?.type === 'COACH',
        })
      }
      const substitutions: SubstitutionEvent[] = []
      for (const e of events) {
        if (e.type !== 'SUBSTITUTION') continue
        const side = sideOf(e)
        if (!side) continue
        substitutions.push({
          side,
          minute: eventMinute(e),
          playerOffId: actorId(e.primaryActor?.person),
          playerOffName: actorName(e.primaryActor?.person),
          playerOnId: actorId(e.secondaryActor?.person),
          playerOnName: e.secondaryActor?.person ? actorName(e.secondaryActor.person) : '?',
        })
      }

      // The events feed arrives newest-first - present both lists chronologically.
      const minuteRank = (min: string | null) => {
        const m = /^(\d+)'(?:\+(\d+))?/.exec(min ?? '')
        return m ? Number(m[1]) * 100 + Number(m[2] ?? 0) : -1
      }
      goals.sort((a, b) => minuteRank(a.minute) - minuteRank(b.minute))
      bookings.sort((a, b) => minuteRank(a.minute) - minuteRank(b.minute))
      substitutions.sort((a, b) => minuteRank(a.minute) - minuteRank(b.minute))

      const countCards = (side: 'HOME' | 'AWAY') => ({
        yellow: bookings.filter((b) => b.side === side && b.card !== 'RED').length,
        red: bookings.filter((b) => b.side === side && b.card !== 'YELLOW').length,
      })

      const statsByTeam = await fetchMatchStats(matchId)
      return {
        possessionHome: homeId ? (statsByTeam?.[homeId]?.possession ?? null) : null,
        possessionAway: awayId ? (statsByTeam?.[awayId]?.possession ?? null) : null,
        attendance: m.matchAttendance ?? null,
        stadium: m.stadium?.translations?.name?.EN ?? null,
        cards: { home: countCards('HOME'), away: countCards('AWAY') },
        goals,
        bookings,
        substitutions,
        // UEFA has no separate stats id - the match id doubles as the stats handle.
        ifesId: matchId,
        homeTeamId: homeId,
        awayTeamId: awayId,
      }
    },

    async getMatchTimeline({
      matchId,
      homeTeamId,
      awayTeamId,
      language,
    }: {
      matchId: string
      homeTeamId?: string | null
      awayTeamId?: string | null
      playerNames?: Record<string, string>
      language?: string | null
    }): Promise<TimelineEvent[]> {
      // UEFA embeds actor names in each event, so the playerNames map FIFA needs
      // to resolve ids is unused here.
      const events = await fetchEvents(matchId)
      return normalizeUefaTimeline(events, homeTeamId, awayTeamId, language)
    },

    async getMatchStats({ ifesId }: { ifesId: string }): Promise<Record<string, TeamMatchStats> | null> {
      const official = await fetchMatchStats(ifesId)
      if (official) return official
      // Fallback: rebuild what we can from the event stream.
      const m = await getJson<UefaMatch | null>(`${baseUrl}/v5/matches/${ifesId}`)
      if (!m) return null
      const events = await fetchEvents(ifesId)
      const out: Record<string, TeamMatchStats> = {}
      for (const team of [m.homeTeam, m.awayTeam]) {
        if (team?.id) out[team.id] = aggregateUefaEvents(events, team.id)
      }
      return out
    },

    getTopScorers(_opts: ListFixturesOptions) {
      return fetchScorerRanking()
    },

    async getBracket() {
      const all = await fetchAll()
      const KNOCKOUT_ORDER: AppStage[] = ['R32', 'R16', 'QF', 'SF', 'THIRD_PLACE', 'FINAL']
      const STAGE_LABELS: Record<string, string> = { R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-finals', SF: 'Semi-finals', THIRD_PLACE: 'Third place', FINAL: 'Final' }
      const byStage = new Map<AppStage, NormalizedMatch[]>()
      for (const m of all) {
        if (!KNOCKOUT_ORDER.includes(m.stage) || m.stage === 'THIRD_PLACE') continue
        byStage.set(m.stage, [...(byStage.get(m.stage) ?? []), m])
      }
      if (!byStage.has('FINAL')) return null

      const winnerCode = (m: NormalizedMatch) =>
        m.winner === 'HOME' ? m.homeTeam.code : m.winner === 'AWAY' ? m.awayTeam.code : null
      const toBracketMatch = (m: NormalizedMatch) => ({
        providerMatchId: m.providerMatchId,
        status: m.status,
        kickoffTime: m.kickoffTime,
        homeTeam: m.homeTeam.name,
        homeCode: m.homeTeam.code,
        awayTeam: m.awayTeam.name,
        awayCode: m.awayTeam.code,
        homeScore: m.score.fullTime.home,
        awayScore: m.score.fullTime.away,
        homePens: m.score.penalties?.home ?? null,
        awayPens: m.score.penalties?.away ?? null,
        winner: m.winner === 'HOME' || m.winner === 'AWAY' ? m.winner : null,
      })

      // Order each round so feeders sit above their parent: walk down from the
      // final, picking for each slot the earlier-round match won by that team.
      const stages = KNOCKOUT_ORDER.filter((s) => s !== 'THIRD_PLACE' && byStage.has(s))
      const ordered = new Map<AppStage, NormalizedMatch[]>()
      ordered.set('FINAL', byStage.get('FINAL')!)
      for (let i = stages.length - 2; i >= 0; i--) {
        const stage = stages[i]
        const pool = [...byStage.get(stage)!]
        const next: NormalizedMatch[] = []
        for (const parent of ordered.get(stages[i + 1])!) {
          for (const code of [parent.homeTeam.code, parent.awayTeam.code]) {
            const idx = pool.findIndex((m) => code != null && winnerCode(m) === code)
            if (idx >= 0) next.push(...pool.splice(idx, 1))
          }
        }
        // Undecided feeders (future tournaments) fall back to kickoff order.
        next.push(...pool.sort((a, b) => a.kickoffTime.localeCompare(b.kickoffTime)))
        ordered.set(stage, next)
      }

      const final = byStage.get('FINAL')![0]
      const champCode = winnerCode(final)
      return {
        winner: champCode ? { name: champCode === final.homeTeam.code ? final.homeTeam.name : final.awayTeam.name, code: champCode } : null,
        rounds: stages.map((s, i) => ({
          name: STAGE_LABELS[s],
          sequence: i + 1,
          matches: ordered.get(s)!.map(toBracketMatch),
        })),
      }
    },

    getPlayerStats(_opts: { teamId: string }) {
      return fetchScorerRanking()
    },

    async getTeamTournament({ teamRef }: { teamRef: string; matches: { stageId: string; matchId: string }[] }) {
      const squad: SquadPlayer[] = []
      const pageSize = 200
      for (let offset = 0; ; offset += pageSize) {
        const page = await getJson<UefaPlayerRow[]>(
          `${compBaseUrl}/v2/players?competitionId=${competitionId}&seasonYear=${options.seasonYear}&phase=TOURNAMENT&limit=${pageSize}&offset=${offset}`,
        )
        squad.push(
          ...page
            .filter((p) => p.countryCode === teamRef)
            .map((p) => ({
              playerId: p.id ?? '',
              name: p.internationalName ?? '?',
              shirtNumber: p.nationalJerseyNumber != null && p.nationalJerseyNumber !== '' ? Number(p.nationalJerseyNumber) : null,
              position: mapUefaPosition(p.nationalFieldPosition ?? p.fieldPosition),
              captain: false,
              // UEFA headshots are reconstructed from playerId (playerPhotoUrl).
              pictureUrl: null,
            })),
        )
        if (page.length < pageSize) break
      }

      let stats: TeamSeasonStats | null = null
      try {
        const rows = await fetchRanking(
          'team-ranking',
          'goals,goals_conceded,attempts,attempts_on_target,passes_attempted,passes_completed,ball_possession,corners,offsides,yellow_cards,red_cards',
          40,
        )
        const row = rows.find((r) => r.team?.countryCode === teamRef)
        if (row) {
          const passes = statValue(row, 'passes_attempted')
          const completed = statValue(row, 'passes_completed')
          stats = {
            goals: statValue(row, 'goals'),
            conceded: statValue(row, 'goals_conceded'),
            assists: null,
            possession: statValue(row, 'ball_possession'),
            attempts: statValue(row, 'attempts'),
            onTarget: statValue(row, 'attempts_on_target'),
            passes,
            passAccuracy: passes && completed != null ? Math.round((completed / passes) * 1000) / 10 : null,
            crosses: null,
            corners: statValue(row, 'corners'),
            offsides: statValue(row, 'offsides'),
            yellowCards: statValue(row, 'yellow_cards'),
            redCards: statValue(row, 'red_cards'),
          }
        }
      } catch {
        // season stats are optional - squad alone is still worth returning
      }

      return { squad, coach: null, stats }
    },
  }
}
