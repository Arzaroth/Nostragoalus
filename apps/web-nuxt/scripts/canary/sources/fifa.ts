import {
  FIFA_BASE_URL,
  mapFifaStage,
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
import { mapStageFromName } from '../../../server/utils/providers/stage'
import { CHECKS, nullable, RARE, REQUIRED, SAMPLED, type Plan, type Table } from '../ledger'
import { describeError, UpstreamRejected, type CanaryContext, type CanarySource } from '../source'

const BASE = FIFA_BASE_URL

// 17 is the men's World Cup. Off-cycle pickFifaSeason deliberately returns the
// NEXT edition, which has no played match and no draw - so every key that only
// exists once a tournament is under way is RARE here, not SAMPLED. Levelling
// them SAMPLED meant the canary would red every morning for years between
// editions, on precisely the state this source is documented as handling.
const COMPETITION_ID = '17'

const SEASONS: Table = [['Results', REQUIRED, CHECKS.filledList]]

const SEASON: Table = [
  ['IdSeason', REQUIRED, CHECKS.identifier],
  ['Name', SAMPLED, CHECKS.filledList],
  ['Name.0.Description', SAMPLED, CHECKS.filledText],
  // pickFifaSeason sorts on these and throws when not one season carries a
  // StartDate, so their loss is a hard failure of the season resolver.
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
  // `list` and not `filledList`: empty on every knockout tie, by design.
  ['GroupName', REQUIRED, CHECKS.list],
  // Only once a draw has happened, which an upcoming edition has not had.
  ['GroupName.0.Description', RARE, CHECKS.filledText],
  ['PlaceHolderA', RARE, CHECKS.filledText],
  ['PlaceHolderB', RARE, CHECKS.filledText],
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
  ['IdSubPlayer', RARE, CHECKS.identifier],
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
  ['Attendance', RARE, CHECKS.integer],
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
  ['Tactics', RARE, CHECKS.filledText],
]

const DETAIL_PLAYER: Table = [
  ['IdPlayer', REQUIRED, CHECKS.identifier],
  ['PlayerName', SAMPLED, CHECKS.filledList],
  ['ShortName', SAMPLED, CHECKS.filledList],
  ['ShirtNumber', SAMPLED, CHECKS.identifier],
  ['Position', SAMPLED, CHECKS.identifier],
  ['Status', SAMPLED, CHECKS.identifier],
  ['PlayerPicture.PictureUrl', RARE, CHECKS.filledText],
]

const DETAIL_GOAL: Table = [
  ['Type', SAMPLED, CHECKS.integer],
  ['IdPlayer', SAMPLED, CHECKS.identifier],
  ['IdTeam', SAMPLED, CHECKS.identifier],
  ['Minute', SAMPLED, CHECKS.filledText],
  ['Period', SAMPLED, CHECKS.integer],
]

// Watched rather than assumed: a rename inside a booking leaves `Bookings` a
// list, keeps every goal count intact, and cards quietly stop reaching the
// match detail.
const DETAIL_BOOKING: Table = [
  ['Card', SAMPLED, CHECKS.integer],
  ['Minute', SAMPLED, CHECKS.filledText],
  ['IdPlayer', SAMPLED, CHECKS.identifier],
  ['IdCoach', RARE, CHECKS.identifier],
]

const DETAIL_SUB: Table = [
  ['Minute', SAMPLED, CHECKS.filledText],
  ['IdPlayerOff', SAMPLED, CHECKS.identifier],
  ['IdPlayerOn', SAMPLED, CHECKS.identifier],
  ['PlayerOffName', SAMPLED, CHECKS.filledList],
  ['PlayerOnName', SAMPLED, CHECKS.filledList],
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
  // Null on every tie of an undrawn edition, which is what an off-cycle run
  // reads. RARE, or the canary reds every morning between World Cups.
  ['Winner', RARE, CHECKS.identifier],
  ['PlaceHolderA', RARE, CHECKS.filledText],
  ['PlaceHolderB', RARE, CHECKS.filledText],
]

export const FIFA_PLAN: Plan = [
  ['seasons', SEASONS],
  ['seasons.Results[]', SEASON],
  ['calendar', CALENDAR],
  ['match', MATCH],
  ['match.side', MATCH_TEAM],
  ['timeline', TIMELINE],
  ['timeline.Event[]', TIMELINE_EVENT],
  ['detail', DETAIL],
  ['detail.team', DETAIL_TEAM],
  ['detail.team.Players[]', DETAIL_PLAYER],
  ['detail.team.Goals[]', DETAIL_GOAL],
  ['detail.team.Bookings[]', DETAIL_BOOKING],
  ['detail.team.Substitutions[]', DETAIL_SUB],
  ['bracket', BRACKET],
  ['bracket.KnockoutStages[]', BRACKET_STAGE],
  ['bracket.KnockoutStages[].Matches[]', BRACKET_MATCH],
]

interface Tally {
  matches: number
  played: number
  withGroup: number
  knockoutNamed: number
}

type Ledger = CanaryContext['ledger']

/** Played as the FEED says, not as our own status mapper says - see crossCheck. */
function played(match: FifaMatch): boolean {
  return match.HomeTeamScore !== null && match.AwayTeamScore !== null
}

function inspectCalendar(payload: { Results?: FifaMatch[] | null }, ledger: Ledger): Tally {
  const tally: Tally = { matches: 0, played: 0, withGroup: 0, knockoutNamed: 0 }
  ledger.check('calendar', payload, CALENDAR)

  for (const match of payload.Results ?? []) {
    if (!match || typeof match !== 'object') {
      ledger.anomaly('an entry of calendar Results is not an object')
      continue
    }
    tally.matches += 1
    ledger.check('match', match, MATCH)
    if (match.IdGroup) tally.withGroup += 1
    if (played(match)) tally.played += 1
    if (mapFifaStage(match.StageName?.[0]?.Description ?? '') !== 'GROUP') tally.knockoutNamed += 1
    for (const side of [match.Home, match.Away]) {
      if (side && typeof side === 'object') ledger.check('match.side', side, MATCH_TEAM)
    }
  }
  return tally
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
    return [`normalizeFifaMatch() threw ${describeError(error)}`]
  }

  // Not a count comparison: normalizeFifaMatch never returns null, so counting
  // its output against the tally compares a number with itself. What can
  // actually break is the kickoff, which is NOT NULL downstream.
  const undated = matches.filter((m) => !m.kickoffTime).length
  if (undated) problems.push(`${undated} of ${matches.length} match(es) normalized without a kickoff time`)

  // `played` is read off the SCORES while the status comes from MatchStatus, so
  // the two are independent and this can genuinely fire if FIFA renumbers.
  if (tally.played && !matches.some((m) => m.status === 'FINISHED')) {
    problems.push(`${tally.played} match(es) carry both scores and not one maps to FINISHED`)
  }
  // The group letter is parsed out of a localized label; a renamed label leaves
  // every key in place and files the whole group stage under no group at all,
  // which is how a season lands with matches nothing can score.
  if (tally.withGroup && !matches.some((m) => m.group !== null)) {
    problems.push(`${tally.withGroup} match(es) carry an IdGroup and not one yields a group letter`)
  }
  // Asked only when the feed's own stage names say there IS a knockout, so it
  // is a real question on a partial calendar rather than a silent no-op.
  if (tally.knockoutNamed && !matches.some((m) => m.stage !== 'GROUP')) {
    problems.push(`${tally.knockoutNamed} match(es) are named for a knockout stage and not one maps past GROUP`)
  }
  return problems
}

