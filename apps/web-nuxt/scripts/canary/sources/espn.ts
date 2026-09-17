import {
  ESPN_SITE_BASE_URL,
  ESPN_STANDINGS_BASE_URL,
  espnMinute,
  mapEspnStage,
  normalizeEspnEvent,
  USER_AGENT,
  type EspnEvent,
} from '../../../server/utils/providers/espn'
import {
  espnEventKind,
  espnSummaryTeams,
  parseEspnGoals,
  parseEspnLineups,
  parseEspnMatchDetail,
  parseEspnMatchStats,
  parseEspnTimeline,
  type EspnKeyEvent,
  type EspnSummary,
} from '../../../server/utils/providers/espn-summary'
import { parseGroupNameStrict } from '../../../server/utils/providers/stage'
import { CHECKS, dig, isObject, oneOf, RARE, REQUIRED, SAMPLED, type Plan, type Table } from '../ledger'
import { describeError, europeanSeasonYear, walkBackSeasons, type CanaryContext, type CanarySource } from '../source'

// Imported, never re-typed: a canary polling a host the app has stopped reading
// is worse than no canary, because it reports green about a feed nobody uses.
const SITE_BASE = ESPN_SITE_BASE_URL
const STANDINGS_BASE = ESPN_STANDINGS_BASE_URL

// Asked exactly as the provider asks: `limit=500&dates=<season year>`. The
// soccer scoreboard answers 400 to a date RANGE and serves only the current day
// without `dates` at all, so a whole season is both what the app reads and the
// only window that still carries played matches in July.
const PAGE = '500'
const SEASONS_BACK = 3

const LEAGUES = ['eng.1', 'esp.1']

// A finished World Cup, for the two shapes a domestic league cannot show: the
// standings tree only nests `children` for a competition with groups, and a
// single table never produces a knockout season slug. Frozen on purpose - it
// answers those questions deterministically, in July as well as in March. What
// it cannot see is ESPN changing the shape it serves for a LIVE group stage
// while leaving the archive alone; see TODO.md.
const GROUPED = { league: 'fifa.world', season: '2022' }

const STATE = oneOf('pre/in/post', ['pre', 'in', 'post'])
const SIDE = oneOf('home/away', ['home', 'away'])

const PAYLOAD: Table = [['events', REQUIRED, CHECKS.list]]

const EVENT: Table = [
  ['id', REQUIRED, CHECKS.identifier],
  ['competitions', REQUIRED, CHECKS.filledList],
  ['date', SAMPLED, CHECKS.date],
  ['season.slug', SAMPLED, CHECKS.filledText],
]

const COMPETITION: Table = [
  ['date', REQUIRED, CHECKS.date],
  ['competitors', REQUIRED, CHECKS.filledList],
  ['status', REQUIRED, CHECKS.object],
  ['status.type', REQUIRED, CHECKS.object],
  ['status.type.name', REQUIRED, CHECKS.filledText],
  ['status.type.state', REQUIRED, STATE],
  ['status.type.completed', SAMPLED, CHECKS.boolean],
]

// Asked only of a match that has kicked off. A board of fixtures legitimately
// carries neither, and demanding them of one reds every pre-season morning.
const COMPETITION_STARTED: Table = [
  ['status.period', SAMPLED, CHECKS.integer],
  ['details', SAMPLED, CHECKS.list],
]

// `homeAway` is SAMPLED, not REQUIRED: normalizeEspnEvent has a written fallback
// for a payload where NEITHER side is labelled, so a half-labelled board is
// something the adapter survives. That the sides still resolve is asserted in
// crossCheck(), which is the invariant that actually matters.
const COMPETITOR: Table = [
  ['homeAway', SAMPLED, SIDE],
  ['score', REQUIRED, CHECKS.integer],
  ['team', REQUIRED, CHECKS.object],
]

// Only on a decided match, so RARE rather than SAMPLED - but watched, because
// normalizeEspnEvent reads both and nothing else would notice them going.
// crossCheck() asserts they still resolve a winner.
const COMPETITOR_OUTCOME: Table = [
  ['winner', RARE, CHECKS.boolean],
  ['shootoutScore', RARE, CHECKS.integer],
]

const TEAM: Table = [
  ['id', REQUIRED, CHECKS.identifier],
  ['displayName', REQUIRED, CHECKS.filledText],
  ['shortDisplayName', REQUIRED, CHECKS.filledText],
  ['abbreviation', SAMPLED, CHECKS.filledText],
  ['logo', SAMPLED, CHECKS.url],
]

