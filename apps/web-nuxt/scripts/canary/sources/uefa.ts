import {
  UEFA_BASE_URL,
  eventMinute,
  normalizeUefaLineups,
  normalizeUefaMatch,
  normalizeUefaTimeline,
  type UefaEvent,
  type UefaLineupsResponse,
  type UefaMatch,
} from '../../../server/utils/providers/uefa'
import { CHECKS, nullable, RARE, REQUIRED, SAMPLED, type Plan, type Table } from '../ledger'
import { describeError, europeanSeasonYear, walkBackSeasons, type CanaryContext, type CanarySource } from '../source'

const BASE = UEFA_BASE_URL

// 3 is the Champions League: the one UEFA competition in play from September to
// May, so the window in which nothing can be verified is short.
const COMPETITION_ID = '3'
const PAGE = 200
const SEASONS_BACK = 4

// Two consecutive empty season years on a competition that runs every year is
// not a quiet August, it is the live season having moved somewhere the app is
// not looking - which is exactly what `listFixtures` would return nothing for.
const STALE_SEASONS = 2

// Events are read from more than one match on purpose: an own goal or a VAR
// decision does not happen every night, and a population of one match would
// report half the vocabulary absent on most days.
const EVENT_SAMPLE = 3

const MATCH: Table = [
  ['id', REQUIRED, CHECKS.identifier],
  ['status', REQUIRED, CHECKS.filledText],
  ['kickOffTime.dateTime', REQUIRED, CHECKS.date],
  ['homeTeam', REQUIRED, nullable(CHECKS.object)],
  ['awayTeam', REQUIRED, nullable(CHECKS.object)],
  ['round.id', SAMPLED, CHECKS.identifier],
  ['round.metaData.name', SAMPLED, CHECKS.filledText],
  ['group.metaData.groupName', SAMPLED, CHECKS.filledText],
  // Parsed by /^MD(\d+)$/ - a rename leaves the key filled and silently blanks
  // every matchday number, so the VALUE is asserted in crossCheck().
  ['matchday.name', SAMPLED, CHECKS.filledText],
  ['matchday.phase', SAMPLED, CHECKS.filledText],
  ['score.total.home', SAMPLED, CHECKS.integer],
  ['score.total.away', SAMPLED, CHECKS.integer],
  ['score.penalty.home', RARE, CHECKS.integer],
  ['winner.match.team.id', SAMPLED, CHECKS.identifier],
  ['matchAttendance', SAMPLED, CHECKS.integer],
  ['stadium.translations.name', SAMPLED, CHECKS.object],
]

const TEAM: Table = [
  ['id', REQUIRED, CHECKS.identifier],
  ['internationalName', REQUIRED, CHECKS.filledText],
  ['countryCode', SAMPLED, CHECKS.filledText],
  ['bigLogoUrl', SAMPLED, CHECKS.filledText],
]

const EVENT: Table = [
  ['type', REQUIRED, CHECKS.filledText],
  ['phase', SAMPLED, CHECKS.filledText],
  // normalizeUefaTimeline calls this "the only reliable chronological order",
  // and nothing was watching it.
  ['timestamp', REQUIRED, CHECKS.date],
  ['time.minute', SAMPLED, CHECKS.integer],
  // Added time, an own goal or a penalty, and a VAR decision's wording: real
  // keys whose context may simply not occur in the matches sampled today.
  ['time.injuryMinute', RARE, CHECKS.integer],
  ['subType', RARE, CHECKS.filledText],
  ['primaryActor', SAMPLED, CHECKS.object],
  ['primaryActor.type', SAMPLED, CHECKS.filledText],
  ['primaryActor.team.id', SAMPLED, CHECKS.identifier],
  ['primaryActor.person.id', SAMPLED, CHECKS.identifier],
  ['primaryActor.person.internationalName', SAMPLED, CHECKS.filledText],
  ['secondaryActor.person.internationalName', RARE, CHECKS.filledText],
  ['freeText', RARE, CHECKS.filledText],
]

const LINEUPS: Table = [
  ['homeTeam', REQUIRED, nullable(CHECKS.object)],
  ['awayTeam', REQUIRED, nullable(CHECKS.object)],
  ['lineupStatus', SAMPLED, CHECKS.filledText],
]

const LINEUP_TEAM: Table = [
  ['field', SAMPLED, CHECKS.filledList],
  ['bench', SAMPLED, CHECKS.filledList],
]

const LINEUP_FIELD: Table = [
  ['player', REQUIRED, CHECKS.object],
  ['player.id', SAMPLED, CHECKS.identifier],
  ['player.internationalName', SAMPLED, CHECKS.filledText],
  ['player.fieldPosition', SAMPLED, CHECKS.filledText],
  ['jerseyNumber', SAMPLED, CHECKS.identifier],
  // Only the XI carries the pitch grid; a bench entry never does, which is why
  // this has its own scope rather than sharing the bench's.
  ['fieldCoordinate.x', SAMPLED, CHECKS.integer],
  ['fieldCoordinate.y', SAMPLED, CHECKS.integer],
]

