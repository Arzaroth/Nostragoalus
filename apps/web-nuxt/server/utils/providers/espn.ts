import type {
  MatchStatus,
  NormalizedMatch,
  Score,
  ScorePair,
  SquadPlayer,
  Team,
  TeamSeasonStats,
  TopScorer,
  Winner,
} from '../../../shared/types/match'
import { matchHasStarted } from '../../../shared/types/match'
import { bracketFromKnockoutMatches } from './bracket-order'
import {
  espnSummaryTeams,
  mapEspnPosition,
  parseEspnLineups,
  parseEspnMatchDetail,
  parseEspnMatchStats,
  parseEspnTimeline,
  type EspnSummary,
} from './espn-summary'
import { RateLimiter } from './rate-limiter'
import { assignGroupMatchdays, mapStageFromName, parseGroupNameStrict } from './stage'
import {
  ProviderRateLimitError,
  ProviderUpstreamError,
  type DiscoveredCompetition,
  type ListFixturesOptions,
  type MatchDataProvider,
} from './types'

// ESPN's public site API - keyless, undocumented, no announced quota.
// e.g. https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=2026
// One request returns a whole season (104 events for the 2026 World Cup), so a
// sync costs one call plus one for the group letters.

export interface EspnTeam {
  id?: string | number | null
  displayName?: string | null
  shortDisplayName?: string | null
  abbreviation?: string | null
  logo?: string | null
}

export interface EspnCompetitor {
  homeAway?: string | null
  score?: string | number | null
  winner?: boolean | null
  shootoutScore?: number | null
  team?: EspnTeam | null
}