// Checked on EVERY detail, before anything is filtered. Gating these behind
// `scoringPlay` made the whole scope unfalsifiable: if ESPN renamed that key,
// every detail was skipped, all five keys ended `unchecked`, and the canary went
// green on the one drift its own header names as the motivating example.
const DETAIL_FLAGS: Table = [
  ['scoringPlay', REQUIRED, CHECKS.boolean],
  ['shootout', SAMPLED, CHECKS.boolean],
]

// On the goals only, which is all the provider reads them from.
const DETAIL_GOAL: Table = [
  ['clock.displayValue', REQUIRED, CHECKS.filledText],
  ['team.id', REQUIRED, CHECKS.identifier],
  ['scoreValue', SAMPLED, CHECKS.integer],
]

const SUMMARY: Table = [
  ['keyEvents', REQUIRED, CHECKS.filledList],
  ['rosters', SAMPLED, CHECKS.filledList],
  ['boxscore.teams', SAMPLED, CHECKS.filledList],
  ['header.competitions', REQUIRED, CHECKS.filledList],
  // ESPN thins gameInfo on older and lower-profile documents, and the sample is
  // two matches - not enough to tell "gone" from "not this one".
  ['gameInfo.venue.fullName', RARE, CHECKS.filledText],
  ['gameInfo.attendance', RARE, CHECKS.integer],
]

// The fallback that identifies both sides before line-ups are published; every
// goal is dropped on the floor when it stops resolving (see sideOf in
// espn-summary.ts), so it is watched rather than assumed.
const SUMMARY_HEADER: Table = [
  ['competitors', REQUIRED, CHECKS.filledList],
  ['status.type.name', SAMPLED, CHECKS.filledText],
  // Only while a match is running: verified live that ESPN drops the key
  // entirely once the state is 'post', and the canary always samples a match
  // that has already scored.
  ['status.displayClock', RARE, CHECKS.filledText],
]

const SUMMARY_HEADER_SIDE: Table = [
  ['homeAway', REQUIRED, SIDE],
  ['team.id', REQUIRED, CHECKS.identifier],
  ['team.displayName', SAMPLED, CHECKS.filledText],
  ['team.abbreviation', SAMPLED, CHECKS.filledText],
]

const KEY_EVENT: Table = [
  // Read as `?? ''` by espnEventTypeId, so an unlabelled event is survivable -
  // but the VOCABULARY is asserted in summaryCrossCheck().
  ['type.id', SAMPLED, CHECKS.identifier],
  ['type.text', SAMPLED, CHECKS.filledText],
  // `text` and not `filledText`: a period marker legitimately carries an empty
  // clock. That the clock can still be READ is asserted in summaryCrossCheck().
  ['clock.displayValue', REQUIRED, CHECKS.text],
  ['period.number', SAMPLED, CHECKS.integer],
  ['team.id', SAMPLED, CHECKS.identifier],
  ['participants', SAMPLED, CHECKS.filledList],
  ['scoringPlay', SAMPLED, CHECKS.boolean],
]

const PARTICIPANT: Table = [
  // `athlete?: ... | null` upstream, read as `p.athlete?.id` - one participant
  // without an athlete must not red the source.
  ['athlete', SAMPLED, CHECKS.object],
  ['athlete.id', SAMPLED, CHECKS.identifier],
  ['athlete.displayName', SAMPLED, CHECKS.filledText],
]

const ROSTER: Table = [
  ['homeAway', SAMPLED, SIDE],
  ['team.id', REQUIRED, CHECKS.identifier],
  ['roster', SAMPLED, CHECKS.filledList],
  ['formation', SAMPLED, CHECKS.filledText],
]

const ROSTER_ENTRY: Table = [
  ['athlete', SAMPLED, CHECKS.object],
  ['athlete.displayName', SAMPLED, CHECKS.filledText],
  // Read only behind displayName, so its absence costs nothing while that holds.
  ['athlete.shortName', RARE, CHECKS.filledText],
  ['starter', SAMPLED, CHECKS.boolean],
  ['jersey', SAMPLED, CHECKS.filledText],
  ['position.abbreviation', SAMPLED, CHECKS.filledText],
]

const BOXSCORE_TEAM: Table = [
  ['team.id', REQUIRED, CHECKS.identifier],
  ['statistics', SAMPLED, CHECKS.filledList],
]

