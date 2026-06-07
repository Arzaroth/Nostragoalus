import type {
  AppStage,
  BookingEvent,
  BracketMatch,
  BracketRound,
  MatchDetail,
  MatchStatus,
  NormalizedBracket,
  NormalizedGoal,
  NormalizedMatch,
  Score,
  SquadPlayer,
  Team,
  TeamMatchStats,
  TeamSeasonStats,
  TopScorer,
  Winner,
} from '../../../shared/types/match'
import { RateLimiter } from './rate-limiter'
import { ProviderRateLimitError, ProviderUpstreamError, type ListFixturesOptions, type MatchDataProvider } from './types'
import { minuteValue } from '../stats/insights'

interface FifaLocalized {
  Locale: string
  Description: string
}

interface FifaTeam {
  IdTeam: string | null
  Score: number | null
  TeamName?: FifaLocalized[]
  Abbreviation?: string | null
  IdCountry?: string | null
  PictureUrl?: string | null
}

export interface FifaMatch {
  IdMatch: string
  IdStage: string
  IdGroup: string | null
  StageName?: FifaLocalized[]
  GroupName?: FifaLocalized[]
  Date: string
  Home: FifaTeam | null
  Away: FifaTeam | null
  HomeTeamScore: number | null
  AwayTeamScore: number | null
  HomeTeamPenaltyScore: number | null
  AwayTeamPenaltyScore: number | null
  Winner: string | null
  MatchStatus: number
  PlaceHolderA?: string | null
  PlaceHolderB?: string | null
}

export function mapFifaStatus(code: number): MatchStatus {
  switch (code) {
    case 0:
      return 'FINISHED'
    case 3:
      return 'LIVE'
    case 1:
    default:
      return 'SCHEDULED'
  }
}

export function mapFifaStage(stageName: string): AppStage {
  const s = stageName.toLowerCase()
  if (s.includes('third')) return 'THIRD_PLACE'
  if (s.includes('semi')) return 'SF'
  if (s.includes('quarter')) return 'QF'
  if (s.includes('round of 32')) return 'R32'
  if (s.includes('round of 16')) return 'R16'
  if (s.includes('final')) return 'FINAL'
  return 'GROUP'
}

export function parseFifaGroup(name: string | undefined): string | null {
  if (!name) return null
  const match = name.match(/([A-L])\s*$/i)
  return match ? match[1].toUpperCase() : null
}

function toTeam(team: FifaTeam | null | undefined, placeholder: string | null | undefined): Team {
  return {
    name: team?.TeamName?.[0]?.Description || placeholder || 'TBD',
    code: team?.Abbreviation || team?.IdCountry || null,
    crest: team?.PictureUrl ? team.PictureUrl.replace('{format}', 'sq').replace('{size}', '4') : null,
    providerTeamId: team?.IdTeam ?? null,
  }
}

function toWinner(match: FifaMatch): Winner {
  if (match.Winner && match.Winner === match.Home?.IdTeam) return 'HOME'
  if (match.Winner && match.Winner === match.Away?.IdTeam) return 'AWAY'
  if (match.HomeTeamScore != null && match.HomeTeamScore === match.AwayTeamScore) return 'DRAW'
  return null
}

export function normalizeFifaMatch(match: FifaMatch): NormalizedMatch {
  const score: Score = { fullTime: { home: match.HomeTeamScore, away: match.AwayTeamScore } }
  if (match.HomeTeamPenaltyScore != null || match.AwayTeamPenaltyScore != null) {
    score.penalties = { home: match.HomeTeamPenaltyScore, away: match.AwayTeamPenaltyScore }
  }

  return {
    providerMatchId: match.IdMatch,
    providerStageId: match.IdStage,
    stage: mapFifaStage(match.StageName?.[0]?.Description ?? ''),
    group: parseFifaGroup(match.GroupName?.[0]?.Description),
    matchday: null,
    homeTeam: toTeam(match.Home, match.PlaceHolderA),
    awayTeam: toTeam(match.Away, match.PlaceHolderB),
    kickoffTime: match.Date,
    status: mapFifaStatus(match.MatchStatus),
    score,
    winner: toWinner(match),
  }
}

