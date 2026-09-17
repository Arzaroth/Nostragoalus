import { espnMinute, mapEspnStage, normalizeEspnEvent, type EspnEvent } from '../../../server/utils/providers/espn'
import { espnEventKind, type EspnKeyEvent, type EspnSummary } from '../../../server/utils/providers/espn-summary'
import { CHECKS, dig, Ledger, oneOf, RARE, REQUIRED, SAMPLED, type Plan, type Table } from '../ledger'
import { europeanSeasonYear, type CanaryContext, type CanarySource } from '../source'

const SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'
const STANDINGS_BASE = 'https://site.api.espn.com/apis/v2/sports/soccer'

// Taken from the provider, not invented: a branded or browser-shaped agent is
// refused by the Akamai in front of this API, in HTML rather than JSON.
const USER_AGENT = 'curl/8.0'

// Asked exactly as the provider asks: `limit=500&dates=<season year>`. The
// soccer scoreboard answers 400 to a date RANGE and serves only the current day
// without `dates` at all, so a whole season is both what the app reads and the
// only window that still carries played matches in July.
const PAGE = '500'

// A season year that has not started yet answers with an empty board, which is
// a quiet August and not drift. Walking back finds the last one that was played.
const SEASONS_BACK = 3

// Two busy domestic leagues. They rarely play on the same days, which is what
// makes it near-certain that some goal, somewhere, was scored in the window.
const LEAGUES = ['eng.1', 'esp.1']

// The group letter comes from the standings tree, and only a competition with
// groups has one. Asked of a single-table league it would report `children`
// MISSING every morning for a fact that is not a defect, so the group shape is
// probed on a finished World Cup instead: a document whose shape answers "does
// the standings tree still nest groups this way" exactly as well as a live one,
// and answers it in July.
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
  ['status.period', SAMPLED, CHECKS.integer],
  // Absent until something happens in the match, so never REQUIRED - but a
  // board where it stopped appearing at all is the timeline going dark.
  ['details', SAMPLED, CHECKS.list],
]

// `winner` and `shootoutScore` are deliberately absent: a third of any board is
// matches not yet played, which legitimately carry neither, and a watched key
// missing on two objects in three would go red every day. The invariant that
// matters for them is asserted in crossCheck().
const COMPETITOR: Table = [
  ['homeAway', REQUIRED, SIDE],
  ['score', REQUIRED, CHECKS.integer],
  ['team', REQUIRED, CHECKS.object],
]

const TEAM: Table = [
  ['id', REQUIRED, CHECKS.identifier],
  ['displayName', REQUIRED, CHECKS.filledText],
  ['shortDisplayName', REQUIRED, CHECKS.filledText],
  ['abbreviation', SAMPLED, CHECKS.filledText],
  ['logo', SAMPLED, CHECKS.url],
]

const DETAIL: Table = [
  ['scoringPlay', REQUIRED, CHECKS.boolean],
  ['clock.displayValue', REQUIRED, CHECKS.filledText],
  ['team.id', REQUIRED, CHECKS.identifier],
  ['shootout', SAMPLED, CHECKS.boolean],
  ['scoreValue', SAMPLED, CHECKS.integer],
]

// Only asked for a match that scored, so an empty keyEvents here is drift, not
// a quiet afternoon.
const SUMMARY: Table = [
  ['keyEvents', REQUIRED, CHECKS.filledList],
  ['rosters', SAMPLED, CHECKS.filledList],
  ['boxscore.teams', SAMPLED, CHECKS.filledList],
  ['header.competitions', SAMPLED, CHECKS.filledList],
  ['gameInfo.venue.fullName', SAMPLED, CHECKS.filledText],
]

const KEY_EVENT: Table = [
  ['type.id', REQUIRED, CHECKS.identifier],
  ['type.text', REQUIRED, CHECKS.filledText],
  // `text` and not `filledText`: a period marker legitimately carries an empty
  // clock. That the clock can still be READ is asserted in summaryCrossCheck(),
  // which is the invariant that actually matters.
  ['clock.displayValue', REQUIRED, CHECKS.text],
  ['period.number', SAMPLED, CHECKS.integer],
  ['team.id', SAMPLED, CHECKS.identifier],
  ['participants', SAMPLED, CHECKS.filledList],
  ['scoringPlay', SAMPLED, CHECKS.boolean],
]

const PARTICIPANT: Table = [
  ['athlete', REQUIRED, CHECKS.object],
  ['athlete.id', SAMPLED, CHECKS.identifier],
  ['athlete.displayName', SAMPLED, CHECKS.filledText],
]

const ROSTER: Table = [
  ['homeAway', REQUIRED, SIDE],
  ['team.id', REQUIRED, CHECKS.identifier],
  ['roster', SAMPLED, CHECKS.filledList],
  ['formation', SAMPLED, CHECKS.filledText],
]