const BOXSCORE_STAT: Table = [
  ['name', REQUIRED, CHECKS.filledText],
  // ESPN ships no `value` key at all on these (verified live: 28/28 undefined),
  // so parseEspnMatchStats depends entirely on displayValue parsing as a bare
  // number. The day it becomes "40%" every stat silently goes null.
  ['displayValue', REQUIRED, CHECKS.number],
]

const TEAM_LIST: Table = [
  ['sports', REQUIRED, CHECKS.filledList],
  ['sports.0.leagues', REQUIRED, CHECKS.filledList],
  ['sports.0.leagues.0.teams', REQUIRED, CHECKS.filledList],
]

const TEAM_LIST_ENTRY: Table = [
  ['team.id', REQUIRED, CHECKS.identifier],
  ['team.abbreviation', REQUIRED, CHECKS.filledText],
]

const STANDINGS: Table = [['children', REQUIRED, CHECKS.filledList]]

const STANDINGS_GROUP: Table = [
  ['name', SAMPLED, CHECKS.filledText],
  ['abbreviation', SAMPLED, CHECKS.filledText],
  ['standings.entries', REQUIRED, CHECKS.filledList],
]

const STANDINGS_ENTRY: Table = [['team.id', REQUIRED, CHECKS.identifier]]

export const ESPN_PLAN: Plan = [
  ['payload', PAYLOAD],
  ['event', EVENT],
  ['competition', COMPETITION],
  ['competition.started', COMPETITION_STARTED],
  ['competitor', COMPETITOR],
  ['competitor', COMPETITOR_OUTCOME],
  ['competitor.team', TEAM],
  ['detail', DETAIL_FLAGS],
  ['detail.goal', DETAIL_GOAL],
  ['summary', SUMMARY],
  ['summary.header.competitions[]', SUMMARY_HEADER],
  ['summary.header.competitors[]', SUMMARY_HEADER_SIDE],
  ['summary.keyEvents[]', KEY_EVENT],
  ['summary.keyEvents[].participants[]', PARTICIPANT],
  ['summary.rosters[]', ROSTER],
  ['summary.rosters[].roster[]', ROSTER_ENTRY],
  ['summary.boxscore.teams[]', BOXSCORE_TEAM],
  ['summary.boxscore.teams[].statistics[]', BOXSCORE_STAT],
  ['teams', TEAM_LIST],
  ['teams.teams[]', TEAM_LIST_ENTRY],
  ['standings', STANDINGS],
  ['standings.children[]', STANDINGS_GROUP],
  ['standings.children[].entries[]', STANDINGS_ENTRY],
]

interface Tally {
  events: number
  usable: number
  finished: number
  decided: number
  goals: number
}

interface Scoreboard {
  events?: EspnEvent[] | null
}

type Ledger = CanaryContext['ledger']

function inspectScoreboard(payload: Scoreboard, ledger: Ledger): Tally {
  const tally: Tally = { events: 0, usable: 0, finished: 0, decided: 0, goals: 0 }
  ledger.check('payload', payload, PAYLOAD)

  for (const event of payload.events ?? []) {
    if (!event || typeof event !== 'object') {
      ledger.anomaly('an entry of events is not an object')
      continue
    }
    tally.events += 1
    ledger.check('event', event, EVENT)

    const competition = event.competitions?.[0]
    if (!competition || typeof competition !== 'object') {
      ledger.anomaly('a match with no usable competitions[0]')
      continue
    }
    ledger.check('competition', competition, COMPETITION)
    const state = competition.status?.type?.state
    const finished = state === 'post'
    if (state && state !== 'pre') ledger.check('competition.started', competition, COMPETITION_STARTED)
    if (finished) tally.finished += 1

    const sides = new Set<string>()
    const scores: number[] = []
    for (const competitor of competition.competitors ?? []) {
      if (!competitor || typeof competitor !== 'object') {
        ledger.anomaly('an entry of competitors is not an object')
        continue
      }
      ledger.check('competitor', competitor, COMPETITOR)
      // Only asked of a decided match: a fixture legitimately carries neither.
      if (finished) ledger.check('competitor', competitor, COMPETITOR_OUTCOME)
      if (competitor.team && typeof competitor.team === 'object') {
        ledger.check('competitor.team', competitor.team, TEAM)
      }
      if (competitor.homeAway) sides.add(String(competitor.homeAway))
      scores.push(Number(competitor.score) || 0)
    }
    if (sides.has('home') && sides.has('away')) tally.usable += 1
    else ledger.anomaly('a match with no home side and away side')
    if (finished && scores.length === 2 && scores[0] !== scores[1]) tally.decided += 1

    for (const detail of competition.details ?? []) {
      if (!detail || typeof detail !== 'object') {
        ledger.anomaly('an entry of details is not an object')
        continue
      }
      // Every detail, unconditionally - see DETAIL_FLAGS.
      ledger.check('detail', detail, DETAIL_FLAGS)
      if (!detail.scoringPlay || detail.shootout) continue
      tally.goals += 1
      ledger.check('detail.goal', detail, DETAIL_GOAL)
    }
  }
  return tally
}