// FIFA does not expose a matchday number, so derive it for group matches by ordering
// each group's six fixtures by kickoff (two per matchday).
export function assignGroupMatchdays(matches: NormalizedMatch[]): NormalizedMatch[] {
  const byGroup = new Map<string, NormalizedMatch[]>()
  for (const m of matches) {
    if (m.stage !== 'GROUP' || !m.group) continue
    const bucket = byGroup.get(m.group) ?? []
    bucket.push(m)
    byGroup.set(m.group, bucket)
  }

  for (const groupMatches of byGroup.values()) {
    groupMatches.sort((a, b) => a.kickoffTime.localeCompare(b.kickoffTime))
    groupMatches.forEach((m, index) => {
      m.matchday = Math.floor(index / 2) + 1
    })
  }
  return matches
}

interface FifaDetailPlayer {
  IdPlayer: string
  PlayerName?: FifaLocalized[]
  ShortName?: FifaLocalized[]
  ShirtNumber?: number | string | null
  Position?: number | string | null
  Captain?: boolean | string | null
}

interface FifaDetailGoal {
  Type?: number | null
  Period?: number | null
  IdPlayer?: string | null
  Minute?: string | null
  IdAssistPlayer?: string | null
  IdTeam?: string | null
}

// FIFA "Period" 11 is the penalty shootout — those conversions are not match
// goals and must not count toward scorers (matches the official Golden Boot).
const FIFA_SHOOTOUT_PERIOD = 11

interface FifaDetailBooking {
  Card?: number | null
  IdPlayer?: string | null
  Minute?: string | null
}

interface FifaDetailTeam {
  IdTeam?: string | null
  TeamName?: FifaLocalized[]
  Abbreviation?: string | null
  Players?: FifaDetailPlayer[]
  Goals?: FifaDetailGoal[]
  Bookings?: FifaDetailBooking[]
  Coaches?: { Name?: FifaLocalized[]; Alias?: FifaLocalized[]; Role?: number | string | null }[]
}

export interface FifaMatchDetailResponse {
  HomeTeam?: FifaDetailTeam | null
  AwayTeam?: FifaDetailTeam | null
  BallPossession?: { OverallHome?: number | null; OverallAway?: number | null } | null
  Attendance?: number | null
  Stadium?: { Name?: FifaLocalized[] } | null
  Properties?: { IdIFES?: string | null } | null
}

function countCards(bookings: FifaDetailBooking[] | undefined): { yellow: number; red: number } {
  let yellow = 0
  let red = 0
  for (const b of bookings ?? []) {
    if (b.Card === 1) yellow += 1
    else if (b.Card != null) red += 1
  }
  return { yellow, red }
}

