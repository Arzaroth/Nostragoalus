import type {
  AppStage,
  BracketMatch,
  BracketRound,
  MatchDetail,
  MatchStatus,
  NormalizedBracket,
  NormalizedGoal,
  NormalizedMatch,
  Score,
  Team,
  Winner,
} from '../../../shared/types/match'
import { RateLimiter } from './rate-limiter'
import { ProviderRateLimitError, ProviderUpstreamError, type ListFixturesOptions, type MatchDataProvider } from './types'

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

interface FifaDetailTeam {
  IdTeam?: string | null
  TeamName?: FifaLocalized[]
  Abbreviation?: string | null
  Players?: FifaDetailPlayer[]
  Goals?: FifaDetailGoal[]
}

export interface FifaMatchDetailResponse {
  HomeTeam?: FifaDetailTeam | null
  AwayTeam?: FifaDetailTeam | null
  BallPossession?: { OverallHome?: number | null; OverallAway?: number | null } | null
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

  return {
    possessionHome: detail.BallPossession?.OverallHome ?? null,
    possessionAway: detail.BallPossession?.OverallAway ?? null,
    goals,
  }
}

interface FifaBracketTeam {
  IdTeam?: string | null
  TeamName?: FifaLocalized[]
  Abbreviation?: string | null
}

interface FifaBracketMatch {
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

export interface FifaOptions {
  seasonId: string
  competitionId?: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  rateLimiter?: RateLimiter
}

const DEFAULT_BASE_URL = 'https://api.fifa.com/api/v3'

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
  }
}