export interface EspnDetail {
  scoringPlay?: boolean | null
  shootout?: boolean | null
  scoreValue?: number | null
  clock?: { displayValue?: string | null } | null
  team?: { id?: string | number | null } | null
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

// A Map, not an object literal: the key is upstream-controlled, and a plain
// object would resolve "constructor" or "toString" to an inherited function.
const POST_STATUS_NAMES = new Map<string, MatchStatus>([
  ['STATUS_POSTPONED', 'POSTPONED'],
  ['STATUS_CANCELED', 'CANCELLED'],
  ['STATUS_CANCELLED', 'CANCELLED'],
  ['STATUS_ABANDONED', 'CANCELLED'],
  ['STATUS_SUSPENDED', 'SUSPENDED'],
  ['STATUS_FORFEIT', 'AWARDED'],
])

// ESPN announces a postponed or abandoned match as `post`, exactly like a
// finished one - reading the state alone would show a full-time card for a
// match that never kicked off, so the name decides inside `post`.
export function mapEspnStatus(status: EspnStatus | null | undefined): MatchStatus {
  const type = status?.type ?? {}
  const name = type.name ?? ''

  if (type.state === 'pre') return 'SCHEDULED'
  if (type.state === 'in') return PAUSED_STATUS_NAMES.has(name) ? 'PAUSED' : 'LIVE'
  if (type.state === 'post') {
    return POST_STATUS_NAMES.get(name) ?? (type.completed ? 'FINISHED' : 'SUSPENDED')
  }
  return 'SCHEDULED'
}

// `season.slug` carries the round: group-stage, round-of-32, quarterfinals,
// 3rd-place-match, final... Hyphens out, and the shared ladder reads it.
export function mapEspnStage(slug: string | null | undefined) {
  return mapStageFromName((slug ?? '').replace(/-/g, ' '))
}

// "23'", "45'+2'", "90'+6'" - anchored, so a prefixed clock is refused outright
// rather than yielding whatever number happens to appear first.
export function espnMinute(clock: string | null | undefined): number | null {
  const found = String(clock ?? '').match(/^(\d+)/)
  return found ? Number(found[1]) : null
}

function teamId(id: string | number | null | undefined): string | null {
  return id == null || id === '' ? null : String(id)
}

function toTeam(team: EspnTeam | null | undefined): Team {
  return {
    // `||` not `??`: ESPN serializes a placeholder side with empty strings.
    name: team?.displayName || team?.shortDisplayName || 'TBD',
    code: team?.abbreviation || null,
    crest: team?.logo || null,
    providerTeamId: teamId(team?.id),
  }
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null
  const text = String(value).trim()
  if (text === '') return null
  const parsed = Number(text)
  return Number.isInteger(parsed) ? parsed : null
}

// Goals up to the break, summed off `details`. ESPN credits an own goal to the
// side it benefits, so no side-swap is needed here. Returns null rather than a
// zeroed pair whenever the answer would be a guess: without team ids there is no
// way to tell the sides apart, and an absent play-by-play (routine for older or
// smaller competitions) is not the same fact as a goalless first half.
function halfTimeFrom(details: EspnDetail[], homeId: string | null, awayId: string | null): ScorePair | null {
  if (homeId == null || awayId == null) return null

  const goals = details.filter((d) => d.scoringPlay && !d.shootout)
  if (!goals.length) return null

  const pair = { home: 0, away: 0 }
  for (const goal of goals) {
    const minute = espnMinute(goal.clock?.displayValue)
    const scorer = teamId(goal.team?.id)
    // A goal we cannot place - no minute, or a team id matching neither side -
    // makes the whole half-time score a guess, so decline to answer.
    if (minute == null || (scorer !== homeId && scorer !== awayId)) return null
    if (minute > 45) continue
    pair[scorer === homeId ? 'home' : 'away'] += goal.scoreValue ?? 1
  }
  return pair
}

export function normalizeEspnEvent(event: EspnEvent, groups?: Map<string, string>): NormalizedMatch | null {
  const competition = event.competitions?.[0]
  const competitors = competition?.competitors ?? []
  if (!competition || competitors.length < 2) return null

  // Fall back to array order only when NEITHER side is labelled: a half-labelled
  // payload would otherwise resolve both sides to the same competitor.
  const labelledHome = competitors.find((c) => c.homeAway === 'home')
  const labelledAway = competitors.find((c) => c.homeAway === 'away')
  const home = labelledHome ?? (labelledAway ? null : competitors[0])
  const away = labelledAway ?? (labelledHome ? null : competitors[1])
  if (!home || !away || home === away) return null

  // An undated event cannot be stored (kickoff_time is NOT NULL) and a blank
  // string would reach the DB as an Invalid Date, aborting the whole sync loop.
  const kickoffTime = competition.date || event.date || null
  if (!kickoffTime) return null

  const status = mapEspnStatus(competition.status)
  const started = matchHasStarted(status)

  // A scheduled match reports score "0" on both sides, and so does a postponed
  // or cancelled one - writing that through would stamp a fixture nobody played
  // with a real 0-0. matchHasStarted excludes the never-played terminals.
  const score: Score = {
    fullTime: {
      home: started ? toNumber(home.score) : null,
      away: started ? toNumber(away.score) : null,
    },
  }

  // ESPN sends shootoutScore 0 on ordinary matches; only a real shootout has a
  // non-zero total. Storing the zeros would mark every match as decided on pens.
  const homePens = toNumber(home.shootoutScore)
  const awayPens = toNumber(away.shootoutScore)
  if ((homePens ?? 0) + (awayPens ?? 0) > 0) {
    score.penalties = { home: homePens, away: awayPens }
  }

  const homeId = teamId(home.team?.id)
  const awayId = teamId(away.team?.id)
  const period = competition.status?.period ?? 0
  if (started && (period >= 2 || status === 'FINISHED')) {
    const halfTime = halfTimeFrom(competition.details ?? [], homeId, awayId)
    if (halfTime) score.halfTime = halfTime
  }

  let winner: Winner = null
  if (home.winner) winner = 'HOME'
  else if (away.winner) winner = 'AWAY'
  // Only call it a draw when the scoreline agrees. ESPN omits the winner flag on
  // some events, and status alone would record a 2-1 as a draw.
  else if (status === 'FINISHED' && score.fullTime.home != null && score.fullTime.home === score.fullTime.away) {
    winner = 'DRAW'
  }

  const stage = mapEspnStage(event.season?.slug)

  return {
    providerMatchId: String(event.id),
    // ESPN has no stage id, but the details sync only considers a match whose
    // providerStageId is set (it is FIFA's detail-URL segment), so leaving this
    // null means goal_event is never written and the scorer board never builds
    // from local data. The season slug is the nearest thing ESPN publishes.
    providerStageId: event.season?.slug || stage,
    stage,
    // Only a group-stage match has a group. The lookup is by team, and a team
    // carries its group letter into the knockouts, so an ungated join would
    // stamp "Group A" on a Round of 16 tie and corrupt the group table.
    group: stage === 'GROUP' && homeId != null ? (groups?.get(homeId) ?? null) : null,
    matchday: null,
    homeTeam: toTeam(home.team),
    awayTeam: toTeam(away.team),
    kickoffTime,
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
        standings?: { entries?: { team?: { id?: string | number | null } | null }[] | null } | null
      }[]
    | null
}

// The season-long leaders board and the per-team season aggregate live only on
// the `core` API, which serves a graph of $refs rather than whole objects.
interface EspnLeaderEntry {
  value?: number | null
  displayValue?: string | null
  shortDisplayValue?: string | null
  athlete?: { $ref?: string | null } | null
  team?: { $ref?: string | null } | null
}

interface EspnLeaders {
  categories?: { name?: string | null; leaders?: EspnLeaderEntry[] | null }[] | null
}

interface EspnTeamList {
  sports?: { leagues?: { teams?: { team?: { id?: string | number | null; abbreviation?: string | null } | null }[] | null }[] | null }[] | null
}

interface EspnTeamRoster {
  athletes?: {
    id?: string | number | null
    displayName?: string | null
    jersey?: string | null
    position?: { abbreviation?: string | null } | null
    headshot?: { href?: string | null } | null
  }[] | null
  coach?: { firstName?: string | null; lastName?: string | null }[] | null
}

interface EspnTeamStatistics {
  splits?: { categories?: { stats?: { name?: string | null; value?: number | null }[] | null }[] | null } | null
}

export interface EspnOptions {
  league: string
  season?: string | null
  baseUrl?: string
  standingsBaseUrl?: string
  coreBaseUrl?: string
  fetchImpl?: typeof fetch
  rateLimiter?: RateLimiter
  refRateLimiter?: RateLimiter
  refIntervalMs?: number
  timeoutMs?: number
}

// The leaders board labels a row "M: 8, G: 10: A: 4" - matches, goals, assists.
// Reading the assist count out of it saves one $ref hop per player.
export function assistsFromLabel(label: string | null | undefined): number | null {
  const found = String(label ?? '').match(/\bA:\s*(\d+)/)
  return found ? Number(found[1]) : null
}

export function mapEspnSeasonStats(raw: {
  splits?: { categories?: { stats?: { name?: string | null; value?: number | null }[] | null }[] | null } | null
}): TeamSeasonStats | null {
  const flat = new Map<string, number | null>()
  for (const category of raw.splits?.categories ?? []) {
    for (const stat of category.stats ?? []) {
      if (stat.name) flat.set(stat.name, stat.value ?? null)
    }
  }
  if (!flat.size) return null

  const passPct = flat.get('passPct')
  return {
    goals: flat.get('totalGoals') ?? null,
    conceded: flat.get('goalsConceded') ?? null,
    assists: flat.get('goalAssists') ?? null,
    // A side cannot have had none of the ball: ESPN returns 0 for a season it
    // never aggregated, and forwarding it renders "Possession 0%".
    possession: flat.get('possessionPct') || null,
    attempts: flat.get('totalShots') ?? null,
    onTarget: flat.get('shotsOnTarget') ?? null,
    passes: flat.get('totalPasses') ?? null,
    // ESPN ships the pass rate as a fraction; the app renders a percentage.
    passAccuracy: passPct != null ? Math.round(passPct * 1000) / 10 : null,
    crosses: flat.get('totalCrosses') ?? null,
    corners: flat.get('wonCorners') ?? null,
    offsides: flat.get('offsides') ?? null,
    yellowCards: flat.get('yellowCards') ?? null,
    redCards: flat.get('redCards') ?? null,
  }
}

// The league catalog: `items` carries only $ref links, so each entry costs one
// hop to learn its name. 218 leagues at the time of writing.
export interface EspnLeagueIndex {
  items?: { $ref?: string | null }[] | null
}

export interface EspnLeagueDoc {
  slug?: string | null
  name?: string | null
  displayName?: string | null
  isTournament?: boolean | null
  season?: { year?: number | null } | null
}

const DEFAULT_CORE_BASE_URL = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues'

const DEFAULT_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer'
// Standings live on apis/v2, not apis/site/v2. The site path also answers 200,
// with an almost empty object - a wrong address that looks like a working one.
const DEFAULT_STANDINGS_BASE_URL = 'https://site.api.espn.com/apis/v2/sports/soccer'

// An Akamai in front of the API 403s on the User-Agent, in HTML rather than
// JSON. Branded and browser-shaped agents are refused; a plain tool agent passes.
const USER_AGENT = 'curl/8.0'

const DEFAULT_TIMEOUT_MS = 20_000

// The board ships 25 and every row past the leader costs a request; a hostile or
// changed response must not turn one read into an unbounded fan-out.
const MAX_LEADERS = 25

// Discovery hydrates one document per league. The catalog is ~218 entries, so
// the cap is headroom rather than a limit - it exists so a changed or hostile
// index cannot turn one admin click into an unbounded fan-out.
const MAX_DISCOVERED = 400

export function espnProvider(options: EspnOptions): MatchDataProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const standingsBaseUrl = options.standingsBaseUrl ?? DEFAULT_STANDINGS_BASE_URL
  const coreBaseUrl = options.coreBaseUrl ?? DEFAULT_CORE_BASE_URL
  const league = encodeURIComponent(options.league)
  const doFetch = options.fetchImpl ?? fetch
  const limiter = options.rateLimiter ?? new RateLimiter(1000)
  // Resolving the scorer board is one request per player. At the main limiter's
  // one-per-second that is half a minute of wall clock inside a read route, so
  // the $ref hops get their own, much tighter spacing: they are tiny documents
  // on a different host and the politeness budget that matters is the scoreboard's.
  const refLimiter = options.refRateLimiter ?? new RateLimiter(options.refIntervalMs ?? 60)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function getJson<T>(url: string, withLimiter: RateLimiter = limiter): Promise<T> {
    await withLimiter.acquire()
    // scores:poll walks competitions serially, so one unanswered socket would
    // stall every other competition's live update until the process restarts.
    const response = await doFetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.status === 429) throw new ProviderRateLimitError()
    if (!response.ok) throw new ProviderUpstreamError(response.status, await response.text())
    return (await response.json()) as T
  }

  function seasonFor(requested?: string | null): string | null {
    // `||` not `??`: an empty seasonHint must fall through to the caller's season.
    return options.season || requested || null
  }

  let groupsCache: Promise<Map<string, string>> | null = null

  // The scoreboard has no group letter; the standings tree does, keyed by team.
  async function fetchGroups(season: string | null): Promise<Map<string, string>> {
    const query = season ? `?season=${encodeURIComponent(season)}` : ''
    const data = await getJson<EspnStandings>(`${standingsBaseUrl}/${league}/standings${query}`)
    const byTeam = new Map<string, string>()
    for (const child of data.children ?? []) {
      const letter = parseGroupNameStrict(child.abbreviation) ?? parseGroupNameStrict(child.name)
      if (!letter) continue
      for (const entry of child.standings?.entries ?? []) {
        const id = teamId(entry.team?.id)
        if (id) byTeam.set(id, letter)
      }
    }
    return byTeam
  }

  function teamGroups(season: string | null): Promise<Map<string, string>> {
    if (!groupsCache) {
      const pending = fetchGroups(season)
      // Reset on failure AND on an empty result (standings published before the
      // draw): only a map that actually answered something is worth keeping.
      groupsCache = pending.then(
        (map) => {
          if (!map.size) groupsCache = null
          return map
        },
        (error) => {
          groupsCache = null
          throw error
        },
      )
    }
    return groupsCache
  }

  // Every read goes through one season fetch so the derived group matchdays see
  // the whole group, not the slice a single day or the live poll would return.
  async function fetchSeason(requested?: string | null): Promise<NormalizedMatch[]> {
    const season = seasonFor(requested)
    const params = new URLSearchParams({ limit: '500' })
    // Without `dates` the scoreboard serves the current day only.
    if (season) params.set('dates', season)

    const data = await getJson<EspnScoreboard>(`${baseUrl}/${league}/scoreboard?${params}`)
    const events = data.events ?? []
    const hasGroupStage = events.some((event) => mapEspnStage(event.season?.slug) === 'GROUP')

    // Not swallowed: a group match with no letter gets no derived matchday and
    // would be skipped at insert, and `groupName` is a mutable upsert field, so
    // a silent empty map would also blank the stored letters on the next poll.
    // Failing the run costs one tick; writing nulls costs the group table.
    const groups = hasGroupStage ? await teamGroups(season) : undefined

    const matches = events
      .map((event) => normalizeEspnEvent(event, groups))
      .filter((m): m is NormalizedMatch => m !== null)
    return assignGroupMatchdays(matches)
  }

  // One summary document carries the play-by-play, both line-ups and both
  // teams' stats, and four provider methods read it - memoize per match so a
  // detail + stats + timeline render costs one request, not three.
  const summaries = new Map<string, Promise<EspnSummary>>()
  function summaryFor(matchId: string): Promise<EspnSummary> {
    let pending = summaries.get(matchId)
    if (!pending) {
      pending = getJson<EspnSummary>(`${baseUrl}/${league}/summary?event=${encodeURIComponent(matchId)}`).catch(
        (error) => {
          summaries.delete(matchId)
          throw error
        },
      )
      summaries.set(matchId, pending)
    }
    return pending
  }

  let teamIdsCache: Promise<Map<string, string>> | null = null
  // The app addresses a team by its three-letter code; ESPN wants a numeric id.
  function teamIdsByCode(): Promise<Map<string, string>> {
    if (!teamIdsCache) {
      teamIdsCache = getJson<EspnTeamList>(`${baseUrl}/${league}/teams`)
        .then((data) => {
          const byCode = new Map<string, string>()
          for (const entry of data.sports?.[0]?.leagues?.[0]?.teams ?? []) {
            const code = entry.team?.abbreviation
            const teamId = entry.team?.id
            if (code && teamId != null) byCode.set(code.toUpperCase(), String(teamId))
          }
          if (!byCode.size) teamIdsCache = null
          return byCode
        })
        .catch((error) => {
          teamIdsCache = null
          throw error
        })
    }
    return teamIdsCache
  }

  function coreSeasonUrl(season: string): string {
    // The leaders and team aggregates are season-scoped; `types/1` is the one
    // season type football competitions publish.
    return `${coreBaseUrl}/${league}/seasons/${encodeURIComponent(season)}/types/1`
  }

  // A $ref is a URL the upstream chose, so it is only followed when it points
  // back at the core API we already trust: a hostile or spoofed response would
  // otherwise make the server fetch an arbitrary address from inside its network.
  const coreHost = (() => {
    try {
      return new URL(coreBaseUrl).host
    } catch {
      return null
    }
  })()

  function trustedRef(ref: string | null | undefined): string | null {
    if (!ref || !coreHost) return null
    try {
      // The board answers over http while the base is https; only the host matters.
      return new URL(ref).host === coreHost ? ref : null
    } catch {
      return null
    }
  }

  // A leaders entry points at its athlete and team rather than naming them, so
  // each row costs a follow-up. Teams repeat heavily across a top-25 board, so
  // they are resolved once and shared; athletes are unique and cannot be.
  async function resolveLeaders(season: string | null): Promise<TopScorer[]> {
    // The core API is season-scoped; without one the path is malformed and the
    // caller is better served falling through to its local aggregation.
    if (!season) return []
    const data = await getJson<EspnLeaders>(`${coreSeasonUrl(season)}/leaders`)
    const goals = (data.categories?.find((c) => c.name === 'goalsLeaders')?.leaders ?? []).slice(0, MAX_LEADERS)
    if (!goals.length) return []

    const teamCache = new Map<string, { name: string; code: string | null }>()
    async function resolveTeam(ref: string | null | undefined) {
      const trusted = trustedRef(ref)
      if (!trusted) return { name: '', code: null }
      const cached = teamCache.get(trusted)
      if (cached) return cached
      const team = await getJson<{ displayName?: string | null; abbreviation?: string | null }>(trusted, refLimiter)
      const resolved = { name: team.displayName ?? '', code: team.abbreviation ?? null }
      teamCache.set(trusted, resolved)
      return resolved
    }

    const out: TopScorer[] = []
    for (const entry of goals) {
      const athleteRef = trustedRef(entry.athlete?.$ref)
      const athlete = athleteRef ? await getJson<{ displayName?: string | null }>(athleteRef, refLimiter) : null
      const team = await resolveTeam(entry.team?.$ref)
      out.push({
        playerName: athlete?.displayName ?? 'Unknown',
        teamName: team.name,
        teamCode: team.code,
        goals: entry.value ?? 0,
        // The board ships assists inside its own label ("M: 8, G: 10: A: 4"),
        // which saves a second $ref hop per player for the statistics document.
        assists: assistsFromLabel(entry.shortDisplayValue ?? entry.displayValue),
        penalties: null,
      })
    }
    return out
  }

  return {
    meta: { name: 'espn', rateLimitPerMin: 60, dailyCap: null },

    // The catalog ESPN carries, for the admin's add-a-competition list. The
    // index gives $ref links only, so the name, season and isTournament flag
    // each cost a hop; they go through the tight ref limiter, not the
    // scoreboard's one-per-second, which would make this a four-minute call.
    // A league whose document fails to load is dropped rather than failing the
    // whole catalog - one dead entry should not cost the admin the other 217.
    async discoverCompetitions(): Promise<DiscoveredCompetition[]> {
      const index = await getJson<EspnLeagueIndex>(`${coreBaseUrl}?limit=${MAX_DISCOVERED}`)
      const slugs: string[] = []
      for (const item of index.items ?? []) {
        const ref = item?.$ref
        if (!ref) continue
        // The $ref is upstream text: one stray percent-escape would otherwise
        // throw out of the loop and cost the admin the whole catalog.
        let tail: string | undefined
        try {
          tail = decodeURIComponent(ref).split('/leagues/')[1]
        } catch {
          continue
        }
        const slug = tail?.split('?')[0]?.replace(/\/+$/, '')
        if (slug) slugs.push(slug)
        if (slugs.length >= MAX_DISCOVERED) break
      }

      // Walked in series, not Promise.all: RateLimiter spaces acquisitions off a
      // single `lastAt` and has no queue, so a parallel map has every request
      // read the same timestamp, sleep the same 60ms and then fire as one burst
      // of 218 - which is what the limiter exists to prevent. Every other
      // ref-limited read here is a serial loop for the same reason.
      const found: DiscoveredCompetition[] = []
      for (const slug of slugs) {
        let doc: EspnLeagueDoc
        try {
          doc = await getJson<EspnLeagueDoc>(`${coreBaseUrl}/${encodeURIComponent(slug)}`, refLimiter)
        } catch (e) {
          // One dead league is dropped; being rate-limited is not "these
          // competitions do not exist", and silently returning a short catalog
          // would tell the admin exactly that.
          if (e instanceof ProviderRateLimitError) throw e
          continue
        }
        const name = doc.displayName ?? doc.name
        if (!name) continue
        found.push({
          externalCompetitionId: doc.slug ?? slug,
          name,
          seasonHint: doc.season?.year != null ? String(doc.season.year) : null,
          isTournament: doc.isTournament ?? null,
        })
      }

      return found.sort((a, b) => a.name.localeCompare(b.name))
    },

    listFixtures({ season }: ListFixturesOptions) {
      return fetchSeason(season)
    },

    async getMatchesByDate(date: string) {
      const day = date.slice(0, 10)
      return (await fetchSeason()).filter((m) => m.kickoffTime.startsWith(day))
    },

    async getLiveMatches() {
      // Keep matches that just finished, not only in-play ones: a feed of
      // LIVE/PAUSED alone never carries the final whistle, so the row would stay
      // LIVE until the hourly fixtures refresh. A 4h window covers ET plus pens.
      const finishedCutoff = Date.now() - 4 * 60 * 60 * 1000
      return (await fetchSeason()).filter(
        (m) =>
          m.status === 'LIVE' ||
          m.status === 'PAUSED' ||
          m.status === 'INTERRUPTED' ||
          (m.status === 'FINISHED' && new Date(m.kickoffTime).getTime() >= finishedCutoff),
      )
    },

    async getMatchDetail({ matchId }: { stageId?: string; matchId: string }) {
      const summary = await summaryFor(matchId)
      return parseEspnMatchDetail(summary, matchId, espnSummaryTeams(summary))
    },

    async getMatchLineups({ matchId }: { stageId?: string; matchId: string }) {
      return parseEspnLineups(await summaryFor(matchId))
    },

    async getMatchTimeline(opts: {
      matchId: string
      homeTeamId?: string | null
      awayTeamId?: string | null
      language?: string | null
    }) {
      const summary = await summaryFor(opts.matchId)
      const teams = espnSummaryTeams(summary)
      return parseEspnTimeline(summary, {
        homeTeamId: opts.homeTeamId ?? teams.homeId,
        awayTeamId: opts.awayTeamId ?? teams.awayId,
        // ESPN's commentary is English only. Handing it to a French or Arabic
        // reader would drop an untranslated sentence into an otherwise
        // translated timeline, so the client's generic label wins instead.
        withText: opts.language === 'en',
      })
    },

    // `ifesId` is the event id that getMatchDetail handed back, so this reads
    // the memoized summary rather than fetching the document a second time.
    async getMatchStats({ ifesId }: { ifesId: string }) {
      const stats = parseEspnMatchStats(await summaryFor(ifesId))
      return Object.keys(stats).length ? stats : null
    },

    async getBracket() {
      return bracketFromKnockoutMatches(await fetchSeason())
    },

    getTopScorers({ season }: ListFixturesOptions) {
      return resolveLeaders(seasonFor(season))
    },

    // The caller passes a team id only because FIFA needs one; ESPN's leaders
    // board is competition-wide, so the id is ignored.
    getPlayerStats(_opts: { teamId: string }) {
      return resolveLeaders(seasonFor())
    },

    async getTeamTournament({ teamRef }: { teamRef: string; matches: { stageId: string; matchId: string }[] }) {
      const teamId = (await teamIdsByCode()).get(teamRef.toUpperCase())
      if (!teamId) return { squad: [], coach: null, stats: null }

      const roster = await getJson<EspnTeamRoster>(`${baseUrl}/${league}/teams/${encodeURIComponent(teamId)}/roster`)
      const squad: SquadPlayer[] = (roster.athletes ?? []).map((a) => ({
        playerId: a.id != null ? String(a.id) : '',
        name: a.displayName || '?',
        shirtNumber: a.jersey != null && a.jersey !== '' ? Number(a.jersey) : null,
        position: mapEspnPosition(a.position?.abbreviation),
        captain: false,
        pictureUrl: a.headshot?.href || null,
      }))

      const head = roster.coach?.[0]
      const coach = head ? [head.firstName, head.lastName].filter(Boolean).join(' ').trim() || null : null

      const season = seasonFor()
      let stats: TeamSeasonStats | null = null
      try {
        if (!season) throw new Error('no season')
        const raw = await getJson<EspnTeamStatistics>(
          `${coreSeasonUrl(season)}/teams/${encodeURIComponent(teamId)}/statistics`,
        )
        stats = mapEspnSeasonStats(raw)
      } catch (error) {
        // A competition that publishes no aggregate is fine to shrug off, but a
        // rate limit is not: the caller caches this result for six hours, so
        // swallowing one would pin an empty stats panel there with no retry.
        if (error instanceof ProviderRateLimitError) throw error
      }

      return { squad, coach, stats }
    },
  }
}