const ROSTER_ENTRY: Table = [
  ['athlete', REQUIRED, CHECKS.object],
  ['athlete.displayName', SAMPLED, CHECKS.filledText],
  // Read only behind displayName (espn-summary.ts), so its absence costs
  // nothing while that one holds - watched for a type change, not for presence.
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
  ['displayValue', SAMPLED, CHECKS.text],
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

const PLAN: Plan = [
  ['payload', PAYLOAD],
  ['event', EVENT],
  ['competition', COMPETITION],
  ['competitor', COMPETITOR],
  ['competitor.team', TEAM],
  ['detail', DETAIL],
  ['summary', SUMMARY],
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
  goals: number
}

interface Scoreboard {
  events?: EspnEvent[] | null
}

function inspectScoreboard(payload: Scoreboard, ledger: Ledger): Tally {
  const tally: Tally = { events: 0, usable: 0, finished: 0, goals: 0 }
  ledger.check('payload', payload, PAYLOAD)

  for (const event of payload.events ?? []) {
    if (typeof event !== 'object' || event === null) {
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
    if (competition.status?.type?.state === 'post') tally.finished += 1

    const sides = new Set<string>()
    for (const competitor of competition.competitors ?? []) {
      if (typeof competitor !== 'object' || competitor === null) {
        ledger.anomaly('an entry of competitors is not an object')
        continue
      }
      ledger.check('competitor', competitor, COMPETITOR)
      if (competitor.team && typeof competitor.team === 'object') {
        ledger.check('competitor.team', competitor.team, TEAM)
      }
      if (competitor.homeAway) sides.add(competitor.homeAway)
    }
    if (sides.has('home') && sides.has('away')) tally.usable += 1
    else ledger.anomaly('a match with no home side and away side')

    for (const detail of competition.details ?? []) {
      if (typeof detail !== 'object' || detail === null) {
        ledger.anomaly('an entry of details is not an object')
        continue
      }
      // A yellow card is in the list and nothing reads it; the shootout kick
      // carries scoringPlay without moving the score, and counting it as a goal
      // would go red on every cup night for behaviour that is intended.
      if (!detail.scoringPlay || detail.shootout) continue
      tally.goals += 1
      ledger.check('detail', detail, DETAIL)
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
    return [`normalizeEspnEvent() threw ${error instanceof Error ? error.message : String(error)}`]
  }

  if (matches.length !== tally.usable) {
    problems.push(`normalizeEspnEvent() yields ${matches.length} match(es) for ${tally.usable} usable in the response`)
  }
  if (matches.length && !matches.some((m) => m.homeTeam.name && m.awayTeam.name)) {
    problems.push('no match carries the name of both its teams')
  }
  // The status vocabulary drifting would leave every key in place and quietly
  // park a finished tournament on SCHEDULED, which is how a board stops scoring.
  if (tally.finished && !matches.some((m) => m.status === 'FINISHED')) {
    problems.push(`${tally.finished} match(es) in state 'post' and not one maps to FINISHED`)
  }
  // Only a board that actually carries knockout ties can be asked to produce
  // one: a domestic league is a single table, so every match of it mapping to
  // GROUP is correct, not a collapse. The slug is what the provider maps from,
  // so this asks the question with the same input the provider uses.
  const knockout = (payload.events ?? []).filter((e) => mapEspnStage(e.season?.slug) !== 'GROUP')
  if (knockout.length && !matches.some((m) => m.stage !== 'GROUP')) {
    problems.push(`${knockout.length} event(s) carry a knockout season slug and not one yields a stage past GROUP`)
  }
  return problems
}

function inspectSummary(payload: EspnSummary, ledger: Ledger): { events: number; goals: number; named: number } {
  const found = { events: 0, goals: 0, named: 0 }
  ledger.check('summary', payload, SUMMARY)

  for (const event of payload.keyEvents ?? []) {
    if (typeof event !== 'object' || event === null) {
      ledger.anomaly('an entry of keyEvents is not an object')
      continue
    }
    found.events += 1
    ledger.check('summary.keyEvents[]', event, KEY_EVENT)
    const kind = espnEventKind(event as EspnKeyEvent)
    if (kind === 'goal' || kind === 'own-goal' || kind === 'penalty-goal') found.goals += 1
    for (const participant of event.participants ?? []) {
      if (typeof participant !== 'object' || participant === null) continue
      ledger.check('summary.keyEvents[].participants[]', participant, PARTICIPANT)
      if (participant.athlete?.displayName) found.named += 1
    }
  }

  for (const roster of payload.rosters ?? []) {
    if (typeof roster !== 'object' || roster === null) continue
    ledger.check('summary.rosters[]', roster, ROSTER)
    for (const entry of roster.roster ?? []) {
      if (typeof entry !== 'object' || entry === null) continue
      ledger.check('summary.rosters[].roster[]', entry, ROSTER_ENTRY)
    }
  }

  for (const team of payload.boxscore?.teams ?? []) {
    if (typeof team !== 'object' || team === null) continue
    ledger.check('summary.boxscore.teams[]', team, BOXSCORE_TEAM)
    for (const stat of team.statistics ?? []) {
      if (typeof stat !== 'object' || stat === null) continue
      ledger.check('summary.boxscore.teams[].statistics[]', stat, BOXSCORE_STAT)
    }
  }

  return found
}

function summaryCrossCheck(payload: EspnSummary, found: { events: number; goals: number }): string[] {
  const problems: string[] = []
  if (found.events && !found.goals) {
    problems.push(`${found.events} key event(s) in a match that scored, and not one recognised as a goal`)
  }
  // A clock the reader cannot parse is the drift that hides best: the key stays,
  // the value changes shape, and stoppage-time goals silently stop counting.
  const clocks = (payload.keyEvents ?? []).map((e) => e.clock?.displayValue).filter((c): c is string => !!c)
  if (clocks.length && !clocks.some((c) => espnMinute(c) !== null)) {
    problems.push(`none of the ${clocks.length} event clock(s) is readable (e.g. ${clocks.slice(0, 3).join(', ')})`)
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

export function espnSource(leagues: string[] = LEAGUES): CanarySource {
  return {
    name: 'espn',
    headers: { 'user-agent': USER_AGENT },
    async visit(ctx: CanaryContext) {
      const ledger = new Ledger(PLAN)
      const problems: string[] = []
      const newest = europeanSeasonYear(ctx.now)

      for (const league of leagues) {
        let board: Scoreboard = {}
        let season = newest
        const probed: number[] = []
        for (let back = 0; back < SEASONS_BACK; back++) {
          season = newest - back
          probed.push(season)
          board = await ctx.getJson<Scoreboard>(`${SITE_BASE}/${league}/scoreboard?limit=${PAGE}&dates=${season}`)
          if ((board.events ?? []).length) break
        }

        const tally = inspectScoreboard(board, ledger)
        problems.push(...crossCheck(board, tally))
        if (!tally.events) {
          problems.push(`${league} returned no match for any of the seasons ${probed.join(', ')}`)
        }
        ctx.note(
          `board ${league.padEnd(10)} season ${season}: ${tally.events} match(es), ${tally.finished} finished, ${tally.goals} goal(s)`,
        )

        const eventId = scoredEvent(board)
        if (!eventId) {
          ctx.note(`summary ${league.padEnd(8)} no match with a goal: nothing to inspect`)
        } else {
          // One summary per league is enough: the question asked here - are the
          // keyEvents keys still there - is answered as well by one match as by
          // thirty, and the document is not small.
          const summary = await ctx.getJson<EspnSummary>(
            `${SITE_BASE}/${league}/summary?event=${encodeURIComponent(eventId)}`,
          )
          const found = inspectSummary(summary, ledger)
          problems.push(...summaryCrossCheck(summary, found))
          ctx.note(
            `summary ${league.padEnd(8)} match ${eventId}, ${found.events} event(s), ${found.goals} goal(s), ${found.named} named`,
          )
        }

        const teams = await ctx.getJson<Record<string, unknown>>(`${SITE_BASE}/${league}/teams`)
        ledger.check('teams', teams, TEAM_LIST)
        const roster = (dig(teams, 'sports.0.leagues.0.teams').value ?? []) as unknown[]
        for (const entry of roster) {
          if (typeof entry !== 'object' || entry === null) {
            ledger.anomaly('an entry of teams is not an object')
            continue
          }
          ledger.check('teams.teams[]', entry, TEAM_LIST_ENTRY)
        }
        ctx.note(`teams ${league.padEnd(10)} ${roster.length} team(s)`)
      }

      const standings = await ctx.getJson<Record<string, unknown>>(
        `${STANDINGS_BASE}/${GROUPED.league}/standings?season=${GROUPED.season}`,
      )
      ledger.check('standings', standings, STANDINGS)
      const children = (standings.children ?? []) as unknown[]
      for (const child of children) {
        if (typeof child !== 'object' || child === null) continue
        ledger.check('standings.children[]', child, STANDINGS_GROUP)
        const entries = ((child as { standings?: { entries?: unknown[] } }).standings?.entries ?? []) as unknown[]
        for (const entry of entries) {
          if (typeof entry !== 'object' || entry === null) continue
          ledger.check('standings.children[].entries[]', entry, STANDINGS_ENTRY)
        }
      }
      ctx.note(`standings ${GROUPED.league} ${GROUPED.season}  ${children.length} group(s)`)

      return { ledger, problems }
    },
  }
}

export const espnInternals = {
  inspectScoreboard,
  crossCheck,
  inspectSummary,
  summaryCrossCheck,
  scoredEvent,
  PLAN,
}
