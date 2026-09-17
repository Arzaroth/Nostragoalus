import {
  normalizeFifaBracket,
  normalizeFifaMatch,
  normalizeFifaMatchDetail,
  normalizeFifaMatchLineups,
  normalizeFifaTimeline,
  pickFifaSeason,
  type FifaBracketResponse,
  type FifaMatch,
  type FifaMatchDetailResponse,
  type FifaTimelineResponse,
} from '../../../server/utils/providers/fifa'
import { CHECKS, Ledger, nullable, RARE, REQUIRED, SAMPLED, type Plan, type Table } from '../ledger'
import type { CanaryContext, CanarySource } from '../source'

const BASE = 'https://api.fifa.com/api/v3'

// 17 is the men's World Cup. Off-cycle its current season carries no played
// match, which the SAMPLED keys report as `unchecked` rather than as a failure -
// that is the honest answer, and it still proves the season and calendar
// documents kept their shape.
const COMPETITION_ID = '17'

const SEASONS: Table = [['Results', REQUIRED, CHECKS.filledList]]

const SEASON: Table = [
  ['IdSeason', REQUIRED, CHECKS.identifier],
  ['Name', SAMPLED, CHECKS.filledList],
  ['Name.0.Description', SAMPLED, CHECKS.filledText],
  ['StartDate', SAMPLED, CHECKS.date],
  ['EndDate', SAMPLED, CHECKS.date],
]

const CALENDAR: Table = [['Results', REQUIRED, CHECKS.filledList]]

// Every `| null` below is nullable by contract, not by accident: IdGroup is null
// on each knockout tie, the scores are null until kickoff, Home/Away are null
// until the draw. Keeping them REQUIRED-but-nullable catches the key vanishing
// without calling a designed null a type change.
const MATCH: Table = [
  ['IdMatch', REQUIRED, CHECKS.identifier],
  ['IdStage', REQUIRED, CHECKS.identifier],
  ['IdGroup', REQUIRED, nullable(CHECKS.identifier)],
  ['Date', REQUIRED, CHECKS.date],
  ['MatchStatus', REQUIRED, CHECKS.integer],
  ['Home', REQUIRED, nullable(CHECKS.object)],
  ['Away', REQUIRED, nullable(CHECKS.object)],
  ['HomeTeamScore', REQUIRED, nullable(CHECKS.integer)],
  ['AwayTeamScore', REQUIRED, nullable(CHECKS.integer)],
  ['HomeTeamPenaltyScore', REQUIRED, nullable(CHECKS.integer)],
  ['AwayTeamPenaltyScore', REQUIRED, nullable(CHECKS.integer)],
  ['Winner', REQUIRED, nullable(CHECKS.identifier)],
  ['StageName', SAMPLED, CHECKS.filledList],
  ['StageName.0.Description', SAMPLED, CHECKS.filledText],
  // `list` and not `filledList`: empty on every knockout tie, by design. That
  // the content is still there on a group match is what the next line proves.
  ['GroupName', REQUIRED, CHECKS.list],
  ['GroupName.0.Description', SAMPLED, CHECKS.filledText],
  ['PlaceHolderA', SAMPLED, CHECKS.filledText],
  ['PlaceHolderB', SAMPLED, CHECKS.filledText],
]

const MATCH_TEAM: Table = [
  ['IdTeam', REQUIRED, nullable(CHECKS.identifier)],
  ['Score', REQUIRED, nullable(CHECKS.integer)],
  ['TeamName', SAMPLED, CHECKS.filledList],
  ['TeamName.0.Description', SAMPLED, CHECKS.filledText],
  ['Abbreviation', SAMPLED, CHECKS.filledText],
  ['IdCountry', SAMPLED, CHECKS.filledText],
  ['PictureUrl', SAMPLED, CHECKS.filledText],
]

// Only fetched for a match that was played, so an empty Event list here is the
// timeline going dark rather than a quiet day.
const TIMELINE: Table = [['Event', REQUIRED, CHECKS.filledList]]

const TIMELINE_EVENT: Table = [
  ['Type', REQUIRED, CHECKS.integer],
  ['MatchMinute', SAMPLED, CHECKS.filledText],
  ['Period', SAMPLED, CHECKS.integer],
  ['IdTeam', SAMPLED, CHECKS.identifier],
  ['IdPlayer', SAMPLED, CHECKS.identifier],
  ['IdSubPlayer', SAMPLED, CHECKS.identifier],
  ['HomeGoals', SAMPLED, CHECKS.integer],
  ['AwayGoals', SAMPLED, CHECKS.integer],
  ['EventDescription', SAMPLED, CHECKS.filledList],
]