export function normalizeFifaMatchDetail(detail: FifaMatchDetailResponse): MatchDetail {
  const names = new Map<string, string>()
  const homeIds = new Set<string>()
  const awayIds = new Set<string>()
  for (const p of detail.HomeTeam?.Players ?? []) {
    if (p.IdPlayer) {
      homeIds.add(p.IdPlayer)
      names.set(p.IdPlayer, p.PlayerName?.[0]?.Description || p.ShortName?.[0]?.Description || 'Unknown')
    }
  }
  for (const p of detail.AwayTeam?.Players ?? []) {
    if (p.IdPlayer) {
      awayIds.add(p.IdPlayer)
      names.set(p.IdPlayer, p.PlayerName?.[0]?.Description || p.ShortName?.[0]?.Description || 'Unknown')
    }
  }

  const goals: NormalizedGoal[] = []
  for (const [side, team] of [
    ['HOME', detail.HomeTeam],
    ['AWAY', detail.AwayTeam],
  ] as const) {
    const ownRoster = side === 'HOME' ? homeIds : awayIds
    const otherRoster = side === 'HOME' ? awayIds : homeIds
    for (const g of team?.Goals ?? []) {
      if (g.Period === FIFA_SHOOTOUT_PERIOD) continue
      // An own goal sits under the benefiting team but the scorer is on the opponent's roster.
      const ownGoal = !!g.IdPlayer && otherRoster.has(g.IdPlayer) && !ownRoster.has(g.IdPlayer)
      goals.push({
        side,
        teamId: g.IdTeam ?? team?.IdTeam ?? null,
        teamName: team?.TeamName?.[0]?.Description || '',
        teamCode: team?.Abbreviation || null,
        playerId: g.IdPlayer ?? null,
        playerName: (g.IdPlayer && names.get(g.IdPlayer)) || 'Unknown',
        minute: g.Minute ?? null,
        goalType: g.Type ?? null,
        ownGoal,
        // FIFA's IdAssistPlayer is the beaten goalkeeper, not the assister — so no assist data here.
        assistPlayerId: null,
        assistPlayerName: null,
      })
    }
  }

  // Home goals are collected before away goals — restore match chronology.
  goals.sort((a, b) => minuteValue(a.minute) - minuteValue(b.minute))

  const bookings: BookingEvent[] = []
  for (const [side, team] of [
    ['HOME', detail.HomeTeam],
    ['AWAY', detail.AwayTeam],
  ] as const) {
    for (const b of team?.Bookings ?? []) {
      if (b.Card == null) continue
      bookings.push({
        side,
        playerId: b.IdPlayer ?? null,
        playerName: (b.IdPlayer && names.get(b.IdPlayer)) || 'Unknown',
        minute: b.Minute ?? null,
        // FIFA card codes: 1 = yellow, 2 = second yellow (yellow-red), 3 = straight red.
        card: b.Card === 1 ? 'YELLOW' : b.Card === 2 ? 'SECOND_YELLOW' : 'RED',
      })
    }
  }
  bookings.sort((a, b) => minuteValue(a.minute) - minuteValue(b.minute))

  return {
    possessionHome: detail.BallPossession?.OverallHome ?? null,
    possessionAway: detail.BallPossession?.OverallAway ?? null,
    attendance: detail.Attendance ?? null,
    stadium: detail.Stadium?.Name?.[0]?.Description ?? null,
    cards: { home: countCards(detail.HomeTeam?.Bookings), away: countCards(detail.AwayTeam?.Bookings) },
    goals,
    bookings,
    ifesId: detail.Properties?.IdIFES ?? null,
    homeTeamId: detail.HomeTeam?.IdTeam ?? null,
    awayTeamId: detail.AwayTeam?.IdTeam ?? null,
  }
}

const FIFA_POSITIONS: Record<number, SquadPlayer['position']> = { 0: 'GK', 1: 'DF', 2: 'MF', 3: 'FW' }

// A team's squad is the union of its match-day rosters (FIFA has no public
// stand-alone squad endpoint we can reach keylessly). teamRef matches the FIFA
// team id or the 3-letter code, whichever the caller has.
export function normalizeFifaSquad(details: FifaMatchDetailResponse[], teamRef: string): SquadPlayer[] {
  const byId = new Map<string, SquadPlayer>()
  const matches = (t: FifaDetailTeam | null | undefined) => !!t && (t.IdTeam === teamRef || t.Abbreviation === teamRef)
  for (const detail of details) {
    const team = matches(detail.HomeTeam) ? detail.HomeTeam : matches(detail.AwayTeam) ? detail.AwayTeam : null
    for (const p of team?.Players ?? []) {
      if (!p.IdPlayer) continue
      const position = FIFA_POSITIONS[Number(p.Position)] ?? null
      const existing = byId.get(p.IdPlayer)
      if (existing) {
        // A bench appearance may report no position — keep the best-known one.
        if (!existing.position && position) existing.position = position
        if (p.Captain === true || p.Captain === 'True') existing.captain = true
        continue
      }
      byId.set(p.IdPlayer, {
        playerId: p.IdPlayer,
        name: p.PlayerName?.[0]?.Description || p.ShortName?.[0]?.Description || 'Unknown',
        shirtNumber: p.ShirtNumber != null && p.ShirtNumber !== '' ? Number(p.ShirtNumber) : null,
        position,
        captain: p.Captain === true || p.Captain === 'True',
      })
    }
  }
  const order: Record<string, number> = { GK: 0, DF: 1, MF: 2, FW: 3 }
  return [...byId.values()].sort(
    (a, b) => (order[a.position ?? ''] ?? 4) - (order[b.position ?? ''] ?? 4) || (a.shirtNumber ?? 99) - (b.shirtNumber ?? 99),
  )
}

