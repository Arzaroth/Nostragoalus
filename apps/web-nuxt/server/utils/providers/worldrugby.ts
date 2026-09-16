import type {
  AppStage,
  MatchDetail,
  MatchLineups,
  MatchStatus,
  NormalizedBracket,
  BookingEvent,
  NormalizedGoal,
  NormalizedMatch,
  Score,
  SquadPlayer,
  SubstitutionEvent,
  Team,
  TeamLineup,
  TeamMatchStats,
  TimelineEvent,
  TimelineEventKind,
  Winner,
} from '../../../shared/types/match'
import { RateLimiter } from './rate-limiter'
import { bracketFromKnockoutMatches } from './bracket-order'
import { assignMatchdays } from './stage'
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
// competition binds to exactly one, and it is what discovery filters on. The
// list lives in shared/sport.ts because the admin picker renders the same set -
// two copies had already drifted by two entries.
export type WorldRugbySport = string

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
  // The UUID the /event routes now require. `id` is the legacy numeric key: the
  // catalog still lists it, but addressing an event by it answers 400
  // ("Invalid UUID string"), so this is what a competition is bound to.
  altId?: string | null
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
  // "5th Place Final" and "Bronze Final" are finals of something else; only the
  // unqualified one is the competition's FINAL, and a second FINAL would be
  // treated as the real one by the bracket and the double-points rule.
  if (/\d(?:st|nd|rd|th) place/.test(label)) return 'GROUP'
  if (/^final\b|^grand final\b/.test(label)) return 'FINAL'
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
    // Empty, never epoch: `?? 0` dates an untimed fixture to 1970, which reads
    // as long past everywhere kickoff is compared to now - it would close the
    // competition's champion window (min(kickoffTime)) before it opened. The
    // provider drops the untimed ones rather than shipping a fake date.
    kickoffTime: match.time?.millis ? new Date(match.time.millis).toISOString() : '',
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