const DETAIL: Table = [
  ['HomeTeam', REQUIRED, CHECKS.object],
  ['AwayTeam', REQUIRED, CHECKS.object],
  ['MatchTime', SAMPLED, CHECKS.filledText],
  ['Period', SAMPLED, CHECKS.integer],
  // FIFA stops publishing possession once an edition is archived: the key stays
  // and the block goes null. So the block itself is REQUIRED (its disappearance
  // is real drift) and the numbers inside it are RARE.
  ['BallPossession', REQUIRED, nullable(CHECKS.object)],
  ['BallPossession.OverallHome', RARE, CHECKS.number],
  ['BallPossession.OverallAway', RARE, CHECKS.number],
  ['Attendance', SAMPLED, CHECKS.integer],
  ['Stadium.Name', SAMPLED, CHECKS.filledList],
  ['Properties.IdIFES', SAMPLED, CHECKS.identifier],
]

const DETAIL_TEAM: Table = [
  ['IdTeam', REQUIRED, CHECKS.identifier],
  ['TeamName', SAMPLED, CHECKS.filledList],
  ['Abbreviation', SAMPLED, CHECKS.filledText],
  ['Players', SAMPLED, CHECKS.filledList],
  ['Goals', SAMPLED, CHECKS.list],
  ['Bookings', SAMPLED, CHECKS.list],
  ['Substitutions', SAMPLED, CHECKS.list],
  ['Coaches', SAMPLED, CHECKS.filledList],
  ['Tactics', SAMPLED, CHECKS.filledText],
]

const DETAIL_PLAYER: Table = [
  ['IdPlayer', REQUIRED, CHECKS.identifier],
  ['PlayerName', SAMPLED, CHECKS.filledList],
  ['ShortName', SAMPLED, CHECKS.filledList],
  ['ShirtNumber', SAMPLED, CHECKS.identifier],
  ['Position', SAMPLED, CHECKS.identifier],
  ['Status', SAMPLED, CHECKS.identifier],
  ['PlayerPicture.PictureUrl', SAMPLED, CHECKS.filledText],
]

const DETAIL_GOAL: Table = [
  ['Type', SAMPLED, CHECKS.integer],
  ['IdPlayer', SAMPLED, CHECKS.identifier],
  ['IdTeam', SAMPLED, CHECKS.identifier],
  ['Minute', SAMPLED, CHECKS.filledText],
  ['Period', SAMPLED, CHECKS.integer],
]

const BRACKET: Table = [['KnockoutStages', REQUIRED, CHECKS.filledList]]

const BRACKET_STAGE: Table = [
  ['SequenceOrder', REQUIRED, CHECKS.integer],
  ['Name', SAMPLED, CHECKS.filledList],
  ['Matches', REQUIRED, CHECKS.filledList],
]

const BRACKET_MATCH: Table = [
  ['IdMatch', REQUIRED, CHECKS.identifier],
  ['MatchStatus', REQUIRED, CHECKS.integer],
  ['Date', REQUIRED, CHECKS.date],
  ['MatchNumber', SAMPLED, CHECKS.integer],
  ['HomeTeam', REQUIRED, nullable(CHECKS.object)],
  ['AwayTeam', REQUIRED, nullable(CHECKS.object)],
  ['Winner', SAMPLED, CHECKS.identifier],
  ['PlaceHolderA', SAMPLED, CHECKS.filledText],
  ['PlaceHolderB', SAMPLED, CHECKS.filledText],
]

const PLAN: Plan = [
  ['seasons', SEASONS],
  ['seasons.Results[]', SEASON],
  ['calendar', CALENDAR],
  ['match', MATCH],
  ['match.Home', MATCH_TEAM],
  ['timeline', TIMELINE],
  ['timeline.Event[]', TIMELINE_EVENT],
  ['detail', DETAIL],
  ['detail.HomeTeam', DETAIL_TEAM],
  ['detail.HomeTeam.Players[]', DETAIL_PLAYER],
  ['detail.HomeTeam.Goals[]', DETAIL_GOAL],
  ['bracket', BRACKET],
  ['bracket.KnockoutStages[]', BRACKET_STAGE],
  ['bracket.KnockoutStages[].Matches[]', BRACKET_MATCH],
]