/**
 * The keys can all be in place and produce nothing. Hand the same payload to the
 * code the app actually runs and compare with what was counted by hand.
 */
function crossCheck(payload: Scoreboard, tally: Tally): string[] {
  const problems: string[] = []
  let matches
  try {
    matches = (payload.events ?? []).map((event) => normalizeEspnEvent(event)).filter((m) => m !== null)
  } catch (error) {
    return [`normalizeEspnEvent() threw ${describeError(error)}`]
  }

  if (matches.length !== tally.usable) {
    problems.push(`normalizeEspnEvent() yields ${matches.length} match(es) for ${tally.usable} usable in the response`)
  }
  // Not `some(m => m.homeTeam.name)`: toTeam falls back to 'TBD', which is
  // truthy, so the obvious form of this check can never fire. What matters is
  // that the names are not ALL the placeholder.
  if (matches.length && !matches.some((m) => m.homeTeam.name !== 'TBD' && m.awayTeam.name !== 'TBD')) {
    problems.push(`all ${matches.length} matches resolved both sides to the TBD placeholder`)
  }
  if (tally.finished && !matches.some((m) => m.status === 'FINISHED')) {
    problems.push(`${tally.finished} match(es) in state 'post' and not one maps to FINISHED`)
  }
  // `winner` is what carries knockout progression and the derived bracket. A
  // decided match that resolves no winner is the silent half of that failure.
  if (tally.decided && !matches.some((m) => m.winner === 'HOME' || m.winner === 'AWAY')) {
    problems.push(`${tally.decided} finished match(es) were not a draw and not one resolved a winner`)
  }
  return problems
}

function inspectSummary(payload: EspnSummary, ledger: Ledger) {
  const found = { events: 0, goals: 0, named: 0, kinds: new Set<string>() }
  ledger.check('summary', payload, SUMMARY)

  for (const competition of payload.header?.competitions ?? []) {
    if (!isObject(competition)) continue
    ledger.check('summary.header.competitions[]', competition, SUMMARY_HEADER)
    ledger.checkEach('summary.header.competitors[]', competition.competitors, SUMMARY_HEADER_SIDE, 'header competitors')
  }

  for (const event of payload.keyEvents ?? []) {
    if (!isObject(event)) {
      ledger.anomaly('an entry of keyEvents is not an object')
      continue
    }
    found.events += 1
    ledger.check('summary.keyEvents[]', event, KEY_EVENT)
    const kind = espnEventKind(event as EspnKeyEvent)
    if (kind) found.kinds.add(kind)
    if (kind === 'goal' || kind === 'own-goal' || kind === 'penalty-goal') found.goals += 1
    const participants = (event as EspnKeyEvent).participants
    ledger.checkEach('summary.keyEvents[].participants[]', participants, PARTICIPANT, 'keyEvent participants')
    found.named += (participants ?? []).filter((p) => p?.athlete?.displayName).length
  }

  for (const roster of payload.rosters ?? []) {
    if (!isObject(roster)) continue
    ledger.check('summary.rosters[]', roster, ROSTER)
    ledger.checkEach('summary.rosters[].roster[]', roster.roster, ROSTER_ENTRY, 'roster entries')
  }

  for (const team of payload.boxscore?.teams ?? []) {
    if (!isObject(team)) continue
    ledger.check('summary.boxscore.teams[]', team, BOXSCORE_TEAM)
    ledger.checkEach('summary.boxscore.teams[].statistics[]', team.statistics, BOXSCORE_STAT, 'boxscore statistics')
  }

  return found
}