const LINEUP_BENCH: Table = [
  ['player', REQUIRED, CHECKS.object],
  ['player.id', SAMPLED, CHECKS.identifier],
  ['player.internationalName', SAMPLED, CHECKS.filledText],
  ['jerseyNumber', SAMPLED, CHECKS.identifier],
]

export const UEFA_PLAN: Plan = [
  ['payload', [['matches', REQUIRED, CHECKS.list]]],
  ['match', MATCH],
  // Separate scopes: reporting an away-side break under `match.homeTeam` sends
  // whoever chases the alarm to the wrong half of the document.
  ['match.homeTeam', TEAM],
  ['match.awayTeam', TEAM],
  ['events', [['payload', REQUIRED, CHECKS.list]]],
  ['events[]', EVENT],
  ['lineups', LINEUPS],
  ['lineups.homeTeam', LINEUP_TEAM],
  ['lineups.awayTeam', LINEUP_TEAM],
  ['lineups.field[]', LINEUP_FIELD],
  ['lineups.bench[]', LINEUP_BENCH],
]

interface Tally {
  matches: number
  played: number
  withGroup: number
  withMatchday: number
}

type Ledger = CanaryContext['ledger']

function inspectMatches(matches: UefaMatch[], ledger: Ledger): Tally {
  const tally: Tally = { matches: 0, played: 0, withGroup: 0, withMatchday: 0 }
  // The feed answers with a bare array, so the payload itself is the observation
  // rather than a key on it. `list` and not `filledList`: an empty season is a
  // quiet season, and the staleness question is asked by visit().
  ledger.observe('payload.matches', REQUIRED, CHECKS.list, true, matches)

  for (const match of matches) {
    if (!match || typeof match !== 'object') {
      ledger.anomaly('an entry of the matches array is not an object')
      continue
    }
    tally.matches += 1
    ledger.check('match', match, MATCH)
    if (match.group?.metaData?.groupName) tally.withGroup += 1
    if (match.matchday?.name) tally.withMatchday += 1
    if (match.score?.total?.home != null) tally.played += 1
    if (match.homeTeam && typeof match.homeTeam === 'object') ledger.check('match.homeTeam', match.homeTeam, TEAM)
    if (match.awayTeam && typeof match.awayTeam === 'object') ledger.check('match.awayTeam', match.awayTeam, TEAM)
  }
  return tally
}

function crossCheck(matches: UefaMatch[], tally: Tally): string[] {
  const problems: string[] = []
  let normalized
  try {
    normalized = matches.map(normalizeUefaMatch)
  } catch (error) {
    return [`normalizeUefaMatch() threw ${describeError(error)}`]
  }

  // Not a count comparison: normalizeUefaMatch never returns null, so that would
  // compare a number with itself. The kickoff is NOT NULL downstream.
  const undated = normalized.filter((m) => !m.kickoffTime).length
  if (undated) problems.push(`${undated} of ${normalized.length} match(es) normalized without a kickoff time`)

  if (tally.played && !normalized.some((m) => m.status === 'FINISHED')) {
    problems.push(`${tally.played} match(es) carry a total score and not one maps to FINISHED`)
  }
  if (tally.withGroup && !normalized.some((m) => m.group !== null)) {
    problems.push(`${tally.withGroup} match(es) carry a groupName and not one yields a group letter`)
  }
  // `MD7` -> 7. A rename to "Matchday 7" keeps the key filled and silently
  // blanks every matchday number, which is what group ordering is built on.
  if (tally.withMatchday && !normalized.some((m) => m.matchday !== null)) {
    problems.push(`${tally.withMatchday} match(es) carry a matchday name and not one yields a number`)
  }
  if (normalized.length && !normalized.some((m) => m.homeTeam.name !== 'TBD' && m.awayTeam.name !== 'TBD')) {
    problems.push(`all ${normalized.length} matches resolved both sides to the TBD placeholder`)
  }
  return problems
}

function inspectEvents(events: unknown, ledger: Ledger): number {
  return ledger.checkEach('events[]', events, EVENT, 'the events array')
}

function eventsCrossCheck(events: UefaEvent[], home: string | null, away: string | null): string[] {
  const problems: string[] = []
  let rows
  try {
    rows = normalizeUefaTimeline(events, home, away)
  } catch (error) {
    return [`normalizeUefaTimeline() threw ${describeError(error)}`]
  }
  if (events.length && rows.length === 0) {
    problems.push(`${events.length} event(s) on a played match and normalizeUefaTimeline() recognised none`)
  }
  // The minute is not decoration: it orders the play-by-play and feeds the
  // added-time analytics. A key that stays put while its shape changes is the
  // drift that hides best.
  const timed = events.filter((e) => e.time?.minute != null)
  if (timed.length && !timed.some((e) => eventMinute(e) !== null)) {
    problems.push(`none of the ${timed.length} timed event(s) yields a readable minute`)
  }
  // A shootout kick must NOT reach the running score; the exclusion is a literal
  // phase string, so a rename shows a 7-6 in the 90th minute and nothing else
  // would notice.
  const phases = new Set(events.map((e) => e.phase).filter((p): p is string => !!p))
  if (phases.size && !phases.has('REGULAR_NORMAL') && !phases.has('FIRST_HALF')) {
    problems.push(`the phase vocabulary is unrecognised (${[...phases].slice(0, 4).join(', ')})`)
  }
  return problems
}