interface Tally {
  matches: number
  played: number
  withGroup: number
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function inspectCalendar(payload: { Results?: FifaMatch[] | null }, ledger: Ledger): Tally {
  const tally: Tally = { matches: 0, played: 0, withGroup: 0 }
  ledger.check('calendar', payload, CALENDAR)

  for (const match of payload.Results ?? []) {
    if (!isObject(match)) {
      ledger.anomaly('an entry of calendar Results is not an object')
      continue
    }
    tally.matches += 1
    ledger.check('match', match, MATCH)
    if (match.IdGroup) tally.withGroup += 1
    if (played(match)) tally.played += 1
    for (const side of [match.Home, match.Away]) {
      if (isObject(side)) ledger.check('match.Home', side, MATCH_TEAM)
    }
  }
  return tally
}

function played(match: FifaMatch): boolean {
  return match.HomeTeamScore !== null && match.AwayTeamScore !== null && match.MatchStatus === 0
}

/**
 * The keys can survive and stop producing anything. Re-run the real normalizer
 * over the same payload and compare with what was counted by hand.
 */
function crossCheck(payload: { Results?: FifaMatch[] | null }, tally: Tally): string[] {
  const problems: string[] = []
  let matches
  try {
    matches = (payload.Results ?? []).map(normalizeFifaMatch)
  } catch (error) {
    return [`normalizeFifaMatch() threw ${error instanceof Error ? error.message : String(error)}`]
  }

  if (matches.length !== tally.matches) {
    problems.push(`normalizeFifaMatch() yields ${matches.length} match(es) for ${tally.matches} in the response`)
  }
  if (tally.played && !matches.some((m) => m.status === 'FINISHED')) {
    problems.push(`${tally.played} played match(es) and not one maps to FINISHED`)
  }
  // The group letter is parsed out of a localized label; a renamed label leaves
  // every key in place and files the whole group stage under no group at all,
  // which is how a season lands with matches nothing can score.
  if (tally.withGroup && !matches.some((m) => m.group !== null)) {
    problems.push(`${tally.withGroup} match(es) carry an IdGroup and not one yields a group letter`)
  }
  if (matches.length && !matches.some((m) => m.stage !== 'GROUP')) {
    const named = (payload.Results ?? []).some((m) => (m.StageName?.[0]?.Description ?? '') !== '')
    if (named && tally.matches > 30) problems.push(`all ${matches.length} matches collapsed onto stage GROUP`)
  }
  return problems
}

export function fifaSource(competitionId: string = COMPETITION_ID): CanarySource {
  return {
    name: 'fifa',
    async visit(ctx: CanaryContext) {
      const ledger = new Ledger(PLAN)
      const problems: string[] = []

      const seasons = await ctx.getJson<{ Results?: unknown[] | null }>(
        `${BASE}/seasons?idCompetition=${competitionId}&count=100&language=en`,
      )
      ledger.check('seasons', seasons, SEASONS)
      for (const season of seasons.Results ?? []) {
        if (!isObject(season)) {
          ledger.anomaly('an entry of seasons Results is not an object')
          continue
        }
        ledger.check('seasons.Results[]', season, SEASON)
      }

      const seasonId = pickFifaSeason(
        (seasons.Results ?? []) as Parameters<typeof pickFifaSeason>[0],
        null,
        ctx.now,
      )
      if (!seasonId) {
        problems.push('pickFifaSeason() chose nothing from the seasons document')
        return { ledger, problems }
      }
      ctx.note(`seasons     competition ${competitionId}, ${(seasons.Results ?? []).length} season(s), picked ${seasonId}`)

      const calendar = await ctx.getJson<{ Results?: FifaMatch[] | null }>(
        `${BASE}/calendar/matches?language=en&count=500&idSeason=${seasonId}`,
      )
      const tally = inspectCalendar(calendar, ledger)
      problems.push(...crossCheck(calendar, tally))
      ctx.note(`calendar    season ${seasonId}, ${tally.matches} match(es), ${tally.played} played, ${tally.withGroup} in a group`)

      const sample = (calendar.Results ?? []).find(played)
      if (!sample) {
        ctx.note('timeline    no played match in this season: nothing to inspect')
      } else {
        const timeline = await ctx.getJson<FifaTimelineResponse>(
          `${BASE}/timelines/${encodeURIComponent(sample.IdMatch)}?language=en`,
        )
        ledger.check('timeline', timeline, TIMELINE)
        for (const event of timeline.Event ?? []) {
          if (!isObject(event)) {
            ledger.anomaly('an entry of timeline Event is not an object')
            continue
          }
          ledger.check('timeline.Event[]', event, TIMELINE_EVENT)
        }
        const rows = normalizeFifaTimeline(timeline, sample.Home?.IdTeam, sample.Away?.IdTeam)
        if ((timeline.Event ?? []).length && rows.length === 0) {
          problems.push(
            `${(timeline.Event ?? []).length} timeline event(s) on a played match and normalizeFifaTimeline() recognised none`,
          )
        }
        ctx.note(`timeline    match ${sample.IdMatch}, ${(timeline.Event ?? []).length} event(s), ${rows.length} rendered`)

        const detail = await ctx.getJson<FifaMatchDetailResponse>(
          `${BASE}/live/football/${competitionId}/${seasonId}/${encodeURIComponent(sample.IdStage)}/${encodeURIComponent(sample.IdMatch)}?language=en`,
        )
        problems.push(...inspectDetail(detail, ledger))
        ctx.note(`detail      match ${sample.IdMatch}, ${(detail.HomeTeam?.Players ?? []).length} home player(s)`)
      }

      const bracket = await ctx.getJson<FifaBracketResponse>(
        `${BASE}/seasonbracket/season/${seasonId}?language=en`,
      )
      problems.push(...inspectBracket(bracket, ledger, ctx))

      return { ledger, problems }
    },
  }
}

function inspectDetail(detail: FifaMatchDetailResponse, ledger: Ledger): string[] {
  ledger.check('detail', detail, DETAIL)
  for (const team of [detail.HomeTeam, detail.AwayTeam]) {
    if (!isObject(team)) continue
    ledger.check('detail.HomeTeam', team, DETAIL_TEAM)
    for (const player of (team.Players as unknown[]) ?? []) {
      if (!isObject(player)) continue
      ledger.check('detail.HomeTeam.Players[]', player, DETAIL_PLAYER)
    }
    for (const goal of (team.Goals as unknown[]) ?? []) {
      if (!isObject(goal)) continue
      ledger.check('detail.HomeTeam.Goals[]', goal, DETAIL_GOAL)
    }
  }

  const problems: string[] = []
  const players = (detail.HomeTeam?.Players ?? []).length
  try {
    const summary = normalizeFifaMatchDetail(detail)
    const goals = (detail.HomeTeam?.Goals ?? []).length + (detail.AwayTeam?.Goals ?? []).length
    if (goals && summary.goals.length === 0) {
      problems.push(`${goals} goal(s) on the detail document and normalizeFifaMatchDetail() read none`)
    }
  } catch (error) {
    problems.push(`normalizeFifaMatchDetail() threw ${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    const lineups = normalizeFifaMatchLineups(detail)
    if (players && lineups.home.startingXI.length === 0 && lineups.home.bench.length === 0) {
      problems.push(`${players} player(s) on the home roster and normalizeFifaMatchLineups() placed none`)
    }
  } catch (error) {
    problems.push(`normalizeFifaMatchLineups() threw ${error instanceof Error ? error.message : String(error)}`)
  }
  return problems
}

function inspectBracket(bracket: FifaBracketResponse, ledger: Ledger, ctx: CanaryContext): string[] {
  ledger.check('bracket', bracket, BRACKET)
  let ties = 0
  for (const stage of bracket.KnockoutStages ?? []) {
    if (!isObject(stage)) {
      ledger.anomaly('an entry of KnockoutStages is not an object')
      continue
    }
    ledger.check('bracket.KnockoutStages[]', stage, BRACKET_STAGE)
    for (const match of (stage.Matches as unknown[]) ?? []) {
      if (!isObject(match)) continue
      ties += 1
      ledger.check('bracket.KnockoutStages[].Matches[]', match, BRACKET_MATCH)
    }
  }
  ctx.note(`bracket     ${(bracket.KnockoutStages ?? []).length} stage(s), ${ties} tie(s)`)

  const problems: string[] = []
  try {
    const normalized = normalizeFifaBracket(bracket)
    const rendered = normalized.rounds.reduce((sum, round) => sum + round.matches.length, 0)
    if (ties && rendered === 0) {
      problems.push(`${ties} bracket tie(s) in the response and normalizeFifaBracket() rendered none`)
    }
  } catch (error) {
    problems.push(`normalizeFifaBracket() threw ${error instanceof Error ? error.message : String(error)}`)
  }
  return problems
}

export const fifaInternals = { inspectCalendar, crossCheck, inspectDetail, inspectBracket, played, PLAN }