function inspectDetail(detail: FifaMatchDetailResponse, ledger: Ledger): string[] {
  ledger.check('detail', detail, DETAIL)
  let players = 0
  let goals = 0
  for (const team of [detail.HomeTeam, detail.AwayTeam]) {
    if (!team || typeof team !== 'object') continue
    ledger.check('detail.team', team, DETAIL_TEAM)
    players += ledger.checkEach('detail.team.Players[]', team.Players, DETAIL_PLAYER, 'detail players')
    goals += ledger.checkEach('detail.team.Goals[]', team.Goals, DETAIL_GOAL, 'detail goals')
    ledger.checkEach('detail.team.Bookings[]', team.Bookings, DETAIL_BOOKING, 'detail bookings')
    ledger.checkEach('detail.team.Substitutions[]', team.Substitutions, DETAIL_SUB, 'detail substitutions')
  }

  const problems: string[] = []
  try {
    const summary = normalizeFifaMatchDetail(detail)
    if (goals && summary.goals.length === 0) {
      problems.push(`${goals} goal(s) on the detail document and normalizeFifaMatchDetail() read none`)
    }
  } catch (error) {
    problems.push(`normalizeFifaMatchDetail() threw ${describeError(error)}`)
  }
  try {
    const lineups = normalizeFifaMatchLineups(detail)
    if (players && lineups.home.startingXI.length === 0 && lineups.home.bench.length === 0) {
      problems.push(`${players} player(s) on the rosters and normalizeFifaMatchLineups() placed none`)
    }
  } catch (error) {
    problems.push(`normalizeFifaMatchLineups() threw ${describeError(error)}`)
  }
  return problems
}