function summaryCrossCheck(
  payload: EspnSummary,
  eventId: string,
  found: { events: number; goals: number; kinds: Set<string> },
): string[] {
  const problems: string[] = []
  if (found.events && !found.goals) {
    problems.push(`${found.events} key event(s) in a match that scored, and not one recognised as a goal`)
  }

  // espnEventKind falls back to `scoringPlay` for a goal, so a goal alone proves
  // nothing about the type-id vocabulary. Cards, substitutions and the period
  // markers are matched by literal id and nothing else would notice them going.
  const ids = new Set((payload.keyEvents ?? []).map((e) => String(e.type?.id ?? '')))
  const structural = ['yellow', 'red', 'second-yellow', 'sub', 'period']
  if (ids.size > 3 && !structural.some((kind) => found.kinds.has(kind))) {
    problems.push(`${ids.size} distinct event type ids and not one maps to a card, a substitution or a period marker`)
  }

  // A clock the reader cannot parse is the drift that hides best: the key stays,
  // the value changes shape, and stoppage-time goals silently stop counting.
  const clocks = (payload.keyEvents ?? []).map((e) => e.clock?.displayValue).filter((c): c is string => !!c)
  if (clocks.length && !clocks.some((c) => espnMinute(c) !== null)) {
    problems.push(`none of the ${clocks.length} event clock(s) is readable (e.g. ${clocks.slice(0, 3).join(', ')})`)
  }

  // ESPN was the only source never re-feeding its detail document to the real
  // parsers, so its stat, line-up and side-resolution paths were watched as
  // shapes and never as behaviour.
  try {
    const teams = espnSummaryTeams(payload)
    if (!teams.homeId || !teams.awayId) {
      problems.push('espnSummaryTeams() could not resolve both sides, so every goal would be dropped')
    }
    const goals = parseEspnGoals(payload, teams)
    if (found.goals && goals.length === 0) {
      problems.push(`${found.goals} goal(s) recognised and parseEspnGoals() returned none`)
    }
    const rows = parseEspnTimeline(payload, { homeTeamId: teams.homeId, awayTeamId: teams.awayId })
    if (found.events && rows.length === 0) {
      problems.push(`${found.events} key event(s) and parseEspnTimeline() rendered no row`)
    }
    parseEspnMatchDetail(payload, eventId, teams)

    const stats = Object.values(parseEspnMatchStats(payload))
    if ((payload.boxscore?.teams ?? []).length && !stats.some((s) => s.possession != null || s.attempts != null)) {
      problems.push('the boxscore carries teams and parseEspnMatchStats() read no possession or shots from any of them')
    }

    if ((payload.rosters ?? []).length && !parseEspnLineups(payload)?.available) {
      problems.push('the summary carries rosters and parseEspnLineups() reports none available')
    }
  } catch (error) {
    problems.push(`the ESPN summary parsers threw ${describeError(error)}`)
  }
  return problems
}

/** The id of a board match that scored, so the summary probe has goals to read. */
function scoredEvent(payload: Scoreboard): string {
  for (const event of payload.events ?? []) {
    const competitors = event.competitions?.[0]?.competitors ?? []
    const total = competitors.reduce((sum, c) => sum + (Number(c.score) || 0), 0)
    if (total > 0 && event.id) return String(event.id)
  }
  return ''
}

function playedBoard(board: Scoreboard): boolean {
  return (board.events ?? []).some((event) => event.competitions?.[0]?.status?.type?.state === 'post')
}