// FIFA capitalizes player surnames ("Kylian MBAPPE") but not coach names — align them.
export function upperSurname(name: string): string {
  const [first, ...rest] = name.split(' ')
  return rest.length ? `${first} ${rest.join(' ').toUpperCase()}` : name
}

export function normalizeFifaCoach(details: FifaMatchDetailResponse[], teamRef: string): string | null {
  const matches = (t: FifaDetailTeam | null | undefined) => !!t && (t.IdTeam === teamRef || t.Abbreviation === teamRef)
  for (const detail of details) {
    const team = matches(detail.HomeTeam) ? detail.HomeTeam : matches(detail.AwayTeam) ? detail.AwayTeam : null
    const head = (team?.Coaches ?? []).find((c) => Number(c.Role ?? 0) === 0) ?? team?.Coaches?.[0]
    const name = head?.Name?.[0]?.Description || head?.Alias?.[0]?.Description
    if (name) return upperSurname(name)
  }
  return null
}

// The official seasonal squad document — real positions for everyone, bench included.
export interface FifaSquadDoc {
  Players?: {
    IdPlayer?: string | null
    PlayerName?: FifaLocalized[]
    ShortName?: FifaLocalized[]
    JerseyNum?: number | string | null
    Position?: number | string | null
  }[]
  Officials?: { Name?: FifaLocalized[]; Role?: number | string | null }[]
}

export function normalizeFifaSquadDoc(doc: FifaSquadDoc, captains: Set<string>): { squad: SquadPlayer[]; coach: string | null } {
  const squad: SquadPlayer[] = []
  for (const p of doc.Players ?? []) {
    if (!p.IdPlayer) continue
    squad.push({
      playerId: p.IdPlayer,
      name: p.PlayerName?.[0]?.Description || p.ShortName?.[0]?.Description || 'Unknown',
      shirtNumber: p.JerseyNum != null && p.JerseyNum !== '' ? Number(p.JerseyNum) : null,
      position: FIFA_POSITIONS[Number(p.Position)] ?? null,
      captain: captains.has(p.IdPlayer),
    })
  }
  const order: Record<string, number> = { GK: 0, DF: 1, MF: 2, FW: 3 }
  squad.sort(
    (a, b) => (order[a.position ?? ''] ?? 4) - (order[b.position ?? ''] ?? 4) || (a.shirtNumber ?? 99) - (b.shirtNumber ?? 99),
  )
  const head = (doc.Officials ?? []).find((o) => Number(o.Role ?? -1) === 0) ?? doc.Officials?.[0]
  const coach = head?.Name?.[0]?.Description ?? null
  return { squad, coach: coach ? upperSurname(coach) : null }
}