// /match/{id}/summary. `teamList.list` is the 23-man team sheet plus the head
// coach (the one entry with no number); `number` here is a numeric string, not
// the position code the same key holds in /event/{id}/squads. captainIds are
// altIds, not player ids.
interface WrSummary {
  teams?: {
    teamList?: {
      list?: { player?: { id?: string | null; altId?: string | null; name?: { display?: string | null } | null } | null; number?: string | number | null }[] | null
      captainIds?: string[] | null
    } | null
  }[] | null
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
// A fixture with no announced kickoff is not schedulable yet; it reappears on
// the next sync once the feed times it.
function timed(match: NormalizedMatch): boolean {
  return match.kickoffTime !== ''
}

export function worldRugbyMinute(secs: number | null | undefined): string | null {
  if (secs == null || secs < 0) return null
  return `${Math.floor(secs / 60) + 1}'`
}

// A try (or penalty try) is the play credited the way a goal is. The kicks are
// scores too, and every one of them is stored, but only a try counts towards the
// try board - the rest would turn it into a kickers board.
export function isTryEvent(event: WrTimelineEvent): boolean {
  return (event.group ?? '').toLowerCase() === 'try'
}

export function isScoringEvent(event: WrTimelineEvent): boolean {
  return typeof event.points === 'number' && event.points > 0
}

// Rugby plays get rugby kinds. The kicks are named events in their own right -
// a converted try is a try AND a conversion, two plays by two players, and
// collapsing them into one "goal" line loses the second. A missed conversion is
// reported too: at 2 points a game it decides matches.
// Per-player lookups are a gap filler, not a substitute for the squad document:
// they are serial behind the rate limiter, so an unbounded run of them would
// spend a minute inside one request and earn the 429 that empties the
// play-by-play. Six covers a realistic number of call-ups without that risk.
const MAX_PLAYER_LOOKUPS = 6

export function mapWorldRugbyTimelineKind(event: WrTimelineEvent): TimelineEventKind | null {
  const group = (event.group ?? '').toLowerCase()
  const type = (event.type ?? '').toLowerCase()
  if (group === 'try') return 'try'
  if (group === 'con') return 'conversion'
  if (group === 'pen') return 'penalty-kick'
  if (group === 'dg') return 'drop-goal'
  if (type === 'miss con') return 'conversion-missed'
  if (type === 'miss pen') return 'penalty-missed'
  if (type === 'yellow') return 'yellow'
  if (type === 'red') return 'red'
  if (type === 'sub on') return 'sub'
  return null
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
  const sport = (options.sport ?? 'mru').toLowerCase()
  const doFetch = options.fetchImpl ?? fetch
  const limiter = options.rateLimiter ?? new RateLimiter(1000)

  async function getJson<T>(url: string): Promise<T> {
    await limiter.acquire()
    const response = await doFetch(url, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } })
    if (response.status === 429) throw new ProviderRateLimitError()
    if (!response.ok) throw new ProviderUpstreamError(response.status, await response.text())
    return (await response.json()) as T
  }

  // Memoised per match for the life of the adapter: the timeline route asks for
  // the detail and then the timeline, and both read this document, so without it
  // every play-by-play request fetched the same thing twice - doubling the load
  // on an upstream that rate-limits.
  const timelines = new Map<string, Promise<WrTimelineEvent[]>>()
  function timelineOf(matchId: string): Promise<WrTimelineEvent[]> {
    const hit = timelines.get(matchId)
    if (hit) return hit
    const pending = fetchTimeline(matchId).catch((error) => {
      timelines.delete(matchId)
      throw error
    })
    timelines.set(matchId, pending)
    return pending
  }

  async function fetchTimeline(matchId: string): Promise<WrTimelineEvent[]> {
    const doc = await getJson<{ timeline?: WrTimelineEvent[] | null }>(
      `${baseUrl}/match/${encodeURIComponent(matchId)}/timeline?language=en`,
    )
    // Sorted by the clock, not left in feed order: the play-by-play is rendered
    // verbatim and the running score is accumulated in this order, so an
    // out-of-order feed would show a score that goes backwards. Stable within a
    // second, which is where a try and its conversion can land.
    return [...(doc.timeline ?? [])].sort((a, b) => (a.time?.secs ?? 0) - (b.time?.secs ?? 0))
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
    squadsPromise ??= (async () => {
      try {
        const doc = await getJson<{ squads?: WrSquadEntry[] | null }>(
          `${baseUrl}/event/${encodeURIComponent(await eventUuid())}/squads`,
        )
        return doc.squads ?? []
      } catch {
        // A tournament whose squads are not named yet answers with empty ones;
        // a failure here must not take the whole detail sync down with it.
        squadsPromise = null
        return []
      }
    })()
    return squadsPromise
  }

  // A scorer is not always in the tournament squad list: squads are the initial
  // selection, and a mid-tournament call-up who then scores is absent from it.
  // Those players used to reach goal_event with an empty name and rendered as a
  // blank row with a score beside it, so the gaps are filled one player at a
  // time from /player/{id}.
  const extraNames = new Map<string, string>()
  async function namesFor(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const known = await playerNames()
    // An empty squad map is not a gap, it is the whole tournament unnamed (RWC
    // 2027 answers 24 squads and 0 players). Filling that one player at a time
    // is the storm this cap exists to prevent, and it would buy a name for
    // every actor in the document rather than the few the list is missing.
    if (known.size === 0) return known
    const missing = [...new Set(ids)]
      .filter((id): id is string => !!id && !known.has(id) && !extraNames.has(id))
      .slice(0, MAX_PLAYER_LOOKUPS)
    for (const id of missing) {
      // The miss is remembered too, or an id the feed cannot resolve is paid
      // for again on every call - twice per play-by-play request alone.
      let name = ''
      try {
        const doc = await getJson<{ name?: { display?: string | null } | null }>(
          `${baseUrl}/player/${encodeURIComponent(id)}`,
        )
        name = doc.name?.display ?? ''
      } catch {
        // Leave it unnamed rather than fail the whole detail for one player.
      }
      extraNames.set(id, name)
    }
    return new Map([...known, ...extraNames])
  }

  // World Rugby moved the /event routes onto UUIDs: the catalog still lists the
  // legacy numeric key as `id`, but addressing an event by it now answers 400
  // ("Invalid UUID string"), which takes fixtures, squads, the bracket and the
  // line-ups down with it. Competitions bound before that migration hold the
  // numeric one, so it is swapped for the `altId` the catalog carries beside it.
  // Memoised, and only ever walked for a legacy binding - a UUID short-circuits.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  let eventUuidOnce: Promise<string> | null = null
  function eventUuid(): Promise<string> {
    eventUuidOnce ??= (async () => {
      if (UUID_RE.test(eventId)) return eventId
      try {
        for (let page = 0; page < 5; page++) {
          const doc = await getJson<{ content?: WrEvent[] | null; pageInfo?: { numPages?: number } | null }>(
            `${baseUrl}/event?page=${page}&pageSize=100&sort=desc`,
          )
          const content = doc.content ?? []
          // Found is an answer either way: an event carrying no altId will not
          // grow one on a later page, and paging on costs four rate-limited
          // round trips to arrive at the same fallback.
          const hit = content.find((e) => String(e.id) === eventId)
          if (hit) return hit.altId ? String(hit.altId) : eventId
          if (content.length === 0 || page + 1 >= (doc.pageInfo?.numPages ?? 0)) break
        }
      } catch {
        // Fall through: the upstream error on the real call is the better
        // message, and re-arm so a transient failure is not cached as "legacy".
        eventUuidOnce = null
      }
      return eventId
    })()
    return eventUuidOnce
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
      `${baseUrl}/event/${encodeURIComponent(await eventUuid())}/schedule?language=en`,
    )
    return (doc.matches ?? []).map((m) => normalizeWorldRugbyMatch(m, eventId)).filter(timed)
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
            externalCompetitionId: String(event.altId ?? event.id),
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
      // The feed numbers pools but not rounds within them, so the matchday is
      // derived by date within each pool, exactly as fifa.ts and espn.ts do.
      // Without it every pool fixture is GROUP with a null matchday, which
      // isIngestible rejects - the probe then drops the whole pool stage and
      // refuses to create the competition at all.
      return assignMatchdays(await schedule())
    },

    async getMatchesByDate(date: string): Promise<NormalizedMatch[]> {
      const doc = await getJson<{ content?: WrMatch[] | null }>(
        `${baseUrl}/match?startDate=${encodeURIComponent(date)}&endDate=${encodeURIComponent(date)}&sort=asc&pageSize=100`,
      )
      return (doc.content ?? []).map((m) => normalizeWorldRugbyMatch(m, eventId)).filter(timed)
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
      const [match, events] = await Promise.all([
        getJson<WrMatch>(`${baseUrl}/match/${encodeURIComponent(matchId)}`),
        timelineOf(matchId),
      ])
      const names = await namesFor(events.map((e) => e.playerId))
      const sides = [match.teams?.[0], match.teams?.[1]]
      const cards = { home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } }
      const bookings: BookingEvent[] = []
      const goals: NormalizedGoal[] = []
      const substitutions: SubstitutionEvent[] = []
      const subsOff = new Map<string, WrTimelineEvent>()

      for (const event of events) {
        // An entry the feed did not attribute is left alone rather than charged
        // to the home side, which would invent a card or a score for them.
        if (event.teamIndex !== 0 && event.teamIndex !== 1) continue
        const index = event.teamIndex
        const side = index === 1 ? ('AWAY' as const) : ('HOME' as const)
        const team = sides[index]
        const type = (event.type ?? '').toLowerCase()

        if (type === 'yellow' || type === 'red') {
          cards[side === 'HOME' ? 'home' : 'away'][type === 'red' ? 'red' : 'yellow'] += 1
          // Counting the card into `cards` is not the same as reporting it: the
          // match view lists bookings from here, so leaving this empty hid every
          // card in the game - a red card is usually the story of the match.
          bookings.push({
            side,
            playerId: event.playerId ?? null,
            playerName: (event.playerId && names.get(event.playerId)) || '',
            minute: worldRugbyMinute(event.time?.secs),
            card: type === 'red' ? 'RED' : 'YELLOW',
          })
        }

        // Every scoring play is stored, not just tries: the points board sums
        // them, and the try board counts the ones worth a try (see TRY_POINTS
        // in stats/scorers.ts). A try with no point value in the feed is still
        // a score, so it is kept - it just adds nothing to the points board.
        if (isScoringEvent(event) || isTryEvent(event)) {
          goals.push({
            side,
            teamId: team?.id ?? null,
            teamName: team?.name ?? '',
            teamCode: team?.abbreviation ?? null,
            playerId: event.playerId ?? null,
            playerName: (event.playerId && names.get(event.playerId)) || '',
            minute: worldRugbyMinute(event.time?.secs),
            goalType: null,
            points: Number.isSafeInteger(event.points) && (event.points as number) > 0 ? (event.points as number) : null,
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
      const pairedOff = new Set<string>()
      for (const event of events) {
        if ((event.type ?? '').toLowerCase() !== 'sub on') continue
        if (event.teamIndex !== 0 && event.teamIndex !== 1) continue
        const index = event.teamIndex
        const key = String(event.link ?? `${index}:${event.time?.secs ?? ''}`)
        const off = subsOff.get(key)
        if (off) pairedOff.add(key)
        substitutions.push({
          side: index === 1 ? 'AWAY' : 'HOME',
          minute: worldRugbyMinute(event.time?.secs),
          playerOffId: off?.playerId ?? null,
          playerOffName: (off?.playerId && names.get(off.playerId)) || '',
          playerOnId: event.playerId ?? null,
          playerOnName: (event.playerId && names.get(event.playerId)) || '',
        })
      }

      // A player who leaves and is not replaced (injury with no cover, a red
      // card) produces a Sub Off with no partner. Ship it rather than lose the
      // fact that they left the field.
      for (const [key, off] of subsOff) {
        if (pairedOff.has(key)) continue
        const index = off.teamIndex === 1 ? 1 : 0
        substitutions.push({
          side: index === 1 ? 'AWAY' : 'HOME',
          minute: worldRugbyMinute(off.time?.secs),
          playerOffId: off.playerId ?? null,
          playerOffName: (off.playerId && names.get(off.playerId)) || '',
          playerOnId: null,
          playerOnName: '',
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
        bookings,
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
      const events = await timelineOf(matchId)
      const names = await namesFor(events.map((e) => e.playerId))
      const out: TimelineEvent[] = []
      const running = [0, 0]

      for (const event of events) {
        if (event.teamIndex !== 0 && event.teamIndex !== 1) continue
        const index = event.teamIndex
        const side = index === 1 ? ('AWAY' as const) : ('HOME' as const)
        const type = (event.type ?? '').toLowerCase()
        if (typeof event.points === 'number' && event.points > 0) running[index] += event.points

        const kind = mapWorldRugbyTimelineKind(event)
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

    async getMatchLineups({ matchId }): Promise<MatchLineups | null> {
      const summary = await getJson<WrSummary>(`${baseUrl}/match/${encodeURIComponent(matchId)}/summary`)
      const sides = summary.teams ?? []
      const lineup = (index: number): TeamLineup => {
        const entry = sides[index]?.teamList
        const captains = new Set(entry?.captainIds ?? [])
        const named = (entry?.list ?? []).flatMap((row) => {
          const id = row.player?.id
          const name = row.player?.name?.display
          // The list carries the head coach with a null number alongside the 23.
          const shirt = Number(row.number)
          if (!id || !name || !row.number || !Number.isFinite(shirt)) return []
          return [{
            shirt,
            player: {
              playerId: String(id),
              name,
              shirtNumber: shirt,
              // Prop, Hooker, Lock, Flanker... none of which is GK/DF/MF/FW.
              // The label is dropped rather than forced into a football slot.
              position: null,
              captain: !!row.player?.altId && captains.has(row.player.altId),
              pictureUrl: null,
            } as SquadPlayer,
          }]
        })
        named.sort((a, b) => a.shirt - b.shirt)
        return {
          formation: null,
          // The coach is the entry with no shirt number.
          coach: (entry?.list ?? []).find((row) => !row.number)?.player?.name?.display ?? null,
          // 1-15 start, 16-23 are the bench: the numbering is the position in
          // rugby union, not a squad-list convention.
          startingXI: named.filter((p) => p.shirt <= 15).map((p) => p.player),
          bench: named.filter((p) => p.shirt > 15).map((p) => p.player),
        }
      }

      const home = lineup(0)
      const away = lineup(1)
      return {
        // Team sheets drop shortly before kickoff; until then the list is empty
        // and the UI must show nothing rather than half a side.
        available: home.startingXI.length > 0 && away.startingXI.length > 0,
        home,
        away,
      }
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