export function espnSource(leagues: string[] = LEAGUES): CanarySource {
  return {
    name: 'espn',
    plan: ESPN_PLAN,
    headers: { 'user-agent': USER_AGENT },
    async visit(ctx: CanaryContext) {
      const { ledger } = ctx
      const problems: string[] = []
      const newest = europeanSeasonYear(ctx.now)

      for (const league of leagues) {
        // `usable` is "has a played match", not "has anything": a season whose
        // fixtures are published but none played verifies none of the
        // interesting keys, and accepting it is how an August morning reds on
        // SAMPLED keys that simply had nothing to describe yet.
        const walk = await walkBackSeasons<Scoreboard>({
          from: newest,
          back: SEASONS_BACK,
          fetch: (year) => ctx.getJson<Scoreboard>(`${SITE_BASE}/${league}/scoreboard?limit=${PAGE}&dates=${year}`),
          usable: playedBoard,
        })
        const board: Scoreboard = walk.value ?? {}

        const tally = inspectScoreboard(board, ledger)
        problems.push(...crossCheck(board, tally))
        if (!tally.events) {
          problems.push(`${league} returned no match for any of the seasons ${walk.probed.join(', ')}`)
        }
        ctx.note(
          `board ${league.padEnd(10)} season ${walk.year}: ${tally.events} match(es), ${tally.finished} finished, ${tally.goals} goal(s)`,
        )
        if (walk.skipped.length) ctx.note(`      ${league.padEnd(10)} nothing played in ${walk.skipped.join(', ')}`)

        const eventId = scoredEvent(board)
        if (!eventId) {
          ctx.note(`summary ${league.padEnd(8)} no match with a goal: nothing to inspect`)
        } else {
          const summary = await ctx.getJson<EspnSummary>(
            `${SITE_BASE}/${league}/summary?event=${encodeURIComponent(eventId)}`,
          )
          const found = inspectSummary(summary, ledger)
          problems.push(...summaryCrossCheck(summary, eventId, found))
          ctx.note(
            `summary ${league.padEnd(8)} match ${eventId}, ${found.events} event(s), ${found.goals} goal(s), ${found.kinds.size} kind(s)`,
          )
        }

        const teams = await ctx.getJson<Record<string, unknown>>(`${SITE_BASE}/${league}/teams`)
        ledger.check('teams', teams, TEAM_LIST)
        const count = ledger.checkEach(
          'teams.teams[]',
          dig(teams, 'sports.0.leagues.0.teams').value,
          TEAM_LIST_ENTRY,
          'the team list',
        )
        ctx.note(`teams ${league.padEnd(10)} ${count} team(s)`)
      }

      problems.push(...(await inspectGrouped(ctx)))
      return problems
    },
  }
}

/**
 * The two questions a single-table league cannot answer: does the standings tree
 * still nest groups, and does a knockout season slug still map past GROUP.
 */
async function inspectGrouped(ctx: CanaryContext): Promise<string[]> {
  const { ledger } = ctx
  const problems: string[] = []

  const standings = await ctx.getJson<Record<string, unknown>>(
    `${STANDINGS_BASE}/${GROUPED.league}/standings?season=${GROUPED.season}`,
  )
  ledger.check('standings', standings, STANDINGS)
  const children = Array.isArray(standings.children) ? standings.children : []
  let letters = 0
  for (const child of children) {
    if (!isObject(child)) {
      ledger.anomaly('an entry of standings.children is not an object')
      continue
    }
    ledger.check('standings.children[]', child, STANDINGS_GROUP)
    ledger.checkEach(
      'standings.children[].entries[]',
      (child.standings as { entries?: unknown } | null)?.entries,
      STANDINGS_ENTRY,
      'standings entries',
    )
    // The letter is what fetchGroups resolves, with a strictly anchored parser.
    // 'Group A - Final Standings' keeps every key intact and empties the whole
    // team-to-letter map, which blanks stored letters on the next upsert.
    const abbreviation = typeof child.abbreviation === 'string' ? child.abbreviation : null
    const name = typeof child.name === 'string' ? child.name : null
    if (parseGroupNameStrict(abbreviation) ?? parseGroupNameStrict(name)) letters += 1
  }
  if (children.length && !letters) {
    problems.push(`${children.length} standings group(s) and parseGroupNameStrict() read a letter from none of them`)
  }
  ctx.note(`standings ${GROUPED.league} ${GROUPED.season}  ${children.length} group(s), ${letters} letter(s)`)

  const board = await ctx.getJson<Scoreboard>(
    `${SITE_BASE}/${GROUPED.league}/scoreboard?limit=${PAGE}&dates=${GROUPED.season}`,
  )
  const slugs = (board.events ?? []).map((e) => e.season?.slug).filter((s): s is string => !!s)
  const knockout = slugs.filter((slug) => mapEspnStage(slug) !== 'GROUP')
  if (slugs.length && !knockout.length) {
    // eng.1 and esp.1 are single tables, so their slugs never leave GROUP and
    // the ladder that decides FINAL and double points was covered by nothing.
    problems.push(`${slugs.length} season slug(s) on a knockout tournament and not one maps past GROUP`)
  }
  ctx.note(`ladder ${GROUPED.league} ${GROUPED.season}  ${knockout.length}/${slugs.length} slug(s) past GROUP`)
  return problems
}

export const espnInternals = {
  inspectScoreboard,
  crossCheck,
  inspectSummary,
  summaryCrossCheck,
  scoredEvent,
  playedBoard,
}