function inspectLineups(resp: UefaLineupsResponse, ledger: Ledger, ctx: CanaryContext): string[] {
  ledger.check('lineups', resp, LINEUPS)
  let entries = 0
  for (const [side, team] of [
    ['homeTeam', resp.homeTeam],
    ['awayTeam', resp.awayTeam],
  ] as const) {
    if (!team || typeof team !== 'object') continue
    ledger.check(`lineups.${side}`, team, LINEUP_TEAM)
    entries += ledger.checkEach('lineups.field[]', team.field, LINEUP_FIELD, `${side} field`)
    entries += ledger.checkEach('lineups.bench[]', team.bench, LINEUP_BENCH, `${side} bench`)
  }
  ctx.note(`lineups     ${entries} entr(ies)`)

  const problems: string[] = []
  try {
    if (entries && !normalizeUefaLineups(resp).available) {
      problems.push(`${entries} lineup entr(ies) in the response and normalizeUefaLineups() reports none available`)
    }
  } catch (error) {
    problems.push(`normalizeUefaLineups() threw ${describeError(error)}`)
  }
  return problems
}

export function uefaSource(competitionId: string = COMPETITION_ID): CanarySource {
  return {
    name: 'uefa',
    plan: UEFA_PLAN,
    async visit(ctx: CanaryContext) {
      const { ledger } = ctx
      const problems: string[] = []

      // `usable` is "has a played match", not "has anything". Breaking on the
      // first non-empty season is how this greened on a two-year-old archive
      // while the current season's endpoint answered with nothing at all.
      const walk = await walkBackSeasons<UefaMatch[]>({
        from: europeanSeasonYear(ctx.now),
        back: SEASONS_BACK,
        fetch: async (year) => {
          const answer = await ctx.getJson<UefaMatch[]>(
            `${BASE}/v5/matches?competitionId=${competitionId}&seasonYear=${year}&limit=${PAGE}&offset=0`,
          )
          return Array.isArray(answer) ? answer : []
        },
        usable: (matches) => matches.some((m) => m?.score?.total?.home != null),
      })
      const list = walk.value ?? []

      const tally = inspectMatches(list, ledger)
      problems.push(...crossCheck(list, tally))
      if (!list.length) {
        problems.push(`competition ${competitionId} returned no fixture for any of the seasons ${walk.probed.join(', ')}`)
      } else if (walk.skipped.length >= STALE_SEASONS) {
        problems.push(
          `the ${walk.skipped.length} newest season years (${walk.skipped.join(', ')}) carry no played match; the shape was verified against ${walk.year} instead, so this competition's live season is not where the app looks for it`,
        )
      }
      ctx.note(
        `matches     competition ${competitionId}, season ${walk.year}: ${tally.matches} match(es), ${tally.played} played, ${tally.withGroup} in a group`,
      )

      // FINISHED, not merely scored: an abandoned or awarded tie carries a total
      // score and can legitimately publish no events at all.
      const played = list.filter((m) => normalizeUefaMatch(m).status === 'FINISHED')
      // Spread across the season rather than three in a row: a single matchday
      // can be atypical, and consecutive fixtures share its weather.
      const step = Math.max(1, Math.floor(played.length / EVENT_SAMPLE))
      const sampled = Array.from({ length: Math.min(EVENT_SAMPLE, played.length) }, (_, i) => played[i * step]).filter(
        (m): m is UefaMatch => !!m,
      )

      if (!sampled.length) {
        ctx.note('events      no finished match this season: nothing to inspect')
        return problems
      }

      let seen = 0
      let withEvents = 0
      for (const match of sampled) {
        const events = await ctx.getJson<UefaEvent[]>(
          `${BASE}/v5/matches/${encodeURIComponent(match.id)}/events?filter=ALL&limit=500&offset=0`,
        )
        const rows = Array.isArray(events) ? events : []
        if (rows.length) withEvents += 1
        seen += inspectEvents(rows, ledger)
        problems.push(...eventsCrossCheck(rows, match.homeTeam?.id ?? null, match.awayTeam?.id ?? null))
      }
      // Aggregated, not per match: observing `filledList` once per sampled match
      // let ONE eventless tie record a TYPE failure and red the whole source.
      ledger.observe('events.payload', REQUIRED, CHECKS.filledList, true, withEvents ? [withEvents] : [])
      ctx.note(`events      ${sampled.length} match(es) sampled, ${seen} event(s)`)

      const first = sampled[0]
      if (first) {
        const lineups = await ctx.getJson<UefaLineupsResponse>(
          `${BASE}/v5/matches/${encodeURIComponent(first.id)}/lineups`,
        )
        problems.push(...inspectLineups(lineups, ledger, ctx))
      }

      return problems
    },
  }
}

export const uefaInternals = { inspectMatches, crossCheck, inspectEvents, eventsCrossCheck, inspectLineups }