function inspectBracket(bracket: FifaBracketResponse, ledger: Ledger, ctx: CanaryContext): string[] {
  ledger.check('bracket', bracket, BRACKET)
  let ties = 0
  for (const stage of bracket.KnockoutStages ?? []) {
    if (!stage || typeof stage !== 'object') {
      ledger.anomaly('an entry of KnockoutStages is not an object')
      continue
    }
    ledger.check('bracket.KnockoutStages[]', stage, BRACKET_STAGE)
    ties += ledger.checkEach('bracket.KnockoutStages[].Matches[]', stage.Matches, BRACKET_MATCH, 'bracket ties')
  }
  ctx.note(`bracket     ${(bracket.KnockoutStages ?? []).length} stage(s), ${ties} tie(s)`)

  const problems: string[] = []
  try {
    const normalized = normalizeFifaBracket(bracket)
    const rendered = normalized.rounds.reduce((sum, round) => sum + round.matches.length, 0)
    if (ties && rendered === 0) {
      problems.push(`${ties} bracket tie(s) in the response and normalizeFifaBracket() rendered none`)
    }
    // The champion is resolved by finding the round whose NAME maps to FINAL and
    // reading its winner. A renamed or emptied stage label leaves every tie
    // rendering perfectly and simply never crowns anybody - and the count check
    // above cannot see it, because the matches are all still there.
    if (ties && !normalized.rounds.some((round) => mapStageFromName(round.name) === 'FINAL')) {
      problems.push(`${normalized.rounds.length} bracket round(s) and not one is named for the final, so no champion can be resolved`)
    }
  } catch (error) {
    problems.push(`normalizeFifaBracket() threw ${describeError(error)}`)
  }
  return problems
}

export function fifaSource(competitionId: string = COMPETITION_ID): CanarySource {
  return {
    name: 'fifa',
    plan: FIFA_PLAN,
    async visit(ctx: CanaryContext) {
      const { ledger } = ctx
      const problems: string[] = []

      const seasons = await ctx.getJson<{ Results?: unknown[] | null }>(
        `${BASE}/seasons?idCompetition=${competitionId}&count=100&language=en`,
      )
      ledger.check('seasons', seasons, SEASONS)
      ledger.checkEach('seasons.Results[]', seasons.Results, SEASON, 'the seasons list')

      // pickFifaSeason THROWS when no season carries a StartDate rather than
      // returning empty, so the old `if (!seasonId)` guard was unreachable and
      // the throw escaped the whole run, killing the report.
      let seasonId: string
      try {
        seasonId = pickFifaSeason((seasons.Results ?? []) as Parameters<typeof pickFifaSeason>[0], null, ctx.now)
      } catch (error) {
        problems.push(`pickFifaSeason() could not choose a season: ${describeError(error)}`)
        return problems
      }
      ctx.note(
        `seasons     competition ${competitionId}, ${(seasons.Results ?? []).length} season(s), picked ${seasonId}`,
      )

      const calendar = await ctx.getJson<{ Results?: FifaMatch[] | null }>(
        `${BASE}/calendar/matches?language=en&count=500&idSeason=${seasonId}`,
      )
      const tally = inspectCalendar(calendar, ledger)
      problems.push(...crossCheck(calendar, tally))
      ctx.note(
        `calendar    season ${seasonId}, ${tally.matches} match(es), ${tally.played} played, ${tally.withGroup} in a group`,
      )

      const sample = (calendar.Results ?? []).find((match) => match && typeof match === 'object' && played(match))
      if (!sample) {
        ctx.note('timeline    no played match in this season: nothing to inspect')
      } else {
        const timeline = await ctx.getJson<FifaTimelineResponse>(
          `${BASE}/timelines/${encodeURIComponent(sample.IdMatch)}?language=en`,
        )
        ledger.check('timeline', timeline, TIMELINE)
        const events = ledger.checkEach('timeline.Event[]', timeline.Event, TIMELINE_EVENT, 'the timeline')
        const rows = normalizeFifaTimeline(timeline, sample.Home?.IdTeam, sample.Away?.IdTeam)
        if (events && rows.length === 0) {
          problems.push(`${events} timeline event(s) on a played match and normalizeFifaTimeline() recognised none`)
        }
        ctx.note(`timeline    match ${sample.IdMatch}, ${events} event(s), ${rows.length} rendered`)

        const detail = await ctx.getJson<FifaMatchDetailResponse>(
          `${BASE}/live/football/${competitionId}/${seasonId}/${encodeURIComponent(sample.IdStage)}/${encodeURIComponent(sample.IdMatch)}?language=en`,
        )
        problems.push(...inspectDetail(detail, ledger))
        ctx.note(`detail      match ${sample.IdMatch}, ${(detail.HomeTeam?.Players ?? []).length} home player(s)`)
      }

      // A season with no knockout published yet answers 404 here, and that is a
      // fact about the calendar rather than a shape change - the bracket keys
      // stay `unchecked`, which is the honest verdict.
      try {
        const bracket = await ctx.getJson<FifaBracketResponse>(`${BASE}/seasonbracket/season/${seasonId}?language=en`)
        problems.push(...inspectBracket(bracket, ledger, ctx))
      } catch (error) {
        if (!(error instanceof UpstreamRejected)) throw error
        ctx.note(`bracket     season ${seasonId} publishes none yet (${error.status}): nothing to inspect`)
      }

      return problems
    },
  }
}

export const fifaInternals = { inspectCalendar, crossCheck, inspectDetail, inspectBracket, played }