// Season totals built by summing the per-match football-intelligence stats —
// the same numbers FIFA's own team pages show (no opaque type-code guessing).
export function aggregateTeamMatchStats(perMatch: TeamMatchStats[], cards: { yellow: number; red: number }[]): TeamSeasonStats | null {
  if (perMatch.length === 0 && cards.length === 0) return null
  const sum = (key: keyof TeamMatchStats) => {
    const vals = perMatch.map((m) => m[key]).filter((v): v is number => v != null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null
  }
  const possessions = perMatch.map((m) => m.possession).filter((v): v is number => v != null)
  const passes = sum('passes')
  const completed = sum('passesCompleted')
  return {
    goals: null, // filled by the caller from stored results
    conceded: null,
    assists: null,
    possession: possessions.length ? possessions.reduce((a, b) => a + b, 0) / possessions.length : null,
    attempts: sum('attempts'),
    onTarget: sum('onTarget'),
    passes,
    passAccuracy: passes && completed ? (completed / passes) * 100 : null,
    crosses: sum('crosses'),
    corners: sum('corners'),
    offsides: sum('offsides'),
    yellowCards: cards.length ? cards.reduce((a, c) => a + c.yellow, 0) : null,
    redCards: cards.length ? cards.reduce((a, c) => a + c.red, 0) : null,
  }
}

// fdh-api per-match team stats: { [teamId]: [name, value, isOfficial][] }.
export type FdhMatchStatsResponse = Record<string, [string, number, boolean][]>

export function normalizeFdhMatchStats(data: FdhMatchStatsResponse): Record<string, TeamMatchStats> {
  const out: Record<string, TeamMatchStats> = {}
  for (const [teamId, rows] of Object.entries(data)) {
    if (teamId === '-1') continue // contested/neutral bucket
    const byName = new Map(rows.map(([name, value]) => [name, value]))
    const num = (name: string) => {
      const v = byName.get(name)
      return typeof v === 'number' ? v : null
    }
    const distance = num('TotalDistance')
    const possession = num('Possession')
    out[teamId] = {
      possession: possession != null ? possession * 100 : null,
      attempts: num('AttemptAtGoal'),
      onTarget: num('AttemptAtGoalOnTarget'),
      passes: num('Passes'),
      passesCompleted: num('PassesCompleted'),
      crosses: num('Crosses'),
      corners: num('Corners'),
      fouls: num('FoulsAgainst'),
      offsides: num('Offsides'),
      distanceKm: distance != null ? distance / 1000 : null,
      pressuresApplied: num('DefensivePressuresApplied'),
      forcedTurnovers: num('ForcedTurnovers'),
    }
  }
  return out
}

interface FifaBracketTeam {
  IdTeam?: string | null
  TeamName?: FifaLocalized[]
  Abbreviation?: string | null
}

interface FifaBracketMatch {
  IdMatch: string
  HomeTeam?: FifaBracketTeam | null
  AwayTeam?: FifaBracketTeam | null
  PlaceHolderA?: string | null
  PlaceHolderB?: string | null
  HomeTeamScore?: number | null
  AwayTeamScore?: number | null
  HomeTeamPenaltyScore?: number | null
  AwayTeamPenaltyScore?: number | null
  Winner?: string | null
  MatchStatus: number
  Date: string
}

interface FifaBracketStage {
  SequenceOrder: number
  Name?: FifaLocalized[]
  Matches?: FifaBracketMatch[]
}

export interface FifaBracketResponse {
  KnockoutStages?: FifaBracketStage[]
  Winner?: FifaBracketTeam | null
}

function toBracketMatch(m: FifaBracketMatch): BracketMatch {
  const winner: BracketMatch['winner'] = m.Winner
    ? m.Winner === m.HomeTeam?.IdTeam
      ? 'HOME'
      : m.Winner === m.AwayTeam?.IdTeam
        ? 'AWAY'
        : null
    : null
  return {
    providerMatchId: m.IdMatch,
    homeTeam: m.HomeTeam?.TeamName?.[0]?.Description || m.PlaceHolderA || 'TBD',
    homeCode: m.HomeTeam?.Abbreviation || null,
    awayTeam: m.AwayTeam?.TeamName?.[0]?.Description || m.PlaceHolderB || 'TBD',
    awayCode: m.AwayTeam?.Abbreviation || null,
    homeScore: m.HomeTeamScore ?? null,
    awayScore: m.AwayTeamScore ?? null,
    homePens: m.HomeTeamPenaltyScore ?? null,
    awayPens: m.AwayTeamPenaltyScore ?? null,
    winner,
    status: mapFifaStatus(m.MatchStatus),
    kickoffTime: m.Date,
  }
}

export function normalizeFifaBracket(data: FifaBracketResponse): NormalizedBracket {
  const rounds: BracketRound[] = (data.KnockoutStages ?? [])
    .slice()
    .sort((a, b) => a.SequenceOrder - b.SequenceOrder)
    .map((st) => ({
      name: st.Name?.[0]?.Description ?? '',
      sequence: st.SequenceOrder,
      matches: (st.Matches ?? []).map(toBracketMatch),
    }))
  const winner = data.Winner
    ? { name: data.Winner.TeamName?.[0]?.Description ?? '', code: data.Winner.Abbreviation ?? null }
    : null
  return { winner, rounds }
}

// FIFA Opta stat Type codes (verified against WC2022: Mbappe 8 goals, Griezmann 3 assists).
const FIFA_STAT_GOALS = 1
const FIFA_STAT_ASSISTS = 219

interface FifaStatEntry {
  Type: number
  Value: number
}

interface FifaAggregatedTeam {
  IdTeam?: string | null
  TeamName?: FifaLocalized[]
  IdCountry?: string | null
}

interface FifaAggregatedPlayer {
  IdTeam?: string | null
  IdPlayer?: string | null
  PlayerName?: FifaLocalized[]
  Statistic?: FifaStatEntry[]
}

export interface FifaTeamStatsResponse {
  AggregatedTeamStats?: FifaAggregatedTeam[]
  AggregatedPlayerStats?: FifaAggregatedPlayer[]
}

// The /statistics/teams/{teamId} endpoint returns tournament-wide aggregates; we
// derive the official top scorers + assisters from AggregatedPlayerStats.
export function normalizeFifaPlayerStats(data: FifaTeamStatsResponse): TopScorer[] {
  const teams = new Map<string, { name: string; code: string | null }>()
  for (const t of data.AggregatedTeamStats ?? []) {
    if (t.IdTeam) teams.set(t.IdTeam, { name: t.TeamName?.[0]?.Description ?? '', code: t.IdCountry ?? null })
  }

  const statValue = (p: FifaAggregatedPlayer, type: number) =>
    (p.Statistic ?? []).find((s) => s.Type === type)?.Value ?? 0

  return (data.AggregatedPlayerStats ?? [])
    .map((p) => {
      const team = (p.IdTeam && teams.get(p.IdTeam)) || { name: '', code: null }
      return {
        playerName: p.PlayerName?.[0]?.Description ?? 'Unknown',
        teamName: team.name,
        teamCode: team.code,
        goals: statValue(p, FIFA_STAT_GOALS),
        assists: statValue(p, FIFA_STAT_ASSISTS),
        penalties: null,
      }
    })
    .filter((s) => s.goals > 0 || s.assists > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.playerName.localeCompare(b.playerName))
}

export interface FifaOptions {
  seasonId: string
  competitionId?: string
  baseUrl?: string
  fdhBaseUrl?: string
  fetchImpl?: typeof fetch
  rateLimiter?: RateLimiter
}

const DEFAULT_BASE_URL = 'https://api.fifa.com/api/v3'
const DEFAULT_FDH_BASE_URL = 'https://fdh-api.fifa.com'

interface FifaSeason {
  IdSeason: string
  Name?: FifaLocalized[]
  StartDate?: string | null
  EndDate?: string | null
}

// Choose the right season for a competition: prefer a name hint (e.g. "2026"),
// else the edition currently running, else the next upcoming, else the latest.
export function pickFifaSeason(seasons: FifaSeason[], hint: string | null | undefined, now: Date): string {
  if (hint) {
    const byHint = seasons.find((s) => (s.Name?.[0]?.Description ?? '').includes(hint))
    if (byHint) return byHint.IdSeason
  }

  const nowMs = now.getTime()
  const current = seasons.find(
    (s) => s.StartDate && s.EndDate && Date.parse(s.StartDate) <= nowMs && nowMs <= Date.parse(s.EndDate),
  )
  if (current) return current.IdSeason

  const upcoming = seasons
    .filter((s) => s.StartDate && Date.parse(s.StartDate) > nowMs)
    .sort((a, b) => Date.parse(a.StartDate as string) - Date.parse(b.StartDate as string))
  if (upcoming.length) return upcoming[0].IdSeason

  const dated = seasons
    .filter((s) => s.StartDate)
    .sort((a, b) => Date.parse(b.StartDate as string) - Date.parse(a.StartDate as string))
  if (dated.length) return dated[0].IdSeason

  throw new Error('no FIFA season found for the given competition')
}

export async function resolveFifaSeasonId(opts: {
  competitionId: string
  hint?: string | null
  now?: Date
  baseUrl?: string
  fetchImpl?: typeof fetch
}): Promise<string> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL
  const doFetch = opts.fetchImpl ?? fetch
  const response = await doFetch(`${baseUrl}/seasons?idCompetition=${opts.competitionId}&count=100&language=en`)
  if (!response.ok) throw new ProviderUpstreamError(response.status, await response.text())
  const data = (await response.json()) as { Results?: FifaSeason[] }
  return pickFifaSeason(data.Results ?? [], opts.hint, opts.now ?? new Date())
}

export function fifaProvider(options: FifaOptions): MatchDataProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const fdhBaseUrl = options.fdhBaseUrl ?? DEFAULT_FDH_BASE_URL
  const doFetch = options.fetchImpl ?? fetch
  const limiter = options.rateLimiter ?? new RateLimiter(1000)

  async function fetchAll(): Promise<NormalizedMatch[]> {
    await limiter.acquire()
    const response = await doFetch(
      `${baseUrl}/calendar/matches?language=en&count=500&idSeason=${options.seasonId}`,
    )

    if (response.status === 429) throw new ProviderRateLimitError()
    if (!response.ok) throw new ProviderUpstreamError(response.status, await response.text())

    const data = (await response.json()) as { Results?: FifaMatch[] }
    return (data.Results ?? []).map(normalizeFifaMatch)
  }

  return {
    meta: { name: 'fifa', rateLimitPerMin: 60, dailyCap: null },
    async listFixtures(_options: ListFixturesOptions) {
      return assignGroupMatchdays(await fetchAll())
    },
    async getMatchesByDate(date: string) {
      return (await fetchAll()).filter((m) => m.kickoffTime.startsWith(date))
    },
    async getLiveMatches() {
      return (await fetchAll()).filter((m) => m.status === 'LIVE' || m.status === 'PAUSED')
    },
    async getMatchDetail({ stageId, matchId }: { stageId: string; matchId: string }) {
      await limiter.acquire()
      const response = await doFetch(
        `${baseUrl}/live/football/${options.competitionId}/${options.seasonId}/${stageId}/${matchId}?language=en`,
      )
      if (response.status === 429) throw new ProviderRateLimitError()
      if (!response.ok) throw new ProviderUpstreamError(response.status, await response.text())
      return normalizeFifaMatchDetail((await response.json()) as FifaMatchDetailResponse)
    },
    async getBracket() {
      await limiter.acquire()
      const response = await doFetch(`${baseUrl}/seasonbracket/season/${options.seasonId}?language=en`)
      if (response.status === 429) throw new ProviderRateLimitError()
      if (!response.ok) throw new ProviderUpstreamError(response.status, await response.text())
      return normalizeFifaBracket((await response.json()) as FifaBracketResponse)
    },
    async getPlayerStats({ teamId }: { teamId: string }) {
      await limiter.acquire()
      const response = await doFetch(
        `${baseUrl}/statistics/teams/${teamId}?idSeason=${options.seasonId}&idCompetition=${options.competitionId}&language=en`,
      )
      if (response.status === 429) throw new ProviderRateLimitError()
      if (!response.ok) throw new ProviderUpstreamError(response.status, await response.text())
      return normalizeFifaPlayerStats((await response.json()) as FifaTeamStatsResponse)
    },
    // One sweep over the team's matches: squad, head coach, and season totals
    // (per-match stats summed — the same numbers FIFA's team pages show).
    async getTeamTournament({ teamRef, matches }: { teamRef: string; matches: { stageId: string; matchId: string }[] }) {
      const details: FifaMatchDetailResponse[] = []
      for (const m of matches) {
        await limiter.acquire()
        const response = await doFetch(
          `${baseUrl}/live/football/${options.competitionId}/${options.seasonId}/${m.stageId}/${m.matchId}?language=en`,
        )
        if (response.status === 429) throw new ProviderRateLimitError()
        if (!response.ok) continue // a missing match-day roster shouldn't sink the sweep
        details.push((await response.json()) as FifaMatchDetailResponse)
      }
      const sideOf = (d: FifaMatchDetailResponse) =>
        d.HomeTeam && (d.HomeTeam.IdTeam === teamRef || d.HomeTeam.Abbreviation === teamRef)
          ? d.HomeTeam
          : d.AwayTeam && (d.AwayTeam.IdTeam === teamRef || d.AwayTeam.Abbreviation === teamRef)
            ? d.AwayTeam
            : null
      const perMatch: TeamMatchStats[] = []
      const cards: { yellow: number; red: number }[] = []
      for (const d of details) {
        const team = sideOf(d)
        if (!team) continue
        cards.push(countCards(team.Bookings))
        const ifes = d.Properties?.IdIFES
        if (!ifes || !team.IdTeam) continue
        await limiter.acquire()
        const r = await doFetch(`${fdhBaseUrl}/v1/stats/match/${ifes}/teams.json`)
        if (!r.ok) continue
        const norm = normalizeFdhMatchStats((await r.json()) as FdhMatchStatsResponse)
        if (norm[team.IdTeam]) perMatch.push(norm[team.IdTeam])
      }
      // Prefer the official seasonal squad doc (real positions for bench players);
      // match-day union is the fallback, and supplies captaincy either way.
      const unionSquad = normalizeFifaSquad(details, teamRef)
      const captains = new Set(unionSquad.filter((p) => p.captain).map((p) => p.playerId))
      let squad = unionSquad
      let coach = normalizeFifaCoach(details, teamRef)
      const teamId = details.map(sideOf).find((t) => t?.IdTeam)?.IdTeam
      if (teamId) {
        try {
          await limiter.acquire()
          const r = await doFetch(
            `${baseUrl}/teams/${teamId}/squad?idCompetition=${options.competitionId}&idSeason=${options.seasonId}&language=en`,
          )
          if (r.ok) {
            const fromDoc = normalizeFifaSquadDoc((await r.json()) as FifaSquadDoc, captains)
            if (fromDoc.squad.length) squad = fromDoc.squad
            if (fromDoc.coach) coach = fromDoc.coach
          }
        } catch {
          // union fallback already in place
        }
      }
      return {
        squad,
        coach,
        stats: aggregateTeamMatchStats(perMatch, cards),
      }
    },
    async getMatchStats({ ifesId }: { ifesId: string }) {
      await limiter.acquire()
      const response = await doFetch(`${fdhBaseUrl}/v1/stats/match/${ifesId}/teams.json`)
      if (response.status === 429) throw new ProviderRateLimitError()
      if (!response.ok) return null
      return normalizeFdhMatchStats((await response.json()) as FdhMatchStatsResponse)
    },
  }
}
